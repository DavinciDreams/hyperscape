/**
 * Faithfulness + defensiveness tests for `AuctionHouseManifestSchema`.
 */

import { describe, expect, it } from "vitest";

import {
  AuctionHouseManifestSchema,
  type AuctionHouseManifest,
} from "./auction-house.js";

const reference: AuctionHouseManifest = {
  enabled: true,
  listing: {
    model: "bidAndBuyout",
    durationsHours: [12, 24, 48],
    depositFraction: 0.05,
    depositMinimumCurrency: 100,
    maxListingsPerCharacter: 50,
    maxListingsPerAccount: 200,
    minReservePriceCurrency: 1,
    maxListingPriceCurrency: 0,
    allowStacks: true,
    maxStackSize: 1000,
    expiryPolicy: "returnToSeller",
  },
  bidding: {
    minIncrementFraction: 0.05,
    minIncrementCurrencyFloor: 10,
    antiSnipeWindowSec: 300,
    antiSnipeExtensionSec: 300,
    refundOutbidImmediately: true,
    showBidderIdentityToSeller: false,
  },
  cancellation: {
    allowCancellation: true,
    forfeitDepositOnCancel: true,
    cancelBlockedWithinMinutesOfExpiry: 30,
    refundOutstandingBids: true,
  },
  fees: {
    commissionFraction: 0.05,
    currencyId: "gold",
    allowPremiumCurrency: false,
    enforceDailyRevenueCap: false,
    dailyRevenueCapCurrency: 1_000_000,
  },
  search: {
    pageSize: 50,
    minQueryLength: 2,
    maxQueriesPerMinute: 30,
    showSellerIdentity: true,
    allowPublicReadApi: false,
  },
  antiManipulation: {
    flagOverpricedFraction: 0,
    flagRapidListCancelSec: 300,
    flagSelfBidding: true,
    selfBidPolicy: "log",
  },
};

