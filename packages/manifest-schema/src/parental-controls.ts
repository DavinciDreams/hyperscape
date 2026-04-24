/**
 * Parental-controls manifest schema.
 *
 * Authored policy for age-gated accounts: play-time limits, mandatory
 * break reminders, spend caps, chat/voice restrictions, content
 * filters, and guardian approval workflows. The manifest defines
 * *profiles* (e.g. `child`, `teen`, `adult`) keyed by minimum account
 * age and the restrictions that apply. Runtime `ParentalControlsSystem`
 * resolves a player to a profile at login and enforces each rule
 * block — none of that logic lives here.
 *
 * Scope-isolated from:
 *   - `moderation.ts` (Trust & Safety sanctions — parental controls
 *     are proactive and age-gated, not reactive)
 *   - `voice-chat.ts` (voice rooms — parental profile can restrict
 *     voiceChat, which the voice-chat system consults at join)
 *   - `chat-channels.ts` (text chat scopes — parental profile can
 *     restrict allowedChatScopes)
 *   - `feature-flags.ts` (runtime toggles — orthogonal)
 *
 * "age" here means account age verification; actual DOB/age gating is
 * enforced at account creation and outside this schema's scope.
 */

import { z } from "zod";

/** ProfileId — lowerCamelCase. */
const ProfileId = z
  .string()
  .regex(
    /^[a-z][a-zA-Z0-9_-]*$/,
    "profile id must be lowerCamelCase ASCII identifier",
  );

/** Chat scope keys that can be restricted (mirrors chat-channels). */
export const ChatScopeSchema = z.enum([
  "global",
  "zone",
  "party",
  "guild",
  "whisper",
  "system",
  "custom",
]);
export type ChatScope = z.infer<typeof ChatScopeSchema>;

/** Voice transmit modes that can be restricted. */
export const AllowedVoiceModeSchema = z.enum([
  "pushToTalk",
  "openMic",
  "voiceActivation",
]);
export type AllowedVoiceMode = z.infer<typeof AllowedVoiceModeSchema>;

/**
 * Play-time limits for a profile.
 * `0` on any field means "no limit" for that interval.
 */
export const PlayTimeRulesSchema = z
  .object({
    /** Max minutes per day (0=unlimited). */
    maxMinutesPerDay: z.number().int().min(0).max(1440).default(0),
    /** Max minutes per weekend day (0=inherit daily). */
    maxMinutesPerWeekendDay: z.number().int().min(0).max(1440).default(0),
    /** Max minutes per calendar week (0=unlimited). */
    maxMinutesPerWeek: z.number().int().min(0).max(10080).default(0),
    /** Earliest allowed play hour (0..23). */
    allowedStartHourLocal: z.number().int().min(0).max(23).default(0),
    /** Latest allowed play hour (1..24, exclusive). */
    allowedEndHourLocal: z.number().int().min(1).max(24).default(24),
    /** Minutes between mandatory break reminders (0=off). */
    breakReminderIntervalMin: z.number().int().min(0).max(240).default(0),
    /** Minutes of break required before resuming (0=off). */
    breakDurationMin: z.number().int().min(0).max(120).default(0),
  })
  .strict()
  .refine((r) => r.allowedEndHourLocal > r.allowedStartHourLocal, {
    message: "allowedEndHourLocal must be > allowedStartHourLocal",
    path: ["allowedEndHourLocal"],
  })
  .refine(
    (r) =>
      r.maxMinutesPerWeek === 0 ||
      r.maxMinutesPerDay === 0 ||
      r.maxMinutesPerWeek >= r.maxMinutesPerDay,
    {
      message: "maxMinutesPerWeek must be >= maxMinutesPerDay when both set",
      path: ["maxMinutesPerWeek"],
    },
  )
  .refine((r) => r.breakReminderIntervalMin === 0 || r.breakDurationMin > 0, {
    message:
      "breakDurationMin must be > 0 when breakReminderIntervalMin is enabled",
    path: ["breakDurationMin"],
  });
export type PlayTimeRules = z.infer<typeof PlayTimeRulesSchema>;

/**
 * Real-money spend caps. All currency in the smallest platform unit
 * (e.g. cents). `0` = no cap for that interval.
 */
