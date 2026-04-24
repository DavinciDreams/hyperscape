import { StoreFrontManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import {
  StoreFrontNotLoadedError,
  StoreFrontRegistry,
  UnknownBundleError,
  UnknownPriceTierError,
  UnknownShelfError,
} from "../StoreFrontRegistry.js";

function manifest() {
  return StoreFrontManifestSchema.parse({
    enabled: true,
    priceTiers: [
      {
        id: "tier5",
        displayFormatKey: "USD_CENTS",
        canonicalAmountCents: 499,
        regionAmounts: [
          { region: "US", amountCents: 499, currencyCode: "USD" },
          { region: "GB", amountCents: 399, currencyCode: "GBP" },
        ],
      },
      {
        id: "tier10",
        displayFormatKey: "USD_CENTS",
        canonicalAmountCents: 999,
      },
    ],
    bundles: [
      {
        id: "starterPack",
        titleLocalizationKey: "bundle.starter.title",
        heroAssetRef: "heroStarter",
        priceTierId: "tier5",
        entitlementIds: ["ent.sword", "ent.gold.100"],
        categoryTag: "starter",
        maxPurchasesPerPlayer: 1,
      },
      {
        id: "festivePack",
        titleLocalizationKey: "bundle.festive.title",
        heroAssetRef: "heroFestive",
        priceTierId: "tier10",
        entitlementIds: ["ent.emote.dance"],
        categoryTag: "event",
        publishAtIso: "2026-12-01T00:00:00Z",
        expireAtIso: "2026-12-31T23:59:59Z",
        minAgeYears: 13,
      },
    ],
    shelves: [
      {
        id: "hero",
        titleLocalizationKey: "shelf.hero",
        bundleIds: ["starterPack"],
        displayOrder: 10,
      },
      {
        id: "seasonal",
        titleLocalizationKey: "shelf.seasonal",
        bundleIds: ["festivePack"],
        displayOrder: 0,
      },
    ],
    discountRules: [
      {
        id: "starter25",
        kind: "percentOff",
        bundleIds: ["starterPack"],
        amount: 25,
        priority: 100,
      },
      {
        id: "eventBogo",
        kind: "bonusEntitlement",
        bundleIds: [],
        categoryTag: "event",
        amount: 0,
        bonusEntitlementId: "ent.bonus.gem",
        priority: 200,
      },
    ],
    globalDailySpendCapCents: 10_000,
    requiresLicenseAgreement: true,
  });
}

describe("StoreFrontRegistry — not loaded", () => {
  it("throws pre-load", () => {
    expect(() => new StoreFrontRegistry().manifest).toThrow(
      StoreFrontNotLoadedError,
    );
  });
});

describe("StoreFrontRegistry — lookups", () => {
  it("indexes bundles and tiers", () => {
    const r = new StoreFrontRegistry(manifest());
    expect(r.hasBundle("starterPack")).toBe(true);
    expect(r.bundle("festivePack").minAgeYears).toBe(13);
    expect(r.priceTier("tier5").canonicalAmountCents).toBe(499);
  });

  it("throws on unknown ids", () => {
    const r = new StoreFrontRegistry(manifest());
    expect(() => r.bundle("ghost")).toThrow(UnknownBundleError);
    expect(() => r.priceTier("ghost")).toThrow(UnknownPriceTierError);
    expect(() => r.shelf("ghost")).toThrow(UnknownShelfError);
  });

  it("sorts shelves by displayOrder ascending", () => {
    const r = new StoreFrontRegistry(manifest());
    expect(r.shelvesByDisplayOrder().map((s) => s.id)).toEqual([
      "seasonal",
      "hero",
    ]);
  });

  it("filters by category tag", () => {
    const r = new StoreFrontRegistry(manifest());
    expect(r.bundlesByCategory("event").map((b) => b.id)).toEqual([
      "festivePack",
    ]);
  });
});

describe("StoreFrontRegistry — regional price", () => {
  it("returns regional override", () => {
    const r = new StoreFrontRegistry(manifest());
    const p = r.regionalPrice("starterPack", "GB");
    expect(p.amountCents).toBe(399);
    expect(p.currencyCode).toBe("GBP");
    expect(p.fallback).toBe(false);
  });

  it("falls back to canonical with USD", () => {
    const r = new StoreFrontRegistry(manifest());
    const p = r.regionalPrice("starterPack", "JP");
    expect(p.amountCents).toBe(499);
    expect(p.currencyCode).toBe("USD");
    expect(p.fallback).toBe(true);
  });

  it("falls back with custom currency code", () => {
    const r = new StoreFrontRegistry(manifest());
    const p = r.regionalPrice("festivePack", "JP", "JPY");
    expect(p.currencyCode).toBe("JPY");
    expect(p.fallback).toBe(true);
  });
});

describe("StoreFrontRegistry — publish window", () => {
  it("unpublished before publishAt", () => {
    const r = new StoreFrontRegistry(manifest());
    expect(r.isPublished("festivePack", "2026-01-01T00:00:00Z")).toBe(false);
  });

  it("published within window", () => {
    const r = new StoreFrontRegistry(manifest());
    expect(r.isPublished("festivePack", "2026-12-15T00:00:00Z")).toBe(true);
  });

  it("unpublished after expireAt", () => {
    const r = new StoreFrontRegistry(manifest());
    expect(r.isPublished("festivePack", "2027-01-01T00:00:00Z")).toBe(false);
  });

  it("always published when no window", () => {
    const r = new StoreFrontRegistry(manifest());
    expect(r.isPublished("starterPack", "2026-01-01T00:00:00Z")).toBe(true);
  });
});

describe("StoreFrontRegistry — discounts", () => {
  it("picks targeted bundle discount", () => {
    const r = new StoreFrontRegistry(manifest());
    const d = r.pickDiscount("starterPack", "2026-01-01T00:00:00Z");
    expect(d?.id).toBe("starter25");
  });

  it("picks category-tag discount", () => {
    const r = new StoreFrontRegistry(manifest());
    const d = r.pickDiscount("festivePack", "2026-12-15T00:00:00Z");
    expect(d?.id).toBe("eventBogo");
  });

  it("returns null when nothing applies", () => {
    const r = new StoreFrontRegistry();
    r.loadFromJson({
      enabled: true,
      priceTiers: [
        {
          id: "t",
          displayFormatKey: "USD_CENTS",
          canonicalAmountCents: 100,
        },
      ],
      bundles: [
        {
          id: "b",
          titleLocalizationKey: "b",
          heroAssetRef: "h",
          priceTierId: "t",
          entitlementIds: ["x"],
        },
      ],
    });
    expect(r.pickDiscount("b", "2026-01-01T00:00:00Z")).toBeNull();
  });

  it("computes percentOff price", () => {
    const r = new StoreFrontRegistry(manifest());
    const p = r.priceWithDiscount("starterPack", 499, "2026-01-01T00:00:00Z");
    expect(p.baseCents).toBe(499);
    expect(p.finalCents).toBe(499 - Math.floor((499 * 25) / 100));
    expect(p.discountRuleId).toBe("starter25");
  });

  it("reports bonus entitlement without price change", () => {
    const r = new StoreFrontRegistry(manifest());
    const p = r.priceWithDiscount("festivePack", 999, "2026-12-15T00:00:00Z");
    expect(p.finalCents).toBe(999);
    expect(p.bonusEntitlementId).toBe("ent.bonus.gem");
  });
});

describe("StoreFrontRegistry — purchase gate", () => {
  const baseInput = {
    bundleId: "starterPack",
    playerAgeYears: 30,
    nowIso: "2026-06-15T00:00:00Z",
    playerPurchaseCount: 0,
    spendTodayCents: 0,
    netChargeCents: 499,
    licenseAccepted: true,
  };

  it("allows valid purchase", () => {
    const r = new StoreFrontRegistry(manifest());
    expect(r.checkPurchase(baseInput).allowed).toBe(true);
  });

  it("rejects when license not accepted", () => {
    const r = new StoreFrontRegistry(manifest());
    expect(
      r.checkPurchase({ ...baseInput, licenseAccepted: false }).reason,
    ).toBe("license-not-accepted");
  });

  it("rejects below age", () => {
    const r = new StoreFrontRegistry(manifest());
    expect(
      r.checkPurchase({
        ...baseInput,
        bundleId: "festivePack",
        nowIso: "2026-12-15T00:00:00Z",
        playerAgeYears: 10,
      }).reason,
    ).toBe("age-gate");
  });

  it("rejects pre-publish", () => {
    const r = new StoreFrontRegistry(manifest());
    expect(
      r.checkPurchase({
        ...baseInput,
        bundleId: "festivePack",
        nowIso: "2026-01-01T00:00:00Z",
      }).reason,
    ).toBe("pre-publish");
  });

  it("rejects post-expire", () => {
    const r = new StoreFrontRegistry(manifest());
    expect(
      r.checkPurchase({
        ...baseInput,
        bundleId: "festivePack",
        nowIso: "2027-01-01T00:00:00Z",
      }).reason,
    ).toBe("post-expire");
  });

  it("rejects player frequency cap", () => {
    const r = new StoreFrontRegistry(manifest());
    expect(
      r.checkPurchase({ ...baseInput, playerPurchaseCount: 1 }).reason,
    ).toBe("player-frequency-cap");
  });

  it("rejects daily spend cap", () => {
    const r = new StoreFrontRegistry(manifest());
    expect(
      r.checkPurchase({ ...baseInput, spendTodayCents: 9900 }).reason,
    ).toBe("daily-spend-cap");
  });

  it("rejects unknown bundle", () => {
    const r = new StoreFrontRegistry(manifest());
    expect(r.checkPurchase({ ...baseInput, bundleId: "ghost" }).reason).toBe(
      "bundle-not-found",
    );
  });
});
