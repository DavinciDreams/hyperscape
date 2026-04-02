/**
 * useZoneAutoGen — One-click zone generation pipeline
 *
 * Samples the difficulty function across the world, flood-fills contiguous
 * difficulty+biome bands into zones, derives spawn tables from manifest data,
 * and populates with mobs + resources using a two-phase Poisson disc scatter
 * with mob-resource proximity buffers for RuneScape-style gameplay feel.
 */

import { useCallback } from "react";

import { NoiseGenerator } from "@hyperscape/procgen/terrain";

import {
  computeZoneDifficulty,
  withBiomeDifficultyFallback,
  DEFAULT_ZONE_DIFFICULTY_CONFIG,
  type ZoneDifficultyConfig,
  type TownInfo,
  type DangerSourceInfo,
  type BiomeQuerier,
  type BiomeDifficultyLookup,
} from "../../WorldBuilder/DifficultyHeatmap";

import type {
  PlacedRegion,
  PlacedMobSpawn,
  PlacedResource,
  RegionSpawnRules,
  DifficultyTierConfig,
  AutoGenBounds,
  AutoGenConfig,
  AutoGenResult,
  AutoGenStats,
  AutoGenZone,
  ManifestData,
  ManifestNPC,
} from "../types";
import { useWorldStudio } from "../WorldStudioContext";
import {
  createSeededRng,
  hashString,
  weightedSelect,
} from "../utils/procgenUtils";
import {
  poissonDiscSample,
  type PoissonBoundaryTest,
} from "../utils/poissonDisc";
import { SpatialGrid } from "../utils/SpatialGrid";

// Difficulty function imported from DifficultyHeatmap.ts (computeZoneDifficulty)
// Uses distance-primary formula with biome modifier from manifest data.
// See DifficultyHeatmap.ts for the full formula documentation.

// ============== DEFAULT TIER CONFIG ==============

// Tier scalar ranges calibrated to the distance-primary auto-gen formula:
//   scalar = distanceFromTown/(worldRadius*0.75) * biomeModifier + noise
//
// With biome modifiers (0.5 → 1.5), scalars at key distances from town:
//   100m  plains(0.60):  0.13*0.60=0.08  tundra(1.50): 0.13*1.50=0.20
//   250m  plains: 0.22   tundra: 0.50
//   500m  plains: 0.40   tundra: 1.00
//   750m+ plains: 0.60   tundra: 1.50 (clamped to 1.0)
//
// This gives every biome 4-6 visible tiers as you walk away from town.
// Mob levelRange uses overlap: mob [mobMin..mobMax] overlaps [tierMin..tierMax]
export const DEFAULT_TIERS: DifficultyTierConfig[] = [
  {
    name: "Safe",
    scalarRange: [0.0, 0.05],
    levelRange: [0, 0],
    resourceLevelRange: [1, 5],
    namePrefix: "Safe",
    color: "#2e7d32",
    mobDensityMultiplier: 0,
    resourceDensityMultiplier: 2.0,
    mobResourceBuffer: 30,
  },
  {
    name: "Beginner",
    scalarRange: [0.05, 0.15],
    levelRange: [1, 10],
    resourceLevelRange: [1, 20],
    namePrefix: "Beginner",
    color: "#66bb6a",
    mobDensityMultiplier: 0.4,
    resourceDensityMultiplier: 1.5,
    mobResourceBuffer: 25,
  },
  {
    name: "Low",
    scalarRange: [0.15, 0.3],
    levelRange: [5, 25],
    resourceLevelRange: [10, 45],
    namePrefix: "Low",
    color: "#fdd835",
    mobDensityMultiplier: 0.8,
    resourceDensityMultiplier: 1.0,
    mobResourceBuffer: 20,
  },
  {
    name: "Mid",
    scalarRange: [0.3, 0.5],
    levelRange: [15, 45],
    resourceLevelRange: [30, 65],
    namePrefix: "Mid",
    color: "#ff9800",
    mobDensityMultiplier: 1.2,
    resourceDensityMultiplier: 0.6,
    mobResourceBuffer: 12,
  },
  {
    name: "High",
    scalarRange: [0.5, 0.75],
    levelRange: [25, 60],
    resourceLevelRange: [50, 85],
    namePrefix: "Dangerous",
    color: "#d32f2f",
    mobDensityMultiplier: 2.0,
    resourceDensityMultiplier: 0.3,
    mobResourceBuffer: 8,
  },
  {
    name: "Extreme",
    scalarRange: [0.75, 1.0],
    levelRange: [40, 200],
    resourceLevelRange: [65, 99],
    namePrefix: "Extreme",
    color: "#6a1b9a",
    mobDensityMultiplier: 3.0,
    resourceDensityMultiplier: 0.15,
    mobResourceBuffer: 3,
  },
];

