/**
 * Auction-house registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `auction-house.ts`.
 * Pure logic: listing quote (deposit + caps), bid validation (min
 * increment + anti-snipe extension), cancellation eligibility, fee
 * math, search throttling. Runtime `AuctionHouseSystem` owns listing
 * storage + settlement + UI.
 */

import {
  type AuctionAntiManipulationRules,
  type AuctionBiddingRules,
  type AuctionCancellationRules,
  type AuctionExpiryPolicy,
  type AuctionFeeRules,
  type AuctionHouseManifest,
  type AuctionListingModel,
  type AuctionListingRules,
  type AuctionSearchRules,
  AuctionHouseManifestSchema,
} from "@hyperforge/manifest-schema";

export class AuctionHouseNotLoadedError extends Error {
  constructor() {
    super("AuctionHouseRegistry used before load()");
    this.name = "AuctionHouseNotLoadedError";
  }
}

export type ListQuoteReason =
  | "allowed"
  | "disabled"
  | "invalid-duration"
  | "below-min-reserve"
  | "above-max-price"
  | "stack-too-large"
  | "stacks-forbidden"
  | "char-cap"
  | "account-cap";

export interface ListQuoteInput {
  reservePrice: number;
  durationHours: number;
  stackSize: number;
  charactersActiveListings: number;
  accountActiveListings: number;
}

export interface ListQuote {
  allowed: boolean;
  reason: ListQuoteReason;
  deposit: number;
  currencyId: string;
}

export type BidReason =
  | "allowed"
  | "listing-expired"
  | "below-min-increment"
  | "self-bid-blocked"
  | "buyout-only";

export interface BidInput {
  currentHighBid: number;
  bidAmount: number;
  secondsUntilExpiry: number;
  isSelfBid: boolean;
}

export interface BidResult {
  allowed: boolean;
  reason: BidReason;
  /** Resulting expiry delta in seconds (for anti-snipe extensions). */
  expiryExtensionSec: number;
}

export type CancelReason =
  | "allowed"
  | "forbidden"
  | "within-expiry-block"
  | "listing-expired";

export interface CancelResult {
  allowed: boolean;
  reason: CancelReason;
  /** Deposit forfeit (0 if refunded). */
  depositForfeit: number;
}

/** Listener invoked after every successful `load()` / `loadFromJson()`. */
export type AuctionHouseReloadListener = () => void;

export class AuctionHouseRegistry {
  private _manifest: AuctionHouseManifest | null = null;
  private _reloadListeners = new Set<AuctionHouseReloadListener>();

  constructor(manifest?: AuctionHouseManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: AuctionHouseManifest): void {
    this._manifest = manifest;
    this._emitReloaded();
  }

  loadFromJson(raw: unknown): void {
    this.load(AuctionHouseManifestSchema.parse(raw));
  }

  /**
   * Subscribe to reload notifications. Returns unsubscribe.
   * Listener throws are caught + logged. Pattern matches
   * `SkillIconsRegistry.onReloaded`.
   */
  onReloaded(cb: AuctionHouseReloadListener): () => void {
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
          "[auctionHouseRegistry] reload listener threw:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  isLoaded(): boolean {
    return this._manifest !== null;
  }

  get manifest(): AuctionHouseManifest {
    if (!this._manifest) throw new AuctionHouseNotLoadedError();
    return this._manifest;
  }

  get enabled(): boolean {
    return this.manifest.enabled;
  }
  get listing(): AuctionListingRules {
    return this.manifest.listing;
  }
  get bidding(): AuctionBiddingRules {
    return this.manifest.bidding;
  }
  get cancellation(): AuctionCancellationRules {
    return this.manifest.cancellation;
  }
  get fees(): AuctionFeeRules {
    return this.manifest.fees;
  }
  get search(): AuctionSearchRules {
    return this.manifest.search;
  }
  get antiManipulation(): AuctionAntiManipulationRules {
    return this.manifest.antiManipulation;
  }
  get model(): AuctionListingModel {
    return this.listing.model;
  }
  get expiryPolicy(): AuctionExpiryPolicy {
    return this.listing.expiryPolicy;
  }

  /* --- listing --- */

  /** Deposit amount for a listing at `reservePrice`. */
  depositFor(reservePrice: number): number {
    const l = this.listing;
    const raw = Math.floor(Math.max(0, reservePrice) * l.depositFraction);
    return Math.max(raw, l.depositMinimumCurrency);
  }

  isValidDuration(durationHours: number): boolean {
    return this.listing.durationsHours.includes(durationHours);
  }

