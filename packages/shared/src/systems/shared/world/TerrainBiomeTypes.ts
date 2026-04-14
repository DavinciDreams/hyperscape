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
    [TreeId.General]: { weight: 50, maxHeight: 60 },
    [TreeId.Eucalyptus]: { weight: 10, maxHeight: 60 },
    [TreeId.Oak]: { weight: 30, maxHeight: 60 },
    [TreeId.Mahogany]: { weight: 20, maxHeight: 60 },
    [TreeId.Pine]: { weight: 50, minHeight: 60 },
    [TreeId.Bamboo]: { weight: 20, minHeight: 50 },
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
  density: 3,
  minSpacing: 5,
  clustering: true,
  clusterSize: 30,
  clusterRadius: 100,
  clusterSpacing: 150,
  scaleVariation: [1.0, 1.2],
  maxSlope: 1.5,
};

const CANYON_TREE_CONFIG: BiomeTreeConfig = {
  enabled: true,
  trees: {
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
    [TreeId.Maple]: { weight: 20, maxHeight: 60 },
    [TreeId.Magic]: { weight: 5, maxHeight: 60 },
    [TreeId.Dead]: { weight: 25 },
  },
  density: 2,
  minSpacing: 60,
  clustering: false,
  scaleVariation: [1.0, 1.2],
  maxSlope: 0.1,
};

