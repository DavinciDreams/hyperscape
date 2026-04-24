/**
 * Equipment manifest schema.
 *
 * Source of truth for the equipment slot definitions and bank-equipment
 * UI/error constants previously hardcoded in
 * `packages/shared/src/constants/EquipmentConstants.ts` and
 * `packages/shared/src/constants/BankEquipmentConstants.ts`. Extracted as
 * part of Phase A6 of `PLAN_WORLD_STUDIO_AAA_COMPLETION.md`.
 *
 * This manifest controls:
 *   - the set of equipment slot ids the game actually implements
 *   - the bank equipment UI grid layout (labels, icons, positions)
 *   - the player-facing error messages for bank-equipment operations
 *
 * Enum values (e.g. `BankEquipmentError.NOT_EQUIPABLE`) remain TypeScript
 * enums because they are used as code-level identifiers; the manifest
 * supplies the human-facing message for each enum key.
 */

import { z } from "zod";

/** Known equipment slot ids. Matches `EquipmentSlotName` enum values. */
export const EquipmentSlotIdSchema = z.enum([
  "weapon",
  "shield",
  "helmet",
  "body",
  "legs",
  "boots",
  "gloves",
  "cape",
  "amulet",
  "ring",
  "arrows",
]);
export type EquipmentSlotId = z.infer<typeof EquipmentSlotIdSchema>;

export const GridPositionSchema = z.object({
  row: z.number().int().nonnegative(),
  col: z.number().int().nonnegative(),
});
export type GridPosition = z.infer<typeof GridPositionSchema>;

export const BankEquipmentSlotDefSchema = z.object({
  key: EquipmentSlotIdSchema,
  label: z.string().min(1),
  icon: z.string().min(1),
  gridPosition: GridPositionSchema,
});
export type BankEquipmentSlotDef = z.infer<typeof BankEquipmentSlotDefSchema>;

/** Error keys match the `BankEquipmentError` enum. */
export const BankEquipmentErrorKeySchema = z.enum([
  "NOT_EQUIPABLE",
  "REQUIREMENTS_NOT_MET",
  "SLOT_OCCUPIED",
  "INVENTORY_FULL",
  "ITEM_NOT_FOUND",
  "TWO_HANDED_CONFLICT",
  "BANK_SESSION_INVALID",
  "RATE_LIMITED",
  "INVALID_REQUEST",
  "BANK_FULL",
]);
export type BankEquipmentErrorKey = z.infer<typeof BankEquipmentErrorKeySchema>;

export const BankEquipmentErrorMessagesSchema = z.record(
  BankEquipmentErrorKeySchema,
  z.string().min(1),
);
export type BankEquipmentErrorMessages = z.infer<
  typeof BankEquipmentErrorMessagesSchema
>;

export const EquipmentManifestSchema = z.object({
  $schema: z.literal("hyperforge.equipment.v1"),

  /** Currently implemented equipment slot ids, in iteration order. */
  implementedSlots: z.array(EquipmentSlotIdSchema).min(1),

  /** Bank equipment UI grid layout. */
  bankEquipmentSlots: z.array(BankEquipmentSlotDefSchema).min(1),

  /** User-facing message per `BankEquipmentError` enum key. */
  bankEquipmentErrorMessages: BankEquipmentErrorMessagesSchema,
});
export type EquipmentManifest = z.infer<typeof EquipmentManifestSchema>;
