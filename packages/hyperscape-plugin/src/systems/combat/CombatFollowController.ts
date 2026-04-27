/**
 * CombatFollowController — tile-follow + weapon-attack-type lookup.
 *
 * Wraps two methods extracted from CombatSystem.ts:
 *
 *   - `getAttackTypeFromWeapon(attackerId)` — resolve the player's
 *     active attack type (MELEE / RANGED / MAGIC) from selected
 *     spell + equipped weapon. Always returns MELEE for mobs.
 *   - `checkRangeAndFollow(combatState, tickNumber)` — per-tick
 *     range check. Re-validates that both entities still exist + are
 *     alive, applies the PvP-zone safety check (player-vs-player +
 *     not in a streaming duel), and emits a follow event whenever
 *     the target moved or is out of range. Extends `combatEndTick`
 *     by one combat-timeout window when chasing.
 *
 * Extracted from CombatSystem.ts as the eighth slice of the system's
 * decomposition (item #9 in PROGRESS_AUDIT, after the seven prior
 * slices: CombatEventEmitter, CombatPlayerQueries, CombatEventRecorder,
 * CombatDamageOrchestrator, CombatDeathHandler, CombatLifecycleHandler,
 * CombatAttackValidator).
 *
 * Coupling shape: 6 dep references injected at construction time.
 * Two of them are closures because the underlying systems are late-
 * bound on CombatSystem (assigned during `start()` after world
 * lookups, not at construction time):
 *   - `getEquipmentSystem` — equipment lookup for weapon type
 *   - `getZoneDetectionSystem` — PvP zone safety check
 *
 * The `_attackerTile` / `_targetTile` pooled buffers and
 * `lastCombatTargetTile` cache Map are shared mutable refs with
 * the host system — populated/read by both the host and this
 * helper on the same tick, which is safe because combat is
 * single-threaded.
 */

import {
  AttackType,
  type Item,
  type ZoneDetectionSystemDuck,
  type PooledTile,
  getCombatTimeoutTicks,
  getEntityPosition,
  tilePool,
  tilesWithinMeleeRange,
  tilesWithinRange,
} from "@hyperforge/shared";

import type { CombatData } from "./CombatStateService";
import type { CombatEntityResolver } from "./CombatEntityResolver";
import type { CombatEventEmitter } from "./CombatEventEmitter";
import type { CombatPlayerQueries } from "./CombatPlayerQueries";

/** Equipment system surface needed for weapon-type lookup. */
interface EquipmentSystemDuck {
  getPlayerEquipment(playerId: string):
    | {
        weapon?: { item?: Item | null } | null;
      }
    | undefined;
}

export class CombatFollowController {
  private readonly entityResolver: CombatEntityResolver;
  private readonly eventEmitter: CombatEventEmitter;
  private readonly playerQueries: CombatPlayerQueries;
  private readonly attackerTile: PooledTile;
  private readonly targetTile: PooledTile;
  private readonly lastCombatTargetTile: Map<string, { x: number; z: number }>;
  private readonly getEquipmentSystem: () => EquipmentSystemDuck | undefined;
  private readonly getZoneDetectionSystem: () =>
    | ZoneDetectionSystemDuck
    | null
    | undefined;

  constructor(
    entityResolver: CombatEntityResolver,
    eventEmitter: CombatEventEmitter,
    playerQueries: CombatPlayerQueries,
    attackerTile: PooledTile,
    targetTile: PooledTile,
    lastCombatTargetTile: Map<string, { x: number; z: number }>,
    getEquipmentSystem: () => EquipmentSystemDuck | undefined,
    getZoneDetectionSystem: () => ZoneDetectionSystemDuck | null | undefined,
  ) {
    this.entityResolver = entityResolver;
    this.eventEmitter = eventEmitter;
    this.playerQueries = playerQueries;
    this.attackerTile = attackerTile;
    this.targetTile = targetTile;
    this.lastCombatTargetTile = lastCombatTargetTile;
    this.getEquipmentSystem = getEquipmentSystem;
    this.getZoneDetectionSystem = getZoneDetectionSystem;
  }

