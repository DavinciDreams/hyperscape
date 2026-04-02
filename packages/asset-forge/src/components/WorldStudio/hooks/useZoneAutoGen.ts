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
  computeDangerInfluence,
  type TownInfo,
  type DangerSourceInfo,
  type BiomeQuerier,
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

// ============== AUTO-GEN DIFFICULTY (distance-primary, biome-secondary) ==============
//
// Reference: RuneScape, WoW, Albion Online, Guild Wars 2 all use DISTANCE FROM
// SAFETY as the primary difficulty axis, not biome type. A forest near town is
// safe; the same forest far from town is dangerous.
//
// Formula:
//   distanceScalar = clamp(distFromTownEdge / (worldRadius * 0.75), 0, 1)
//   biomeModifier  = 0.5 + (biomeDiff / 3) * 1.0   (range: 0.5 → 1.5)
//   scalar         = distanceScalar * biomeModifier + dangerBonus + noise
//
// This produces concentric difficulty rings from each town, with biome shifting
// the ring boundaries ±50%. Harder biomes compress the rings (reach danger
// faster); easy biomes stretch them (stay safe longer).
//
// Result: EVERY biome gets multiple tiers as you walk away from town.
//   Tundra near town: Safe → Beginner → Low → Mid → High → Extreme
//   Plains near town: Safe → Beginner → Low → Mid → High (Extreme only at map edge)

/** Biome modifier values for auto-gen difficulty. Range 0-3, used as
 *  biomeModifier = 0.5 + (value / 3) * 1.0 giving range 0.5 to 1.5. */
const AUTOGEN_BIOME_WEIGHT: Record<string, number> = {
  plains: 0.3, // modifier 0.60 — easy, stretches safe zones outward
  valley: 0.5, // modifier 0.67
  lakes: 0.2, // modifier 0.57 — very easy near water
  forest: 1.2, // modifier 0.90
  swamp: 1.5, // modifier 1.00 — neutral baseline
  mountains: 2.2, // modifier 1.23 — compresses rings inward
  desert: 2.0, // modifier 1.17
  canyon: 2.2, // modifier 1.23
  tundra: 3.0, // modifier 1.50 — most compressed, danger comes fast
};

function getAutoGenBiomeWeight(biomeId: string): number {
  return AUTOGEN_BIOME_WEIGHT[biomeId] ?? 1.0;
}

/** Noise scale for organic zone boundary jitter */
const AUTOGEN_NOISE_SCALE = 0.0007;
const AUTOGEN_NOISE_AMPLITUDE = 0.08; // ±0.08 scalar jitter

interface AutoGenDifficultySample {
  scalar: number;
  biome: string;
  isSafe: boolean;
}

/**
 * Auto-gen difficulty: distance from town is primary, biome is a modifier.
 * This is separate from the game's TerrainSystem.getDifficultyAtWorldPosition() —
 * the game uses biome-primary for combat difficulty, but auto-gen needs
 * distance-primary for zone variety (every biome gets multiple tiers).
 */
function computeAutoGenDifficulty(
  worldX: number,
  worldZ: number,
  biome: string,
  noise: NoiseGenerator,
  towns: TownInfo[],
  dangerSources: DangerSourceInfo[],
  worldRadius: number,
): AutoGenDifficultySample {
  // Hard safe zone inside town radius
  for (const town of towns) {
    const dx = worldX - town.position.x;
    const dz = worldZ - town.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist <= town.safeZoneRadius) {
      return { scalar: 0, biome, isSafe: true };
    }
  }

  // Distance from nearest town edge (primary factor)
  let nearestDist = worldRadius * 2; // fallback for no towns
  for (const town of towns) {
    const dx = worldX - town.position.x;
    const dz = worldZ - town.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const distFromEdge = Math.max(0, dist - town.safeZoneRadius);
    if (distFromEdge < nearestDist) nearestDist = distFromEdge;
  }

  // Normalize: 0 at town edge, 1 at ~75% of world radius
  const distanceScalar = Math.min(1, nearestDist / (worldRadius * 0.75));

  // Biome modifier: 0.5 (easy biomes) → 1.5 (hard biomes)
  const biomeWeight = getAutoGenBiomeWeight(biome);
  const biomeModifier = 0.5 + (biomeWeight / 3) * 1.0;

  // Danger source additive bonus
  const dangerBonus =
    dangerSources.length > 0
      ? Math.min(
          0.3,
          computeDangerInfluence(worldX, worldZ, dangerSources) * 0.15,
        )
      : 0;

  // Noise for organic boundary jitter
  const noiseVal = noise.simplex2D(
    worldX * AUTOGEN_NOISE_SCALE,
    worldZ * AUTOGEN_NOISE_SCALE,
  );
  const noiseMod = noiseVal * AUTOGEN_NOISE_AMPLITUDE; // ±0.08

  // Combine
  const raw = distanceScalar * biomeModifier + dangerBonus + noiseMod;
  const scalar = Math.min(1, Math.max(0, raw));

  return { scalar, biome, isSafe: scalar < 0.01 };
}

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

