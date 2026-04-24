/**
 * Store-front registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `store-front.ts`.
 * Pure logic: bundle/shelf/price-tier lookup, regional price resolution,
 * publish-window gating, discount selection by priority, discounted
 * price math, purchase gates (age / daily cap / frequency). Runtime
 * `StoreFrontSystem` owns the checkout RPC, transaction ledger, and UI.
 */

import {
  type Bundle,
  type DiscountRule,
  type PriceTier,
  type Shelf,
  type StoreFrontManifest,
  StoreFrontManifestSchema,
} from "@hyperforge/manifest-schema";

export class StoreFrontNotLoadedError extends Error {
  constructor() {
    super("StoreFrontRegistry used before load()");
    this.name = "StoreFrontNotLoadedError";
  }
}

function notFound(kind: string, id: string, known: readonly string[]): Error {
  const e = new Error(
    `store-front ${kind} "${id}" not found. Known ids: ${
      known.length > 0 ? known.join(", ") : "(none loaded)"
    }`,
  );
  e.name = `Unknown${kind[0].toUpperCase()}${kind.slice(1)}Error`;
  return e;
}

export class UnknownBundleError extends Error {
  readonly bundleId: string;
  readonly availableIds: readonly string[];
  constructor(id: string, availableIds: readonly string[]) {
    super(
      `store-front bundle "${id}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownBundleError";
    this.bundleId = id;
    this.availableIds = availableIds;
  }
}

export class UnknownPriceTierError extends Error {
  readonly tierId: string;
  readonly availableIds: readonly string[];
  constructor(id: string, availableIds: readonly string[]) {
    super(
      `store-front priceTier "${id}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownPriceTierError";
    this.tierId = id;
    this.availableIds = availableIds;
  }
}

export class UnknownShelfError extends Error {
  readonly shelfId: string;
  readonly availableIds: readonly string[];
  constructor(id: string, availableIds: readonly string[]) {
    super(
      `store-front shelf "${id}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownShelfError";
    this.shelfId = id;
    this.availableIds = availableIds;
  }
}

export interface RegionalPrice {
  amountCents: number;
  currencyCode: string;
  /** True if falling back to canonical (no region-specific override). */
  fallback: boolean;
}

export type PurchaseReason =
  | "allowed"
  | "disabled"
  | "bundle-not-found"
  | "age-gate"
  | "pre-publish"
  | "post-expire"
  | "player-frequency-cap"
  | "daily-spend-cap"
  | "license-not-accepted";

export interface PurchaseCheckInput {
  bundleId: string;
  /** Player age in years. 0 = unknown (fails age gate if >0 required). */
  playerAgeYears: number;
  /** Current wall-clock ISO for publish-window comparison. */
  nowIso: string;
  /** How many times this player has bought this bundle already. */
  playerPurchaseCount: number;
  /** Player's total spend in cents today (running total). */
  spendTodayCents: number;
  /** Net charge (already discount-applied) for this prospective purchase. */
  netChargeCents: number;
  /** True if player has accepted the active license agreement. */
  licenseAccepted: boolean;
}

export interface PurchaseCheckResult {
  allowed: boolean;
  reason: PurchaseReason;
}

export interface DiscountedPrice {
  baseCents: number;
  finalCents: number;
  /** Chosen discount rule id; null if no rule applied. */
  discountRuleId: string | null;
  /** Bonus entitlement granted by the winning rule (empty when none). */
  bonusEntitlementId: string;
}

export class StoreFrontRegistry {
  private _manifest: StoreFrontManifest | null = null;
  private _tiersById = new Map<string, PriceTier>();
  private _bundlesById = new Map<string, Bundle>();
  private _shelvesById = new Map<string, Shelf>();
  private _rulesById = new Map<string, DiscountRule>();

  constructor(manifest?: StoreFrontManifest) {
    if (manifest) this.load(manifest);
  }

  isLoaded(): boolean {
    return this._manifest !== null;
  }

  load(manifest: StoreFrontManifest): void {
    this._manifest = manifest;
    this._tiersById.clear();
    this._bundlesById.clear();
    this._shelvesById.clear();
    this._rulesById.clear();
    for (const t of manifest.priceTiers) this._tiersById.set(t.id, t);
    for (const b of manifest.bundles) this._bundlesById.set(b.id, b);
    for (const s of manifest.shelves) this._shelvesById.set(s.id, s);
    for (const r of manifest.discountRules) this._rulesById.set(r.id, r);
  }

  loadFromJson(raw: unknown): void {
    this.load(StoreFrontManifestSchema.parse(raw));
  }

  get manifest(): StoreFrontManifest {
    if (!this._manifest) throw new StoreFrontNotLoadedError();
    return this._manifest;
  }

  get enabled(): boolean {
    return this.manifest.enabled;
  }

  /* --- lookups --- */

  hasBundle(id: string): boolean {
    return this._bundlesById.has(id);
  }

  bundle(id: string): Bundle {
    const b = this._bundlesById.get(id);
    if (!b) {
      throw new UnknownBundleError(id, Array.from(this._bundlesById.keys()));
    }
    return b;
  }

  bundleIds(): string[] {
    return Array.from(this._bundlesById.keys());
  }

  hasPriceTier(id: string): boolean {
    return this._tiersById.has(id);
  }

  priceTier(id: string): PriceTier {
    const t = this._tiersById.get(id);
    if (!t) {
      throw new UnknownPriceTierError(id, Array.from(this._tiersById.keys()));
    }
    return t;
  }

  hasShelf(id: string): boolean {
    return this._shelvesById.has(id);
  }

  shelf(id: string): Shelf {
    const s = this._shelvesById.get(id);
    if (!s) {
      throw new UnknownShelfError(id, Array.from(this._shelvesById.keys()));
    }
    return s;
  }

  /** Shelves sorted by authored displayOrder (ascending). */
  shelvesByDisplayOrder(): Shelf[] {
    return Array.from(this._shelvesById.values()).sort(
      (a, b) => a.displayOrder - b.displayOrder,
    );
  }

  /** Bundles filtered by category tag. */
  bundlesByCategory(tag: string): Bundle[] {
    return Array.from(this._bundlesById.values()).filter(
      (b) => b.categoryTag === tag,
    );
  }

  /* --- regional price --- */

  /**
   * Resolve a bundle's price in the given region. Returns the regional
   * override when present, else the canonical amount with a USD fallback
   * currency (authoring convention).
   */
  regionalPrice(
    bundleId: string,
    region: string,
    fallbackCurrency = "USD",
  ): RegionalPrice {
    const b = this.bundle(bundleId);
    const t = this.priceTier(b.priceTierId);
    const hit = t.regionAmounts.find((r) => r.region === region);
    if (hit) {
      return {
        amountCents: hit.amountCents,
        currencyCode: hit.currencyCode,
        fallback: false,
      };
    }
    return {
      amountCents: t.canonicalAmountCents,
      currencyCode: fallbackCurrency,
      fallback: true,
    };
  }

  /* --- publish window --- */

  /** True if `nowIso` falls within the bundle's publish window. */
  isPublished(bundleId: string, nowIso: string): boolean {
    const b = this.bundle(bundleId);
    if (b.publishAtIso !== "" && nowIso < b.publishAtIso) return false;
    if (b.expireAtIso !== "" && nowIso >= b.expireAtIso) return false;
    return true;
  }

  /* --- discounts --- */

  /**
   * Choose the discount rule to apply to a bundle at `nowIso`. Highest
   * `priority` wins; ties break by rule id for determinism. Returns
   * null if nothing applies.
   */
  pickDiscount(bundleId: string, nowIso: string): DiscountRule | null {
    const b = this.bundle(bundleId);
    const candidates = Array.from(this._rulesById.values()).filter((r) => {
      if (r.startAtIso !== "" && nowIso < r.startAtIso) return false;
      if (r.endAtIso !== "" && nowIso >= r.endAtIso) return false;
      if (r.bundleIds.includes(bundleId)) return true;
      if (r.categoryTag !== "" && r.categoryTag === b.categoryTag) return true;
      return false;
    });
    if (candidates.length === 0) return null;
    candidates.sort((a, c) => {
      if (c.priority !== a.priority) return c.priority - a.priority;
      return a.id.localeCompare(c.id);
    });
    return candidates[0];
  }

  /**
   * Apply the best-fit discount rule to the canonical (or regional) base
   * price for a bundle. Clamps final price to ≥ 0.
   */
  priceWithDiscount(
    bundleId: string,
    baseCents: number,
    nowIso: string,
  ): DiscountedPrice {
    const rule = this.pickDiscount(bundleId, nowIso);
    if (!rule) {
      return {
        baseCents,
        finalCents: baseCents,
        discountRuleId: null,
        bonusEntitlementId: "",
      };
    }
    let finalCents = baseCents;
    if (rule.kind === "percentOff") {
      const off = Math.floor((baseCents * rule.amount) / 100);
      finalCents = Math.max(0, baseCents - off);
    } else if (rule.kind === "flatCentsOff") {
      finalCents = Math.max(0, baseCents - rule.amount);
    }
    return {
      baseCents,
      finalCents,
      discountRuleId: rule.id,
      bonusEntitlementId:
        rule.kind === "bonusEntitlement" ? rule.bonusEntitlementId : "",
    };
  }

  /* --- purchase gate --- */

  checkPurchase(input: PurchaseCheckInput): PurchaseCheckResult {
    if (!this.enabled) return { allowed: false, reason: "disabled" };
    if (!this._bundlesById.has(input.bundleId)) {
      return { allowed: false, reason: "bundle-not-found" };
    }
    const b = this.bundle(input.bundleId);
    if (this.manifest.requiresLicenseAgreement && !input.licenseAccepted) {
      return { allowed: false, reason: "license-not-accepted" };
    }
    if (b.minAgeYears > 0 && input.playerAgeYears < b.minAgeYears) {
      return { allowed: false, reason: "age-gate" };
    }
    if (b.publishAtIso !== "" && input.nowIso < b.publishAtIso) {
      return { allowed: false, reason: "pre-publish" };
    }
    if (b.expireAtIso !== "" && input.nowIso >= b.expireAtIso) {
      return { allowed: false, reason: "post-expire" };
    }
    if (
      b.maxPurchasesPerPlayer > 0 &&
      input.playerPurchaseCount >= b.maxPurchasesPerPlayer
    ) {
      return { allowed: false, reason: "player-frequency-cap" };
    }
    const cap = this.manifest.globalDailySpendCapCents;
    if (cap > 0 && input.spendTodayCents + input.netChargeCents > cap) {
      return { allowed: false, reason: "daily-spend-cap" };
    }
    return { allowed: true, reason: "allowed" };
  }
}
