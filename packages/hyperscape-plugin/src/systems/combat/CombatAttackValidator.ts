/**
 * CombatAttackValidator — predicate-style validation helpers used
 * by the combat attack pipeline.
 *
 * Wraps the five small predicate methods CombatSystem.ts uses
 * BEFORE executing an attack:
 *   - validateMeleeAttack: aggregate pre-attack validation that
 *     returns the resolved entities + typed IDs if the attack is
 *     allowed (also records anti-cheat violations on failure)
 *   - isWithinCombatRange: tile-based range check (cardinal-only
 *     for range 1, Chebyshev for 2+)
 *   - checkAttackCooldown: nextAttackTicks lookup + tick comparison
 *   - validateCombatActors: per-tick re-validation that both
 *     attacker and target still exist + are alive
 *   - validateAttackRange: tile-based range check used by the
 *     tick pipeline (no anti-cheat side-effects)
 *
 * Extracted from CombatSystem.ts as the seventh slice of the
 * system's decomposition (item #9 in PROGRESS_AUDIT, after the
 * six prior slices: CombatEventEmitter, CombatPlayerQueries,
 * CombatEventRecorder, CombatDamageOrchestrator, CombatDeathHandler,
 * CombatLifecycleHandler).
 *
 * checkRangeAndFollow is deferred — it depends on the in-progress
 * CombatSystem method getAttackTypeFromWeapon and on the
 * lastCombatTargetTile cache; will move with the tick-pipeline cluster.
 *
 * Coupling shape: 5 dep references injected at construction time.
 * The pooled tile objects (`_attackerTile`, `_targetTile`) are
 * shared mutable references with the host system — populated by
 * the helper during range checks and read elsewhere on the same
 * tick, which is safe because combat is single-threaded.
 */

import {
  type Entity,
  type EntityID,
  type PooledTile,
  tilePool,
  tilesWithinMeleeRange,
  createEntityID,
  getEntityPosition,
  isAttackOnCooldownTicks,
  isMobEntity,
} from "@hyperforge/shared";

import { MobEntity } from "../../entities/npc/MobEntity.js";

import type { CombatAntiCheat } from "./CombatAntiCheat";
import {
  CombatViolationSeverity,
  CombatViolationType,
} from "./CombatAntiCheat";
import type { CombatData } from "./CombatStateService";
import type { CombatEntityResolver } from "./CombatEntityResolver";
import type { CombatEventEmitter } from "./CombatEventEmitter";

/** Inbound payload for a melee attack request. */
export interface MeleeAttackData {
  attackerId: string;
  targetId: string;
  attackerType: "player" | "mob";
  targetType: "player" | "mob";
}

/** Result of pre-attack validation. */
export interface AttackValidationResult {
  valid: boolean;
  attacker: Entity | MobEntity | null;
  target: Entity | MobEntity | null;
  typedAttackerId: EntityID | null;
  typedTargetId: EntityID | null;
}

export class CombatAttackValidator {
  private readonly entityResolver: CombatEntityResolver;
  private readonly antiCheat: CombatAntiCheat;
  private readonly eventEmitter: CombatEventEmitter;
  private readonly nextAttackTicks: Map<EntityID, number>;
  private readonly attackerTile: PooledTile;
  private readonly targetTile: PooledTile;

  constructor(
    entityResolver: CombatEntityResolver,
    antiCheat: CombatAntiCheat,
    eventEmitter: CombatEventEmitter,
    nextAttackTicks: Map<EntityID, number>,
    attackerTile: PooledTile,
    targetTile: PooledTile,
  ) {
    this.entityResolver = entityResolver;
    this.antiCheat = antiCheat;
    this.eventEmitter = eventEmitter;
    this.nextAttackTicks = nextAttackTicks;
    this.attackerTile = attackerTile;
    this.targetTile = targetTile;
  }

