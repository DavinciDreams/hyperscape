/**
 * Trading registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `trading.ts`.
 * Pure logic: eligibility checks, item restriction evaluation,
 * currency caps + commission, rate-limit gating, anti-RMT classification.
 * Runtime `TradeSystem` owns escrow + state machine + UI.
 */

import {
  type TradeAntiRmtRules,
  type TradeConfirmMode,
  type TradeCurrencyRules,
  type TradeEligibilityRules,
  type TradeItemRestrictions,
  type TradeRateLimitRules,
  type TradeSessionRules,
  type TradingManifest,
  TradingManifestSchema,
} from "@hyperforge/manifest-schema";

export class TradingNotLoadedError extends Error {
  constructor() {
    super("TradingRegistry used before load()");
    this.name = "TradingNotLoadedError";
  }
}

const RARITY_ORDER = [
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary",
  "mythic",
] as const;

export type TradingRarity = (typeof RARITY_ORDER)[number];

export type TradeEligibilityReason =
  | "allowed"
  | "disabled"
  | "cross-faction-forbidden"
  | "friendship-required"
  | "account-too-new"
  | "level-too-low"
  | "level-gap-too-large"
  | "ignored";

export interface TradeEligibilityInput {
  requesterFaction: string;
  recipientFaction: string;
  areMutualFriends: boolean;
  requesterAccountAgeDays: number;
  recipientAccountAgeDays: number;
  requesterLevel: number;
  recipientLevel: number;
  /** True if either side ignores the other. */
  eitherIgnoresOther: boolean;
}

export interface TradeEligibilityResult {
  allowed: boolean;
  reason: TradeEligibilityReason;
}

export type TradeItemReason =
  | "allowed"
  | "soulbound-blocked"
  | "quest-item-blocked"
  | "below-gear-score"
  | "below-rarity"
  | "blocklisted";

export interface TradeItemInput {
  itemId: string;
  isSoulbound: boolean;
  isBoa: boolean;
  senderAccountId: string;
  recipientAccountId: string;
  isQuestItem: boolean;
  gearScore: number;
  rarity: TradingRarity;
}

export interface TradeItemResult {
  allowed: boolean;
  reason: TradeItemReason;
}

export type TradeRateLimitReason =
  | "allowed"
  | "hourly-cap"
  | "daily-cap"
  | "cooldown"
  | "request-flood";

export interface TradeRateLimitInput {
  tradesInLastHour: number;
  tradesInLastDay: number;
  secondsSinceLastTrade: number;
  requestsInLastHour: number;
}

export interface TradeRateLimitResult {
  allowed: boolean;
  reason: TradeRateLimitReason;
}

/** A trade offer's currency/item breakdown, for anti-RMT classification. */
export interface TradeOfferSnapshot {
  itemCount: number;
  currencyAmount: number;
  estimatedValue: number;
}

export type AntiRmtFlag =
  | "asymmetric"
  | "new-account"
  | "large-currency"
  | "currency-only";

export interface AntiRmtReport {
  flags: readonly AntiRmtFlag[];
  autoSuspend: boolean;
}

/** Listener invoked after every successful `load()` / `loadFromJson()`. */
export type TradingReloadListener = () => void;

export class TradingRegistry {
  private _manifest: TradingManifest | null = null;
  private _reloadListeners = new Set<TradingReloadListener>();

  constructor(manifest?: TradingManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: TradingManifest): void {
    this._manifest = manifest;
    this._emitReloaded();
  }

  loadFromJson(raw: unknown): void {
    this.load(TradingManifestSchema.parse(raw));
  }

  /**
   * Subscribe to reload notifications. Returns unsubscribe.
   * Listener throws are caught + logged. Pattern matches
   * `SkillIconsRegistry.onReloaded`.
   */
  onReloaded(cb: TradingReloadListener): () => void {
    this._reloadListeners.add(cb);
    return () => {
      this._reloadListeners.delete(cb);
    };
  }

