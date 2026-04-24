/**
 * Moderation manifest schema.
 *
 * Authored policy for player-reporting, chat filtering, auto-
 * moderation thresholds, ban/suspension escalation, and appeal
 * workflow. Lets authors configure the Trust & Safety substrate
 * declaratively (what categories players can report, what happens
 * after N reports in a window, how many appeals a sanctioned
 * player gets, etc.) without hardcoding thresholds in runtime.
 *
 * Scope: authored policy only. Runtime `ModerationSystem` owns the
 * report ingest RPC, evidence attachment, auto-mod threshold check,
 * sanction application (mute/kick/ban), appeal intake, and the
 * moderator review UI — all separate follow-ups.
 *
 * Scope-isolated from `chat-channels.ts` (channel-level permission
 * + filter-rule refs live there — this schema owns the filter rule
 * registry content + auto-mod reactions). Filter-rule ids used in
 * chat-channels.ts resolve here.
 */

import { z } from "zod";

/** Shape-only reference to another manifest id (loader resolves). */
const ManifestRef = z
  .string()
  .regex(
    /^[a-z][a-zA-Z0-9_-]*$/,
    "manifest reference must be lowerCamelCase ASCII identifier",
  );

/** ReportCategoryId — lowerCamelCase. */
const ReportCategoryId = z
  .string()
  .regex(
    /^[a-z][a-zA-Z0-9_-]*$/,
    "report category id must be lowerCamelCase ASCII identifier",
  );

/** FilterRuleId — lowerCamelCase. */
const FilterRuleId = z
  .string()
  .regex(
    /^[a-z][a-zA-Z0-9_-]*$/,
    "filter rule id must be lowerCamelCase ASCII identifier",
  );

/**
 * Report category — what a player says someone is doing wrong.
 */
export const ReportCategorySchema = z
  .object({
    id: ReportCategoryId,
    name: z.string().min(1),
    description: z.string().default(""),
    iconId: z.string().default(""),
    /** If true, this category is visible in the report dropdown. */
    playerVisible: z.boolean().default(true),
    /** Priority 0..100 — higher jumps the moderator queue. */
    priority: z.number().int().min(0).max(100).default(50),
    /** Default escalation action when auto-mod fires on this category. */
    defaultAction: z.enum([
      "none",
      "warn",
      "mute",
      "kick",
      "suspend",
      "ban",
      "shadowBan",
      "nameForceChange",
    ]),
    /** If true, the reported account is flagged for human review. */
    requiresHumanReview: z.boolean().default(true),
    /** If true, reporting locks the reporter from reporting for cooldownSec. */
    triggersReporterCooldown: z.boolean().default(false),
  })
  .strict();
export type ReportCategory = z.infer<typeof ReportCategorySchema>;

/**
 * Chat filter rule — matches text content + takes an action.
 */
export const FilterRuleActionSchema = z.enum([
  "allow",
  "censor",
  "block",
  "warn",
  "flag",
]);
export type FilterRuleAction = z.infer<typeof FilterRuleActionSchema>;

export const FilterRuleMatchKindSchema = z.enum([
  "exactWord",
  "wordWithVariants",
  "regex",
  "linkDomain",
]);
export type FilterRuleMatchKind = z.infer<typeof FilterRuleMatchKindSchema>;

/**
 * Filter rule — a pattern + action. Pattern strings are authored
 * canonical forms; runtime handles case-folding + leetspeak variants.
 * This schema does NOT embed slur lists in the committed JSON — rules
 * reference a loader-resolved pattern asset by id (keeps the
 * committed manifest family safe to open in any editor).
 */
export const FilterRuleSchema = z
  .object({
    id: FilterRuleId,
    name: z.string().min(1),
    description: z.string().default(""),
    matchKind: FilterRuleMatchKindSchema,
    /** Shape-only ref to the external pattern asset. */
    patternAssetRef: ManifestRef,
    action: FilterRuleActionSchema,
    /** If true, the rule applies to usernames in addition to chat text. */
    appliesToNames: z.boolean().default(false),
    /** If true, repeat offenses in `windowSec` escalate. */
    escalateOnRepeat: z.boolean().default(true),
    /** Seconds in which repeat offenses count for escalation. */
    escalationWindowSec: z.number().int().min(0).max(86400).default(600),
  })
  .strict()
  .refine(
    ({ escalateOnRepeat, escalationWindowSec }) =>
      !escalateOnRepeat || escalationWindowSec > 0,
    {
      message:
        "escalateOnRepeat=true requires escalationWindowSec > 0 (else no window to count repeats in)",
    },
  );
export type FilterRule = z.infer<typeof FilterRuleSchema>;

