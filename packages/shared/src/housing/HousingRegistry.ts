/**
 * Housing registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `housing.ts`.
 * Pure logic: plot-type lookup (by id / category), purchase gate,
 * slot cap lookup, upkeep state-machine classification, visitor cap,
 * permission tier comparison. Runtime `HousingSystem` owns ownership
 * state + placement + UI.
 */

import {
  type HousingCustomizationRules,
  type HousingManifest,
  type HousingPermissionRules,
  type HousingPermissionTier,
  type HousingPlotCategory,
  type HousingPlotType,
  type HousingSlotCaps,
  type HousingUpkeepRules,
  type HousingVisitorRules,
  HousingManifestSchema,
} from "@hyperforge/manifest-schema";

export class HousingNotLoadedError extends Error {
  constructor() {
    super("HousingRegistry used before load()");
    this.name = "HousingNotLoadedError";
  }
}

export class UnknownPlotTypeError extends Error {
  readonly plotTypeId: string;
  readonly availableIds: readonly string[];
  constructor(id: string, availableIds: readonly string[]) {
    super(
      `housing plotType "${id}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownPlotTypeError";
    this.plotTypeId = id;
    this.availableIds = availableIds;
  }
}

export type PurchaseReason =
  | "allowed"
  | "disabled"
  | "below-level"
  | "char-plot-cap"
  | "account-plot-cap";

export interface PurchaseInput {
  characterLevel: number;
  charactersCurrentPlots: number;
  accountCurrentPlots: number;
}

export interface PurchaseResult {
  allowed: boolean;
  reason: PurchaseReason;
  cost: number;
  currencyId: string;
}

/** A plot's upkeep lifecycle. */
export type UpkeepPhase = "paid" | "at-risk" | "reclaimed";

export interface UpkeepPhaseResult {
  phase: UpkeepPhase;
  /** Days until the next phase transition. Infinity when never. */
  daysUntilNextPhase: number;
}

/**
 * The tier hierarchy for housing permissions. Higher index = more
 * privileged. `blocked` is its own out-of-band deny bit.
 */
const TIER_ORDER: HousingPermissionTier[] = [
  "public",
  "guild",
  "friend",
  "coOwner",
  "owner",
];

export class HousingRegistry {
  private _manifest: HousingManifest | null = null;
  private _byId = new Map<string, HousingPlotType>();

  constructor(manifest?: HousingManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: HousingManifest): void {
    this._manifest = manifest;
    this._byId.clear();
    for (const p of manifest.plotTypes) this._byId.set(p.id, p);
  }

  loadFromJson(raw: unknown): void {
    this.load(HousingManifestSchema.parse(raw));
  }

  isLoaded(): boolean {
    return this._manifest !== null;
  }

  get manifest(): HousingManifest {
    if (!this._manifest) throw new HousingNotLoadedError();
    return this._manifest;
  }

  get enabled(): boolean {
    return this.manifest.enabled;
  }
  get customization(): HousingCustomizationRules {
    return this.manifest.customization;
  }
  get permissions(): HousingPermissionRules {
    return this.manifest.permissions;
  }
  get upkeep(): HousingUpkeepRules {
    return this.manifest.upkeep;
  }
  get visitors(): HousingVisitorRules {
    return this.manifest.visitors;
  }

  /* --- plot types --- */

  has(id: string): boolean {
    return this._byId.has(id);
  }

  get(id: string): HousingPlotType {
    const p = this._byId.get(id);
    if (!p) throw new UnknownPlotTypeError(id, Array.from(this._byId.keys()));
    return p;
  }

  ids(): string[] {
    return Array.from(this._byId.keys());
  }

  byCategory(category: HousingPlotCategory): HousingPlotType[] {
    return Array.from(this._byId.values()).filter(
      (p) => p.category === category,
    );
  }

  /** Plot type's slot caps. */
  slotCaps(plotTypeId: string): HousingSlotCaps {
    return this.get(plotTypeId).slots;
  }

  /** Plot type's visitor cap. */
  visitorCap(plotTypeId: string): number {
    return this.get(plotTypeId).visitorCap;
  }

  /* --- purchase --- */

  checkPurchase(plotTypeId: string, input: PurchaseInput): PurchaseResult {
    const plot = this.get(plotTypeId);
    const base = {
      cost: plot.purchaseCost,
      currencyId: plot.purchaseCurrencyId,
    };
    if (!this.enabled) {
      return { allowed: false, reason: "disabled", ...base };
    }
    if (input.characterLevel < plot.minCharacterLevel) {
      return { allowed: false, reason: "below-level", ...base };
    }
    const m = this.manifest;
    if (input.charactersCurrentPlots >= m.maxPlotsPerCharacter) {
      return { allowed: false, reason: "char-plot-cap", ...base };
    }
    if (input.accountCurrentPlots >= m.maxPlotsPerAccount) {
      return { allowed: false, reason: "account-plot-cap", ...base };
    }
    return { allowed: true, reason: "allowed", ...base };
  }

  /* --- upkeep state --- */

  /**
   * Classify upkeep phase given days since the last successful charge.
   * cyclePeriodDays=0 means lifetime ownership (always paid).
   */
  upkeepPhase(daysSinceLastCharge: number): UpkeepPhaseResult {
    const u = this.upkeep;
    if (u.cyclePeriodDays === 0) {
      return { phase: "paid", daysUntilNextPhase: Number.POSITIVE_INFINITY };
    }
    if (daysSinceLastCharge < u.cyclePeriodDays) {
      return {
        phase: "paid",
        daysUntilNextPhase: u.cyclePeriodDays - daysSinceLastCharge,
      };
    }
    // past cycle — at-risk until reclaim threshold
    if (daysSinceLastCharge < u.reclaimAfterDays) {
      return {
        phase: "at-risk",
        daysUntilNextPhase: u.reclaimAfterDays - daysSinceLastCharge,
      };
    }
    return { phase: "reclaimed", daysUntilNextPhase: 0 };
  }

  /** Should a upkeep warning be sent at `daysUntilCharge`? */
  shouldSendUpkeepWarning(daysUntilCharge: number): boolean {
    const u = this.upkeep;
    if (!u.sendUpkeepWarnings) return false;
    return daysUntilCharge >= 0 && daysUntilCharge <= u.upkeepWarningDaysAhead;
  }

  /* --- permissions --- */

  /**
   * Is `grantedTier` at least as privileged as `requiredTier`?
   * `blocked` always returns false regardless of requirement.
   */
  hasTier(
    grantedTier: HousingPermissionTier,
    requiredTier: HousingPermissionTier,
  ): boolean {
    if (grantedTier === "blocked") return false;
    if (requiredTier === "blocked") return false;
    const granted = TIER_ORDER.indexOf(grantedTier);
    const required = TIER_ORDER.indexOf(requiredTier);
    return granted >= required;
  }

  /* --- visitors --- */

  /** Has the plot reached its visitor cap? */
  canVisit(plotTypeId: string, currentVisitors: number): boolean {
    return currentVisitors < this.visitorCap(plotTypeId);
  }

  /** Is the guestbook storage at capacity? */
  canAddGuestbookEntry(currentEntries: number): boolean {
    const v = this.visitors;
    if (!v.allowGuestbook) return false;
    return currentEntries < v.maxGuestbookEntries;
  }
}
