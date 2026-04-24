/**
 * Combat Systems
 * Combat mechanics, aggro management, and death handling
 */

export * from "./CombatSystem";
export * from "./AggroSystem";
export * from "./PlayerDeathSystem";
// MobDeathSystem migrated to @hyperforge/hyperscape (2026-04-24)
// — first slice of the Hyperscape→meta-plugin extraction.

export * from "./CombatStateService";
export * from "./CombatEntityResolver";
export * from "./DamageCalculator";
export * from "./RangedDamageCalculator";
export * from "./MagicDamageCalculator";
export * from "./AmmunitionService";
export * from "./RuneService";
export * from "./SpellService";
export * from "./ProjectileService";
export * from "./CombatAnimationManager";
export * from "./CombatRotationManager";
export * from "./CombatAnimationSync";
export * from "./CombatAntiCheat";
export * from "./RangeSystem";
export * from "./PidManager";
