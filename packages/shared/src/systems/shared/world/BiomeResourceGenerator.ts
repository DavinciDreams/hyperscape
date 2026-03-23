/**
 * Biome Resource Generator
 *
 * Extracted algorithms for generating harvestable resources (trees, ores)
 * based on biome configuration. Used by TerrainSystem and directly testable.
 *
 * Design principles:
 * - Pure functions for testability
 * - No side effects - returns resource arrays
 * - Deterministic via seeded RNG
 * - Real terrain height lookups via callback
 */

import type {
  BiomeTreeConfig,
  BiomeOreConfig,
  BiomeRockConfig,
  BiomePlantConfig,
} from "../../../types/world/world-types";
import type {
  ResourceNode,
  ResourceSubType,
} from "../../../types/world/terrain";
import type { VegetationInstance } from "../../../types/world/world-types";
import {
  getTreeLevelRequired,
  treeIdToSubType,
} from "../../../constants/TreeTypes";
import type { TreePlacementRules } from "../../../constants/TreeTypes";
import { getTreeConfigForBiome } from "./TerrainBiomeTypes";

/**
 * Context provided by TerrainSystem for resource generation.
 */
export interface ResourceGenerationContext {
  /** Tile X coordinate */
  tileX: number;
  /** Tile Z coordinate */
  tileZ: number;
  /** Tile key for resource IDs */
  tileKey: string;
  /** Tile size in meters */
  tileSize: number;
  /** Water height threshold */
  waterThreshold: number;
  /** Get terrain height at world coordinates */
  getHeightAt: (worldX: number, worldZ: number) => number;
  /** Check if position is on a road */
  isOnRoad?: (worldX: number, worldZ: number) => boolean;
  /** Get water surface Y at world position (river + ponds + ocean) */
  getWaterSurfaceAt?: (worldX: number, worldZ: number) => number;
  /** Get the dominant biome at a world position (for per-tree biome selection) */
  getDominantBiome?: (worldX: number, worldZ: number) => string;
  /** Deterministic RNG seeded for this tile */
  createRng: (salt: string) => () => number;
}

/**
 * @deprecated Use getTreeLevelRequired() from TreeTypes.ts instead.
 * Kept for backward compatibility — delegates to the single source of truth.
 */
export const TREE_LEVEL_REQUIREMENTS: Record<string, number> = new Proxy(
  {} as Record<string, number>,
  { get: (_target, prop: string) => getTreeLevelRequired(prop) },
);

/**
 * Mapping from game tree subtypes to @hyperscape/procgen presets.
 * Used for runtime procedural tree generation (visual variety).
 *
 * These presets define the visual characteristics of each tree type:
 * - normal: Common deciduous tree (Quaking Aspen)
 * - oak: Classic oak with spreading branches
 * - willow: Distinctive drooping branches
 * - teak: Tall tropical deciduous
 * - maple: Multi-trunk with palmate leaves
 * - mahogany: Large deciduous with dark wood
 * - yew: Ancient coniferous tree
 * - magic: Mystical tree with blossoms
 */
export const TREE_PROCGEN_PRESETS: Record<string, string> = {
  normal: "quakingAspen",
  oak: "blackOak",
  willow: "weepingWillow",
  teak: "blackTupelo",
  maple: "acer",
  mahogany: "sassafras",
  yew: "europeanLarch",
  magic: "hillCherry",
};

/**
 * Get the procgen preset name for a tree subtype.
 * Falls back to quakingAspen for unknown types.
 */
export function getTreeProcgenPreset(subType: string): string {
  return TREE_PROCGEN_PRESETS[subType] ?? "quakingAspen";
}

/**
 * Level requirements for ore types (OSRS mining levels).
 * Single source of truth - used by both generation and tests.
 */
export const ORE_LEVEL_REQUIREMENTS: Record<string, number> = {
  copper: 1,
  tin: 1,
  iron: 15,
  coal: 30,
  mithril: 55,
  adamant: 70,
  runite: 85,
};

/**
 * Get the level requirement for a tree type.
 * @deprecated Use getTreeLevelRequired() from TreeTypes.ts directly.
 */
export function getTreeLevelRequirement(subType: string): number {
  return getTreeLevelRequired(subType);
}

/**
 * Get the level requirement for an ore type.
 */
export function getOreLevelRequirement(subType: string): number {
  return ORE_LEVEL_REQUIREMENTS[subType] ?? 1;
}

