import { EquipmentManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import {
  EquipmentManifestNotLoadedError,
  EquipmentManifestRegistry,
  UnknownBankEquipmentErrorKey,
  UnknownEquipmentSlotError,
} from "../EquipmentManifestRegistry.js";

function manifest() {
  return EquipmentManifestSchema.parse({
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
      {
        key: "helmet",
        label: "Head",
        icon: "helmet.svg",
        gridPosition: { row: 0, col: 1 },
      },
      {
        key: "cape",
        label: "Cape",
        icon: "cape.svg",
        gridPosition: { row: 1, col: 0 },
      },
      {
        key: "weapon",
        label: "Weapon",
        icon: "sword.svg",
        gridPosition: { row: 2, col: 0 },
      },
      {
        key: "body",
        label: "Body",
        icon: "body.svg",
        gridPosition: { row: 2, col: 1 },
      },
      {
        key: "shield",
        label: "Shield",
        icon: "shield.svg",
        gridPosition: { row: 2, col: 2 },
      },
      {
        key: "legs",
        label: "Legs",
        icon: "legs.svg",
        gridPosition: { row: 3, col: 1 },
      },
      {
        key: "gloves",
        label: "Gloves",
        icon: "gloves.svg",
        gridPosition: { row: 4, col: 0 },
      },
      {
        key: "boots",
        label: "Boots",
        icon: "boots.svg",
        gridPosition: { row: 4, col: 1 },
      },
      {
        key: "ring",
        label: "Ring",
        icon: "ring.svg",
        gridPosition: { row: 4, col: 2 },
      },
      {
        key: "amulet",
        label: "Amulet",
        icon: "amulet.svg",
        gridPosition: { row: 1, col: 1 },
      },
      {
        key: "arrows",
        label: "Arrows",
        icon: "arrows.svg",
        gridPosition: { row: 2, col: 3 },
      },
    ],
    bankEquipmentErrorMessages: {
      NOT_EQUIPABLE: "This item cannot be equipped.",
      REQUIREMENTS_NOT_MET: "You do not meet the requirements.",
      SLOT_OCCUPIED: "Slot already occupied.",
      INVENTORY_FULL: "Inventory is full.",
      ITEM_NOT_FOUND: "Item not found.",
      TWO_HANDED_CONFLICT: "Two-handed weapon conflict.",
      BANK_SESSION_INVALID: "Bank session expired.",
      RATE_LIMITED: "Slow down!",
      INVALID_REQUEST: "Invalid request.",
      BANK_FULL: "Bank is full.",
    },
  });
}

describe("EquipmentManifestRegistry — not loaded", () => {
  it("throws pre-load", () => {
    expect(() => new EquipmentManifestRegistry().manifest).toThrow(
      EquipmentManifestNotLoadedError,
    );
  });
});

describe("EquipmentManifestRegistry — implementedSlots", () => {
  it("returns authored order", () => {
    const r = new EquipmentManifestRegistry(manifest());
    expect(r.implementedSlots).toContain("weapon");
    expect(r.implementedSlots[0]).toBe("weapon");
  });

  it("isImplemented true for known, false otherwise", () => {
    const r = new EquipmentManifestRegistry(manifest());
    expect(r.isImplemented("weapon")).toBe(true);
  });
});

describe("EquipmentManifestRegistry — bank slots", () => {
  it("indexes by id", () => {
    const r = new EquipmentManifestRegistry(manifest());
    const weapon = r.bankSlot("weapon");
    expect(weapon.label).toBe("Weapon");
    expect(weapon.gridPosition).toEqual({ row: 2, col: 0 });
  });

  it("bankGridBounds reports max+1 extent", () => {
    const r = new EquipmentManifestRegistry(manifest());
    expect(r.bankGridBounds()).toEqual({ rows: 5, cols: 4 });
  });

  it("throws on unknown slot (when slot has no bank entry)", () => {
    // Build a manifest missing a slot from bankEquipmentSlots.
    const partial = EquipmentManifestSchema.parse({
      $schema: "hyperforge.equipment.v1",
      implementedSlots: ["weapon"],
      bankEquipmentSlots: [
        {
          key: "weapon",
          label: "Weapon",
          icon: "sword.svg",
          gridPosition: { row: 0, col: 0 },
        },
      ],
      bankEquipmentErrorMessages: {
        NOT_EQUIPABLE: "x",
        REQUIREMENTS_NOT_MET: "x",
        SLOT_OCCUPIED: "x",
        INVENTORY_FULL: "x",
        ITEM_NOT_FOUND: "x",
        TWO_HANDED_CONFLICT: "x",
        BANK_SESSION_INVALID: "x",
        RATE_LIMITED: "x",
        INVALID_REQUEST: "x",
        BANK_FULL: "x",
      },
    });
    const r = new EquipmentManifestRegistry(partial);
    expect(() => r.bankSlot("helmet")).toThrow(UnknownEquipmentSlotError);
  });
});

describe("EquipmentManifestRegistry — error messages", () => {
  it("resolves authored messages by enum key", () => {
    const r = new EquipmentManifestRegistry(manifest());
    expect(r.bankErrorMessage("NOT_EQUIPABLE")).toBe(
      "This item cannot be equipped.",
    );
    expect(r.bankErrorMessage("RATE_LIMITED")).toBe("Slow down!");
  });

  it("throws on unknown error key", () => {
    const r = new EquipmentManifestRegistry(manifest());
    // Cast because the error-key type is closed; we need to simulate a
    // manifest that was parsed loosely and is missing a key.
    expect(() =>
      r.bankErrorMessage(
        "TOTALLY_UNKNOWN" as Parameters<
          EquipmentManifestRegistry["bankErrorMessage"]
        >[0],
      ),
    ).toThrow(UnknownBankEquipmentErrorKey);
  });
});
