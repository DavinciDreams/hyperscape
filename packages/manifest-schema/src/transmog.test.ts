/**
 * Faithfulness + defensiveness tests for `TransmogManifestSchema`.
 */

import { describe, expect, it } from "vitest";

import { TransmogManifestSchema, type TransmogManifest } from "./transmog.js";

const reference: TransmogManifest = {
  global: {
    enabled: true,
    lockedSlots: ["ranged"],
    accountWideByDefault: true,
    applyCostPerSlotCurrency: 500,
    applyCostCurrencyId: "gold",
    requireSourceInInventory: false,
    allowHideSlot: true,
    allowDye: true,
  },
  outfits: {
    enabled: true,
    maxOutfitsPerCharacter: 20,
    maxOutfitNameLength: 24,
    allowOutfitSharing: true,
  },
  sources: [
    {
      id: "paladinTier1Chest",
      name: "Lawbringer Chestplate",
      description: "Classic paladin T1 chest appearance.",
      iconId: "",
      slot: "chest",
      itemId: "itemPaladinT1Chest",
      displayAssetId: "assetPaladinT1Chest",
      unlockModel: "onFirstAcquire",
      unlockScope: "perAccount",
      color: "",
      rarity: "epic",
      restriction: {
        raceAllowList: "all",
        classAllowList: ["classPaladin"],
        factionAllowList: "all",
      },
      vendorCost: 0,
      vendorCurrencyId: "gold",
      setTag: "paladinTier1",
    },
    {
      id: "shopRoyalCrown",
      name: "Royal Crown",
      description: "Cosmetic crown, shop-only.",
      iconId: "",
      slot: "helm",
      itemId: "",
      displayAssetId: "assetRoyalCrown",
      unlockModel: "vendorPurchase",
      unlockScope: "perAccount",
      color: "#ffaa00",
      rarity: "legendary",
      restriction: {
        raceAllowList: "all",
        classAllowList: "all",
        factionAllowList: "all",
      },
      vendorCost: 500,
      vendorCurrencyId: "premiumGold",
      setTag: "",
    },
  ],
};

