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
    [TreeId.Knotwood]: { weight: 40, maxHeight: 30 },
    [TreeId.Oak]: { weight: 20, maxHeight: 30 },
    [TreeId.Birch]: { weight: 20, maxHeight: 30 },
    [TreeId.Maple]: { weight: 40, maxHeight: 30 },
    [TreeId.Fir]: { weight: 15, maxHeight: 30 },
    [TreeId.Pine]: { weight: 15, maxHeight: 30 },
    [TreeId.ChinaPine]: { weight: 15, minHeight: 30, maxHeight: 60 },
    [TreeId.Bamboo]: { weight: 15, minHeight: 35 },
  },
  density: 15,
  minSpacing: 12,
  clustering: false,
  scaleVariation: [0.8, 1.2],
  maxSlope: 1.5,
};

const CANYON_TREE_CONFIG: BiomeTreeConfig = {
  enabled: true,
  trees: {
    [TreeId.Cactus]: { weight: 20, avoidsWaterBelow: 3 },
    [TreeId.Dead]: { weight: 20, minHeight: 20 },
    [TreeId.Palm]: {
      weight: 20,
      waterAffinity: 0.5,
      waterProximityHeight: 9,
      maxHeight: 9,
    },
    [TreeId.Banana]: {
      weight: 15,
      waterAffinity: 0.3,
      waterProximityHeight: 9,
      minHeight: 9,
      maxHeight: 13,
    },
    [TreeId.Yucca]: { weight: 15, avoidsWaterBelow: 3 },
  },
  density: 15,
  minSpacing: 18,
  clustering: false,
  scaleVariation: [0.7, 1.3],
  maxSlope: 2.0,
};

const TUNDRA_TREE_CONFIG: BiomeTreeConfig = {
  enabled: true,
  trees: {
    [TreeId.WindPine]: { weight: 40, minHeight: 15 },
    [TreeId.Fir]: { weight: 30, minHeight: 10 },
    [TreeId.Pine]: { weight: 25, minHeight: 8 },
    [TreeId.Birch]: { weight: 10 },
  },
  density: 10,
  minSpacing: 12,
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
