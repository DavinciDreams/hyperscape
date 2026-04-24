import { describe, expect, it } from "vitest";

import { DuelManifestSchema, type DuelManifest } from "./duel.js";

const hyperscapeDuel: DuelManifest = {
  $schema: "hyperforge.duel.v1",
  challengeTimeoutMs: 30000,
  rules: {
    noRanged: {
      label: "No Ranged",
      description: "Cannot use ranged attacks",
      incompatibleWith: [],
    },
    noForfeit: {
      label: "No Forfeit",
      description: "Fight to the death",
      incompatibleWith: ["funWeapons", "noMovement"],
    },
  },
  equipmentSlots: {
    head: { label: "Head", order: 0 },
    weapon: { label: "Weapon", order: 3 },
  },
  duelSlotToEquipmentSlot: {
    head: "helmet",
    weapon: "weapon",
    ammo: "arrows",
  },
};

describe("DuelManifestSchema", () => {
  it("parses a realistic manifest cleanly", () => {
    const result = DuelManifestSchema.safeParse(hyperscapeDuel);
    if (!result.success) {
      throw new Error(
        `Duel manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("rejects zero challenge timeout", () => {
    const bad = { ...hyperscapeDuel, challengeTimeoutMs: 0 };
    expect(DuelManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects equipment slot with negative order", () => {
    const bad = {
      ...hyperscapeDuel,
      equipmentSlots: {
        head: { label: "Head", order: -1 },
      },
    };
    expect(DuelManifestSchema.safeParse(bad).success).toBe(false);
  });
});
