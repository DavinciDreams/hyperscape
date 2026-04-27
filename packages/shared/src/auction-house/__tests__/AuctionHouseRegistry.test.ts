import { AuctionHouseManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it, vi } from "vitest";
import {
  AuctionHouseNotLoadedError,
  AuctionHouseRegistry,
} from "../AuctionHouseRegistry.js";

function manifest(overrides: Record<string, unknown> = {}) {
  return AuctionHouseManifestSchema.parse({
    enabled: true,
    listing: {
      model: "bidAndBuyout",
      durationsHours: [12, 24, 48],
      depositFraction: 0.05,
      depositMinimumCurrency: 100,
      maxListingsPerCharacter: 50,
      maxListingsPerAccount: 200,
      minReservePriceCurrency: 10,
      maxListingPriceCurrency: 1_000_000,
      allowStacks: true,
      maxStackSize: 1000,
      expiryPolicy: "returnToSeller",
    },
    bidding: {
      minIncrementFraction: 0.05,
      minIncrementCurrencyFloor: 10,
      antiSnipeWindowSec: 300,
      antiSnipeExtensionSec: 300,
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
      enforceDailyRevenueCap: false,
      dailyRevenueCapCurrency: 1_000_000,
    },
    search: {
      pageSize: 50,
      minQueryLength: 2,
      maxQueriesPerMinute: 30,
    },
    antiManipulation: {
      flagOverpricedFraction: 0.5,
      flagRapidListCancelSec: 300,
      flagSelfBidding: true,
      selfBidPolicy: "block",
    },
    ...overrides,
  });
}

describe("AuctionHouseRegistry — not loaded", () => {
  it("throws pre-load", () => {
    expect(() => new AuctionHouseRegistry().manifest).toThrow(
      AuctionHouseNotLoadedError,
    );
  });
});

describe("AuctionHouseRegistry — deposit math", () => {
  it("uses fraction when above floor", () => {
    const r = new AuctionHouseRegistry(manifest());
    // 10000 * 0.05 = 500 (above floor of 100)
    expect(r.depositFor(10_000)).toBe(500);
  });

  it("floors at minimum deposit", () => {
    const r = new AuctionHouseRegistry(manifest());
    // 100 * 0.05 = 5 (below floor of 100)
    expect(r.depositFor(100)).toBe(100);
  });

  it("clamps negative prices to 0 then floors", () => {
    const r = new AuctionHouseRegistry(manifest());
    expect(r.depositFor(-100)).toBe(100);
  });
});

describe("AuctionHouseRegistry — quoteListing", () => {
  const baseInput = {
    reservePrice: 1000,
    durationHours: 24,
    stackSize: 1,
    charactersActiveListings: 0,
    accountActiveListings: 0,
  };

  it("allows valid listing", () => {
    const r = new AuctionHouseRegistry(manifest());
    const q = r.quoteListing(baseInput);
    expect(q.allowed).toBe(true);
    expect(q.reason).toBe("allowed");
    expect(q.deposit).toBe(100); // 1000*0.05=50 -> floor 100
    expect(q.currencyId).toBe("gold");
  });

  it("rejects when disabled", () => {
    const r = new AuctionHouseRegistry(manifest({ enabled: false }));
    expect(r.quoteListing(baseInput).reason).toBe("disabled");
  });

  it("rejects invalid duration", () => {
    const r = new AuctionHouseRegistry(manifest());
    expect(r.quoteListing({ ...baseInput, durationHours: 36 }).reason).toBe(
      "invalid-duration",
    );
  });

  it("rejects below min reserve", () => {
    const r = new AuctionHouseRegistry(manifest());
    expect(r.quoteListing({ ...baseInput, reservePrice: 5 }).reason).toBe(
      "below-min-reserve",
    );
  });

  it("rejects above max price", () => {
    const r = new AuctionHouseRegistry(manifest());
    expect(
      r.quoteListing({ ...baseInput, reservePrice: 2_000_000 }).reason,
    ).toBe("above-max-price");
  });

  it("rejects stacks when forbidden", () => {
    const r = new AuctionHouseRegistry(
      manifest({
        listing: {
          durationsHours: [24],
          allowStacks: false,
          maxStackSize: 1,
        },
      }),
    );
    expect(r.quoteListing({ ...baseInput, stackSize: 5 }).reason).toBe(
      "stacks-forbidden",
    );
  });

  it("rejects stack too large", () => {
    const r = new AuctionHouseRegistry(manifest());
    expect(r.quoteListing({ ...baseInput, stackSize: 5000 }).reason).toBe(
      "stack-too-large",
    );
  });

  it("rejects char cap", () => {
    const r = new AuctionHouseRegistry(manifest());
    expect(
      r.quoteListing({ ...baseInput, charactersActiveListings: 50 }).reason,
    ).toBe("char-cap");
  });

  it("rejects account cap", () => {
    const r = new AuctionHouseRegistry(manifest());
    expect(
      r.quoteListing({ ...baseInput, accountActiveListings: 200 }).reason,
    ).toBe("account-cap");
  });
});

