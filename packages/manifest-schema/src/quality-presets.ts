/**
 * Quality preset manifest schema.
 *
 * Companion to Phase J7's `ProjectSettingsManifestSchema` —
 * `project-settings.ts` pins *which* preset the project ships with;
 * this manifest defines *what* each preset actually means (shadow
 * resolution, reflection quality, post-processing stack depth,
 * particle density, etc.). The renderer reads the resolved preset
 * at boot and configures its node graphs accordingly.
 *
 * Separate file because presets are typically authored once and
 * reused across projects — a studio standard — while project
 * settings vary per game.
 */

import { z } from "zod";

/** Shadow map resolution per light. Power-of-two constraint is runtime-enforced; the schema only validates sensible bounds. */
export const ShadowResolutionSchema = z.enum([
  "off",
  "512",
  "1024",
  "2048",
  "4096",
  "8192",
]);
export type ShadowResolution = z.infer<typeof ShadowResolutionSchema>;

export const ReflectionQualitySchema = z.enum([
  "off",
  "cubemap",
  "planar",
  "ssr",
  "ssr-high",
]);
export type ReflectionQuality = z.infer<typeof ReflectionQualitySchema>;

export const PostProcessPassesSchema = z.object({
  bloom: z.boolean().default(true),
  toneMapping: z.boolean().default(true),
  ssao: z.boolean().default(false),
  motionBlur: z.boolean().default(false),
  depthOfField: z.boolean().default(false),
  colorGrading: z.boolean().default(true),
  vignette: z.boolean().default(false),
});
export type PostProcessPasses = z.infer<typeof PostProcessPassesSchema>;

export const QualityPresetEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(""),
  shadowResolution: ShadowResolutionSchema,
  /** Shadow draw distance in world units. */
  shadowDistance: z.number().nonnegative(),
  reflections: ReflectionQualitySchema,
  postProcess: PostProcessPassesSchema,
  /** 0..1 — fraction of particles to spawn vs authored count. */
  particleDensity: z.number().min(0).max(1),
  /** LOD bias — 0 = default, negative = keep detail longer, positive = drop earlier. */
  lodBias: z.number().min(-4).max(4).default(0),
  /** Pixel ratio cap — 0 = uncapped; typical 1.0 for low, 2.0 for ultra. */
  maxPixelRatio: z.number().nonnegative().default(0),
  /** Optional tag for debug overlays / telemetry. */
  tag: z.string().default(""),
});
export type QualityPresetEntry = z.infer<typeof QualityPresetEntrySchema>;

export const QualityPresetsManifestSchema = z
  .array(QualityPresetEntrySchema)
  .refine((list) => new Set(list.map((p) => p.id)).size === list.length, {
    message: "quality preset ids must be unique",
  })
  .refine((list) => list.length >= 1, {
    message: "quality preset manifest must contain at least one preset",
  });
export type QualityPresetsManifest = z.infer<
  typeof QualityPresetsManifestSchema
>;
