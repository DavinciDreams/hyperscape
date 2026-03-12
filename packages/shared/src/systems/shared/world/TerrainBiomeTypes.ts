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
  distribution: {
    [TreeId.Knotwood]: 40,
    [TreeId.Oak]: 20,
    [TreeId.Birch]: 20,
    [TreeId.Maple]: 40,
    [TreeId.Fir]: 15,
    [TreeId.Pine]: 15,
    [TreeId.ChinaPine]: 15,
    [TreeId.Bamboo]: 15,
  },
  placements: {
    [TreeId.Bamboo]: { minHeight: 35 },
    [TreeId.Knotwood]: { maxHeight: 25 },
    [TreeId.Oak]: { maxHeight: 25 },
    [TreeId.Birch]: { maxHeight: 25 },
    [TreeId.Maple]: { maxHeight: 25 },
    [TreeId.Fir]: { maxHeight: 25 },
    [TreeId.Pine]: { maxHeight: 25 },
    [TreeId.ChinaPine]: { minHeight: 30 },
  },
  density: 10,
  minSpacing: 8,
  clustering: true,
  clusterSize: 5,
  scaleVariation: [0.8, 1.2],
  maxSlope: 1.5,
};

const CANYON_TREE_CONFIG: BiomeTreeConfig = {
  enabled: true,
  distribution: {
    [TreeId.Cactus]: 20,
    [TreeId.Dead]: 20,
    [TreeId.Palm]: 20,
    [TreeId.Coconut]: 10,
  },
  placements: {
    [TreeId.Cactus]: { avoidsWaterBelow: 3 },
    [TreeId.Dead]: { minHeight: 20 },
    [TreeId.Palm]: {
      waterAffinity: 0.3,
      waterProximityHeight: 9,
      maxHeight: 15,
    },
    [TreeId.Coconut]: {
      waterAffinity: 0.6,
      waterProximityHeight: 9,
      maxHeight: 15,
    },
  },
  density: 15,
  minSpacing: 18,
  clustering: false,
  scaleVariation: [0.7, 1.3],
  maxSlope: 2.0,
};

const TUNDRA_TREE_CONFIG: BiomeTreeConfig = {
  enabled: true,
  distribution: {
    [TreeId.WindPine]: 40,
    [TreeId.Fir]: 30,
    [TreeId.Pine]: 25,
    [TreeId.Birch]: 10,
  },
  placements: {
    [TreeId.WindPine]: { minHeight: 15 },
    [TreeId.Fir]: { minHeight: 10 },
    [TreeId.Pine]: { minHeight: 8 },
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
