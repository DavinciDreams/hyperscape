/**
 * Biomes manifest schema.
 *
 * Covers `packages/server/world/assets/manifests/biomes.json` — the biome
 * catalog used by procgen (terrain colors, vegetation layers, mob pools).
 *
 * The manifest is a bare array of biome entries.
 */

import { z } from "zod";

/** Colors are hex strings (`#RRGGBB`) used by the sky/fog/tint pipeline. */
const HexColorSchema = z
  .string()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "expected #RRGGBB or #RGB");

export const BiomeColorSchemeSchema = z.object({
  primary: HexColorSchema,
  secondary: HexColorSchema,
  fog: HexColorSchema,
});
export type BiomeColorScheme = z.infer<typeof BiomeColorSchemeSchema>;

/**
 * One vegetation scatter layer inside a biome. Matches the inputs consumed
 * by the procgen vegetation scatterer.
 */
export const BiomeVegetationLayerSchema = z.object({
  category: z.string().min(1),
  density: z.number().nonnegative(),
  assets: z.array(z.string().min(1)),
  minSpacing: z.number().nonnegative(),
  clustering: z.boolean(),
  clusterSize: z.number().int().positive().optional(),
  noiseScale: z.number().positive(),
  noiseThreshold: z.number().min(0).max(1),
  avoidWater: z.boolean().optional(),
  avoidSteepSlopes: z.boolean().optional(),
  minHeight: z.number().optional(),
});
export type BiomeVegetationLayer = z.infer<typeof BiomeVegetationLayerSchema>;

export const BiomeVegetationSchema = z.object({
  enabled: z.boolean(),
  layers: z.array(BiomeVegetationLayerSchema),
});

export const BiomeSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string(),
    difficultyLevel: z.number().int().nonnegative(),
    terrain: z.string().min(1),
    resources: z.array(z.string().min(1)),
    mobs: z.array(z.string().min(1)),
    fogIntensity: z.number().min(0).max(1),
    ambientSound: z.string().min(1),
    colorScheme: BiomeColorSchemeSchema,
    color: z.number().int().nonnegative().describe("Packed 0xRRGGBB color"),
    heightRange: z.tuple([z.number(), z.number()]),
    terrainMultiplier: z.number().positive(),
    waterLevel: z.number(),
    maxSlope: z.number().nonnegative(),
    mobTypes: z.array(z.string().min(1)),
    difficulty: z.number().int().nonnegative(),
    baseHeight: z.number(),
    heightVariation: z.number().nonnegative(),
    resourceDensity: z.number().nonnegative(),
    resourceTypes: z.array(z.string().min(1)),
    vegetation: BiomeVegetationSchema,
  })
  .passthrough();
export type Biome = z.infer<typeof BiomeSchema>;

/** The manifest is a bare array. */
export const BiomesManifestSchema = z.array(BiomeSchema);
export type BiomesManifest = z.infer<typeof BiomesManifestSchema>;
