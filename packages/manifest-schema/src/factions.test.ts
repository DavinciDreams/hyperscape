/**
 * Faithfulness + defensiveness tests for `FactionsManifestSchema`.
 */

import { describe, expect, it } from "vitest";

import { FactionsManifestSchema, type FactionsManifest } from "./factions.js";

const reference: FactionsManifest = {
  factions: [
    {
      id: "cityGuard",
      name: "City Guard",
      description: "Defenders of Varrock.",
      iconId: "icon.cityGuard",
      startingStanding: 0,
      tiers: [
        {
          id: "hated",
          name: "Hated",
          minStanding: -10_000,
          maxStanding: -5_000,
          vendorPriceMultiplier: 0,
          npcsAttackOnSight: true,
          questsUnlocked: false,
          shopUnlocked: false,
        },
        {
          id: "disliked",
          name: "Disliked",
          minStanding: -5_000,
          maxStanding: 0,
          vendorPriceMultiplier: 1.5,
          npcsAttackOnSight: false,
          questsUnlocked: false,
          shopUnlocked: true,
        },
        {
          id: "neutral",
          name: "Neutral",
          minStanding: 0,
          maxStanding: 3_000,
          vendorPriceMultiplier: 1,
          npcsAttackOnSight: false,
          questsUnlocked: false,
          shopUnlocked: true,
        },
        {
          id: "trusted",
          name: "Trusted",
          minStanding: 3_000,
          maxStanding: 10_000,
          vendorPriceMultiplier: 0.9,
          npcsAttackOnSight: false,
          questsUnlocked: true,
          shopUnlocked: true,
        },
        {
          id: "exalted",
          name: "Exalted",
          minStanding: 10_000,
          maxStanding: 50_000,
          vendorPriceMultiplier: 0.75,
          npcsAttackOnSight: false,
          questsUnlocked: true,
          shopUnlocked: true,
        },
      ],
      color: "#3a6fce",
      playerJoinable: false,
      hidden: false,
    },
    {
      id: "thieves",
      name: "Thieves' Guild",
      description: "Shadowy criminal fraternity.",
      iconId: "icon.thieves",
      startingStanding: -1_000,
      tiers: [
        {
          id: "outsider",
          name: "Outsider",
          minStanding: -5_000,
          maxStanding: 0,
          vendorPriceMultiplier: 2,
          npcsAttackOnSight: false,
          questsUnlocked: false,
          shopUnlocked: false,
        },
        {
          id: "contact",
          name: "Contact",
          minStanding: 0,
          maxStanding: 10_000,
          vendorPriceMultiplier: 1,
          npcsAttackOnSight: false,
          questsUnlocked: true,
          shopUnlocked: true,
        },
      ],
      color: "",
      playerJoinable: true,
      hidden: false,
    },
  ],
  relationships: [
    {
      a: "cityGuard",
      b: "thieves",
      disposition: "hostile",
      mutuallyExclusiveRep: true,
    },
  ],
};