const TUNDRA_TREE_CONFIG: BiomeTreeConfig = {
  enabled: true,
  enableSnow: true,
  trees: {
    [TreeId.Pine]: { weight: 50, minHeight: 35 },
    [TreeId.PineDead]: { weight: 30, minHeight: 38 },
    [TreeId.Dead]: { weight: 20, minHeight: 38 },
  },
  density: 5,
  minSpacing: 5,
  clustering: true,
  clusterSize: 30,
  clusterRadius: 100,
  clusterSpacing: 200,
  scaleVariation: [1.0, 1.2],
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

// ---------------------------------------------------------------------------
// Per-biome grass configs
// ---------------------------------------------------------------------------

export interface BiomeGrassConfig {
  /** Overall density multiplier (0 = no grass, 1 = full density) */
  density: number;
  /** Max terrain slope (0-1, same metric as GPU shader) for grass placement */
  maxSlope: number;
  /** Minimum grassWeight from terrain color to allow placement */
  minGrassWeight: number;
  /** Blade height scale relative to global BLADE_HEIGHT_MIN/MAX */
  heightScale: number;
  /** Patchiness (0 = uniform spread, 1 = highly clustered islands) */
  patchiness: number;
  /** World-space noise frequency for patch mask (higher = smaller patches) */
  patchScale: number;
  /** Optional grass tint color [r, g, b] in 0-1 range. Blended over the terrain color. */
  tintColor?: [number, number, number];
  /** How strongly tintColor is applied (0 = terrain color, 1 = full tint). Default 0. */
  tintStrength?: number;
}

const FOREST_GRASS_CONFIG: BiomeGrassConfig = {
  density: 1.0,
  maxSlope: 0.1,
  minGrassWeight: 0.6,
  heightScale: 1.0,
  patchiness: 0.0,
  patchScale: 0.02,
};

const CANYON_GRASS_CONFIG: BiomeGrassConfig = {
  density: 0.8,
  maxSlope: 0.15,
  minGrassWeight: 0.8,
  heightScale: 0.8,
  patchiness: 0.95,
  patchScale: 0.05,
  tintColor: [0.35, 0.4, 0.15],
  tintStrength: 0.4,
};

const TUNDRA_GRASS_CONFIG: BiomeGrassConfig = {
  density: 1.0,
  maxSlope: 0.3,
  minGrassWeight: 0.8,
  heightScale: 1.0,
  patchiness: 0.6,
  patchScale: 0.018,
  tintColor: [1.0, 1.0, 1.0],
  tintStrength: 0.4,
};

const BIOME_GRASS_CONFIGS: Record<BiomeType, BiomeGrassConfig> = {
  [BiomeType.Forest]: FOREST_GRASS_CONFIG,
  [BiomeType.Canyon]: CANYON_GRASS_CONFIG,
  [BiomeType.Tundra]: TUNDRA_GRASS_CONFIG,
};

export function getGrassConfigForBiome(biomeId: string): BiomeGrassConfig {
  return BIOME_GRASS_CONFIGS[biomeId as BiomeType] ?? FOREST_GRASS_CONFIG;
}

/** Biome IDs whose tree config has enableSnow set to true. */
export const SNOW_BIOMES: ReadonlySet<string> = new Set(
  Object.entries(BIOME_TREE_CONFIGS)
    .filter(([, cfg]) => cfg.enableSnow)
    .map(([id]) => id),
);

// ---------------------------------------------------------------------------
// Per-biome scatter configs (rocks, cacti, flowers, etc.)
// ---------------------------------------------------------------------------

export interface BiomeScatterLayer {
  /** Biome identifier — used to key the batch pool so each biome gets its own
   *  BatchedMesh + shader */
  biomeId: string;
  /** Asset IDs from vegetation.json to scatter */
  assets: string[];
  /** Instances per 100×100m tile */
  density: number;
  /** Min distance between instances of this layer */
  minSpacing: number;
  /** Max terrain slope (0–1) for placement */
  maxSlope?: number;
  /** Skip positions below water */
  avoidWater?: boolean;
  /** Only place where terrain weights are in range, e.g. { grass: [0.5, 1.0] } */
  terrainWeights?: {
    grass?: [number, number];
    dirt?: [number, number];
    cliff?: [number, number];
  };
  /** Minimum world Y height for placement */
  minHeight?: number;
  /** Maximum world Y height for placement */
  maxHeight?: number;
  /** Group instances into natural-looking patches */
  clustering?: boolean;
  /** Average number of instances per cluster (requires clustering: true) */
  clusterSize?: number;
  /** Perlin noise frequency for patch mask — higher = smaller patches (default 0.05) */
  noiseScale?: number;
  /** Noise cutoff 0–1, positions below this are skipped (default 0.3) */
  noiseThreshold?: number;
  /** Per-instance RGB color multiplier blended with adjacent biome tints by weight.
   *  [1,1,1] (default) = no tint. Values > 1 boost, < 1 darken that channel. */
  colorTint?: [number, number, number];
}

export interface BiomeScatterConfig {
  layers: BiomeScatterLayer[];
}

const FOREST_SCATTER_CONFIG: BiomeScatterConfig = { layers: [] };
const TUNDRA_SCATTER_CONFIG: BiomeScatterConfig = {
  layers: [
    {
      biomeId: "tundra",
      assets: ["cactus_group"],
      density: 4,
      minSpacing: 8,
      maxSlope: 0.5,
      avoidWater: true,
      colorTint: [0.1, 0.1, 10.1],
    },
  ],
};

const CANYON_SCATTER_CONFIG: BiomeScatterConfig = {
  layers: [
    {
      biomeId: "canyon",
      assets: ["cactus_group"],
      density: 4,
      minSpacing: 8,
      maxSlope: 0.5,
      avoidWater: true,
      colorTint: [10.15, 0.1, 0.1],
    },
  ],
};

const BIOME_SCATTER_CONFIGS: Record<BiomeType, BiomeScatterConfig> = {
  [BiomeType.Forest]: FOREST_SCATTER_CONFIG,
  [BiomeType.Canyon]: CANYON_SCATTER_CONFIG,
  [BiomeType.Tundra]: TUNDRA_SCATTER_CONFIG,
};

export function getScatterConfigForBiome(biomeId: string): BiomeScatterConfig {
  return BIOME_SCATTER_CONFIGS[biomeId as BiomeType] ?? FOREST_SCATTER_CONFIG;
}
