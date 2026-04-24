/**
 * Post-process-volume manifest schema.
 *
 * Section 15 (UE5 parity — post-process volumes) of the World
 * Studio AAA plan. Describes region-bounded overrides of the
 * global render profile — entering a volume blends its settings
 * on top of the base `render-profile.ts` values.
 *
 * Scope: authored tuning knobs only. The runtime compositor
 * (not this schema) chooses which volume is active, handles
 * blend weights, and merges settings into the final frame.
 */

import { z } from "zod";

const Vec3 = z
  .object({
    x: z.number(),
    y: z.number(),
    z: z.number(),
  })
  .strict();

const ColorRGB = z
  .object({
    r: z.number().min(0).max(1),
    g: z.number().min(0).max(1),
    b: z.number().min(0).max(1),
  })
  .strict();

/** Volume shape — how the compositor decides "am I inside?". */
export const PostProcessVolumeShapeSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("unbounded"),
    })
    .strict(),
  z
    .object({
      kind: z.literal("sphere"),
      center: Vec3,
      radius: z.number().positive(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("aabb"),
      min: Vec3,
      max: Vec3,
    })
    .strict()
    .refine(
      ({ min, max }) => min.x <= max.x && min.y <= max.y && min.z <= max.z,
      {
        message: "aabb `min` must be component-wise <= `max`",
      },
    ),
]);
export type PostProcessVolumeShape = z.infer<
  typeof PostProcessVolumeShapeSchema
>;

/**
 * Overridable render settings — each is optional; only non-null
 * entries blend over the base profile.
 */
export const PostProcessOverridesSchema = z
  .object({
    /** Exposure bias in stops. */
    exposureBiasStops: z.number().min(-16).max(16).optional(),
    /** Bloom threshold in nits equivalent. */
    bloomThreshold: z.number().min(0).max(4).optional(),
    bloomStrength: z.number().min(0).max(4).optional(),
    /** Fog density multiplier. */
    fogDensity: z.number().min(0).max(4).optional(),
    /** Fog color override. */
    fogColor: ColorRGB.optional(),
    /** Saturation multiplier (0 = grayscale, 1 = identity). */
    saturation: z.number().min(0).max(4).optional(),
    contrast: z.number().min(0).max(4).optional(),
    /** Vignette intensity (0..1). */
    vignette: z.number().min(0).max(1).optional(),
    /** Chromatic aberration strength (0..1). */
    chromaticAberration: z.number().min(0).max(1).optional(),
  })
  .strict();
export type PostProcessOverrides = z.infer<typeof PostProcessOverridesSchema>;

export const PostProcessVolumeSchema = z
  .object({
    id: z
      .string()
      .regex(
        /^[a-z][a-zA-Z0-9_-]*(?:\.[a-z][a-zA-Z0-9_-]*)*$/,
        "post-process volume id must be dot-separated lowerCamelCase segments",
      ),
    name: z.string().min(1),
    /** Priority — higher volumes win when several overlap. */
    priority: z.number().int().min(-1000).max(1000).default(0),
    /** Blend-in distance in meters outside the shape boundary. */
    blendDistanceMeters: z.number().min(0).max(1000).default(0),
    /** Overall blend weight while inside (0..1). */
    blendWeight: z.number().min(0).max(1).default(1),
    /** Volume is disabled — useful to A/B without deleting. */
    enabled: z.boolean().default(true),
    shape: PostProcessVolumeShapeSchema,
    overrides: PostProcessOverridesSchema,
  })
  .strict();
export type PostProcessVolume = z.infer<typeof PostProcessVolumeSchema>;

export const PostProcessVolumeManifestSchema = z
  .array(PostProcessVolumeSchema)
  .refine((list) => new Set(list.map((v) => v.id)).size === list.length, {
    message: "post-process volume ids must be unique",
  })
  .refine(
    (list) => {
      // At most one `unbounded` volume — it acts as the global fallback.
      const unbounded = list.filter((v) => v.shape.kind === "unbounded");
      return unbounded.length <= 1;
    },
    {
      message:
        "at most one `unbounded` post-process volume is allowed — it defines the global fallback",
    },
  );
export type PostProcessVolumeManifest = z.infer<
  typeof PostProcessVolumeManifestSchema
>;
