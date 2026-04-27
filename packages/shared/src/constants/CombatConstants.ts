/**
 * Combat Constants — MANIFEST FAÇADE
 *
 * As of Phase A1 of PLAN_WORLD_STUDIO_AAA_COMPLETION.md, the source of truth
 * for every combat constant lives in `combat-constants.json`, validated at
 * module load time against `CombatManifestSchema` from `@hyperforge/manifest-schema`.
 *
 * The JSON authoritative copy is served from
 * `packages/server/world/assets/manifests/combat-constants.json` (editor-editable,
 * loaded at runtime). This TS file preserves the exact legacy export shape
 * (COMBAT_CONSTANTS / AGGRO_CONSTANTS / LEVEL_CONSTANTS / etc.) so the 55
 * existing consumers don't have to change.
 *
 * To tune combat values, edit the JSON — not this file. The JSON → façade
 * mapping below is deliberately mechanical.
 *
 * @see
 */

import { CombatManifestSchema } from "@hyperforge/manifest-schema";

import combatManifestJson from "./combat-constants.json" with { type: "json" };

const manifest = CombatManifestSchema.parse(combatManifestJson);

/**
 * Melee attack style determines which per-style attack/defence bonuses are used.
 * classic MMORPG: Each weapon type has a default style (e.g., swords slash, daggers stab).
 */
export type MeleeAttackStyle = "stab" | "slash" | "crush";

/** Default melee attack style per weapon type (tile-based-MMORPG-accurate) */
export const WEAPON_DEFAULT_ATTACK_STYLE: Record<string, MeleeAttackStyle> =
  Object.freeze({
    ...(manifest.weaponDefaultAttackStyle as Record<string, MeleeAttackStyle>),
  });