describe("AuctionHouseRegistry — bidding", () => {
  it("computes min acceptable bid via fraction", () => {
    const r = new AuctionHouseRegistry(manifest());
    // floor(1000 * 0.05) = 50, above floor of 10 -> 1050
    expect(r.minAcceptableBid(1000)).toBe(1050);
  });

  it("uses currency floor when fraction is smaller", () => {
    const r = new AuctionHouseRegistry(manifest());
    // floor(100 * 0.05) = 5, below floor of 10 -> 100+10=110
    expect(r.minAcceptableBid(100)).toBe(110);
  });

  it("allows valid bid", () => {
    const r = new AuctionHouseRegistry(manifest());
    const result = r.checkBid({
      currentHighBid: 1000,
      bidAmount: 1100,
      secondsUntilExpiry: 3600,
      isSelfBid: false,
    });
    expect(result.allowed).toBe(true);
    expect(result.expiryExtensionSec).toBe(0);
  });

  it("rejects below increment", () => {
    const r = new AuctionHouseRegistry(manifest());
    const result = r.checkBid({
      currentHighBid: 1000,
      bidAmount: 1020,
      secondsUntilExpiry: 3600,
      isSelfBid: false,
    });
    expect(result.reason).toBe("below-min-increment");
  });

  it("rejects expired listing", () => {
    const r = new AuctionHouseRegistry(manifest());
    const result = r.checkBid({
      currentHighBid: 1000,
      bidAmount: 1100,
      secondsUntilExpiry: 0,
      isSelfBid: false,
    });
    expect(result.reason).toBe("listing-expired");
  });

  it("rejects self-bid when policy is block", () => {
    const r = new AuctionHouseRegistry(manifest());
    const result = r.checkBid({
      currentHighBid: 1000,
      bidAmount: 1100,
      secondsUntilExpiry: 3600,
      isSelfBid: true,
    });
    expect(result.reason).toBe("self-bid-blocked");
  });

  it("allows self-bid when policy is log", () => {
    const r = new AuctionHouseRegistry(
      manifest({
        antiManipulation: {
          flagOverpricedFraction: 0,
          flagRapidListCancelSec: 0,
          flagSelfBidding: false,
          selfBidPolicy: "log",
        },
      }),
    );
    const result = r.checkBid({
      currentHighBid: 1000,
      bidAmount: 1100,
      secondsUntilExpiry: 3600,
      isSelfBid: true,
    });
    expect(result.allowed).toBe(true);
  });

  it("rejects bid on buyout-only listing", () => {
    const r = new AuctionHouseRegistry(
      manifest({
        listing: {
          model: "buyoutOnly",
          durationsHours: [24],
        },
      }),
    );
    const result = r.checkBid({
      currentHighBid: 1000,
      bidAmount: 1100,
      secondsUntilExpiry: 3600,
      isSelfBid: false,
    });
    expect(result.reason).toBe("buyout-only");
  });

  it("extends expiry on anti-snipe window", () => {
    const r = new AuctionHouseRegistry(manifest());
    const result = r.checkBid({
      currentHighBid: 1000,
      bidAmount: 1100,
      secondsUntilExpiry: 120,
      isSelfBid: false,
    });
    expect(result.allowed).toBe(true);
    expect(result.expiryExtensionSec).toBe(300);
  });

  it("no extension outside window", () => {
    const r = new AuctionHouseRegistry(manifest());
    const result = r.checkBid({
      currentHighBid: 1000,
      bidAmount: 1100,
      secondsUntilExpiry: 500,
      isSelfBid: false,
    });
    expect(result.expiryExtensionSec).toBe(0);
  });
});