/**
 * Generate harvestable trees for a tile based on biome configuration.
 *
 * @param ctx - Resource generation context from TerrainSystem
 * @param treeConfig - Biome tree configuration
 * @returns Array of ResourceNode objects for trees
 */
export function generateTrees(
  ctx: ResourceGenerationContext,
  treeConfig: BiomeTreeConfig,
): ResourceNode[] {
  if (!treeConfig.enabled) {
    return [];
  }

  const resources: ResourceNode[] = [];

  // Calculate tree count based on density and tile size
  const tileArea = (ctx.tileSize / 100) * (ctx.tileSize / 100);
  const baseCount = Math.floor(treeConfig.density * tileArea);

  if (baseCount === 0) {
    return [];
  }

  const maxSlope = treeConfig.maxSlope ?? Infinity;

  // Use deterministic RNG for reproducible placement
  const rng = ctx.createRng("trees");

  // Pre-compute tile-level distribution from the merged trees map
  const tileTreeMap = treeConfig.trees;
  const tileTreeTypes = Object.keys(tileTreeMap);
  if (tileTreeTypes.length === 0) {
    return [];
  }
  const tileTotalWeight = Object.values(tileTreeMap).reduce(
    (sum, cfg) => sum + cfg.weight,
    0,
  );
  if (tileTotalWeight === 0) {
    return [];
  }

  // Generate tree positions
  const placedPositions: Array<{ x: number; z: number }> = [];
  const minSpacing = treeConfig.minSpacing;
  const minSpacingSq = minSpacing * minSpacing;

  // If clustering is enabled, generate cluster centers first
  const clusterCenters: Array<{ x: number; z: number }> = [];
  if (treeConfig.clustering && treeConfig.clusterSize) {
    const numClusters = Math.max(
      1,
      Math.ceil(baseCount / treeConfig.clusterSize),
    );
    for (let i = 0; i < numClusters; i++) {
      clusterCenters.push({
        x: rng() * ctx.tileSize,
        z: rng() * ctx.tileSize,
      });
    }
  }

  let treesPlaced = 0;
  const maxAttempts = baseCount * 10;
  let attempts = 0;

  while (treesPlaced < baseCount && attempts < maxAttempts) {
    attempts++;

    // Generate position (clustered or uniform)
    let localX: number;
    let localZ: number;

    if (treeConfig.clustering && clusterCenters.length > 0) {
      // Pick a random cluster center and scatter around it
      const cluster = clusterCenters[Math.floor(rng() * clusterCenters.length)];
      const scatterRadius = treeConfig.clusterSize! * 3;
      const angle = rng() * Math.PI * 2;
      const distance = rng() * scatterRadius;
      localX = cluster.x + Math.cos(angle) * distance;
      localZ = cluster.z + Math.sin(angle) * distance;
    } else {
      // Uniform random placement
      localX = rng() * ctx.tileSize;
      localZ = rng() * ctx.tileSize;
    }

    // Clamp to tile bounds
    localX = Math.max(0, Math.min(ctx.tileSize, localX));
    localZ = Math.max(0, Math.min(ctx.tileSize, localZ));

    // Convert to world coordinates for height lookup
    const worldX = ctx.tileX * ctx.tileSize + localX;
    const worldZ = ctx.tileZ * ctx.tileSize + localZ;
    const height = ctx.getHeightAt(worldX, worldZ);

    // Skip if underwater (ocean or river/pond)
    if (height < ctx.waterThreshold) {
      continue;
    }
    if (ctx.getWaterSurfaceAt) {
      const waterY = ctx.getWaterSurfaceAt(worldX, worldZ);
      if (height <= waterY + 1.0) continue; // 1m buffer above water surface
    }

    // Check minimum spacing
    let tooClose = false;
    for (const pos of placedPositions) {
      const dx = localX - pos.x;
      const dz = localZ - pos.z;
      if (dx * dx + dz * dz < minSpacingSq) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) continue;

    // Check if on road
    if (ctx.isOnRoad?.(worldX, worldZ)) {
      continue;
    }

    // Reject steep slopes — sample 4 neighbors to estimate gradient magnitude
    if (maxSlope < Infinity) {
      const sd = 1.0;
      const dhdx =
        (ctx.getHeightAt(worldX + sd, worldZ) -
          ctx.getHeightAt(worldX - sd, worldZ)) /
        (2 * sd);
      const dhdz =
        (ctx.getHeightAt(worldX, worldZ + sd) -
          ctx.getHeightAt(worldX, worldZ - sd)) /
        (2 * sd);
      if (dhdx * dhdx + dhdz * dhdz > maxSlope * maxSlope) continue;
    }

    // Resolve the tree map for THIS position. If we have a per-position
    // biome callback, use it to get the actual biome here instead of
    // relying on the single tile-center biome.
    let activeTreeMap = tileTreeMap;
    let treeTypes = tileTreeTypes;
    let totalWeight = tileTotalWeight;

    if (ctx.getDominantBiome) {
      const positionBiome = ctx.getDominantBiome(worldX, worldZ);
      const posConfig = getTreeConfigForBiome(positionBiome);
      if (posConfig && posConfig.trees !== tileTreeMap) {
        activeTreeMap = posConfig.trees;
        treeTypes = Object.keys(activeTreeMap);
        totalWeight = Object.values(activeTreeMap).reduce(
          (sum, cfg) => sum + cfg.weight,
          0,
        );
        if (totalWeight === 0 || treeTypes.length === 0) continue;
      }
    }

    // Select tree type based on weighted distribution
    let selectedTreeId = treeTypes[0];
    const roll = rng() * totalWeight;
    let cumulative = 0;
    for (const treeType of treeTypes) {
      cumulative += activeTreeMap[treeType].weight;
      if (roll < cumulative) {
        selectedTreeId = treeType;
        break;
      }
    }
    const selectedType = treeIdToSubType(selectedTreeId);

    // Apply per-tree placement rules from the merged config
    const rules: TreePlacementRules | undefined = activeTreeMap[selectedTreeId];
    if (rules) {
      const heightAboveWater = height - ctx.waterThreshold;

      if (rules.minHeight !== undefined && height < rules.minHeight) continue;
      if (rules.maxHeight !== undefined && height > rules.maxHeight) continue;

      if (
        rules.avoidsWaterBelow !== undefined &&
        heightAboveWater < rules.avoidsWaterBelow
      )
        continue;

      if (rules.waterAffinity && rules.waterAffinity > 0) {
        const proximityLimit = rules.waterProximityHeight ?? 10;
        if (heightAboveWater > proximityLimit) {
          if (rng() < rules.waterAffinity) continue;
        }
      }
    }

    // Generate random scale within variation range
    const [minScale, maxScale] = treeConfig.scaleVariation ?? [0.8, 1.2];
    const scale = minScale + rng() * (maxScale - minScale);

    // Generate random Y-axis rotation
    const rotation = rng() * Math.PI * 2;

    // Create resource node
    const resource: ResourceNode = {
      id: `${ctx.tileKey}_tree_${treesPlaced}`,
      type: "tree",
      subType: selectedType as ResourceSubType,
      position: { x: localX, y: height, z: localZ },
      mesh: null,
      health: 100,
      maxHealth: 100,
      respawnTime: 300000, // 5 minutes
      harvestable: true,
      requiredLevel: getTreeLevelRequirement(selectedType),
      scale,
      rotation,
    };

    resources.push(resource);
    placedPositions.push({ x: localX, z: localZ });
    treesPlaced++;
  }

  return resources;
}

