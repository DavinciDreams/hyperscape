/**
 * roadGenerator — A*-based terrain-aware road network between towns
 *
 * Network topology: Kruskal's MST + extra connections for redundancy.
 * Per-road routing: A* on a terrain cost grid where:
 *   - Water cells have high cost (bridge crossing) — roads prefer dry land but
 *     can cross narrow rivers, creating causeway/bridge effects via terrain flattening
 *   - Structure obstacles (buildings, arenas, stations) are impassable
 *   - Slope cost is computed per-edge using grade (rise/run) with quadratic penalty
 *   - Low-frequency value noise adds organic variation (prevents straight lines on
 *     flat terrain by creating "cost valleys" the path naturally follows)
 * Path smoothed via Chaikin corner-cutting subdivision (stays within the A*
 * validated corridor — unlike Catmull-Rom, it never overshoots into obstacles).
 * Resampled at uniform intervals, then height-graded for walkability.
 */

import type { GeneratedRoad } from "../../WorldBuilder/types";

// ============== TYPES ==============

interface RoadEntryPoint {
  angle: number;
  position: { x: number; z: number };
}

interface RoadTown {
  id: string;
  name: string;
  position: { x: number; y: number; z: number };
  /** Town entry/exit points where internal roads meet the perimeter */
  entryPoints?: RoadEntryPoint[];
  /** Fallback: offset from center if no entry points defined */
  radius?: number;
  /** Full safe zone radius — used for obstacle exemption so the internal
   *  main street (center → entry point) isn't displaced by building obstacles */
  safeZoneRadius?: number;
}

interface RoadGenConfig {
  roadWidth: number;
  /** Fraction of non-MST edges to add (0.3 = 30%) */
  extraConnectionsRatio: number;
  waterThreshold: number;
  /** A* grid cell size in meters */
  gridCellSize: number;
  /** Laplacian smoothing passes for walkable height */
  gradingPasses: number;
}

type HeightQuerier = (
  x: number,
  z: number,
) => { biome: string; height: number };

/** Circular obstacle for road avoidance (building footprint, platform, POI) */
export interface RoadObstacle {
  x: number;
  z: number;
  radius: number;
}

type Vec3 = { x: number; y: number; z: number };

// ============== CONSTANTS ==============

/**
 * Slope penalty multiplier. Grade² × this value = extra cost.
 * grade 0.05 (2.9°) → +0.75  |  grade 0.15 (8.5°) → +6.75
 * grade 0.30 (16.7°) → +27    |  grade 0.50 (26.6°) → +75
 */
const SLOPE_PENALTY = 500;
/** Slopes above this grade (rise/run) are impassable (~35°) */
const MAX_GRADE = 0.7;
/**
 * Elevation weight — higher terrain is more expensive regardless of local slope.
 * Pushes roads into valleys. normalizedHeight² × this = extra multiplier.
 * Peak terrain costs (1 + ELEVATION_WEIGHT)× more than valley floor.
 */
const ELEVATION_WEIGHT = 8;
/** Water crossing penalty multiplier. Water cells cost this many times more
 *  than dry land, allowing roads to cross rivers as "bridges" rather than
 *  taking huge detours or failing entirely. The terrain height-flattening
 *  under roads automatically raises the ground to water level, creating a
 *  visible causeway/bridge effect. Set high enough that dry land is strongly
 *  preferred, but finite so narrow rivers can be crossed. */
const WATER_CROSSING_COST = 8;
/** Noise amplitude: base cost ranges from (1 - AMP/2) to (1 + AMP/2) */
const NOISE_AMPLITUDE = 0.6;
/** Noise spatial frequency — 1/scale = period in meters. 0.008 → ~125m period */
const NOISE_SCALE = 0.008;
/** Extra search space around the town bounding box */
const SEARCH_MARGIN_RATIO = 1.0;
const MIN_SEARCH_MARGIN = 200;
/** Turn penalty — discourages sharp direction changes for smoother paths */
const TURN_PENALTY = 1.5;
/** Chaikin corner-cutting iterations (4 = smoother curves) */
const CHAIKIN_ITERATIONS = 4;
/** Target spacing between final path points in meters */
const RESAMPLE_INTERVAL = 5;

/**
 * 16-directional movement: 8 standard + 8 "knight's move" directions.
 * Knight's moves give ~26.5° angle resolution instead of 45°, producing
 * much more natural curved paths (Galin et al. 2010, Runevision blog).
 * [dx, dy, distMultiplier]
 */