export const DEFAULT_AUTOGEN_CONFIG: AutoGenConfig = {
  gridResolution: 10,
  minZoneArea: 5000,
  maxZoneSpan: 500,
  seed: 42,
  tiers: DEFAULT_TIERS,
  mobSpacing: 15,
  resourceSpacing: 8,
};

// Shared utilities imported from ../utils/procgenUtils, ../utils/poissonDisc, ../utils/SpatialGrid

// poissonDiscSample and weightedSelect imported from shared utils above

// ============== GRID CELL ==============

interface GridCell {
  x: number; // grid column
  z: number; // grid row
  worldX: number;
  worldZ: number;
  scalar: number;
  biome: string;
  isSafe: boolean;
  tierIndex: number; // -1 for safe zones with no tier
  /** Zone ID assigned during flood fill */
  zoneId: number;
}

// ============== STEP 1: SAMPLE DIFFICULTY GRID ==============

/**
 * Pre-scan to find the bounding box of actual land (non-water terrain).
 * Uses a coarse grid (4x the resolution) to quickly identify where land exists,
 * then returns the tight bounds so the main sampling can skip ocean.
 */
function scanLandBounds(
  worldSize: number,
  queryBiome: BiomeQuerier,
  waterThreshold: number,
): {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  hasLand: boolean;
} {
  const half = worldSize / 2;
  const coarseStep = Math.max(20, worldSize / 100); // ~100 samples per axis
  let minX = Infinity,
    maxX = -Infinity;
  let minZ = Infinity,
    maxZ = -Infinity;
  let hasLand = false;

  for (let wz = -half; wz <= half; wz += coarseStep) {
    for (let wx = -half; wx <= half; wx += coarseStep) {
      const q = queryBiome(wx, wz);
      if (q.height >= waterThreshold) {
        hasLand = true;
        if (wx < minX) minX = wx;
        if (wx > maxX) maxX = wx;
        if (wz < minZ) minZ = wz;
        if (wz > maxZ) maxZ = wz;
      }
    }
  }

  // Add padding of one coarse step to avoid clipping edges
  if (hasLand) {
    minX -= coarseStep;
    maxX += coarseStep;
    minZ -= coarseStep;
    maxZ += coarseStep;
  }

  return { minX, maxX, minZ, maxZ, hasLand };
}

function sampleDifficultyGrid(
  resolution: number,
  queryBiome: BiomeQuerier,
  getBiomeDifficulty: BiomeDifficultyLookup,
  noise: NoiseGenerator,
  towns: TownInfo[],
  dangerSources: DangerSourceInfo[],
  tiers: DifficultyTierConfig[],
  waterThreshold: number,
  landBounds: { minX: number; maxX: number; minZ: number; maxZ: number },
  worldRadius: number,
  zoneDiffConfig: ZoneDifficultyConfig,
): GridCell[] {
  // Only sample within the land bounding box (skip ocean)
  const startX = landBounds.minX;
  const startZ = landBounds.minZ;
  const rangeX = landBounds.maxX - landBounds.minX;
  const rangeZ = landBounds.maxZ - landBounds.minZ;
  const cols = Math.ceil(rangeX / resolution);
  const rows = Math.ceil(rangeZ / resolution);
  const cells: GridCell[] = [];

  for (let gz = 0; gz < rows; gz++) {
    for (let gx = 0; gx < cols; gx++) {
      const worldX = startX + gx * resolution + resolution / 2;
      const worldZ = startZ + gz * resolution + resolution / 2;

      const biomeQuery = queryBiome(worldX, worldZ);

      // Skip water — terrain below waterThreshold is ocean
      if (biomeQuery.height < waterThreshold) {
        cells.push({
          x: gx,
          z: gz,
          worldX,
          worldZ,
          scalar: 0,
          biome: biomeQuery.biome,
          isSafe: true,
          tierIndex: -1,
          zoneId: -1,
        });
        continue;
      }

      const sample = computeZoneDifficulty(
        worldX,
        worldZ,
        biomeQuery.biome,
        getBiomeDifficulty(biomeQuery.biome),
        noise,
        towns,
        dangerSources,
        worldRadius,
        zoneDiffConfig,
      );

      // Classify into tier
      let tierIndex = -1;
      for (let t = 0; t < tiers.length; t++) {
        const [lo, hi] = tiers[t].scalarRange;
        if (sample.scalar >= lo && sample.scalar < hi) {
          tierIndex = t;
          break;
        }
      }
      // Handle scalar === 1.0 (fits into last tier)
      if (tierIndex === -1 && sample.scalar >= 1.0 && tiers.length > 0) {
        tierIndex = tiers.length - 1;
      }

      cells.push({
        x: gx,
        z: gz,
        worldX,
        worldZ,
        scalar: sample.scalar,
        biome: biomeQuery.biome,
        isSafe: sample.isSafe,
        tierIndex,
        zoneId: -1,
      });
    }
  }

  return cells;
}

