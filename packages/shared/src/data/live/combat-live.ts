/**
 * Combat live-getters — PIE-hotreloadable view over Combat manifest.
 *
 * Prefers the current `combatProvider.getManifest()` when loaded; falls back
 * to the boot-captured `COMBAT_CONSTANTS` façade otherwise. Engine systems
 * (LootSystem, GroundItemSystem, MobNPCSystem, CombatSystem, …) read through
 * these getters so that PIE `updateManifests({ combat })` edits take effect
 * without a cold boot.
 *
 * Each getter narrows to the single field the call site needs to keep the
 * migration surface minimal and the fallback path explicit. Grow on demand
 * as call sites migrate.
 */

import { COMBAT_CONSTANTS } from "../../constants/CombatConstants";
import { combatProvider } from "../CombatProvider";

/** Ticks a dropped ground item persists before disappearing. */
export function getGroundItemDespawnTicks(): number {
  return (
    combatProvider.getManifest()?.death.groundItemDespawnTicks ??
    COMBAT_CONSTANTS.GROUND_ITEM_DESPAWN_TICKS
  );
}

/** Ticks an untradeable ground item persists (forced despawn). */
export function getUntradeableDespawnTicks(): number {
  return (
    combatProvider.getManifest()?.death.untradeableDespawnTicks ??
    COMBAT_CONSTANTS.UNTRADEABLE_DESPAWN_TICKS
  );
}

/** Ticks a ground item is owner-locked to the killer. */
export function getLootProtectionTicks(): number {
  return (
    combatProvider.getManifest()?.death.lootProtectionTicks ??
    COMBAT_CONSTANTS.LOOT_PROTECTION_TICKS
  );
}

/** Default NPC leash range (world units) when entity data omits it. */
export function getDefaultNpcLeashRange(): number {
  return (
    combatProvider.getManifest()?.npcDefaults.leashRange ??
    COMBAT_CONSTANTS.DEFAULTS.NPC.LEASH_RANGE
  );
}

/** Ticks a player must wait between consecutive food uses. */
export function getEatDelayTicks(): number {
  return (
    combatProvider.getManifest()?.food.eatDelayTicks ??
    COMBAT_CONSTANTS.EAT_DELAY_TICKS
  );
}

/** Extra attack cooldown added when eating in combat. */
export function getEatAttackDelayTicks(): number {
  return (
    combatProvider.getManifest()?.food.eatAttackDelayTicks ??
    COMBAT_CONSTANTS.EAT_ATTACK_DELAY_TICKS
  );
}

/** Hard cap on heal-per-food to prevent manifest-modification exploits. */
export function getMaxHealAmount(): number {
  return (
    combatProvider.getManifest()?.food.maxHealAmount ??
    COMBAT_CONSTANTS.MAX_HEAL_AMOUNT
  );
}

/** Ticks after last hit before a combatant is considered out of combat. */
export function getCombatTimeoutTicks(): number {
  return (
    combatProvider.getManifest()?.ticks.combatTimeoutTicks ??
    COMBAT_CONSTANTS.COMBAT_TIMEOUT_TICKS
  );
}

/** XP awarded per damage point for the selected combat skill (attack/strength/defence/ranged/magic). */
export function getCombatXpPerDamage(): number {
  return (
    combatProvider.getManifest()?.xp.combatXpPerDamage ??
    COMBAT_CONSTANTS.XP.COMBAT_XP_PER_DAMAGE
  );
}

/** XP awarded to Hitpoints per damage point dealt. */
export function getHitpointsXpPerDamage(): number {
  return (
    combatProvider.getManifest()?.xp.hitpointsXpPerDamage ??
    COMBAT_CONSTANTS.XP.HITPOINTS_XP_PER_DAMAGE
  );
}

