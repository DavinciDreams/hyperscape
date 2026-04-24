/**
 * Faithfulness + defensiveness tests for `HousingManifestSchema`.
 */

import { describe, expect, it } from "vitest";

import { HousingManifestSchema, type HousingManifest } from "./housing.js";

const reference: HousingManifest = {
  enabled: true,
  maxPlotsPerCharacter: 1,
  maxPlotsPerAccount: 3,
  plotTypes: [
    {
      id: "apartmentSmall",
      name: "Small Apartment",
      description: "A starter unit in the shared hallway building.",
      iconId: "",
      category: "apartment",
      widthMeters: 8,
      depthMeters: 8,
      heightMeters: 4,
      slots: { interior: 50, exterior: 0, lighting: 4, customMedia: 0 },
      visitorCap: 8,
      purchaseCost: 50_000,
      purchaseCurrencyId: "gold",
      upkeepCost: 500,
      minCharacterLevel: 10,
      transferable: false,
      instanced: true,
    },
    {
      id: "manorLarge",
      name: "Large Manor",
      description: "Sprawling estate with grounds.",
      iconId: "",
      category: "manor",
      widthMeters: 40,
      depthMeters: 40,
      heightMeters: 20,
      slots: { interior: 400, exterior: 200, lighting: 20, customMedia: 0 },
      visitorCap: 30,
      purchaseCost: 5_000_000,
      purchaseCurrencyId: "gold",
      upkeepCost: 25_000,
      minCharacterLevel: 40,
      transferable: true,
      instanced: true,
    },
  ],
  customization: {
    allowDecoration: true,
    allowStructuralSkins: true,
    allowStructuralEdits: false,
    allowDecorationClipping: false,
    maxStackHeightMeters: 10,
    maxSessionMinutes: 120,
  },
  permissions: {
    maxCoOwners: 1,
    maxFriendEntries: 100,
    maxBlockEntries: 50,
    allowPublicListing: true,
    allowPublicBio: true,
    publicPlotsAutoOpenDoors: true,
  },
  upkeep: {
    cyclePeriodDays: 7,
    gracePeriodDays: 14,
    reclaimAfterDays: 30,
    returnDecorationsOnReclaim: true,
    sendUpkeepWarnings: true,
    upkeepWarningDaysAhead: 3,
  },
  visitors: {
    visitorsCanInteract: true,
    allowGuestbook: true,
    maxGuestbookEntries: 200,
    combatPolicy: "block",
  },
};