// ============== STEP 2: FLOOD FILL ==============

interface RawZone {
  id: number;
  tierIndex: number;
  biome: string;
  cells: GridCell[];
}

function floodFillZones(
  cells: GridCell[],
  cols: number,
  rows: number,
): RawZone[] {
  const zones: RawZone[] = [];
  let nextZoneId = 0;

  // Build lookup grid
  const grid = new Array<GridCell | null>(cols * rows).fill(null);
  for (const cell of cells) {
    grid[cell.z * cols + cell.x] = cell;
  }

  for (const cell of cells) {
    if (cell.zoneId !== -1) continue;
    if (cell.tierIndex < 0) continue; // skip unclassified / water

    const zoneId = nextZoneId++;
    const zone: RawZone = {
      id: zoneId,
      tierIndex: cell.tierIndex,
      biome: cell.biome,
      cells: [],
    };

    // BFS with index pointer (O(1) dequeue instead of O(n) shift)
    const queue: GridCell[] = [cell];
    let head = 0;
    cell.zoneId = zoneId;

    while (head < queue.length) {
      const current = queue[head++];
      zone.cells.push(current);

      // 4-connected neighbors
      const neighbors = [
        { x: current.x - 1, z: current.z },
        { x: current.x + 1, z: current.z },
        { x: current.x, z: current.z - 1 },
        { x: current.x, z: current.z + 1 },
      ];

      for (const n of neighbors) {
        if (n.x < 0 || n.x >= cols || n.z < 0 || n.z >= rows) continue;
        const neighbor = grid[n.z * cols + n.x];
        if (!neighbor || neighbor.zoneId !== -1) continue;
        if (neighbor.tierIndex !== cell.tierIndex) continue;
        if (neighbor.biome !== cell.biome) continue;
        neighbor.zoneId = zoneId;
        queue.push(neighbor);
      }
    }

    if (zone.cells.length > 0) {
      zones.push(zone);
    }
  }

  return zones;
}

// ============== STEP 3: CLEANUP (merge small, split large) ==============

function cleanupZones(
  zones: RawZone[],
  resolution: number,
  minArea: number,
  maxSpan: number,
): RawZone[] {
  const cellArea = resolution * resolution;

  // Merge small zones into nearest same-tier neighbor
  const result: RawZone[] = [];
  const small: RawZone[] = [];
  const large: RawZone[] = [];

  for (const z of zones) {
    if (z.cells.length * cellArea < minArea) {
      small.push(z);
    } else {
      large.push(z);
    }
  }

  // Try to merge each small zone: prefer same-tier, fall back to nearest any-tier
  for (const sz of small) {
    const centroid = zoneCentroid(sz);
    let bestDist = Infinity;
    let bestZone: RawZone | null = null;

    // First pass: same-tier neighbors
    for (const lz of large) {
      if (lz.tierIndex !== sz.tierIndex) continue;
      const lc = zoneCentroid(lz);
      const d2 = (centroid.x - lc.x) ** 2 + (centroid.z - lc.z) ** 2;
      if (d2 < bestDist) {
        bestDist = d2;
        bestZone = lz;
      }
    }

    // Second pass: if no same-tier found, merge into nearest zone of any tier
    if (!bestZone) {
      for (const lz of large) {
        const lc = zoneCentroid(lz);
        const d2 = (centroid.x - lc.x) ** 2 + (centroid.z - lc.z) ** 2;
        if (d2 < bestDist) {
          bestDist = d2;
          bestZone = lz;
        }
      }
      if (bestZone) {
        console.warn(
          `[AutoGen] Cross-tier merge: small zone (tier ${sz.tierIndex}, ${sz.cells.length} cells) merged into tier ${bestZone.tierIndex}`,
        );
      }
    }

    if (bestZone) {
      bestZone.cells.push(...sz.cells);
    } else if (sz.cells.length > 0) {
      // No large zones exist at all — promote this small zone to avoid data loss
      large.push(sz);
    }
  }

  // Recursively split oversized zones along longest axis
  let nextSplitId = 10000;
  const splitZone = (z: RawZone): RawZone[] => {
    const bounds = zoneBounds(z);
    const spanX = bounds.maxX - bounds.minX;
    const spanZ = bounds.maxZ - bounds.minZ;
    const maxDim = Math.max(spanX, spanZ);

    if (maxDim <= maxSpan || z.cells.length <= 4) {
      return [z];
    }

    // Split along longest axis at midpoint
    const splitHorizontal = spanX >= spanZ;
    const mid = splitHorizontal
      ? (bounds.minX + bounds.maxX) / 2
      : (bounds.minZ + bounds.maxZ) / 2;

    const a: RawZone = { ...z, id: nextSplitId++, cells: [] };
    const b: RawZone = { ...z, id: nextSplitId++, cells: [] };

    for (const c of z.cells) {
      if (splitHorizontal ? c.worldX < mid : c.worldZ < mid) {
        a.cells.push(c);
      } else {
        b.cells.push(c);
      }
    }

    // Recurse on each half
    const parts: RawZone[] = [];
    if (a.cells.length > 0) parts.push(...splitZone(a));
    if (b.cells.length > 0) parts.push(...splitZone(b));
    return parts;
  };

  for (const z of large) {
    result.push(...splitZone(z));
  }

  return result;
}

