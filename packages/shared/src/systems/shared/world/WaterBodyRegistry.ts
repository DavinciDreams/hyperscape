/**
 * WaterBodyRegistry — spatial index of water bodies at arbitrary elevations.
 *
 * Ocean water (terrain < WATER_THRESHOLD) is the fallback.
 * Inland water bodies (mountain ponds, highland lakes) are registered
 * explicitly with per-body surfaceY elevations.
 *
 * Spatial grid: O(1) hash + O(K) body check where K ≈ 0-2 per cell.
 */

import type { LandscapeFeatureDef } from "./TerrainHeightParams";

export type WaterBodySourceType = "landscape_pond" | "explicit";

export class ElevatedWaterBody {
  id: string;
  centerX: number;
  centerZ: number;
  radius: number;
  radiusSq: number;
  surfaceY: number;
  sourceType: WaterBodySourceType;

  constructor(data: {
    id: string;
    centerX: number;
    centerZ: number;
    radius: number;
    radiusSq: number;
    surfaceY: number;
    sourceType: WaterBodySourceType;
  }) {
    this.id = data.id;
    this.centerX = data.centerX;
    this.centerZ = data.centerZ;
    this.radius = data.radius;
    this.radiusSq = data.radiusSq;
    this.surfaceY = data.surfaceY;
    this.sourceType = data.sourceType;
  }
}

/** Packed grid key — no string allocation. 131072 = 2^17, enough for ±65k cells. */
function gridKey(cx: number, cz: number): number {
  return cx * 131072 + cz;
}

export class WaterBodyRegistry {
  private bodies: ElevatedWaterBody[] = [];
  private gridCellSize: number;
  private grid: Map<number, number[]> = new Map();
  private oceanLevel: number;

  constructor(oceanLevel: number, gridCellSize = 50) {
    this.oceanLevel = oceanLevel;
    this.gridCellSize = gridCellSize;
  }

  /** Register a water body and insert it into the spatial grid. */
  register(data: {
    id: string;
    centerX: number;
    centerZ: number;
    radius: number;
    radiusSq: number;
    surfaceY: number;
    sourceType: WaterBodySourceType;
  }): void {
    const body = new ElevatedWaterBody(data);
    const idx = this.bodies.length;
    this.bodies.push(body);

    // Insert body index into all grid cells its bounding circle overlaps
    const cs = this.gridCellSize;
    const minCX = Math.floor((body.centerX - body.radius) / cs);
    const maxCX = Math.floor((body.centerX + body.radius) / cs);
    const minCZ = Math.floor((body.centerZ - body.radius) / cs);
    const maxCZ = Math.floor((body.centerZ + body.radius) / cs);

    for (let cx = minCX; cx <= maxCX; cx++) {
      for (let cz = minCZ; cz <= maxCZ; cz++) {
        const key = gridKey(cx, cz);
        let cell = this.grid.get(key);
        if (!cell) {
          cell = [];
          this.grid.set(key, cell);
        }
        cell.push(idx);
      }
    }
  }

  /** Get the water body containing the point, or null. If multiple overlap, returns highest surfaceY. */
  getBodyAt(worldX: number, worldZ: number): ElevatedWaterBody | null {
    const cs = this.gridCellSize;
    const cx = Math.floor(worldX / cs);
    const cz = Math.floor(worldZ / cs);
    const cell = this.grid.get(gridKey(cx, cz));
    if (!cell) return null;

    let best: ElevatedWaterBody | null = null;
    for (let i = 0; i < cell.length; i++) {
      const body = this.bodies[cell[i]];
      const dx = worldX - body.centerX;
      const dz = worldZ - body.centerZ;
      if (dx * dx + dz * dz <= body.radiusSq) {
        if (!best || body.surfaceY > best.surfaceY) {
          best = body;
        }
      }
    }
    return best;
  }

  /** Get effective water surface at a world position: body surfaceY if inside one, else ocean level. */
  getWaterSurfaceAt(worldX: number, worldZ: number): number {
    const body = this.getBodyAt(worldX, worldZ);
    return body ? body.surfaceY : this.oceanLevel;
  }

  /** Check if terrain at this position is underwater (below effective water surface). */
  isUnderwater(worldX: number, worldZ: number, terrainHeight: number): boolean {
    return terrainHeight < this.getWaterSurfaceAt(worldX, worldZ);
  }

  /** Get all bodies whose bounding circle overlaps the given tile rectangle. */
  getBodiesInTile(
    tileX: number,
    tileZ: number,
    tileSize: number,
  ): ElevatedWaterBody[] {
    const minX = tileX * tileSize;
    const maxX = minX + tileSize;
    const minZ = tileZ * tileSize;
    const maxZ = minZ + tileSize;

    const result: ElevatedWaterBody[] = [];
    const seen = new Set<number>();

    // Find all grid cells that overlap the tile AABB
    const cs = this.gridCellSize;
    const cMinX = Math.floor(minX / cs);
    const cMaxX = Math.floor(maxX / cs);
    const cMinZ = Math.floor(minZ / cs);
    const cMaxZ = Math.floor(maxZ / cs);

    for (let cx = cMinX; cx <= cMaxX; cx++) {
      for (let cz = cMinZ; cz <= cMaxZ; cz++) {
        const cell = this.grid.get(gridKey(cx, cz));
        if (!cell) continue;
        for (let i = 0; i < cell.length; i++) {
          const idx = cell[i];
          if (seen.has(idx)) continue;
          seen.add(idx);

          const body = this.bodies[idx];
          // AABB-circle intersection test
          const closestX = Math.max(minX, Math.min(maxX, body.centerX));
          const closestZ = Math.max(minZ, Math.min(maxZ, body.centerZ));
          const dx = closestX - body.centerX;
          const dz = closestZ - body.centerZ;
          if (dx * dx + dz * dz <= body.radiusSq) {
            result.push(body);
          }
        }
      }
    }
    return result;
  }

  /** Get all registered water bodies. */
  getAllBodies(): ReadonlyArray<ElevatedWaterBody> {
    return this.bodies;
  }

  /** Get the ocean fallback level. */
  getOceanLevel(): number {
    return this.oceanLevel;
  }

  /**
   * Sample N points around a landscape feature's rim circle and return
   * the minimum height — the "pour point" / spill height. This becomes
   * the water body's surfaceY (water fills up to the lowest rim point).
   */
  static computeRimHeight(
    feature: LandscapeFeatureDef,
    getHeightAt: (x: number, z: number) => number,
    sampleCount = 64,
  ): number {
    let minHeight = Infinity;
    const step = (Math.PI * 2) / sampleCount;
    for (let i = 0; i < sampleCount; i++) {
      const angle = i * step;
      const sx = feature.x + Math.cos(angle) * feature.radius;
      const sz = feature.z + Math.sin(angle) * feature.radius;
      const h = getHeightAt(sx, sz);
      if (h < minHeight) minHeight = h;
    }
    return minHeight;
  }
}
