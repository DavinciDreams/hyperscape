/**
 * Matchmaking-tuning manifest schema.
 *
 * Authored policy for automatic matchmaking: skill/rating bucket
 * width, queue timeout widening, party-size constraints per
 * queue, region preference fall-back, backfill rules.
 *
 * Scope-isolated from:
 *   - `server-browser.ts` (manual server picking — this is the
 *     automatic counterpart)
 *   - `group-finder.ts` (dungeon/raid finder — may be a queue id
 *     here, but group-finder owns its own slotting)
 *   - `party-guild.ts` (party composition — queues reference
 *     partySize limits, parties live there)
 *   - `deploy-targets.ts` (backend endpoint names)
 */

import { z } from "zod";

const Id = z
  .string()
  .regex(/^[a-z][a-zA-Z0-9_-]*$/, "id must be lowerCamelCase ASCII identifier");

/** Skill/rating model. */
export const SkillModelSchema = z.enum([
  "none",
  "elo",
  "glicko2",
  "trueSkill",
  "custom",
]);
export type SkillModel = z.infer<typeof SkillModelSchema>;

/** One bucket-widening step — used as time progresses in queue. */
export const WideningStepSchema = z
  .object({
    /** After this many seconds in queue, widen the bucket. */
    afterSec: z.number().int().min(0).max(3600),
    /** Target bucket half-width (rating points). */
    ratingHalfWidth: z.number().min(0).max(2000),
    /** Allow cross-region matching at this step. */
    allowCrossRegion: z.boolean().default(false),
    /** Max ping tolerated at this step (ms, 0 = no cap). */
    maxPingMs: z.number().int().min(0).max(2000).default(0),
  })
  .strict();
export type WideningStep = z.infer<typeof WideningStepSchema>;

/** Party constraint rules. */
export const PartyConstraintsSchema = z
  .object({
    minPartySize: z.number().int().min(1).max(50).default(1),
    maxPartySize: z.number().int().min(1).max(50).default(5),
    /** Allow solo players to queue with parties. */
    allowSoloWithParty: z.boolean().default(true),
    /** Max rating spread within a party (0 = unlimited). */
    maxPartyRatingSpread: z.number().min(0).max(5000).default(0),
  })
  .strict()
  .refine((p) => p.maxPartySize >= p.minPartySize, {
    message: "maxPartySize must be >= minPartySize",
    path: ["maxPartySize"],
  });
export type PartyConstraints = z.infer<typeof PartyConstraintsSchema>;

/** Backfill rules — adding players to in-progress matches. */
export const BackfillRulesSchema = z
  .object({
    enabled: z.boolean().default(false),
    /** Only backfill if game started within this many seconds ago. */
    maxGameProgressSec: z.number().int().min(0).max(7200).default(120),
    /** Rating half-width allowed for backfilled players (relative to avg). */
    backfillRatingHalfWidth: z.number().min(0).max(2000).default(200),
    /** Offer backfill slot reward (e.g. bonus XP multiplier). */
    offerRewardMultiplier: z.number().min(1).max(10).default(1),
  })
  .strict();
export type BackfillRules = z.infer<typeof BackfillRulesSchema>;

/** One matchmaking queue. */
export const MatchmakingQueueSchema = z
  .object({
    id: Id,
    labelLocalizationKey: z.string().min(1),
    /** Players per side (e.g. 5 for 5v5). */
    playersPerSide: z.number().int().min(1).max(100).default(5),
    /** Number of sides (2 for head-to-head, 1 for co-op, etc.). */
    numberOfSides: z.number().int().min(1).max(8).default(2),
    skillModel: SkillModelSchema.default("elo"),
    /** Initial bucket half-width before widening. */
    initialRatingHalfWidth: z.number().min(0).max(1000).default(100),
    /** Widening schedule (strictly increasing afterSec). */
    wideningSchedule: z.array(WideningStepSchema).default([]),
    party: PartyConstraintsSchema.default(() =>
      PartyConstraintsSchema.parse({}),
    ),
    backfill: BackfillRulesSchema.default(() => BackfillRulesSchema.parse({})),
    /** Preferred region matching before cross-region fallback. */
    preferSameRegion: z.boolean().default(true),
    /** Hard queue timeout — if still matchless after this, cancel (0 = never). */
    hardTimeoutSec: z.number().int().min(0).max(7200).default(600),
    /** Priority — higher means pulled from before other queues. */
    priority: z.number().int().min(0).max(1000).default(100),
  })
  .strict()
  .refine(
    (q) => {
      for (let i = 1; i < q.wideningSchedule.length; i += 1) {
        if (
          q.wideningSchedule[i].afterSec <= q.wideningSchedule[i - 1].afterSec
        ) {
          return false;
        }
      }
      return true;
    },
    {
      message: "wideningSchedule must have strictly increasing afterSec",
      path: ["wideningSchedule"],
    },
  )
  .refine(
    (q) =>
      q.hardTimeoutSec === 0 ||
      q.wideningSchedule.every((s) => s.afterSec <= q.hardTimeoutSec),
    {
      message: "wideningSchedule afterSec must be <= hardTimeoutSec",
      path: ["wideningSchedule"],
    },
  );
export type MatchmakingQueue = z.infer<typeof MatchmakingQueueSchema>;

/** Top-level matchmaking-tuning manifest. */
export const MatchmakingTuningManifestSchema = z
  .object({
    enabled: z.boolean().default(true),
    queues: z.array(MatchmakingQueueSchema).default([]),
    /** Global max concurrent queues per player (0 = unlimited). */
    maxConcurrentQueues: z.number().int().min(0).max(20).default(1),
    /** Default penalty for dodging match. */
    dodgePenaltySec: z.number().int().min(0).max(86400).default(300),
    /** Penalty cooldown decay (halves per window). */
    dodgePenaltyDecayWindowHours: z.number().int().min(0).max(720).default(24),
  })
  .strict()
  .refine((m) => new Set(m.queues.map((q) => q.id)).size === m.queues.length, {
    message: "queue ids must be unique",
    path: ["queues"],
  })
  .refine((m) => !m.enabled || m.queues.length > 0, {
    message: "enabled manifest requires at least one queue",
    path: ["queues"],
  });
export type MatchmakingTuningManifest = z.infer<
  typeof MatchmakingTuningManifestSchema
>;
