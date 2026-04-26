/**
 * CombatAttackContext - Interface for attack handlers to interact with CombatSystem.
 *
 * Attack handlers (Melee, Ranged, Magic) receive this context to access
 * the subset of CombatSystem they need without coupling to the full class.
 */

import type { World } from "@hyperforge/shared";
import type { SystemLogger } from "@hyperforge/shared";
import type { CombatAntiCheat } from "../CombatAntiCheat";
import type { EntityIdValidator } from "../EntityIdValidator";
import type { CombatRateLimiter } from "../CombatRateLimiter";
import type { CombatEntityResolver } from "../CombatEntityResolver";
import type { CombatAnimationManager } from "../CombatAnimationManager";
import type { CombatRotationManager } from "../CombatRotationManager";
import type { ProjectileService } from "../ProjectileService";
// PlayerSystem migrated to @hyperforge/hyperscape (2026-04-26, Wave 5d).
interface PlayerSystem {
  getPlayer(id: string): { alive?: boolean } | undefined;
  getPlayerAutoRetaliate(id: string): boolean;
  getPlayerAttackStyle?(id: string): { id: string } | undefined;
  damagePlayer(id: string, amount: number, source?: string): boolean;
}
// PrayerSystem migrated to @hyperforge/hyperscape (2026-04-25).
// AttackContext only carries the reference; downstream handlers may
// call `getCombinedBonuses(playerId)`. Local duck-typed shape avoids
// a forward dep on the plugin.
import type { PrayerBonuses } from "@hyperforge/shared";
interface PrayerSystemLike {
  getCombinedBonuses(playerId: string): Partial<PrayerBonuses>;
}
// EquipmentSystem migrated to @hyperforge/hyperscape (2026-04-26, Wave 5b).
import type { PlayerEquipment } from "@hyperforge/shared";
interface EquipmentSystemDuck {
  getPlayerEquipment(playerId: string): PlayerEquipment | undefined;
}
// InventorySystem migrated to @hyperforge/hyperscape (2026-04-26, Wave 5c).
import type { PlayerInventory } from "@hyperforge/shared";
interface InventorySystemDuck {
  hasItem(playerId: string, itemId: string, quantity?: number): boolean;
  getInventory(playerId: string): PlayerInventory | undefined;
  removeItemDirect(
    playerId: string,
    item: { itemId: string; quantity: number; slot?: number },
  ): Promise<boolean>;
}
import type { TerrainSystem } from "@hyperforge/shared";
import type { PooledTile } from "@hyperforge/shared";
import type { EntityID } from "@hyperforge/shared";
import type { AttackType } from "@hyperforge/shared";
import type { Entity } from "@hyperforge/shared";
import type { MobEntity } from "@hyperforge/shared";
import type { CombatStyle } from "@hyperforge/shared";
import type { Item, EquipmentSlot } from "@hyperforge/shared";

/** Equipment stats cache entry shape */
export interface EquipmentStatsCache {
  attack: number;
  strength: number;
  defense: number;
  ranged: number;
  rangedAttack: number;
  rangedStrength: number;
  magicAttack: number;
  magicDefense: number;
  defenseStab: number;
  defenseSlash: number;
  defenseCrush: number;
  defenseRanged: number;
  attackStab: number;
  attackSlash: number;
  attackCrush: number;
}

/** Attack data structure for melee validation and execution */
export interface MeleeAttackData {
  attackerId: string;
  targetId: string;
  attackerType: "player" | "mob";
  targetType: "player" | "mob";
}

/** Result of attack validation */
export interface AttackValidationResult {
  valid: boolean;
  attacker: Entity | MobEntity | null;
  target: Entity | MobEntity | null;
  typedAttackerId: EntityID | null;
  typedTargetId: EntityID | null;
}

/**
 * The subset of CombatSystem that attack handlers need.
 * CombatSystem implements this interface and passes itself to handlers.
 */
export interface CombatAttackContext {
  // Core
  readonly world: World;
  readonly logger: SystemLogger;
  readonly antiCheat: CombatAntiCheat;
  readonly entityIdValidator: EntityIdValidator;
  readonly rateLimiter: CombatRateLimiter;
  readonly entityResolver: CombatEntityResolver;

  // Combat services
  readonly animationManager: CombatAnimationManager;
  readonly rotationManager: CombatRotationManager;
  readonly projectileService: ProjectileService;

  // Cached systems
  playerSystem?: PlayerSystem;
  prayerSystem?: PrayerSystemLike | null;
  equipmentSystem?: EquipmentSystemDuck;
  inventorySystem?: InventorySystemDuck;
  terrainSystem?: TerrainSystem;

  // Mutable state
  nextAttackTicks: Map<EntityID, number>;
  readonly playerEquipmentStats: Map<string, EquipmentStatsCache>;
  readonly _attackerTile: PooledTile;
  readonly _targetTile: PooledTile;

  // Delegated methods
  validateAttackerPosition(
    attackerId: string,
    targetId: string,
    attackType: string,
    currentTick: number,
  ): boolean;
  checkAttackCooldown(typedAttackerId: EntityID, currentTick: number): boolean;
  applyDamage(
    targetId: string,
    targetType: "player" | "mob",
    damage: number,
    attackerId: string,
  ): void;
  enterCombat(
    attackerId: EntityID,
    targetId: EntityID,
    speed: number,
    type?: AttackType,
  ): void;
  emitTypedEvent(type: string, data: Record<string, unknown>): void;
  calculateMeleeDamage(
    attacker: Entity | MobEntity,
    target: Entity | MobEntity,
    style: CombatStyle,
  ): number;

  // Mob fallback: ranged/magic handlers call this when mobs attack (F2P mobs use melee)
  handleMeleeAttack(data: MeleeAttackData): void;