export const COMBAT_CONSTANTS = Object.freeze({
  // === Ranges (tiles) ===
  RANGED_RANGE: manifest.ranges.ranged,
  MAGIC_RANGE: manifest.ranges.magic,
  MELEE_RANGE_STANDARD: manifest.ranges.meleeStandard,
  MELEE_RANGE_HALBERD: manifest.ranges.meleeHalberd,
  PICKUP_RANGE: manifest.ranges.pickup,

  // === Tick System ===
  TICK_DURATION_MS: manifest.ticks.tickDurationMs,

  // === Combat Timing (ticks) ===
  DEFAULT_ATTACK_SPEED_TICKS: manifest.ticks.defaultAttackSpeedTicks,
  COMBAT_TIMEOUT_TICKS: manifest.ticks.combatTimeoutTicks,
  LOGOUT_PREVENTION_TICKS: manifest.ticks.logoutPreventionTicks,
  HEALTH_REGEN_COOLDOWN_TICKS: manifest.ticks.healthRegenCooldownTicks,
  HEALTH_REGEN_INTERVAL_TICKS: manifest.ticks.healthRegenIntervalTicks,
  AFK_DISABLE_RETALIATE_TICKS: manifest.ticks.afkDisableRetaliateTicks,

  // === Food Consumption (tile-based-MMORPG-accurate) ===
  EAT_DELAY_TICKS: manifest.food.eatDelayTicks,
  EAT_ATTACK_DELAY_TICKS: manifest.food.eatAttackDelayTicks,
  MAX_HEAL_AMOUNT: manifest.food.maxHealAmount,

  // === Hit Delay ===
  HIT_DELAY: Object.freeze({
    MELEE_BASE: manifest.hitDelay.meleeBase,
    RANGED_BASE: manifest.hitDelay.rangedBase,
    RANGED_DISTANCE_OFFSET: manifest.hitDelay.rangedDistanceOffset,
    RANGED_DISTANCE_DIVISOR: manifest.hitDelay.rangedDistanceDivisor,
    MAGIC_BASE: manifest.hitDelay.magicBase,
    MAGIC_DISTANCE_OFFSET: manifest.hitDelay.magicDistanceOffset,
    MAGIC_DISTANCE_DIVISOR: manifest.hitDelay.magicDistanceDivisor,
    MAX_HIT_DELAY: manifest.hitDelay.maxHitDelay,
  }),

  // === Projectile Launch Delays (ms) ===
  SPELL_LAUNCH_DELAY_MS: manifest.projectiles.spellLaunchDelayMs,
  ARROW_LAUNCH_DELAY_MS: manifest.projectiles.arrowLaunchDelayMs,

  // === Visual Rotation (client-side, exponential decay) ===
  ROTATION: Object.freeze({
    COMBAT_SLERP_SPEED: manifest.rotation.combatSlerpSpeed,
    MOVEMENT_SLERP_SPEED: manifest.rotation.movementSlerpSpeed,
    FACING_MAX_DISTANCE: manifest.rotation.facingMaxDistance,
    MIN_ROTATION_DISTANCE_SQ: manifest.rotation.minRotationDistanceSq,
  }),

  // === Animation ===
  ANIMATION: Object.freeze({
    HIT_FRAME_RATIO: manifest.animation.hitFrameRatio,
    MIN_ANIMATION_TICKS: manifest.animation.minAnimationTicks,
    HITSPLAT_DELAY_TICKS: manifest.animation.hitsplatDelayTicks,
    HITSPLAT_DURATION_TICKS: manifest.animation.hitsplatDurationTicks,
    EMOTE_COMBAT: manifest.animation.emoteCombat,
    EMOTE_SWORD_SWING: manifest.animation.emoteSwordSwing,
    EMOTE_2H_SLASH: manifest.animation.emote2hSlash,
    EMOTE_2H_IDLE: manifest.animation.emote2hIdle,
    EMOTE_RANGED: manifest.animation.emoteRanged,
    EMOTE_MAGIC: manifest.animation.emoteMagic,
    EMOTE_IDLE: manifest.animation.emoteIdle,
    CROSSFADE_DURATION: manifest.animation.crossfadeDuration,
  }),

  // === Death & Loot (ticks) ===
  RESPAWN_TICKS_RANDOMNESS: manifest.death.respawnTicksRandomness,
  GRAVESTONE_TICKS: manifest.death.gravestoneTicks,
  GROUND_ITEM_DESPAWN_TICKS: manifest.death.groundItemDespawnTicks,
  UNTRADEABLE_DESPAWN_TICKS: manifest.death.untradeableDespawnTicks,
  LOOT_PROTECTION_TICKS: manifest.death.lootProtectionTicks,
  CORPSE_DESPAWN_TICKS: manifest.death.corpseDespawnTicks,

  DEATH: Object.freeze({
    ANIMATION_TICKS: manifest.death.animationTicks,
    COOLDOWN_TICKS: manifest.death.cooldownTicks,
    RECONNECT_RESPAWN_DELAY_TICKS: manifest.death.reconnectRespawnDelayTicks,
    STALE_LOCK_AGE_TICKS: manifest.death.staleLockAgeTicks,
    DEFAULT_RESPAWN_POSITION: Object.freeze({
      x: manifest.death.defaultRespawnPosition.x,
      y: manifest.death.defaultRespawnPosition.y,
      z: manifest.death.defaultRespawnPosition.z,
    }),
    DEFAULT_RESPAWN_TOWN: manifest.death.defaultRespawnTown,
  }),

  // === Damage Formulas ===
  BASE_CONSTANT: manifest.damage.baseConstant,
  EFFECTIVE_LEVEL_CONSTANT: manifest.damage.effectiveLevelConstant,
  DAMAGE_DIVISOR: manifest.damage.damageDivisor,
  MIN_DAMAGE: manifest.damage.minDamage,
  MAX_DAMAGE: manifest.damage.maxDamage,

  // === XP per Damage ===
  XP: Object.freeze({
    COMBAT_XP_PER_DAMAGE: manifest.xp.combatXpPerDamage,
    HITPOINTS_XP_PER_DAMAGE: manifest.xp.hitpointsXpPerDamage,
    CONTROLLED_XP_PER_DAMAGE: manifest.xp.controlledXpPerDamage,
  }),

  COMBAT_STATES: Object.freeze({
    IDLE: "idle",
    IN_COMBAT: "in_combat",
    FLEEING: "fleeing",
  } as const),

  // === Manifest Defaults (fallback when not specified) ===
  DEFAULTS: Object.freeze({
    NPC: Object.freeze({
      ATTACK_SPEED_TICKS: manifest.npcDefaults.attackSpeedTicks,
      AGGRO_RANGE: manifest.npcDefaults.aggroRange,
      COMBAT_RANGE: manifest.npcDefaults.combatRange,
      LEASH_RANGE: manifest.npcDefaults.leashRange,
      RESPAWN_TICKS: manifest.npcDefaults.respawnTicks,
      WANDER_RADIUS: manifest.npcDefaults.wanderRadius,
    }),
    ITEM: Object.freeze({
      ATTACK_SPEED: manifest.itemDefaults.attackSpeed,
      ATTACK_RANGE: manifest.itemDefaults.attackRange,
    }),
  }),
});