const SQRT5 = Math.sqrt(5);
const DIRS: [number, number, number][] = [
  // Cardinal (0°, 90°, 180°, 270°)
  [1, 0, 1.0],
  [-1, 0, 1.0],
  [0, 1, 1.0],
  [0, -1, 1.0],
  // Diagonal (45°, 135°, 225°, 315°)
  [1, 1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
  // Knight's moves (~26.5°, ~63.4°, etc.)
  [2, 1, SQRT5],
  [1, 2, SQRT5],
  [-2, 1, SQRT5],
  [-1, 2, SQRT5],
  [2, -1, SQRT5],
  [1, -2, SQRT5],
  [-2, -1, SQRT5],
  [-1, -2, SQRT5],
];

// ============== VALUE NOISE ==============

/** Deterministic hash → [0, 1]. Used for organic cost variation. */
function hashNoise(ix: number, iz: number): number {
  const n = Math.sin(ix * 12.9898 + iz * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

/** Bilinearly interpolated value noise in [0, 1] */
function smoothNoise(x: number, z: number): number {
  const sx = x * NOISE_SCALE;
  const sz = z * NOISE_SCALE;
  const ix = Math.floor(sx);
  const iz = Math.floor(sz);
  const fx = sx - ix;
  const fz = sz - iz;
  // Hermite smoothstep for smoother interpolation
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const v00 = hashNoise(ix, iz);
  const v10 = hashNoise(ix + 1, iz);
  const v01 = hashNoise(ix, iz + 1);
  const v11 = hashNoise(ix + 1, iz + 1);
  const vx0 = v00 + (v10 - v00) * ux;
  const vx1 = v01 + (v11 - v01) * ux;
  return vx0 + (vx1 - vx0) * uz;
}

// ============== BINARY MIN-HEAP ==============

class MinHeap {
  private data: [number, number][] = []; // [fScore, cellIndex]

  push(fScore: number, index: number) {
    this.data.push([fScore, index]);
    this._up(this.data.length - 1);
  }

  pop(): [number, number] | undefined {
    if (this.data.length === 0) return undefined;
    const top = this.data[0];
    const last = this.data.pop()!;
    if (this.data.length > 0) {
      this.data[0] = last;
      this._down(0);
    }
    return top;
  }

  get size() {
    return this.data.length;
  }

  private _up(i: number) {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.data[i][0] < this.data[p][0]) {
        [this.data[i], this.data[p]] = [this.data[p], this.data[i]];
        i = p;
      } else break;
    }
  }

  private _down(i: number) {
    const n = this.data.length;
    while (true) {
      let s = i;
      const l = 2 * i + 1;
      const r = 2 * i + 2;
      if (l < n && this.data[l][0] < this.data[s][0]) s = l;
      if (r < n && this.data[r][0] < this.data[s][0]) s = r;
      if (s !== i) {
        [this.data[i], this.data[s]] = [this.data[s], this.data[i]];
        i = s;
      } else break;
    }
  }
}

// ============== UNION-FIND ==============

class UnionFind {
  private parent: number[];
  private rank: number[];

  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, i) => i);
    this.rank = new Array(size).fill(0);
  }

  find(x: number): number {
    if (this.parent[x] !== x) this.parent[x] = this.find(this.parent[x]);
    return this.parent[x];
  }

  union(x: number, y: number): boolean {
    const rx = this.find(x);
    const ry = this.find(y);
    if (rx === ry) return false;
    if (this.rank[rx] < this.rank[ry]) this.parent[rx] = ry;
    else if (this.rank[rx] > this.rank[ry]) this.parent[ry] = rx;
    else {
      this.parent[ry] = rx;
      this.rank[rx]++;
    }
    return true;
  }
}

// ============== COST GRID ==============

interface CostGrid {
  /** Per-cell base traversal cost (noise-varied). Infinity = impassable. */
  baseCost: Float32Array;
  /** Per-cell terrain height */
  heights: Float32Array;
  gridW: number;
  gridH: number;
  originX: number;
  originZ: number;
  cellSize: number;
}

