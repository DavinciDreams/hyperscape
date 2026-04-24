/**
 * Animations manifest schema.
 *
 * Phase E3 of the World Studio AAA plan — catalog of skeletal animation
 * clips available to any rigged entity (players, NPCs, mobs) plus the
 * per-action binding map that lets systems say
 *
 *   world.emit("anim:play", { entityId, action: "attack_melee" })
 *
 * without knowing which concrete clip id services that action on a
 * particular avatar/mob. The action→clip mapping lives alongside the
 * clips so a single manifest is the complete animation authoring
 * surface.
 *
 * Substrate only — wiring into an AnimationSystem is a follow-up.
 */

import { z } from "zod";

/**
 * Stable gameplay action tags. Extend by authoring a manifest row that
 * references a new tag; the enum here is the *minimum* surface every
 * rigged entity must cover. New tags that every entity cares about
 * belong on this enum; one-off entity-specific clips go through the
 * free-form `variants` map on a clip.
 */
export const AnimationActionSchema = z.enum([
  "idle",
  "walk",
  "run",
  "jump",
  "fall",
  "land",
  "attack_melee",
  "attack_ranged",
  "attack_magic",
  "hurt",
  "death",
  "gather",
  "craft",
  "emote",
  "sit",
  "sleep",
  "swim",
]);
export type AnimationAction = z.infer<typeof AnimationActionSchema>;

export const AnimationClipSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  path: z
    .string()
    .min(1)
    .describe("asset:// URL or relative path to .glb/.fbx containing the clip"),
  description: z.string().default(""),
  /** Animation length in seconds (0 = unknown, runtime will read from file). */
  duration: z.number().nonnegative().default(0),
  /** Default playback speed multiplier. */
  speed: z.number().positive().default(1),
  /** Whether the clip should loop by default. */
  loop: z.boolean().default(false),
  /**
   * Blend-weight fade-in/out in seconds. Animation systems typically
   * crossfade between the previous and next clip over this window.
   */
  blendIn: z.number().min(0).default(0.15),
  blendOut: z.number().min(0).default(0.15),
  /**
   * Optional free-form variant/tag list — e.g. `["twohand", "left"]`
   * on an `attack_melee` clip so callers can pick a variant at
   * runtime without needing per-entity enum additions.
   */
  tags: z.array(z.string().min(1)).default([]),
});
export type AnimationClip = z.infer<typeof AnimationClipSchema>;

/**
 * An action binding on a specific avatar / mob rig. The `clipId` must
 * reference an entry in the same manifest's `clips` array; the runtime
 * validator (separate follow-up) enforces this reference integrity.
 */
export const AnimationBindingSchema = z.object({
  rigId: z
    .string()
    .min(1)
    .describe("Avatar / mob rig id the binding applies to"),
  action: AnimationActionSchema,
  clipId: z.string().min(1),
  /** Optional per-rig speed override — falls back to clip.speed. */
  speed: z.number().positive().optional(),
  /** Optional per-rig loop override — falls back to clip.loop. */
  loop: z.boolean().optional(),
});
export type AnimationBinding = z.infer<typeof AnimationBindingSchema>;

export const AnimationManifestSchema = z.object({
  clips: z.array(AnimationClipSchema).default([]),
  bindings: z.array(AnimationBindingSchema).default([]),
});
export type AnimationManifest = z.infer<typeof AnimationManifestSchema>;