  /**
   * Resolve the active attack type from a player's loadout.
   * Selected spell wins (MAGIC), then equipped weapon's attackType
   * (RANGED), then weapon-type fallback (bow/crossbow → RANGED),
   * else MELEE.
   */
  getAttackTypeFromWeapon(attackerId: string): AttackType {
    const selectedSpell = this.playerQueries.getPlayerSelectedSpell(attackerId);
    if (selectedSpell) {
      return AttackType.MAGIC;
    }

    const equipmentSystem = this.getEquipmentSystem();
    if (!equipmentSystem) return AttackType.MELEE;

    const equipment = equipmentSystem.getPlayerEquipment(attackerId);
    const weapon = equipment?.weapon?.item;

    if (!weapon) return AttackType.MELEE;

    const attackType = weapon.attackType?.toLowerCase();
    const weaponType = weapon.weaponType?.toLowerCase();

    if (attackType === "ranged") {
      return AttackType.RANGED;
    }

    if (weaponType === "bow" || weaponType === "crossbow") {
      return AttackType.RANGED;
    }

    return AttackType.MELEE;
  }

  /**
   * Per-tick: chase the target if out of range, refresh follow path
   * if the target moved.
   *
   * Skips silently if either entity is missing or dead — this lets
   * combat time out naturally instead of extending it for invalid
   * targets. Also enforces the PvP-zone safety check: player-vs-player
   * combat outside a streaming duel does not extend timeout when the
   * attacker has crossed into a safe zone.
   */
  checkRangeAndFollow(combatState: CombatData, tickNumber: number): void {
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

    if (!attacker || !target) return;

    if (!this.entityResolver.isAlive(attacker, combatState.attackerType)) {
      return;
    }

    if (!this.entityResolver.isAlive(target, combatState.targetType)) {
      return;
    }

    if (
      combatState.attackerType === "player" &&
      combatState.targetType === "player"
    ) {
      const attackerInStreamingDuel =
        (attacker as { data?: { inStreamingDuel?: boolean } })?.data
          ?.inStreamingDuel === true;
      const targetInStreamingDuel =
        (target as { data?: { inStreamingDuel?: boolean } })?.data
          ?.inStreamingDuel === true;

      if (!attackerInStreamingDuel && !targetInStreamingDuel) {
        const zoneDetectionSystem = this.getZoneDetectionSystem();
        if (zoneDetectionSystem) {
          const attackerPos = getEntityPosition(attacker);
          if (
            attackerPos &&
            !zoneDetectionSystem.isPvPEnabled({
              x: attackerPos.x,
              z: attackerPos.z,
            })
          ) {
            return;
          }
        }
      }
    }

    const attackerPos = getEntityPosition(attacker);
    const targetPos = getEntityPosition(target);
    if (!attackerPos || !targetPos) return;

    tilePool.setFromPosition(this.attackerTile, attackerPos);
    tilePool.setFromPosition(this.targetTile, targetPos);
    const combatRangeTiles = this.entityResolver.getCombatRange(
      attacker,
      combatState.attackerType,
    );

    const attackType =
      combatState.attackerType === "player"
        ? this.getAttackTypeFromWeapon(attackerId)
        : AttackType.MELEE;

    const inRange =
      attackType === AttackType.MELEE
        ? tilesWithinMeleeRange(
            this.attackerTile,
            this.targetTile,
            combatRangeTiles,
          )
        : tilesWithinRange(
            this.attackerTile,
            this.targetTile,
            combatRangeTiles,
          );

    const lastKnown = this.lastCombatTargetTile.get(attackerId);
    const targetMoved =
      !lastKnown ||
      lastKnown.x !== this.targetTile.x ||
      lastKnown.z !== this.targetTile.z;

    if (targetMoved) {
      if (lastKnown) {
        lastKnown.x = this.targetTile.x;
        lastKnown.z = this.targetTile.z;
      } else {
        this.lastCombatTargetTile.set(attackerId, {
          x: this.targetTile.x,
          z: this.targetTile.z,
        });
      }
    }

    if (!inRange) {
      combatState.combatEndTick = tickNumber + getCombatTimeoutTicks();

      this.eventEmitter.emitFollowTarget(
        attackerId,
        targetId,
        targetPos,
        combatRangeTiles,
        attackType,
      );
    } else if (targetMoved) {
      this.eventEmitter.emitFollowTarget(
        attackerId,
        targetId,
        targetPos,
        combatRangeTiles,
        attackType,
      );
    }
  }
}
