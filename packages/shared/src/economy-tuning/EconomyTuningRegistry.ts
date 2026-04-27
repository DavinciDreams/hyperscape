/**
 * Economy tuning registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `economy-tuning.ts`.
 * Pure logic: currency lookup, vendor price math, cost-curve evaluation,
 * market-listing fee/commission calculation. Runtime
 * `VendorSystem`/`AuctionHouseSystem`/`RepairSystem` resolve per-event
 * values via this registry.
 */

import {
  type CostCurve,
  type Currency,
  type EconomyTuningManifest,
  type MarketRules,
  type VendorTuning,
  EconomyTuningManifestSchema,
} from "@hyperforge/manifest-schema";

export class EconomyNotLoadedError extends Error {
  constructor() {
    super("EconomyTuningRegistry used before load()");
    this.name = "EconomyNotLoadedError";
  }
}

export class UnknownCurrencyError extends Error {
  readonly currencyId: string;
  readonly availableIds: readonly string[];
  constructor(id: string, availableIds: readonly string[]) {
    super(
      `currency "${id}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownCurrencyError";
    this.currencyId = id;
    this.availableIds = availableIds;
  }
}

export class UnknownCostCurveError extends Error {
  readonly curveId: string;
  readonly availableIds: readonly string[];
  constructor(id: string, availableIds: readonly string[]) {
    super(
      `cost curve "${id}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownCostCurveError";
    this.curveId = id;
    this.availableIds = availableIds;
  }
}

/** Computed price pair for a vendor transaction. */
export interface VendorPrice {
  currencyId: string;
  /** What the vendor charges to sell the item to the player. */
  sellPrice: number;
  /** What the vendor pays to buy the item back from the player. */
  buybackPrice: number;
}

export interface CostCurveInputs {
  level?: number;
  tier?: number;
}

/** Market listing cost breakdown. */
export interface MarketQuote {
  listingFee: number;
  commission: number;
  /** Sale amount - commission. */
  sellerPayout: number;
}

/** Listener invoked after every successful `load()` / `loadFromJson()`. */
export type EconomyTuningReloadListener = () => void;

export class EconomyTuningRegistry {
  private _manifest: EconomyTuningManifest | null = null;
  private _currencies = new Map<string, Currency>();
  private _curves = new Map<string, CostCurve>();
  private _reloadListeners = new Set<EconomyTuningReloadListener>();

  constructor(manifest?: EconomyTuningManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: EconomyTuningManifest): void {
    this._manifest = manifest;
    this._currencies.clear();
    this._curves.clear();
    for (const c of manifest.currencies) this._currencies.set(c.id, c);
    for (const c of manifest.costCurves) this._curves.set(c.id, c);
    this._emitReloaded();
  }

  /**
   * Subscribe to reload notifications. Returns unsubscribe.
   * Listener throws are caught + logged. Pattern matches
   * `SkillIconsRegistry.onReloaded`.
   */
  onReloaded(cb: EconomyTuningReloadListener): () => void {
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
          "[economyTuningRegistry] reload listener threw:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  loadFromJson(raw: unknown): void {
    this.load(EconomyTuningManifestSchema.parse(raw));
  }

  isLoaded(): boolean {
    return this._manifest !== null;
  }

  get manifest(): EconomyTuningManifest {
    if (!this._manifest) throw new EconomyNotLoadedError();
    return this._manifest;
  }

  get vendor(): VendorTuning {
    return this.manifest.vendor;
  }

  get market(): MarketRules {
    return this.manifest.market;
  }

  /* --- currencies --- */

  hasCurrency(id: string): boolean {
    return this._currencies.has(id);
  }

  currency(id: string): Currency {
    const c = this._currencies.get(id);
    if (!c) {
      throw new UnknownCurrencyError(id, Array.from(this._currencies.keys()));
    }
    return c;
  }

  currencyIds(): string[] {
    return Array.from(this._currencies.keys());
  }

  /** Clamp an amount to a currency's cap (0 = no cap). */
  clampCurrencyAmount(currencyId: string, amount: number): number {
    const cur = this.currency(currencyId);
    const a = Math.max(0, Math.floor(amount));
    if (cur.cap === 0) return a;
    return Math.min(a, cur.cap);
  }

  /* --- vendor pricing --- */

  /**
   * Derive vendor sell/buyback prices from an item's base price.
   * Uses `defaultCurrencyId` unless overridden by caller.
   */
  vendorPriceFor(basePrice: number, currencyId?: string): VendorPrice {
    const v = this.vendor;
    const cid = currencyId ?? v.defaultCurrencyId;
    return {
      currencyId: cid,
      sellPrice: Math.max(0, Math.round(basePrice * v.vendorSellMultiplier)),
      buybackPrice: Math.max(
        0,
        Math.round(basePrice * v.vendorBuybackMultiplier),
      ),
    };
  }

  /**
   * Stock remaining after `minutesSinceLastRestock` elapse, given
   * current + max. Ticks atomically (each `stockRestockMinutes` adds
   * `stockRestockFraction * max`).
   */
  projectStock(
    currentStock: number,
    maxStock: number,
    minutesSinceLastRestock: number,
  ): number {
    const v = this.vendor;
    if (v.stockRestockMinutes === 0 || v.stockRestockFraction === 0) {
      return Math.min(currentStock, maxStock);
    }
    const ticks = Math.floor(minutesSinceLastRestock / v.stockRestockMinutes);
    if (ticks <= 0) return Math.min(currentStock, maxStock);
    const added = ticks * v.stockRestockFraction * maxStock;
    return Math.min(maxStock, Math.max(0, Math.floor(currentStock + added)));
  }

  /* --- cost curves --- */

  hasCurve(id: string): boolean {
    return this._curves.has(id);
  }

  curve(id: string): CostCurve {
    const c = this._curves.get(id);
    if (!c) {
      throw new UnknownCostCurveError(id, Array.from(this._curves.keys()));
    }
    return c;
  }

  /**
   * Evaluate a cost curve: `clamp(min, max, base + perLevel*level + perTier*tier)`.
   */
  evaluateCurve(curveId: string, inputs: CostCurveInputs = {}): number {
    const c = this.curve(curveId);
    const level = inputs.level ?? 0;
    const tier = inputs.tier ?? 0;
    const raw = c.base + c.perLevel * level + c.perTier * tier;
    if (raw < c.min) return c.min;
    if (raw > c.max) return c.max;
    return Math.max(0, Math.round(raw));
  }

  /* --- market --- */

  /**
   * Quote a market listing: listing fee, commission, seller payout on
   * successful sale.
   */
  quoteMarket(listingPrice: number): MarketQuote {
    const m = this.market;
    const commission = Math.round(listingPrice * m.salesCommission);
    return {
      listingFee: m.listingFee,
      commission,
      sellerPayout: Math.max(0, listingPrice - commission),
    };
  }

  /**
   * Is the player under their max concurrent-listing cap?
   */
  canListMore(currentListings: number): boolean {
    return (
      this.market.enabled && currentListings < this.market.maxListingsPerPlayer
    );
  }
}
