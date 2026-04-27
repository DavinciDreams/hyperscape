/**
 * CombatDamageApplicator — central damage-application path.
 *
 * Wraps the single `applyDamage` method extracted from CombatSystem.ts.
 * applyDamage is the trunk that all attack paths funnel through:
 *   - handleMeleeAttack (immediate single-tick damage)
 *   - executeAttackDamage (tick-pipeline auto-attack)
 *   - processProjectileHits (deferred ranged/magic resolution)
 *
 * It dispatches polymorphically by target type via the damageHandlers
 * Map (player vs mob), routes death cleanup through CombatDeathHandler,
 * and surfaces the "you take damage" UI message to player victims.
 *
 * Extracted from CombatSystem.ts as the ninth slice of the system's
 * decomposition (item #9 in PROGRESS_AUDIT, after the eight prior
 * slices: CombatEventEmitter, CombatPlayerQueries, CombatEventRecorder,
 * CombatDamageOrchestrator, CombatDeathHandler, CombatLifecycleHandler,
 * CombatAttackValidator, CombatFollowController).
 *
 * Coupling shape: 5 dep references injected at construction time.
 * The damageHandlers Map and emit closure are shared with the host
 * system — Map ownership stays on CombatSystem (set up at construction
 * with PlayerDamageHandler + MobDamageHandler), helper just reads.
 */

import {
  EventType,
  createEntityID,
  type SystemLogger,
} from "@hyperforge/shared";

import type { CombatDeathHandler } from "./CombatDeathHandler";
import type { CombatEntityResolver } from "./CombatEntityResolver";
import type { DamageHandler } from "./handlers";

/** Callback shape for the host system's typed-emit method. */
export type CombatDamageEmitFn = (
  type: string,
  payload: Record<string, unknown>,
) => void;

export class CombatDamageApplicator {
  private readonly damageHandlers: Map<"player" | "mob", DamageHandler>;
  private readonly entityResolver: CombatEntityResolver;
  private readonly deathHandler: CombatDeathHandler;
  private readonly logger: SystemLogger;
  private readonly emit: CombatDamageEmitFn;

  constructor(
    damageHandlers: Map<"player" | "mob", DamageHandler>,
    entityResolver: CombatEntityResolver,
    deathHandler: CombatDeathHandler,
    logger: SystemLogger,
    emit: CombatDamageEmitFn,
  ) {
    this.damageHandlers = damageHandlers;
    this.entityResolver = entityResolver;
    this.deathHandler = deathHandler;
    this.logger = logger;
    this.emit = emit;
  }

  /**
   * Apply damage to a target via the polymorphic damageHandlers
   * dispatch. Routes death cleanup through CombatDeathHandler when
   * the target dies (or was already dead), and surfaces the
   * "you take damage" UI message to player victims.
   *
   * Damage splatter events are emitted at the call sites
   * (handleMeleeAttack, executeAttackDamage, processProjectileHits)
   * so 0-damage hits still produce splats.
   */
  applyDamage(
    targetId: string,
    targetType: string,
    damage: number,
    attackerId: string,
  ): void {
    if (targetType !== "player" && targetType !== "mob") {
      return;
    }

    const handler = this.damageHandlers.get(targetType);
    if (!handler) {
      this.logger.error("No damage handler for target type", undefined, {
        targetType,
      });
      return;
    }

    const typedTargetId = createEntityID(targetId);
    const typedAttackerId = createEntityID(attackerId);

    const attackerType = this.entityResolver.resolveType(attackerId);

    const result = handler.applyDamage(
      typedTargetId,
      damage,
      typedAttackerId,
      attackerType,
    );

    if (!result.success) {
      if (result.targetDied) {
        this.deathHandler.handleEntityDied(targetId, targetType);
      } else {
        this.logger.error("Failed to apply damage", undefined, {
          targetId,
          targetType,
        });
      }
      return;
    }

    if (result.targetDied) {
      this.deathHandler.handleEntityDied(targetId, targetType);
      return;
    }

    if (targetType === "player") {
      const attackerHandler = this.damageHandlers.get(attackerType);
      const attackerName = attackerHandler
        ? attackerHandler.getDisplayName(typedAttackerId)
        : "enemy";

      this.emit(EventType.UI_MESSAGE, {
        playerId: targetId,
        message: `The ${attackerName} hits you for ${damage} damage!`,
        type: "damage",
      });
    }
  }
}