function zoneCentroid(zone: RawZone): { x: number; z: number } {
  let cx = 0,
    cz = 0;
  for (const c of zone.cells) {
    cx += c.worldX;
    cz += c.worldZ;
  }
  return { x: cx / zone.cells.length, z: cz / zone.cells.length };
}

function zoneBounds(zone: RawZone): {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
} {
  let minX = Infinity,
    maxX = -Infinity,
    minZ = Infinity,
    maxZ = -Infinity;
  for (const c of zone.cells) {
    if (c.worldX < minX) minX = c.worldX;
    if (c.worldX > maxX) maxX = c.worldX;
    if (c.worldZ < minZ) minZ = c.worldZ;
    if (c.worldZ > maxZ) maxZ = c.worldZ;
  }
  return { minX, maxX, minZ, maxZ };
}

// ============== STEP 4: NAME ZONES ==============

function nameZones(
  zones: RawZone[],
  tiers: DifficultyTierConfig[],
  towns: TownInfo[],
): Map<number, string> {
  const names = new Map<number, string>();
  const usedNames = new Set<string>();

  for (const zone of zones) {
    const tier = tiers[zone.tierIndex];
    if (!tier) continue;
    const centroid = zoneCentroid(zone);

    // Find nearest town for direction reference
    let direction = "";
    if (towns.length > 0) {
      let nearestTown: TownInfo | null = null;
      let nearestDist = Infinity;
      for (const town of towns) {
        const d2 =
          (centroid.x - town.position.x) ** 2 +
          (centroid.z - town.position.z) ** 2;
        if (d2 < nearestDist) {
          nearestDist = d2;
          nearestTown = town;
        }
      }
      if (nearestTown) {
        const dx = centroid.x - nearestTown.position.x;
        const dz = centroid.z - nearestTown.position.z;
        const angle = Math.atan2(dz, dx) * (180 / Math.PI);
        if (angle >= -22.5 && angle < 22.5) direction = "Eastern";
        else if (angle >= 22.5 && angle < 67.5) direction = "Southeastern";
        else if (angle >= 67.5 && angle < 112.5) direction = "Southern";
        else if (angle >= 112.5 && angle < 157.5) direction = "Southwestern";
        else if (angle >= 157.5 || angle < -157.5) direction = "Western";
        else if (angle >= -157.5 && angle < -112.5) direction = "Northwestern";
        else if (angle >= -112.5 && angle < -67.5) direction = "Northern";
        else direction = "Northeastern";
      }
    }

    // Capitalize biome
    const biomeName = zone.biome.charAt(0).toUpperCase() + zone.biome.slice(1);
    let name = `${direction} ${biomeName} (${tier.name})`.trim();

    // Deduplicate
    if (usedNames.has(name)) {
      let suffix = 2;
      while (usedNames.has(`${name} ${suffix}`)) suffix++;
      name = `${name} ${suffix}`;
    }
    usedNames.add(name);
    names.set(zone.id, name);
  }

  return names;
}

// ============== STEP 5: DERIVE SPAWN TABLES ==============

/** Biome affinity weights for resource types */
const BIOME_RESOURCE_WEIGHTS: Record<
  string,
  Partial<Record<string, number>>
> = {
  forest: { woodcutting: 2.0, mining: 0.5 },
  mountains: { mining: 2.0, woodcutting: 0.3 },
  plains: { farming: 1.5 },
  lakes: { fishing: 2.0 },
  swamp: { fishing: 1.5, woodcutting: 0.7 },
  desert: { mining: 1.3 },
  valley: { woodcutting: 1.2, farming: 1.3 },
  tundra: { mining: 1.0 },
};

