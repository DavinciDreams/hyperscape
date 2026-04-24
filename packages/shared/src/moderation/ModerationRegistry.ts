/**
 * Moderation registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `moderation.ts`.
 * Pure logic: report-category lookup, filter-rule lookup, sanction
 * ladder resolution (Nth offense → action), report rate-limit gates,
 * auto-mod noisy-reporter demotion, appeal-eligibility gates. Runtime
 * `ModerationSystem` owns ingest RPC, evidence storage, actual
 * sanction application, and the moderator UI.
 */

import {
  type AppealRules,
  type AutoModerationRules,
  type BanPolicyRules,
  type CategorySanctionLadder,
  type FilterRule,
  type FilterRuleAction,
  type ModerationManifest,
  type ReportCategory,
  type ReportRateLimits,
  type SanctionTier,
  ModerationManifestSchema,
} from "@hyperforge/manifest-schema";

export class ModerationNotLoadedError extends Error {
  constructor() {
    super("ModerationRegistry used before load()");
    this.name = "ModerationNotLoadedError";
  }
}

export class UnknownReportCategoryError extends Error {
  readonly categoryId: string;
  readonly availableIds: readonly string[];
  constructor(id: string, availableIds: readonly string[]) {
    super(
      `moderation reportCategory "${id}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownReportCategoryError";
    this.categoryId = id;
    this.availableIds = availableIds;
  }
}

export class UnknownFilterRuleError extends Error {
  readonly ruleId: string;
  readonly availableIds: readonly string[];
  constructor(id: string, availableIds: readonly string[]) {
    super(
      `moderation filterRule "${id}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownFilterRuleError";
    this.ruleId = id;
    this.availableIds = availableIds;
  }
}

export type ReportReason =
  | "allowed"
  | "disabled"
  | "hourly-cap"
  | "daily-cap"
  | "cooldown"
  | "unique-target-cap"
  | "evidence-too-short";

export interface ReportRateInput {
  reportsInLastHour: number;
  reportsInLastDay: number;
  secondsSinceLastReport: number;
  uniqueTargetsInLastHour: number;
  evidenceTextLength: number;
}

export interface ReportRateResult {
  allowed: boolean;
  reason: ReportReason;
}

export interface SanctionResolution {
  /** Tier that fires at `offenseCount`, or null if none. */
  tier: SanctionTier | null;
  /** True if there's no ladder configured for the category. */
  noLadder: boolean;
}

export type AppealEligibilityReason =
  | "allowed"
  | "disabled"
  | "within-cooldown"
  | "max-appeals-reached"
  | "explanation-too-short";

export interface AppealEligibilityInput {
  hoursSinceSanction: number;
  appealsFiled: number;
  explanationLength: number;
}

export interface AppealEligibilityResult {
  allowed: boolean;
  reason: AppealEligibilityReason;
}

export class ModerationRegistry {
  private _manifest: ModerationManifest | null = null;
  private _categoriesById = new Map<string, ReportCategory>();
  private _rulesById = new Map<string, FilterRule>();
  private _laddersByCategory = new Map<string, CategorySanctionLadder>();

  constructor(manifest?: ModerationManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: ModerationManifest): void {
    this._manifest = manifest;
    this._categoriesById.clear();
    this._rulesById.clear();
    this._laddersByCategory.clear();
    for (const c of manifest.reportCategories) {
      this._categoriesById.set(c.id, c);
    }
    for (const r of manifest.filterRules) this._rulesById.set(r.id, r);
    for (const l of manifest.sanctionLadders) {
      this._laddersByCategory.set(l.categoryId, l);
    }
  }

  loadFromJson(raw: unknown): void {
    this.load(ModerationManifestSchema.parse(raw));
  }

  isLoaded(): boolean {
    return this._manifest !== null;
  }

  get manifest(): ModerationManifest {
    if (!this._manifest) throw new ModerationNotLoadedError();
    return this._manifest;
  }

  get enabled(): boolean {
    return this.manifest.enabled;
  }
  get reportRateLimits(): ReportRateLimits {
    return this.manifest.reportRateLimits;
  }
  get autoModeration(): AutoModerationRules {
    return this.manifest.autoModeration;
  }
  get appeals(): AppealRules {
    return this.manifest.appeals;
  }
  get banPolicy(): BanPolicyRules {
    return this.manifest.banPolicy;
  }

  /* --- categories --- */

