/**
 * Faithfulness + defensiveness tests for `TradingManifestSchema`.
 */

import { describe, expect, it } from "vitest";

import { TradingManifestSchema, type TradingManifest } from "./trading.js";

const reference: TradingManifest = {
  enabled: true,
  session: {
    confirmMode: "bothConfirm",
    confirmCountdownSec: 5,
    sessionTimeoutSec: 120,
    maxItemSlotsPerSide: 12,
    maxDistanceMeters: 5,
    autoCancelOnDistance: true,
    resetConfirmOnChange: true,
  },
  items: {
    blockSoulbound: true,
    allowBoaBetweenSameAccount: true,
    blockQuestItems: true,
    minGearScore: 0,
    minRarity: "",
    blockedItemIds: ["itemArtifact", "itemEventToken"],
  },
  currency: {
    allowPrimaryCurrency: true,
    maxCurrencyPerSide: 10_000_000,
    commission: 0.02,
    currencyId: "gold",
    blockPremiumCurrency: true,
  },
  eligibility: {
    allowCrossFaction: false,
    requireFriendship: false,
    minAccountAgeDays: 3,
    minCharacterLevel: 5,
    maxLevelGap: 0,
    blockIgnoredPlayers: true,
  },
  rateLimit: {
    maxTradesPerHour: 30,
    maxTradesPerDay: 200,
    minIntervalBetweenTradesSec: 3,
    maxRequestsPerHour: 60,
  },
  antiRmt: {
    asymmetryFlagThreshold: 0.1,
    logNewAccountTrades: true,
    logLargeCurrencyTrades: true,
    logCurrencyOnlyTrades: true,
    autoSuspendFlagThreshold: 10,
  },
};

