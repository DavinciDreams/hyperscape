/**
 * Bank Equipment Constants — MANIFEST FAÇADE
 *
 * As of Phase A6 of PLAN_WORLD_STUDIO_AAA_COMPLETION.md, the UI grid
 * layout and error messages for the bank equipment view live in
 * `equipment-constants.json`, validated at module load time against
 * `EquipmentManifestSchema` from `@hyperforge/manifest-schema`.
 *
 * This TS file preserves the exact legacy export shape
 * (`BankEquipmentError` enum, `BANK_EQUIPMENT_SLOT_DEFS`,
 * `VALID_EQUIPMENT_SLOT_KEYS`, `BANK_EQUIPMENT_SLOT_NAMES`,
 * `BANK_EQUIPMENT_ERROR_MESSAGES`, `EquipmentSlotDefinition`) so the
 * existing consumers don't have to change. Slots are pre-frozen at module
 * load to preserve the "no per-render allocation" property of the
 * original.
 *
 * The `BankEquipmentError` enum remains a TypeScript enum because its
 * values are used as code-level identifiers; the manifest supplies the
 * human-facing message for each enum key.
 */

import { EquipmentManifestSchema } from "@hyperforge/manifest-schema";

import equipmentManifestJson from "./equipment-constants.json" with { type: "json" };

const manifest = EquipmentManifestSchema.parse(equipmentManifestJson);

// ============================================================================
// ERROR CODES (defined here to avoid circular dependency with bank-equipment.ts)
// ============================================================================

/**
 * Bank equipment operation errors
 */
export enum BankEquipmentError {
  NOT_EQUIPABLE = "NOT_EQUIPABLE",
  REQUIREMENTS_NOT_MET = "REQUIREMENTS_NOT_MET",
  SLOT_OCCUPIED = "SLOT_OCCUPIED",
  INVENTORY_FULL = "INVENTORY_FULL",
  ITEM_NOT_FOUND = "ITEM_NOT_FOUND",
  TWO_HANDED_CONFLICT = "TWO_HANDED_CONFLICT",
  BANK_SESSION_INVALID = "BANK_SESSION_INVALID",
  RATE_LIMITED = "RATE_LIMITED",
  INVALID_REQUEST = "INVALID_REQUEST",
  BANK_FULL = "BANK_FULL",
}

// ============================================================================
// SLOT DEFINITIONS
// ============================================================================

export interface EquipmentSlotDefinition {
  readonly key: string;
  readonly label: string;
  readonly icon: string;
  readonly gridPosition: { readonly row: number; readonly col: number };
}

/**
 * Immutable equipment slot definitions - allocated once at module load
 * Used by client BankEquipmentView to avoid per-render allocations
 *
 * Grid Layout (4 rows x 3 cols):
 * Row 0: [amulet] [helmet] [cape]
 * Row 1: [weapon] [body]   [shield]
 * Row 2: [gloves] [legs]   [boots]
 * Row 3: [ring]   [empty]  [arrows]
 */
export const BANK_EQUIPMENT_SLOT_DEFS: ReadonlyArray<EquipmentSlotDefinition> =
  Object.freeze(
    manifest.bankEquipmentSlots.map((slot) =>
      Object.freeze({
        key: slot.key,
        label: slot.label,
        icon: slot.icon,
        gridPosition: Object.freeze({
          row: slot.gridPosition.row,
          col: slot.gridPosition.col,
        }),
      }),
    ),
  );

/**
 * Set of valid equipment slot keys for O(1) lookup
 */
export const VALID_EQUIPMENT_SLOT_KEYS: ReadonlySet<string> = Object.freeze(
  new Set(BANK_EQUIPMENT_SLOT_DEFS.map((s) => s.key)),
);

/**
 * Array of equipment slot names for iteration
 */
export const BANK_EQUIPMENT_SLOT_NAMES: ReadonlyArray<string> = Object.freeze(
  BANK_EQUIPMENT_SLOT_DEFS.map((s) => s.key),
);

// ============================================================================
// ERROR MESSAGES
// ============================================================================

/**
 * Pre-allocated error messages to avoid string allocation on every error.
 * Sourced from the manifest at module load and frozen. Fails fast at
 * module load if any enum key is missing a message in the JSON.
 */
export const BANK_EQUIPMENT_ERROR_MESSAGES: Readonly<
  Record<BankEquipmentError, string>
> = (() => {
  const messages: Partial<Record<BankEquipmentError, string>> = {};
  for (const enumKey of Object.values(BankEquipmentError)) {
    const message = manifest.bankEquipmentErrorMessages[enumKey];
    if (message === undefined) {
      throw new Error(
        `BankEquipmentConstants drift: manifest is missing message for enum key "${enumKey}"`,
      );
    }
    messages[enumKey] = message;
  }
  return Object.freeze(messages as Record<BankEquipmentError, string>);
})();