/**
 * Generate ore nodes for a tile based on biome configuration.
 * Supports ore veins (clusters) for more natural distribution.
 *
 * @param ctx - Resource generation context from TerrainSystem
 * @param oreConfig - Biome ore configuration
 * @returns Array of ResourceNode objects for ores
 */
export function generateOres(
  ctx: ResourceGenerationContext,
  oreConfig: BiomeOreConfig,
): ResourceNode[] {
  if (!oreConfig.enabled) {
    return [];
  }

  const resources: ResourceNode[] = [];

  // Calculate ore count based on density
  const tileArea = (ctx.tileSize / 100) * (ctx.tileSize / 100);
  const baseCount = Math.floor(oreConfig.density * tileArea);

  if (baseCount === 0) {
    return [];
  }

  // Use deterministic RNG
  const rng = ctx.createRng("ores");

  // Get distribution weights
  const distribution = oreConfig.distribution;
  const oreTypes = Object.keys(distribution);
  if (oreTypes.length === 0) {
    return [];
  }

  const totalWeight = Object.values(distribution).reduce(
    (sum, w) => sum + w,
    0,
  );
  if (totalWeight === 0) {
    return [];
  }

  // Track placed positions for spacing
  const placedPositions: Array<{ x: number; z: number }> = [];
  const minSpacing = oreConfig.minSpacing;
  const minSpacingSq = minSpacing * minSpacing;

  // If veins enabled, generate vein centers
  const veinCenters: Array<{ x: number; z: number; oreType: string }> = [];
  if (oreConfig.veins && oreConfig.veinSize) {
    const numVeins = Math.max(1, Math.ceil(baseCount / oreConfig.veinSize));
    for (let i = 0; i < numVeins; i++) {
      // Select ore type for this vein
      let selectedType = oreTypes[0];
      const roll = rng() * totalWeight;
      let cumulative = 0;
      for (const oreType of oreTypes) {
        cumulative += distribution[oreType];
        if (roll < cumulative) {
          selectedType = oreType;
          break;
        }
      }

      veinCenters.push({
        x: rng() * ctx.tileSize,
        z: rng() * ctx.tileSize,
        oreType: selectedType,
      });
    }
  }

  let oresPlaced = 0;
  const maxAttempts = baseCount * 10;
  let attempts = 0;

  while (oresPlaced < baseCount && attempts < maxAttempts) {
    attempts++;

    let localX: number;
    let localZ: number;
    let selectedType: string;

    if (oreConfig.veins && veinCenters.length > 0) {
      // Pick a random vein center and scatter around it
      const vein = veinCenters[Math.floor(rng() * veinCenters.length)];
      const scatterRadius = oreConfig.veinSize! * 2;
      const angle = rng() * Math.PI * 2;
      const distance = rng() * scatterRadius;
      localX = vein.x + Math.cos(angle) * distance;
      localZ = vein.z + Math.sin(angle) * distance;
      selectedType = vein.oreType;
    } else {
      // Uniform random placement with weighted ore selection
      localX = rng() * ctx.tileSize;
      localZ = rng() * ctx.tileSize;

      // Select ore type based on distribution
      selectedType = oreTypes[0];
      const roll = rng() * totalWeight;
      let cumulative = 0;
      for (const oreType of oreTypes) {
        cumulative += distribution[oreType];
        if (roll < cumulative) {
          selectedType = oreType;
          break;
        }
      }
    }

    // Clamp to tile bounds
    localX = Math.max(0, Math.min(ctx.tileSize, localX));
    localZ = Math.max(0, Math.min(ctx.tileSize, localZ));

    // Convert to world coordinates for height lookup
    const worldX = ctx.tileX * ctx.tileSize + localX;
    const worldZ = ctx.tileZ * ctx.tileSize + localZ;
    const height = ctx.getHeightAt(worldX, worldZ);

    // Skip if underwater (ocean or river/pond)
    if (height < ctx.waterThreshold) {
      continue;
    }
    if (ctx.getWaterSurfaceAt) {
      const waterY = ctx.getWaterSurfaceAt(worldX, worldZ);
      if (height <= waterY + 1.0) continue; // 1m buffer above water surface
    }

    // Check minimum spacing
    let tooClose = false;
    for (const pos of placedPositions) {
      const dx = localX - pos.x;
      const dz = localZ - pos.z;
      if (dx * dx + dz * dz < minSpacingSq) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) continue;

    // Check if on road
    if (ctx.isOnRoad?.(worldX, worldZ)) {
      continue;
    }

    // Extract ore subtype: "ore_copper" -> "copper"
    const oreSubType = selectedType.replace("ore_", "");

    // Generate random scale within variation range
    const [minScale, maxScale] = oreConfig.scaleVariation ?? [0.9, 1.1];
    const scale = minScale + rng() * (maxScale - minScale);

    // Generate random Y-axis rotation
    const rotation = rng() * Math.PI * 2;

    // Create resource node
    const resource: ResourceNode = {
      id: `${ctx.tileKey}_ore_${oresPlaced}`,
      type: "ore",
      subType: oreSubType as ResourceSubType,
      position: { x: localX, y: height, z: localZ },
      mesh: null,
      health: 100,
      maxHealth: 100,
      respawnTime: 300000, // 5 minutes
      harvestable: true,
      requiredLevel: getOreLevelRequirement(oreSubType),
      scale,
      rotation,
    };

    resources.push(resource);
    placedPositions.push({ x: localX, z: localZ });
    oresPlaced++;
  }

  return resources;
}

