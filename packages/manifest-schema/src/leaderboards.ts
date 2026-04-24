/**
 * Leaderboards manifest schema.
 *
 * Authored registry of competitive ranking boards — "highest pvp rating",
 * "fastest dungeon clear", "most gold earned this season", "largest fish
 * caught". Each entry declares the metric, the scope (which cohort of
 * players eligible), the rollup cadence (all-time / season / weekly /
 * daily), the sort direction, the tie-break rules, and the reward
 * brackets awarded at cadence boundaries.
 *
 * Scope: authored registry. Runtime `LeaderboardSystem` owns per-player
 * score accumulation, cross-shard consolidation, cadence-boundary reset,
 * reward distribution, and the UI leaderboard queries — all separate
 * follow-ups.
 *
 * Scope-isolated from `achievements.ts` (achievements are personal
 * milestone flags, leaderboards are ranked comparisons) and `seasons.ts`
 * (seasons drive time-boxed progression, leaderboards are orthogonal
 * rankings that *may* reset on season boundaries).
 */

import { z } from "zod";

/** LeaderboardId — lowerCamelCase ASCII identifier. */
const LeaderboardId = z
  .string()
  .regex(
    /^[a-z][a-zA-Z0-9_-]*$/,
    "leaderboard id must be lowerCamelCase ASCII identifier",
  );

/** Shape-only reference to another manifest id (loader resolves). */
const ManifestRef = z
  .string()
  .regex(
    /^[a-z][a-zA-Z0-9_-]*$/,
    "manifest reference must be lowerCamelCase ASCII identifier",
  );

/**
 * Metric — what is being ranked. Runtime provides the aggregation
 * function per metric kind; schema only captures the field identifier
 * + direction.
 */
export const LeaderboardMetricKindSchema = z.enum([
  "pvpRating",
  "dungeonClearTime",
  "bossKillCount",
  "goldEarned",
  "xpEarned",
  "craftingScore",
  "gatheringScore",
  "fishSize",
  "achievementScore",
  "custom",
]);
export type LeaderboardMetricKind = z.infer<typeof LeaderboardMetricKindSchema>;

/** Sort direction — `desc` = higher is better (most MMO boards), `asc` = lower is better (speedruns). */
export const LeaderboardSortSchema = z.enum(["desc", "asc"]);
export type LeaderboardSort = z.infer<typeof LeaderboardSortSchema>;

/**
 * Scope — which cohort of players is eligible. `global` = every player;
 * `region` = same geographic shard; `guild` = within a guild only;
 * `faction` = within a faction only; `friends` = just friends list.
 */
export const LeaderboardScopeSchema = z.enum([
  "global",
  "region",
  "guild",
  "faction",
  "friends",
]);
export type LeaderboardScope = z.infer<typeof LeaderboardScopeSchema>;

/**
 * Cadence — how often the board rolls over (resets to empty + archives
 * the previous snapshot for historical queries).
 */
export const LeaderboardCadenceSchema = z.enum([
  "allTime",
  "season",
  "monthly",
  "weekly",
  "daily",
]);
export type LeaderboardCadence = z.infer<typeof LeaderboardCadenceSchema>;

/**
 * Tie-break rule — fallback comparator when two entries have identical
 * primary metric. `earliestFirst` = whoever reached the score first wins
 * (natural for speedrun boards); `latestFirst` = most recent update wins
 * (natural for PvP rating). `none` = keep the tie (both share rank).
 */
export const LeaderboardTieBreakSchema = z.enum([
  "earliestFirst",
  "latestFirst",
  "none",
]);
export type LeaderboardTieBreak = z.infer<typeof LeaderboardTieBreakSchema>;

/**
 * Reward bracket — awarded at cadence rollover to players falling within
 * the rank range. Supports either rank range (top 1..10) or percentile
 * range (top 1%). Runtime resolves the bracket against the archived
 * snapshot.
 */
export const LeaderboardRewardBracketSchema = z
  .object({
    id: z
      .string()
      .regex(
        /^[a-z][a-zA-Z0-9_-]*$/,
        "bracket id must be lowerCamelCase ASCII identifier",
      ),
    /** Human label shown on the UI (e.g. "Top 10", "Top 1%"). */
    label: z.string().min(1),
    /**
     * Bracket mode — `rank` uses (minRank..maxRank, inclusive), `percent`
     * uses (minPercent..maxPercent, inclusive, 0..1 range).
     */
    mode: z.enum(["rank", "percent"]),
    /** Rank range lower bound (inclusive, 1-indexed). Only meaningful for `rank` mode. */
    minRank: z.number().int().min(1).max(1_000_000).default(1),
    /** Rank range upper bound. */
    maxRank: z.number().int().min(1).max(1_000_000).default(1),
    /** Percentile range lower bound (0..1). Only meaningful for `percent` mode. */
    minPercent: z.number().min(0).max(1).default(0),
    /** Percentile range upper bound. */
    maxPercent: z.number().min(0).max(1).default(0),
    /** Loot-table id to resolve at distribution (shape-only). */
    lootTableId: ManifestRef,
    /** Title id granted (shape-only; resolves against `titles.ts`). */
    titleId: z.string().default(""),
    /** Currency amount awarded. */
    currencyAmount: z.number().int().min(0).max(1_000_000_000).default(0),
    /** Currency id (resolves against `economy-tuning.ts`). */
    currencyId: z
      .string()
      .regex(
        /^[a-z][a-zA-Z0-9_-]*$/,
        "currency id must be lowerCamelCase ASCII identifier",
      )
      .default("gold"),
  })
  .strict()
  .refine(
    ({ mode, minRank, maxRank }) =>
      mode !== "rank" ? true : minRank <= maxRank,
    { message: "rank bracket minRank must be <= maxRank" },
  )
  .refine(
    ({ mode, minPercent, maxPercent }) =>
      mode !== "percent" ? true : minPercent <= maxPercent,
    { message: "percent bracket minPercent must be <= maxPercent" },
  );