function buildCostGrid(
  fromPos: { x: number; z: number },
  toPos: { x: number; z: number },
  queryBiome: HeightQuerier,
  waterThreshold: number,
  cellSize: number,
  obstacles: RoadObstacle[],
): CostGrid {
  const dist = Math.sqrt(
    (toPos.x - fromPos.x) ** 2 + (toPos.z - fromPos.z) ** 2,
  );
  const margin = Math.max(MIN_SEARCH_MARGIN, dist * SEARCH_MARGIN_RATIO);

  const originX = Math.min(fromPos.x, toPos.x) - margin;
  const maxX = Math.max(fromPos.x, toPos.x) + margin;
  const originZ = Math.min(fromPos.z, toPos.z) - margin;
  const maxZ = Math.max(fromPos.z, toPos.z) + margin;

  const gridW = Math.ceil((maxX - originX) / cellSize) + 1;
  const gridH = Math.ceil((maxZ - originZ) / cellSize) + 1;
  const totalCells = gridW * gridH;

  const heights = new Float32Array(totalCells);
  const baseCost = new Float32Array(totalCells);

  // Pass 1: sample terrain heights + compute noise-based base cost
  for (let gy = 0; gy < gridH; gy++) {
    for (let gx = 0; gx < gridW; gx++) {
      const worldX = originX + gx * cellSize;
      const worldZ = originZ + gy * cellSize;
      const q = queryBiome(worldX, worldZ);
      const idx = gy * gridW + gx;
      heights[idx] = q.height;

      if (q.height < waterThreshold) {
        // Water cells are expensive but traversable — roads cross narrow
        // rivers as bridges instead of taking huge detours or failing.
        baseCost[idx] = WATER_CROSSING_COST;
      } else {
        // Noise-varied base cost: range [1 - AMP/2, 1 + AMP/2] = [0.7, 1.3]
        // Creates "cost valleys" that roads naturally follow for organic curves
        const noise = smoothNoise(worldX, worldZ);
        baseCost[idx] = 1.0 + NOISE_AMPLITUDE * (noise - 0.5);
      }
    }
  }

  // Pass 2: mark structure obstacles as impassable
  if (obstacles.length > 0) {
    const gridMaxX = originX + (gridW - 1) * cellSize;
    const gridMaxZ = originZ + (gridH - 1) * cellSize;
    const relevant = obstacles.filter(
      (o) =>
        o.x + o.radius >= originX &&
        o.x - o.radius <= gridMaxX &&
        o.z + o.radius >= originZ &&
        o.z - o.radius <= gridMaxZ,
    );

    for (const obs of relevant) {
      const r2 = obs.radius * obs.radius;
      const gxMin = Math.max(
        0,
        Math.floor((obs.x - obs.radius - originX) / cellSize),
      );
      const gxMax = Math.min(
        gridW - 1,
        Math.ceil((obs.x + obs.radius - originX) / cellSize),
      );
      const gyMin = Math.max(
        0,
        Math.floor((obs.z - obs.radius - originZ) / cellSize),
      );
      const gyMax = Math.min(
        gridH - 1,
        Math.ceil((obs.z + obs.radius - originZ) / cellSize),
      );

      for (let gy = gyMin; gy <= gyMax; gy++) {
        for (let gx = gxMin; gx <= gxMax; gx++) {
          const wx = originX + gx * cellSize;
          const wz = originZ + gy * cellSize;
          const dx = wx - obs.x;
          const dz = wz - obs.z;
          if (dx * dx + dz * dz < r2) {
            baseCost[gy * gridW + gx] = Infinity;
          }
        }
      }
    }
  }

  // Pass 3: apply elevation-based cost — roads prefer valleys over ridges/peaks.
  // Find height range of traversable (non-obstacle) cells.
  let minH = Infinity;
  let maxH = -Infinity;
  for (let i = 0; i < totalCells; i++) {
    if (isFinite(baseCost[i])) {
      const h = heights[i];
      if (h < minH) minH = h;
      if (h > maxH) maxH = h;
    }
  }
  const heightRange = maxH - minH;
  if (heightRange > 1.0) {
    for (let i = 0; i < totalCells; i++) {
      if (isFinite(baseCost[i])) {
        const normalizedH = (heights[i] - minH) / heightRange; // 0..1
        baseCost[i] *= 1.0 + ELEVATION_WEIGHT * normalizedH * normalizedH;
      }
    }
  }

  return { baseCost, heights, gridW, gridH, originX, originZ, cellSize };
}

// ============== A* PATHFINDING ==============