describe("HousingManifestSchema", () => {
  it("parses the reference manifest cleanly", () => {
    const result = HousingManifestSchema.safeParse(reference);
    if (!result.success) {
      throw new Error(
        `Reference manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("applies defaults on empty manifest (disabled)", () => {
    const parsed = HousingManifestSchema.parse({ enabled: false });
    expect(parsed.enabled).toBe(false);
    expect(parsed.plotTypes).toEqual([]);
    expect(parsed.maxPlotsPerCharacter).toBe(1);
    expect(parsed.maxPlotsPerAccount).toBe(3);
    expect(parsed.customization.allowDecoration).toBe(true);
    expect(parsed.permissions.maxCoOwners).toBe(1);
    expect(parsed.upkeep.cyclePeriodDays).toBe(7);
    expect(parsed.upkeep.reclaimAfterDays).toBe(30);
    expect(parsed.visitors.combatPolicy).toBe("block");
  });

  it("rejects enabled=true with empty plotTypes", () => {
    const bad = { enabled: true, plotTypes: [] };
    expect(HousingManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate plotType ids", () => {
    const bad = {
      enabled: true,
      plotTypes: [
        {
          id: "dup",
          name: "A",
          category: "apartment",
          widthMeters: 5,
          depthMeters: 5,
          slots: { interior: 10, exterior: 0 },
        },
        {
          id: "dup",
          name: "B",
          category: "apartment",
          widthMeters: 5,
          depthMeters: 5,
          slots: { interior: 10, exterior: 0 },
        },
      ],
    };
    expect(HousingManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects maxPlotsPerAccount < maxPlotsPerCharacter", () => {
    const bad = {
      enabled: false,
      maxPlotsPerCharacter: 5,
      maxPlotsPerAccount: 2,
    };
    expect(HousingManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts maxPlotsPerAccount == maxPlotsPerCharacter", () => {
    const ok = {
      enabled: false,
      maxPlotsPerCharacter: 3,
      maxPlotsPerAccount: 3,
    };
    expect(HousingManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects widthMeters > 500", () => {
    const bad = {
      enabled: true,
      plotTypes: [
        {
          id: "a",
          name: "A",
          category: "apartment",
          widthMeters: 999,
          depthMeters: 5,
          slots: { interior: 10, exterior: 0 },
        },
      ],
    };
    expect(HousingManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects widthMeters < 1", () => {
    const bad = {
      enabled: true,
      plotTypes: [
        {
          id: "a",
          name: "A",
          category: "apartment",
          widthMeters: 0,
          depthMeters: 5,
          slots: { interior: 10, exterior: 0 },
        },
      ],
    };
    expect(HousingManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown category", () => {
    const bad = {
      enabled: true,
      plotTypes: [
        {
          id: "a",
          name: "A",
          category: "volcanoLair",
          widthMeters: 5,
          depthMeters: 5,
          slots: { interior: 10, exterior: 0 },
        },
      ],
    };
    expect(HousingManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts all 6 categories", () => {
    const cats = [
      "apartment",
      "cottage",
      "manor",
      "estate",
      "openWorld",
      "guildHall",
    ];
    for (const cat of cats) {
      const ok = {
        enabled: true,
        plotTypes: [
          {
            id: `p${cat}`,
            name: cat,
            category: cat,
            widthMeters: 10,
            depthMeters: 10,
            slots: { interior: 10, exterior: 0 },
          },
        ],
      };
      expect(HousingManifestSchema.safeParse(ok).success).toBe(true);
    }
  });

  it("rejects bad plot id format", () => {
    const bad = {
      enabled: true,
      plotTypes: [
        {
          id: "Not Valid",
          name: "X",
          category: "apartment",
          widthMeters: 5,
          depthMeters: 5,
          slots: { interior: 10, exterior: 0 },
        },
      ],
    };
    expect(HousingManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects visitorCap > 200", () => {
    const bad = {
      enabled: true,
      plotTypes: [
        {
          id: "a",
          name: "A",
          category: "apartment",
          widthMeters: 5,
          depthMeters: 5,
          slots: { interior: 10, exterior: 0 },
          visitorCap: 999,
        },
      ],
    };
    expect(HousingManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects slots.interior > 10000", () => {
    const bad = {
      enabled: true,
      plotTypes: [
        {
          id: "a",
          name: "A",
          category: "apartment",
          widthMeters: 5,
          depthMeters: 5,
          slots: { interior: 99999, exterior: 0 },
        },
      ],
    };
    expect(HousingManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects reclaimAfterDays <= gracePeriodDays", () => {
    const bad = {
      enabled: false,
      upkeep: { gracePeriodDays: 30, reclaimAfterDays: 30 },
    };
    expect(HousingManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects reclaimAfterDays < gracePeriodDays", () => {
    const bad = {
      enabled: false,
      upkeep: { gracePeriodDays: 30, reclaimAfterDays: 5 },
    };
    expect(HousingManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts reclaimAfterDays > gracePeriodDays by 1", () => {
    const ok = {
      enabled: false,
      upkeep: { gracePeriodDays: 14, reclaimAfterDays: 15 },
    };
    expect(HousingManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("accepts cyclePeriodDays=0 (lifetime ownership)", () => {
    const ok = { enabled: false, upkeep: { cyclePeriodDays: 0 } };
    expect(HousingManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects unknown combat policy", () => {
    const bad = { enabled: false, visitors: { combatPolicy: "chaotic" } };
    expect(HousingManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts combatPolicy ownerChoice", () => {
    const ok = { enabled: false, visitors: { combatPolicy: "ownerChoice" } };
    expect(HousingManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects maxCoOwners > 10", () => {
    const bad = { enabled: false, permissions: { maxCoOwners: 99 } };
    expect(HousingManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects maxStackHeightMeters > 100", () => {
    const bad = {
      enabled: false,
      customization: { maxStackHeightMeters: 999 },
    };
    expect(HousingManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts maxSessionMinutes=0 (no cap)", () => {
    const ok = { enabled: false, customization: { maxSessionMinutes: 0 } };
    expect(HousingManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects slots.lighting > 200", () => {
    const bad = {
      enabled: true,
      plotTypes: [
        {
          id: "a",
          name: "A",
          category: "apartment",
          widthMeters: 5,
          depthMeters: 5,
          slots: { interior: 10, exterior: 0, lighting: 9999 },
        },
      ],
    };
    expect(HousingManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown top-level field (strict mode)", () => {
    const bad = { enabled: false, extra: "nope" };
    expect(HousingManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown field on upkeep (strict mode)", () => {
    const bad = { enabled: false, upkeep: { extra: "nope" } };
    expect(HousingManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects bad currencyId format", () => {
    const bad = {
      enabled: true,
      plotTypes: [
        {
          id: "a",
          name: "A",
          category: "apartment",
          widthMeters: 5,
          depthMeters: 5,
          slots: { interior: 10, exterior: 0 },
          purchaseCurrencyId: "Has Spaces",
        },
      ],
    };
    expect(HousingManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts instanced=false (open world)", () => {
    const ok = {
      enabled: true,
      plotTypes: [
        {
          id: "world1",
          name: "World Plot",
          category: "openWorld",
          widthMeters: 20,
          depthMeters: 20,
          slots: { interior: 50, exterior: 50 },
          instanced: false,
        },
      ],
    };
    expect(HousingManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("accepts transferable=false apartment", () => {
    const ok = {
      enabled: true,
      plotTypes: [
        {
          id: "a",
          name: "A",
          category: "apartment",
          widthMeters: 5,
          depthMeters: 5,
          slots: { interior: 10, exterior: 0 },
          transferable: false,
        },
      ],
    };
    expect(HousingManifestSchema.safeParse(ok).success).toBe(true);
  });
});