export const SpendRulesSchema = z
  .object({
    /** Allow any paid transactions at all. */
    allowPurchases: z.boolean().default(true),
    /** Max spend per day in currency minor unit (0=unlimited). */
    maxSpendPerDayMinorUnit: z.number().int().min(0).max(10_000_000).default(0),
    /** Max spend per week (0=unlimited). */
    maxSpendPerWeekMinorUnit: z
      .number()
      .int()
      .min(0)
      .max(50_000_000)
      .default(0),
    /** Max spend per month (0=unlimited). */
    maxSpendPerMonthMinorUnit: z
      .number()
      .int()
      .min(0)
      .max(200_000_000)
      .default(0),
    /** Max single transaction (0=no cap). */
    maxSingleTransactionMinorUnit: z
      .number()
      .int()
      .min(0)
      .max(10_000_000)
      .default(0),
    /** Require guardian approval per purchase. */
    requireGuardianApproval: z.boolean().default(false),
  })
  .strict()
  .refine(
    (r) =>
      r.maxSpendPerWeekMinorUnit === 0 ||
      r.maxSpendPerDayMinorUnit === 0 ||
      r.maxSpendPerWeekMinorUnit >= r.maxSpendPerDayMinorUnit,
    {
      message:
        "maxSpendPerWeekMinorUnit must be >= maxSpendPerDayMinorUnit when both set",
      path: ["maxSpendPerWeekMinorUnit"],
    },
  )
  .refine(
    (r) =>
      r.maxSpendPerMonthMinorUnit === 0 ||
      r.maxSpendPerWeekMinorUnit === 0 ||
      r.maxSpendPerMonthMinorUnit >= r.maxSpendPerWeekMinorUnit,
    {
      message:
        "maxSpendPerMonthMinorUnit must be >= maxSpendPerWeekMinorUnit when both set",
      path: ["maxSpendPerMonthMinorUnit"],
    },
  )
  .refine((r) => r.allowPurchases || !r.requireGuardianApproval, {
    message: "requireGuardianApproval is meaningless when allowPurchases=false",
    path: ["requireGuardianApproval"],
  });
export type SpendRules = z.infer<typeof SpendRulesSchema>;

/**
 * Communication restrictions — text chat scopes, whispers, friends
 * requests, voice chat.
 */
export const CommunicationRulesSchema = z
  .object({
    /** Text chat scopes this profile is allowed to read/send in. */
    allowedChatScopes: z.array(ChatScopeSchema).default([]),
    /** Allow sending/receiving whispers. */
    allowWhispers: z.boolean().default(true),
    /** Allow friend requests to be sent/received. */
    allowFriendRequests: z.boolean().default(true),
    /** Allow voice chat at all. */
    allowVoiceChat: z.boolean().default(true),
    /** Transmit modes allowed if voice allowed. */
    allowedVoiceModes: z.array(AllowedVoiceModeSchema).default([]),
    /** Auto-filter text chat to family-friendly only. */
    forceFamilyFriendlyFilter: z.boolean().default(false),
    /** Restrict interactions to friends-list only. */
    restrictToFriendsOnly: z.boolean().default(false),
  })
  .strict()
  .refine(
    (r) => new Set(r.allowedChatScopes).size === r.allowedChatScopes.length,
    {
      message: "allowedChatScopes must be unique",
      path: ["allowedChatScopes"],
    },
  )
  .refine(
    (r) => new Set(r.allowedVoiceModes).size === r.allowedVoiceModes.length,
    {
      message: "allowedVoiceModes must be unique",
      path: ["allowedVoiceModes"],
    },
  )
  .refine((r) => r.allowVoiceChat || r.allowedVoiceModes.length === 0, {
    message: "allowedVoiceModes must be empty when allowVoiceChat=false",
    path: ["allowedVoiceModes"],
  });
export type CommunicationRules = z.infer<typeof CommunicationRulesSchema>;

/**
 * Content-visibility restrictions — blood, drugs, strong language,
 * mature themes. These are broad gameplay flags the game reads to
 * soften presentation.
 */
export const ContentRulesSchema = z
  .object({
    /** Replace blood/gore with sanitized equivalent. */
    suppressBloodAndGore: z.boolean().default(false),
    /** Replace profanity in dialogue with mild words. */
    suppressProfanity: z.boolean().default(false),
    /** Hide references to substances / alcohol. */
    suppressSubstances: z.boolean().default(false),
    /** Hide adult themes (romance, violence intensity). */
    suppressMatureThemes: z.boolean().default(false),
    /** Replace scary SFX / jumpscares with softened variants. */
    softenScareEffects: z.boolean().default(false),
    /** Allow access to cash shop / auction house at all. */
    allowMarketplace: z.boolean().default(true),
  })
  .strict();
export type ContentRules = z.infer<typeof ContentRulesSchema>;

/**
 * Profile — the bundle of restrictions applied to an age cohort.
 */
