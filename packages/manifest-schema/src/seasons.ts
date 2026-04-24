/**
 * Seasons manifest schema.
 *
 * Authored registry of live-ops seasons — time-boxed progression ladders
 * (Battle Pass / season pass) that overlay the permanent character
 * progression. Each entry declares the season's window, its reward
 * tracks (free + premium), the XP curve, the weekly challenge groups,
 * and the end-of-season transitions (rewards snapshot, ladder reset).
 *
 * Scope: authored registry. Runtime `SeasonSystem` drives per-player
 * season XP, tier unlocks, challenge completion, premium-track
 * purchase gate, and season-end mail distribution — all separate
 * follow-ups.
 *
 * Scope-isolated from `xp-curves.ts` (character XP curves, permanent)
 * and `quests.ts` (content-chained quests vs rotating challenges).
 */

import { z } from "zod";

/** SeasonId — lowerCamelCase ASCII identifier. */
const SeasonId = z
  .string()
  .regex(
    /^[a-z][a-zA-Z0-9_-]*$/,
    "season id must be lowerCamelCase ASCII identifier",
  );

/** Shape-only reference to another manifest id (loader resolves). */
const ManifestRef = z
  .string()
  .regex(
    /^[a-z][a-zA-Z0-9_-]*$/,
    "manifest reference must be lowerCamelCase ASCII identifier",
  );

/**
 * Track kind — drives UI column + unlock gating. `free` unlocks at tier
 * threshold; `premium` requires pass purchase; `bonus` are one-off
 * milestone rewards (charity bonuses, preorder exclusives).
 */
export const SeasonTrackKindSchema = z.enum(["free", "premium", "bonus"]);
export type SeasonTrackKind = z.infer<typeof SeasonTrackKindSchema>;

/**
 * Single reward tier on a track. `tier` is 1..N (max 200 — matches
 * typical BP depth). Authors list each tier explicitly so reward
 * curves can be non-linear.
 */
export const SeasonTierSchema = z
  .object({
    tier: z.number().int().min(1).max(200),
    /** XP required to reach this tier from the previous. */
    xpRequired: z.number().int().min(1).max(10_000_000),
    /** Reward item id (shape-only ref). Empty = cosmetic-only tier. */
    rewardItemId: z.string().default(""),
    /** Number of reward items granted at this tier. */
    rewardCount: z.number().int().min(0).max(9_999).default(1),
    /** Currency amount granted at this tier (0 = none). */
    rewardCurrencyAmount: z.number().int().min(0).max(1_000_000).default(0),
    /** Currency id for the currency reward (resolved against economy-tuning). */
    rewardCurrencyId: z
      .string()
      .regex(
        /^[a-z][a-zA-Z0-9_-]*$/,
        "reward currency id must be lowerCamelCase ASCII identifier",
      )
      .default("gold"),
    /** Optional label shown on UI badges (e.g. "EPIC"). */
    label: z.string().default(""),
  })
  .strict()
  .refine(
    ({ rewardItemId, rewardCurrencyAmount, rewardCount }) =>
      rewardItemId !== "" || rewardCurrencyAmount > 0 || rewardCount === 0,
    {
      message:
        "season tier with rewardCount > 0 requires either rewardItemId or rewardCurrencyAmount > 0",
    },
  );
export type SeasonTier = z.infer<typeof SeasonTierSchema>;

/** A reward track — a single "column" on the BP grid. */
export const SeasonTrackSchema = z
  .object({
    id: z
      .string()
      .regex(
        /^[a-z][a-zA-Z0-9_-]*$/,
        "track id must be lowerCamelCase ASCII identifier",
      ),
    name: z.string().min(1),
    kind: SeasonTrackKindSchema,
    /** Tier list — must be at least one, tier numbers strictly increasing. */
    tiers: z.array(SeasonTierSchema).min(1),
  })
  .strict()
  .refine(
    ({ tiers }) => {
      // Tier numbers must be strictly monotonically increasing.
      for (let i = 0; i < tiers.length - 1; i += 1) {
        if (tiers[i].tier >= tiers[i + 1].tier) return false;
      }
      return true;
    },
    {
      message:
        "track tier numbers must be strictly increasing (no duplicates, authored in order)",
    },
  );
export type SeasonTrack = z.infer<typeof SeasonTrackSchema>;

/** Challenge frequency — drives the runtime rotation interval. */
export const SeasonChallengeFrequencySchema = z.enum([
  "daily",
  "weekly",
  "season",
]);
export type SeasonChallengeFrequency = z.infer<
  typeof SeasonChallengeFrequencySchema
>;

