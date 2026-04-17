/**
 * WorldLayoutService — Generates towns, buildings, and roads using the EXACT game code.
 *
 * Runs the actual TownGenerator from @hyperforge/procgen with the same config,
 * seed, and terrain as the live game's TownSystem. No manifest towns exist
 * (buildings.json is empty), so all towns are procedural.
 *
 * For roads, we use BFS pathfinding on a passability grid matching the game's
 * RoadNetworkSystem algorithm — not the simplified linear interpolation.
 *
 * Results are cached after first generation.
 */

import {
  TownGenerator,
  DEFAULT_LANDMARK_CONFIG,
} from "@hyperforge/procgen/building/town";
import type {
  TerrainProvider,
  GeneratedTown,
  TownBuilding,
} from "@hyperforge/procgen/building/town";
import { NoiseGenerator } from "@hyperforge/procgen/terrain";
import {
  getGameWorldContext,
  GAME_SEED,
  GAME_TILE_SIZE,
  GAME_WORLD_SIZE,
  GAME_WATER_THRESHOLD,
} from "./GameWorldContext";

// ============== GAME DEFAULTS (from TownSystem.ts) ==============
// No world-config.json exists, so all configs use these defaults

const TOWN_DEFAULTS = {
  townCount: 25,
  worldSize: 10000,
  minTownSpacing: 800,
  flatnessSampleRadius: 40,
  flatnessSampleCount: 16,
  waterThreshold: GAME_WATER_THRESHOLD, // 8.0 — TERRAIN_CONSTANTS.WATER_THRESHOLD
  optimalWaterDistanceMin: 30,
  optimalWaterDistanceMax: 150,
};

const TOWN_SIZES = {
  hamlet: { buildingCount: { min: 3, max: 5 }, radius: 25, safeZoneRadius: 40 },
  village: {
    buildingCount: { min: 6, max: 10 },
    radius: 40,
    safeZoneRadius: 60,
  },
  town: { buildingCount: { min: 11, max: 16 }, radius: 60, safeZoneRadius: 80 },
};

const BIOME_SUITABILITY: Record<string, number> = {
  forest: 0.8,
  tundra: 0.4,
  canyon: 0.3,
};

// ============== ROAD DEFAULTS (from RoadNetworkSystem.ts) ==============

const ROAD_DEFAULTS = {
  roadWidth: 6,
  pathStepSize: 20,
  maxPathIterations: 10000,
  extraConnectionsRatio: 0.25,
  costBase: 1.0,
  costSlopeMultiplier: 5.0,
  costWaterPenalty: 1000,
  smoothingIterations: 2,
  noiseDisplacementScale: 0.01,
  noiseDisplacementStrength: 3,
  minPointSpacing: 4,
  heuristicWeight: 2.5,
};

const BIOME_COSTS: Record<string, number> = {
  forest: 1.0,
  tundra: 1.5,
  canyon: 2.0,
};

// ============== TYPES ==============

interface WorldTownData {
  id: string;
  name: string;
  size: string;
  biome: string;
  position: { x: number; y: number; z: number };
  safeZoneRadius: number;
  layoutType: string;
  buildings: Array<{
    id: string;
    type: string;
    position: { x: number; y: number; z: number };
    rotation: number;
    size: { width: number; depth: number };
  }>;
  entryPoints: Array<{
    position: { x: number; z: number };
    angle: number;
  }>;
  internalRoads: Array<{
    start: { x: number; z: number };
    end: { x: number; z: number };
    width: number;
    isMain: boolean;
  }>;
  paths: Array<{
    start: { x: number; z: number };
    end: { x: number; z: number };
    width: number;
  }>;
  landmarks: Array<{
    type: string;
    position: { x: number; y: number; z: number };
    rotation: number;
    size: { width: number; depth: number; height: number };
  }>;
  plaza?: {
    center: { x: number; z: number };
    radius: number;
  };
}

interface WorldRoadData {
  id: string;
  fromTownId: string;
  toTownId: string;
  path: Array<{ x: number; z: number }>;
  width: number;
  isMainRoad: boolean;
}

