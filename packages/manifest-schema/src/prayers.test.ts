import { describe, expect, it } from "vitest";

import { PrayersManifestSchema, type PrayersManifest } from "./prayers.js";

const hyperscapePrayers: PrayersManifest = {
  prayers: [
    {
      id: "thick_skin",
      name: "Thick Skin",
      description: "+5% defense",
      icon: "thick_skin.png",
      level: 1,
      category: "defensive",
      drainEffect: 1,
      bonuses: { defenseMultiplier: 1.05 },
      conflicts: ["rock_skin", "steel_skin"],
    },
    {
      id: "superhuman_strength",
      name: "Superhuman Strength",
      description: "+10% strength",
      icon: "superhuman_strength.png",
      level: 13,
      category: "offensive",
      drainEffect: 4,
      bonuses: { strengthMultiplier: 1.1 },
      conflicts: ["burst_of_strength", "ultimate_strength"],
    },
  ],
};

describe("PrayersManifestSchema", () => {
  it("parses a realistic manifest cleanly", () => {
    const result = PrayersManifestSchema.safeParse(hyperscapePrayers);
    if (!result.success) {
      throw new Error(
        `Prayers manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("rejects invalid prayer id format", () => {
    const bad = {
      prayers: [{ ...hyperscapePrayers.prayers[0], id: "Invalid-Capital" }],
    };
    expect(PrayersManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects level above 99", () => {
    const bad = {
      prayers: [{ ...hyperscapePrayers.prayers[0], level: 100 }],
    };
    expect(PrayersManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown category", () => {
    const bad = {
      prayers: [
        { ...hyperscapePrayers.prayers[0], category: "chaos" as never },
      ],
    };
    expect(PrayersManifestSchema.safeParse(bad).success).toBe(false);
  });
});