describe("AuctionHouseRegistry — cancellation", () => {
  it("allows cancel with forfeit", () => {
    const r = new AuctionHouseRegistry(manifest());
    const result = r.checkCancel(60, false, 100);
    expect(result.allowed).toBe(true);
    expect(result.depositForfeit).toBe(100);
  });

  it("blocks when not allowed", () => {
    const r = new AuctionHouseRegistry(
      manifest({
        cancellation: {
          allowCancellation: false,
          forfeitDepositOnCancel: true,
          cancelBlockedWithinMinutesOfExpiry: 30,
          refundOutstandingBids: true,
        },
      }),
    );
    const result = r.checkCancel(60, false, 100);
    expect(result.reason).toBe("forbidden");
  });

  it("blocks within expiry window", () => {
    const r = new AuctionHouseRegistry(manifest());
    const result = r.checkCancel(10, false, 100);
    expect(result.reason).toBe("within-expiry-block");
  });

  it("blocks on expired listing", () => {
    const r = new AuctionHouseRegistry(
      manifest({
        cancellation: {
          allowCancellation: true,
          forfeitDepositOnCancel: true,
          cancelBlockedWithinMinutesOfExpiry: 0,
          refundOutstandingBids: true,
        },
      }),
    );
    const result = r.checkCancel(0, false, 100);
    expect(result.reason).toBe("listing-expired");
  });

  it("no forfeit when not configured", () => {
    const r = new AuctionHouseRegistry(
      manifest({
        cancellation: {
          allowCancellation: true,
          forfeitDepositOnCancel: false,
          cancelBlockedWithinMinutesOfExpiry: 30,
          refundOutstandingBids: true,
        },
      }),
    );
    const result = r.checkCancel(60, false, 100);
    expect(result.allowed).toBe(true);
    expect(result.depositForfeit).toBe(0);
  });
});

describe("AuctionHouseRegistry — fees", () => {
  it("computes commission", () => {
    const r = new AuctionHouseRegistry(manifest());
    expect(r.commissionOn(1000)).toBe(50);
  });

  it("computes seller payout", () => {
    const r = new AuctionHouseRegistry(manifest());
    expect(r.sellerPayout(1000)).toBe(950);
  });

  it("detects daily revenue cap when enforced", () => {
    const r = new AuctionHouseRegistry(
      manifest({
        fees: {
          commissionFraction: 0.05,
          currencyId: "gold",
          enforceDailyRevenueCap: true,
          dailyRevenueCapCurrency: 1_000_000,
        },
      }),
    );
    expect(r.isDailyRevenueOverCap(999_999)).toBe(false);
    expect(r.isDailyRevenueOverCap(1_000_000)).toBe(true);
  });

  it("never caps when disabled", () => {
    const r = new AuctionHouseRegistry(manifest());
    expect(r.isDailyRevenueOverCap(100_000_000)).toBe(false);
  });
});

describe("AuctionHouseRegistry — search", () => {
  it("enforces min query length", () => {
    const r = new AuctionHouseRegistry(manifest());
    expect(r.isSearchQueryLongEnough("a")).toBe(false);
    expect(r.isSearchQueryLongEnough("ab")).toBe(true);
    expect(r.isSearchQueryLongEnough("  a  ")).toBe(false);
  });

  it("enforces query rate", () => {
    const r = new AuctionHouseRegistry(manifest());
    expect(r.canSearchNow(29)).toBe(true);
    expect(r.canSearchNow(30)).toBe(false);
  });

  it("unlimited when maxQueriesPerMinute is 0", () => {
    const r = new AuctionHouseRegistry(
      manifest({
        search: {
          pageSize: 50,
          minQueryLength: 2,
          maxQueriesPerMinute: 0,
        },
      }),
    );
    expect(r.canSearchNow(10_000)).toBe(true);
  });
});

describe("AuctionHouseRegistry — anti-manipulation", () => {
  it("flags overpriced listings", () => {
    const r = new AuctionHouseRegistry(manifest());
    // threshold 0.5: overpriced if > median * 1.5
    expect(r.isOverpriced(100, 140)).toBe(false);
    expect(r.isOverpriced(100, 151)).toBe(true);
  });

  it("never flags when threshold is 0", () => {
    const r = new AuctionHouseRegistry(
      manifest({
        antiManipulation: {
          flagOverpricedFraction: 0,
          flagRapidListCancelSec: 0,
          flagSelfBidding: false,
          selfBidPolicy: "log",
        },
      }),
    );
    expect(r.isOverpriced(100, 10_000)).toBe(false);
  });

  it("never flags when median is 0", () => {
    const r = new AuctionHouseRegistry(manifest());
    expect(r.isOverpriced(0, 10_000)).toBe(false);
  });
});

describe("AuctionHouseRegistry — onReloaded", () => {
  it("fires after every successful load()", () => {
    const r = new AuctionHouseRegistry();
    const cb = vi.fn();
    r.onReloaded(cb);
    r.load(manifest());
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("returned unsubscribe stops further notifications", () => {
    const r = new AuctionHouseRegistry();
    const cb = vi.fn();
    const off = r.onReloaded(cb);
    r.load(manifest());
    off();
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("a throwing listener does not break subsequent listeners", () => {
    const r = new AuctionHouseRegistry();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const bad = vi.fn(() => {
      throw new Error("listener boom");
    });
    const good = vi.fn();
    r.onReloaded(bad);
    r.onReloaded(good);
    r.load(manifest());
    expect(bad).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