// ============================================================================
// DECORATIVE ROCK GENERATION
// ============================================================================

/**
 * Default rock presets mapping for each biome type.
 * Used when no specific distribution is provided.
 */
export const ROCK_BIOME_DEFAULTS: Record<
  string,
  { presets: string[]; distribution: Record<string, number> }
> = {
  tundra: {
    presets: ["granite", "basalt", "boulder"],
    distribution: { granite: 2, basalt: 2, boulder: 2 },
  },
  forest: {
    presets: ["boulder", "granite", "limestone"],
    distribution: { boulder: 3, granite: 2, limestone: 1 },
  },
  canyon: {
    presets: ["sandstone", "limestone", "pebble"],
    distribution: { sandstone: 4, limestone: 2, pebble: 1 },
  },
};

/**
 * Get rock presets and distribution for a biome type.
 */
export function getRockPresetsForBiome(biomeType: string): {
  presets: string[];
  distribution: Record<string, number>;
} {
  return (
    ROCK_BIOME_DEFAULTS[biomeType.toLowerCase()] ?? ROCK_BIOME_DEFAULTS.forest
  );
}

/**
 * Generate decorative rocks for a tile based on biome configuration.
 * These are non-harvestable environmental rocks for visual variety.
 *
 * @param ctx - Resource generation context from TerrainSystem
 * @param rockConfig - Biome rock configuration
 * @param biomeType - Biome type for default presets
 * @returns Array of VegetationInstance objects for rocks
 */
