/**
 * Faithfulness + defensiveness tests for `EconomyTuningManifestSchema`.
 */

import { describe, expect, it } from "vitest";

import {
  EconomyTuningManifestSchema,
  type EconomyTuningManifest,
} from "./economy-tuning.js";

const reference: EconomyTuningManifest = {
  currencies: [
    {
      id: "gold",
      name: "Gold",
      symbol: "g",
      description: "Primary economy currency.",
      iconId: "icon.gold",
      cap: 0,
      tradeable: true,
      bankStored: true,
      keepOnDeath: true,
    },
    {
      id: "honor",
      name: "Honor Points",
      symbol: "hp",
      description: "PvP reward currency.",
      iconId: "icon.honor",
      cap: 100_000,
      tradeable: false,
      bankStored: false,
      keepOnDeath: true,
    },
  ],
  vendor: {
    vendorBuybackMultiplier: 0.4,
    vendorSellMultiplier: 1,
    stockRestockMinutes: 60,
    stockRestockFraction: 0.5,
    defaultCurrencyId: "gold",
  },
  costCurves: [
    {
      id: "equipmentRepair",
      description: "Cost to repair a piece of equipment.",
      currencyId: "gold",
      base: 10,
      perLevel: 5,
      perTier: 50,
      min: 10,
      max: 10_000,
    },
    {
      id: "skillRespec",
      description: "Cost to reset a skill tree.",
      currencyId: "gold",
      base: 500,
      perLevel: 100,
      perTier: 0,
      min: 500,
      max: 100_000,
    },
  ],
  market: {
    enabled: true,
    currencyId: "gold",
    listingFee: 100,
    salesCommission: 0.05,
    maxListingsPerPlayer: 24,
    listingExpiryHours: 48,
    minListingPrice: 1,
  },
};

describe("EconomyTuningManifestSchema", () => {
  it("parses the reference manifest cleanly", () => {
    const result = EconomyTuningManifestSchema.safeParse(reference);
    if (!result.success) {
      throw new Error(
        `Reference manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("applies defaults on a minimal manifest", () => {
    const parsed = EconomyTuningManifestSchema.parse({
      currencies: [{ id: "gold", name: "Gold", symbol: "g" }],
    });
    expect(parsed.vendor.vendorBuybackMultiplier).toBe(0.4);
    expect(parsed.vendor.vendorSellMultiplier).toBe(1);
    expect(parsed.vendor.stockRestockMinutes).toBe(60);
    expect(parsed.vendor.defaultCurrencyId).toBe("gold");
    expect(parsed.market.enabled).toBe(true);
    expect(parsed.market.currencyId).toBe("gold");
    expect(parsed.market.salesCommission).toBeCloseTo(0.05);
    expect(parsed.costCurves).toEqual([]);
    expect(parsed.currencies[0].tradeable).toBe(true);
    expect(parsed.currencies[0].bankStored).toBe(true);
  });

  it("rejects zero currencies", () => {
    const bad = { currencies: [] };
    expect(EconomyTuningManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate currency ids", () => {
    const bad = {
      currencies: [
        { id: "dup", name: "A", symbol: "a" },
        { id: "dup", name: "B", symbol: "b" },
      ],
    };
    expect(EconomyTuningManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate cost-curve ids", () => {
    const bad = {
      currencies: [{ id: "gold", name: "Gold", symbol: "g" }],
      costCurves: [
        { id: "dup", currencyId: "gold", base: 1 },
        { id: "dup", currencyId: "gold", base: 2 },
      ],
    };
    expect(EconomyTuningManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects vendor defaultCurrencyId that does not resolve", () => {
    const bad = {
      currencies: [{ id: "gold", name: "Gold", symbol: "g" }],
      vendor: { defaultCurrencyId: "platinum" },
    };
    expect(EconomyTuningManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects market currencyId that does not resolve", () => {
    const bad = {
      currencies: [{ id: "gold", name: "Gold", symbol: "g" }],
      market: { enabled: true, currencyId: "platinum" },
    };
    expect(EconomyTuningManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts market disabled even with unknown currency (disabled short-circuits)", () => {
    const ok = {
      currencies: [{ id: "gold", name: "Gold", symbol: "g" }],
      market: { enabled: false, currencyId: "platinum" },
    };
    // The enabled-short-circuit means the `must-resolve` refine skips;
    // however `tradeable` refine also short-circuits on `enabled: false`.
    // So the manifest should parse.
    expect(EconomyTuningManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects market enabled on a non-tradeable currency", () => {
    const bad = {
      currencies: [
        { id: "honor", name: "Honor", symbol: "hp", tradeable: false },
      ],
      market: { enabled: true, currencyId: "honor" },
      vendor: { defaultCurrencyId: "honor" },
    };
    expect(EconomyTuningManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects cost-curve currencyId that does not resolve", () => {
    const bad = {
      currencies: [{ id: "gold", name: "Gold", symbol: "g" }],
      costCurves: [{ id: "c", currencyId: "platinum", base: 1 }],
    };
    expect(EconomyTuningManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects cost-curve with min > max", () => {
    const bad = {
      currencies: [{ id: "gold", name: "Gold", symbol: "g" }],
      costCurves: [{ id: "c", currencyId: "gold", base: 0, min: 100, max: 10 }],
    };
    expect(EconomyTuningManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects currency cap > 1 billion", () => {
    const bad = {
      currencies: [
        { id: "gold", name: "Gold", symbol: "g", cap: 9_000_000_000 },
      ],
    };
    expect(EconomyTuningManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects vendor buyback multiplier > 1", () => {
    const bad = {
      currencies: [{ id: "gold", name: "Gold", symbol: "g" }],
      vendor: { vendorBuybackMultiplier: 2 },
    };
    expect(EconomyTuningManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects stockRestockFraction > 1", () => {
    const bad = {
      currencies: [{ id: "gold", name: "Gold", symbol: "g" }],
      vendor: { stockRestockFraction: 2 },
    };
    expect(EconomyTuningManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects market salesCommission > 1", () => {
    const bad = {
      currencies: [{ id: "gold", name: "Gold", symbol: "g" }],
      market: { enabled: true, currencyId: "gold", salesCommission: 2 },
    };
    expect(EconomyTuningManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects market listingExpiryHours > 720", () => {
    const bad = {
      currencies: [{ id: "gold", name: "Gold", symbol: "g" }],
      market: { enabled: true, currencyId: "gold", listingExpiryHours: 10_000 },
    };
    expect(EconomyTuningManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects invalid currency id format", () => {
    const bad = {
      currencies: [{ id: "Has Spaces", name: "Gold", symbol: "g" }],
    };
    expect(EconomyTuningManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects empty currency symbol", () => {
    const bad = {
      currencies: [{ id: "gold", name: "Gold", symbol: "" }],
    };
    expect(EconomyTuningManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects currency symbol longer than 8 chars", () => {
    const bad = {
      currencies: [{ id: "gold", name: "Gold", symbol: "goldcoins" }],
    };
    expect(EconomyTuningManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts non-bankable non-tradeable soulbound currency", () => {
    const ok = {
      currencies: [
        { id: "gold", name: "Gold", symbol: "g" },
        {
          id: "soulPoints",
          name: "Soul Points",
          symbol: "sp",
          tradeable: false,
          bankStored: false,
          keepOnDeath: true,
        },
      ],
    };
    expect(EconomyTuningManifestSchema.safeParse(ok).success).toBe(true);
  });
});