export const AGGRO_CONSTANTS = Object.freeze({
  DEFAULT_BEHAVIOR: manifest.aggro.defaultBehavior,
  AGGRO_UPDATE_INTERVAL_MS: manifest.aggro.updateIntervalMs,
  ALWAYS_AGGRESSIVE_LEVEL: manifest.aggro.alwaysAggressiveLevel,
});

export const LEVEL_CONSTANTS = Object.freeze({
  DEFAULT_COMBAT_LEVEL: manifest.levels.defaultCombatLevel,
  MIN_COMBAT_LEVEL: manifest.levels.minCombatLevel,
  MAX_LEVEL: manifest.levels.maxLevel,

  XP_BASE: manifest.levels.xpBase,
  XP_GROWTH_FACTOR: manifest.levels.xpGrowthFactor,

  COMBAT_LEVEL_WEIGHTS: Object.freeze({
    DEFENSE_WEIGHT: manifest.levels.combatLevelWeights.defenseWeight,
    OFFENSE_WEIGHT: manifest.levels.combatLevelWeights.offenseWeight,
    RANGED_MULTIPLIER: manifest.levels.combatLevelWeights.rangedMultiplier,
  }),
});

export type CombatState =
  (typeof COMBAT_CONSTANTS.COMBAT_STATES)[keyof typeof COMBAT_CONSTANTS.COMBAT_STATES];

// ============================================================================
// Ranged & Magic Style Bonuses
// ============================================================================

export type RangedCombatStyle = "accurate" | "rapid" | "longrange";
export type MagicCombatStyle = "accurate" | "longrange" | "autocast";

export interface RangedStyleBonus {
  readonly attackBonus: number;
  readonly speedModifier: number;
  readonly rangeModifier: number;
  readonly xpSplit: "ranged" | "ranged_defence";
}

export interface MagicStyleBonus {
  readonly attackBonus: number;
  readonly speedModifier: number;
  readonly rangeModifier: number;
  readonly xpSplit: "magic" | "magic_defence";
}

function buildRangedStyleBonuses(): Readonly<
  Record<RangedCombatStyle, Readonly<RangedStyleBonus>>
> {
  const result: Partial<Record<RangedCombatStyle, Readonly<RangedStyleBonus>>> =
    {};
  for (const style of ["accurate", "rapid", "longrange"] as const) {
    const src = manifest.rangedStyleBonuses[style];
    if (!src) {
      throw new Error(
        `combat-constants.json is missing rangedStyleBonuses.${style}`,
      );
    }
    result[style] = Object.freeze({
      attackBonus: src.attackBonus,
      speedModifier: src.speedModifier,
      rangeModifier: src.rangeModifier,
      xpSplit: src.xpSplit as "ranged" | "ranged_defence",
    });
  }
  return Object.freeze(
    result as Record<RangedCombatStyle, Readonly<RangedStyleBonus>>,
  );
}

function buildMagicStyleBonuses(): Readonly<
  Record<MagicCombatStyle, Readonly<MagicStyleBonus>>
> {
  const result: Partial<Record<MagicCombatStyle, Readonly<MagicStyleBonus>>> =
    {};
  for (const style of ["accurate", "longrange", "autocast"] as const) {
    const src = manifest.magicStyleBonuses[style];
    if (!src) {
      throw new Error(
        `combat-constants.json is missing magicStyleBonuses.${style}`,
      );
    }
    result[style] = Object.freeze({
      attackBonus: src.attackBonus,
      speedModifier: src.speedModifier,
      rangeModifier: src.rangeModifier,
      xpSplit: src.xpSplit as "magic" | "magic_defence",
    });
  }
  return Object.freeze(
    result as Record<MagicCombatStyle, Readonly<MagicStyleBonus>>,
  );
}

/** Pre-allocated frozen style bonuses for ranged combat (tile-based-MMORPG-accurate) */
export const RANGED_STYLE_BONUSES = buildRangedStyleBonuses();

/** Pre-allocated frozen style bonuses for magic combat */
export const MAGIC_STYLE_BONUSES = buildMagicStyleBonuses();
