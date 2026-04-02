/**
 * poissonDisc — Poisson disc sampling with pluggable boundary test
 *
 * Generates well-spaced 2D points within arbitrary bounds.
 * The `inBounds` callback determines which points are valid —
 * callers provide tile-set membership, contour tests, etc.
 *
 * Single implementation shared by useZoneAutoGen and useZoneProcgen.
 */

import { dist2 } from "./procgenUtils";

export interface PoissonBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Returns true if the candidate point is inside the valid region. */
export type PoissonBoundaryTest = (x: number, z: number) => boolean;

/**
 * Generate well-spaced points using Poisson disc sampling.
 *
 * @param bounds      Axis-aligned bounding box to sample within
 * @param minSpacing  Minimum distance between any two points
 * @param maxPoints   Maximum number of points to generate
 * @param rng         Seeded random number generator [0, 1)
 * @param inBounds    Callback that returns true if a position is valid
 */
export function poissonDiscSample(
  bounds: PoissonBounds,
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
  const seedAttempts = maxPoints * 30;
  for (let att = 0; att < seedAttempts && points.length === 0; att++) {
    const px = bounds.minX + rng() * (bounds.maxX - bounds.minX);
    const pz = bounds.minZ + rng() * (bounds.maxZ - bounds.minZ);
    if (inBounds(px, pz)) {
      points.push({ x: px, z: pz });
      active.push(0);
      const gi = gridIdx(px, pz);
      if (gi >= 0) grid[gi] = 0;
    }
  }

  const k = 30; // candidates per active point
  const minSpacing2 = minSpacing * minSpacing;

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

      // Quick AABB rejection
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

      // Check 5x5 neighborhood for spacing violations
      const gx = Math.floor((nx - bounds.minX) / cellSize);
      const gz = Math.floor((nz - bounds.minZ) / cellSize);
      let tooClose = false;
      for (let dz = -2; dz <= 2 && !tooClose; dz++) {
        for (let dx = -2; dx <= 2 && !tooClose; dx++) {
          const ngx = gx + dx;
          const ngz = gz + dz;
          if (ngx < 0 || ngx >= gridW || ngz < 0 || ngz >= gridH) continue;
          const ni = grid[ngz * gridW + ngx];
          if (ni !== null) {
            if (dist2(nx, nz, points[ni].x, points[ni].z) < minSpacing2) {
              tooClose = true;
            }
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

    if (!found) {
      active.splice(idx, 1);
    }
  }

  return points;
}