/** XP awarded per damage point when Controlled attack style is selected (split across attack/strength/defence). */
export function getControlledXpPerDamage(): number {
  return (
    combatProvider.getManifest()?.xp.controlledXpPerDamage ??
    COMBAT_CONSTANTS.XP.CONTROLLED_XP_PER_DAMAGE
  );
}

/** Default ranged combat range (world tiles) when entity data omits it. */
export function getDefaultRangedRange(): number {
  return (
    combatProvider.getManifest()?.ranges.ranged ?? COMBAT_CONSTANTS.RANGED_RANGE
  );
}

/** Ground-item pickup range (world tiles). */
export function getPickupRange(): number {
  return (
    combatProvider.getManifest()?.ranges.pickup ?? COMBAT_CONSTANTS.PICKUP_RANGE
  );
}

/** Default magic combat range (world tiles) when entity data omits it. */
export function getDefaultMagicRange(): number {
  return (
    combatProvider.getManifest()?.ranges.magic ?? COMBAT_CONSTANTS.MAGIC_RANGE
  );
}

/** Milliseconds per server tick (canonical classic MMORPG cadence). */
export function getTickDurationMs(): number {
  return (
    combatProvider.getManifest()?.ticks.tickDurationMs ??
    COMBAT_CONSTANTS.TICK_DURATION_MS
  );
}

/** Default NPC attack speed (ticks) when entity data omits it. */
export function getDefaultNpcAttackSpeedTicks(): number {
  return (
    combatProvider.getManifest()?.npcDefaults.attackSpeedTicks ??
    COMBAT_CONSTANTS.DEFAULTS.NPC.ATTACK_SPEED_TICKS
  );
}

/** Wind-up before arrow projectile spawns (ms). */
export function getArrowLaunchDelayMs(): number {
  return (
    combatProvider.getManifest()?.projectiles.arrowLaunchDelayMs ??
    COMBAT_CONSTANTS.ARROW_LAUNCH_DELAY_MS
  );
}

/** Wind-up before spell projectile spawns (ms). */
export function getSpellLaunchDelayMs(): number {
  return (
    combatProvider.getManifest()?.projectiles.spellLaunchDelayMs ??
    COMBAT_CONSTANTS.SPELL_LAUNCH_DELAY_MS
  );
}

/**
 * Hit-delay block (formula constants for melee/ranged/magic + global max cap).
 * Shape matches legacy `COMBAT_CONSTANTS.HIT_DELAY` so callers can destructure
 * the same field names.
 */
export interface HitDelayConfig {
  readonly MELEE_BASE: number;
  readonly RANGED_BASE: number;
  readonly RANGED_DISTANCE_OFFSET: number;
  readonly RANGED_DISTANCE_DIVISOR: number;
  readonly MAGIC_BASE: number;
  readonly MAGIC_DISTANCE_OFFSET: number;
  readonly MAGIC_DISTANCE_DIVISOR: number;
  readonly MAX_HIT_DELAY: number;
}
/** Ticks after damage before HP regen resumes. */
export function getHealthRegenCooldownTicks(): number {
  return (
    combatProvider.getManifest()?.ticks.healthRegenCooldownTicks ??
    COMBAT_CONSTANTS.HEALTH_REGEN_COOLDOWN_TICKS
  );
}

/** Ticks between consecutive HP regen drips (classic MMORPG: 100 = 60s). */
export function getHealthRegenIntervalTicks(): number {
  return (
    combatProvider.getManifest()?.ticks.healthRegenIntervalTicks ??
    COMBAT_CONSTANTS.HEALTH_REGEN_INTERVAL_TICKS
  );
}

/** Default NPC aggro range (world tiles) when entity data omits it. */
export function getDefaultNpcAggroRange(): number {
  return (
    combatProvider.getManifest()?.npcDefaults.aggroRange ??
    COMBAT_CONSTANTS.DEFAULTS.NPC.AGGRO_RANGE
  );
}

