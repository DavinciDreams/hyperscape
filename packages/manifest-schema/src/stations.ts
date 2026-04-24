/**
 * Stations manifest schemas.
 *
 * Source of truth for `stations.json` (world station definitions:
 * anvils, furnaces, ranges, banks) and `model-bounds.json` (raw GLB
 * bounding boxes used for automatic footprint calculation).
 * Previously `StationDataProvider` accepted any untyped
 * `StationsManifest` / `ModelBoundsManifest` object with no runtime
 * validation.
 *
 * Extracted as part of Phase A11 of
 * `PLAN_WORLD_STUDIO_AAA_COMPLETION.md`.
 */

import { z } from "zod";

export const FootprintSpecSchema = z.object({
  width: z.number().int().positive(),
  depth: z.number().int().positive(),
});
export type StationFootprintSpec = z.infer<typeof FootprintSpecSchema>;

export const StationManifestEntrySchema = z.object({
  type: z.string().min(1),
  name: z.string().min(1),
  /** `asset://…` URL or `null` for placeholder geometry. */
  model: z.string().min(1).nullable(),
  modelScale: z.number().positive(),
  modelYOffset: z.number(),
  examine: z.string().min(1),
  /** Manual footprint override (defaults to auto-detection). */
  footprint: FootprintSpecSchema.optional(),
  flattenGround: z.boolean().optional(),
  flattenPadding: z.number().min(0).optional(),
  flattenBlendRadius: z.number().min(0).optional(),
});
export type StationManifestEntry = z.infer<typeof StationManifestEntrySchema>;

export const StationsManifestSchema = z.object({
  stations: z.array(StationManifestEntrySchema).min(1),
});
export type StationsManifest = z.infer<typeof StationsManifestSchema>;

const Vec3Schema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
});

export const ModelBoundsEntrySchema = z.object({
  id: z.string().min(1),
  assetPath: z.string().min(1),
  bounds: z.object({
    min: Vec3Schema,
    max: Vec3Schema,
  }),
  dimensions: Vec3Schema,
  /** Pre-calculated footprint at scale 1.0 (recalculated with actual scale). */
  footprint: z.object({
    width: z.number(),
    depth: z.number(),
  }),
});
export type ModelBoundsEntry = z.infer<typeof ModelBoundsEntrySchema>;

export const ModelBoundsManifestSchema = z.object({
  generatedAt: z.string().min(1),
  tileSize: z.number().positive(),
  models: z.array(ModelBoundsEntrySchema),
});
export type ModelBoundsManifest = z.infer<typeof ModelBoundsManifestSchema>;