describe("TradingManifestSchema", () => {
  it("parses the reference manifest cleanly", () => {
    const result = TradingManifestSchema.safeParse(reference);
    if (!result.success) {
      throw new Error(
        `Reference manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("applies defaults on empty manifest", () => {
    const parsed = TradingManifestSchema.parse({});
    expect(parsed.enabled).toBe(true);
    expect(parsed.session.confirmMode).toBe("bothConfirm");
    expect(parsed.session.confirmCountdownSec).toBe(5);
    expect(parsed.session.sessionTimeoutSec).toBe(120);
    expect(parsed.session.maxItemSlotsPerSide).toBe(28);
    expect(parsed.session.maxDistanceMeters).toBe(5);
    expect(parsed.session.autoCancelOnDistance).toBe(true);
    expect(parsed.session.resetConfirmOnChange).toBe(true);
    expect(parsed.items.blockSoulbound).toBe(true);
    expect(parsed.items.blockQuestItems).toBe(true);
    expect(parsed.items.blockedItemIds).toEqual([]);
    expect(parsed.currency.allowPrimaryCurrency).toBe(true);
    expect(parsed.currency.commission).toBe(0);
    expect(parsed.currency.currencyId).toBe("gold");
    expect(parsed.currency.blockPremiumCurrency).toBe(true);
    expect(parsed.eligibility.allowCrossFaction).toBe(false);
    expect(parsed.eligibility.maxLevelGap).toBe(0);
    expect(parsed.eligibility.blockIgnoredPlayers).toBe(true);
    expect(parsed.rateLimit.maxTradesPerHour).toBe(30);
    expect(parsed.rateLimit.maxTradesPerDay).toBe(200);
    expect(parsed.antiRmt.logCurrencyOnlyTrades).toBe(true);
    expect(parsed.antiRmt.autoSuspendFlagThreshold).toBe(0);
  });

  it("accepts trading disabled", () => {
    expect(TradingManifestSchema.safeParse({ enabled: false }).success).toBe(
      true,
    );
  });

  it("rejects unknown confirmMode", () => {
    const bad = { session: { confirmMode: "magic" } };
    expect(TradingManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects confirmMode 'none' with sessionTimeoutSec=0", () => {
    const bad = {
      session: {
        confirmMode: "none",
        confirmCountdownSec: 0,
        sessionTimeoutSec: 0,
        maxItemSlotsPerSide: 12,
        maxDistanceMeters: 5,
        autoCancelOnDistance: true,
        resetConfirmOnChange: true,
      },
    };
    expect(TradingManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts confirmMode 'none' with sessionTimeoutSec > 0", () => {
    const ok = {
      session: {
        confirmMode: "none",
        confirmCountdownSec: 0,
        sessionTimeoutSec: 60,
        maxItemSlotsPerSide: 12,
        maxDistanceMeters: 5,
        autoCancelOnDistance: true,
        resetConfirmOnChange: true,
      },
    };
    expect(TradingManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects maxItemSlotsPerSide > 28", () => {
    const bad = { session: { maxItemSlotsPerSide: 99 } };
    expect(TradingManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts maxItemSlotsPerSide = 28 (legacy MAX_TRADE_SLOTS)", () => {
    const ok = { session: { maxItemSlotsPerSide: 28 } };
    expect(TradingManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("applies new session defaults for requestTimeoutSec and inactivityTimeoutSec", () => {
    const parsed = TradingManifestSchema.parse({});
    expect(parsed.session.requestTimeoutSec).toBe(30);
    expect(parsed.session.inactivityTimeoutSec).toBe(300);
  });

  it("applies new rateLimit defaults for perTargetRequestCooldownSec and maxOperationsPerSecond", () => {
    const parsed = TradingManifestSchema.parse({});
    expect(parsed.rateLimit.perTargetRequestCooldownSec).toBe(3);
    expect(parsed.rateLimit.maxOperationsPerSecond).toBe(10);
  });

  it("accepts inactivityTimeoutSec > sessionTimeoutSec (min(session,inactivity) wins at runtime)", () => {
    const ok = {
      session: { sessionTimeoutSec: 60, inactivityTimeoutSec: 300 },
    };
    expect(TradingManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("accepts inactivityTimeoutSec=0 as 'no inactivity guard' even when sessionTimeoutSec>0", () => {
    const ok = {
      session: { sessionTimeoutSec: 60, inactivityTimeoutSec: 0 },
    };
    expect(TradingManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects requestTimeoutSec > 300", () => {
    const bad = { session: { requestTimeoutSec: 301 } };
    expect(TradingManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects maxOperationsPerSecond < 1", () => {
    const bad = { rateLimit: { maxOperationsPerSecond: 0 } };
    expect(TradingManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects perTargetRequestCooldownSec > 600", () => {
    const bad = { rateLimit: { perTargetRequestCooldownSec: 601 } };
    expect(TradingManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects maxDistanceMeters < 0.5", () => {
    const bad = { session: { maxDistanceMeters: 0 } };
    expect(TradingManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects confirmCountdownSec > 60", () => {
    const bad = { session: { confirmCountdownSec: 300 } };
    expect(TradingManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate blockedItemIds", () => {
    const bad = {
      items: { blockedItemIds: ["itemA", "itemA"] },
    };
    expect(TradingManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects invalid blocked item id format", () => {
    const bad = {
      items: { blockedItemIds: ["Not Valid"] },
    };
    expect(TradingManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown minRarity", () => {
    const bad = { items: { minRarity: "unreal" } };
    expect(TradingManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts empty-string minRarity (no rarity gate)", () => {
    const ok = { items: { minRarity: "" } };
    expect(TradingManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("accepts rarity threshold", () => {
    const ok = { items: { minRarity: "rare" } };
    expect(TradingManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects commission > 1", () => {
    const bad = { currency: { commission: 1.5 } };
    expect(TradingManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects invalid currencyId format", () => {
    const bad = { currency: { currencyId: "Has Spaces" } };
    expect(TradingManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects maxCurrencyPerSide > 1B", () => {
    const bad = { currency: { maxCurrencyPerSide: 999_999_999_999 } };
    expect(TradingManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects minAccountAgeDays > 365", () => {
    const bad = { eligibility: { minAccountAgeDays: 9999 } };
    expect(TradingManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects minCharacterLevel > 100", () => {
    const bad = { eligibility: { minCharacterLevel: 500 } };
    expect(TradingManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts maxLevelGap=0 (no cap)", () => {
    const ok = { eligibility: { maxLevelGap: 0 } };
    expect(TradingManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects maxTradesPerDay < maxTradesPerHour", () => {
    const bad = {
      rateLimit: {
        maxTradesPerHour: 100,
        maxTradesPerDay: 50,
        minIntervalBetweenTradesSec: 3,
        maxRequestsPerHour: 60,
      },
    };
    expect(TradingManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects maxTradesPerHour = 0", () => {
    const bad = {
      rateLimit: {
        maxTradesPerHour: 0,
        maxTradesPerDay: 1,
        minIntervalBetweenTradesSec: 3,
        maxRequestsPerHour: 60,
      },
    };
    expect(TradingManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects asymmetryFlagThreshold > 1", () => {
    const bad = { antiRmt: { asymmetryFlagThreshold: 1.5 } };
    expect(TradingManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts autoSuspendFlagThreshold = 0 (disabled)", () => {
    const ok = { antiRmt: { autoSuspendFlagThreshold: 0 } };
    expect(TradingManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects unknown top-level field (strict mode)", () => {
    const bad = { extraField: "nope" };
    expect(TradingManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown field on session (strict mode)", () => {
    const bad = { session: { extraField: "nope" } };
    expect(TradingManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts cross-faction trade enabled", () => {
    const ok = { eligibility: { allowCrossFaction: true } };
    expect(TradingManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("accepts friendship-required mode", () => {
    const ok = { eligibility: { requireFriendship: true } };
    expect(TradingManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("accepts currency-only mode (allowPrimaryCurrency false)", () => {
    const ok = { currency: { allowPrimaryCurrency: false } };
    expect(TradingManifestSchema.safeParse(ok).success).toBe(true);
  });
});
