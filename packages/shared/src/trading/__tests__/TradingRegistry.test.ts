import { TradingManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import { TradingNotLoadedError, TradingRegistry } from "../TradingRegistry.js";

function manifest() {
  return TradingManifestSchema.parse({
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
      minGearScore: 100,
      minRarity: "uncommon",
      blockedItemIds: ["forbiddenRelic"],
    },
    currency: {
      allowPrimaryCurrency: true,
      maxCurrencyPerSide: 1_000_000,
      commission: 0.05,
      currencyId: "gold",
      blockPremiumCurrency: true,
    },
    eligibility: {
      allowCrossFaction: false,
      requireFriendship: false,
      minAccountAgeDays: 3,
      minCharacterLevel: 5,
      maxLevelGap: 30,
      blockIgnoredPlayers: true,
    },
    rateLimit: {
      maxTradesPerHour: 10,
      maxTradesPerDay: 50,
      minIntervalBetweenTradesSec: 5,
      maxRequestsPerHour: 30,
    },
    antiRmt: {
      asymmetryFlagThreshold: 0.1,
      logNewAccountTrades: true,
      logLargeCurrencyTrades: true,
      logCurrencyOnlyTrades: true,
      autoSuspendFlagThreshold: 3,
    },
  });
}

const baseEligibility = {
  requesterFaction: "alliance",
  recipientFaction: "alliance",
  areMutualFriends: false,
  requesterAccountAgeDays: 30,
  recipientAccountAgeDays: 30,
  requesterLevel: 20,
  recipientLevel: 25,
  eitherIgnoresOther: false,
};

describe("TradingRegistry — not loaded", () => {
  it("throws pre-load", () => {
    expect(() => new TradingRegistry().manifest).toThrow(TradingNotLoadedError);
  });
});

describe("TradingRegistry — eligibility", () => {
  it("allows valid trade", () => {
    const r = new TradingRegistry(manifest());
    expect(r.checkEligibility(baseEligibility).allowed).toBe(true);
  });

  it("rejects ignored", () => {
    const r = new TradingRegistry(manifest());
    const out = r.checkEligibility({
      ...baseEligibility,
      eitherIgnoresOther: true,
    });
    expect(out.reason).toBe("ignored");
  });

  it("rejects cross-faction", () => {
    const r = new TradingRegistry(manifest());
    const out = r.checkEligibility({
      ...baseEligibility,
      recipientFaction: "horde",
    });
    expect(out.reason).toBe("cross-faction-forbidden");
  });

  it("rejects new account", () => {
    const r = new TradingRegistry(manifest());
    const out = r.checkEligibility({
      ...baseEligibility,
      requesterAccountAgeDays: 1,
    });
    expect(out.reason).toBe("account-too-new");
  });

  it("rejects low level", () => {
    const r = new TradingRegistry(manifest());
    const out = r.checkEligibility({ ...baseEligibility, requesterLevel: 2 });
    expect(out.reason).toBe("level-too-low");
  });

  it("rejects level gap", () => {
    const r = new TradingRegistry(manifest());
    const out = r.checkEligibility({ ...baseEligibility, recipientLevel: 99 });
    expect(out.reason).toBe("level-gap-too-large");
  });
});

describe("TradingRegistry — items", () => {
  const baseItem = {
    itemId: "sword",
    isSoulbound: false,
    isBoa: false,
    senderAccountId: "a",
    recipientAccountId: "b",
    isQuestItem: false,
    gearScore: 500,
    rarity: "rare" as const,
  };

  it("allows a valid item", () => {
    const r = new TradingRegistry(manifest());
    expect(r.checkItem(baseItem).allowed).toBe(true);
  });

  it("rejects blocklisted item", () => {
    const r = new TradingRegistry(manifest());
    expect(r.checkItem({ ...baseItem, itemId: "forbiddenRelic" }).reason).toBe(
      "blocklisted",
    );
  });

  it("rejects soulbound", () => {
    const r = new TradingRegistry(manifest());
    expect(r.checkItem({ ...baseItem, isSoulbound: true }).reason).toBe(
      "soulbound-blocked",
    );
  });

  it("allows BoA same-account", () => {
    const r = new TradingRegistry(manifest());
    const out = r.checkItem({
      ...baseItem,
      isSoulbound: true,
      isBoa: true,
      senderAccountId: "same",
      recipientAccountId: "same",
    });
    expect(out.allowed).toBe(true);
  });

  it("rejects quest item", () => {
    const r = new TradingRegistry(manifest());
    expect(r.checkItem({ ...baseItem, isQuestItem: true }).reason).toBe(
      "quest-item-blocked",
    );
  });

  it("rejects low gear score", () => {
    const r = new TradingRegistry(manifest());
    expect(r.checkItem({ ...baseItem, gearScore: 50 }).reason).toBe(
      "below-gear-score",
    );
  });

  it("rejects below rarity", () => {
    const r = new TradingRegistry(manifest());
    expect(r.checkItem({ ...baseItem, rarity: "common" }).reason).toBe(
      "below-rarity",
    );
  });
});