function deriveSpawnRules(
  tier: DifficultyTierConfig,
  biome: string,
  manifests: ManifestData,
): RegionSpawnRules {
  const [minLevel, maxLevel] = tier.levelRange;
  const [minResLevel, maxResLevel] = tier.resourceLevelRange;
  const biomeWeights = BIOME_RESOURCE_WEIGHTS[biome] ?? {};

  // Filter mobs by level range overlap: mob [mobMin..mobMax] overlaps tier [minLevel..maxLevel]
  const mobTable: RegionSpawnRules["mobs"] =
    tier.mobDensityMultiplier > 0
      ? {
          mode: "replace" as const,
          table: manifests.npcs
            .filter(
              (npc: ManifestNPC) =>
                npc.category === "mob" &&
                npc.levelRange[0] <= maxLevel &&
                npc.levelRange[1] >= minLevel,
            )
            .map((npc: ManifestNPC) => ({
              mobId: npc.id,
              weight: 10,
            })),
          densityMultiplier: tier.mobDensityMultiplier,
        }
      : undefined;

  // Build resource table from all gathering types
  const resourceEntries: Array<{
    resourceId: string;
    weight: number;
    clusterSize?: number;
  }> = [];

  // Mining rocks
  for (const rock of manifests.miningRocks) {
    if (
      rock.levelRequired >= minResLevel &&
      rock.levelRequired <= maxResLevel
    ) {
      const biomeBonus = biomeWeights["mining"] ?? 1.0;
      resourceEntries.push({
        resourceId: rock.id,
        weight: 10 * biomeBonus,
        clusterSize: rock.levelRequired >= 55 ? 1 : 2,
      });
    }
  }

  // Trees
  for (const tree of manifests.trees) {
    if (
      tree.levelRequired >= minResLevel &&
      tree.levelRequired <= maxResLevel
    ) {
      const biomeBonus = biomeWeights["woodcutting"] ?? 1.0;
      resourceEntries.push({
        resourceId: tree.id,
        weight: 10 * biomeBonus,
        clusterSize: tree.levelRequired >= 60 ? 1 : 3,
      });
    }
  }

  // Fishing spots
  for (const spot of manifests.fishingSpots) {
    if (
      spot.levelRequired >= minResLevel &&
      spot.levelRequired <= maxResLevel
    ) {
      const biomeBonus = biomeWeights["fishing"] ?? 1.0;
      resourceEntries.push({
        resourceId: spot.id,
        weight: 10 * biomeBonus,
      });
    }
  }

  const resourceTable: RegionSpawnRules["resources"] =
    resourceEntries.length > 0
      ? {
          mode: "replace" as const,
          table: resourceEntries,
          densityMultiplier: tier.resourceDensityMultiplier,
        }
      : undefined;

  return {
    mobs: mobTable,
    resources: resourceTable,
  };
}

// ============== STEP 6: ENTITY POPULATION ==============

const DEFAULT_MOB_DENSITY = 0.0004; // mobs per m² (base, scaled by tier multiplier)
const DEFAULT_RESOURCE_DENSITY = 0.0004; // resources per m² (base, scaled by tier multiplier)

function inferResourceType(
  id: string,
): "mining" | "woodcutting" | "fishing" | "farming" {
  if (id.startsWith("ore_") || id.includes("rock")) return "mining";
  if (id.startsWith("tree_") || id.includes("wood")) return "woodcutting";
  if (id.includes("fish")) return "fishing";
  return "farming";
}