  hasCategory(id: string): boolean {
    return this._categoriesById.has(id);
  }

  category(id: string): ReportCategory {
    const c = this._categoriesById.get(id);
    if (!c) {
      throw new UnknownReportCategoryError(
        id,
        Array.from(this._categoriesById.keys()),
      );
    }
    return c;
  }

  categoryIds(): string[] {
    return Array.from(this._categoriesById.keys());
  }

  /** Player-facing report categories sorted by priority (desc). */
  playerVisibleCategories(): ReportCategory[] {
    return Array.from(this._categoriesById.values())
      .filter((c) => c.playerVisible)
      .sort((a, b) => b.priority - a.priority);
  }

  /* --- filter rules --- */

  hasRule(id: string): boolean {
    return this._rulesById.has(id);
  }

  rule(id: string): FilterRule {
    const r = this._rulesById.get(id);
    if (!r) {
      throw new UnknownFilterRuleError(id, Array.from(this._rulesById.keys()));
    }
    return r;
  }

  ruleIds(): string[] {
    return Array.from(this._rulesById.keys());
  }

  rulesByAction(action: FilterRuleAction): FilterRule[] {
    return Array.from(this._rulesById.values()).filter(
      (r) => r.action === action,
    );
  }

  /* --- sanction ladders --- */

  /**
   * Resolve the sanction tier that applies at `offenseCount` for
   * `categoryId`. Returns the *highest* tier whose `atOffenseCount`
   * ≤ `offenseCount`. Null if no tier fires yet or no ladder.
   */
  resolveSanction(
    categoryId: string,
    offenseCount: number,
  ): SanctionResolution {
    const ladder = this._laddersByCategory.get(categoryId);
    if (!ladder) return { tier: null, noLadder: true };
    let match: SanctionTier | null = null;
    for (const tier of ladder.tiers) {
      if (tier.atOffenseCount <= offenseCount) match = tier;
      else break;
    }
    return { tier: match, noLadder: false };
  }

  /* --- report rate gates --- */

  checkReportRate(input: ReportRateInput): ReportRateResult {
    if (!this.enabled) return { allowed: false, reason: "disabled" };
    const l = this.reportRateLimits;
    if (
      l.maxReportsPerHour > 0 &&
      input.reportsInLastHour >= l.maxReportsPerHour
    ) {
      return { allowed: false, reason: "hourly-cap" };
    }
    if (
      l.maxReportsPerDay > 0 &&
      input.reportsInLastDay >= l.maxReportsPerDay
    ) {
      return { allowed: false, reason: "daily-cap" };
    }
    if (input.secondsSinceLastReport < l.cooldownBetweenReportsSec) {
      return { allowed: false, reason: "cooldown" };
    }
    if (
      l.maxUniqueTargetsPerHour > 0 &&
      input.uniqueTargetsInLastHour >= l.maxUniqueTargetsPerHour
    ) {
      return { allowed: false, reason: "unique-target-cap" };
    }
    if (
      l.requireEvidenceText &&
      input.evidenceTextLength < l.minEvidenceTextLength
    ) {
      return { allowed: false, reason: "evidence-too-short" };
    }
    return { allowed: true, reason: "allowed" };
  }

  /* --- noisy reporter demotion --- */

  /**
   * Classify a reporter's history. True if they should be demoted
   * (their future reports deprioritized).
   */
  isNoisyReporter(totalReports: number, dismissedReports: number): boolean {
    const a = this.autoModeration;
    if (!a.demoteNoisyReporters) return false;
    if (totalReports < a.noisyReporterMinReports) return false;
    if (totalReports === 0) return false;
    const dismissFraction = dismissedReports / totalReports;
    return dismissFraction >= a.noisyReporterDismissFraction;
  }

  /* --- appeals --- */

  checkAppealEligibility(
    input: AppealEligibilityInput,
  ): AppealEligibilityResult {
    const a = this.appeals;
    if (!a.enabled) return { allowed: false, reason: "disabled" };
    if (input.hoursSinceSanction < a.cooldownHoursBeforeFiling) {
      return { allowed: false, reason: "within-cooldown" };
    }
    if (input.appealsFiled >= a.maxAppealsPerSanction) {
      return { allowed: false, reason: "max-appeals-reached" };
    }
    if (input.explanationLength < a.minExplanationLength) {
      return { allowed: false, reason: "explanation-too-short" };
    }
    return { allowed: true, reason: "allowed" };
  }
}
