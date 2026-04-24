/**
 * Lighting-bake manifest schema.
 *
 * Section 15 (UE5 parity — lighting baking) of the World Studio
 * AAA plan. Describes offline bake settings for static lighting:
 * lightmap resolution, probe density, AO quality, and per-level
 * bake overrides.
 *
 * This schema does NOT describe the runtime renderer pipeline —
 * see `render-profile.ts` for tone mapping / bloom / fog. It only
 * describes what the offline baker produces and how finely it
 * discretizes the world.
 */

import { z } from "zod";

const Vec3 = z
  .object({
    x: z.number(),
    y: z.number(),
    z: z.number(),
  })
  .strict();

/** Coarse quality preset for the bake pipeline. */
export const BakeQualitySchema = z.enum([
  "preview",
  "low",
  "medium",
  "high",
  "production",
]);
export type BakeQuality = z.infer<typeof BakeQualitySchema>;

/** Lightmap storage format — affects memory + quality. */
export const LightmapFormatSchema = z.enum([
  "rgb8",
  "rgb16f",
  "rgba16f",
  "bc6h",
]);
export type LightmapFormat = z.infer<typeof LightmapFormatSchema>;

/** Ambient-occlusion bake settings. */
export const AmbientOcclusionSettingsSchema = z
  .object({
    enabled: z.boolean().default(true),
    /** Max trace distance in meters. */
    radius: z.number().positive().max(100).default(2),
    /** Number of rays per texel — higher = cleaner at higher cost. */
    samples: z.number().int().min(4).max(2048).default(128),
    /** 0..1 strength multiplier applied at composition. */
    intensity: z.number().min(0).max(2).default(1),
  })
  .strict();
export type AmbientOcclusionSettings = z.infer<
  typeof AmbientOcclusionSettingsSchema
>;

/** Indirect-lighting (GI) bake settings. */
export const IndirectLightingSettingsSchema = z
  .object({
    enabled: z.boolean().default(true),
    /** Number of diffuse bounces. */
    bounces: z.number().int().min(0).max(16).default(3),
    /** Ray samples per texel. */
    samples: z.number().int().min(1).max(16384).default(256),
    /** Global strength multiplier applied at composition. */
    intensity: z.number().min(0).max(4).default(1),
  })
  .strict();
export type IndirectLightingSettings = z.infer<
  typeof IndirectLightingSettingsSchema
>;

/** Lightprobe volume — dynamic objects sample these to get GI. */
export const LightprobeVolumeSchema = z
  .object({
    id: z
      .string()
      .regex(
        /^[a-z][a-zA-Z0-9_-]*$/,
        "lightprobe volume id must be lowerCamelCase ASCII identifier",
      ),
    center: Vec3,
    extent: Vec3,
    /** Number of probes per axis — total = density.x * density.y * density.z. */
    density: z
      .object({
        x: z.number().int().min(1).max(128),
        y: z.number().int().min(1).max(128),
        z: z.number().int().min(1).max(128),
      })
      .strict(),
  })
  .strict()
  .refine(({ extent }) => extent.x > 0 && extent.y > 0 && extent.z > 0, {
    message: "lightprobe volume `extent` components must be positive",
  });
export type LightprobeVolume = z.infer<typeof LightprobeVolumeSchema>;

/** Per-level bake override — supersedes defaults for that sublevel. */
export const LevelBakeOverrideSchema = z
  .object({
    sublevelId: z.string().min(1),
    quality: BakeQualitySchema.optional(),
    lightmapResolutionTexelsPerMeter: z
      .number()
      .positive()
      .max(1024)
      .optional(),
    ao: AmbientOcclusionSettingsSchema.optional(),
    gi: IndirectLightingSettingsSchema.optional(),
  })
  .strict();
export type LevelBakeOverride = z.infer<typeof LevelBakeOverrideSchema>;

export const LightingBakeManifestSchema = z
  .object({
    /** Master bake quality preset — individual dials can override. */
    quality: BakeQualitySchema.default("medium"),
    /** Base lightmap texels per world meter. */
    lightmapResolutionTexelsPerMeter: z
      .number()
      .positive()
      .max(1024)
      .default(4),
    lightmapFormat: LightmapFormatSchema.default("rgb16f"),
    /** Pad texels between UV islands to prevent bleed. */
    lightmapPaddingTexels: z.number().int().min(0).max(16).default(4),
    /** Max lightmap atlas dimension; downscale rather than exceed. */
    lightmapMaxAtlasSize: z.number().int().min(256).max(16384).default(4096),
    ao: AmbientOcclusionSettingsSchema.default({
      enabled: true,
      radius: 2,
      samples: 128,
      intensity: 1,
    }),
    gi: IndirectLightingSettingsSchema.default({
      enabled: true,
      bounces: 3,
      samples: 256,
      intensity: 1,
    }),
    lightprobeVolumes: z.array(LightprobeVolumeSchema).default([]),
    levelOverrides: z.array(LevelBakeOverrideSchema).default([]),
    /** Skip baking for dev iteration — forces realtime GI fallback. */
    skipBake: z.boolean().default(false),
  })
  .refine(
    ({ lightprobeVolumes }) =>
      new Set(lightprobeVolumes.map((v) => v.id)).size ===
      lightprobeVolumes.length,
    { message: "lightprobe volume ids must be unique" },
  )
  .refine(
    ({ levelOverrides }) =>
      new Set(levelOverrides.map((o) => o.sublevelId)).size ===
      levelOverrides.length,
    { message: "level-bake overrides must not target the same sublevel twice" },
  )
  .refine(
    ({ lightmapMaxAtlasSize }) => {
      // Must be a power of two for GPU compatibility.
      return (
        lightmapMaxAtlasSize > 0 &&
        (lightmapMaxAtlasSize & (lightmapMaxAtlasSize - 1)) === 0
      );
    },
    { message: "`lightmapMaxAtlasSize` must be a power of two" },
  );
export type LightingBakeManifest = z.infer<typeof LightingBakeManifestSchema>;