/**
 * A* with per-edge slope cost. Edge cost formula:
 *   moveWorldDist × avgBaseCost × (1 + SLOPE_PENALTY × grade²)
 * where grade = |Δh| / moveWorldDist (rise/run).
 */
function aStarPath(
  grid: CostGrid,
  startX: number,
  startZ: number,
  goalX: number,
  goalZ: number,
): Array<{ x: number; z: number }> | null {
  const { baseCost, heights, gridW, gridH, originX, originZ, cellSize } = grid;
  const clamp = (v: number, max: number) => Math.max(0, Math.min(max - 1, v));

  const sx = clamp(Math.round((startX - originX) / cellSize), gridW);
  const sy = clamp(Math.round((startZ - originZ) / cellSize), gridH);
  const gx = clamp(Math.round((goalX - originX) / cellSize), gridW);
  const gy = clamp(Math.round((goalZ - originZ) / cellSize), gridH);

  const s = sy * gridW + sx;
  const g = gy * gridW + gx;

  // Clear a small area around start/end so A* can begin exploring.
  // Single-cell clearing fails when the exit point lands near building obstacles
  // that block all neighbors. Clearing ~3 cells radius ensures A* has room to move.
  const clearRadius = 3; // cells
  for (const center of [
    [sx, sy],
    [gx, gy],
  ]) {
    for (let dy = -clearRadius; dy <= clearRadius; dy++) {
      for (let dx = -clearRadius; dx <= clearRadius; dx++) {
        const cx = center[0] + dx;
        const cy = center[1] + dy;
        if (
          cx >= 0 &&
          cx < gridW &&
          cy >= 0 &&
          cy < gridH &&
          dx * dx + dy * dy <= clearRadius * clearRadius
        ) {
          const idx = cy * gridW + cx;
          if (!isFinite(baseCost[idx])) baseCost[idx] = 1.0;
        }
      }
    }
  }

  const totalCells = gridW * gridH;
  const gScore = new Float32Array(totalCells).fill(Infinity);
  const cameFrom = new Int32Array(totalCells).fill(-1);
  const closed = new Uint8Array(totalCells);

  gScore[s] = 0;
  const heap = new MinHeap();

  // Heuristic: Euclidean distance in world units.
  // Slightly overestimates for low-cost cells (baseCost < 1.0), making this
  // effectively a mild weighted A* (~1.4×). Fine for aesthetic road generation.
  const heuristic = (idx: number): number => {
    const cx = idx % gridW;
    const cy = (idx / gridW) | 0;
    const dx = cx - gx;
    const dy = cy - gy;
    return Math.sqrt(dx * dx + dy * dy) * cellSize;
  };

  heap.push(heuristic(s), s);

  while (heap.size > 0) {
    const [, current] = heap.pop()!;

    if (current === g) break;
    if (closed[current]) continue;
    closed[current] = 1;

    const cx = current % gridW;
    const cy = (current / gridW) | 0;
    const hCur = heights[current];

    for (const [ddx, ddy, moveDist] of DIRS) {
      const nx = cx + ddx;
      const ny = cy + ddy;
      if (nx < 0 || nx >= gridW || ny < 0 || ny >= gridH) continue;

      const neighbor = ny * gridW + nx;
      if (closed[neighbor] || !isFinite(baseCost[neighbor])) continue;

      // For knight's moves (2-cell jumps), check intermediate cell isn't blocked
      if (Math.abs(ddx) > 1 || Math.abs(ddy) > 1) {
        const midX = cx + (ddx > 0 ? 1 : ddx < 0 ? -1 : 0);
        const midY = cy + (ddy > 0 ? 1 : ddy < 0 ? -1 : 0);
        if (
          midX >= 0 &&
          midX < gridW &&
          midY >= 0 &&
          midY < gridH &&
          !isFinite(baseCost[midY * gridW + midX])
        )
          continue;
      }

      // Per-edge slope cost using grade (rise/run)
      const moveWorldDist = moveDist * cellSize;
      const dh = Math.abs(heights[neighbor] - hCur);
      const grade = dh / moveWorldDist;

      // Impassable if too steep
      if (grade > MAX_GRADE) continue;

      // Edge cost = distance × avgBaseCost × (1 + slopePenalty × grade²)
      const avgBase = (baseCost[current] + baseCost[neighbor]) * 0.5;
      const slopeFactor = 1.0 + SLOPE_PENALTY * grade * grade;
      let edgeCost = moveWorldDist * avgBase * slopeFactor;

      // Turn penalty — discourages sharp direction changes for smoother paths.
      // Compare current move direction with previous move direction.
      const prev = cameFrom[current];
      if (prev !== -1) {
        const prevDx = cx - (prev % gridW);
        const prevDy = cy - ((prev / gridW) | 0);
        // Dot product of normalized previous and current direction
        const prevLen = Math.sqrt(prevDx * prevDx + prevDy * prevDy);
        const curLen = Math.sqrt(ddx * ddx + ddy * ddy);
        if (prevLen > 0 && curLen > 0) {
          const dot = (prevDx * ddx + prevDy * ddy) / (prevLen * curLen);
          // dot=1 straight ahead, dot=0 right angle, dot=-1 reversal
          // penalty = TURN_PENALTY × (1 - dot) / 2  → 0 for straight, full for reversal
          edgeCost += TURN_PENALTY * cellSize * (1 - dot) * 0.5;
        }
      }

      const tentativeG = gScore[current] + edgeCost;
      if (tentativeG < gScore[neighbor]) {
        gScore[neighbor] = tentativeG;
        cameFrom[neighbor] = current;
        heap.push(tentativeG + heuristic(neighbor), neighbor);
      }
    }
  }

  // Reconstruct path
  if (cameFrom[g] === -1 && s !== g) {
    console.warn("[RoadGen] A* found no path — falling back to direct line");
    return null;
  }

  const path: Array<{ x: number; z: number }> = [];
  let cur = g;
  while (cur !== -1) {
    path.push({
      x: originX + (cur % gridW) * cellSize,
      z: originZ + ((cur / gridW) | 0) * cellSize,
    });
    cur = cameFrom[cur];
  }
  path.reverse();
  return path;
}