describe("AuctionHouseManifestSchema", () => {
  it("parses the reference manifest cleanly", () => {
    const result = AuctionHouseManifestSchema.safeParse(reference);
    if (!result.success) {
      throw new Error(
        `Reference manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("applies defaults on empty manifest", () => {
    const parsed = AuctionHouseManifestSchema.parse({});
    expect(parsed.enabled).toBe(true);
    expect(parsed.listing.model).toBe("bidAndBuyout");
    expect(parsed.listing.durationsHours).toEqual([12, 24, 48]);
    expect(parsed.listing.depositFraction).toBe(0.05);
    expect(parsed.listing.expiryPolicy).toBe("returnToSeller");
    expect(parsed.bidding.minIncrementFraction).toBe(0.05);
    expect(parsed.bidding.antiSnipeWindowSec).toBe(300);
    expect(parsed.cancellation.allowCancellation).toBe(true);
    expect(parsed.fees.commissionFraction).toBe(0.05);
    expect(parsed.fees.currencyId).toBe("gold");
    expect(parsed.search.pageSize).toBe(50);
    expect(parsed.antiManipulation.selfBidPolicy).toBe("log");
  });

  it("accepts AH disabled", () => {
    expect(
      AuctionHouseManifestSchema.safeParse({ enabled: false }).success,
    ).toBe(true);
  });

  it("rejects unknown listing model", () => {
    const bad = { listing: { model: "lottery" } };
    expect(AuctionHouseManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts buyoutOnly model with zero minIncrement", () => {
    const ok = {
      listing: { model: "buyoutOnly" },
      bidding: { minIncrementFraction: 0 },
    };
    expect(AuctionHouseManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects bidAndBuyout with minIncrementFraction=0", () => {
    const bad = {
      listing: { model: "bidAndBuyout" },
      bidding: { minIncrementFraction: 0 },
    };
    expect(AuctionHouseManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects bidOnly with minIncrementFraction=0", () => {
    const bad = {
      listing: { model: "bidOnly" },
      bidding: { minIncrementFraction: 0 },
    };
    expect(AuctionHouseManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects empty durationsHours", () => {
    const bad = { listing: { durationsHours: [] } };
    expect(AuctionHouseManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate durationsHours", () => {
    const bad = { listing: { durationsHours: [12, 24, 24] } };
    expect(AuctionHouseManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects non-increasing durationsHours", () => {
    const bad = { listing: { durationsHours: [48, 24, 12] } };
    expect(AuctionHouseManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts single-duration durationsHours", () => {
    const ok = { listing: { durationsHours: [24] } };
    expect(AuctionHouseManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects durations > 336 (2 weeks)", () => {
    const bad = { listing: { durationsHours: [999] } };
    expect(AuctionHouseManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects depositFraction > 0.5", () => {
    const bad = { listing: { depositFraction: 0.9 } };
    expect(AuctionHouseManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects maxListingsPerAccount < maxListingsPerCharacter", () => {
    const bad = {
      listing: { maxListingsPerCharacter: 100, maxListingsPerAccount: 50 },
    };
    expect(AuctionHouseManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts maxListingsPerAccount == maxListingsPerCharacter", () => {
    const ok = {
      listing: { maxListingsPerCharacter: 50, maxListingsPerAccount: 50 },
    };
    expect(AuctionHouseManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("accepts maxListingPriceCurrency = 0 (no cap)", () => {
    const ok = { listing: { maxListingPriceCurrency: 0 } };
    expect(AuctionHouseManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects unknown expiryPolicy", () => {
    const bad = { listing: { expiryPolicy: "burn" } };
    expect(AuctionHouseManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts relistAtReserve expiryPolicy", () => {
    const ok = { listing: { expiryPolicy: "relistAtReserve" } };
    expect(AuctionHouseManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects antiSnipeWindowSec > 0 with extensionSec = 0", () => {
    const bad = {
      bidding: { antiSnipeWindowSec: 300, antiSnipeExtensionSec: 0 },
    };
    expect(AuctionHouseManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts antiSnipeWindowSec=0 with extensionSec=0", () => {
    const ok = {
      bidding: { antiSnipeWindowSec: 0, antiSnipeExtensionSec: 0 },
    };
    expect(AuctionHouseManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects minIncrementFraction > 1", () => {
    const bad = { bidding: { minIncrementFraction: 1.5 } };
    expect(AuctionHouseManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects commissionFraction > 1", () => {
    const bad = { fees: { commissionFraction: 1.5 } };
    expect(AuctionHouseManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts commissionFraction = 0 (no commission)", () => {
    const ok = { fees: { commissionFraction: 0 } };
    expect(AuctionHouseManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects bad currencyId format", () => {
    const bad = { fees: { currencyId: "Has Spaces" } };
    expect(AuctionHouseManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects pageSize < 5", () => {
    const bad = { search: { pageSize: 1 } };
    expect(AuctionHouseManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects pageSize > 500", () => {
    const bad = { search: { pageSize: 9999 } };
    expect(AuctionHouseManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts maxQueriesPerMinute = 0 (unlimited)", () => {
    const ok = { search: { maxQueriesPerMinute: 0 } };
    expect(AuctionHouseManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects cancelBlockedWithinMinutesOfExpiry > 240", () => {
    const bad = {
      cancellation: { cancelBlockedWithinMinutesOfExpiry: 9999 },
    };
    expect(AuctionHouseManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts cancellation disabled", () => {
    const ok = { cancellation: { allowCancellation: false } };
    expect(AuctionHouseManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects unknown selfBidPolicy", () => {
    const bad = { antiManipulation: { selfBidPolicy: "nuke" } };
    expect(AuctionHouseManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts block selfBidPolicy", () => {
    const ok = { antiManipulation: { selfBidPolicy: "block" } };
    expect(AuctionHouseManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("accepts flagOverpricedFraction = 0 (disabled)", () => {
    const ok = { antiManipulation: { flagOverpricedFraction: 0 } };
    expect(AuctionHouseManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects flagOverpricedFraction > 10", () => {
    const bad = { antiManipulation: { flagOverpricedFraction: 99 } };
    expect(AuctionHouseManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects maxStackSize > 10000", () => {
    const bad = { listing: { maxStackSize: 999999 } };
    expect(AuctionHouseManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts allowPremiumCurrency=true", () => {
    const ok = { fees: { allowPremiumCurrency: true } };
    expect(AuctionHouseManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects unknown top-level field (strict mode)", () => {
    const bad = { extra: "nope" };
    expect(AuctionHouseManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown field on listing (strict mode)", () => {
    const bad = { listing: { extra: "nope" } };
    expect(AuctionHouseManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts showBidderIdentityToSeller=true", () => {
    const ok = { bidding: { showBidderIdentityToSeller: true } };
    expect(AuctionHouseManifestSchema.safeParse(ok).success).toBe(true);
  });
});