  private _emitReloaded(): void {
    if (this._reloadListeners.size === 0) return;
    for (const cb of this._reloadListeners) {
      try {
        cb();
      } catch (err) {
        console.warn(
          "[tradingRegistry] reload listener threw:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  isLoaded(): boolean {
    return this._manifest !== null;
  }

  get manifest(): TradingManifest {
    if (!this._manifest) throw new TradingNotLoadedError();
    return this._manifest;
  }

  get enabled(): boolean {
    return this.manifest.enabled;
  }
  get session(): TradeSessionRules {
    return this.manifest.session;
  }
  get items(): TradeItemRestrictions {
    return this.manifest.items;
  }
  get currency(): TradeCurrencyRules {
    return this.manifest.currency;
  }
  get eligibility(): TradeEligibilityRules {
    return this.manifest.eligibility;
  }
  get rateLimit(): TradeRateLimitRules {
    return this.manifest.rateLimit;
  }
  get antiRmt(): TradeAntiRmtRules {
    return this.manifest.antiRmt;
  }
  get confirmMode(): TradeConfirmMode {
    return this.session.confirmMode;
  }

  /* --- eligibility --- */

  checkEligibility(input: TradeEligibilityInput): TradeEligibilityResult {
    if (!this.enabled) return { allowed: false, reason: "disabled" };
    const e = this.eligibility;
    if (e.blockIgnoredPlayers && input.eitherIgnoresOther) {
      return { allowed: false, reason: "ignored" };
    }
    if (
      !e.allowCrossFaction &&
      input.requesterFaction !== input.recipientFaction
    ) {
      return { allowed: false, reason: "cross-faction-forbidden" };
    }
    if (e.requireFriendship && !input.areMutualFriends) {
      return { allowed: false, reason: "friendship-required" };
    }
    if (
      e.minAccountAgeDays > 0 &&
      (input.requesterAccountAgeDays < e.minAccountAgeDays ||
        input.recipientAccountAgeDays < e.minAccountAgeDays)
    ) {
      return { allowed: false, reason: "account-too-new" };
    }
    if (
      input.requesterLevel < e.minCharacterLevel ||
      input.recipientLevel < e.minCharacterLevel
    ) {
      return { allowed: false, reason: "level-too-low" };
    }
    if (e.maxLevelGap > 0) {
      const gap = Math.abs(input.requesterLevel - input.recipientLevel);
      if (gap > e.maxLevelGap) {
        return { allowed: false, reason: "level-gap-too-large" };
      }
    }
    return { allowed: true, reason: "allowed" };
  }

  /* --- items --- */

  checkItem(input: TradeItemInput): TradeItemResult {
    const r = this.items;
    if (r.blockedItemIds.includes(input.itemId)) {
      return { allowed: false, reason: "blocklisted" };
    }
    if (input.isSoulbound && r.blockSoulbound) {
      // BoA + same-account is an allowed subset of soulbound.
      if (
        input.isBoa &&
        r.allowBoaBetweenSameAccount &&
        input.senderAccountId === input.recipientAccountId
      ) {
        // ok — falls through to remaining checks
      } else {
        return { allowed: false, reason: "soulbound-blocked" };
      }
    }
    if (input.isQuestItem && r.blockQuestItems) {
      return { allowed: false, reason: "quest-item-blocked" };
    }
    if (r.minGearScore > 0 && input.gearScore < r.minGearScore) {
      return { allowed: false, reason: "below-gear-score" };
    }
    if (r.minRarity !== "") {
      const min = RARITY_ORDER.indexOf(r.minRarity as TradingRarity);
      const actual = RARITY_ORDER.indexOf(input.rarity);
      if (actual < min) return { allowed: false, reason: "below-rarity" };
    }
    return { allowed: true, reason: "allowed" };
  }

  /* --- currency --- */

  /** Is the currency amount within per-side cap? */
  isCurrencyWithinCap(amount: number): boolean {
    return amount >= 0 && amount <= this.currency.maxCurrencyPerSide;
  }

  /** Commission on a currency amount (rounded toward zero). */
  commissionOn(amount: number): number {
    return Math.floor(Math.max(0, amount) * this.currency.commission);
  }

  /** Net currency delivered to recipient after commission. */
  netCurrency(amount: number): number {
    return Math.max(0, amount - this.commissionOn(amount));
  }

  /* --- rate limit --- */

  checkRateLimit(input: TradeRateLimitInput): TradeRateLimitResult {
    const r = this.rateLimit;
    if (input.tradesInLastHour >= r.maxTradesPerHour) {
      return { allowed: false, reason: "hourly-cap" };
    }
    if (input.tradesInLastDay >= r.maxTradesPerDay) {
      return { allowed: false, reason: "daily-cap" };
    }
    if (input.secondsSinceLastTrade < r.minIntervalBetweenTradesSec) {
      return { allowed: false, reason: "cooldown" };
    }
    if (input.requestsInLastHour >= r.maxRequestsPerHour) {
      return { allowed: false, reason: "request-flood" };
    }
    return { allowed: true, reason: "allowed" };
  }

  /* --- session --- */

  /**
   * Is the distance between trading players within policy? Trade must
   * auto-cancel iff `autoCancelOnDistance` and `distance > maxDistanceMeters`.
   */
  isWithinDistance(distanceMeters: number): boolean {
    return distanceMeters <= this.session.maxDistanceMeters;
  }

  /** Has the session timed out? `timeout=0` means never. */
  isSessionExpired(elapsedSec: number): boolean {
    const t = this.session.sessionTimeoutSec;
    if (t === 0) return false;
    return elapsedSec >= t;
  }

  /* --- anti-RMT --- */

  classifyAntiRmt(
    requesterAccountAgeDays: number,
    requesterOffer: TradeOfferSnapshot,
    recipientOffer: TradeOfferSnapshot,
    flagsInLast24h: number,
  ): AntiRmtReport {
    const a = this.antiRmt;
    const flags: AntiRmtFlag[] = [];

    // asymmetry
    if (a.asymmetryFlagThreshold > 0) {
      const a1 = requesterOffer.estimatedValue;
      const a2 = recipientOffer.estimatedValue;
      const hi = Math.max(a1, a2);
      if (hi > 0) {
        const lo = Math.min(a1, a2);
        if (lo / hi < a.asymmetryFlagThreshold) flags.push("asymmetric");
      }
    }

    // new-account
    if (
      a.logNewAccountTrades &&
      requesterAccountAgeDays < this.eligibility.minAccountAgeDays
    ) {
      flags.push("new-account");
    }

    // large currency
    if (a.logLargeCurrencyTrades) {
      const cap = this.currency.maxCurrencyPerSide;
      const half = cap * 0.5;
      if (
        requesterOffer.currencyAmount > half ||
        recipientOffer.currencyAmount > half
      ) {
        flags.push("large-currency");
      }
    }

    // currency-only — one side item-less with positive currency
    if (a.logCurrencyOnlyTrades) {
      const reqCurrencyOnly =
        requesterOffer.itemCount === 0 && requesterOffer.currencyAmount > 0;
      const recCurrencyOnly =
        recipientOffer.itemCount === 0 && recipientOffer.currencyAmount > 0;
      if (reqCurrencyOnly || recCurrencyOnly) flags.push("currency-only");
    }

    const autoSuspend =
      a.autoSuspendFlagThreshold > 0 &&
      flagsInLast24h + flags.length >= a.autoSuspendFlagThreshold;

    return { flags, autoSuspend };
  }
}
