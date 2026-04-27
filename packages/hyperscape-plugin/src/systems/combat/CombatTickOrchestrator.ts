/**
 * CombatTickOrchestrator — per-tick driver for combat state.
 *
 * Wraps the four tick-driver methods extracted from CombatSystem.ts:
 *   - processCombatTick: drains all combat states each tick, sorts
 *     by PID priority (cached/dirty-tracked), runs follow + attack
 *     for each combatant, respects frame budget warnings
 *   - processNPCCombatTick: per-mob entry point used by the NPC
 *     phase of the tick processor
 *   - processPlayerCombatTick: per-player entry point used by the
 *     Player phase of the tick processor
 *   - processAutoAttackOnTick: the shared per-combatant worker that
 *     dispatches melee inline (validateRange + tickAttackWorker steps)
 *     vs delegates ranged/magic into the host's handleAttack
 *
 * Tick-based asymmetry: NPCs process BEFORE players, so NPC→Player
 * damage applies same tick while Player→NPC damage applies next tick
 * (queued by GameTickProcessor).
 *
 * Extracted from CombatSystem.ts as the twelfth slice of the system's
 * decomposition (item #9 in PROGRESS_AUDIT). This is the public API
 * that GameTickProcessor calls into; CombatSystem retains thin proxy
 * methods that forward to the helper.
 *
 * Helper owns its own _pidSortDirty / _lastSortedCombatCount state
 * (previously CombatSystem-private).
 *
 * Coupling shape: 11 dep refs at construction. Most are concrete
 * helpers from earlier slices. Two are closures because the underlying
 * code is still inline on CombatSystem:
 *   - handleAttack — ranged/magic dispatcher (still inline; future
 *     slice will extract the handleAttack family)
 *   - getFrameBudget — world.frameBudget read at call-time
 */

import {
  AttackType,
  type SystemLogger,
  getCombatTimeoutTicks,
} from "@hyperforge/shared";

import type { CombatAnimationManager } from "./CombatAnimationManager";
import type { CombatAttackValidator } from "./CombatAttackValidator";
import type { CombatData, CombatStateService } from "./CombatStateService";
import type { CombatFollowController } from "./CombatFollowController";
import type { CombatLifecycleHandler } from "./CombatLifecycleHandler";
import type { CombatProjectileHitProcessor } from "./CombatProjectileHitProcessor";
import type { CombatTickAttackWorker } from "./CombatTickAttackWorker";
import type { PidManager } from "./PidManager";

/** Inbound payload for handleAttack (callback into the host). */
export interface CombatHandleAttackData {
  attackerId: string;
  targetId: string;
  attackerType: "player" | "mob";
  targetType: "player" | "mob";
  attackType?: AttackType;
}

/** Frame budget surface — minimal duck-type. */
interface FrameBudgetLike {
  hasTimeRemaining(ms: number): boolean;
}

export class CombatTickOrchestrator {
  private readonly pidManager: PidManager;
  private readonly projectileHitProcessor: CombatProjectileHitProcessor;
  private readonly animationManager: CombatAnimationManager;
  private readonly stateService: CombatStateService;
  private readonly lifecycleHandler: CombatLifecycleHandler;
  private readonly followController: CombatFollowController;
  private readonly attackValidator: CombatAttackValidator;
  private readonly tickAttackWorker: CombatTickAttackWorker;
  private readonly logger: SystemLogger;
  private readonly handleAttack: (
    data: CombatHandleAttackData,
  ) => Promise<void>;
  private readonly getFrameBudget: () => FrameBudgetLike | null | undefined;

  // Internal sort cache state (previously private on CombatSystem)
  private _pidSortDirty = true;
  private _lastSortedCombatCount = 0;

  constructor(
    pidManager: PidManager,
    projectileHitProcessor: CombatProjectileHitProcessor,
    animationManager: CombatAnimationManager,
    stateService: CombatStateService,
    lifecycleHandler: CombatLifecycleHandler,
    followController: CombatFollowController,
    attackValidator: CombatAttackValidator,
    tickAttackWorker: CombatTickAttackWorker,
    logger: SystemLogger,
    handleAttack: (data: CombatHandleAttackData) => Promise<void>,
    getFrameBudget: () => FrameBudgetLike | null | undefined,
  ) {
    this.pidManager = pidManager;
    this.projectileHitProcessor = projectileHitProcessor;
    this.animationManager = animationManager;
    this.stateService = stateService;
    this.lifecycleHandler = lifecycleHandler;
    this.followController = followController;
    this.attackValidator = attackValidator;
    this.tickAttackWorker = tickAttackWorker;
    this.logger = logger;
    this.handleAttack = handleAttack;
    this.getFrameBudget = getFrameBudget;
  }

