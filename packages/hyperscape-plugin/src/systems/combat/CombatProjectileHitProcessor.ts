/**
 * CombatProjectileHitProcessor — deferred-damage resolution for
 * ranged + magic projectile hits.
 *
 * Wraps the single `processProjectileHits` method extracted from
 * CombatSystem.ts. Drains `projectileService.processTick(tickNumber)`
 * each tick and for every projectile that landed:
 *   - resolves the target (mob first, fall back to player),
 *   - skips if it died mid-flight,
 *   - caps damage at the target's current HP,
 *   - delegates the hit to CombatDamageApplicator,
 *   - emits damage-dealt + projectile-hit events,
 *   - records a COMBAT_DAMAGE replay entry,
 *   - awards magic XP if the projectile carried it.
 *
 * Extracted from CombatSystem.ts as the eleventh slice of the
 * system's decomposition (item #9 in PROGRESS_AUDIT, after the ten
 * prior slices: CombatEventEmitter, CombatPlayerQueries,
 * CombatEventRecorder, CombatDamageOrchestrator, CombatDeathHandler,
 * CombatLifecycleHandler, CombatAttackValidator, CombatFollowController,
 * CombatDamageApplicator, CombatTickAttackWorker).
 *
 * Coupling shape: 6 dep refs at construction, all already-extracted
 * helpers plus the host's projectileService and an emit closure for
 * the magic XP event.
 */

import {
  EventType,
  GameEventType,
  getEntityPosition,
  isMobEntity,
} from "@hyperforge/shared";

import type { ProjectileService } from "./ProjectileService";
import type { CombatDamageApplicator } from "./CombatDamageApplicator";
import type { CombatEntityResolver } from "./CombatEntityResolver";
import type { CombatEventEmitter } from "./CombatEventEmitter";
import type { CombatEventRecorder } from "./CombatEventRecorder";

/** Callback shape for the host system's typed-emit method. */
export type CombatProjectileHitEmitFn = (
  type: string,
  payload: Record<string, unknown>,
) => void;

export class CombatProjectileHitProcessor {
  private readonly projectileService: ProjectileService;
  private readonly entityResolver: CombatEntityResolver;
  private readonly damageApplicator: CombatDamageApplicator;
  private readonly eventEmitter: CombatEventEmitter;
  private readonly eventRecorder: CombatEventRecorder;
  private readonly emit: CombatProjectileHitEmitFn;

  constructor(
    projectileService: ProjectileService,
    entityResolver: CombatEntityResolver,
    damageApplicator: CombatDamageApplicator,
    eventEmitter: CombatEventEmitter,
    eventRecorder: CombatEventRecorder,
    emit: CombatProjectileHitEmitFn,
  ) {
    this.projectileService = projectileService;
    this.entityResolver = entityResolver;
    this.damageApplicator = damageApplicator;
    this.eventEmitter = eventEmitter;
    this.eventRecorder = eventRecorder;
    this.emit = emit;
  }

  /**
   * Drain the projectile service for this tick and resolve every
   * landed projectile.
   */
  processProjectileHits(tickNumber: number): void {
    const result = this.projectileService.processTick(tickNumber);

    for (const projectile of result.hits) {
      const target =
        this.entityResolver.resolve(projectile.targetId, "mob") ??
        this.entityResolver.resolve(projectile.targetId, "player");

      if (!target) continue;

      const targetType = isMobEntity(target) ? "mob" : "player";

      if (!this.entityResolver.isAlive(target, targetType)) {
        continue;
      }

      const currentHealth = this.entityResolver.getHealth(target);
      const damage = Math.min(projectile.damage, currentHealth);

      this.damageApplicator.applyDamage(
        projectile.targetId,
        targetType,
        damage,
        projectile.attackerId,
      );

      const targetPosition = getEntityPosition(target);
      this.eventEmitter.emitDamageDealt(
        projectile.attackerId,
        projectile.targetId,
        damage,
        undefined,
        targetType,
        targetPosition,
      );
      this.eventEmitter.emitProjectileHit(
        projectile.attackerId,
        projectile.targetId,
        damage,
        projectile.spellId ? "spell" : "arrow",
      );

      this.eventRecorder.record(
        GameEventType.COMBAT_DAMAGE,
        projectile.attackerId,
        {
          targetId: projectile.targetId,
          damage,
          rawDamage: projectile.damage,
          projectileHit: true,
          attackType: projectile.spellId ? "magic" : "ranged",
        },
      );

      if (projectile.xpReward && projectile.xpReward > 0) {
        this.emit(EventType.PLAYER_XP_GAINED, {
          playerId: projectile.attackerId,
          skill: "magic",
          xp: projectile.xpReward,
        });
      }
    }
  }
}
