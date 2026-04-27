/**
 * SmithingConstants — MANIFEST FAÇADE
 *
 * As of Phase A5 of PLAN_WORLD_STUDIO_AAA_COMPLETION.md, the source of truth
 * for smithing/smelting mechanic constants lives in
 * `smithing-constants.json`, validated at module load time against
 * `SmithingManifestSchema` from `@hyperforge/manifest-schema`.
 *
 * The JSON authoritative copy is served from
 * `packages/server/world/assets/manifests/smithing-constants.json`
 * (editor-editable, loaded at runtime). This TS file preserves the exact
 * legacy export shape (`SMITHING_CONSTANTS`, helper functions, type
 * guards) so the existing consumers don't have to change.
 *
 * @see  for tick timing
 */

import { SmithingManifestSchema } from "@hyperforge/manifest-schema";

import { COMBAT_CONSTANTS } from "./CombatConstants";
import smithingManifestJson from "./smithing-constants.json" with { type: "json" };

const manifest = SmithingManifestSchema.parse(smithingManifestJson);

export const SMITHING_CONSTANTS = Object.freeze({
  // Item IDs
  HAMMER_ITEM_ID: manifest.items.hammerItemId,
  COAL_ITEM_ID: manifest.items.coalItemId,

  // Tick-based timing defaults (used when manifest doesn't specify)
  // classic MMORPG: smelting and smithing both take 4 ticks
  DEFAULT_SMELTING_TICKS: manifest.timing.defaultSmeltingTicks,
  DEFAULT_SMITHING_TICKS: manifest.timing.defaultSmithingTicks,

  // Tick duration (from CombatConstants for consistency)
  TICK_DURATION_MS: COMBAT_CONSTANTS.TICK_DURATION_MS,

  // Input validation limits
  MAX_QUANTITY: manifest.validation.maxQuantity,
  MIN_QUANTITY: manifest.validation.minQuantity,
  MAX_ITEM_ID_LENGTH: manifest.validation.maxItemIdLength,

  // Messages - Smelting & Smithing
  MESSAGES: Object.freeze({
    // Smelting messages
    ALREADY_SMELTING: manifest.messages.alreadySmelting,
    NO_ITEMS: manifest.messages.noItems,
    NO_ORES: manifest.messages.noOres,
    INVALID_BAR: manifest.messages.invalidBar,
    LEVEL_TOO_LOW_SMELT: manifest.messages.levelTooLowSmelt,
    SMELTING_START: manifest.messages.smeltingStart,
    OUT_OF_MATERIALS: manifest.messages.outOfMaterials,
    SMELT_SUCCESS: manifest.messages.smeltSuccess,
    IRON_SMELT_FAIL: manifest.messages.ironSmeltFail,

    // Smithing messages
    ALREADY_SMITHING: manifest.messages.alreadySmithing,
    NO_HAMMER: manifest.messages.noHammer,
    NO_BARS: manifest.messages.noBars,
    INVALID_RECIPE: manifest.messages.invalidRecipe,
    LEVEL_TOO_LOW_SMITH: manifest.messages.levelTooLowSmith,
    SMITHING_START: manifest.messages.smithingStart,
    OUT_OF_BARS: manifest.messages.outOfBars,
    SMITH_SUCCESS: manifest.messages.smithSuccess,
  }),
});

/**
 * Helper function to format messages with placeholders
 * @param message - Message template with {placeholder} syntax
 * @param values - Object with placeholder values
 */
export function formatMessage(
  message: string,
  values: Record<string, string | number>,
): string {
  let result = message;
  for (const [key, value] of Object.entries(values)) {
    result = result.replace(`{${key}}`, String(value));
  }
  return result;
}

/**
 * Sanitize an item ID for safe logging (prevents log injection)
 */
export function sanitizeForLogging(input: string): string {
  return input.replace(/[^\w_-]/g, "");
}

/**
 * Validate and clamp quantity to safe bounds
 */
export function clampQuantity(quantity: unknown): number {
  if (typeof quantity !== "number" || !Number.isFinite(quantity)) {
    return SMITHING_CONSTANTS.MIN_QUANTITY;
  }
  return Math.floor(
    Math.max(
      SMITHING_CONSTANTS.MIN_QUANTITY,
      Math.min(quantity, SMITHING_CONSTANTS.MAX_QUANTITY),
    ),
  );
}

/**
 * Validate a string ID (barItemId, furnaceId, recipeId, anvilId)
 */
export function isValidItemId(id: unknown): id is string {
  return (
    typeof id === "string" &&
    id.length > 0 &&
    id.length <= SMITHING_CONSTANTS.MAX_ITEM_ID_LENGTH
  );
}

/**
 * Loose inventory item type - matches items from inventory lookups
 * where quantity may be undefined (defaults to 1)
 */
export interface LooseInventoryItem {
  itemId: string;
  quantity?: number;
  slot?: number;
  metadata?: Record<string, unknown> | null;
}

/**
 * Type guard to validate an object is a valid inventory item
 * Validates structure, allows missing quantity (defaults to 1)
 */
export function isLooseInventoryItem(
  item: unknown,
): item is LooseInventoryItem {
  if (typeof item !== "object" || item === null) return false;
  if (!("itemId" in item)) return false;
  if (typeof (item as LooseInventoryItem).itemId !== "string") return false;

  // quantity is optional, but if present must be a number
  const qty = (item as LooseInventoryItem).quantity;
  if (qty !== undefined && typeof qty !== "number") return false;

  return true;
}

/**
 * Get quantity from an inventory item, defaulting to 1 if not present
 */
export function getItemQuantity(item: LooseInventoryItem): number {
  return item.quantity ?? 1;
}

/**
 * Convert ticks to milliseconds for setTimeout scheduling
 * @param ticks - Number of game ticks (1 tick = 600ms in classic MMORPG)
 */
export function ticksToMs(ticks: number): number {
  return ticks * SMITHING_CONSTANTS.TICK_DURATION_MS;
}

// ============================================================================
// PLAYER SKILLS TYPE GUARDS
// ============================================================================

/**
 * Skill data structure with level and XP
 */
export interface SkillLevelData {
  level: number;
  xp?: number;
}

/**
 * Entity that has skills (player or NPC with skill levels)
 */
export interface EntityWithSkills {
  id: string;
  skills?: {
    smithing?: SkillLevelData;
    [key: string]: SkillLevelData | undefined;
  };
}

/**
 * Type guard to check if an entity has a valid skills object.
 * Use this instead of loose type assertions like `player as { skills?: ... }`.
 *
 * @param entity - The entity to check
 * @returns true if entity has a valid skills structure
 */
export function hasSkills(entity: unknown): entity is EntityWithSkills {
  if (!entity || typeof entity !== "object") return false;
  if (!("id" in entity) || typeof (entity as EntityWithSkills).id !== "string")
    return false;

  const skills = (entity as EntityWithSkills).skills;
  if (skills === undefined) return true; // skills is optional
  if (typeof skills !== "object" || skills === null) return false;

  return true;
}

/**
 * Get smithing level from an entity safely.
 * Returns the smithing level if available, or the default (1) if not.
 *
 * @param entity - The entity to get smithing level from
 * @param defaultLevel - Default level to return if not found (default: 1)
 * @returns The entity's smithing level
 */
export function getSmithingLevelSafe(
  entity: unknown,
  defaultLevel = 1,
): number {
  if (!hasSkills(entity)) return defaultLevel;
  return entity.skills?.smithing?.level ?? defaultLevel;
}