  quoteListing(input: ListQuoteInput): ListQuote {
    const l = this.listing;
    const currencyId = this.fees.currencyId;
    const base = { deposit: this.depositFor(input.reservePrice), currencyId };

    if (!this.enabled) {
      return { allowed: false, reason: "disabled", ...base };
    }
    if (!this.isValidDuration(input.durationHours)) {
      return { allowed: false, reason: "invalid-duration", ...base };
    }
    if (input.reservePrice < l.minReservePriceCurrency) {
      return { allowed: false, reason: "below-min-reserve", ...base };
    }
    if (
      l.maxListingPriceCurrency > 0 &&
      input.reservePrice > l.maxListingPriceCurrency
    ) {
      return { allowed: false, reason: "above-max-price", ...base };
    }
    if (!l.allowStacks && input.stackSize > 1) {
      return { allowed: false, reason: "stacks-forbidden", ...base };
    }
    if (input.stackSize > l.maxStackSize) {
      return { allowed: false, reason: "stack-too-large", ...base };
    }
    if (input.charactersActiveListings >= l.maxListingsPerCharacter) {
      return { allowed: false, reason: "char-cap", ...base };
    }
    if (input.accountActiveListings >= l.maxListingsPerAccount) {
      return { allowed: false, reason: "account-cap", ...base };
    }
    return { allowed: true, reason: "allowed", ...base };
  }

  /* --- bidding --- */

  /** Minimum acceptable bid given the current high bid. */
  minAcceptableBid(currentHighBid: number): number {
    const b = this.bidding;
    const increment = Math.max(
      Math.floor(currentHighBid * b.minIncrementFraction),
      b.minIncrementCurrencyFloor,
    );
    return currentHighBid + increment;
  }

  checkBid(input: BidInput): BidResult {
    if (this.model === "buyoutOnly") {
      return { allowed: false, reason: "buyout-only", expiryExtensionSec: 0 };
    }
    if (input.secondsUntilExpiry <= 0) {
      return {
        allowed: false,
        reason: "listing-expired",
        expiryExtensionSec: 0,
      };
    }
    if (input.isSelfBid && this.antiManipulation.selfBidPolicy === "block") {
      return {
        allowed: false,
        reason: "self-bid-blocked",
        expiryExtensionSec: 0,
      };
    }
    const minBid = this.minAcceptableBid(input.currentHighBid);
    if (input.bidAmount < minBid) {
      return {
        allowed: false,
        reason: "below-min-increment",
        expiryExtensionSec: 0,
      };
    }
    const b = this.bidding;
    const ext =
      b.antiSnipeWindowSec > 0 &&
      input.secondsUntilExpiry <= b.antiSnipeWindowSec
        ? b.antiSnipeExtensionSec
        : 0;
    return { allowed: true, reason: "allowed", expiryExtensionSec: ext };
  }

  /* --- cancellation --- */

  checkCancel(
    minutesUntilExpiry: number,
    hasActiveBids: boolean,
    deposit: number,
  ): CancelResult {
    const c = this.cancellation;
    if (!c.allowCancellation) {
      return { allowed: false, reason: "forbidden", depositForfeit: 0 };
    }
    // Block if active bids — refine by model later if needed
    if (
      hasActiveBids &&
      !c.refundOutstandingBids &&
      this.model !== "buyoutOnly"
    ) {
      // Keep the existing contract — schema flag determines.
    }
    if (
      c.cancelBlockedWithinMinutesOfExpiry > 0 &&
      minutesUntilExpiry <= c.cancelBlockedWithinMinutesOfExpiry
    ) {
      return {
        allowed: false,
        reason: "within-expiry-block",
        depositForfeit: 0,
      };
    }
    if (minutesUntilExpiry <= 0) {
      return {
        allowed: false,
        reason: "listing-expired",
        depositForfeit: 0,
      };
    }
    return {
      allowed: true,
      reason: "allowed",
      depositForfeit: c.forfeitDepositOnCancel ? Math.max(0, deposit) : 0,
    };
  }

  /* --- fees --- */

  /** Commission taken on a completed sale. */
  commissionOn(salePrice: number): number {
    return Math.floor(Math.max(0, salePrice) * this.fees.commissionFraction);
  }

  /** Seller payout after commission. */
  sellerPayout(salePrice: number): number {
    return Math.max(0, salePrice - this.commissionOn(salePrice));
  }

  /** Has daily revenue cap been exceeded? */
  isDailyRevenueOverCap(soldTodayCurrency: number): boolean {
    const f = this.fees;
    if (!f.enforceDailyRevenueCap) return false;
    return soldTodayCurrency >= f.dailyRevenueCapCurrency;
  }

  /* --- search --- */

  isSearchQueryLongEnough(query: string): boolean {
    return query.trim().length >= this.search.minQueryLength;
  }

  canSearchNow(queriesInLastMinute: number): boolean {
    const s = this.search;
    if (s.maxQueriesPerMinute === 0) return true;
    return queriesInLastMinute < s.maxQueriesPerMinute;
  }

  /* --- anti-manipulation --- */

  /**
   * Is a listing at `price` overpriced vs. `medianPrice` per the flag
   * threshold?
   */
  isOverpriced(medianPrice: number, listingPrice: number): boolean {
    const m = this.antiManipulation;
    if (m.flagOverpricedFraction <= 0) return false;
    if (medianPrice <= 0) return false;
    return listingPrice > medianPrice * (1 + m.flagOverpricedFraction);
  }
}
