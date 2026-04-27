/**
 * CombatEnterLifecycleHandler — combat-start lifecycle.
 *
 * Wraps the single `enterCombat` method extracted from CombatSystem.ts.
 * Coordinates the full set-up flow when an attacker initiates combat
 * against a target:
 *
 *   - Death check (target entity + player.alive flag)
 *   - PvP zone validation (player-vs-player + not in streaming duel)
 *   - Attacker combat state creation (attack speed, weapon type)
 *   - Retaliation scheduling for the target if applicable:
 *       * mob retaliates flag OR player auto-retaliate setting
 *       * AFK suppression (20-min input timeout disables retaliate)
 *       * "no current valid target" check before scheduling
 *       * In-range vs follow-event branching for player retaliation
 *       * extendCombatTimer when target already has a valid target
 *   - sync-to-entity for both attacker and target
 *   - mark-in-combat-without-target when player auto-retaliate is off
 *   - COMBAT_STARTED event emission + COMBAT_START replay record
 *   - "Combat started with X!" UI message to the local player
 *
 * Extracted from CombatSystem.ts as the thirteenth slice of the
 * system's decomposition (item #9 in PROGRESS_AUDIT). Was deferred
 * from slice 6 because of the dep surface; with all the other
 * helpers in place this is now a clean cut.
 *
 * Coupling shape: 11 dep refs at construction. Most are concrete
 * helpers from earlier slices. Three are closures because the
 * underlying systems are late-bound on CombatSystem (assigned during
 * start() after world lookups):
 *   - getZoneDetectionSystem — PvP zone safety check
 *   - getPlayerSystem — auto-retaliate flag + player-alive lookup
 * Plus the world ref (entities, getPlayer, currentTick) and the
 * lastInputTick Map for AFK detection + emit closure for UI message.
 */

import {
  AttackType,
  EventType,
  GameEventType,
  type EntityID,
  type ZoneDetectionSystemDuck,
  calculateRetaliationDelay,
  getAfkDisableRetaliateTicks,
  getEntityPosition,
  getMobRetaliates,
  isEntityDead,
  tilesWithinMeleeRange,
  tilesWithinRange,
  worldToTile,
  type World,
} from "@hyperforge/shared";

import type { CombatEntityResolver } from "./CombatEntityResolver";
import type { CombatEventEmitter } from "./CombatEventEmitter";
import type { CombatEventRecorder } from "./CombatEventRecorder";
import type { CombatFollowController } from "./CombatFollowController";
import type { CombatRotationManager } from "./CombatRotationManager";
import type { CombatStateService } from "./CombatStateService";

/** Surface needed for auto-retaliate flag + player-alive lookup. */
interface PlayerSystemLike {
  getPlayer(id: string): { alive?: boolean } | undefined;
  getPlayerAutoRetaliate(id: string): boolean;
}

/** Callback shape for the host system's typed-emit method. */
export type CombatEnterEmitFn = (
  type: string,
  payload: Record<string, unknown>,
) => void;

export class CombatEnterLifecycleHandler {
  private readonly world: World;
  private readonly entityResolver: CombatEntityResolver;
  private readonly stateService: CombatStateService;
  private readonly rotationManager: CombatRotationManager;
  private readonly followController: CombatFollowController;
  private readonly eventEmitter: CombatEventEmitter;
  private readonly eventRecorder: CombatEventRecorder;
  private readonly lastInputTick: Map<string, number>;
  private readonly emit: CombatEnterEmitFn;
  private readonly getZoneDetectionSystem: () =>
    | ZoneDetectionSystemDuck
    | null
    | undefined;
  private readonly getPlayerSystem: () => PlayerSystemLike | undefined;

