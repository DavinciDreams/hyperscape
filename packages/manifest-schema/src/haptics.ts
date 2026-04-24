/**
 * Haptics manifest schema.
 *
 * Declarative authored controller-rumble / touch-haptic patterns,
 * keyed by stable string id. Gameplay systems trigger them via events:
 *
 *   world.emit("haptics:play", { id: "hit_heavy", entityId, intensity?: 0..1 })
 *
 * Scope: authored pattern registry. Runtime `HapticsSystem` dispatches
 * to Gamepad API (low/high freq motors), mobile touch-haptic API, or
 * VR controller haptics depending on the active device.
 *
 * Substrate only — this schema defines the *shape* of an authored
 * haptic pattern. The runtime mapper that binds it to a specific
 * device backend lands separately.
 */

import { z } from "zod";

/** HapticPatternId — lowerCamelCase ASCII identifier. */
const HapticPatternId = z
  .string()
  .regex(
    /^[a-z][a-zA-Z0-9_-]*$/,
    "haptic pattern id must be lowerCamelCase ASCII identifier",
  );

/**
 * Which motor / effector the stage targets. Gamepad API maps low/high
 * to weak/strong rumble motors; mobile typically collapses to a single
 * vibration channel; VR/xinput supports trigger-specific rumble.
 */
export const HapticChannelSchema = z.enum([
  "low-frequency",
  "high-frequency",
  "both",
  "left-trigger",
  "right-trigger",
  "mobile-default",
]);
export type HapticChannel = z.infer<typeof HapticChannelSchema>;

/**
 * Envelope shape for amplitude ramp within a stage. Runtime
 * interpolates from `startAmplitude` to `endAmplitude` using the
 * named curve.
 */
export const HapticEnvelopeSchema = z.enum([
  "constant",
  "linear",
  "ease-in",
  "ease-out",
  "ease-in-out",
]);
export type HapticEnvelope = z.infer<typeof HapticEnvelopeSchema>;

/**
 * A single stage within a pattern — runs for `durationMs` milliseconds
 * with the given channel, envelope, and amplitudes (0..1).
 */
export const HapticStageSchema = z
  .object({
    channel: HapticChannelSchema,
    /** Duration of this stage in milliseconds (1..10_000). */
    durationMs: z.number().int().min(1).max(10_000),
    /** Amplitude at stage start (0 = none, 1 = full). */
    startAmplitude: z.number().min(0).max(1),
    /** Amplitude at stage end. */
    endAmplitude: z.number().min(0).max(1),
    /** Envelope shape between start/end amplitudes. */
    envelope: HapticEnvelopeSchema.default("linear"),
    /**
     * Optional frequency hint in Hz for devices that support variable
     * frequency (mobile Haptic Engine, VR). 0 = use device default.
     */
    frequencyHz: z.number().min(0).max(1000).default(0),
  })
  .strict()
  .refine(
    (s) => s.envelope !== "constant" || s.startAmplitude === s.endAmplitude,
    {
      message:
        "`constant` envelope requires `startAmplitude === endAmplitude` (ramp implicit in any other envelope)",
    },
  );
export type HapticStage = z.infer<typeof HapticStageSchema>;

/**
 * A complete haptic pattern — ordered list of stages + a few pattern-
 * level knobs. Runtime plays stages strictly in order, concatenating
 * their durations.
 */
export const HapticPatternSchema = z
  .object({
    id: HapticPatternId,
    name: z.string().min(1),
    description: z.string().default(""),
    /** Category tag — used by mixer to apply category attenuation. */
    category: z.enum([
      "combat",
      "ui",
      "ambient",
      "notification",
      "environment",
      "custom",
    ]),
    /** Ordered list of stages — at least one. */
    stages: z.array(HapticStageSchema).min(1).max(32),
    /**
     * Global intensity multiplier (0..1) applied on top of per-stage
     * amplitudes — lets authors mark a whole pattern as gentler/harder
     * without editing every stage.
     */
    intensityScale: z.number().min(0).max(1).default(1),
    /** Whether the pattern loops. Used for ambient rumbles. */
    loop: z.boolean().default(false),
    /**
     * If `loop=true`, gap in ms between loop iterations. 0 = seamless.
     * Not meaningful when `loop=false`.
     */
    loopGapMs: z.number().int().min(0).max(10_000).default(0),
    /**
     * Whether the pattern is cancellable by higher-priority triggers.
     * `false` = must play to completion (e.g. UI confirm tick).
     */
    cancellable: z.boolean().default(true),
    /**
     * Priority — higher preempts lower when the same channel is
     * already playing. Equal priorities queue.
     */
    priority: z.number().int().min(0).max(100).default(10),
  })
  .strict()
  .refine((p) => p.loop || p.loopGapMs === 0, {
    message: "`loopGapMs` is only meaningful when `loop: true`",
  });
export type HapticPattern = z.infer<typeof HapticPatternSchema>;

/**
 * Manifest is a bare array of patterns with unique-id refinement.
 * Keeping it flat — no "category buckets" — because patterns are
 * often shared across categories at runtime via events.
 */
export const HapticsManifestSchema = z
  .array(HapticPatternSchema)
  .refine((arr) => new Set(arr.map((p) => p.id)).size === arr.length, {
    message: "haptic pattern ids must be unique",
  });
export type HapticsManifest = z.infer<typeof HapticsManifestSchema>;