export interface WorldLayoutResponse {
  towns: WorldTownData[];
  roads: WorldRoadData[];
  seed: number;
  generationTimeMs: number;
}

// ============== BFS ROAD PATHFINDING (from RoadNetworkSystem) ==============

interface PassabilityCell {
  passable: boolean;
  cost: number;
}

function buildPassabilityGrid(
  getHeightAt: (x: number, z: number) => number,
  getDominantBiome: (x: number, z: number) => string,
  worldHalfSize: number,
  stepSize: number,
): { grid: PassabilityCell[][]; gridSize: number } {
  const gridSize = Math.ceil((worldHalfSize * 2) / stepSize);
  const grid: PassabilityCell[][] = [];

  for (let gx = 0; gx < gridSize; gx++) {
    grid[gx] = [];
    const worldX = -worldHalfSize + gx * stepSize;
    for (let gz = 0; gz < gridSize; gz++) {
      const worldZ = -worldHalfSize + gz * stepSize;
      const h = getHeightAt(worldX, worldZ);
      const isWater = h < GAME_WATER_THRESHOLD;

      // Calculate slope by sampling neighboring heights
      const hRight = getHeightAt(worldX + stepSize, worldZ);
      const hDown = getHeightAt(worldX, worldZ + stepSize);
      const slopeX = Math.abs(hRight - h) / stepSize;
      const slopeZ = Math.abs(hDown - h) / stepSize;
      const slope = Math.max(slopeX, slopeZ);

      const biome = getDominantBiome(worldX, worldZ);
      const biomeCost = BIOME_COSTS[biome] ?? 1.0;

      grid[gx][gz] = {
        passable: !isWater,
        cost: isWater
          ? ROAD_DEFAULTS.costWaterPenalty
          : ROAD_DEFAULTS.costBase +
            ROAD_DEFAULTS.costSlopeMultiplier * slope * biomeCost,
      };
    }
  }

  return { grid, gridSize };
}

function worldToGrid(
  wx: number,
  wz: number,
  worldHalfSize: number,
  stepSize: number,
): { gx: number; gz: number } {
  return {
    gx: Math.round((wx + worldHalfSize) / stepSize),
    gz: Math.round((wz + worldHalfSize) / stepSize),
  };
}

function gridToWorld(
  gx: number,
  gz: number,
  worldHalfSize: number,
  stepSize: number,
): { x: number; z: number } {
  return {
    x: -worldHalfSize + gx * stepSize,
    z: -worldHalfSize + gz * stepSize,
  };
}

// 8-directional BFS (matching game's getDirections)
const DIRS_8 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

