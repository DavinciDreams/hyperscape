/**
 * roadGenerator — Generate terrain-aware road network between towns
 *
 * Uses Kruskal's MST + extra connections for redundancy.
 * Road paths avoid water and follow terrain height.
 * Adapted from WorldTab.tsx to use queryBiome() instead of TerrainGenerator.
 */

import type { GeneratedRoad } from "../../WorldBuilder/types";

// ============== TYPES ==============

interface RoadTown {
  id: string;
  name: string;
  position: { x: number; y: number; z: number };
}

interface RoadGenConfig {
  roadWidth: number;
  /** Fraction of non-MST edges to add (0.3 = 30%) */
  extraConnectionsRatio: number;
  waterThreshold: number;
  /** Distance between path sample points */
  pathStepSize: number;
  /** Number of Laplacian smoothing passes */
  smoothingIterations: number;
}

type HeightQuerier = (
  x: number,
  z: number,
) => { biome: string; height: number };

// ============== UNION-FIND ==============

class UnionFind {
  private parent: number[];
  private rank: number[];

  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, i) => i);
    this.rank = new Array(size).fill(0);
  }

  find(x: number): number {
    if (this.parent[x] !== x) {
      this.parent[x] = this.find(this.parent[x]);
    }
    return this.parent[x];
  }

  union(x: number, y: number): boolean {
    const rootX = this.find(x);
    const rootY = this.find(y);
    if (rootX === rootY) return false;
    if (this.rank[rootX] < this.rank[rootY]) {
      this.parent[rootX] = rootY;
    } else if (this.rank[rootX] > this.rank[rootY]) {
      this.parent[rootY] = rootX;
    } else {
      this.parent[rootY] = rootX;
      this.rank[rootX]++;
    }
    return true;
  }
}

// ============== PATH GENERATION ==============

function generateRoadPath(
  from: { x: number; y: number; z: number },
  to: { x: number; y: number; z: number },
  queryBiome: HeightQuerier,
  waterThreshold: number,
  pathStepSize: number,
  smoothingIterations: number,
): Array<{ x: number; y: number; z: number }> {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const totalDistance = Math.sqrt(dx * dx + dz * dz);
  const numSamples = Math.max(2, Math.ceil(totalDistance / pathStepSize));

  const path: Array<{ x: number; y: number; z: number }> = [];

  for (let i = 0; i <= numSamples; i++) {
    const t = i / numSamples;
    let x = from.x + dx * t;
    let z = from.z + dz * t;
    let y = queryBiome(x, z).height;

    // If underwater, search nearby for higher ground
    if (y < waterThreshold) {
      const searchRadius = pathStepSize * 2;
      const diag = pathStepSize * 1.5;
      const offsets = [
        [searchRadius, 0],
        [-searchRadius, 0],
        [0, searchRadius],
        [0, -searchRadius],
        [diag, diag],
        [-diag, diag],
        [diag, -diag],
        [-diag, -diag],
      ];

      let bestHeight = y;
      let bestX = x;
      let bestZ = z;

      for (const [ox, oz] of offsets) {
        const h = queryBiome(x + ox, z + oz).height;
        if (h > bestHeight && h >= waterThreshold) {
          bestHeight = h;
          bestX = x + ox;
          bestZ = z + oz;
        }
      }

      x = bestX;
      z = bestZ;
      y = bestHeight;
    }

    // Road surface slightly above terrain
    y = Math.max(y, waterThreshold) + 0.1;
    path.push({ x, y, z });
  }

  return smoothPath(path, smoothingIterations);
}

function smoothPath(
  path: Array<{ x: number; y: number; z: number }>,
  iterations: number,
): Array<{ x: number; y: number; z: number }> {
  if (path.length < 3) return path;

  let result = [...path];
  for (let iter = 0; iter < iterations; iter++) {
    const newPath = [result[0]];
    for (let i = 1; i < result.length - 1; i++) {
      const prev = result[i - 1];
      const curr = result[i];
      const next = result[i + 1];
      newPath.push({
        x: (prev.x + curr.x * 2 + next.x) / 4,
        y: (prev.y + curr.y * 2 + next.y) / 4,
        z: (prev.z + curr.z * 2 + next.z) / 4,
      });
    }
    newPath.push(result[result.length - 1]);
    result = newPath;
  }
  return result;
}

// ============== ROAD NETWORK ==============

const DEFAULT_ROAD_CONFIG: RoadGenConfig = {
  roadWidth: 6,
  extraConnectionsRatio: 0.3,
  waterThreshold: 0,
  pathStepSize: 20,
  smoothingIterations: 3,
};

export function generateRoadNetwork(
  towns: RoadTown[],
  queryBiome: HeightQuerier,
  waterThreshold: number,
  configOverrides?: Partial<RoadGenConfig>,
): GeneratedRoad[] {
  if (towns.length < 2) return [];

  const config = { ...DEFAULT_ROAD_CONFIG, ...configOverrides, waterThreshold };

  // Pairwise distances
  const edges: Array<{ from: number; to: number; distance: number }> = [];
  for (let i = 0; i < towns.length; i++) {
    for (let j = i + 1; j < towns.length; j++) {
      const dx = towns[j].position.x - towns[i].position.x;
      const dz = towns[j].position.z - towns[i].position.z;
      edges.push({ from: i, to: j, distance: Math.sqrt(dx * dx + dz * dz) });
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

  // Add extra connections for redundancy
  const extraCount = Math.floor(
    nonMstEdges.length * config.extraConnectionsRatio,
  );
  const selectedEdges = [...mstEdges, ...nonMstEdges.slice(0, extraCount)];

  const roads: GeneratedRoad[] = [];
  for (let i = 0; i < selectedEdges.length; i++) {
    const edge = selectedEdges[i];
    const fromTown = towns[edge.from];
    const toTown = towns[edge.to];

    const path = generateRoadPath(
      fromTown.position,
      toTown.position,
      queryBiome,
      config.waterThreshold,
      config.pathStepSize,
      config.smoothingIterations,
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
    `[RoadGen] Generated ${roads.length} roads (${mstEdges.length} MST + ${roads.length - mstEdges.length} extra) connecting ${towns.length} towns`,
  );

  return roads;
}
