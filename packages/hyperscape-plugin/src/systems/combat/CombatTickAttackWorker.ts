/**
 * CombatTickAttackWorker — per-tick auto-attack worker cluster.
 *
 * Wraps the four worker methods that fire inside processAutoAttackOnTick:
 *   - executeAttackDamage: face target, play emote, compute melee damage,
 *     apply via damageApplicator, emit splatter + record events
 *   - updateCombatTickState: write lastAttackTick / nextAttackTick /
 *     combatEndTick and update the shared nextAttackTicks Map
 *   - handlePlayerRetaliation: create retaliation combat state on the
 *     target player when auto-retaliate is on and they aren't AFK
 *   - emitCombatEvents: surface the "you hit X for Y damage" UI message
 *
 * Together they implement "what happens after one auto-attack tick lands":
 * deal damage, advance tick state, handle target retaliation, emit UI
 * feedback. Cohesive — they share the (attacker, target, combatState,
 * tickNumber) call-context.
 *
 * Extracted from CombatSystem.ts as the tenth slice of the system's
 * decomposition (item #9 in PROGRESS_AUDIT, after the nine prior slices:
 * CombatEventEmitter, CombatPlayerQueries, CombatEventRecorder,
 * CombatDamageOrchestrator, CombatDeathHandler, CombatLifecycleHandler,
 * CombatAttackValidator, CombatFollowController, CombatDamageApplicator).
 *
 * Coupling shape: 12 dep refs at construction. Most are concrete helper
 * objects that have already been extracted in earlier slices. Two are
 * closures because the underlying systems are late-bound on CombatSystem
 * (assigned during start() after world lookups):
 *   - getPlayerSystem — auto-retaliate flag lookup
 * Plus shared mutable refs: nextAttackTicks Map, lastInputTick Map.
 */

import {
  EventType,
  GameEventType,
  type CombatStyle,
  type Entity,
  type EntityID,
  calculateRetaliationDelay,
  createEntityID,
  getAfkDisableRetaliateTicks,
  getCombatTimeoutTicks,
  getEntityPosition,
} from "@hyperforge/shared";

import { MobEntity } from "../../entities/npc/MobEntity.js";

import type { CombatAnimationManager } from "./CombatAnimationManager";
import type { CombatDamageApplicator } from "./CombatDamageApplicator";
import type { CombatDamageOrchestrator } from "./CombatDamageOrchestrator";
import type { CombatEntityResolver } from "./CombatEntityResolver";
import type { CombatEventEmitter } from "./CombatEventEmitter";
import type { CombatEventRecorder } from "./CombatEventRecorder";
import type { CombatRotationManager } from "./CombatRotationManager";
import type { CombatData, CombatStateService } from "./CombatStateService";

/** Surface needed for auto-retaliate flag lookup. */
interface PlayerSystemLike {
  getPlayerAutoRetaliate(id: string): boolean;
  getPlayerAttackStyle?(id: string): { id: string } | undefined;
}

/** Callback shape for the host system's typed-emit method. */
export type CombatTickEmitFn = (
  type: string,
  payload: Record<string, unknown>,
) => void;

export class CombatTickAttackWorker {
  private readonly rotationManager: CombatRotationManager;
  private readonly animationManager: CombatAnimationManager;
  private readonly damageOrchestrator: CombatDamageOrchestrator;
  private readonly entityResolver: CombatEntityResolver;
  private readonly damageApplicator: CombatDamageApplicator;
  private readonly eventEmitter: CombatEventEmitter;
  private readonly eventRecorder: CombatEventRecorder;
  private readonly stateService: CombatStateService;
  private readonly nextAttackTicks: Map<EntityID, number>;
  private readonly lastInputTick: Map<string, number>;
  private readonly emit: CombatTickEmitFn;
  private readonly getPlayerSystem: () => PlayerSystemLike | undefined;

  constructor(
    rotationManager: CombatRotationManager,
    animationManager: CombatAnimationManager,
    damageOrchestrator: CombatDamageOrchestrator,
    entityResolver: CombatEntityResolver,
    damageApplicator: CombatDamageApplicator,
    eventEmitter: CombatEventEmitter,
    eventRecorder: CombatEventRecorder,
    stateService: CombatStateService,
    nextAttackTicks: Map<EntityID, number>,
    lastInputTick: Map<string, number>,
    emit: CombatTickEmitFn,
    getPlayerSystem: () => PlayerSystemLike | undefined,
  ) {
    this.rotationManager = rotationManager;
    this.animationManager = animationManager;
    this.damageOrchestrator = damageOrchestrator;
    this.entityResolver = entityResolver;
    this.damageApplicator = damageApplicator;
    this.eventEmitter = eventEmitter;
    this.eventRecorder = eventRecorder;
    this.stateService = stateService;
    this.nextAttackTicks = nextAttackTicks;
    this.lastInputTick = lastInputTick;
    this.emit = emit;
    this.getPlayerSystem = getPlayerSystem;
  }

