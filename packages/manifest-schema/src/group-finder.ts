/**
 * Group-finder manifest schema.
 *
 * Authored registry + policy for the LFG/LFR/dungeon-finder system —
 * the "queue for a dungeon, auto-match with strangers" pattern
 * (WoW Dungeon Finder / FF14 Duty Finder). Covers the content catalog
 * (per-content size/role requirements/level gating), plus global
 * matchmaking rules (queue timeouts, deserter penalties, backfill)
 * and reward policies.
 *
 * Scope: authored policy. Runtime `GroupFinderSystem` owns per-player
 * queue state, role-slot fill algorithm, instance creation on match,
 * backfill replacement, desertion tracking, and the queue UI — all
 * separate follow-ups.
 *
 * Scope-isolated from `party-guild.ts` (premade group rules),
 * `world-events.ts` (non-queued dynamic content), and `leaderboards.ts`
 * (ranked queue uses both systems — rating is stored in leaderboards).
 */

import { z } from "zod";

/** ContentId — lowerCamelCase ASCII identifier. */
const ContentId = z
  .string()
  .regex(
    /^[a-z][a-zA-Z0-9_-]*$/,
    "group-finder content id must be lowerCamelCase ASCII identifier",
  );

/** Shape-only reference to another manifest id (loader resolves). */
const ManifestRef = z
  .string()
  .regex(
    /^[a-z][a-zA-Z0-9_-]*$/,
    "manifest reference must be lowerCamelCase ASCII identifier",
  );

/**
 * Content kind — drives UI grouping and reward-pool selection.
 */
export const GroupFinderContentKindSchema = z.enum([
  "dungeon",
  "raid",
  "scenario",
  "battleground",
  "arena",
  "worldBoss",
  "custom",
]);
export type GroupFinderContentKind = z.infer<
  typeof GroupFinderContentKindSchema
>;

/**
 * Role the matchmaker slots players into.
 * `flex` = multi-role player, matchmaker fills the missing role.
 */
export const GroupFinderRoleSchema = z.enum([
  "tank",
  "healer",
  "dps",
  "support",
  "flex",
]);
export type GroupFinderRole = z.infer<typeof GroupFinderRoleSchema>;

/**
 * Queue policy — how players are matched.
 * `random` = shortest-queue auto-assign (casual LFG);
 * `specific` = player picks the content, queue fills that content only;
 * `ranked` = MMR-matched (arena/BG ranked);
 * `casual` = MMR-ignored, role-matched only.
 */
export const GroupFinderQueuePolicySchema = z.enum([
  "random",
  "specific",
  "ranked",
  "casual",
]);
export type GroupFinderQueuePolicy = z.infer<
  typeof GroupFinderQueuePolicySchema
>;

/**
 * Role requirement — how many of a role this content expects.
 */
export const GroupFinderRoleRequirementSchema = z
  .object({
    role: GroupFinderRoleSchema,
    /** Number of players expected in this role. */
    count: z.number().int().min(1).max(40),
  })
  .strict();
export type GroupFinderRoleRequirement = z.infer<
  typeof GroupFinderRoleRequirementSchema
>;

/**
 * Content entry — one row per queueable instance.
 */
export const GroupFinderContentSchema = z
  .object({
    id: ContentId,
    name: z.string().min(1),
    description: z.string().default(""),
    iconId: z.string().default(""),
    kind: GroupFinderContentKindSchema,
    /**
     * Minimum and maximum group size. Must satisfy min <= max
     * (refinement) and min == sum(roleRequirements.count) == max is
     * typical but not required (custom content may allow flexible
     * sizing; refinement only bans the inversion).
     */
    minGroupSize: z.number().int().min(1).max(40),
    maxGroupSize: z.number().int().min(1).max(40),
    /** Role slots the matchmaker must fill. Empty = role-agnostic. */
    roleRequirements: z
      .array(GroupFinderRoleRequirementSchema)
      .default([])
      .refine((reqs) => new Set(reqs.map((r) => r.role)).size === reqs.length, {
        message: "roleRequirements may have only one entry per role",
      }),
    /** Queue policy that governs matching for this content. */
    queuePolicy: GroupFinderQueuePolicySchema.default("specific"),
    minLevel: z.number().int().min(1).max(100).default(1),
    maxLevel: z.number().int().min(1).max(100).default(100),
    /** Minimum gear score to queue. 0 = no gate. */
    minGearScore: z.number().int().min(0).max(10_000).default(0),
    /**
     * If true, a full premade can bypass the matchmaker (a ready-made
     * party of the right composition queues directly into an instance).
     */
    allowPartyPremade: z.boolean().default(true),
    /** Estimated completion minutes (shown in the queue UI). */
    estimatedDurationMinutes: z.number().int().min(1).max(480).default(30),
    /**
     * Rating gate for ranked policy (MMR floor). Ignored by non-ranked
     * policies.
     */
    minRating: z.number().int().min(0).max(5000).default(0),
    /**
     * Lockout bucket id (shape-only ManifestRef into a save-data slot
     * or similar). Empty = no lockout. Games use this to implement
     * "weekly raid lockout".
     */
    lockoutBucketId: z.string().default(""),
  })
  .strict()
  .refine(({ minGroupSize, maxGroupSize }) => minGroupSize <= maxGroupSize, {
    message: "minGroupSize must be <= maxGroupSize",
  })
  .refine(({ minLevel, maxLevel }) => minLevel <= maxLevel, {
    message: "minLevel must be <= maxLevel",
  })
  .refine(
    ({ roleRequirements, maxGroupSize }) => {
      const sum = roleRequirements.reduce((a, r) => a + r.count, 0);
      return roleRequirements.length === 0 || sum <= maxGroupSize;
    },
    {
      message:
        "sum of roleRequirements.count must not exceed maxGroupSize (cannot slot more roles than the group holds)",
    },
  )
  .refine(
    ({ queuePolicy, minRating }) => queuePolicy === "ranked" || minRating === 0,
    {
      message:
        "minRating > 0 only valid for queuePolicy='ranked' (rating is a ranked-only gate)",
    },
  );
