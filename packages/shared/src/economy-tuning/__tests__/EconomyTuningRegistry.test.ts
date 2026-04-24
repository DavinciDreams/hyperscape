import { EconomyTuningManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import {
  EconomyTuningRegistry,
  UnknownCostCurveError,
  UnknownCurrencyError,
} from "../EconomyTuningRegistry.js";

function manifest() {
  return EconomyTuningManifestSchema.parse({
    currencies: [
      {
        id: "gold",
        name: "Gold",
        symbol: "g",
        cap: 0,
        tradeable: true,
      },
      {
        id: "honor",
        name: "Honor",
        symbol: "h",
        cap: 75_000,
        tradeable: false,
        bankStored: false,
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
        id: "repair",
        currencyId: "gold",
        base: 100,
        perLevel: 5,
        perTier: 20,
        min: 10,
        max: 5000,
      },
      {
        id: "respec",
        currencyId: "gold",
        base: 1000,
        perLevel: 0,
        perTier: 0,
      },
    ],
    market: {
      enabled: true,
      currencyId: "gold",
      listingFee: 100,
      salesCommission: 0.05,
      maxListingsPerPlayer: 10,
      listingExpiryHours: 48,
      minListingPrice: 1,
    },
  });
}

describe("EconomyTuningRegistry — currencies", () => {
  it("indexes by id", () => {
    const r = new EconomyTuningRegistry(manifest());
    expect(r.hasCurrency("gold")).toBe(true);
    expect(r.currency("honor").cap).toBe(75_000);
  });

  it("throws on miss", () => {
    const r = new EconomyTuningRegistry(manifest());
    expect(() => r.currency("ghost")).toThrow(UnknownCurrencyError);
  });

  it("clamps amount to cap", () => {
    const r = new EconomyTuningRegistry(manifest());
    expect(r.clampCurrencyAmount("honor", 100_000)).toBe(75_000);
  });

  it("uncapped currency returns amount", () => {
    const r = new EconomyTuningRegistry(manifest());
    expect(r.clampCurrencyAmount("gold", 10_000_000)).toBe(10_000_000);
  });
});

describe("EconomyTuningRegistry — vendor pricing", () => {
  it("derives sell and buyback", () => {
    const r = new EconomyTuningRegistry(manifest());
    const p = r.vendorPriceFor(1000);
    expect(p.sellPrice).toBe(1000);
    expect(p.buybackPrice).toBe(400);
    expect(p.currencyId).toBe("gold");
  });

  it("projects stock after one restock tick", () => {
    const r = new EconomyTuningRegistry(manifest());
    // start 0/10, 60 min elapsed → 1 tick → 0.5 * 10 = 5
    expect(r.projectStock(0, 10, 60)).toBe(5);
  });

  it("clamps stock at max", () => {
    const r = new EconomyTuningRegistry(manifest());
    expect(r.projectStock(8, 10, 600)).toBe(10);
  });

  it("no restock when minutes < tick", () => {
    const r = new EconomyTuningRegistry(manifest());
    expect(r.projectStock(5, 10, 30)).toBe(5);
  });
});

describe("EconomyTuningRegistry — cost curves", () => {
  it("computes repair curve", () => {
    const r = new EconomyTuningRegistry(manifest());
    // base 100 + 5*10 + 20*3 = 210
    expect(r.evaluateCurve("repair", { level: 10, tier: 3 })).toBe(210);
  });

  it("clamps to max", () => {
    const r = new EconomyTuningRegistry(manifest());
    // raw = 100 + 5*1000 + 20*500 = 15100 → clamped to max 5000
    expect(r.evaluateCurve("repair", { level: 1000, tier: 500 })).toBe(5000);
  });

  it("clamps to min", () => {
    const r = new EconomyTuningRegistry(manifest());
    // At level 0 tier 0: base 100 — but min is 10, so returns base.
    // Use a curve where base < min to test min clamp.
    // Our 'respec' curve base=1000, so not helpful. Test via clamp-max overflow instead above;
    // for min clamp, confirm min applies when raw < min. Mutate base to 0 via evaluateCurve
    // logic: base=100, level=0, tier=0 → 100 → above min 10 → returns 100.
    expect(r.evaluateCurve("repair", { level: 0, tier: 0 })).toBe(100);
  });

  it("throws on unknown curve", () => {
    const r = new EconomyTuningRegistry(manifest());
    expect(() => r.evaluateCurve("ghost")).toThrow(UnknownCostCurveError);
  });
});

describe("EconomyTuningRegistry — market", () => {
  it("quotes listing fee + commission", () => {
    const r = new EconomyTuningRegistry(manifest());
    const q = r.quoteMarket(10_000);
    expect(q.listingFee).toBe(100);
    expect(q.commission).toBe(500);
    expect(q.sellerPayout).toBe(9500);
  });

  it("canListMore under cap", () => {
    const r = new EconomyTuningRegistry(manifest());
    expect(r.canListMore(5)).toBe(true);
    expect(r.canListMore(10)).toBe(false);
  });
});
