/**
 * Interaction Systems
 * Player-world interactions, inventory actions, crafting, and physics
 *
 * NOTE: The main InteractionRouter is exported from systems/client/interaction/
 */

// InventoryInteractionSystem migrated to @hyperforge/hyperscape (2026-04-25)
// ProcessingSystem migrated to @hyperforge/hyperscape (2026-04-25)
export * from "./Physics";
// DialogueSystem migrated to @hyperforge/hyperscape (2026-04-25)
export * from "./WorldDialogueConditionEvaluators";

// ItemTargetingSystem + TargetValidator migrated to
// @hyperforge/hyperscape (2026-04-25 / 2026-04-26).

// Smelting/Smithing/Crafting/Fletching all migrated to
// @hyperforge/hyperscape (2026-04-24).

// TanningSystem migrated to @hyperforge/hyperscape (2026-04-24)
// — NPC tanner: hides → leather, classic MMORPG-specific gameplay.

// RunecraftingSystem migrated to @hyperforge/hyperscape (2026-04-24)