export function generateRocks(
  ctx: ResourceGenerationContext,
  rockConfig: BiomeRockConfig,
  biomeType: string,
): VegetationInstance[] {
  if (!rockConfig.enabled) {
    return [];
  }

  const rocks: VegetationInstance[] = [];

  // Calculate rock count based on density and tile size
  const tileArea = (ctx.tileSize / 100) * (ctx.tileSize / 100);
  const baseCount = Math.floor(rockConfig.density * tileArea);

  if (baseCount === 0) {
    return [];
  }

  // Use deterministic RNG
  const rng = ctx.createRng("rocks");

  // Get presets and distribution
  const presets =
    rockConfig.presets.length > 0
      ? rockConfig.presets
      : getRockPresetsForBiome(biomeType).presets;

  const distribution =
    rockConfig.distribution ?? getRockPresetsForBiome(biomeType).distribution;

  if (presets.length === 0) {
    return [];
  }

  const totalWeight = presets.reduce(
    (sum, p) => sum + (distribution[p] ?? 1),
    0,
  );
  if (totalWeight === 0) {
    return [];
  }

  // Track placed positions for spacing
  const placedPositions: Array<{ x: number; z: number }> = [];
  const minSpacing = rockConfig.minSpacing;
  const minSpacingSq = minSpacing * minSpacing;

  // Generate cluster centers if clustering enabled
  const clusterCenters: Array<{ x: number; z: number }> = [];
  const clusterChance = rockConfig.clusterChance ?? 0.3;
  const [clusterMin, clusterMax] = rockConfig.clusterSize ?? [3, 6];

  if (clusterChance > 0) {
    const numClusters = Math.ceil(baseCount / ((clusterMin + clusterMax) / 2));
    for (let i = 0; i < numClusters; i++) {
      if (rng() < clusterChance) {
        clusterCenters.push({
          x: rng() * ctx.tileSize,
          z: rng() * ctx.tileSize,
        });
      }
    }
  }

  let rocksPlaced = 0;
  const maxAttempts = baseCount * 15;
  let attempts = 0;

  while (rocksPlaced < baseCount && attempts < maxAttempts) {
    attempts++;

    let localX: number;
    let localZ: number;

    // Decide if this rock should be in a cluster
    const useCluster = clusterCenters.length > 0 && rng() < 0.6;

    if (useCluster) {
      const cluster = clusterCenters[Math.floor(rng() * clusterCenters.length)];
      const scatterRadius = 5 + rng() * 10; // 5-15m scatter
      const angle = rng() * Math.PI * 2;
      const distance = rng() * scatterRadius;
      localX = cluster.x + Math.cos(angle) * distance;
      localZ = cluster.z + Math.sin(angle) * distance;
    } else {
      localX = rng() * ctx.tileSize;
      localZ = rng() * ctx.tileSize;
    }

    // Clamp to tile bounds
    localX = Math.max(0, Math.min(ctx.tileSize, localX));
    localZ = Math.max(0, Math.min(ctx.tileSize, localZ));

    // Convert to world coordinates for height lookup
    const worldX = ctx.tileX * ctx.tileSize + localX;
    const worldZ = ctx.tileZ * ctx.tileSize + localZ;
    const height = ctx.getHeightAt(worldX, worldZ);

    // Skip if underwater (ocean or river/pond)
    if (height < ctx.waterThreshold) {
      continue;
    }
    if (ctx.getWaterSurfaceAt) {
      const waterY = ctx.getWaterSurfaceAt(worldX, worldZ);
      if (height <= waterY + 1.0) continue; // 1m buffer above water surface
    }

    // Check minimum spacing
    let tooClose = false;
    for (const pos of placedPositions) {
      const dx = localX - pos.x;
      const dz = localZ - pos.z;
      if (dx * dx + dz * dz < minSpacingSq) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) continue;

    // Check if on road
    if (ctx.isOnRoad?.(worldX, worldZ)) {
      continue;
    }

    // Select preset based on weighted distribution
    let selectedPreset = presets[0];
    const roll = rng() * totalWeight;
    let cumulative = 0;
    for (const preset of presets) {
      cumulative += distribution[preset] ?? 1;
      if (roll < cumulative) {
        selectedPreset = preset;
        break;
      }
    }

    // Generate random scale within range
    const [minScale, maxScale] = rockConfig.scaleRange;
    const scale = minScale + rng() * (maxScale - minScale);

    // Generate random Y-axis rotation
    const rotation = rng() * Math.PI * 2;

    // Create vegetation instance for rock
    const rock: VegetationInstance = {
      id: `${ctx.tileKey}_rock_${rocksPlaced}`,
      assetId: selectedPreset,
      category: "rock",
      position: { x: worldX, y: height, z: worldZ },
      rotation: { x: 0, y: rotation, z: 0 },
      scale,
      tileKey: ctx.tileKey,
    };

    rocks.push(rock);
    placedPositions.push({ x: localX, z: localZ });
    rocksPlaced++;
  }

  return rocks;
}

