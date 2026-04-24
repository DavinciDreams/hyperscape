/**
 * World-events manifest schema.
 *
 * Authored registry of dynamic world events (FATEs / Public Events /
 * World Bosses) — time-scheduled or trigger-driven group activities
 * that appear on the world map, offer shared loot, and scale difficulty
 * with participation. Each entry declares the event's lifecycle phases,
 * its spawn trigger, its participation rewards, and its soft/hard
 * participation caps.
 *
 * Scope: authored registry. Runtime `WorldEventSystem` owns event
 * scheduling (cron + random-window + trigger-volume + completion-chain),
 * per-event participant tracking, difficulty scaling, loot distribution,
 * and map-marker broadcast — all separate follow-ups.
 *
 * Scope-isolated from `quests.ts` (personal quest lines), `npcs.ts`
 * (references are shape-only), and `level-streaming.ts` (sublevel
 * triggers — an event may spawn inside a streamed sublevel but the
 * streaming policy is defined there).
 */

import { z } from "zod";

/** WorldEventId — lowerCamelCase ASCII identifier. */
const WorldEventId = z
  .string()
  .regex(
    /^[a-z][a-zA-Z0-9_-]*$/,
    "world-event id must be lowerCamelCase ASCII identifier",
  );

/** PhaseId — lowerCamelCase ASCII identifier. */
const PhaseId = z
  .string()
  .regex(
    /^[a-z][a-zA-Z0-9_-]*$/,
    "phase id must be lowerCamelCase ASCII identifier",
  );

/** Shape-only reference to another manifest id (loader resolves). */
const ManifestRef = z
  .string()
  .regex(
    /^[a-z][a-zA-Z0-9_-]*$/,
    "manifest reference must be lowerCamelCase ASCII identifier",
  );

/** Event category — drives UI grouping + map-marker color. */
export const WorldEventCategorySchema = z.enum([
  "invasion",
  "boss",
  "gather",
  "escort",
  "defense",
  "puzzle",
  "holiday",
]);
export type WorldEventCategory = z.infer<typeof WorldEventCategorySchema>;

/**
 * Event trigger — how the event enters its first phase. Discriminated
 * union so authors only see the fields relevant to their chosen trigger.
 */
export const WorldEventTriggerSchema = z.discriminatedUnion("kind", [
  /** Periodic cron-style schedule. */
  z
    .object({
      kind: z.literal("schedule"),
      /** Interval between spawn attempts, in minutes. */
      intervalMinutes: z.number().int().min(1).max(10_080),
      /** Jitter (±) applied to each interval, in minutes. */
      jitterMinutes: z.number().int().min(0).max(1440).default(0),
    })
    .strict(),
  /** Probabilistic per-tick roll. */
  z
    .object({
      kind: z.literal("random"),
      /** Chance per roll (0..1). */
      chancePerRoll: z.number().min(0).max(1),
      /** Seconds between rolls. */
      rollIntervalSec: z.number().min(1).max(86_400),
    })
    .strict(),
  /** Fires when another event (referenced) completes successfully. */
  z
    .object({
      kind: z.literal("chain"),
      /** Source event id — shape-only, loader resolves. */
      sourceEventId: WorldEventId,
      /** Delay after source completion, in seconds. */
      delaySec: z.number().min(0).max(86_400).default(0),
    })
    .strict(),
  /** Fires when N+ players enter a trigger volume. */
  z
    .object({
      kind: z.literal("proximity"),
      /** Tag for the trigger volume (resolved against world geometry). */
      volumeTag: ManifestRef,
      /** Minimum concurrent players to trip the trigger. */
      minPlayers: z.number().int().min(1).max(100).default(1),
    })
    .strict(),
  /** Manual-only — admin/quest-driven. */
  z
    .object({
      kind: z.literal("manual"),
    })
    .strict(),
]);
export type WorldEventTrigger = z.infer<typeof WorldEventTriggerSchema>;

/**
 * Participation tier — per-event reward bracket based on relative
 * contribution. Tiers fire in order; runtime awards the highest tier
 * the player qualifies for.
 */
export const WorldEventParticipationTierSchema = z
  .object({
    id: z
      .string()
      .regex(
        /^[a-z][a-zA-Z0-9_-]*$/,
        "tier id must be lowerCamelCase ASCII identifier",
      ),
    name: z.string().min(1),
    /** Minimum contribution percent (0..1) to qualify. */
    minContribution: z.number().min(0).max(1),
    /** Reward loot-table id (shape-only; resolved against `loot-tables.ts`). */
    lootTableId: ManifestRef,
    /** Xp reward granted on tier qualification. */
    xpReward: z.number().int().min(0).max(1_000_000).default(0),
  })
  .strict();
export type WorldEventParticipationTier = z.infer<
  typeof WorldEventParticipationTierSchema
>;

/**
 * Event phase — a single gameplay step. Events are a linear chain of
 * phases with success/failure branches. Phase `nextOnSuccess` = "" ends
 * the event successfully; `nextOnFailure` = "" ends it in failure.
 */
