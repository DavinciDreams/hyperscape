/**
 * Sound effect (SFX) manifest schema.
 *
 * Phase E1 of the World Studio AAA plan — authors bind one-shot
 * gameplay sounds (UI click, hit, pickup, footstep, spell impact)
 * to stable string ids that systems can trigger via events.
 *
 * Keeps the `Sound` data shape deliberately close to `MusicTrack` so
 * a future shared `AudioCue` refactor is mechanical; differences:
 *   - no `mood` (SFX are functional, not atmospheric)
 *   - adds `category` = narrow gameplay bucket (ui/combat/ambient/voice/...)
 *   - adds optional `volume` / `pitchVariance` so per-cue defaults live
 *     in the manifest instead of scattered across callsites
 */

import { z } from "zod";

export const SoundCategorySchema = z.enum([
  "ui",
  "combat",
  "ambient",
  "voice",
  "footstep",
  "impact",
  "pickup",
  "magic",
  "environment",
]);
export type SoundCategory = z.infer<typeof SoundCategorySchema>;

export const SoundEffectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: SoundCategorySchema,
  path: z
    .string()
    .min(1)
    .describe("asset:// URL or relative path to .mp3/.ogg/.wav"),
  description: z.string().default(""),
  duration: z
    .number()
    .nonnegative()
    .default(0)
    .describe("Clip length in seconds (0 = unknown)"),
  volume: z
    .number()
    .min(0)
    .max(1)
    .default(1)
    .describe("Default gain [0..1] — runtime mixer may apply further scaling"),
  pitchVariance: z
    .number()
    .min(0)
    .max(1)
    .default(0)
    .describe(
      "Random ± semitone variance applied on play; 0 = deterministic pitch",
    ),
  /**
   * When true the runtime is free to skip the cue if too many instances
   * are already playing (typical for footsteps / impact stacks). UI /
   * voice cues should leave this false so they always play.
   */
  cullable: z.boolean().default(false),
});
export type SoundEffect = z.infer<typeof SoundEffectSchema>;

/** The manifest JSON is a bare array. */
export const SoundEffectManifestSchema = z.array(SoundEffectSchema);
export type SoundEffectManifest = z.infer<typeof SoundEffectManifestSchema>;