function populateEntities(
  zones: AutoGenZone[],
  config: AutoGenConfig,
  queryBiome: BiomeQuerier,
  getBiomeDifficulty: BiomeDifficultyLookup,
  noise: NoiseGenerator,
  towns: TownInfo[],
  dangerSources: DangerSourceInfo[],
  waterThreshold: number,
  worldRadius: number,
  existingEntities: ExistingEntityPosition[],
  zoneDiffConfig: ZoneDifficultyConfig,
): { mobs: PlacedMobSpawn[]; resources: PlacedResource[] } {
  const allMobs: PlacedMobSpawn[] = [];
  const allResources: PlacedResource[] = [];
  const mobGrid = new SpatialGrid(30); // for proximity checks

  // Pre-populate spatial grid with existing hand-placed entities
  // so auto-gen entities maintain distance from them
  const existingGrid = new SpatialGrid(30);
  for (const e of existingEntities) {
    existingGrid.insert(e.x, e.z);
    // Also add to mob grid so resources avoid existing entities too
    mobGrid.insert(e.x, e.z);
  }

  for (const zone of zones) {
    const tier = config.tiers[zone.tierIndex];
    if (!tier) continue;

    const rng = createSeededRng(config.seed + hashString(zone.id));
    const [scalarLo, scalarHi] = tier.scalarRange;

    // Contour boundary test: point must fall within this tier's difficulty range + biome
    const inZone: PoissonBoundaryTest = (x: number, z: number) => {
      const bq = queryBiome(x, z);
      if (bq.height < waterThreshold) return false; // water
      const sample = computeZoneDifficulty(
        x,
        z,
        bq.biome,
        getBiomeDifficulty(bq.biome),
        noise,
        towns,
        dangerSources,
        worldRadius,
        zoneDiffConfig,
      );
      return (
        sample.scalar >= scalarLo &&
        sample.scalar < scalarHi &&
        bq.biome === zone.biome
      );
    };

    // Phase A: Mobs (avoid existing hand-placed entities)
    if (zone.spawnRules.mobs && zone.spawnRules.mobs.table.length > 0) {
      const density =
        DEFAULT_MOB_DENSITY * (zone.spawnRules.mobs.densityMultiplier ?? 1);
      const targetCount = Math.max(1, Math.round(zone.area * density));
      const existingBuffer = 15; // meters clearance from hand-placed entities

      const mobPositions = poissonDiscSample(
        zone.bounds,
        config.mobSpacing,
        targetCount,
        rng,
        (x, z) => {
          if (!inZone(x, z)) return false;
          // Keep distance from hand-placed entities
          return existingGrid.nearestDistance(x, z) >= existingBuffer;
        },
      );

      for (let i = 0; i < mobPositions.length; i++) {
        const pos = mobPositions[i];
        const entry = weightedSelect(
          zone.spawnRules.mobs.table.map((t) => ({ ...t, weight: t.weight })),
          rng,
        );
        if (!entry) continue;

        allMobs.push({
          id: `autogen-mob-${zone.id}-${i}`,
          mobId: entry.mobId,
          name: `${entry.mobId} spawn`,
          position: { x: pos.x, y: 0, z: pos.z },
          spawnRadius: 5 + rng() * 10,
          maxCount: 1 + Math.floor(rng() * 3),
          respawnTicks: 50 + Math.floor(rng() * 30),
          source: "procgen",
          sourceRegionId: zone.id,
          properties: {},
        });

        mobGrid.insert(pos.x, pos.z);
      }
    }

    // Phase B: Resources with mob-proximity buffer
    if (
      zone.spawnRules.resources &&
      zone.spawnRules.resources.table.length > 0
    ) {
      const density =
        DEFAULT_RESOURCE_DENSITY *
        (zone.spawnRules.resources.densityMultiplier ?? 1);
      const targetCount = Math.max(1, Math.round(zone.area * density));
      const buffer = tier.mobResourceBuffer;

      const resourcePositions = poissonDiscSample(
        zone.bounds,
        config.resourceSpacing,
        targetCount * 2, // oversample since we'll reject some
        rng,
        (x, z) => {
          if (!inZone(x, z)) return false;
          // Mob-resource proximity rejection
          const mobDist = mobGrid.nearestDistance(x, z);
          return mobDist >= buffer;
        },
      );

      // Trim to target count
      const finalPositions = resourcePositions.slice(0, targetCount);

      for (let i = 0; i < finalPositions.length; i++) {
        const pos = finalPositions[i];
        const entry = weightedSelect(
          zone.spawnRules.resources.table.map((t) => ({
            ...t,
            weight: t.weight,
          })),
          rng,
        );
        if (!entry) continue;

        allResources.push({
          id: `autogen-res-${zone.id}-${i}`,
          resourceId: entry.resourceId,
          resourceType: inferResourceType(entry.resourceId),
          name: entry.resourceId,
          position: { x: pos.x, y: 0, z: pos.z },
          rotation: rng() * Math.PI * 2,
          modelVariant: 0,
          source: "procgen",
          sourceRegionId: zone.id,
          properties:
            entry.clusterSize && entry.clusterSize > 1
              ? { clusterSize: entry.clusterSize }
              : {},
        });
      }
    }
  }

  return { mobs: allMobs, resources: allResources };
}

// ============== MAIN PIPELINE ==============

/** Existing entity position for collision avoidance */
export interface ExistingEntityPosition {
  x: number;
  z: number;
  /** Buffer radius — auto-gen entities avoid this distance from existing ones */
  radius: number;
}

export interface AutoGenDeps {
  queryBiome: BiomeQuerier;
  /** Biome difficulty lookup (0-3) from manifest data */
  getBiomeDifficulty: BiomeDifficultyLookup;
  worldSize: number;
  waterThreshold: number;
  seed: number;
  towns: TownInfo[];
  dangerSources: DangerSourceInfo[];
  manifests: ManifestData;
  /** Hand-placed entities to avoid (NPCs, stations, spawn points, etc.) */
  existingEntities: ExistingEntityPosition[];
  /** Zone difficulty tuning parameters (from world-config.json) */
  zoneDifficultyConfig?: ZoneDifficultyConfig;
}

