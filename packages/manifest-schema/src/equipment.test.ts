/**
 * Faithfulness test: an equipment manifest built from the values currently
 * hardcoded in `EquipmentConstants.ts` + `BankEquipmentConstants.ts` MUST
 * parse cleanly.
 */

import { describe, expect, it } from "vitest";

import {
  EquipmentManifestSchema,
  type EquipmentManifest,
} from "./equipment.js";

const hyperscapeEquipmentManifest: EquipmentManifest = {
  $schema: "hyperforge.equipment.v1",
  implementedSlots: [
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
  ],
  bankEquipmentSlots: [
    // Row 0
    {
      key: "amulet",
      label: "Neck",
      icon: "amulet",
      gridPosition: { row: 0, col: 0 },
    },
    {
      key: "helmet",
      label: "Head",
      icon: "helmet",
      gridPosition: { row: 0, col: 1 },
    },
    {
      key: "cape",
      label: "Cape",
      icon: "cape",
      gridPosition: { row: 0, col: 2 },
    },
    // Row 1
    {
      key: "weapon",
      label: "Weapon",
      icon: "weapon",
      gridPosition: { row: 1, col: 0 },
    },
    {
      key: "body",
      label: "Body",
      icon: "body",
      gridPosition: { row: 1, col: 1 },
    },
    {
      key: "shield",
      label: "Shield",
      icon: "shield",
      gridPosition: { row: 1, col: 2 },
    },
    // Row 2
    {
      key: "gloves",
      label: "Hands",
      icon: "gloves",
      gridPosition: { row: 2, col: 0 },
    },
    {
      key: "legs",
      label: "Legs",
      icon: "legs",
      gridPosition: { row: 2, col: 1 },
    },
    {
      key: "boots",
      label: "Feet",
      icon: "boots",
      gridPosition: { row: 2, col: 2 },
    },
    // Row 3
    {
      key: "ring",
      label: "Ring",
      icon: "ring",
      gridPosition: { row: 3, col: 0 },
    },
    {
      key: "arrows",
      label: "Ammo",
      icon: "arrows",
      gridPosition: { row: 3, col: 2 },
    },
  ],
  bankEquipmentErrorMessages: {
    NOT_EQUIPABLE: "This item cannot be equipped.",
    REQUIREMENTS_NOT_MET:
      "You do not meet the requirements to equip this item.",
    SLOT_OCCUPIED: "That equipment slot is occupied.",
    INVENTORY_FULL: "Your inventory is full.",
    ITEM_NOT_FOUND: "Item not found in bank.",
    TWO_HANDED_CONFLICT:
      "You cannot equip a shield while wielding a two-handed weapon.",
    BANK_SESSION_INVALID: "Bank session expired. Please reopen the bank.",
    RATE_LIMITED: "Too many requests. Please slow down.",
    INVALID_REQUEST: "Invalid request.",
    BANK_FULL: "Your bank is full.",
  },
};

describe("EquipmentManifestSchema", () => {
  it("parses the Hyperscape reference manifest cleanly", () => {
    const result = EquipmentManifestSchema.safeParse(
      hyperscapeEquipmentManifest,
    );
    if (!result.success) {
      throw new Error(
        `Hyperscape equipment manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("rejects wrong schema version", () => {
    const wrong = {
      ...hyperscapeEquipmentManifest,
      $schema: "hyperforge.equipment.v0",
    };
    const result = EquipmentManifestSchema.safeParse(wrong);
    expect(result.success).toBe(false);
  });

  it("rejects unknown slot id", () => {
    const bad = {
      ...hyperscapeEquipmentManifest,
      implementedSlots: [
        ...hyperscapeEquipmentManifest.implementedSlots,
        "tail",
      ],
    };
    const result = EquipmentManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects unknown error key", () => {
    const bad = {
      ...hyperscapeEquipmentManifest,
      bankEquipmentErrorMessages: {
        ...hyperscapeEquipmentManifest.bankEquipmentErrorMessages,
        BOGUS: "bad",
      },
    };
    const result = EquipmentManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});