/**
 * Per-report-category sanction tier — "on Nth matched report within
 * window, apply this sanction for this many minutes". Author-listed
 * escalation ladder lets the editor tune severity per category.
 */
export const SanctionTierSchema = z
  .object({
    /** Trigger threshold — Nth confirmed report in the window. */
    atOffenseCount: z.number().int().min(1).max(100),
    /** Sanction action to take. */
    action: z.enum([
      "warn",
      "mute",
      "kick",
      "suspend",
      "ban",
      "shadowBan",
      "nameForceChange",
    ]),
    /**
     * Duration (minutes) of the sanction. 0 = permanent (meaningful for
     * ban/shadowBan/nameForceChange only).
     */
    durationMinutes: z.number().int().min(0).max(525_600).default(0),
  })
  .strict()
  .refine(
    ({ action, durationMinutes }) =>
      action === "ban" ||
      action === "shadowBan" ||
      action === "nameForceChange" ||
      durationMinutes > 0,
    {
      message:
        "action='warn'|'mute'|'kick'|'suspend' requires durationMinutes > 0 (permanent warn/mute is not meaningful — use ban instead)",
    },
  );
export type SanctionTier = z.infer<typeof SanctionTierSchema>;

/**
 * Report-rate limits — per-reporter throttles to prevent weaponized
 * reporting.
 */
export const ReportRateLimitsSchema = z
  .object({
    maxReportsPerHour: z.number().int().min(0).max(100).default(20),
    maxReportsPerDay: z.number().int().min(0).max(500).default(100),
    cooldownBetweenReportsSec: z.number().int().min(0).max(3600).default(30),
    /** Max unique players reported per hour (anti-grief). */
    maxUniqueTargetsPerHour: z.number().int().min(0).max(100).default(10),
    /** If true, reports require text evidence (reason/details). */
    requireEvidenceText: z.boolean().default(false),
    /** Min evidence length in characters when required. */
    minEvidenceTextLength: z.number().int().min(0).max(1000).default(10),
    /** If true, reporters may be anonymous (shown-hidden). */
    allowAnonymous: z.boolean().default(true),
  })
  .strict()
  .refine(
    ({ maxReportsPerHour, maxReportsPerDay }) =>
      maxReportsPerDay === 0 ||
      maxReportsPerHour === 0 ||
      maxReportsPerDay >= maxReportsPerHour,
    {
      message:
        "maxReportsPerDay must be ≥ maxReportsPerHour (day is a superset of hour)",
    },
  )
  .refine(
    ({ requireEvidenceText, minEvidenceTextLength }) =>
      !requireEvidenceText || minEvidenceTextLength > 0,
    {
      message:
        "requireEvidenceText=true requires minEvidenceTextLength > 0 (else evidence of length 0 trivially satisfies)",
    },
  );
export type ReportRateLimits = z.infer<typeof ReportRateLimitsSchema>;

/**
 * Auto-moderation rules — threshold-based automatic actions.
 */
export const AutoModerationRulesSchema = z
  .object({
    /** If true, the auto-mod engine is running. */
    enabled: z.boolean().default(true),
    /**
     * Time window (hours) over which reports are counted toward thresholds.
     */
    windowHours: z.number().int().min(1).max(720).default(24),
    /**
     * If true, false-positive tracking demotes reporters whose reports are
     * frequently dismissed by human review. Protects against mass-report
     * weaponization.
     */
    demoteNoisyReporters: z.boolean().default(true),
    /**
     * Fraction of dismissed reports that marks a reporter as noisy
     * (0..1). 0 = never demote.
     */
    noisyReporterDismissFraction: z.number().min(0).max(1).default(0.5),
    /** Min reports a reporter must file before demotion applies. */
    noisyReporterMinReports: z.number().int().min(0).max(1000).default(10),
  })
  .strict()
  .refine(
    ({
      demoteNoisyReporters,
      noisyReporterDismissFraction,
      noisyReporterMinReports,
    }) =>
      !demoteNoisyReporters ||
      (noisyReporterDismissFraction > 0 && noisyReporterMinReports > 0),
    {
      message:
        "demoteNoisyReporters=true requires noisyReporterDismissFraction > 0 AND noisyReporterMinReports > 0",
    },
  );
export type AutoModerationRules = z.infer<typeof AutoModerationRulesSchema>;

/**
 * Appeal workflow rules.
 */
