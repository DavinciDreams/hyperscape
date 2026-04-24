/**
 * Equipment Constants — MANIFEST FAÇADE
 *
 * As of Phase A6 of PLAN_WORLD_STUDIO_AAA_COMPLETION.md, the canonical list
 * of currently-implemented equipment slots lives in
 * `equipment-constants.json` (`implementedSlots`), validated at module
 * load time against `EquipmentManifestSchema` from
 * `@hyperforge/manifest-schema`.
 *
 * This TS file preserves the exact legacy export shape
 * (`EQUIPMENT_SLOT_NAMES` as a tuple of `EquipmentSlotName` enum values)
 * so the existing consumers (persistence, stats, UI) don't have to change.
 * A runtime integrity check asserts the JSON list matches the
 * TypeScript-enum-backed tuple below.
 *
 * Single source of truth for equipment slot definitions.
 */

import { EquipmentManifestSchema } from "@hyperforge/manifest-schema";

import { EquipmentSlotName } from "../types/game/item-types";
import equipmentManifestJson from "./equipment-constants.json" with { type: "json" };

const manifest = EquipmentManifestSchema.parse(equipmentManifestJson);

/**
 * All equipment slot names.
 * Used for iteration across equipment systems (persistence, stats, UI).
 */
export const EQUIPMENT_SLOT_NAMES = [
  EquipmentSlotName.WEAPON,
  EquipmentSlotName.SHIELD,
  EquipmentSlotName.HELMET,
  EquipmentSlotName.BODY,
  EquipmentSlotName.LEGS,
  EquipmentSlotName.BOOTS,
  EquipmentSlotName.GLOVES,
  EquipmentSlotName.CAPE,
  EquipmentSlotName.AMULET,
  EquipmentSlotName.RING,
  EquipmentSlotName.ARROWS,
] as const;

// Runtime integrity check: manifest.implementedSlots must match the hardcoded
// tuple above in both contents and order. Fails fast at module load if drift
// is introduced.
{
  const manifestSlots = manifest.implementedSlots;
  if (manifestSlots.length !== EQUIPMENT_SLOT_NAMES.length) {
    throw new Error(
      `EquipmentConstants drift: manifest has ${manifestSlots.length} slots, tuple has ${EQUIPMENT_SLOT_NAMES.length}`,
    );
  }
  for (let i = 0; i < manifestSlots.length; i++) {
    if (manifestSlots[i] !== EQUIPMENT_SLOT_NAMES[i]) {
      throw new Error(
        `EquipmentConstants drift at slot ${i}: manifest="${manifestSlots[i]}" tuple="${EQUIPMENT_SLOT_NAMES[i]}"`,
      );
    }
  }
}

/**
 * Type for currently implemented equipment slots
 */
export type ImplementedEquipmentSlot = (typeof EQUIPMENT_SLOT_NAMES)[number];

/**
 * Number of currently implemented equipment slots
 */
export const EQUIPMENT_SLOT_COUNT = EQUIPMENT_SLOT_NAMES.length;
