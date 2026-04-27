/**
 * Game mechanics types
 * Combat, inventory, items, interaction, spawning, resource processing, trading
 */

export * from "./combat-types";
export * from "./inventory-types";
export * from "./item-types";
// interaction-types deleted 2026-04-27 (top-10 #8 cleanup) — dead code,
// no consumers. The class InteractableEntity in entities/ is unrelated.
export * from "./resource-processing-types";
export * from "./prayer-types";
// quest-types migrated to @hyperforge/hyperscape-plugin/types/quest-types
// 2026-04-27 (top-10 #8 cleanup).
export * from "./trade-types";
export * from "./social-types";
export * from "./duel-types";
