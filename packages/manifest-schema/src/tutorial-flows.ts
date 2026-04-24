/**
 * Tutorial-flows manifest schema.
 *
 * Declarative onboarding / tutorial sequences keyed by stable string
 * id. A flow is a directed graph of steps — the runtime tutorial
 * driver advances between steps when step-specific completion
 * conditions fire (player performs an action, reaches a location,
 * opens a UI, etc.).
 *
 * Scope: authored flow graph + step metadata. Runtime completion-
 * condition matching against world events lives in `TutorialSystem`.
 *
 * Substrate only. Progression persistence for "which flows are
 * complete" belongs in save-data.
 */

import { z } from "zod";

/** FlowId / StepId — lowerCamelCase ASCII. */
const LowerCamelId = z
  .string()
  .regex(/^[a-z][a-zA-Z0-9_-]*$/, "id must be lowerCamelCase ASCII identifier");

/** Localization key — dot-separated snake_case or lowerCamelCase. */
const LocalizationKey = z
  .string()
  .regex(
    /^[a-z][a-zA-Z0-9_]*(\.[a-z][a-zA-Z0-9_]*)*$/,
    "localization key must be dot-separated lowerCamelCase/snake_case segments",
  );

/** A player-visible trigger that advances a tutorial step. */
export const TutorialTriggerSchema = z.discriminatedUnion("kind", [
  /**
   * Fires when the given gameplay event fires with optional payload
   * match. Payload match is a shallow equality check the runtime
   * performs.
   */
  z
    .object({
      kind: z.literal("event"),
      eventName: z
        .string()
        .regex(
          /^[a-z][a-zA-Z0-9_]*(\:[a-z][a-zA-Z0-9_]*)*$/,
          "event name must be colon-separated lowerCamelCase segments",
        ),
      payloadMatch: z.record(z.string(), z.unknown()).default({}),
    })
    .strict(),
  /** Fires once player enters a named trigger volume. */
  z
    .object({
      kind: z.literal("enter-volume"),
      volumeId: LowerCamelId,
    })
    .strict(),
  /** Fires once player picks up / equips / crafts a specific item. */
  z
    .object({
      kind: z.literal("item-acquired"),
      itemId: LowerCamelId,
      /** Minimum stack count that must accumulate in inventory (1..10000). */
      minCount: z.number().int().min(1).max(10_000).default(1),
    })
    .strict(),
  /** Fires when a skill crosses a threshold level (1..200). */
  z
    .object({
      kind: z.literal("skill-level"),
      skillId: LowerCamelId,
      minLevel: z.number().int().min(1).max(200),
    })
    .strict(),
  /** Fires on explicit player confirmation (pressing "continue" on a dialog). */
  z
    .object({
      kind: z.literal("manual-continue"),
    })
    .strict(),
  /** Fires when a specified quest reaches the given stage id. */
  z
    .object({
      kind: z.literal("quest-stage"),
      questId: LowerCamelId,
      stageId: LowerCamelId,
    })
    .strict(),
]);
export type TutorialTrigger = z.infer<typeof TutorialTriggerSchema>;

/** Anchor for step UI — where the prompt / arrow appears. */
export const TutorialAnchorSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("screen-center") }).strict(),
  z.object({ kind: z.literal("screen-top") }).strict(),
  z.object({ kind: z.literal("screen-bottom") }).strict(),
  z
    .object({
      kind: z.literal("widget"),
      widgetId: LowerCamelId,
    })
    .strict(),
  z
    .object({
      kind: z.literal("world-entity"),
      entityId: LowerCamelId,
    })
    .strict(),
  z
    .object({
      kind: z.literal("world-position"),
      position: z.object({
        x: z.number(),
        y: z.number(),
        z: z.number(),
      }),
    })
    .strict(),
]);
export type TutorialAnchor = z.infer<typeof TutorialAnchorSchema>;

/**
 * A single step within a flow. Steps reference other steps by id for
 * `nextStepId` + optional `skipToStepId`. The manifest-level
 * refinement validates those references resolve.
 */
