/**
 * CombatEventEmitter — zero-allocation event emission helpers for
 * the combat system.
 *
 * Holds the 8 pre-allocated payload objects that combat events reuse
 * to avoid GC pressure on the hot path. Each `emit*` method populates
 * its payload object's fields and emits via the host system's typed-
 * emit callback. Safe because the host event-bus is synchronous —
 * listeners process before emit returns, so payload mutation between
 * emits cannot interfere with in-flight delivery.
 *
 * Extracted from CombatSystem.ts as the first slice of the system's
 * decomposition (item #9 in PROGRESS_AUDIT). The host system holds
 * one instance and delegates the corresponding `this.emit*(...)` call
 * sites to it: `this.eventEmitter.emitDamageDealt(...)` etc.
 *
 * Usage:
 *
 * ```ts
 * import { CombatEventEmitter } from "./CombatEventEmitter.js";
 *
 * class CombatSystem extends SystemBase {
 *   private readonly eventEmitter: CombatEventEmitter;
 *   constructor(world: World) {
 *     super(world, ...);
 *     this.eventEmitter = new CombatEventEmitter((type, payload) =>
 *       this.emitTypedEvent(type, payload),
 *     );
 *   }
 *
 *   foo() {
 *     this.eventEmitter.emitDamageDealt(attackerId, targetId, damage);
 *   }
 * }
 * ```
 */

import { EventType } from "@hyperforge/shared";

/**
 * Callback shape for the host system's typed-emit method. CombatSystem
 * extends SystemBase which exposes `emitTypedEvent` as a `protected`
 * method — the constructor injects a closure over it so this helper
 * doesn't need a reference to the system instance.
 */
export type CombatEmitFn = (
  type: string,
  payload: Record<string, unknown>,
) => void;

export class CombatEventEmitter {
  private readonly emit: CombatEmitFn;

  // ============================================================================
  // PRE-ALLOCATED EVENT PAYLOADS (zero-allocation hot path)
  // ============================================================================
  // These objects are reused for every event emission to avoid GC pressure.
  // Safe because EventEmitter3 is synchronous — listeners process before emit
  // returns.

  private readonly _damageDealtPayload = {
    attackerId: "",
    targetId: "",
    damage: 0,
    attackType: "melee" as string | undefined,
    targetType: "mob" as "player" | "mob" | undefined,
    position: { x: 0, y: 0, z: 0 } as
      | { x: number; y: number; z: number }
      | undefined,
    isCritical: false as boolean | undefined,
  };

  // Separate position object so we don't repeatedly assign undefined.
  private readonly _damageDealtPositionBuffer = { x: 0, y: 0, z: 0 };

  private readonly _projectileLaunchedPayload = {
    attackerId: "",
    targetId: "",
    projectileType: "",
    sourcePosition: { x: 0, y: 0, z: 0 },
    targetPosition: { x: 0, y: 0, z: 0 },
    spellId: undefined as string | undefined,
    arrowId: undefined as string | undefined,
    delayMs: undefined as number | undefined,
    travelDurationMs: undefined as number | undefined,
  };

  private readonly _faceTargetPayload = {
    playerId: "",
    targetId: "",
  };

  private readonly _clearFaceTargetPayload = {
    playerId: "",
  };

  private readonly _attackFailedPayload = {
    attackerId: "",
    targetId: "",
    reason: "",
  };

  private readonly _followTargetPayload = {
    playerId: "",
    targetId: "",
    targetPosition: { x: 0, y: 0, z: 0 },
    attackRange: 1 as number | undefined,
    attackType: "melee" as string | undefined,
  };

  private readonly _combatStartedPayload = {
    attackerId: "",
    targetId: "",
  };

  private readonly _combatEndedPayload = {
    attackerId: "",
    targetId: "",
  };

  private readonly _projectileHitPayload = {
    attackerId: "",
    targetId: "",
    damage: 0,
    projectileType: "",
  };

  constructor(emit: CombatEmitFn) {
    this.emit = emit;
  }

  // ============================================================================
  // ZERO-ALLOCATION EMIT HELPERS
  // ============================================================================

