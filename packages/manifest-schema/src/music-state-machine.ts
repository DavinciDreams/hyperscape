/**
 * Dynamic-music state-machine manifest schema.
 *
 * Section 11 of the World Studio AAA plan (missing systems →
 * "Dynamic music (state machine)"). Complements `music.ts` (which
 * lists music zones + clips). This schema describes the *state
 * machine* that governs transitions between musical states as
 * gameplay changes — exploration → combat → boss → victory, etc.
 *
 * Design:
 * - States name a musical intent (e.g. `explore`, `combat-low`).
 * - Each state pins a `musicId` that resolves against the music
 *   manifest.
 * - Transitions are triggered by world predicates (e.g.
 *   `inCombat`, `bossActive`) and cross-fade between states.
 * - One `initial` state per state-machine.
 * - Optional stingers — one-shot musical stabs that play on
 *   transition entry (e.g. victory fanfare).
 */

import { z } from "zod";

/** Fade curve used when crossfading between states. */
export const FadeCurveSchema = z.enum([
  "linear",
  "equal-power",
  "ease-in",
  "ease-out",
]);
export type FadeCurve = z.infer<typeof FadeCurveSchema>;

/** StateId — lowerCamelCase or kebab within ASCII identifier set. */
const StateId = z
  .string()
  .regex(
    /^[a-z][a-zA-Z0-9-]*$/,
    "music state id must start with a lowercase letter and contain only ASCII letters, digits, and hyphens",
  );

export const MusicTransitionSchema = z
  .object({
    to: StateId,
    /**
     * Predicate name — resolved at runtime against world/player
     * state. Empty string = always available (default transition).
     */
    when: z.string().default(""),
    /** Priority among simultaneously-satisfied predicates; higher wins. */
    priority: z.number().int().default(0),
    /** Fade duration in seconds. */
    fadeSec: z.number().min(0).max(60).default(2),
    curve: FadeCurveSchema.default("equal-power"),
    /** Snap to nearest bar boundary on transition. */
    quantizeToBar: z.boolean().default(false),
    /** Play this one-shot stinger on entry into `to`. */
    stingerId: z.string().default(""),
  })
  .refine(({ when, priority }) => (when === "" ? priority === 0 : true), {
    message:
      "default transitions (empty `when`) must have priority 0 — otherwise they'd override explicit predicates",
  });
export type MusicTransition = z.infer<typeof MusicTransitionSchema>;

export const MusicStateSchema = z
  .object({
    id: StateId,
    name: z.string().min(1),
    description: z.string().default(""),
    /** Music id in the music manifest — empty = silence state. */
    musicId: z.string().default(""),
    /** Base volume multiplier applied while in this state. */
    volume: z.number().min(0).max(1).default(1),
    /** Loop the music while resident. False = play once, then stay silent. */
    loop: z.boolean().default(true),
    transitions: z.array(MusicTransitionSchema).default([]),
  })
  .refine(
    ({ transitions }) => {
      // Distinct (when,to) pairs within a state — otherwise authoring is ambiguous.
      const keys = transitions.map((t) => `${t.when}→${t.to}`);
      return new Set(keys).size === keys.length;
    },
    {
      message:
        "(when,to) pairs within a state must be unique — duplicate transitions are ambiguous",
    },
  );
export type MusicState = z.infer<typeof MusicStateSchema>;

export const MusicStateMachineSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().default(""),
    /** Initial state id — must resolve to one of `states`. */
    initial: StateId,
    states: z.array(MusicStateSchema).min(1),
  })
  .refine(
    ({ states }) => new Set(states.map((s) => s.id)).size === states.length,
    { message: "state ids within a state machine must be unique" },
  )
  .refine(({ initial, states }) => states.some((s) => s.id === initial), {
    message: "`initial` state id must exist in `states`",
  })
  .refine(
    ({ states }) => {
      const ids = new Set(states.map((s) => s.id));
      return states.every((s) => s.transitions.every((t) => ids.has(t.to)));
    },
    {
      message: "every transition `to` must reference an existing state id",
    },
  );
export type MusicStateMachine = z.infer<typeof MusicStateMachineSchema>;

export const MusicStateMachineManifestSchema = z
  .array(MusicStateMachineSchema)
  .refine((list) => new Set(list.map((m) => m.id)).size === list.length, {
    message: "music-state-machine ids must be unique",
  });
export type MusicStateMachineManifest = z.infer<
  typeof MusicStateMachineManifestSchema
>;