// ============================================================================
// DECORATIVE PLANT GENERATION
// ============================================================================

/**
 * Default plant presets mapping for each biome type.
 */
export const PLANT_BIOME_DEFAULTS: Record<
  string,
  { presets: string[]; distribution: Record<string, number> }
> = {
  tundra: {
    presets: ["bergenia", "pulmonaria"],
    distribution: { bergenia: 2, pulmonaria: 2 },
  },
  forest: {
    presets: ["monstera", "philodendron", "calathea", "ficus", "hosta"],
    distribution: {
      monstera: 2,
      philodendron: 2,
      calathea: 2,
      ficus: 1,
      hosta: 3,
    },
  },
  canyon: {
    presets: ["zamioculcas", "aglaonema", "syngonium"],
    distribution: { zamioculcas: 3, aglaonema: 2, syngonium: 1 },
  },
};

/**
 * Get plant presets and distribution for a biome type.
 */
export function getPlantPresetsForBiome(biomeType: string): {
  presets: string[];
  distribution: Record<string, number>;
} {
  return (
    PLANT_BIOME_DEFAULTS[biomeType.toLowerCase()] ?? PLANT_BIOME_DEFAULTS.forest
  );
}

/**
 * Generate decorative plants for a tile based on biome configuration.
 * These are non-harvestable environmental plants for visual variety.
 *
 * @param ctx - Resource generation context from TerrainSystem
 * @param plantConfig - Biome plant configuration
 * @param biomeType - Biome type for default presets
 * @returns Array of VegetationInstance objects for plants
 */