export const ParentalProfileSchema = z
  .object({
    id: ProfileId,
    name: z.string().min(1),
    description: z.string().default(""),
    /** Profile applies to accounts with minimum age >= this. */
    minAccountAgeYears: z.number().int().min(0).max(120),
    /** Profile applies only to accounts with age <= this (0 = no cap). */
    maxAccountAgeYearsExclusive: z.number().int().min(0).max(120).default(0),
    /** If a player spans multiple profiles, higher priority wins. */
    priority: z.number().int().min(0).max(100).default(50),
    /** Guardian approval required at account creation. */
    requireGuardianAccount: z.boolean().default(false),
    playTime: PlayTimeRulesSchema.default(() => PlayTimeRulesSchema.parse({})),
    spend: SpendRulesSchema.default(() => SpendRulesSchema.parse({})),
    communication: CommunicationRulesSchema.default(() =>
      CommunicationRulesSchema.parse({}),
    ),
    content: ContentRulesSchema.default(() => ContentRulesSchema.parse({})),
  })
  .strict()
  .refine(
    (p) =>
      p.maxAccountAgeYearsExclusive === 0 ||
      p.maxAccountAgeYearsExclusive > p.minAccountAgeYears,
    {
      message:
        "maxAccountAgeYearsExclusive must be > minAccountAgeYears when set",
      path: ["maxAccountAgeYearsExclusive"],
    },
  );
export type ParentalProfile = z.infer<typeof ParentalProfileSchema>;

/**
 * Guardian workflow — how a parent/guardian signs off on child actions.
 */
export const GuardianWorkflowSchema = z
  .object({
    enabled: z.boolean().default(false),
    /** Email verification when linking a guardian to a child account. */
    requireEmailVerification: z.boolean().default(true),
    /** Timeout to approve a child request (minutes). 0=never expires. */
    approvalTimeoutMin: z.number().int().min(0).max(10080).default(1440),
    /** Weekly summary emails of child activity. */
    sendWeeklySummary: z.boolean().default(true),
    /** Notify guardian on purchase attempts. */
    notifyOnPurchaseAttempt: z.boolean().default(true),
    /** Notify guardian on friend-request received. */
    notifyOnFriendRequest: z.boolean().default(false),
  })
  .strict()
  .refine(
    (g) => !g.enabled || g.requireEmailVerification || g.approvalTimeoutMin > 0,
    {
      message:
        "enabled guardian workflow requires email verification or a finite approval timeout",
      path: ["requireEmailVerification"],
    },
  );
export type GuardianWorkflow = z.infer<typeof GuardianWorkflowSchema>;

/**
 * Parental-controls manifest — top-level authored document.
 */
export const ParentalControlsManifestSchema = z
  .object({
    enabled: z.boolean().default(true),
    profiles: z.array(ParentalProfileSchema).default([]),
    guardian: GuardianWorkflowSchema.default(() =>
      GuardianWorkflowSchema.parse({}),
    ),
    /** ID of the fallback profile used when no age data is available. */
    unknownAgeFallbackProfileId: ProfileId.optional(),
    /** Whether adults may opt into a more restrictive profile voluntarily. */
    allowAdultOptIn: z.boolean().default(true),
  })
  .strict()
  .refine(
    (m) => new Set(m.profiles.map((p) => p.id)).size === m.profiles.length,
    { message: "profile ids must be unique", path: ["profiles"] },
  )
  .refine(
    (m) =>
      m.unknownAgeFallbackProfileId === undefined ||
      m.profiles.some((p) => p.id === m.unknownAgeFallbackProfileId),
    {
      message: "unknownAgeFallbackProfileId must resolve to a declared profile",
      path: ["unknownAgeFallbackProfileId"],
    },
  )
  .refine((m) => !m.enabled || m.profiles.length >= 1, {
    message: "parental-controls enabled=true requires at least one profile",
    path: ["profiles"],
  })
  .refine(
    (m) => {
      // No two profiles may share the same (minAge, maxAge, priority) triple —
      // that would make ordering ambiguous.
      const seen = new Set<string>();
      for (const p of m.profiles) {
        const key = `${p.minAccountAgeYears}|${p.maxAccountAgeYearsExclusive}|${p.priority}`;
        if (seen.has(key)) return false;
        seen.add(key);
      }
      return true;
    },
    {
      message:
        "no two profiles may share the same (minAge, maxAge, priority) — ordering would be ambiguous",
      path: ["profiles"],
    },
  );
export type ParentalControlsManifest = z.infer<
  typeof ParentalControlsManifestSchema
>;