describe("TradingRegistry — currency", () => {
  it("caps currency", () => {
    const r = new TradingRegistry(manifest());
    expect(r.isCurrencyWithinCap(500_000)).toBe(true);
    expect(r.isCurrencyWithinCap(2_000_000)).toBe(false);
  });

  it("computes commission + net", () => {
    const r = new TradingRegistry(manifest());
    expect(r.commissionOn(10_000)).toBe(500);
    expect(r.netCurrency(10_000)).toBe(9500);
  });
});

describe("TradingRegistry — rate limit", () => {
  it("allows fresh trade", () => {
    const r = new TradingRegistry(manifest());
    const out = r.checkRateLimit({
      tradesInLastHour: 0,
      tradesInLastDay: 0,
      secondsSinceLastTrade: 999,
      requestsInLastHour: 0,
    });
    expect(out.allowed).toBe(true);
  });

  it("rejects hourly cap", () => {
    const r = new TradingRegistry(manifest());
    const out = r.checkRateLimit({
      tradesInLastHour: 10,
      tradesInLastDay: 20,
      secondsSinceLastTrade: 999,
      requestsInLastHour: 0,
    });
    expect(out.reason).toBe("hourly-cap");
  });

  it("rejects cooldown", () => {
    const r = new TradingRegistry(manifest());
    const out = r.checkRateLimit({
      tradesInLastHour: 0,
      tradesInLastDay: 0,
      secondsSinceLastTrade: 2,
      requestsInLastHour: 0,
    });
    expect(out.reason).toBe("cooldown");
  });

  it("rejects request flood", () => {
    const r = new TradingRegistry(manifest());
    const out = r.checkRateLimit({
      tradesInLastHour: 0,
      tradesInLastDay: 0,
      secondsSinceLastTrade: 999,
      requestsInLastHour: 30,
    });
    expect(out.reason).toBe("request-flood");
  });
});

describe("TradingRegistry — session", () => {
  it("enforces distance", () => {
    const r = new TradingRegistry(manifest());
    expect(r.isWithinDistance(4)).toBe(true);
    expect(r.isWithinDistance(6)).toBe(false);
  });

  it("times out sessions", () => {
    const r = new TradingRegistry(manifest());
    expect(r.isSessionExpired(60)).toBe(false);
    expect(r.isSessionExpired(200)).toBe(true);
  });
});

describe("TradingRegistry — anti-RMT", () => {
  it("flags asymmetric trades", () => {
    const r = new TradingRegistry(manifest());
    const out = r.classifyAntiRmt(
      30,
      { itemCount: 1, currencyAmount: 0, estimatedValue: 1000 },
      { itemCount: 1, currencyAmount: 0, estimatedValue: 10 },
      0,
    );
    expect(out.flags).toContain("asymmetric");
  });

  it("flags new-account", () => {
    const r = new TradingRegistry(manifest());
    const out = r.classifyAntiRmt(
      1,
      { itemCount: 1, currencyAmount: 0, estimatedValue: 100 },
      { itemCount: 1, currencyAmount: 0, estimatedValue: 100 },
      0,
    );
    expect(out.flags).toContain("new-account");
  });

  it("flags large currency", () => {
    const r = new TradingRegistry(manifest());
    const out = r.classifyAntiRmt(
      30,
      { itemCount: 1, currencyAmount: 800_000, estimatedValue: 800_000 },
      { itemCount: 1, currencyAmount: 0, estimatedValue: 800_000 },
      0,
    );
    expect(out.flags).toContain("large-currency");
  });

  it("flags currency-only", () => {
    const r = new TradingRegistry(manifest());
    const out = r.classifyAntiRmt(
      30,
      { itemCount: 0, currencyAmount: 50, estimatedValue: 50 },
      { itemCount: 1, currencyAmount: 0, estimatedValue: 50 },
      0,
    );
    expect(out.flags).toContain("currency-only");
  });

  it("auto-suspends at threshold", () => {
    const r = new TradingRegistry(manifest());
    const out = r.classifyAntiRmt(
      1,
      { itemCount: 0, currencyAmount: 50, estimatedValue: 50 },
      { itemCount: 1, currencyAmount: 0, estimatedValue: 500 },
      2,
    );
    expect(out.autoSuspend).toBe(true);
  });
});