  /**
   * Face target, play emote, compute melee damage, apply, emit splatter,
   * record COMBAT_ATTACK + COMBAT_DAMAGE/COMBAT_MISS events.
   * Returns the actual damage dealt (capped at target current health).
   */
  executeAttackDamage(
    attackerId: string,
    targetId: string,
    attacker: Entity | MobEntity,
    target: Entity | MobEntity,
    combatState: CombatData,
    tickNumber: number,
  ): number {
    this.rotationManager.rotateTowardsTarget(
      attackerId,
      targetId,
      combatState.attackerType,
      combatState.targetType,
    );

    this.animationManager.setCombatEmote(
      attackerId,
      combatState.attackerType,
      tickNumber,
      combatState.attackSpeedTicks,
    );

    let combatStyle: CombatStyle = "accurate";
    if (combatState.attackerType === "player") {
      const playerSystem = this.getPlayerSystem();
      const styleData = playerSystem?.getPlayerAttackStyle?.(attackerId);
      if (styleData?.id) {
        combatStyle = styleData.id as CombatStyle;
      }
    }

    const rawDamage = this.damageOrchestrator.calculateMeleeDamage(
      attacker,
      target,
      combatStyle,
    );

    const currentHealth = this.entityResolver.getHealth(target);
    const damage = Math.min(rawDamage, currentHealth);

    this.damageApplicator.applyDamage(
      targetId,
      combatState.targetType,
      damage,
      attackerId,
    );

    const targetPosition = getEntityPosition(target);
    this.eventEmitter.emitDamageDealt(
      attackerId,
      targetId,
      damage,
      undefined,
      combatState.targetType,
      targetPosition,
    );

    this.eventRecorder.record(GameEventType.COMBAT_ATTACK, attackerId, {
      targetId,
      attackerType: combatState.attackerType,
      targetType: combatState.targetType,
      attackSpeedTicks: combatState.attackSpeedTicks,
    });

    if (damage > 0) {
      this.eventRecorder.record(GameEventType.COMBAT_DAMAGE, attackerId, {
        targetId,
        damage,
        rawDamage,
        targetHealth: currentHealth,
        targetPosition: targetPosition
          ? { x: targetPosition.x, y: targetPosition.y, z: targetPosition.z }
          : undefined,
      });
    } else {
      this.eventRecorder.record(GameEventType.COMBAT_MISS, attackerId, {
        targetId,
        rawDamage,
      });
    }

    return damage;
  }

  /** Advance tick-state fields after a successful attack. */
  updateCombatTickState(
    combatState: CombatData,
    typedAttackerId: EntityID,
    tickNumber: number,
  ): void {
    combatState.lastAttackTick = tickNumber;
    combatState.nextAttackTick = tickNumber + combatState.attackSpeedTicks;
    combatState.combatEndTick = tickNumber + getCombatTimeoutTicks();
    this.nextAttackTicks.set(typedAttackerId, combatState.nextAttackTick);
  }

  /**
   * Create retaliation combat state on the target player if auto-retaliate
   * is on AND they aren't AFK AND they have no live current target.
   */
  handlePlayerRetaliation(
    targetId: string,
    attackerId: string,
    typedAttackerId: EntityID,
    attackerType: "player" | "mob",
    tickNumber: number,
  ): void {
    const targetPlayerState = this.stateService.getCombatData(targetId);
    const playerSystem = this.getPlayerSystem();
    let shouldRetaliate =
      playerSystem?.getPlayerAutoRetaliate(targetId) ?? true;

    if (shouldRetaliate && this.isAFKTooLong(targetId, tickNumber)) {
      shouldRetaliate = false;
    }

    if (!shouldRetaliate) return;

    const needsNewTarget =
      !targetPlayerState ||
      !targetPlayerState.inCombat ||
      !this.entityResolver.isAlive(
        this.entityResolver.resolve(
          String(targetPlayerState.targetId),
          targetPlayerState.targetType,
        ),
        targetPlayerState.targetType,
      );

    if (!needsNewTarget) return;

    const playerAttackSpeed = this.entityResolver.getAttackSpeed(
      createEntityID(targetId),
      "player",
    );
    const retaliationDelay = calculateRetaliationDelay(playerAttackSpeed);

    this.stateService.createRetaliatorState(
      createEntityID(targetId),
      typedAttackerId,
      "player",
      attackerType,
      tickNumber,
      retaliationDelay,
      playerAttackSpeed,
    );

    this.stateService.syncCombatStateToEntity(targetId, attackerId, "player");

    this.rotationManager.rotateTowardsTarget(
      targetId,
      attackerId,
      "player",
      attackerType,
    );

    this.eventEmitter.emitClearFaceTarget(targetId);
  }

  /**
   * Emit the "you hit X for Y damage" UI feedback message. Player-only;
   * mobs don't get chat lines.
   *
   * NOTE: COMBAT_MELEE_ATTACK is NOT emitted here to avoid duplicate
   * processing. Damage splats are handled by COMBAT_DAMAGE_DEALT which
   * is already emitted by executeAttackDamage and bridged to clients
   * via EventBridge.
   */
  emitCombatEvents(
    attackerId: string,
    target: Entity | MobEntity,
    damage: number,
    combatState: CombatData,
  ): void {
    if (combatState.attackerType === "player") {
      this.emit(EventType.UI_MESSAGE, {
        playerId: attackerId,
        message: `You hit the ${this.entityResolver.getDisplayName(target)} for ${damage} damage!`,
        type: "combat",
      });
    }
  }

  private isAFKTooLong(playerId: string, currentTick: number): boolean {
    const lastInput = this.lastInputTick.get(playerId) ?? currentTick;
    return currentTick - lastInput >= getAfkDisableRetaliateTicks();
  }
}
