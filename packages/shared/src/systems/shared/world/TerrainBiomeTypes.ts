/**
 * Single source of truth for biome type identifiers and per-biome configs.
 *
 * All terrain files (TerrainSystem, TerrainHeightParams, TerrainShader,
 * QuadChunkWorker, TerrainWorker, TerrainQuadChunkGenerator) MUST import
 * from here instead of using string literals.
 */

import type { BiomeTreeConfig } from "../../../types/world/world-types";
import { TreeId } from "../../../constants/TreeTypes";

export enum BiomeType {
  Tundra = "tundra",
  Forest = "forest",
  Canyon = "canyon",
}

export const DEFAULT_BIOME = BiomeType.Forest;
export const BIOME_LIST: BiomeType[] = Object.values(BiomeType);

/**
 * Worker-injectable JS that defines BiomeType constants.
 * Injected once at the top of inline worker code so the worker
 * can reference BT_TUNDRA, BT_FOREST, BT_CANYON without magic strings.
 */
export function buildBiomeConstantsJS(): string {
  return `
  var BT_TUNDRA = "${BiomeType.Tundra}";
  var BT_FOREST = "${BiomeType.Forest}";
  var BT_CANYON = "${BiomeType.Canyon}";
  var BT_DEFAULT = BT_FOREST;
  `;
}

// ---------------------------------------------------------------------------
// Per-biome tree configs
// ---------------------------------------------------------------------------

const FOREST_TREE_CONFIG: BiomeTreeConfig = {
  enabled: true,
  trees: {
    [TreeId.Oak]: { weight: 30, minHeight: 33.6, maxHeight: 60 },
    [TreeId.Birch]: { weight: 25, minHeight: 33.6, maxHeight: 60 },
    [TreeId.Pine]: { weight: 20, minHeight: 60 },
    [TreeId.Knotwood]: { weight: 1, minHeight: 35, maxHeight: 60 },
    [TreeId.Maple]: { weight: 1, minHeight: 35, maxHeight: 60 },
  },
  density: 3,
  minSpacing: 150,
  clustering: false,
  scaleVariation: [0.8, 1.2],
  maxSlope: 1.5,
};

const CANYON_TREE_CONFIG: BiomeTreeConfig = {
  enabled: true,
  trees: {
    [TreeId.Oak]: { weight: 20 },
    [TreeId.Dead]: { weight: 25, minHeight: 60 },
    [TreeId.Palm]: {
      weight: 25,
      waterAffinity: 0.8,
      waterSearchRadius: 100,
      waterMaxDistance: 80,
    },
    [TreeId.Banana]: {
      weight: 25,
      waterAffinity: 0.8,
      waterSearchRadius: 100,
      waterMaxDistance: 80,
    },
  },
  density: 1,
  minSpacing: 1050,
  clustering: false,
  scaleVariation: [0.7, 1.3],
  maxSlope: 0.1,
};

const TUNDRA_TREE_CONFIG: BiomeTreeConfig = {
  enabled: true,
  enableSnow: true,
  trees: {
    [TreeId.PineSnow]: { weight: 40, minHeight: 38 },
    [TreeId.PineDead]: { weight: 20, minHeight: 38 },
    [TreeId.Pine]: { weight: 15, minHeight: 35 },
  },
  density: 3,
  minSpacing: 150,
  clustering: false,
  scaleVariation: [0.6, 1.0],
  maxSlope: 1.5,
};

const BIOME_TREE_CONFIGS: Record<BiomeType, BiomeTreeConfig> = {
  [BiomeType.Forest]: FOREST_TREE_CONFIG,
  [BiomeType.Canyon]: CANYON_TREE_CONFIG,
  [BiomeType.Tundra]: TUNDRA_TREE_CONFIG,
};

/**
 * Get the tree config for a specific biome.
 * Falls back to the forest config for unknown biomes.
 */
export function getTreeConfigForBiome(biomeId: string): BiomeTreeConfig {
  return BIOME_TREE_CONFIGS[biomeId as BiomeType] ?? FOREST_TREE_CONFIG;
}

/** Biome IDs whose tree config has enableSnow set to true. */
export const SNOW_BIOMES: ReadonlySet<string> = new Set(
  Object.entries(BIOME_TREE_CONFIGS)
    .filter(([, cfg]) => cfg.enableSnow)
    .map(([id]) => id),
);