// ============== CHAIKIN CORNER-CUTTING SUBDIVISION ==============

/**
 * Chaikin's algorithm: each iteration replaces each edge with two new points
 * at 25% and 75% along the edge. The result is a smooth curve that NEVER
 * leaves the convex hull of the original segments — unlike Catmull-Rom, it
 * can't overshoot into obstacles.
 */
function chaikinSmooth2D(
  points: Array<{ x: number; z: number }>,
  iterations: number,
): Array<{ x: number; z: number }> {
  if (points.length < 3) return points;

  let current = points;
  for (let iter = 0; iter < iterations; iter++) {
    const next: Array<{ x: number; z: number }> = [current[0]]; // Pin start
    for (let j = 0; j < current.length - 1; j++) {
      const p0 = current[j];
      const p1 = current[j + 1];
      next.push({
        x: 0.75 * p0.x + 0.25 * p1.x,
        z: 0.75 * p0.z + 0.25 * p1.z,
      });
      next.push({
        x: 0.25 * p0.x + 0.75 * p1.x,
        z: 0.25 * p0.z + 0.75 * p1.z,
      });
    }
    next.push(current[current.length - 1]); // Pin end
    current = next;
  }
  return current;
}

// ============== UNIFORM RESAMPLING ==============

/** Walk along the polyline at uniform intervals, producing evenly spaced points */
function resamplePath(
  points: Array<{ x: number; z: number }>,
  interval: number,
): Array<{ x: number; z: number }> {
  if (points.length < 2) return points;

  // Compute cumulative arc lengths
  const arcLen: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dz = points[i].z - points[i - 1].z;
    arcLen.push(arcLen[i - 1] + Math.sqrt(dx * dx + dz * dz));
  }

  const totalLen = arcLen[arcLen.length - 1];
  if (totalLen < interval) return points;

  const result: Array<{ x: number; z: number }> = [points[0]];
  let segIdx = 0;

  for (let d = interval; d < totalLen - interval * 0.5; d += interval) {
    // Advance segment index to the one containing distance d
    while (segIdx < arcLen.length - 2 && arcLen[segIdx + 1] < d) segIdx++;
    const segLen = arcLen[segIdx + 1] - arcLen[segIdx];
    const t = segLen > 0.001 ? (d - arcLen[segIdx]) / segLen : 0;
    result.push({
      x: points[segIdx].x + (points[segIdx + 1].x - points[segIdx].x) * t,
      z: points[segIdx].z + (points[segIdx + 1].z - points[segIdx].z) * t,
    });
  }

  result.push(points[points.length - 1]);
  return result;
}

