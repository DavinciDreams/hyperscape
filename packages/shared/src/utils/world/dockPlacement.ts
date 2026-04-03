/**
 * dockPlacement — Pure logic for shoreline dock placement
 *
 * Scores shoreline positions for dock suitability based on:
 * - Water adjacency (must be at water edge)
 * - Terrain flatness (docks need relatively flat ground)
 * - Distance from towns (prefer dock access from settlements)
 * - Spacing between docks
 *
 * All terrain queries go through callback interfaces.
 */

import { dist2D } from "../MathUtils";

// ============== TYPES ==============

/** Terrain query callbacks for dock placement */
export interface DockTerrainQuerier {
  getHeight(x: number, z: number): number;
  isWater(x: number, z: number): boolean;
}

/** Town reference for proximity scoring */
export interface DockTownRef {
  id: string;
  position: { x: number; z: number };
}

/** Dock placement config */
export interface DockGenConfig {
  /** Minimum distance between docks */
  minDockSpacing: number;
  /** Maximum distance from nearest town for scoring bonus */
  maxTownDistance: number;
  /** World half-size in meters */
  halfWorldSize: number;
  /** Seed for deterministic generation */
  seed: number;
  /** Target number of docks */
  targetCount: number;
  /** Search step size for shoreline scanning */
  searchStepSize: number;
}

/** Scored dock candidate */
export interface DockCandidate {
  /** World position on land side of shore */
  position: { x: number; y: number; z: number };
  /** Direction facing into water (radians) */
  facingAngle: number;
  /** Suitability score (0-1, higher = better) */
  score: number;
  /** Nearest town ID */
  nearestTownId: string | null;
  /** Distance to nearest town */
  townDistance: number;
}

/** Placed dock result */
export interface PlacedDock {
  id: string;
  position: { x: number; y: number; z: number };
  facingAngle: number;
  score: number;
  nearestTownId: string | null;
}

// ============== DEFAULT CONFIG ==============

export const DEFAULT_DOCK_CONFIG: DockGenConfig = {
  minDockSpacing: 200,
  maxTownDistance: 500,
  halfWorldSize: 1000,
  seed: 0,
  targetCount: 6,
  searchStepSize: 10,
};

// ============== SEEDED RNG ==============

function createLCG(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

// ============== SHORELINE SCORING ==============

/**
 * Score a single shoreline position for dock suitability.
 * Returns 0 if position is not at a water edge.
 */
export function scoreShorelinePosition(
  x: number,
  z: number,
  terrain: DockTerrainQuerier,
  towns: DockTownRef[],
  maxTownDistance: number,
): DockCandidate | null {
  // Must be on land
  if (terrain.isWater(x, z)) return null;

  // Check 8 directions for water adjacency
  const checkDist = 5; // 5m out
  const directions = [
    { dx: checkDist, dz: 0 },
    { dx: -checkDist, dz: 0 },
    { dx: 0, dz: checkDist },
    { dx: 0, dz: -checkDist },
    { dx: checkDist, dz: checkDist },
    { dx: checkDist, dz: -checkDist },
    { dx: -checkDist, dz: checkDist },
    { dx: -checkDist, dz: -checkDist },
  ];

  let waterDirX = 0;
  let waterDirZ = 0;
  let waterCount = 0;

  for (const dir of directions) {
    if (terrain.isWater(x + dir.dx, z + dir.dz)) {
      waterDirX += dir.dx;
      waterDirZ += dir.dz;
      waterCount++;
    }
  }

  // Not at water edge if no adjacent water, or fully surrounded by water
  if (waterCount === 0 || waterCount >= 7) return null;

  // Facing angle: toward the water
  const facingAngle = Math.atan2(waterDirZ, waterDirX);

  // Terrain flatness: check height variance in 10m radius
  const sampleRadius = 10;
  const heights: number[] = [];
  for (let sx = -sampleRadius; sx <= sampleRadius; sx += 5) {
    for (let sz = -sampleRadius; sz <= sampleRadius; sz += 5) {
      if (!terrain.isWater(x + sx, z + sz)) {
        heights.push(terrain.getHeight(x + sx, z + sz));
      }
    }
  }

  let flatnessScore = 1.0;
  if (heights.length > 1) {
    const minH = Math.min(...heights);
    const maxH = Math.max(...heights);
    const variance = maxH - minH;
    // Penalty for steep terrain: >5m variance = 0 flatness
    flatnessScore = Math.max(0, 1 - variance / 5);
  }

  // Town proximity score
  let nearestTownId: string | null = null;
  let townDistance = Infinity;
  for (const town of towns) {
    const d = dist2D(x, z, town.position.x, town.position.z);
    if (d < townDistance) {
      townDistance = d;
      nearestTownId = town.id;
    }
  }
  const townScore =
    townDistance < maxTownDistance ? 1 - townDistance / maxTownDistance : 0;

  // Water adjacency score: more water directions = better (peninsula-like = great)
  const waterScore = Math.min(1, waterCount / 4);

  // Combined score
  const score = flatnessScore * 0.3 + townScore * 0.4 + waterScore * 0.3;

  return {
    position: { x, y: terrain.getHeight(x, z), z },
    facingAngle,
    score,
    nearestTownId,
    townDistance,
  };
}

// ============== MAIN API ==============

/**
 * Scan the world shoreline and place docks at the best positions.
 *
 * Strategy: grid-scan the world, score shoreline positions,
 * pick top candidates with spacing constraints.
 */
export function generateDocks(
  config: Partial<DockGenConfig> & { halfWorldSize: number; seed: number },
  terrain: DockTerrainQuerier,
  towns: DockTownRef[],
): PlacedDock[] {
  const cfg: DockGenConfig = { ...DEFAULT_DOCK_CONFIG, ...config };
  const rng = createLCG(cfg.seed + 77777);

  // Grid scan: sample shoreline at regular intervals
  const candidates: DockCandidate[] = [];
  const step = cfg.searchStepSize;

  for (let x = -cfg.halfWorldSize + 50; x < cfg.halfWorldSize - 50; x += step) {
    for (
      let z = -cfg.halfWorldSize + 50;
      z < cfg.halfWorldSize - 50;
      z += step
    ) {
      // Add slight random jitter to avoid grid artifacts
      const jx = x + (rng() - 0.5) * step * 0.5;
      const jz = z + (rng() - 0.5) * step * 0.5;

      const candidate = scoreShorelinePosition(
        jx,
        jz,
        terrain,
        towns,
        cfg.maxTownDistance,
      );
      if (candidate && candidate.score > 0.1) {
        candidates.push(candidate);
      }
    }
  }

  // Sort by score descending
  candidates.sort((a, b) => b.score - a.score);

  // Greedy selection with spacing constraint
  const docks: PlacedDock[] = [];
  for (const candidate of candidates) {
    if (docks.length >= cfg.targetCount) break;

    // Check spacing against already-placed docks
    const tooClose = docks.some(
      (d) =>
        dist2D(
          candidate.position.x,
          candidate.position.z,
          d.position.x,
          d.position.z,
        ) < cfg.minDockSpacing,
    );
    if (tooClose) continue;

    docks.push({
      id: `dock_${docks.length}`,
      position: candidate.position,
      facingAngle: candidate.facingAngle,
      score: candidate.score,
      nearestTownId: candidate.nearestTownId,
    });
  }

  return docks;
}