export const WorldEventPhaseSchema = z
  .object({
    id: PhaseId,
    name: z.string().min(1),
    description: z.string().default(""),
    /** Optional objective text shown to participants. */
    objectiveText: z.string().default(""),
    /** Hard phase time limit in seconds. 0 = no limit. */
    durationSec: z.number().int().min(0).max(86_400).default(0),
    /** Next phase id on success (empty = event success). */
    nextOnSuccess: z.string().default(""),
    /** Next phase id on failure (empty = event failure). */
    nextOnFailure: z.string().default(""),
    /** NPC ids to spawn at phase start (shape-only). */
    spawnNpcIds: z.array(ManifestRef).default([]),
    /** Cinematic id to play at phase start (shape-only). */
    cinematicId: z.string().default(""),
  })
  .strict();
export type WorldEventPhase = z.infer<typeof WorldEventPhaseSchema>;

export const WorldEventSchema = z
  .object({
    id: WorldEventId,
    name: z.string().min(1),
    description: z.string().default(""),
    iconId: z.string().default(""),
    category: WorldEventCategorySchema,
    /** Map-marker color (#rrggbb, or "" for renderer default). */
    markerColor: z
      .string()
      .regex(
        /^(#[0-9a-fA-F]{6})?$/,
        "markerColor must be `#rrggbb` or empty string",
      )
      .default(""),
    trigger: WorldEventTriggerSchema,
    /** Soft minimum player count — event scales down below this. */
    minPlayers: z.number().int().min(1).max(500).default(1),
    /** Soft maximum — event stops scaling difficulty after this. */
    maxPlayers: z.number().int().min(1).max(500).default(40),
    /**
     * Level range that can meaningfully participate. Below minLevel
     * players receive zero rewards; above maxLevel rewards are scaled
     * down (runtime detail).
     */
    minLevel: z.number().int().min(1).max(100).default(1),
    maxLevel: z.number().int().min(1).max(100).default(100),
    /** Zone/world-area id where the event can spawn. */
    zoneId: ManifestRef,
    /** Ordered phase chain (≥1). First phase is always entry. */
    phases: z.array(WorldEventPhaseSchema).min(1),
    /** Id of the phase runtime enters first. */
    startPhaseId: PhaseId,
    /** Reward tiers — must be at least one. */
    participationTiers: z.array(WorldEventParticipationTierSchema).min(1),
    /** Lockout between successive rewards for the same player, in hours. */
    rewardLockoutHours: z.number().int().min(0).max(720).default(0),
    /** If true, participation is cross-server (merged instances). */
    crossServer: z.boolean().default(false),
    /** If true, event progress is broadcast to world chat. */
    broadcastToWorld: z.boolean().default(false),
  })
  .strict()
  .refine(({ minPlayers, maxPlayers }) => minPlayers <= maxPlayers, {
    message: "minPlayers must be <= maxPlayers",
  })
  .refine(({ minLevel, maxLevel }) => minLevel <= maxLevel, {
    message: "minLevel must be <= maxLevel",
  })
  .refine(
    ({ phases }) => new Set(phases.map((p) => p.id)).size === phases.length,
    { message: "phase ids must be unique within an event" },
  )
  .refine(
    ({ phases, startPhaseId }) => phases.some((p) => p.id === startPhaseId),
    { message: "startPhaseId must resolve to a phase id" },
  )
  .refine(
    ({ phases }) => {
      // Every non-empty nextOnSuccess / nextOnFailure must resolve.
      const ids = new Set(phases.map((p) => p.id));
      for (const p of phases) {
        if (p.nextOnSuccess !== "" && !ids.has(p.nextOnSuccess)) return false;
        if (p.nextOnFailure !== "" && !ids.has(p.nextOnFailure)) return false;
      }
      return true;
    },
    {
      message:
        "phase nextOnSuccess/nextOnFailure must resolve to a phase id or be empty string",
    },
  )
  .refine(
    ({ participationTiers }) =>
      new Set(participationTiers.map((t) => t.id)).size ===
      participationTiers.length,
    { message: "participation tier ids must be unique within an event" },
  )
  .refine(
    ({ participationTiers }) => {
      // Sorted by minContribution ascending, strictly monotonic.
      const sorted = [...participationTiers].sort(
        (a, b) => a.minContribution - b.minContribution,
      );
      for (let i = 0; i < sorted.length - 1; i += 1) {
        if (sorted[i].minContribution === sorted[i + 1].minContribution) {
          return false;
        }
      }
      return true;
    },
    {
      message:
        "participation tier minContribution values must be strictly unique (no ties — runtime picks highest qualifying tier)",
    },
  );
export type WorldEvent = z.infer<typeof WorldEventSchema>;

export const WorldEventsManifestSchema = z
  .array(WorldEventSchema)
  .refine((arr) => new Set(arr.map((e) => e.id)).size === arr.length, {
    message: "world-event ids must be unique",
  })
  .refine(
    (arr) => {
      // `chain` triggers must reference existing event ids.
      const ids = new Set(arr.map((e) => e.id));
      for (const e of arr) {
        if (e.trigger.kind === "chain" && !ids.has(e.trigger.sourceEventId)) {
          return false;
        }
      }
      return true;
    },
    {
      message:
        "chain-triggered world-event sourceEventId must resolve to an event id in this manifest",
    },
  );
export type WorldEventsManifest = z.infer<typeof WorldEventsManifestSchema>;
