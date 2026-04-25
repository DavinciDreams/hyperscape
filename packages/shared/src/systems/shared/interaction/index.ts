/**
 * Interaction Systems
 * Player-world interactions, inventory actions, crafting, and physics
 *
 * NOTE: The main InteractionRouter is exported from systems/client/interaction/
 */

export * from "./InventoryInteractionSystem";
export * from "./ProcessingSystem";
export * from "./Physics";
// DialogueSystem migrated to @hyperforge/hyperscape (2026-04-25)
export * from "./WorldDialogueConditionEvaluators";

// Item Targeting System (for "Use X on Y" interactions)
export * from "./ItemTargetingSystem";
export * from "./TargetValidator";

// Smelting/Smithing/Crafting/Fletching all migrated to
// @hyperforge/hyperscape (2026-04-24).

// TanningSystem migrated to @hyperforge/hyperscape (2026-04-24)
// — NPC tanner: hides → leather, OSRS-specific gameplay.

// RunecraftingSystem migrated to @hyperforge/hyperscape (2026-04-24)