// ============== SEEDED RNG ==============

function createSeededRng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s * 1664525 + 1013904223) | 0;
    return (s >>> 0) / 4294967296;
  };
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  return hash;
}

// ============== SPATIAL GRID (for mob-resource proximity) ==============

class SpatialGrid {
  private cellSize: number;
  private cells = new Map<string, Array<{ x: number; z: number }>>();

  constructor(cellSize: number) {
    this.cellSize = cellSize;
  }

  private key(x: number, z: number): string {
    return `${Math.floor(x / this.cellSize)}_${Math.floor(z / this.cellSize)}`;
  }

  insert(x: number, z: number): void {
    const k = this.key(x, z);
    let arr = this.cells.get(k);
    if (!arr) {
      arr = [];
      this.cells.set(k, arr);
    }
    arr.push({ x, z });
  }

  nearestDistance(x: number, z: number): number {
    const cx = Math.floor(x / this.cellSize);
    const cz = Math.floor(z / this.cellSize);
    let minDist2 = Infinity;
    // Check 3x3 neighborhood
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const k = `${cx + dx}_${cz + dz}`;
        const arr = this.cells.get(k);
        if (!arr) continue;
        for (const p of arr) {
          const d2 = (x - p.x) * (x - p.x) + (z - p.z) * (z - p.z);
          if (d2 < minDist2) minDist2 = d2;
        }
      }
    }
    return Math.sqrt(minDist2);
  }
}

// ============== POISSON DISC SAMPLING (contour-bounded) ==============

interface PoissonBoundaryTest {
  (x: number, z: number): boolean;
}

function poissonDiscSample(
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
  minSpacing: number,
  maxPoints: number,
  rng: () => number,
  inBounds: PoissonBoundaryTest,
): Array<{ x: number; z: number }> {
  const points: Array<{ x: number; z: number }> = [];
  const cellSize = minSpacing / Math.SQRT2;
  const gridW = Math.ceil((bounds.maxX - bounds.minX) / cellSize);
  const gridH = Math.ceil((bounds.maxZ - bounds.minZ) / cellSize);
  if (gridW <= 0 || gridH <= 0) return points;
  const grid: (number | null)[] = new Array(gridW * gridH).fill(null);
  const active: number[] = [];

  const gridIdx = (x: number, z: number) => {
    const gx = Math.floor((x - bounds.minX) / cellSize);
    const gz = Math.floor((z - bounds.minZ) / cellSize);
    if (gx < 0 || gx >= gridW || gz < 0 || gz >= gridH) return -1;
    return gz * gridW + gx;
  };

  // Seed with first valid point
  for (let att = 0; att < maxPoints * 30 && points.length === 0; att++) {
    const px = bounds.minX + rng() * (bounds.maxX - bounds.minX);
    const pz = bounds.minZ + rng() * (bounds.maxZ - bounds.minZ);
    if (inBounds(px, pz)) {
      points.push({ x: px, z: pz });
      active.push(0);
      const gi = gridIdx(px, pz);
      if (gi >= 0) grid[gi] = 0;
    }
  }

  const k = 30;
  while (active.length > 0 && points.length < maxPoints) {
    const idx = Math.floor(rng() * active.length);
    const pi = active[idx];
    const base = points[pi];
    let found = false;

    for (let i = 0; i < k; i++) {
      const angle = rng() * Math.PI * 2;
      const d = minSpacing + rng() * minSpacing;
      const nx = base.x + Math.cos(angle) * d;
      const nz = base.z + Math.sin(angle) * d;

      if (
        nx < bounds.minX ||
        nx > bounds.maxX ||
        nz < bounds.minZ ||
        nz > bounds.maxZ
      )
        continue;
      if (!inBounds(nx, nz)) continue;

      const gi = gridIdx(nx, nz);
      if (gi < 0) continue;

      const gx = Math.floor((nx - bounds.minX) / cellSize);
      const gz = Math.floor((nz - bounds.minZ) / cellSize);
      let tooClose = false;
      for (let ddz = -2; ddz <= 2 && !tooClose; ddz++) {
        for (let ddx = -2; ddx <= 2 && !tooClose; ddx++) {
          const ngx = gx + ddx;
          const ngz = gz + ddz;
          if (ngx < 0 || ngx >= gridW || ngz < 0 || ngz >= gridH) continue;
          const ni = grid[ngz * gridW + ngx];
          if (ni !== null) {
            const p = points[ni];
            const d2 = (nx - p.x) * (nx - p.x) + (nz - p.z) * (nz - p.z);
            if (d2 < minSpacing * minSpacing) tooClose = true;
          }
        }
      }

      if (!tooClose) {
        const newIdx = points.length;
        points.push({ x: nx, z: nz });
        active.push(newIdx);
        grid[gi] = newIdx;
        found = true;
        break;
      }
    }

    if (!found) active.splice(idx, 1);
  }

  return points;
}

