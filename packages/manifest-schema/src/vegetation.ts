/**
 * Vegetation manifest schema.
 *
 * Covers `packages/server/world/assets/manifests/vegetation.json` — the asset
 * catalog consumed by procgen to scatter vegetation (mushrooms, bushes,
 * grass) across biomes.
 */

import { z } from "zod";

/** One vegetation asset. */
export const VegetationAssetSchema = z.object({
  id: z.string().min(1),
  model: z.string().min(1).describe("Asset path under asset:// or relative"),
  category: z
    .string()
    .min(1)
    .describe("Grouping key used by biome spawn rules"),
  baseScale: z.number().positive(),
  scaleVariation: z
    .tuple([z.number().positive(), z.number().positive()])
    .describe("[min, max] uniform scale multiplier applied at placement time"),
  randomRotation: z.boolean(),
  weight: z.number().nonnegative(),
  maxSlope: z.number().min(0).max(1),
  alignToNormal: z.boolean(),
  yOffset: z.number(),
});
export type VegetationAsset = z.infer<typeof VegetationAssetSchema>;

export const VegetationManifestSchema = z.object({
  version: z.number().int().positive(),
  description: z.string().optional(),
  assets: z.array(VegetationAssetSchema),
});
export type VegetationManifest = z.infer<typeof VegetationManifestSchema>;