describe("TransmogManifestSchema", () => {
  it("parses the reference manifest cleanly", () => {
    const result = TransmogManifestSchema.safeParse(reference);
    if (!result.success) {
      throw new Error(
        `Reference manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("applies defaults on empty manifest", () => {
    const parsed = TransmogManifestSchema.parse({});
    expect(parsed.global.enabled).toBe(true);
    expect(parsed.global.lockedSlots).toEqual([]);
    expect(parsed.global.accountWideByDefault).toBe(true);
    expect(parsed.global.applyCostPerSlotCurrency).toBe(500);
    expect(parsed.global.applyCostCurrencyId).toBe("gold");
    expect(parsed.global.allowHideSlot).toBe(true);
    expect(parsed.global.allowDye).toBe(true);
    expect(parsed.outfits.enabled).toBe(true);
    expect(parsed.outfits.maxOutfitsPerCharacter).toBe(20);
    expect(parsed.sources).toEqual([]);
  });

  it("rejects duplicate source ids", () => {
    const bad = {
      sources: [
        {
          id: "dup",
          name: "A",
          slot: "chest",
          displayAssetId: "assetA",
          itemId: "itemA",
        },
        {
          id: "dup",
          name: "B",
          slot: "chest",
          displayAssetId: "assetB",
          itemId: "itemB",
        },
      ],
    };
    expect(TransmogManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown slot", () => {
    const bad = {
      sources: [
        {
          id: "a",
          name: "A",
          slot: "trinket",
          displayAssetId: "assetA",
          itemId: "itemA",
        },
      ],
    };
    expect(TransmogManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts all 10 slots", () => {
    const slots = [
      "helm",
      "chest",
      "legs",
      "feet",
      "hands",
      "shoulders",
      "back",
      "mainHand",
      "offHand",
      "ranged",
    ];
    for (const slot of slots) {
      const ok = {
        sources: [
          {
            id: `s${slot}`,
            name: slot,
            slot,
            displayAssetId: `asset${slot}`,
            itemId: `item${slot}`,
          },
        ],
      };
      expect(TransmogManifestSchema.safeParse(ok).success).toBe(true);
    }
  });

  it("rejects unknown unlock model", () => {
    const bad = {
      sources: [
        {
          id: "a",
          name: "A",
          slot: "chest",
          displayAssetId: "assetA",
          itemId: "itemA",
          unlockModel: "magic",
        },
      ],
    };
    expect(TransmogManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects vendorPurchase with vendorCost=0", () => {
    const bad = {
      sources: [
        {
          id: "a",
          name: "A",
          slot: "chest",
          displayAssetId: "assetA",
          itemId: "itemA",
          unlockModel: "vendorPurchase",
          vendorCost: 0,
        },
      ],
    };
    expect(TransmogManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts vendorPurchase with vendorCost>0", () => {
    const ok = {
      sources: [
        {
          id: "a",
          name: "A",
          slot: "chest",
          displayAssetId: "assetA",
          itemId: "",
          unlockModel: "vendorPurchase",
          vendorCost: 100,
        },
      ],
    };
    expect(TransmogManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects onFirstEquip without itemId", () => {
    const bad = {
      sources: [
        {
          id: "a",
          name: "A",
          slot: "chest",
          displayAssetId: "assetA",
          itemId: "",
          unlockModel: "onFirstEquip",
        },
      ],
    };
    expect(TransmogManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects onFirstAcquire without itemId", () => {
    const bad = {
      sources: [
        {
          id: "a",
          name: "A",
          slot: "chest",
          displayAssetId: "assetA",
          itemId: "",
          unlockModel: "onFirstAcquire",
        },
      ],
    };
    expect(TransmogManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts manual unlock without itemId", () => {
    const ok = {
      sources: [
        {
          id: "a",
          name: "A",
          slot: "chest",
          displayAssetId: "assetA",
          itemId: "",
          unlockModel: "manual",
        },
      ],
    };
    expect(TransmogManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("accepts questReward unlock without itemId", () => {
    const ok = {
      sources: [
        {
          id: "a",
          name: "A",
          slot: "chest",
          displayAssetId: "assetA",
          itemId: "",
          unlockModel: "questReward",
        },
      ],
    };
    expect(TransmogManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("accepts perCharacter unlock scope", () => {
    const ok = {
      sources: [
        {
          id: "a",
          name: "A",
          slot: "chest",
          displayAssetId: "assetA",
          itemId: "itemA",
          unlockScope: "perCharacter",
        },
      ],
    };
    expect(TransmogManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects bad source id format", () => {
    const bad = {
      sources: [
        {
          id: "Not Valid",
          name: "A",
          slot: "chest",
          displayAssetId: "assetA",
          itemId: "itemA",
        },
      ],
    };
    expect(TransmogManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects bad color format", () => {
    const bad = {
      sources: [
        {
          id: "a",
          name: "A",
          slot: "chest",
          displayAssetId: "assetA",
          itemId: "itemA",
          color: "red",
        },
      ],
    };
    expect(TransmogManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown rarity", () => {
    const bad = {
      sources: [
        {
          id: "a",
          name: "A",
          slot: "chest",
          displayAssetId: "assetA",
          itemId: "itemA",
          rarity: "divine",
        },
      ],
    };
    expect(TransmogManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts empty rarity", () => {
    const ok = {
      sources: [
        {
          id: "a",
          name: "A",
          slot: "chest",
          displayAssetId: "assetA",
          itemId: "itemA",
          rarity: "",
        },
      ],
    };
    expect(TransmogManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects empty race allow-list array (min 1)", () => {
    const bad = {
      sources: [
        {
          id: "a",
          name: "A",
          slot: "chest",
          displayAssetId: "assetA",
          itemId: "itemA",
          restriction: {
            raceAllowList: [],
            classAllowList: "all",
            factionAllowList: "all",
          },
        },
      ],
    };
    expect(TransmogManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts 'all' wildcard on all three lists", () => {
    const ok = {
      sources: [
        {
          id: "a",
          name: "A",
          slot: "chest",
          displayAssetId: "assetA",
          itemId: "itemA",
          restriction: {
            raceAllowList: "all",
            classAllowList: "all",
            factionAllowList: "all",
          },
        },
      ],
    };
    expect(TransmogManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("accepts specific race allow-list", () => {
    const ok = {
      sources: [
        {
          id: "a",
          name: "A",
          slot: "chest",
          displayAssetId: "assetA",
          itemId: "itemA",
          restriction: {
            raceAllowList: ["raceHuman", "raceElf"],
            classAllowList: "all",
            factionAllowList: "all",
          },
        },
      ],
    };
    expect(TransmogManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects duplicate lockedSlots", () => {
    const bad = { global: { lockedSlots: ["chest", "chest"] } };
    expect(TransmogManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts lockedSlots array with several slots", () => {
    const ok = { global: { lockedSlots: ["ranged", "back"] } };
    expect(TransmogManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects outfits enabled=true with maxOutfits=0", () => {
    const bad = {
      outfits: { enabled: true, maxOutfitsPerCharacter: 0 },
    };
    expect(TransmogManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts outfits disabled with maxOutfits=0", () => {
    const ok = {
      outfits: { enabled: false, maxOutfitsPerCharacter: 0 },
    };
    expect(TransmogManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects maxOutfitsPerCharacter > 200", () => {
    const bad = { outfits: { maxOutfitsPerCharacter: 9999 } };
    expect(TransmogManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects applyCostPerSlotCurrency > 1B", () => {
    const bad = { global: { applyCostPerSlotCurrency: 999_999_999_999 } };
    expect(TransmogManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts applyCostPerSlotCurrency = 0 (free apply)", () => {
    const ok = { global: { applyCostPerSlotCurrency: 0 } };
    expect(TransmogManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects bad applyCostCurrencyId format", () => {
    const bad = { global: { applyCostCurrencyId: "Has Spaces" } };
    expect(TransmogManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts requireSourceInInventory=true (FF14 glamour pattern)", () => {
    const ok = { global: { requireSourceInInventory: true } };
    expect(TransmogManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects unknown top-level field (strict mode)", () => {
    const bad = { extra: "nope" };
    expect(TransmogManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown field on source (strict mode)", () => {
    const bad = {
      sources: [
        {
          id: "a",
          name: "A",
          slot: "chest",
          displayAssetId: "assetA",
          itemId: "itemA",
          extra: "nope",
        },
      ],
    };
    expect(TransmogManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts all 6 unlock models that don't require itemId contradiction", () => {
    const pairs: Array<[string, string]> = [
      ["onFirstEquip", "itemA"],
      ["onFirstAcquire", "itemA"],
      ["vendorPurchase", ""],
      ["questReward", ""],
      ["collectionEvent", ""],
      ["manual", ""],
    ];
    for (const [unlockModel, itemId] of pairs) {
      const ok = {
        sources: [
          {
            id: `s${unlockModel}`,
            name: unlockModel,
            slot: "chest",
            displayAssetId: "assetA",
            itemId,
            unlockModel,
            vendorCost: unlockModel === "vendorPurchase" ? 100 : 0,
          },
        ],
      };
      expect(TransmogManifestSchema.safeParse(ok).success).toBe(true);
    }
  });
});