/** Challenge — a quest-like objective that grants season XP on completion. */
export const SeasonChallengeSchema = z
  .object({
    id: z
      .string()
      .regex(
        /^[a-z][a-zA-Z0-9_-]*$/,
        "challenge id must be lowerCamelCase ASCII identifier",
      ),
    name: z.string().min(1),
    description: z.string().default(""),
    frequency: SeasonChallengeFrequencySchema,
    /** Quest id that defines the objective (shape-only; resolved against quests.ts). */
    questId: ManifestRef,
    /** Season XP granted on completion. */
    xpReward: z.number().int().min(1).max(1_000_000),
    /** If true, the challenge is premium-track only. */
    premiumOnly: z.boolean().default(false),
    /**
     * Week number this challenge unlocks on (1..52). Only meaningful
     * for `weekly` frequency. 0 = unlocks on season start.
     */
    unlockWeek: z.number().int().min(0).max(52).default(0),
  })
  .strict();
export type SeasonChallenge = z.infer<typeof SeasonChallengeSchema>;

/**
 * End-of-season behavior — how the season concludes.
 */
export const SeasonEndBehaviorSchema = z
  .object({
    /** If true, unclaimed rewards are mailed to players. */
    mailUnclaimedRewards: z.boolean().default(true),
    /** If true, season XP resets to 0 (new season starts from tier 1). */
    resetXp: z.boolean().default(true),
    /** Days of grace after season end during which rewards can still be claimed. */
    gracePeriodDays: z.number().int().min(0).max(30).default(7),
    /** If true, a "season N leaderboard" snapshot is taken at end. */
    snapshotLeaderboard: z.boolean().default(true),
  })
  .strict();
export type SeasonEndBehavior = z.infer<typeof SeasonEndBehaviorSchema>;

export const SeasonSchema = z
  .object({
    id: SeasonId,
    name: z.string().min(1),
    description: z.string().default(""),
    iconId: z.string().default(""),
    /** ISO 8601 date-time string. */
    startsAt: z
      .string()
      .regex(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/,
        "startsAt must be an ISO 8601 date-time string",
      ),
    /** ISO 8601 date-time string. */
    endsAt: z
      .string()
      .regex(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/,
        "endsAt must be an ISO 8601 date-time string",
      ),
    /** Reward tracks — must contain at least one `free` track. */
    tracks: z.array(SeasonTrackSchema).min(1),
    /** Seasonal challenges. Empty = no challenges, progression is purely from activities. */
    challenges: z.array(SeasonChallengeSchema).default([]),
    /** Premium pass purchase price (in currency). 0 = pass is free. */
    premiumPassPrice: z.number().int().min(0).max(100_000).default(0),
    /** Currency id for the premium pass price. */
    premiumPassCurrencyId: z
      .string()
      .regex(
        /^[a-z][a-zA-Z0-9_-]*$/,
        "premium pass currency id must be lowerCamelCase ASCII identifier",
      )
      .default("gold"),
    /** End-of-season rules. */
    endBehavior: SeasonEndBehaviorSchema.default(() =>
      SeasonEndBehaviorSchema.parse({}),
    ),
    /** Theme color for the UI (#rrggbb or ""). */
    themeColor: z
      .string()
      .regex(
        /^(#[0-9a-fA-F]{6})?$/,
        "themeColor must be `#rrggbb` or empty string",
      )
      .default(""),
  })
  .strict()
  .refine(({ startsAt, endsAt }) => new Date(startsAt) < new Date(endsAt), {
    message: "startsAt must be strictly before endsAt",
  })
  .refine(({ tracks }) => tracks.some((t) => t.kind === "free"), {
    message: "season must declare at least one `free` track",
  })
  .refine(
    ({ tracks }) => new Set(tracks.map((t) => t.id)).size === tracks.length,
    { message: "track ids must be unique within a season" },
  )
  .refine(
    ({ challenges }) =>
      new Set(challenges.map((c) => c.id)).size === challenges.length,
    { message: "challenge ids must be unique within a season" },
  )
  .refine(
    ({ premiumPassPrice, tracks }) =>
      premiumPassPrice === 0 || tracks.some((t) => t.kind === "premium"),
    {
      message:
        "premiumPassPrice > 0 requires at least one `premium` track (otherwise the purchase unlocks nothing)",
    },
  );
export type Season = z.infer<typeof SeasonSchema>;

export const SeasonsManifestSchema = z
  .array(SeasonSchema)
  .refine((arr) => new Set(arr.map((s) => s.id)).size === arr.length, {
    message: "season ids must be unique",
  })
  .refine(
    (arr) => {
      // Seasons must not overlap in time. Sort by startsAt and check
      // each season's endsAt ≤ next season's startsAt.
      const sorted = [...arr].sort(
        (a, b) =>
          new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
      );
      for (let i = 0; i < sorted.length - 1; i += 1) {
        if (new Date(sorted[i].endsAt) > new Date(sorted[i + 1].startsAt)) {
          return false;
        }
      }
      return true;
    },
    {
      message:
        "seasons must not overlap in time — each season.endsAt must be <= next season.startsAt",
    },
  );
export type SeasonsManifest = z.infer<typeof SeasonsManifestSchema>;