function findPathBFS(
  grid: PassabilityCell[][],
  gridSize: number,
  startGx: number,
  startGz: number,
  endGx: number,
  endGz: number,
): Array<{ gx: number; gz: number }> | null {
  // A* with the game's heuristic weight
  const hWeight = ROAD_DEFAULTS.heuristicWeight;
  const maxIter = ROAD_DEFAULTS.maxPathIterations;

  const openSet: Array<{
    gx: number;
    gz: number;
    cost: number;
    heuristic: number;
  }> = [];
  const costSoFar = new Map<number, number>();
  const cameFrom = new Map<number, number>();

  const key = (x: number, z: number) => x * gridSize + z;
  const startKey = key(startGx, startGz);
  const endKey = key(endGx, endGz);

  const heuristic = (gx: number, gz: number) => {
    const dx = Math.abs(gx - endGx);
    const dz = Math.abs(gz - endGz);
    return Math.sqrt(dx * dx + dz * dz);
  };

  openSet.push({
    gx: startGx,
    gz: startGz,
    cost: 0,
    heuristic: heuristic(startGx, startGz),
  });
  costSoFar.set(startKey, 0);

  let iterations = 0;
  while (openSet.length > 0 && iterations < maxIter) {
    iterations++;

    // Find lowest f-score
    let bestIdx = 0;
    let bestF = openSet[0].cost + openSet[0].heuristic * hWeight;
    for (let i = 1; i < openSet.length; i++) {
      const f = openSet[i].cost + openSet[i].heuristic * hWeight;
      if (f < bestF) {
        bestF = f;
        bestIdx = i;
      }
    }

    const current = openSet[bestIdx];
    openSet.splice(bestIdx, 1);

    const currentKey = key(current.gx, current.gz);
    if (currentKey === endKey) {
      // Reconstruct path
      const path: Array<{ gx: number; gz: number }> = [];
      let k = endKey;
      while (k !== startKey) {
        const gx = Math.floor(k / gridSize);
        const gz = k % gridSize;
        path.unshift({ gx, gz });
        const prev = cameFrom.get(k);
        if (prev === undefined) break;
        k = prev;
      }
      path.unshift({ gx: startGx, gz: startGz });
      return path;
    }

    for (const [dx, dz] of DIRS_8) {
      const ngx = current.gx + dx;
      const ngz = current.gz + dz;
      if (ngx < 0 || ngx >= gridSize || ngz < 0 || ngz >= gridSize) continue;

      const cell = grid[ngx][ngz];
      const moveCost = cell.cost * (dx !== 0 && dz !== 0 ? 1.414 : 1.0);
      const newCost = current.cost + moveCost;
      const nKey = key(ngx, ngz);

      if (!costSoFar.has(nKey) || newCost < costSoFar.get(nKey)!) {
        costSoFar.set(nKey, newCost);
        cameFrom.set(nKey, currentKey);
        openSet.push({
          gx: ngx,
          gz: ngz,
          cost: newCost,
          heuristic: heuristic(ngx, ngz),
        });
      }
    }
  }

  return null; // No path found
}

function smoothPathChaikin(
  path: Array<{ x: number; z: number }>,
  iterations: number,
): Array<{ x: number; z: number }> {
  if (path.length < 3) return path;
  let result = [...path];

  for (let iter = 0; iter < iterations; iter++) {
    const newPath: Array<{ x: number; z: number }> = [result[0]];
    for (let i = 0; i < result.length - 1; i++) {
      const p0 = result[i];
      const p1 = result[i + 1];
      newPath.push({
        x: 0.75 * p0.x + 0.25 * p1.x,
        z: 0.75 * p0.z + 0.25 * p1.z,
      });
      newPath.push({
        x: 0.25 * p0.x + 0.75 * p1.x,
        z: 0.25 * p0.z + 0.75 * p1.z,
      });
    }
    newPath.push(result[result.length - 1]);
    result = newPath;
  }

  return result;
}

function applyNoiseDisplacement(
  path: Array<{ x: number; z: number }>,
  noise: NoiseGenerator,
  scale: number,
  strength: number,
): Array<{ x: number; z: number }> {
  // Keep first and last point fixed
  return path.map((p, i) => {
    if (i === 0 || i === path.length - 1) return p;
    const nx = noise.simplex2D(p.x * scale, p.z * scale) * strength;
    const nz = noise.simplex2D(p.x * scale + 100, p.z * scale + 100) * strength;
    return { x: p.x + nx, z: p.z + nz };
  });
}

function decimatePath(
  path: Array<{ x: number; z: number }>,
  minSpacing: number,
): Array<{ x: number; z: number }> {
  if (path.length < 3) return path;
  const result = [path[0]];
  const minSpacingSq = minSpacing * minSpacing;

  for (let i = 1; i < path.length - 1; i++) {
    const last = result[result.length - 1];
    const dx = path[i].x - last.x;
    const dz = path[i].z - last.z;
    if (dx * dx + dz * dz >= minSpacingSq) {
      result.push(path[i]);
    }
  }
  result.push(path[path.length - 1]);
  return result;
}

// ============== MST (Kruskal's) ==============

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
    const rx = this.find(x),
      ry = this.find(y);
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

// ============== PUBLIC API ==============

let cachedResult: WorldLayoutResponse | null = null;