  /**
   * Validate all preconditions for a melee attack.
   * Returns the resolved entities + typed IDs if valid, else an
   * invalid result. Records anti-cheat violations on failure paths
   * for player attackers.
   */
  validateMeleeAttack(
    data: MeleeAttackData,
    currentTick: number,
  ): AttackValidationResult {
    const { attackerId, targetId, attackerType, targetType } = data;
    const invalidResult: AttackValidationResult = {
      valid: false,
      attacker: null,
      target: null,
      typedAttackerId: null,
      typedTargetId: null,
    };

    const typedAttackerId = createEntityID(attackerId);
    const typedTargetId = createEntityID(targetId);

    const attacker = this.entityResolver.resolve(attackerId, attackerType);
    const target = this.entityResolver.resolve(targetId, targetType);

    if (!attacker || !target) {
      if (attackerType === "player" && !target) {
        this.antiCheat.recordNonexistentTargetAttack(
          attackerId,
          targetId,
          currentTick,
        );
      }
      return invalidResult;
    }

    if (!this.entityResolver.isAlive(attacker, attackerType)) {
      return invalidResult;
    }

    if (!this.entityResolver.isAlive(target, targetType)) {
      if (attackerType === "player") {
        this.antiCheat.recordDeadTargetAttack(
          attackerId,
          targetId,
          currentTick,
        );
      }
      return invalidResult;
    }

    if (targetType === "player" && target.data?.isLoading) {
      if (attackerType === "player") {
        this.antiCheat.recordViolation(
          attackerId,
          CombatViolationType.ATTACK_DURING_PROTECTION,
          CombatViolationSeverity.MODERATE,
          `Attacked player ${targetId} during loading protection`,
          targetId,
          currentTick,
        );
      }
      return invalidResult;
    }

    if (targetType === "mob" && isMobEntity(target)) {
      if (typeof target.isAttackable === "function" && !target.isAttackable()) {
        this.eventEmitter.emitAttackFailed(
          attackerId,
          targetId,
          "target_not_attackable",
        );
        return invalidResult;
      }
    }

    if (attackerId === targetId) {
      if (attackerType === "player") {
        this.antiCheat.recordSelfAttack(attackerId, currentTick);
      }
      return invalidResult;
    }

    if (
      !this.isWithinCombatRange(
        attacker,
        target,
        attackerType,
        data,
        currentTick,
      )
    ) {
      return invalidResult;
    }

    return {
      valid: true,
      attacker,
      target,
      typedAttackerId,
      typedTargetId,
    };
  }

  /**
   * Check if attacker is within combat range of target.
   *
   * Tile-based melee rules:
   * - Range 1 (standard melee): Cardinal only (N/S/E/W) — NO diagonal attacks
   * - Range 2+ (halberd): Allows diagonal attacks
   */
  isWithinCombatRange(
    attacker: Entity | MobEntity,
    target: Entity | MobEntity,
    attackerType: "player" | "mob",
    data: MeleeAttackData,
    currentTick: number,
  ): boolean {
    const attackerPos = getEntityPosition(attacker);
    const targetPos = getEntityPosition(target);
    if (!attackerPos || !targetPos) return false;

    tilePool.setFromPosition(this.attackerTile, attackerPos);
    tilePool.setFromPosition(this.targetTile, targetPos);
    const combatRangeTiles = this.entityResolver.getCombatRange(
      attacker,
      attackerType,
    );

    if (
      !tilesWithinMeleeRange(
        this.attackerTile,
        this.targetTile,
        combatRangeTiles,
      )
    ) {
      if (attackerType === "player") {
        const dx = Math.abs(this.attackerTile.x - this.targetTile.x);
        const dz = Math.abs(this.attackerTile.z - this.targetTile.z);
        const actualDistance = Math.max(dx, dz);
        this.antiCheat.recordOutOfRangeAttack(
          data.attackerId,
          data.targetId,
          actualDistance,
          combatRangeTiles,
          currentTick,
        );
      }

      this.eventEmitter.emitAttackFailed(
        data.attackerId,
        data.targetId,
        "out_of_range",
      );
      return false;
    }
    return true;
  }

  /** Check if attack is on cooldown. */
  checkAttackCooldown(typedAttackerId: EntityID, currentTick: number): boolean {
    const nextAllowedTick = this.nextAttackTicks.get(typedAttackerId) ?? 0;
    return !isAttackOnCooldownTicks(currentTick, nextAllowedTick);
  }

  /**
   * Validate combat actors still exist and are alive.
   * Per-tick re-validation; returns null if combat should naturally
   * time out.
   */
  validateCombatActors(
    combatState: CombatData,
  ): { attacker: Entity | MobEntity; target: Entity | MobEntity } | null {
    const attackerId = String(combatState.attackerId);
    const targetId = String(combatState.targetId);

    const attacker = this.entityResolver.resolve(
      attackerId,
      combatState.attackerType,
    );
    const target = this.entityResolver.resolve(
      targetId,
      combatState.targetType,
    );

    if (!attacker || !target) {
      return null;
    }

    if (!this.entityResolver.isAlive(attacker, combatState.attackerType)) {
      return null;
    }

    if (!this.entityResolver.isAlive(target, combatState.targetType)) {
      return null;
    }

    return { attacker, target };
  }

  /**
   * Validate attacker is within melee range of target.
   * No anti-cheat side-effects; used by the tick pipeline where
   * a follow-up will be issued instead of a violation record.
   */
  validateAttackRange(
    attacker: Entity | MobEntity,
    target: Entity | MobEntity,
    attackerType: "player" | "mob",
  ): boolean {
    const attackerPos = getEntityPosition(attacker);
    const targetPos = getEntityPosition(target);
    if (!attackerPos || !targetPos) return false;

    tilePool.setFromPosition(this.attackerTile, attackerPos);
    tilePool.setFromPosition(this.targetTile, targetPos);
    const combatRangeTiles = this.entityResolver.getCombatRange(
      attacker,
      attackerType,
    );

    return tilesWithinMeleeRange(
      this.attackerTile,
      this.targetTile,
      combatRangeTiles,
    );
  }
}