export type GroupFinderContent = z.infer<typeof GroupFinderContentSchema>;

/**
 * Matchmaking rules — the global queue algorithm tuning.
 */
export const GroupFinderMatchmakingRulesSchema = z
  .object({
    /** Max seconds a player waits in queue before the system declares a timeout. */
    queueTimeoutSec: z.number().int().min(30).max(3600).default(1200),
    /**
     * Max seconds the ready-check window stays open before auto-decline.
     */
    readyCheckTimeoutSec: z.number().int().min(10).max(300).default(40),
    /**
     * If true, the system will backfill a departed player with a new
     * queue match (requeue mid-instance). If false, the group continues
     * short-handed.
     */
    backfillEnabled: z.boolean().default(true),
    /**
     * If true, players who leave mid-instance (deserters) receive a
     * cooldown before they can re-queue.
     */
    applyDeserterPenalty: z.boolean().default(true),
    /** Cooldown seconds after desertion. */
    deserterCooldownSec: z.number().int().min(0).max(7200).default(1800),
    /**
     * Role-incentive bonus multiplier — if true, under-queued roles
     * (typically tank/healer) receive a "satchel" reward on completion.
     */
    roleIncentiveEnabled: z.boolean().default(true),
    /**
     * If > 0, after this many minutes in queue the system widens the
     * level/gear gate (relaxed matching). 0 = never widen.
     */
    wideningAfterMinutes: z.number().int().min(0).max(120).default(10),
    /**
     * If true, cross-realm matching is allowed (merged queue pools).
     */
    allowCrossRealm: z.boolean().default(true),
    /**
     * If true, cross-faction matching is allowed. Many MMOs start
     * faction-locked and unlock this later.
     */
    allowCrossFaction: z.boolean().default(false),
  })
  .strict();
export type GroupFinderMatchmakingRules = z.infer<
  typeof GroupFinderMatchmakingRulesSchema
>;

/**
 * Reward policy — completion/participation/consolation.
 */
export const GroupFinderRewardsPolicySchema = z
  .object({
    /** If true, the first completion of a piece of content per day awards a bonus. */
    firstDailyCompletionBonus: z.boolean().default(true),
    /** If true, the first completion per week awards a larger bonus. */
    firstWeeklyCompletionBonus: z.boolean().default(true),
    /** If true, a "satchel" currency drops on successful completion. */
    completionSatchelEnabled: z.boolean().default(true),
    /**
     * If > 0, consolation currency awarded on queue-timeout (to
     * soften the "waited 20m, got nothing" UX). 0 = no consolation.
     */
    timeoutConsolationCurrency: z
      .number()
      .int()
      .min(0)
      .max(1_000_000)
      .default(0),
    /** Consolation currency id (ManifestRef, shape-only). */
    consolationCurrencyId: ManifestRef.default("gold"),
    /**
     * If true, role-incentive satchels are awarded to the under-queued
     * roles that filled the slot.
     */
    roleIncentiveSatchelEnabled: z.boolean().default(true),
  })
  .strict();
export type GroupFinderRewardsPolicy = z.infer<
  typeof GroupFinderRewardsPolicySchema
>;

export const GroupFinderManifestSchema = z
  .object({
    enabled: z.boolean().default(true),
    content: z.array(GroupFinderContentSchema).default([]),
    matchmaking: GroupFinderMatchmakingRulesSchema.default(() =>
      GroupFinderMatchmakingRulesSchema.parse({}),
    ),
    rewards: GroupFinderRewardsPolicySchema.default(() =>
      GroupFinderRewardsPolicySchema.parse({}),
    ),
  })
  .strict()
  .refine(
    ({ content }) => new Set(content.map((c) => c.id)).size === content.length,
    { message: "content ids must be unique" },
  )
  .refine(({ enabled, content }) => !enabled || content.length > 0, {
    message:
      "group-finder enabled=true requires at least one content entry (use enabled=false to disable)",
  });
export type GroupFinderManifest = z.infer<typeof GroupFinderManifestSchema>;