export function generateWorldLayout(): WorldLayoutResponse {
  if (cachedResult) return cachedResult;

  const startTime = performance.now();
  const worldCtx = getGameWorldContext();
  const worldHalfSize = (GAME_TILE_SIZE * GAME_WORLD_SIZE) / 2;

  // ---- PHASE 1: Generate towns ----
  // Create terrain provider matching game's TownSystem.initializeTownGenerator()
  const terrainProvider: TerrainProvider = {
    getHeightAt: (x: number, z: number): number => worldCtx.getHeightAt(x, z),
    getBiomeAt: (x: number, z: number): string =>
      worldCtx.getDominantBiome(x, z),
    getWaterThreshold: (): number => TOWN_DEFAULTS.waterThreshold,
  };

  const townGenerator = new TownGenerator({
    seed: GAME_SEED,
    terrain: terrainProvider,
    config: {
      townCount: TOWN_DEFAULTS.townCount,
      worldSize: TOWN_DEFAULTS.worldSize,
      minTownSpacing: TOWN_DEFAULTS.minTownSpacing,
      flatnessSampleRadius: TOWN_DEFAULTS.flatnessSampleRadius,
      flatnessSampleCount: TOWN_DEFAULTS.flatnessSampleCount,
      waterThreshold: TOWN_DEFAULTS.waterThreshold,
      optimalWaterDistanceMin: TOWN_DEFAULTS.optimalWaterDistanceMin,
      optimalWaterDistanceMax: TOWN_DEFAULTS.optimalWaterDistanceMax,
      townSizes: TOWN_SIZES,
      biomeSuitability: BIOME_SUITABILITY,
      landmarks: DEFAULT_LANDMARK_CONFIG,
    },
  });

  // No manifest towns (buildings.json is empty), so generate all procedurally
  const townResult = townGenerator.generate();

  const towns: WorldTownData[] = townResult.towns.map((t: GeneratedTown) => ({
    id: t.id,
    name: t.name,
    size: t.size,
    biome: t.biome,
    position: { x: t.position.x, y: t.position.y, z: t.position.z },
    safeZoneRadius:
      t.safeZoneRadius ??
      (t.size === "town" ? 80 : t.size === "village" ? 60 : 40),
    layoutType: t.layoutType ?? "terminus",
    buildings: (t.buildings ?? []).map((b: TownBuilding) => ({
      id: b.id,
      type: b.type,
      position: { x: b.position.x, y: b.position.y, z: b.position.z },
      rotation: b.rotation,
      size: b.size,
    })),
    entryPoints: (t.entryPoints ?? []).map((ep) => ({
      position: { x: ep.position.x, z: ep.position.z },
      angle: ep.angle,
    })),
    internalRoads: (t.internalRoads ?? []).map((r) => ({
      start: { x: r.start.x, z: r.start.z },
      end: { x: r.end.x, z: r.end.z },
      width: r.isMain ? 8 : 6,
      isMain: r.isMain,
    })),
    paths: (t.paths ?? []).map((p) => ({
      start: { x: p.start.x, z: p.start.z },
      end: { x: p.end.x, z: p.end.z },
      width: p.width || 3,
    })),
    landmarks: (t.landmarks ?? []).map((l) => ({
      type: l.type,
      position: { x: l.position.x, y: l.position.y, z: l.position.z },
      rotation: l.rotation,
      size: { width: l.size.width, depth: l.size.depth, height: l.size.height },
    })),
    plaza: t.plaza
      ? {
          center: { x: t.plaza.center.x, z: t.plaza.center.z },
          radius: t.plaza.radius,
        }
      : undefined,
  }));

  const townGenTime = performance.now() - startTime;
  console.log(
    `[WorldLayoutService] Generated ${towns.length} towns in ${townGenTime.toFixed(0)}ms`,
  );

  // ---- PHASE 2: Generate inter-town roads ----
  const roadStartTime = performance.now();
  const stepSize = ROAD_DEFAULTS.pathStepSize;
  const { grid, gridSize } = buildPassabilityGrid(
    worldCtx.getHeightAt,
    worldCtx.getDominantBiome,
    worldHalfSize,
    stepSize,
  );

  // MST + extra connections (matching game's algorithm)
  const edges: Array<{ from: number; to: number; distance: number }> = [];
  for (let i = 0; i < towns.length; i++) {
    for (let j = i + 1; j < towns.length; j++) {
      const dx = towns[j].position.x - towns[i].position.x;
      const dz = towns[j].position.z - towns[i].position.z;
      edges.push({ from: i, to: j, distance: Math.sqrt(dx * dx + dz * dz) });
    }
  }
  edges.sort((a, b) => a.distance - b.distance);

  const uf = new UnionFind(towns.length);
  const mstEdges: typeof edges = [];
  const nonMstEdges: typeof edges = [];
  for (const edge of edges) {
    if (uf.union(edge.from, edge.to)) mstEdges.push(edge);
    else nonMstEdges.push(edge);
  }
  const extraCount = Math.floor(
    nonMstEdges.length * ROAD_DEFAULTS.extraConnectionsRatio,
  );
  const selectedEdges = [...mstEdges, ...nonMstEdges.slice(0, extraCount)];

  // Noise for road displacement
  const roadNoise = new NoiseGenerator(GAME_SEED + 54321);

  const roads: WorldRoadData[] = [];
  for (let i = 0; i < selectedEdges.length; i++) {
    const edge = selectedEdges[i];
    const fromTown = towns[edge.from];
    const toTown = towns[edge.to];

    // Convert to grid coords for BFS
    const start = worldToGrid(
      fromTown.position.x,
      fromTown.position.z,
      worldHalfSize,
      stepSize,
    );
    const end = worldToGrid(
      toTown.position.x,
      toTown.position.z,
      worldHalfSize,
      stepSize,
    );

    // Clamp to grid bounds
    start.gx = Math.max(0, Math.min(gridSize - 1, start.gx));
    start.gz = Math.max(0, Math.min(gridSize - 1, start.gz));
    end.gx = Math.max(0, Math.min(gridSize - 1, end.gx));
    end.gz = Math.max(0, Math.min(gridSize - 1, end.gz));

    const gridPath = findPathBFS(
      grid,
      gridSize,
      start.gx,
      start.gz,
      end.gx,
      end.gz,
    );
    if (!gridPath) continue;

    // Convert grid path to world coords
    let worldPath = gridPath.map((g) =>
      gridToWorld(g.gx, g.gz, worldHalfSize, stepSize),
    );

    // Apply Chaikin smoothing (matching game's smoothing)
    worldPath = smoothPathChaikin(worldPath, ROAD_DEFAULTS.smoothingIterations);

    // Apply noise displacement for organic feel
    worldPath = applyNoiseDisplacement(
      worldPath,
      roadNoise,
      ROAD_DEFAULTS.noiseDisplacementScale,
      ROAD_DEFAULTS.noiseDisplacementStrength,
    );

    // Decimate to reduce point count
    worldPath = decimatePath(worldPath, ROAD_DEFAULTS.minPointSpacing);

    roads.push({
      id: `road-${i}`,
      fromTownId: fromTown.id,
      toTownId: toTown.id,
      path: worldPath,
      width: ROAD_DEFAULTS.roadWidth,
      isMainRoad: i < mstEdges.length,
    });
  }

  const totalTime = performance.now() - startTime;
  const roadTime = performance.now() - roadStartTime;
  console.log(
    `[WorldLayoutService] Generated ${roads.length} roads in ${roadTime.toFixed(0)}ms`,
  );
  console.log(
    `[WorldLayoutService] Total layout generation: ${totalTime.toFixed(0)}ms`,
  );

  cachedResult = {
    towns,
    roads,
    seed: GAME_SEED,
    generationTimeMs: Math.round(totalTime),
  };

  return cachedResult;
}

export function clearWorldLayoutCache(): void {
  cachedResult = null;
}
