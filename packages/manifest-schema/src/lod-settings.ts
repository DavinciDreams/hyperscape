/**
 * LOD settings manifest schema.
 *
 * Covers `packages/server/world/assets/manifests/lod-settings.json` — the
 * distance thresholds used by the client renderer to switch between LOD
 * levels, imposter billboards, and fade-out for vegetation/props.
 */

import { z } from "zod";

/** One threshold ladder keyed by category (e.g., "default", "large_tree"). */
export const LODThresholdSchema = z.object({
  lod1: z.number().positive().describe("Distance at which LOD1 mesh kicks in"),
  imposter: z
    .number()
    .positive()
    .describe("Distance at which imposter billboard replaces geometry"),
  fadeOut: z
    .number()
    .positive()
    .describe("Distance at which the object fully fades out"),
});
export type LODThreshold = z.infer<typeof LODThresholdSchema>;

/**
 * Close-range dissolve transition (camera near-plane dissolve).
 * Avoids popping when the camera pushes through objects.
 */
export const LODDissolveSchema = z.object({
  closeRangeStart: z.number().nonnegative(),
  closeRangeEnd: z.number().positive(),
  transitionDuration: z.number().positive(),
});
export type LODDissolve = z.infer<typeof LODDissolveSchema>;

export const LODSettingsManifestSchema = z.object({
  version: z.number().int().positive(),
  distanceThresholds: z.record(z.string(), LODThresholdSchema),
  dissolve: LODDissolveSchema,
});
export type LODSettingsManifest = z.infer<typeof LODSettingsManifestSchema>;