export function runAutoGenPipeline(
  config: AutoGenConfig,
  deps: AutoGenDeps,
): AutoGenResult {
  const startTime = performance.now();
  const noise = new NoiseGenerator(deps.seed);
  const worldRadius = deps.worldSize / 2;
  const zoneDiffConfig =
    deps.zoneDifficultyConfig ?? DEFAULT_ZONE_DIFFICULTY_CONFIG;

  // Pre-scan: find the bounding box of actual land to skip ocean
  const landBounds = scanLandBounds(
    deps.worldSize,
    deps.queryBiome,
    deps.waterThreshold,
  );
  if (!landBounds.hasLand) {
    return {
      zones: [],
      mobSpawns: [],
      resources: [],
      stats: {
        zonesGenerated: 0,
        zoneMerged: 0,
        totalMobs: 0,
        totalResources: 0,
        totalArea: 0,
        generationTimeMs: Math.round(performance.now() - startTime),
        tierBreakdown: [],
      },
    };
  }

  const rangeX = landBounds.maxX - landBounds.minX;
  const rangeZ = landBounds.maxZ - landBounds.minZ;
  const cols = Math.ceil(rangeX / config.gridResolution);
  const rows = Math.ceil(rangeZ / config.gridResolution);

  // Step 1: Sample grid (only within land bounds)
  const cells = sampleDifficultyGrid(
    config.gridResolution,
    deps.queryBiome,
    deps.getBiomeDifficulty,
    noise,
    deps.towns,
    deps.dangerSources,
    config.tiers,
    deps.waterThreshold,
    landBounds,
    worldRadius,
    zoneDiffConfig,
  );

  // Step 2: Flood fill
  const rawZones = floodFillZones(cells, cols, rows);

  // Step 3: Cleanup
  const cleanedZones = cleanupZones(
    rawZones,
    config.gridResolution,
    config.minZoneArea,
    config.maxZoneSpan,
  );

  // Step 4: Name zones
  const zoneNames = nameZones(cleanedZones, config.tiers, deps.towns);
  const cellArea = config.gridResolution * config.gridResolution;

  // Build AutoGenZone objects
  const autoGenZones: AutoGenZone[] = cleanedZones.map((raw, idx) => {
    const tier = config.tiers[raw.tierIndex];
    const bounds = zoneBounds(raw);
    const centroid = zoneCentroid(raw);
    const area = raw.cells.length * cellArea;
    const name = zoneNames.get(raw.id) ?? `Zone ${idx + 1}`;

    const spawnRules = deriveSpawnRules(tier, raw.biome, deps.manifests);

    const autoGenBounds: AutoGenBounds = {
      difficultyRange: [...tier.scalarRange],
      biomeFilter: raw.biome,
      boundingBox: bounds,
      generationSeed: config.seed,
      generatedAt: Date.now(),
      gridResolution: config.gridResolution,
      cellPositions: raw.cells.map((c) => ({ x: c.worldX, z: c.worldZ })),
    };

    return {
      id: `autogen-zone-${idx}`,
      name,
      tierIndex: raw.tierIndex,
      biome: raw.biome,
      centroid,
      bounds,
      area,
      cellCount: raw.cells.length,
      spawnRules,
      autoGenBounds,
    };
  });

  // Step 5+6: Populate entities
  const { mobs, resources } = populateEntities(
    autoGenZones,
    config,
    deps.queryBiome,
    deps.getBiomeDifficulty,
    noise,
    deps.towns,
    deps.dangerSources,
    deps.waterThreshold,
    worldRadius,
    deps.existingEntities,
    zoneDiffConfig,
  );

  const elapsed = performance.now() - startTime;

  // Build stats
  const tierBreakdown = config.tiers.map((tier) => {
    const tierZones = autoGenZones.filter(
      (z) => z.tierIndex === config.tiers.indexOf(tier),
    );
    const tierMobs = mobs.filter((m) =>
      tierZones.some((z) => m.sourceRegionId === z.id),
    );
    const tierRes = resources.filter((r) =>
      tierZones.some((z) => r.sourceRegionId === z.id),
    );
    return {
      tierName: tier.name,
      zoneCount: tierZones.length,
      mobCount: tierMobs.length,
      resourceCount: tierRes.length,
      area: tierZones.reduce((sum, z) => sum + z.area, 0),
    };
  });

  const stats: AutoGenStats = {
    zonesGenerated: autoGenZones.length,
    zoneMerged: rawZones.length - cleanedZones.length,
    totalMobs: mobs.length,
    totalResources: resources.length,
    totalArea: autoGenZones.reduce((sum, z) => sum + z.area, 0),
    generationTimeMs: Math.round(elapsed),
    landBounds,
    tierBreakdown,
  };

  return {
    zones: autoGenZones,
    mobSpawns: mobs,
    resources,
    stats,
  };
}