// ============== WEIGHTED RANDOM SELECT ==============

function weightedSelect<T extends { weight: number }>(
  items: T[],
  rng: () => number,
): T | null {
  if (items.length === 0) return null;
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) return items[0];
  let roll = rng() * totalWeight;
  for (const item of items) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }
  return items[items.length - 1];
}

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
  noise: NoiseGenerator,
  towns: TownInfo[],
  dangerSources: DangerSourceInfo[],
  tiers: DifficultyTierConfig[],
  waterThreshold: number,
  landBounds: { minX: number; maxX: number; minZ: number; maxZ: number },
  worldRadius: number,
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

      const sample = computeAutoGenDifficulty(
        worldX,
        worldZ,
        biomeQuery.biome,
        noise,
        towns,
        dangerSources,
        worldRadius,
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

    // BFS
    const queue: GridCell[] = [cell];
    cell.zoneId = zoneId;

    while (queue.length > 0) {
      const current = queue.shift()!;
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

  // Try to merge each small zone into the nearest large zone of same tier
  for (const sz of small) {
    const centroid = zoneCentroid(sz);
    let bestDist = Infinity;
    let bestZone: RawZone | null = null;

    for (const lz of large) {
      if (lz.tierIndex !== sz.tierIndex) continue;
      const lc = zoneCentroid(lz);
      const d2 = (centroid.x - lc.x) ** 2 + (centroid.z - lc.z) ** 2;
      if (d2 < bestDist) {
        bestDist = d2;
        bestZone = lz;
      }
    }

    if (bestZone) {
      bestZone.cells.push(...sz.cells);
    }
    // If no match found, drop the tiny zone
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
  noise: NoiseGenerator,
  towns: TownInfo[],
  dangerSources: DangerSourceInfo[],
  waterThreshold: number,
  worldRadius: number,
  existingEntities: ExistingEntityPosition[],
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
      const sample = computeAutoGenDifficulty(
        x,
        z,
        bq.biome,
        noise,
        towns,
        dangerSources,
        worldRadius,
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
  worldSize: number;
  waterThreshold: number;
  seed: number;
  towns: TownInfo[];
  dangerSources: DangerSourceInfo[];
  manifests: ManifestData;
  /** Hand-placed entities to avoid (NPCs, stations, spawn points, etc.) */
  existingEntities: ExistingEntityPosition[];
}

export function runAutoGenPipeline(
  config: AutoGenConfig,
  deps: AutoGenDeps,
): AutoGenResult {
  const startTime = performance.now();
  const noise = new NoiseGenerator(deps.seed);
  const worldRadius = deps.worldSize / 2;

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
    noise,
    deps.towns,
    deps.dangerSources,
    config.tiers,
    deps.waterThreshold,
    landBounds,
    worldRadius,
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
    noise,
    deps.towns,
    deps.dangerSources,
    deps.waterThreshold,
    worldRadius,
    deps.existingEntities,
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
      if (!vp?.queryBiome) return null;

      const worldSizeMeters =
        world.foundation.config.terrain.worldSize *
        world.foundation.config.terrain.tileSize;
      const seed = world.foundation.config.seed;

      // Prefer runtime towns (from terrain generation) over foundation towns.
      // Runtime towns have exact positions + safeZoneRadius computed by the town generator.
      // Foundation towns may have been generated with different parameters.
      const rtTowns = vp.runtimeTowns;
      const towns: TownInfo[] =
        rtTowns && rtTowns.length > 0
          ? rtTowns.map(
              (rt: {
                position: { x: number; z: number };
                safeZoneRadius: number;
              }) => ({
                position: { x: rt.position.x, z: rt.position.z },
                safeZoneRadius: rt.safeZoneRadius,
              }),
            )
          : world.foundation.towns.map((t) => ({
              position: { x: t.position.x, z: t.position.z },
              safeZoneRadius:
                t.size === "town" ? 80 : t.size === "village" ? 50 : 30,
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
