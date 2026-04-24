import { describe, expect, it } from "vitest";
import {
  BundleSchema,
  DiscountRuleSchema,
  PriceTierSchema,
  ShelfSchema,
  StoreFrontManifestSchema,
} from "./store-front.js";

describe("PriceTierSchema", () => {
  it("accepts minimal tier", () => {
    const t = PriceTierSchema.parse({
      id: "t4_99",
      displayFormatKey: "USD",
      canonicalAmountCents: 499,
    });
    expect(t.regionAmounts).toEqual([]);
  });

  it("rejects invalid currencyCode in region amounts", () => {
    expect(() =>
      PriceTierSchema.parse({
        id: "t",
        displayFormatKey: "USD",
        canonicalAmountCents: 499,
        regionAmounts: [
          { region: "DE", amountCents: 499, currencyCode: "eur" },
        ],
      }),
    ).toThrow(/currencyCode/);
  });

  it("rejects duplicate region entries", () => {
    const r = { region: "DE", amountCents: 499, currencyCode: "EUR" };
    expect(() =>
      PriceTierSchema.parse({
        id: "t",
        displayFormatKey: "USD",
        canonicalAmountCents: 499,
        regionAmounts: [r, r],
      }),
    ).toThrow(/unique per region/);
  });
});

describe("BundleSchema", () => {
  const base = {
    id: "starter",
    titleLocalizationKey: "bundle.starter.title",
    heroAssetRef: "heroStarter",
    priceTierId: "t4_99",
    entitlementIds: ["gemsPack100"],
  };

  it("accepts minimal bundle", () => {
    const b = BundleSchema.parse(base);
    expect(b.minAgeYears).toBe(0);
  });

  it("rejects duplicate entitlementIds", () => {
    expect(() =>
      BundleSchema.parse({ ...base, entitlementIds: ["x", "x"] }),
    ).toThrow(/unique/);
  });

  it("rejects expireAtIso <= publishAtIso", () => {
    expect(() =>
      BundleSchema.parse({
        ...base,
        publishAtIso: "2026-04-01T00:00:00Z",
        expireAtIso: "2026-04-01T00:00:00Z",
      }),
    ).toThrow(/expireAtIso/);
  });

  it("accepts valid publish window", () => {
    const b = BundleSchema.parse({
      ...base,
      publishAtIso: "2026-04-01T00:00:00Z",
      expireAtIso: "2026-05-01T00:00:00Z",
    });
    expect(b.expireAtIso).toBe("2026-05-01T00:00:00Z");
  });
});

describe("DiscountRuleSchema", () => {
  it("requires bundleIds or categoryTag", () => {
    expect(() =>
      DiscountRuleSchema.parse({
        id: "d",
        kind: "percentOff",
        amount: 20,
      }),
    ).toThrow(/bundleIds/);
  });

  it("rejects percentOff > 100", () => {
    expect(() =>
      DiscountRuleSchema.parse({
        id: "d",
        kind: "percentOff",
        amount: 150,
        bundleIds: ["x"],
      }),
    ).toThrow(/amount/);
  });

  it("rejects bonusEntitlement without bonusEntitlementId", () => {
    expect(() =>
      DiscountRuleSchema.parse({
        id: "d",
        kind: "bonusEntitlement",
        amount: 0,
        bundleIds: ["x"],
      }),
    ).toThrow(/bonusEntitlement/);
  });

  it("rejects invalid date window", () => {
    expect(() =>
      DiscountRuleSchema.parse({
        id: "d",
        kind: "flatCentsOff",
        amount: 100,
        bundleIds: ["x"],
        startAtIso: "2026-04-01T00:00:00Z",
        endAtIso: "2026-03-01T00:00:00Z",
      }),
    ).toThrow(/endAtIso/);
  });
});

describe("ShelfSchema", () => {
  it("accepts minimal shelf", () => {
    const s = ShelfSchema.parse({
      id: "featured",
      titleLocalizationKey: "shelf.featured.title",
      bundleIds: ["starter"],
    });
    expect(s.displayOrder).toBe(0);
  });

  it("rejects duplicate bundleIds", () => {
    expect(() =>
      ShelfSchema.parse({
        id: "x",
        titleLocalizationKey: "k",
        bundleIds: ["b", "b"],
      }),
    ).toThrow(/unique/);
  });
});

describe("StoreFrontManifestSchema", () => {
  const validManifest = {
    priceTiers: [
      { id: "t1", displayFormatKey: "USD", canonicalAmountCents: 499 },
    ],
    bundles: [
      {
        id: "starter",
        titleLocalizationKey: "k",
        heroAssetRef: "h",
        priceTierId: "t1",
        entitlementIds: ["gems"],
      },
    ],
  };

  it("accepts empty manifest", () => {
    const m = StoreFrontManifestSchema.parse({});
    expect(m.bundles).toEqual([]);
  });

  it("accepts valid manifest", () => {
    const m = StoreFrontManifestSchema.parse(validManifest);
    expect(m.bundles).toHaveLength(1);
  });

  it("rejects bundle with missing price tier", () => {
    expect(() =>
      StoreFrontManifestSchema.parse({
        bundles: [
          {
            id: "starter",
            titleLocalizationKey: "k",
            heroAssetRef: "h",
            priceTierId: "missing",
            entitlementIds: ["g"],
          },
        ],
      }),
    ).toThrow(/priceTierId/);
  });

  it("rejects shelf pointing at missing bundle", () => {
    expect(() =>
      StoreFrontManifestSchema.parse({
        ...validManifest,
        shelves: [
          {
            id: "s",
            titleLocalizationKey: "k",
            bundleIds: ["nope"],
          },
        ],
      }),
    ).toThrow(/shelf/);
  });

  it("rejects discount rule pointing at missing bundle", () => {
    expect(() =>
      StoreFrontManifestSchema.parse({
        ...validManifest,
        discountRules: [
          {
            id: "d",
            kind: "percentOff",
            amount: 25,
            bundleIds: ["nope"],
          },
        ],
      }),
    ).toThrow(/discount/);
  });
});
