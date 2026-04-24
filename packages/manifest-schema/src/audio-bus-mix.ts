/**
 * Audio-bus-mix manifest schema.
 *
 * Section 11 (missing systems → audio mixer) of the World Studio
 * AAA plan. Complements `sfx.ts` (clips) and `music.ts` (music
 * zones) by describing the *bus graph* each clip routes into —
 * master → music → sfx → ui → ambient, with per-bus volume,
 * optional low-pass cutoff, and duck rules that attenuate one
 * bus while another plays.
 *
 * Scope: declarative audio routing. Runtime mixer walks the DAG
 * each frame to compute effective gain per bus; this schema
 * describes only the authored graph + rules.
 */

import { z } from "zod";

/** Bus id — lowerCamelCase ASCII identifier. */
const BusId = z
  .string()
  .regex(
    /^[a-z][a-zA-Z0-9_-]*$/,
    "audio bus id must be lowerCamelCase ASCII identifier",
  );

/** A single duck rule — `trigger` plays → attenuate `target`. */
export const AudioDuckRuleSchema = z
  .object({
    /** Bus that, when active, triggers ducking. */
    trigger: BusId,
    /** Bus whose output is attenuated while `trigger` is active. */
    target: BusId,
    /** Linear volume multiplier applied to `target` (0..1). */
    attenuationToLinear: z.number().min(0).max(1).default(0.25),
    /** Fade-in duration when duck begins (seconds). */
    attackSec: z.number().min(0).max(10).default(0.1),
    /** Fade-out duration when trigger stops (seconds). */
    releaseSec: z.number().min(0).max(10).default(0.4),
    /** Minimum trigger loudness (linear) below which no duck applies. */
    thresholdLinear: z.number().min(0).max(1).default(0.05),
  })
  .strict()
  .refine(({ trigger, target }) => trigger !== target, {
    message: "a bus cannot duck itself — `trigger` must differ from `target`",
  });
export type AudioDuckRule = z.infer<typeof AudioDuckRuleSchema>;

export const AudioBusSchema = z
  .object({
    id: BusId,
    /** Human-readable label for the editor mixer panel. */
    name: z.string().min(1),
    /** Parent bus — empty string means this bus routes to master. */
    parent: z.string().default(""),
    /** Authored volume in dB — clamped at runtime to the fader range. */
    volumeDb: z.number().min(-96).max(12).default(0),
    /** Mute toggle — overrides volumeDb to silent. */
    muted: z.boolean().default(false),
    /** Solo toggle — if any bus is solo'd, all non-solo peers are muted at mix time. */
    solo: z.boolean().default(false),
    /** Optional low-pass filter cutoff in Hz (0 = bypassed). */
    lowpassHz: z.number().min(0).max(22050).default(0),
    /** Optional high-pass filter cutoff in Hz (0 = bypassed). */
    highpassHz: z.number().min(0).max(22050).default(0),
  })
  .strict()
  .refine(({ parent, id }) => parent !== id, {
    message: "bus `parent` must not reference the bus itself",
  });
export type AudioBus = z.infer<typeof AudioBusSchema>;

export const AudioBusMixManifestSchema = z
  .object({
    /** Master fader dB applied at the graph root (after all buses). */
    masterVolumeDb: z.number().min(-96).max(12).default(0),
    buses: z.array(AudioBusSchema).min(1),
    duckRules: z.array(AudioDuckRuleSchema).default([]),
  })
  .refine(
    ({ buses }) => new Set(buses.map((b) => b.id)).size === buses.length,
    { message: "audio bus ids must be unique" },
  )
  .refine(
    ({ buses }) => {
      const ids = new Set(buses.map((b) => b.id));
      return buses.every((b) => b.parent === "" || ids.has(b.parent));
    },
    {
      message:
        "every bus `parent` must reference an existing bus id (or empty string for root)",
    },
  )
  .refine(
    ({ buses }) => {
      // Parent graph must be acyclic — traverse from each bus to root, detect cycle.
      const byId = new Map(buses.map((b) => [b.id, b] as const));
      for (const start of buses) {
        const seen = new Set<string>();
        let cur: string | undefined = start.id;
        while (cur !== undefined && cur !== "") {
          if (seen.has(cur)) return false;
          seen.add(cur);
          cur = byId.get(cur)?.parent;
        }
      }
      return true;
    },
    { message: "audio bus parent graph must be acyclic" },
  )
  .refine(
    ({ buses, duckRules }) => {
      const ids = new Set(buses.map((b) => b.id));
      return duckRules.every((r) => ids.has(r.trigger) && ids.has(r.target));
    },
    {
      message:
        "duck-rule `trigger` and `target` must both reference existing bus ids",
    },
  )
  .refine(
    ({ duckRules }) => {
      const keys = duckRules.map((r) => `${r.trigger}→${r.target}`);
      return new Set(keys).size === keys.length;
    },
    { message: "duplicate (trigger, target) duck rules are ambiguous" },
  );
export type AudioBusMixManifest = z.infer<typeof AudioBusMixManifestSchema>;
