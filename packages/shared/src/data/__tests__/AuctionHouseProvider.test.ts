/**
 * Tests for the AuctionHouseProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { auctionHouseProvider } from "../AuctionHouseProvider";

beforeEach(() => {
  auctionHouseProvider.unload();
});
afterEach(() => {
  auctionHouseProvider.unload();
});

describe("AuctionHouseProvider", () => {
  it("starts unloaded", () => {
    expect(auctionHouseProvider.isLoaded()).toBe(false);
    expect(auctionHouseProvider.getManifest()).toBeNull();
  });

  it("loadRaw() accepts empty blob and fills defaults", () => {
    const parsed = auctionHouseProvider.loadRaw({});
    expect(parsed.enabled).toBe(true);
    expect(parsed.listing).toBeDefined();
    expect(parsed.bidding).toBeDefined();
    expect(parsed.cancellation).toBeDefined();
    expect(parsed.fees).toBeDefined();
    expect(parsed.search).toBeDefined();
    expect(parsed.antiManipulation).toBeDefined();
    expect(auctionHouseProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() accepts {enabled:false} baseline", () => {
    const parsed = auctionHouseProvider.loadRaw({ enabled: false });
    expect(parsed.enabled).toBe(false);
    expect(auctionHouseProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() rejects buyoutOnly with minIncrement=0 check — accepts (buyout bypasses bid refinement)", () => {
    const parsed = auctionHouseProvider.loadRaw({
      listing: { model: "buyoutOnly" },
      bidding: { minIncrementFraction: 0 },
    });
    expect(parsed.listing.model).toBe("buyoutOnly");
  });

  it("loadRaw() rejects bidOnly with minIncrementFraction=0", () => {
    expect(() =>
      auctionHouseProvider.loadRaw({
        listing: { model: "bidOnly" },
        bidding: { minIncrementFraction: 0 },
      }),
    ).toThrow();
  });

  it("loadRaw() rejects bidAndBuyout with minIncrementFraction=0", () => {
    expect(() =>
      auctionHouseProvider.loadRaw({
        listing: { model: "bidAndBuyout" },
        bidding: { minIncrementFraction: 0 },
      }),
    ).toThrow();
  });

  it("loadRaw() rejects empty durationsHours", () => {
    expect(() =>
      auctionHouseProvider.loadRaw({
        listing: { durationsHours: [] },
      }),
    ).toThrow();
  });

  it("loadRaw() rejects duplicate durationsHours", () => {
    expect(() =>
      auctionHouseProvider.loadRaw({
        listing: { durationsHours: [12, 24, 24] },
      }),
    ).toThrow();
  });

  it("loadRaw() rejects non-strictly-increasing durationsHours", () => {
    expect(() =>
      auctionHouseProvider.loadRaw({
        listing: { durationsHours: [48, 24, 12] },
      }),
    ).toThrow();
  });

  it("loadRaw() rejects maxListingsPerAccount < maxListingsPerCharacter", () => {
    expect(() =>
      auctionHouseProvider.loadRaw({
        listing: {
          maxListingsPerAccount: 10,
          maxListingsPerCharacter: 50,
        },
      }),
    ).toThrow();
  });

  it("loadRaw() rejects antiSnipeWindowSec>0 with antiSnipeExtensionSec=0", () => {
    expect(() =>
      auctionHouseProvider.loadRaw({
        bidding: {
          antiSnipeWindowSec: 300,
          antiSnipeExtensionSec: 0,
        },
      }),
    ).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = auctionHouseProvider.loadRaw({});
    auctionHouseProvider.unload();
    auctionHouseProvider.load(parsed);
    expect(auctionHouseProvider.isLoaded()).toBe(true);
  });

  it("hotReload() replaces the manifest", () => {
    auctionHouseProvider.loadRaw({});
    const parsed = auctionHouseProvider.loadRaw({ enabled: false });
    auctionHouseProvider.hotReload(parsed);
    expect(auctionHouseProvider.getManifest()?.enabled).toBe(false);
  });

  it("hotReload(null) clears the manifest", () => {
    auctionHouseProvider.loadRaw({});
    auctionHouseProvider.hotReload(null);
    expect(auctionHouseProvider.isLoaded()).toBe(false);
  });

  it("unload() clears a loaded manifest", () => {
    auctionHouseProvider.loadRaw({});
    auctionHouseProvider.unload();
    expect(auctionHouseProvider.isLoaded()).toBe(false);
  });
});