// ============== HOOK ==============

export function useZoneAutoGen() {
  const { state, actions, viewportRef } = useWorldStudio();

  /** Run the pipeline with given config (preview only — does not commit) */
  const generate = useCallback(
    (config: AutoGenConfig): AutoGenResult | null => {
      const world = state.builder.editing.world;
      if (!world) return null;

      const vp = viewportRef?.current;
      if (!vp?.queryBiome || !vp?.getBiomeDifficulty) return null;

      // Wrap with fallback so biomes without explicit difficulty get sensible defaults
      const getBiomeDifficulty = withBiomeDifficultyFallback(
        vp.getBiomeDifficulty,
      );

      const worldSizeMeters =
        world.foundation.config.terrain.worldSize *
        world.foundation.config.terrain.tileSize;
      const seed = world.foundation.config.seed;

      // Use foundation.towns (synced from runtime by SYNC_RUNTIME_TOWNS action).
      // safeZoneRadius is stored on GeneratedTown; fallback to size-based heuristic.
      const towns: TownInfo[] = world.foundation.towns.map((t) => ({
        position: { x: t.position.x, z: t.position.z },
        safeZoneRadius:
          t.safeZoneRadius ??
          (t.size === "town" ? 80 : t.size === "village" ? 50 : 30),
      }));

      console.log(
        `[AutoGen] Using ${towns.length} towns for zone generation:`,
        towns
          .map(
            (t, i) =>
              `Town ${i}: (${Math.round(t.position.x)}, ${Math.round(t.position.z)}) r=${t.safeZoneRadius}`,
          )
          .join(", "),
      );

      // Build danger source info
      const dangerSources: DangerSourceInfo[] =
        state.extendedLayers.dangerSources.map((ds) => ({
          position: { x: ds.position.x, z: ds.position.z },
          radius: ds.radius,
          intensity: ds.intensity,
          falloffCurve: ds.falloffCurve,
        }));

      const waterThreshold = world.foundation.config.terrain.waterThreshold;

      // Collect all hand-placed entities to avoid overlapping them
      const existingEntities: ExistingEntityPosition[] = [];
      const entityBuffer = 12; // meters
      // NPCs
      for (const npc of world.layers.npcs) {
        existingEntities.push({
          x: npc.position.x,
          z: npc.position.z,
          radius: entityBuffer,
        });
      }
      // Stations
      for (const s of state.extendedLayers.stations) {
        existingEntities.push({
          x: s.position.x,
          z: s.position.z,
          radius: entityBuffer,
        });
      }
      // Spawn points
      for (const sp of state.extendedLayers.spawnPoints) {
        existingEntities.push({
          x: sp.position.x,
          z: sp.position.z,
          radius: entityBuffer,
        });
      }
      // Teleports
      for (const tp of state.extendedLayers.teleports) {
        existingEntities.push({
          x: tp.position.x,
          z: tp.position.z,
          radius: entityBuffer,
        });
      }
      // POIs
      for (const poi of state.extendedLayers.pois) {
        existingEntities.push({
          x: poi.position.x,
          z: poi.position.z,
          radius: poi.radius ?? entityBuffer,
        });
      }

      return runAutoGenPipeline(config, {
        queryBiome: vp.queryBiome,
        getBiomeDifficulty,
        worldSize: worldSizeMeters,
        waterThreshold,
        seed,
        towns,
        dangerSources,
        manifests: state.manifests,
        existingEntities,
      });
    },
    [
      state.builder.editing.world,
      state.extendedLayers,
      state.manifests,
      viewportRef,
    ],
  );

  /** Commit an auto-gen result to state */
  const apply = useCallback(
    (result: AutoGenResult) => {
      // First clear any previous auto-gen
      actions.clearAllAutogen();

      // Build PlacedRegion objects from zones
      const regions: PlacedRegion[] = result.zones.map((zone) => ({
        id: zone.id,
        name: zone.name,
        description: `Auto-generated ${zone.biome} zone (${DEFAULT_TIERS[zone.tierIndex]?.name ?? "Unknown"} tier)`,
        tileKeys: [], // Contour-based zones don't use tile keys
        tags: [
          "autogen",
          zone.biome,
          DEFAULT_TIERS[zone.tierIndex]?.name.toLowerCase() ?? "unknown",
        ],
        spawnRules: zone.spawnRules,
        autoGenBounds: zone.autoGenBounds,
      }));

      actions.batchAddRegions(regions);
      actions.batchAddEntities(result.mobSpawns, result.resources);
    },
    [actions],
  );

  /** Clear all auto-generated content */
  const clearAutogen = useCallback(() => {
    actions.clearAllAutogen();
  }, [actions]);

  return { generate, apply, clearAutogen };
}