/** Standard melee tile range (adjacent-tile combat). */
export function getMeleeRangeStandard(): number {
  return (
    combatProvider.getManifest()?.ranges.meleeStandard ??
    COMBAT_CONSTANTS.MELEE_RANGE_STANDARD
  );
}

/** Damage-formula "base constant" (classic MMORPG: +8 before multiplication). */
export function getDamageBaseConstant(): number {
  return (
    combatProvider.getManifest()?.damage.baseConstant ??
    COMBAT_CONSTANTS.BASE_CONSTANT
  );
}

/** Damage-formula "effective level constant" (classic MMORPG: +8 or +9). */
export function getEffectiveLevelConstant(): number {
  return (
    combatProvider.getManifest()?.damage.effectiveLevelConstant ??
    COMBAT_CONSTANTS.EFFECTIVE_LEVEL_CONSTANT
  );
}

/** Max-hit divisor in classic MMORPG damage formula (typically 640). */
export function getDamageDivisor(): number {
  return (
    combatProvider.getManifest()?.damage.damageDivisor ??
    COMBAT_CONSTANTS.DAMAGE_DIVISOR
  );
}

/** Ticks a gravestone persists at the death location. */
export function getGravestoneTicks(): number {
  return (
    combatProvider.getManifest()?.death.gravestoneTicks ??
    COMBAT_CONSTANTS.GRAVESTONE_TICKS
  );
}

/** Ticks the death animation runs before the player respawns. */
export function getDeathAnimationTicks(): number {
  return (
    combatProvider.getManifest()?.death.animationTicks ??
    COMBAT_CONSTANTS.DEATH.ANIMATION_TICKS
  );
}

/** Ticks of post-respawn invulnerability/cooldown. */
export function getDeathCooldownTicks(): number {
  return (
    combatProvider.getManifest()?.death.cooldownTicks ??
    COMBAT_CONSTANTS.DEATH.COOLDOWN_TICKS
  );
}

/** Ticks to wait before respawning on reconnect-in-death-state. */
export function getDeathReconnectRespawnDelayTicks(): number {
  return (
    combatProvider.getManifest()?.death.reconnectRespawnDelayTicks ??
    COMBAT_CONSTANTS.DEATH.RECONNECT_RESPAWN_DELAY_TICKS
  );
}

/** Ticks after which an orphaned death-lock is considered stale. */
export function getDeathStaleLockAgeTicks(): number {
  return (
    combatProvider.getManifest()?.death.staleLockAgeTicks ??
    COMBAT_CONSTANTS.DEATH.STALE_LOCK_AGE_TICKS
  );
}

/** Default respawn position (central haven) used as ultimate fallback. */
export function getDefaultRespawnPosition(): {
  readonly x: number;
  readonly y: number;
  readonly z: number;
} {
  return (
    combatProvider.getManifest()?.death.defaultRespawnPosition ??
    COMBAT_CONSTANTS.DEATH.DEFAULT_RESPAWN_POSITION
  );
}

/** Default respawn town name used as ultimate fallback. */
export function getDefaultRespawnTown(): string {
  return (
    combatProvider.getManifest()?.death.defaultRespawnTown ??
    COMBAT_CONSTANTS.DEATH.DEFAULT_RESPAWN_TOWN
  );
}

/** Default attack speed (ticks) when weapon/entity data omits it. */
export function getDefaultAttackSpeedTicks(): number {
  return (
    combatProvider.getManifest()?.ticks.defaultAttackSpeedTicks ??
    COMBAT_CONSTANTS.DEFAULT_ATTACK_SPEED_TICKS
  );
}

/**
 * Animation block (hit-frame / hitsplat timing + emote names).
 * Shape matches legacy `COMBAT_CONSTANTS.ANIMATION`.
 */