  // Shared accessors used by multiple handlers
  getPlayerSkillLevel(
    playerId: string,
    skill: "ranged" | "magic" | "defense",
  ): number;
  getEquippedWeapon(playerId: string): Item | null;
  getEquippedArrows(playerId: string): EquipmentSlot | null;
}

// Shared utilities used by multiple attack handlers
import { getEntityPosition } from "@hyperforge/shared";
import { tilePool } from "@hyperforge/shared";
import { tileChebyshevDistance } from "@hyperforge/shared";
import { EventType } from "@hyperforge/shared";
import { createEntityID } from "@hyperforge/shared";
import { getNPCById } from "@hyperforge/shared";
import type { NPCData } from "@hyperforge/shared";
import type { Position3D } from "@hyperforge/shared";

/**
 * Shared projectile range check for Ranged and Magic handlers.
 * Eliminates code duplication between RangedAttackHandler and MagicAttackHandler.
 *
 * @returns The Chebyshev distance if in range, or -1 if out of range (event already emitted).
 */
export function checkProjectileRange(
  ctx: CombatAttackContext,
  attackerId: string,
  targetId: string,
  attacker: Entity | MobEntity,
  target: Entity | MobEntity,
  attackRange: number,
): number {
  const attackerPos = getEntityPosition(attacker);
  const targetPos = getEntityPosition(target);
  if (!attackerPos || !targetPos) return -1;

  tilePool.setFromPosition(ctx._attackerTile, attackerPos);
  tilePool.setFromPosition(ctx._targetTile, targetPos);
  const distance = tileChebyshevDistance(ctx._attackerTile, ctx._targetTile);

  if (distance > attackRange || distance === 0) {
    ctx.emitTypedEvent(EventType.COMBAT_ATTACK_FAILED, {
      attackerId,
      targetId,
      reason: "out_of_range",
    });
    return -1;
  }

  return distance;
}

/**
 * Result of prepareMobAttack — all validated state needed for a mob projectile attack.
 * Returned by prepareMobAttack() if all preconditions pass, null otherwise.
 */
export interface MobAttackContext {
  attacker: Entity | MobEntity;
  target: Entity | MobEntity;
  attackerId: string;
  targetId: string;
  attackerType: "player" | "mob";
  targetType: "player" | "mob";
  typedAttackerId: EntityID;
  npcData: NPCData;
  attackerPos: Position3D;
  targetPos: Position3D;
  distance: number;
  currentTick: number;
  attackSpeedTicks: number;
}

/**
 * Shared mob projectile attack preparation for Magic and Ranged handlers.
 * Validates entities, resolves NPC data, checks range/cooldown, faces target, plays animation.
 *
 * @returns MobAttackContext if all checks pass, null if any fail (attack aborted).
 */
export function prepareMobAttack(
  ctx: CombatAttackContext,
  data: {
    attackerId: string;
    targetId: string;
    attackerType: "mob";
    targetType: "player" | "mob";
  },
  combatRange: number,
  animationType: "melee" | "ranged" | "magic",
  fallbackAttackSpeed: number,
  preResolved?: { attacker: MobEntity; npcData: NPCData },
): MobAttackContext | null {
  const { attackerId, targetId, attackerType, targetType } = data;
  const currentTick = ctx.world.currentTick ?? 0;

  // Resolve attacker — skip if caller already resolved
  let attacker: Entity | MobEntity | null;
  let npcData: NPCData | null;
  if (preResolved) {
    attacker = preResolved.attacker;
    npcData = preResolved.npcData;
  } else {
    attacker = ctx.entityResolver.resolve(attackerId, attackerType);
    if (!attacker) return null;
    const mobEntity = attacker as MobEntity;
    const mobData = mobEntity.getMobData();
    npcData = getNPCById(mobData.type);
    if (!npcData) return null;
  }

  // Resolve target
  const target = ctx.entityResolver.resolve(targetId, targetType);
  if (!target) return null;

  // Check both are alive
  if (
    !ctx.entityResolver.isAlive(attacker, attackerType) ||
    !ctx.entityResolver.isAlive(target, targetType)
  ) {
    return null;
  }

  // Range check
  const mobCombatRange = Math.max(
    1,
    Math.floor(npcData.combat.combatRange ?? combatRange),
  );
  const distance = checkProjectileRange(
    ctx,
    attackerId,
    targetId,
    attacker,
    target,
    mobCombatRange,
  );
  if (distance < 0) return null;

  // Get positions
  const attackerPos = getEntityPosition(attacker);
  const targetPos = getEntityPosition(target);
  if (!attackerPos || !targetPos) return null;

  // Check cooldown
  const typedAttackerId = createEntityID(attackerId);
  if (!ctx.checkAttackCooldown(typedAttackerId, currentTick)) {
    return null;
  }

  // Attack speed from NPC manifest
  const attackSpeedTicks = Math.max(
    1,
    npcData.combat.attackSpeedTicks ?? fallbackAttackSpeed,
  );

  // Claim cooldown slot
  ctx.nextAttackTicks.set(typedAttackerId, currentTick + attackSpeedTicks);

  // Face target
  ctx.rotationManager.rotateTowardsTarget(
    attackerId,
    targetId,
    attackerType,
    targetType,
  );

  // Play animation
  ctx.animationManager.setCombatEmote(
    attackerId,
    attackerType,
    currentTick,
    attackSpeedTicks,
    animationType,
  );

  return {
    attacker,
    target,
    attackerId,
    targetId,
    attackerType,
    targetType,
    typedAttackerId,
    npcData,
    attackerPos,
    targetPos,
    distance,
    currentTick,
    attackSpeedTicks,
  };
}