export const AppealRulesSchema = z
  .object({
    enabled: z.boolean().default(true),
    /** Max appeals per sanction (0 = none allowed). */
    maxAppealsPerSanction: z.number().int().min(0).max(5).default(1),
    /** Hours before an appeal may be filed (cooldown to avoid panic appeals). */
    cooldownHoursBeforeFiling: z.number().int().min(0).max(168).default(24),
    /** Min character length for appeal explanation text. */
    minExplanationLength: z.number().int().min(0).max(5000).default(50),
    /** Target response time SLA in hours (informational — runtime enforces). */
    responseSlaHours: z.number().int().min(1).max(720).default(72),
    /** If true, auto-reject appeals from perma-bans after maxAppealsPerSanction. */
    autoRejectAfterMax: z.boolean().default(true),
  })
  .strict()
  .refine(
    ({ enabled, maxAppealsPerSanction }) =>
      !enabled || maxAppealsPerSanction > 0,
    {
      message:
        "appeals enabled=true requires maxAppealsPerSanction > 0 (enabled with 0 appeals is dead config — use enabled=false)",
    },
  );
export type AppealRules = z.infer<typeof AppealRulesSchema>;

/**
 * Ban policy — platform-wide enforcement knobs.
 */
export const BanPolicyRulesSchema = z
  .object({
    /** If true, bans may extend to IP address (evasion prevention). */
    allowIpBan: z.boolean().default(false),
    /** If true, bans may extend to hardware fingerprint. */
    allowHardwareBan: z.boolean().default(false),
    /** If true, banned accounts retain read-only game data access. */
    retainReadOnlyAccess: z.boolean().default(true),
    /** Hours before a banned account's items/gold are donated/redistributed. */
    postBanItemHoldHours: z.number().int().min(0).max(8760).default(720),
    /** If true, ban notifications show category + reason text. */
    showReasonInBanNotice: z.boolean().default(true),
    /**
     * If true, bans automatically cascade to linked accounts (same
     * payment info / recovery email). Anti-evasion.
     */
    cascadeToLinkedAccounts: z.boolean().default(false),
  })
  .strict();
export type BanPolicyRules = z.infer<typeof BanPolicyRulesSchema>;

/**
 * Category-scoped sanction ladder — per-category escalation tiers.
 */
export const CategorySanctionLadderSchema = z
  .object({
    categoryId: ReportCategoryId,
    tiers: z.array(SanctionTierSchema).min(1).max(10),
  })
  .strict()
  .refine(
    ({ tiers }) => {
      // Strictly monotonic atOffenseCount.
      for (let i = 1; i < tiers.length; i++) {
        if (tiers[i].atOffenseCount <= tiers[i - 1].atOffenseCount)
          return false;
      }
      return true;
    },
    {
      message:
        "sanction tiers atOffenseCount must be strictly increasing across the ladder",
    },
  );
export type CategorySanctionLadder = z.infer<
  typeof CategorySanctionLadderSchema
>;

export const ModerationManifestSchema = z
  .object({
    /** If true, the moderation substrate is live. */
    enabled: z.boolean().default(true),
    reportCategories: z.array(ReportCategorySchema).default([]),
    filterRules: z.array(FilterRuleSchema).default([]),
    sanctionLadders: z.array(CategorySanctionLadderSchema).default([]),
    reportRateLimits: ReportRateLimitsSchema.default(() =>
      ReportRateLimitsSchema.parse({}),
    ),
    autoModeration: AutoModerationRulesSchema.default(() =>
      AutoModerationRulesSchema.parse({}),
    ),
    appeals: AppealRulesSchema.default(() => AppealRulesSchema.parse({})),
    banPolicy: BanPolicyRulesSchema.default(() =>
      BanPolicyRulesSchema.parse({}),
    ),
  })
  .strict()
  .refine(
    ({ reportCategories }) =>
      new Set(reportCategories.map((c) => c.id)).size ===
      reportCategories.length,
    { message: "reportCategory ids must be unique" },
  )
  .refine(
    ({ filterRules }) =>
      new Set(filterRules.map((r) => r.id)).size === filterRules.length,
    { message: "filterRule ids must be unique" },
  )
  .refine(
    ({ sanctionLadders, reportCategories }) => {
      const catIds = new Set(reportCategories.map((c) => c.id));
      return sanctionLadders.every((l) => catIds.has(l.categoryId));
    },
    {
      message:
        "every sanctionLadder.categoryId must resolve to a reportCategory in this manifest",
    },
  )
  .refine(
    ({ sanctionLadders }) =>
      new Set(sanctionLadders.map((l) => l.categoryId)).size ===
      sanctionLadders.length,
    {
      message:
        "at most one sanctionLadder per category (categoryId must be unique across ladders)",
    },
  )
  .refine(
    ({ enabled, reportCategories }) => !enabled || reportCategories.length > 0,
    {
      message:
        "moderation enabled=true requires at least one reportCategory (else players have nothing to report)",
    },
  );
export type ModerationManifest = z.infer<typeof ModerationManifestSchema>;
