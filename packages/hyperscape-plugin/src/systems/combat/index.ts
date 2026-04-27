/**
 * Combat Systems
 * Combat mechanics, aggro management, and death handling
 */

export * from "./CombatSystem";
// AggroSystem migrated to @hyperforge/hyperscape (2026-04-25)
// PlayerDeathSystem migrated to @hyperforge/hyperscape (2026-04-26).
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
// CombatAnimationSync removed 2026-04-27 — was never consumed.
export * from "./CombatAntiCheat";
// RangeSystem migrated to @hyperforge/hyperscape (2026-04-25)
export * from "./PidManager";