  constructor(
    world: World,
    entityResolver: CombatEntityResolver,
    stateService: CombatStateService,
    rotationManager: CombatRotationManager,
    followController: CombatFollowController,
    eventEmitter: CombatEventEmitter,
    eventRecorder: CombatEventRecorder,
    lastInputTick: Map<string, number>,
    emit: CombatEnterEmitFn,
    getZoneDetectionSystem: () => ZoneDetectionSystemDuck | null | undefined,
    getPlayerSystem: () => PlayerSystemLike | undefined,
  ) {
    this.world = world;
    this.entityResolver = entityResolver;
    this.stateService = stateService;
    this.rotationManager = rotationManager;
    this.followController = followController;
    this.eventEmitter = eventEmitter;
    this.eventRecorder = eventRecorder;
    this.lastInputTick = lastInputTick;
    this.emit = emit;
    this.getZoneDetectionSystem = getZoneDetectionSystem;
    this.getPlayerSystem = getPlayerSystem;
  }

  /**
   * Initiate combat between an attacker and target. Validates death +
   * PvP-zone constraints, creates attacker state, schedules retaliation,
   * syncs entity-side combat refs, and emits start events + UI message.
   */
  enterCombat(
    attackerId: EntityID,
    targetId: EntityID,
    attackerSpeedTicks?: number,
    attackerWeaponType: AttackType = AttackType.MELEE,
  ): void {
    const currentTick = this.world.currentTick ?? 0;

    const attackerEntity = this.world.entities.get(String(attackerId));
    const targetEntity = this.world.entities.get(String(targetId));

    if (isEntityDead(targetEntity)) {
      return;
    }

    const playerSystem = this.getPlayerSystem();
    if (playerSystem?.getPlayer) {
      const targetPlayer = playerSystem.getPlayer(String(targetId));
      if (targetPlayer && !targetPlayer.alive) {
        return;
      }
    }

    const attackerType =
      attackerEntity?.type === "mob" ? ("mob" as const) : ("player" as const);
    const targetType =
      targetEntity?.type === "mob" ? ("mob" as const) : ("player" as const);

    const attackerInStreamingDuel =
      (attackerEntity as { data?: { inStreamingDuel?: boolean } } | undefined)
        ?.data?.inStreamingDuel === true;
    const targetInStreamingDuel =
      (targetEntity as { data?: { inStreamingDuel?: boolean } } | undefined)
        ?.data?.inStreamingDuel === true;
    const bypassPvPZoneCheck = attackerInStreamingDuel || targetInStreamingDuel;

    if (
      attackerType === "player" &&
      targetType === "player" &&
      !bypassPvPZoneCheck
    ) {
      const zoneDetectionSystem = this.getZoneDetectionSystem();
      if (zoneDetectionSystem) {
        const attackerPos = getEntityPosition(attackerEntity);
        if (attackerPos) {
          const isPvPAllowed = zoneDetectionSystem.isPvPEnabled({
            x: attackerPos.x,
            z: attackerPos.z,
          });
          if (!isPvPAllowed) {
            return;
          }
        }
      }
    }

    const attackerAttackSpeedTicks =
      attackerSpeedTicks ??
      this.entityResolver.getAttackSpeed(attackerId, attackerType);
    const targetAttackSpeedTicks = this.entityResolver.getAttackSpeed(
      targetId,
      targetType,
    );

    this.stateService.createAttackerState(
      attackerId,
      targetId,
      attackerType,
      targetType,
      currentTick,
      attackerAttackSpeedTicks,
      attackerWeaponType,
    );

    let canRetaliate = true;
    if (targetType === "mob" && targetEntity) {
      canRetaliate = getMobRetaliates(targetEntity);
    } else if (targetType === "player") {
      if (playerSystem) {
        canRetaliate = playerSystem.getPlayerAutoRetaliate(String(targetId));
      }

      if (canRetaliate && this.isAFKTooLong(String(targetId), currentTick)) {
        canRetaliate = false;
      }
    }

    this.rotationManager.rotateTowardsTarget(
      String(attackerId),
      String(targetId),
      attackerType,
      targetType,
    );

    if (attackerType === "player") {
      this.eventEmitter.emitFaceTarget(String(attackerId), String(targetId));
    }

    let targetHasValidTarget = false;
    if (canRetaliate) {
      const targetCombatState = this.stateService.getCombatData(targetId);
      targetHasValidTarget = !!(
        targetCombatState &&
        targetCombatState.inCombat &&
        this.entityResolver.isAlive(
          this.entityResolver.resolve(
            String(targetCombatState.targetId),
            targetCombatState.targetType,
          ),
          targetCombatState.targetType,
        )
      );

      if (!targetHasValidTarget) {
        const retaliationDelay = calculateRetaliationDelay(
          targetAttackSpeedTicks,
        );

        this.stateService.createRetaliatorState(
          targetId,
          attackerId,
          targetType,
          attackerType,
          currentTick,
          retaliationDelay,
          targetAttackSpeedTicks,
        );

        if (targetType === "player") {
          this.rotationManager.rotateTowardsTarget(
            String(targetId),
            String(attackerId),
            targetType,
            attackerType,
          );
        }

        if (targetType === "player" && attackerEntity && targetEntity) {
          const attackerPos = getEntityPosition(attackerEntity);
          const targetPos = getEntityPosition(targetEntity);

          if (attackerPos && targetPos) {
            const attackerTile = worldToTile(attackerPos.x, attackerPos.z);
            const targetTile = worldToTile(targetPos.x, targetPos.z);

            const targetAttackType =
              this.followController.getAttackTypeFromWeapon(String(targetId));
            const targetCombatRange = this.entityResolver.getCombatRange(
              targetEntity,
              "player",
            );

            const inRange =
              targetAttackType === AttackType.MELEE
                ? tilesWithinMeleeRange(
                    targetTile,
                    attackerTile,
                    targetCombatRange,
                  )
                : tilesWithinRange(targetTile, attackerTile, targetCombatRange);

            if (!inRange) {
              this.eventEmitter.emitFollowTarget(
                String(targetId),
                String(attackerId),
                attackerPos,
                targetCombatRange,
                targetAttackType,
              );
            }
          }
        }
      } else {
        this.stateService.extendCombatTimer(targetId, currentTick);
      }
    }

    this.stateService.syncCombatStateToEntity(
      String(attackerId),
      String(targetId),
      attackerType,
    );

    if (canRetaliate && !targetHasValidTarget) {
      this.stateService.syncCombatStateToEntity(
        String(targetId),
        String(attackerId),
        targetType,
      );
    } else if (!canRetaliate && targetType === "player") {
      this.stateService.markInCombatWithoutTarget(
        String(targetId),
        String(attackerId),
      );

      this.eventEmitter.emitFaceTarget(String(targetId), String(attackerId));
    }

    this.eventEmitter.emitCombatStarted(String(attackerId), String(targetId));

    this.eventRecorder.record(GameEventType.COMBAT_START, String(attackerId), {
      targetId: String(targetId),
      attackerType,
      targetType,
      attackerAttackSpeedTicks,
      targetAttackSpeedTicks,
    });

    const localPlayer = this.world.getPlayer();
    if (
      localPlayer &&
      (String(attackerId) === localPlayer.id ||
        String(targetId) === localPlayer.id)
    ) {
      const opponent =
        String(attackerId) === localPlayer.id ? targetEntity : attackerEntity;
      const opponentName = opponent!.name;

      this.emit(EventType.UI_MESSAGE, {
        playerId: localPlayer.id,
        message: `Combat started with ${opponentName}!`,
        type: "combat",
        duration: 3000,
      });
    }
  }

  private isAFKTooLong(playerId: string, currentTick: number): boolean {
    const lastInput = this.lastInputTick.get(playerId) ?? currentTick;
    return currentTick - lastInput >= getAfkDisableRetaliateTicks();
  }
}