  /**
   * Drain all combat states for this tick. Sorts by PID priority
   * (cached / dirty-tracked across ticks). Respects frame budget
   * warnings but never skips combat.
   */
  processCombatTick(tickNumber: number): void {
    const pidShuffled = this.pidManager.update(tickNumber);
    if (pidShuffled) {
      this._pidSortDirty = true;
    }

    this.projectileHitProcessor.processProjectileHits(tickNumber);

    this.animationManager.processEmoteResets(tickNumber);

    const combatStates = this.stateService.getAllCombatStates();
    const combatStatesMap = this.stateService.getCombatStatesMap();

    const combatCount = combatStates.length;
    if (combatCount !== this._lastSortedCombatCount) {
      this._pidSortDirty = true;
      this._lastSortedCombatCount = combatCount;
    }

    if (combatCount > 1 && this._pidSortDirty) {
      combatStates.sort((a, b) => this.pidManager.comparePriority(a[0], b[0]));
      this._pidSortDirty = false;
    }

    const frameBudget = this.getFrameBudget();
    let processed = 0;

    for (const [entityId, combatState] of combatStates) {
      if (processed > 0 && processed % 20 === 0) {
        if (frameBudget && !frameBudget.hasTimeRemaining(1)) {
          console.warn(
            `[CombatSystem] Frame budget exhausted with ${combatStates.length - processed} combats remaining`,
          );
        }
      }

      if (!combatStatesMap.has(entityId)) {
        continue;
      }

      if (combatState.inCombat && tickNumber >= combatState.combatEndTick) {
        const entityIdStr = String(entityId);
        this.lifecycleHandler.endCombat({ entityId: entityIdStr });
        processed++;
        continue;
      }

      if (!combatState.inCombat || !combatState.targetId) continue;

      if (combatState.attackerType === "player") {
        this.followController.checkRangeAndFollow(combatState, tickNumber);
      }

      if (tickNumber >= combatState.nextAttackTick) {
        void this.processAutoAttackOnTick(combatState, tickNumber).catch(
          (error) => {
            this.logger.error(
              "processAutoAttackOnTick failed",
              error instanceof Error ? error : undefined,
              { entityId: String(entityId), tickNumber },
            );
          },
        );
      }

      processed++;
    }
  }

  /** Per-mob entry point. Called during the NPC phase of each tick. */
  processNPCCombatTick(mobId: string, tickNumber: number): void {
    const combatState = this.stateService.getCombatData(mobId);
    if (!combatState) return;

    if (combatState.inCombat && tickNumber >= combatState.combatEndTick) {
      this.lifecycleHandler.endCombat({ entityId: mobId });
      return;
    }

    if (!combatState.inCombat || !combatState.targetId) return;
    if (combatState.attackerType !== "mob") return;

    this.animationManager.processEntityEmoteReset(mobId, tickNumber);

    if (tickNumber >= combatState.nextAttackTick) {
      void this.processAutoAttackOnTick(combatState, tickNumber).catch(
        (error) => {
          this.logger.error(
            "NPC processAutoAttackOnTick failed",
            error instanceof Error ? error : undefined,
            { mobId, tickNumber },
          );
        },
      );
    }
  }

  /** Per-player entry point. Called during the Player phase of each tick. */
  processPlayerCombatTick(playerId: string, tickNumber: number): void {
    const combatState = this.stateService.getCombatData(playerId);
    if (!combatState) return;

    if (combatState.inCombat && tickNumber >= combatState.combatEndTick) {
      this.lifecycleHandler.endCombat({ entityId: playerId });
      return;
    }

    if (!combatState.inCombat || !combatState.targetId) return;
    if (combatState.attackerType !== "player") return;

    this.animationManager.processEntityEmoteReset(playerId, tickNumber);

    this.followController.checkRangeAndFollow(combatState, tickNumber);

    if (tickNumber >= combatState.nextAttackTick) {
      void this.processAutoAttackOnTick(combatState, tickNumber).catch(
        (error) => {
          this.logger.error(
            "Player processAutoAttackOnTick failed",
            error instanceof Error ? error : undefined,
            { playerId, tickNumber },
          );
        },
      );
    }
  }

  /**
   * Per-combatant worker. Routes ranged/magic via the host's
   * handleAttack callback (still inline on CombatSystem); inlines
   * the melee path via attackValidator + tickAttackWorker.
   */
  private async processAutoAttackOnTick(
    combatState: CombatData,
    tickNumber: number,
  ): Promise<void> {
    const attackerId = String(combatState.attackerId);
    const targetId = String(combatState.targetId);
    const typedAttackerId = combatState.attackerId;

    const actors = this.attackValidator.validateCombatActors(combatState);
    if (!actors) return;
    const { attacker, target } = actors;

    const attackType =
      combatState.attackerType === "player"
        ? this.followController.getAttackTypeFromWeapon(attackerId)
        : combatState.weaponType;
    if (attackType === AttackType.RANGED || attackType === AttackType.MAGIC) {
      await this.handleAttack({
        attackerId,
        targetId,
        attackerType: combatState.attackerType,
        targetType: combatState.targetType,
        attackType,
      });

      const freshState = this.stateService
        .getCombatStatesMap()
        .get(typedAttackerId);
      if (freshState) {
        freshState.combatEndTick = tickNumber + getCombatTimeoutTicks();
        freshState.lastAttackTick = tickNumber;
      }
      return;
    }

    if (
      !this.attackValidator.validateAttackRange(
        attacker,
        target,
        combatState.attackerType,
      )
    ) {
      return;
    }

    const damage = this.tickAttackWorker.executeAttackDamage(
      attackerId,
      targetId,
      attacker,
      target,
      combatState,
      tickNumber,
    );

    if (!this.stateService.getCombatStatesMap().has(typedAttackerId)) {
      return;
    }

    this.tickAttackWorker.updateCombatTickState(
      combatState,
      typedAttackerId,
      tickNumber,
    );

    if (combatState.targetType === "player") {
      this.tickAttackWorker.handlePlayerRetaliation(
        targetId,
        attackerId,
        typedAttackerId,
        combatState.attackerType,
        tickNumber,
      );
    }

    this.tickAttackWorker.emitCombatEvents(
      attackerId,
      target,
      damage,
      combatState,
    );
  }
}