describe("FactionsManifestSchema", () => {
  it("parses the reference manifest cleanly", () => {
    const result = FactionsManifestSchema.safeParse(reference);
    if (!result.success) {
      throw new Error(
        `Reference manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("applies defaults on a minimal faction", () => {
    const parsed = FactionsManifestSchema.parse({
      factions: [
        {
          id: "solo",
          name: "Solo Faction",
          tiers: [
            { id: "only", name: "Only", minStanding: 0, maxStanding: 100 },
          ],
        },
      ],
    });
    expect(parsed.relationships).toEqual([]);
    expect(parsed.factions[0].color).toBe("");
    expect(parsed.factions[0].playerJoinable).toBe(false);
    expect(parsed.factions[0].hidden).toBe(false);
    expect(parsed.factions[0].startingStanding).toBe(0);
    expect(parsed.factions[0].tiers[0].vendorPriceMultiplier).toBe(1);
    expect(parsed.factions[0].tiers[0].npcsAttackOnSight).toBe(false);
  });

  it("rejects empty factions array", () => {
    expect(FactionsManifestSchema.safeParse({ factions: [] }).success).toBe(
      false,
    );
  });

  it("rejects empty tiers array", () => {
    const bad = {
      factions: [{ id: "x", name: "X", tiers: [] }],
    };
    expect(FactionsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate faction ids", () => {
    const bad = {
      factions: [
        {
          id: "dup",
          name: "A",
          tiers: [{ id: "t", name: "T", minStanding: 0, maxStanding: 100 }],
        },
        {
          id: "dup",
          name: "B",
          tiers: [{ id: "t", name: "T", minStanding: 0, maxStanding: 100 }],
        },
      ],
    };
    expect(FactionsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate tier ids within a faction", () => {
    const bad = {
      factions: [
        {
          id: "x",
          name: "X",
          tiers: [
            { id: "t", name: "T", minStanding: 0, maxStanding: 100 },
            { id: "t", name: "T2", minStanding: 100, maxStanding: 200 },
          ],
        },
      ],
    };
    expect(FactionsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects tier with minStanding >= maxStanding", () => {
    const bad = {
      factions: [
        {
          id: "x",
          name: "X",
          tiers: [{ id: "t", name: "T", minStanding: 100, maxStanding: 100 }],
        },
      ],
    };
    expect(FactionsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects non-tiling tiers (gap between tiers)", () => {
    const bad = {
      factions: [
        {
          id: "x",
          name: "X",
          tiers: [
            { id: "a", name: "A", minStanding: 0, maxStanding: 100 },
            { id: "b", name: "B", minStanding: 200, maxStanding: 300 },
          ],
        },
      ],
    };
    expect(FactionsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects non-tiling tiers (overlap between tiers)", () => {
    const bad = {
      factions: [
        {
          id: "x",
          name: "X",
          tiers: [
            { id: "a", name: "A", minStanding: 0, maxStanding: 200 },
            { id: "b", name: "B", minStanding: 100, maxStanding: 300 },
          ],
        },
      ],
    };
    expect(FactionsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts contiguous tiers (sorted or unsorted author order)", () => {
    const ok = {
      factions: [
        {
          id: "x",
          name: "X",
          tiers: [
            { id: "b", name: "B", minStanding: 100, maxStanding: 200 },
            { id: "a", name: "A", minStanding: 0, maxStanding: 100 },
          ],
        },
      ],
    };
    expect(FactionsManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects startingStanding outside all tier ranges", () => {
    const bad = {
      factions: [
        {
          id: "x",
          name: "X",
          startingStanding: 500,
          tiers: [{ id: "a", name: "A", minStanding: 0, maxStanding: 100 }],
        },
      ],
    };
    expect(FactionsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects relationship referring to unknown faction", () => {
    const bad = {
      factions: [
        {
          id: "known",
          name: "Known",
          tiers: [{ id: "t", name: "T", minStanding: 0, maxStanding: 100 }],
        },
      ],
      relationships: [{ a: "known", b: "ghost", disposition: "hostile" }],
    };
    expect(FactionsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects self-relationship (a === b)", () => {
    const bad = {
      factions: [
        {
          id: "x",
          name: "X",
          tiers: [{ id: "t", name: "T", minStanding: 0, maxStanding: 100 }],
        },
      ],
      relationships: [{ a: "x", b: "x", disposition: "allied" }],
    };
    expect(FactionsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate unordered relationships", () => {
    const bad = {
      factions: [
        {
          id: "a",
          name: "A",
          tiers: [{ id: "t", name: "T", minStanding: 0, maxStanding: 100 }],
        },
        {
          id: "b",
          name: "B",
          tiers: [{ id: "t", name: "T", minStanding: 0, maxStanding: 100 }],
        },
      ],
      relationships: [
        { a: "a", b: "b", disposition: "hostile" },
        { a: "b", b: "a", disposition: "allied" },
      ],
    };
    expect(FactionsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown disposition", () => {
    const bad = {
      factions: [
        {
          id: "a",
          name: "A",
          tiers: [{ id: "t", name: "T", minStanding: 0, maxStanding: 100 }],
        },
        {
          id: "b",
          name: "B",
          tiers: [{ id: "t", name: "T", minStanding: 0, maxStanding: 100 }],
        },
      ],
      relationships: [{ a: "a", b: "b", disposition: "lovestruck" }],
    };
    expect(FactionsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects invalid faction id format", () => {
    const bad = {
      factions: [
        {
          id: "Has Spaces",
          name: "Bad",
          tiers: [{ id: "t", name: "T", minStanding: 0, maxStanding: 100 }],
        },
      ],
    };
    expect(FactionsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects malformed color (non-hex)", () => {
    const bad = {
      factions: [
        {
          id: "x",
          name: "X",
          color: "blue",
          tiers: [{ id: "t", name: "T", minStanding: 0, maxStanding: 100 }],
        },
      ],
    };
    expect(FactionsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts empty color (renderer default)", () => {
    const ok = {
      factions: [
        {
          id: "x",
          name: "X",
          color: "",
          tiers: [{ id: "t", name: "T", minStanding: 0, maxStanding: 100 }],
        },
      ],
    };
    expect(FactionsManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects vendorPriceMultiplier > 10", () => {
    const bad = {
      factions: [
        {
          id: "x",
          name: "X",
          tiers: [
            {
              id: "t",
              name: "T",
              minStanding: 0,
              maxStanding: 100,
              vendorPriceMultiplier: 50,
            },
          ],
        },
      ],
    };
    expect(FactionsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts mutuallyExclusiveRep on relationship", () => {
    const ok = {
      factions: [
        {
          id: "a",
          name: "A",
          tiers: [{ id: "t", name: "T", minStanding: 0, maxStanding: 100 }],
        },
        {
          id: "b",
          name: "B",
          tiers: [{ id: "t", name: "T", minStanding: 0, maxStanding: 100 }],
        },
      ],
      relationships: [
        { a: "a", b: "b", disposition: "at-war", mutuallyExclusiveRep: true },
      ],
    };
    expect(FactionsManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("accepts hidden + non-joinable faction (e.g. internal tutorial faction)", () => {
    const ok = {
      factions: [
        {
          id: "tutorial",
          name: "Tutorial",
          hidden: true,
          playerJoinable: false,
          tiers: [{ id: "t", name: "T", minStanding: 0, maxStanding: 100 }],
        },
      ],
    };
    expect(FactionsManifestSchema.safeParse(ok).success).toBe(true);
  });
});