export type LeaderboardRewardBracket = z.infer<
  typeof LeaderboardRewardBracketSchema
>;

export const LeaderboardSchema = z
  .object({
    id: LeaderboardId,
    name: z.string().min(1),
    description: z.string().default(""),
    iconId: z.string().default(""),
    metric: LeaderboardMetricKindSchema,
    /**
     * Custom metric key — only meaningful for `metric === "custom"`.
     * Empty for built-in metrics.
     */
    customMetricKey: z.string().default(""),
    sort: LeaderboardSortSchema,
    scope: LeaderboardScopeSchema,
    cadence: LeaderboardCadenceSchema,
    tieBreak: LeaderboardTieBreakSchema,
    /**
     * Maximum number of ranked entries retained. Entries beyond this
     * depth are dropped (player still sees their own rank even if beyond
     * the public cut-off).
     */
    maxEntries: z.number().int().min(10).max(100_000).default(1000),
    /**
     * Minimum metric value to qualify for the board. 0 = any score qualifies.
     */
    minQualifyingScore: z.number().min(0).max(1_000_000_000).default(0),
    /**
     * Level range eligible to participate. Below `minLevel` scores are
     * ignored; above `maxLevel` scores are scaled down (runtime detail).
     */
    minLevel: z.number().int().min(1).max(100).default(1),
    maxLevel: z.number().int().min(1).max(100).default(100),
    /** If true, scores are frozen between cadence boundaries (no live updates visible). */
    frozenBetweenRollups: z.boolean().default(false),
    /** If true, top N entries at rollover are broadcast to world chat. */
    announceTopOnRollover: z.boolean().default(false),
    /** How many positions to announce (only meaningful when `announceTopOnRollover`). */
    announceTopN: z.number().int().min(1).max(100).default(10),
    /**
     * Reward brackets — empty = non-rewarding board (bragging rights only).
     */
    rewardBrackets: z.array(LeaderboardRewardBracketSchema).default([]),
  })
  .strict()
  .refine(({ minLevel, maxLevel }) => minLevel <= maxLevel, {
    message: "minLevel must be <= maxLevel",
  })
  .refine(
    ({ metric, customMetricKey }) =>
      (metric === "custom") === (customMetricKey !== ""),
    {
      message:
        "customMetricKey must be non-empty iff metric is 'custom' (iff relationship)",
    },
  )
  .refine(
    ({ rewardBrackets }) =>
      new Set(rewardBrackets.map((b) => b.id)).size === rewardBrackets.length,
    { message: "reward bracket ids must be unique within a leaderboard" },
  )
  .refine(
    ({ rewardBrackets }) => {
      // Rank brackets must not overlap with other rank brackets.
      const rankBrackets = rewardBrackets.filter((b) => b.mode === "rank");
      for (let i = 0; i < rankBrackets.length; i += 1) {
        for (let j = i + 1; j < rankBrackets.length; j += 1) {
          const a = rankBrackets[i];
          const b = rankBrackets[j];
          if (a.minRank <= b.maxRank && b.minRank <= a.maxRank) return false;
        }
      }
      return true;
    },
    {
      message:
        "rank reward brackets must not overlap — each rank belongs to at most one bracket",
    },
  )
  .refine(
    ({ rewardBrackets }) => {
      // Percent brackets must not overlap with other percent brackets.
      const pctBrackets = rewardBrackets.filter((b) => b.mode === "percent");
      for (let i = 0; i < pctBrackets.length; i += 1) {
        for (let j = i + 1; j < pctBrackets.length; j += 1) {
          const a = pctBrackets[i];
          const b = pctBrackets[j];
          if (a.minPercent <= b.maxPercent && b.minPercent <= a.maxPercent)
            return false;
        }
      }
      return true;
    },
    {
      message:
        "percent reward brackets must not overlap — each percentile belongs to at most one bracket",
    },
  );
export type Leaderboard = z.infer<typeof LeaderboardSchema>;

export const LeaderboardsManifestSchema = z
  .array(LeaderboardSchema)
  .refine((arr) => new Set(arr.map((lb) => lb.id)).size === arr.length, {
    message: "leaderboard ids must be unique",
  });
export type LeaderboardsManifest = z.infer<typeof LeaderboardsManifestSchema>;