export const TutorialStepSchema = z
  .object({
    id: LowerCamelId,
    /** Label displayed in the tutorial overlay (localization key). */
    titleKey: LocalizationKey,
    /** Body text (localization key). */
    bodyKey: LocalizationKey,
    /** Optional icon id (resolved against an icon atlas). */
    iconId: z.string().default(""),
    /** Where the prompt UI is anchored on screen / in world. */
    anchor: TutorialAnchorSchema.default({ kind: "screen-center" }),
    /**
     * Triggers that complete this step. If multiple are declared any
     * one of them advancing counts. Empty => author error (refined at
     * manifest level).
     */
    completionTriggers: z.array(TutorialTriggerSchema).min(1),
    /** Next step id — empty string means "end of flow". */
    nextStepId: z.string().default(""),
    /**
     * Optional "skip" target — player can bail to this step via a
     * "Skip" button. Empty = no skip available.
     */
    skipToStepId: z.string().default(""),
    /** Soft delay (sec) before this step becomes interactive (0..60). */
    delaySec: z.number().min(0).max(60).default(0),
    /**
     * Auto-advance timeout (sec); 0 = never. If set, the step ends
     * automatically after `autoAdvanceSec` even without a trigger firing.
     */
    autoAdvanceSec: z.number().min(0).max(600).default(0),
    /** Whether this step is skippable via the global "skip tutorial" toggle. */
    skippableByUser: z.boolean().default(true),
  })
  .strict();
export type TutorialStep = z.infer<typeof TutorialStepSchema>;

/**
 * A complete tutorial flow. `startStepId` is the entry point; the
 * step graph is validated at manifest parse time (all referenced
 * ids must resolve, no dangling steps).
 */
export const TutorialFlowSchema = z
  .object({
    id: LowerCamelId,
    name: z.string().min(1),
    description: z.string().default(""),
    /** Category used by UI to group flows (combat, movement, crafting, etc.). */
    category: z.string().min(1).default("general"),
    /**
     * When true the runtime launches this flow automatically the
     * first time a new character reaches the prerequisites. When
     * false, only launched explicitly via `tutorial:start` event.
     */
    autoStart: z.boolean().default(false),
    /**
     * Priority among auto-start flows — higher wins when multiple
     * flows want to launch at once.
     */
    priority: z.number().int().min(0).max(100).default(10),
    /** Required flow ids that must be complete before this one runs. */
    prerequisiteFlowIds: z.array(z.string().min(1)).default([]),
    /** Entry-point step. */
    startStepId: LowerCamelId,
    /** Graph of steps, keyed by step id. */
    steps: z.record(LowerCamelId, TutorialStepSchema),
  })
  .strict()
  .refine(
    ({ startStepId, steps }) =>
      Object.prototype.hasOwnProperty.call(steps, startStepId),
    { message: "`startStepId` must reference a declared step" },
  )
  .refine(
    ({ steps }) => Object.entries(steps).every(([id, step]) => id === step.id),
    {
      message: "step record key must match inner `step.id`",
    },
  )
  .refine(
    ({ steps }) => {
      for (const step of Object.values(steps)) {
        if (step.nextStepId && !steps[step.nextStepId]) return false;
        if (step.skipToStepId && !steps[step.skipToStepId]) return false;
      }
      return true;
    },
    {
      message:
        "every `nextStepId` and `skipToStepId` must resolve to a declared step (empty string = end-of-flow)",
    },
  );
export type TutorialFlow = z.infer<typeof TutorialFlowSchema>;

/**
 * Top-level manifest — array of flows with refinements enforcing
 * unique flow ids and that every prerequisite flow id resolves.
 */
export const TutorialFlowsManifestSchema = z
  .array(TutorialFlowSchema)
  .refine((arr) => new Set(arr.map((f) => f.id)).size === arr.length, {
    message: "tutorial flow ids must be unique",
  })
  .refine(
    (arr) => {
      const ids = new Set(arr.map((f) => f.id));
      return arr.every((f) => f.prerequisiteFlowIds.every((p) => ids.has(p)));
    },
    {
      message:
        "every `prerequisiteFlowIds` entry must reference a declared flow",
    },
  )
  .refine(
    (arr) => {
      // DAG check on prerequisites — no cycles allowed.
      const map = new Map(arr.map((f) => [f.id, f.prerequisiteFlowIds]));
      const WHITE = 0,
        GRAY = 1,
        BLACK = 2;
      const color = new Map<string, number>();
      for (const id of map.keys()) color.set(id, WHITE);

      const visit = (id: string): boolean => {
        const c = color.get(id) ?? WHITE;
        if (c === GRAY) return false;
        if (c === BLACK) return true;
        color.set(id, GRAY);
        for (const dep of map.get(id) ?? []) {
          if (!visit(dep)) return false;
        }
        color.set(id, BLACK);
        return true;
      };

      for (const id of map.keys()) {
        if (!visit(id)) return false;
      }
      return true;
    },
    { message: "`prerequisiteFlowIds` must form a DAG (no cycles)" },
  );
export type TutorialFlowsManifest = z.infer<typeof TutorialFlowsManifestSchema>;