  emitDamageDealt(
    attackerId: string,
    targetId: string,
    damage: number,
    attackType?: string,
    targetType?: "player" | "mob",
    position?: { x: number; y: number; z: number } | null,
    isCritical?: boolean,
  ): void {
    this._damageDealtPayload.attackerId = attackerId;
    this._damageDealtPayload.targetId = targetId;
    this._damageDealtPayload.damage = damage;
    this._damageDealtPayload.attackType = attackType;
    this._damageDealtPayload.targetType = targetType;
    this._damageDealtPayload.isCritical = isCritical;
    if (position) {
      this._damageDealtPositionBuffer.x = position.x;
      this._damageDealtPositionBuffer.y = position.y;
      this._damageDealtPositionBuffer.z = position.z;
      this._damageDealtPayload.position = this._damageDealtPositionBuffer;
    } else {
      this._damageDealtPayload.position = undefined;
    }
    this.emit(EventType.COMBAT_DAMAGE_DEALT, this._damageDealtPayload);
  }

  emitProjectileLaunched(
    attackerId: string,
    targetId: string,
    projectileType: string,
    sourcePosition: { x: number; y: number; z: number },
    targetPosition: { x: number; y: number; z: number },
    spellId?: string,
    arrowId?: string,
    delayMs?: number,
    flightTimeMs?: number,
  ): void {
    this._projectileLaunchedPayload.attackerId = attackerId;
    this._projectileLaunchedPayload.targetId = targetId;
    this._projectileLaunchedPayload.projectileType = projectileType;
    this._projectileLaunchedPayload.sourcePosition.x = sourcePosition.x;
    this._projectileLaunchedPayload.sourcePosition.y = sourcePosition.y;
    this._projectileLaunchedPayload.sourcePosition.z = sourcePosition.z;
    this._projectileLaunchedPayload.targetPosition.x = targetPosition.x;
    this._projectileLaunchedPayload.targetPosition.y = targetPosition.y;
    this._projectileLaunchedPayload.targetPosition.z = targetPosition.z;
    this._projectileLaunchedPayload.spellId = spellId;
    this._projectileLaunchedPayload.arrowId = arrowId;
    this._projectileLaunchedPayload.delayMs = delayMs;
    this._projectileLaunchedPayload.travelDurationMs = flightTimeMs;
    this.emit(
      EventType.COMBAT_PROJECTILE_LAUNCHED,
      this._projectileLaunchedPayload,
    );
  }

  emitFaceTarget(playerId: string, targetId: string): void {
    this._faceTargetPayload.playerId = playerId;
    this._faceTargetPayload.targetId = targetId;
    this.emit(EventType.COMBAT_FACE_TARGET, this._faceTargetPayload);
  }

  emitClearFaceTarget(playerId: string): void {
    this._clearFaceTargetPayload.playerId = playerId;
    this.emit(EventType.COMBAT_CLEAR_FACE_TARGET, this._clearFaceTargetPayload);
  }

  emitAttackFailed(attackerId: string, targetId: string, reason: string): void {
    this._attackFailedPayload.attackerId = attackerId;
    this._attackFailedPayload.targetId = targetId;
    this._attackFailedPayload.reason = reason;
    this.emit(EventType.COMBAT_ATTACK_FAILED, this._attackFailedPayload);
  }

  emitFollowTarget(
    playerId: string,
    targetId: string,
    targetPosition: { x: number; y: number; z: number },
    attackRange?: number,
    attackType?: string,
  ): void {
    this._followTargetPayload.playerId = playerId;
    this._followTargetPayload.targetId = targetId;
    this._followTargetPayload.targetPosition.x = targetPosition.x;
    this._followTargetPayload.targetPosition.y = targetPosition.y;
    this._followTargetPayload.targetPosition.z = targetPosition.z;
    this._followTargetPayload.attackRange = attackRange;
    this._followTargetPayload.attackType = attackType;
    this.emit(EventType.COMBAT_FOLLOW_TARGET, this._followTargetPayload);
  }

  emitCombatStarted(attackerId: string, targetId: string): void {
    this._combatStartedPayload.attackerId = attackerId;
    this._combatStartedPayload.targetId = targetId;
    this.emit(EventType.COMBAT_STARTED, this._combatStartedPayload);
  }

  emitCombatEnded(attackerId: string, targetId: string): void {
    this._combatEndedPayload.attackerId = attackerId;
    this._combatEndedPayload.targetId = targetId;
    this.emit(EventType.COMBAT_ENDED, this._combatEndedPayload);
  }

  emitProjectileHit(
    attackerId: string,
    targetId: string,
    damage: number,
    projectileType: string,
  ): void {
    this._projectileHitPayload.attackerId = attackerId;
    this._projectileHitPayload.targetId = targetId;
    this._projectileHitPayload.damage = damage;
    this._projectileHitPayload.projectileType = projectileType;
    this.emit(EventType.COMBAT_PROJECTILE_HIT, this._projectileHitPayload);
  }
}