// ============== HEIGHT GRADING ==============

/** Laplacian smooth on Y values — flattens bumps for walkability */
function gradeHeight(path: Vec3[], passes: number): Vec3[] {
  if (path.length < 3) return path;

  const result = path.map((p) => ({ ...p }));
  for (let pass = 0; pass < passes; pass++) {
    for (let i = 1; i < result.length - 1; i++) {
      result[i].y = (result[i - 1].y + result[i].y * 2 + result[i + 1].y) / 4;
    }
  }
  return result;
}

// ============== POST-SMOOTH OBSTACLE SAFETY NET ==============

/**
 * Push any path point inside an obstacle radially outward to its edge.
 * Skips points near town centers (road is on the internal main street there).
 */
function enforceObstacles(
  path: Vec3[],
  obstacles: RoadObstacle[],
  townExemptions?: Array<{ x: number; z: number; r: number }>,
): void {
  if (obstacles.length === 0) return;

  for (let i = 1; i < path.length - 1; i++) {
    const p = path[i];

    // Skip enforcement if point is inside a town (on internal road)
    if (townExemptions) {
      let exempt = false;
      for (const t of townExemptions) {
        const tdx = p.x - t.x;
        const tdz = p.z - t.z;
        if (tdx * tdx + tdz * tdz < t.r * t.r) {
          exempt = true;
          break;
        }
      }
      if (exempt) continue;
    }

    for (const obs of obstacles) {
      const dx = p.x - obs.x;
      const dz = p.z - obs.z;
      const dist2 = dx * dx + dz * dz;
      const r = obs.radius;
      if (dist2 < r * r) {
        const dist = Math.sqrt(dist2);
        if (dist < 0.01) {
          p.x = obs.x + r + 1;
        } else {
          const scale = (r + 1) / dist;
          p.x = obs.x + dx * scale;
          p.z = obs.z + dz * scale;
        }
      }
    }
  }
}

// ============== ENTRY POINT SELECTION ==============

/**
 * Pick the town entry point that best faces the target position.
 * Returns the entry point position, or falls back to a radius-based offset.
 */
function pickEntryPoint(
  town: RoadTown,
  targetX: number,
  targetZ: number,
): { x: number; z: number } {
  const entries = town.entryPoints;
  if (entries && entries.length > 0) {
    // Angle from town center toward target
    const targetAngle = Math.atan2(
      targetX - town.position.x,
      targetZ - town.position.z,
    );

    // Find entry point with smallest angular difference
    let bestEntry = entries[0];
    let bestDiff = Infinity;
    for (const ep of entries) {
      let diff = Math.abs(ep.angle - targetAngle);
      if (diff > Math.PI) diff = 2 * Math.PI - diff;
      if (diff < bestDiff) {
        bestDiff = diff;
        bestEntry = ep;
      }
    }
    return bestEntry.position;
  }

  // Fallback: offset from center by radius toward target
  const r = town.radius ?? 25;
  const dx = targetX - town.position.x;
  const dz = targetZ - town.position.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist < 0.1) return { x: town.position.x + r, z: town.position.z };
  return {
    x: town.position.x + (dx / dist) * r,
    z: town.position.z + (dz / dist) * r,
  };
}

// ============== ROAD PATH GENERATION ==============