export interface AnimationConfig {
  readonly HIT_FRAME_RATIO: number;
  readonly MIN_ANIMATION_TICKS: number;
  readonly HITSPLAT_DELAY_TICKS: number;
  readonly HITSPLAT_DURATION_TICKS: number;
  readonly EMOTE_COMBAT: string;
  readonly EMOTE_SWORD_SWING: string;
  readonly EMOTE_2H_SLASH: string;
  readonly EMOTE_2H_IDLE: string;
  readonly EMOTE_RANGED: string;
  readonly EMOTE_MAGIC: string;
  readonly EMOTE_IDLE: string;
  readonly CROSSFADE_DURATION: number;
}
export function getAnimationConfig(): AnimationConfig {
  const a = combatProvider.getManifest()?.animation;
  if (!a) return COMBAT_CONSTANTS.ANIMATION;
  return {
    HIT_FRAME_RATIO: a.hitFrameRatio,
    MIN_ANIMATION_TICKS: a.minAnimationTicks,
    HITSPLAT_DELAY_TICKS: a.hitsplatDelayTicks,
    HITSPLAT_DURATION_TICKS: a.hitsplatDurationTicks,
    EMOTE_COMBAT: a.emoteCombat,
    EMOTE_SWORD_SWING: a.emoteSwordSwing,
    EMOTE_2H_SLASH: a.emote2hSlash,
    EMOTE_2H_IDLE: a.emote2hIdle,
    EMOTE_RANGED: a.emoteRanged,
    EMOTE_MAGIC: a.emoteMagic,
    EMOTE_IDLE: a.emoteIdle,
    CROSSFADE_DURATION: a.crossfadeDuration,
  };
}

export function getHitDelayConfig(): HitDelayConfig {
  const h = combatProvider.getManifest()?.hitDelay;
  if (!h) return COMBAT_CONSTANTS.HIT_DELAY;
  return {
    MELEE_BASE: h.meleeBase,
    RANGED_BASE: h.rangedBase,
    RANGED_DISTANCE_OFFSET: h.rangedDistanceOffset,
    RANGED_DISTANCE_DIVISOR: h.rangedDistanceDivisor,
    MAGIC_BASE: h.magicBase,
    MAGIC_DISTANCE_OFFSET: h.magicDistanceOffset,
    MAGIC_DISTANCE_DIVISOR: h.magicDistanceDivisor,
    MAX_HIT_DELAY: h.maxHitDelay,
  };
}

export function getAfkDisableRetaliateTicks(): number {
  return (
    combatProvider.getManifest()?.ticks.afkDisableRetaliateTicks ??
    COMBAT_CONSTANTS.AFK_DISABLE_RETALIATE_TICKS
  );
}

export function getLogoutPreventionTicks(): number {
  return (
    combatProvider.getManifest()?.ticks.logoutPreventionTicks ??
    COMBAT_CONSTANTS.LOGOUT_PREVENTION_TICKS
  );
}

export function getMovementSlerpSpeed(): number {
  return (
    combatProvider.getManifest()?.rotation.movementSlerpSpeed ??
    COMBAT_CONSTANTS.ROTATION.MOVEMENT_SLERP_SPEED
  );
}

export function getDefaultItemAttackRange(): number {
  return (
    combatProvider.getManifest()?.itemDefaults.attackRange ??
    COMBAT_CONSTANTS.DEFAULTS.ITEM.ATTACK_RANGE
  );
}

export function getDefaultNpcCombatRange(): number {
  return (
    combatProvider.getManifest()?.npcDefaults.combatRange ??
    COMBAT_CONSTANTS.DEFAULTS.NPC.COMBAT_RANGE
  );
}

export function getDefaultNpcRespawnTicks(): number {
  return (
    combatProvider.getManifest()?.npcDefaults.respawnTicks ??
    COMBAT_CONSTANTS.DEFAULTS.NPC.RESPAWN_TICKS
  );
}

/** Minimum damage a single hit can deal. */
export function getMinDamage(): number {
  return (
    combatProvider.getManifest()?.damage.minDamage ??
    COMBAT_CONSTANTS.MIN_DAMAGE
  );
}