export function generatePlants(
  ctx: ResourceGenerationContext,
  plantConfig: BiomePlantConfig,
  biomeType: string,
): VegetationInstance[] {
  if (!plantConfig.enabled) {
    return [];
  }

  const plants: VegetationInstance[] = [];

  // Calculate plant count based on density and tile size
  const tileArea = (ctx.tileSize / 100) * (ctx.tileSize / 100);
  const baseCount = Math.floor(plantConfig.density * tileArea);

  if (baseCount === 0) {
    return [];
  }

  // Use deterministic RNG
  const rng = ctx.createRng("plants");

  // Get presets and distribution
  const presets =
    plantConfig.presets.length > 0
      ? plantConfig.presets
      : getPlantPresetsForBiome(biomeType).presets;

  const distribution =
    plantConfig.distribution ?? getPlantPresetsForBiome(biomeType).distribution;

  if (presets.length === 0) {
    return [];
  }

  const totalWeight = presets.reduce(
    (sum, p) => sum + (distribution[p] ?? 1),
    0,
  );
  if (totalWeight === 0) {
    return [];
  }

  // Track placed positions for spacing
  const placedPositions: Array<{ x: number; z: number }> = [];
  const minSpacing = plantConfig.minSpacing;
  const minSpacingSq = minSpacing * minSpacing;

  // Generate cluster centers if clustering enabled
  const clusterCenters: Array<{ x: number; z: number }> = [];
  if (plantConfig.clustering) {
    const [clusterMin, clusterMax] = plantConfig.clusterSize ?? [2, 4];
    const numClusters = Math.ceil(baseCount / ((clusterMin + clusterMax) / 2));
    for (let i = 0; i < numClusters; i++) {
      clusterCenters.push({
        x: rng() * ctx.tileSize,
        z: rng() * ctx.tileSize,
      });
    }
  }

  let plantsPlaced = 0;
  const maxAttempts = baseCount * 15;
  let attempts = 0;

  while (plantsPlaced < baseCount && attempts < maxAttempts) {
    attempts++;

    let localX: number;
    let localZ: number;

    const useCluster = clusterCenters.length > 0 && rng() < 0.7;

    if (useCluster) {
      const cluster = clusterCenters[Math.floor(rng() * clusterCenters.length)];
      const scatterRadius = 3 + rng() * 6; // 3-9m scatter (plants cluster tighter)
      const angle = rng() * Math.PI * 2;
      const distance = rng() * scatterRadius;
      localX = cluster.x + Math.cos(angle) * distance;
      localZ = cluster.z + Math.sin(angle) * distance;
    } else {
      localX = rng() * ctx.tileSize;
      localZ = rng() * ctx.tileSize;
    }

    // Clamp to tile bounds
    localX = Math.max(0, Math.min(ctx.tileSize, localX));
    localZ = Math.max(0, Math.min(ctx.tileSize, localZ));

    // Convert to world coordinates for height lookup
    const worldX = ctx.tileX * ctx.tileSize + localX;
    const worldZ = ctx.tileZ * ctx.tileSize + localZ;
    const height = ctx.getHeightAt(worldX, worldZ);

    // Skip if underwater (ocean or river/pond)
    if (height < ctx.waterThreshold) {
      continue;
    }
    if (ctx.getWaterSurfaceAt) {
      const waterY = ctx.getWaterSurfaceAt(worldX, worldZ);
      if (height <= waterY + 1.0) continue; // 1m buffer above water surface
    }

    // Check minimum spacing
    let tooClose = false;
    for (const pos of placedPositions) {
      const dx = localX - pos.x;
      const dz = localZ - pos.z;
      if (dx * dx + dz * dz < minSpacingSq) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) continue;

    // Check if on road
    if (ctx.isOnRoad?.(worldX, worldZ)) {
      continue;
    }

    // Select preset based on weighted distribution
    let selectedPreset = presets[0];
    const roll = rng() * totalWeight;
    let cumulative = 0;
    for (const preset of presets) {
      cumulative += distribution[preset] ?? 1;
      if (roll < cumulative) {
        selectedPreset = preset;
        break;
      }
    }

    // Generate random scale within range
    const [minScale, maxScale] = plantConfig.scaleRange;
    const scale = minScale + rng() * (maxScale - minScale);

    // Generate random Y-axis rotation
    const rotation = rng() * Math.PI * 2;

    // Create vegetation instance for plant
    const plant: VegetationInstance = {
      id: `${ctx.tileKey}_plant_${plantsPlaced}`,
      assetId: selectedPreset,
      category: "plant",
      position: { x: worldX, y: height, z: worldZ },
      rotation: { x: 0, y: rotation, z: 0 },
      scale,
      tileKey: ctx.tileKey,
    };

    plants.push(plant);
    placedPositions.push({ x: localX, z: localZ });
    plantsPlaced++;
  }

  return plants;
}