function generateRoadPath(
  fromTown: RoadTown,
  toTown: RoadTown,
  queryBiome: HeightQuerier,
  config: RoadGenConfig,
  obstacles: RoadObstacle[],
): Vec3[] {
  // Pick entry points — where internal town roads meet the perimeter.
  // A* routes between these, never entering the town building zone.
  const exitFrom = pickEntryPoint(
    fromTown,
    toTown.position.x,
    toTown.position.z,
  );
  const exitTo = pickEntryPoint(
    toTown,
    fromTown.position.x,
    fromTown.position.z,
  );

  const dx = exitTo.x - exitFrom.x;
  const dz = exitTo.z - exitFrom.z;
  const dist = Math.sqrt(dx * dx + dz * dz);

  // 1. Build terrain cost grid (covers exit-to-exit with margin for detours)
  const grid = buildCostGrid(
    exitFrom,
    exitTo,
    queryBiome,
    config.waterThreshold,
    config.gridCellSize,
    obstacles,
  );

  // 2. A* pathfinding with per-edge slope cost + elevation weight
  let gridPath = aStarPath(grid, exitFrom.x, exitFrom.z, exitTo.x, exitTo.z);

  // Log A* result for diagnostics
  const exitDx = exitTo.x - exitFrom.x;
  const exitDz = exitTo.z - exitFrom.z;
  const straightDist = Math.sqrt(exitDx * exitDx + exitDz * exitDz);
  if (gridPath && gridPath.length >= 2) {
    // Measure path length to detect major detours
    let pathLen = 0;
    for (let i = 1; i < gridPath.length; i++) {
      const pdx = gridPath[i].x - gridPath[i - 1].x;
      const pdz = gridPath[i].z - gridPath[i - 1].z;
      pathLen += Math.sqrt(pdx * pdx + pdz * pdz);
    }
    const detourRatio = pathLen / Math.max(1, straightDist);
    if (detourRatio > 2.0) {
      console.warn(
        `[RoadGen] ${fromTown.name}→${toTown.name} A* detour: path=${pathLen.toFixed(0)}m, ` +
          `straight=${straightDist.toFixed(0)}m, ratio=${detourRatio.toFixed(1)}x ` +
          `(exit ${exitFrom.x.toFixed(0)},${exitFrom.z.toFixed(0)} → ${exitTo.x.toFixed(0)},${exitTo.z.toFixed(0)})`,
      );
    }
  }

  // Fallback: direct line if A* fails (fully isolated by impassable terrain)
  if (!gridPath || gridPath.length < 2) {
    console.warn(
      `[RoadGen] A* failed ${fromTown.name} → ${toTown.name}, using direct line`,
    );
    const steps = Math.max(2, Math.ceil(dist / config.gridCellSize));
    gridPath = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      gridPath.push({
        x: exitFrom.x + (exitTo.x - exitFrom.x) * t,
        z: exitFrom.z + (exitTo.z - exitFrom.z) * t,
      });
    }
  }

  // Pin A* endpoints to entry points
  gridPath[0] = { x: exitFrom.x, z: exitFrom.z };
  gridPath[gridPath.length - 1] = { x: exitTo.x, z: exitTo.z };

  // Extend path through towns: town center → entry → A* → entry → town center.
  // The internal segments follow the town's main street between buildings.
  const fullPath: Array<{ x: number; z: number }> = [
    { x: fromTown.position.x, z: fromTown.position.z },
    ...gridPath,
    { x: toTown.position.x, z: toTown.position.z },
  ];

  // 3. Chaikin corner-cutting (stays within A* corridor — no obstacle overshoot)
  const smoothed2D = chaikinSmooth2D(fullPath, CHAIKIN_ITERATIONS);

  // 4. Resample at uniform intervals for consistent road mesh density
  const resampled = resamplePath(smoothed2D, RESAMPLE_INTERVAL);

  // 5. Attach terrain heights
  const path3D: Vec3[] = resampled.map((p) => {
    const h = queryBiome(p.x, p.z).height;
    return { x: p.x, y: Math.max(h, config.waterThreshold) + 0.15, z: p.z };
  });

  // 6. Safety net: push any stray points out of obstacles.
  // Exempt points near entry areas so Chaikin smoothing near the town edge
  // doesn't get pushed into weird shapes by boundary buildings.
  const townExemptions = [
    {
      x: fromTown.position.x,
      z: fromTown.position.z,
      r: fromTown.safeZoneRadius ?? fromTown.radius ?? 30,
    },
    {
      x: toTown.position.x,
      z: toTown.position.z,
      r: toTown.safeZoneRadius ?? toTown.radius ?? 30,
    },
  ];
  enforceObstacles(path3D, obstacles, townExemptions);

  // 7. Re-sample height after obstacle enforcement (position may have shifted)
  for (const p of path3D) {
    const h = queryBiome(p.x, p.z).height;
    p.y = Math.max(h, config.waterThreshold) + 0.15;
  }

  // 8. Grade height for walkability
  return gradeHeight(path3D, config.gradingPasses);
}

// ============== ROAD NETWORK ==============

const DEFAULT_CONFIG: RoadGenConfig = {
  roadWidth: 6,
  extraConnectionsRatio: 0.3,
  waterThreshold: 0,
  gridCellSize: 4,
  gradingPasses: 5,
};

