/**
 * difficultyGrid — Struct-of-Arrays difficulty grid for cache-friendly iteration
 *
 * Stores sampled difficulty data in typed arrays for efficient flood-fill
 * and zone classification. The SoA layout keeps scalar values contiguous
 * in memory so tier classification (which only reads scalars) benefits
 * from CPU cache prefetching.
 *
 * Used by useZoneAutoGen for grid sampling and zone extraction.
 */

/** Compact grid of difficulty samples in Struct-of-Arrays layout. */
export interface DifficultyGrid {
  /** Difficulty scalar [0, 1] per cell — Float32 for compact storage. */
  scalars: Float32Array;
  /** Biome index per cell — references `biomeIndex` lookup. */
  biomes: Uint8Array;
  /** Tier index per cell — 255 means unclassified/water. */
  tiers: Uint8Array;
  /** Zone ID per cell — 65535 means unassigned. */
  zoneIds: Uint16Array;
  /** Maps biome index → biome name string. */
  biomeIndex: string[];
  /** Grid dimensions. */
  width: number;
  height: number;
  /** World-space origin of the grid (top-left corner). */
  originX: number;
  originZ: number;
  /** Meters per cell. */
  resolution: number;
}

const UNCLASSIFIED_TIER = 255;
const UNASSIGNED_ZONE = 65535;

/** Allocate an empty difficulty grid. */
export function createDifficultyGrid(
  width: number,
  height: number,
  originX: number,
  originZ: number,
  resolution: number,
): DifficultyGrid {
  const size = width * height;
  const scalars = new Float32Array(size);
  const biomes = new Uint8Array(size);
  const tiers = new Uint8Array(size).fill(UNCLASSIFIED_TIER);
  const zoneIds = new Uint16Array(size).fill(UNASSIGNED_ZONE);

  return {
    scalars,
    biomes,
    tiers,
    zoneIds,
    biomeIndex: [],
    width,
    height,
    originX,
    originZ,
    resolution,
  };
}

/** Resolve or insert a biome name into the index, returning its uint8 key. */
export function resolveBiomeIndex(grid: DifficultyGrid, biome: string): number {
  let idx = grid.biomeIndex.indexOf(biome);
  if (idx === -1) {
    idx = grid.biomeIndex.length;
    grid.biomeIndex.push(biome);
  }
  return idx;
}

/** Read a single cell from the grid. Returns null if out of bounds. */
export function getCell(
  grid: DifficultyGrid,
  gx: number,
  gz: number,
): { scalar: number; biome: string; tierIndex: number; zoneId: number } | null {
  if (gx < 0 || gx >= grid.width || gz < 0 || gz >= grid.height) return null;
  const i = gz * grid.width + gx;
  return {
    scalar: grid.scalars[i],
    biome: grid.biomeIndex[grid.biomes[i]] ?? "unknown",
    tierIndex: grid.tiers[i] === UNCLASSIFIED_TIER ? -1 : grid.tiers[i],
    zoneId: grid.zoneIds[i] === UNASSIGNED_ZONE ? -1 : grid.zoneIds[i],
  };
}

/** Write scalar + biome + tier for a cell. */
export function setCell(
  grid: DifficultyGrid,
  gx: number,
  gz: number,
  scalar: number,
  biomeIdx: number,
  tierIndex: number,
): void {
  const i = gz * grid.width + gx;
  grid.scalars[i] = scalar;
  grid.biomes[i] = biomeIdx;
  grid.tiers[i] = tierIndex < 0 ? UNCLASSIFIED_TIER : tierIndex;
}

/** Convert grid coordinates to world-space center of cell. */
export function cellToWorld(
  grid: DifficultyGrid,
  gx: number,
  gz: number,
): { x: number; z: number } {
  return {
    x: grid.originX + gx * grid.resolution + grid.resolution / 2,
    z: grid.originZ + gz * grid.resolution + grid.resolution / 2,
  };
}

/** Convert world-space position to grid coordinates (floored). */
export function worldToCell(
  grid: DifficultyGrid,
  worldX: number,
  worldZ: number,
): { gx: number; gz: number } {
  return {
    gx: Math.floor((worldX - grid.originX) / grid.resolution),
    gz: Math.floor((worldZ - grid.originZ) / grid.resolution),
  };
}

/**
 * Iterate over all cells that have a valid tier (not water/unclassified).
 * Callback receives grid coords and the flat index for direct typed-array access.
 */
export function forEachClassifiedCell(
  grid: DifficultyGrid,
  callback: (gx: number, gz: number, index: number) => void,
): void {
  const { width, height, tiers } = grid;
  for (let gz = 0; gz < height; gz++) {
    for (let gx = 0; gx < width; gx++) {
      const i = gz * width + gx;
      if (tiers[i] !== UNCLASSIFIED_TIER) {
        callback(gx, gz, i);
      }
    }
  }
}

export { UNCLASSIFIED_TIER, UNASSIGNED_ZONE };