export function generateRoadNetwork(
  towns: RoadTown[],
  queryBiome: HeightQuerier,
  waterThreshold: number,
  configOverrides?: Partial<RoadGenConfig>,
  obstacles: RoadObstacle[] = [],
): GeneratedRoad[] {
  if (towns.length < 2) return [];

  const config = { ...DEFAULT_CONFIG, ...configOverrides, waterThreshold };

  // Inflate obstacle radii by half-road-width so the full road mesh clears buildings
  const halfRoadWidth = config.roadWidth * 0.5;
  const inflatedObstacles = obstacles.map((o) => ({
    ...o,
    radius: o.radius + halfRoadWidth,
  }));

  // All pairwise distances for MST
  const edges: Array<{ from: number; to: number; distance: number }> = [];
  for (let i = 0; i < towns.length; i++) {
    for (let j = i + 1; j < towns.length; j++) {
      const dx = towns[j].position.x - towns[i].position.x;
      const dz = towns[j].position.z - towns[i].position.z;
      edges.push({
        from: i,
        to: j,
        distance: Math.sqrt(dx * dx + dz * dz),
      });
    }
  }

  // Kruskal's MST
  edges.sort((a, b) => a.distance - b.distance);
  const uf = new UnionFind(towns.length);
  const mstEdges: typeof edges = [];
  const nonMstEdges: typeof edges = [];

  for (const edge of edges) {
    if (uf.union(edge.from, edge.to)) {
      mstEdges.push(edge);
    } else {
      nonMstEdges.push(edge);
    }
  }

  // Add shortest non-MST edges for redundancy
  const extraCount = Math.floor(
    nonMstEdges.length * config.extraConnectionsRatio,
  );
  const selectedEdges = [...mstEdges, ...nonMstEdges.slice(0, extraCount)];

  // Generate terrain-aware path for each road
  const roads: GeneratedRoad[] = [];
  for (let i = 0; i < selectedEdges.length; i++) {
    const edge = selectedEdges[i];
    const fromTown = towns[edge.from];
    const toTown = towns[edge.to];

    const path = generateRoadPath(
      fromTown,
      toTown,
      queryBiome,
      config,
      inflatedObstacles,
    );

    roads.push({
      id: `autogen-road-${i}`,
      path,
      width: config.roadWidth,
      connectedTowns: [fromTown.id, toTown.id],
      isMainRoad: mstEdges.includes(edge),
    });
  }

  console.log(
    `[RoadGen] Generated ${roads.length} roads (${mstEdges.length} MST + ` +
      `${roads.length - mstEdges.length} extra) connecting ${towns.length} towns ` +
      `with ${obstacles.length} structure obstacles`,
  );

  return roads;
}

/**
 * Re-route existing roads without changing topology (which town pairs are connected).
 * Used after a town move: same connections, new A* paths for updated positions.
 * Falls back to full regeneration if any connected town can't be found.
 */
export function rerouteExistingRoads(
  existingRoads: GeneratedRoad[],
  towns: RoadTown[],
  queryBiome: HeightQuerier,
  waterThreshold: number,
  configOverrides?: Partial<RoadGenConfig>,
  obstacles: RoadObstacle[] = [],
): GeneratedRoad[] {
  if (towns.length < 2 || existingRoads.length === 0) {
    return generateRoadNetwork(
      towns,
      queryBiome,
      waterThreshold,
      configOverrides,
      obstacles,
    );
  }

  const config = { ...DEFAULT_CONFIG, ...configOverrides, waterThreshold };
  const halfRoadWidth = config.roadWidth * 0.5;
  const inflatedObstacles = obstacles.map((o) => ({
    ...o,
    radius: o.radius + halfRoadWidth,
  }));

  // Build town lookup by ID
  const townById = new Map<string, RoadTown>();
  for (const t of towns) townById.set(t.id, t);

  const roads: GeneratedRoad[] = [];
  for (const existing of existingRoads) {
    const fromTown = townById.get(existing.connectedTowns[0]);
    const toTown = townById.get(existing.connectedTowns[1]);

    if (!fromTown || !toTown) {
      // Town was removed — skip this road
      console.warn(
        `[RoadGen] Skipping road ${existing.id}: connected town not found`,
      );
      continue;
    }

    const path = generateRoadPath(
      fromTown,
      toTown,
      queryBiome,
      config,
      inflatedObstacles,
    );

    roads.push({
      ...existing,
      path,
    });
  }

  console.log(
    `[RoadGen] Re-routed ${roads.length} existing roads (preserved topology)`,
  );

  return roads;
}
