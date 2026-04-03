/**
 * roadGeneration — Pure logic for procedural road networks
 *
 * Extracted from RoadNetworkSystem so the editor can generate roads
 * without instantiating a full ECS World. Includes:
 * - Prim's MST for minimum spanning tree
 * - BFS pathfinding with water avoidance
 * - Chaikin smoothing with noise displacement
 * - Direct-path fallback
 *
 * All terrain queries go through callback interfaces,
 * not through ECS system references.
 */

import type { RoadPathPoint } from "../../types/world/world-types";
import { dist2D } from "../MathUtils";

// ============== TYPES ==============

/** Terrain query callbacks for road generation */
export interface RoadTerrainQuerier {
  getHeight(x: number, z: number): number;
  getBiome?(x: number, z: number): string;
  isWater(x: number, z: number): boolean;
}

/** Town-like endpoint for road generation */
export interface RoadEndpoint {
  id: string;
  position: { x: number; z: number };
}

/** Edge in the town graph */
export interface GraphEdge {
  fromId: string;
  toId: string;
  distance: number;
}

/** Road generation config (mirrors RoadConfig from RoadNetworkSystem) */
export interface RoadGenConfig {
  pathStepSize: number;
  maxPathIterations: number;
  smoothingIterations: number;
  noiseDisplacementScale: number;
  noiseDisplacementStrength: number;
  minPointSpacing: number;
  extraConnectionsRatio: number;
  biomeCosts?: Record<string, number>;
}

/** Generated road result */
export interface GeneratedRoad {
  fromId: string;
  toId: string;
  path: RoadPathPoint[];
}

/** Simple BFS node */
interface BFSNode {
  x: number;
  z: number;
  parent: BFSNode | null;
}

/** Simple seeded noise function type */
type Noise2D = (x: number, z: number) => number;

// ============== DEFAULT CONFIG ==============

export const DEFAULT_ROAD_CONFIG: RoadGenConfig = {
  pathStepSize: 20,
  maxPathIterations: 10000,
  smoothingIterations: 2,
  noiseDisplacementScale: 0.01,
  noiseDisplacementStrength: 3,
  minPointSpacing: 4,
  extraConnectionsRatio: 0.25,
};

// ============== MST ==============

/** Build all pairwise edges between endpoints */
export function buildEdges(endpoints: RoadEndpoint[]): GraphEdge[] {
  const edges: GraphEdge[] = [];
  for (let i = 0; i < endpoints.length; i++) {
    for (let j = i + 1; j < endpoints.length; j++) {
      edges.push({
        fromId: endpoints[i].id,
        toId: endpoints[j].id,
        distance: dist2D(
          endpoints[i].position.x,
          endpoints[i].position.z,
          endpoints[j].position.x,
          endpoints[j].position.z,
        ),
      });
    }
  }
  return edges;
}

/** Prim's algorithm for minimum spanning tree */
export function buildMST(
  endpoints: RoadEndpoint[],
  edges: GraphEdge[],
): GraphEdge[] {
  if (endpoints.length === 0) return [];

  const mstEdges: GraphEdge[] = [];
  const inMST = new Set<string>([endpoints[0].id]);

  while (inMST.size < endpoints.length) {
    let minEdge: GraphEdge | null = null;
    let minDistance = Infinity;

    for (const edge of edges) {
      const fromInMST = inMST.has(edge.fromId);
      const toInMST = inMST.has(edge.toId);
      if (fromInMST !== toInMST && edge.distance < minDistance) {
        minDistance = edge.distance;
        minEdge = edge;
      }
    }

    if (minEdge) {
      mstEdges.push(minEdge);
      inMST.add(minEdge.fromId);
      inMST.add(minEdge.toId);
    } else {
      break; // disconnected graph
    }
  }

  return mstEdges;
}

/** Select additional edges beyond MST for redundancy */
export function selectExtraEdges(
  allEdges: GraphEdge[],
  mstEdges: GraphEdge[],
  ratio: number,
): GraphEdge[] {
  const mstEdgeSet = new Set<string>();
  for (const edge of mstEdges) {
    mstEdgeSet.add(`${edge.fromId}-${edge.toId}`);
    mstEdgeSet.add(`${edge.toId}-${edge.fromId}`);
  }

  const candidates = allEdges
    .filter(
      (e) =>
        !mstEdgeSet.has(`${e.fromId}-${e.toId}`) &&
        !mstEdgeSet.has(`${e.toId}-${e.fromId}`),
    )
    .sort((a, b) => a.distance - b.distance);

  const extraCount = Math.max(1, Math.floor(mstEdges.length * ratio));
  return candidates.slice(0, extraCount);
}

// ============== PATHFINDING ==============

/** 8-directional neighbors for BFS */
function getDirections(stepSize: number): Array<{ dx: number; dz: number }> {
  return [
    { dx: stepSize, dz: 0 },
    { dx: -stepSize, dz: 0 },
    { dx: 0, dz: stepSize },
    { dx: 0, dz: -stepSize },
    { dx: stepSize, dz: stepSize },
    { dx: stepSize, dz: -stepSize },
    { dx: -stepSize, dz: stepSize },
    { dx: -stepSize, dz: -stepSize },
  ];
}

/** Reconstruct path from BFS goal node back to start */
function reconstructBFSPath(
  goalNode: BFSNode,
  endX: number,
  endZ: number,
  terrain: RoadTerrainQuerier,
): RoadPathPoint[] {
  const path: RoadPathPoint[] = [];
  let current: BFSNode | null = goalNode;
  while (current) {
    path.push({
      x: current.x,
      z: current.z,
      y: terrain.getHeight(current.x, current.z),
    });
    current = current.parent;
  }
  path.reverse();
  // Snap final point to exact end
  path[path.length - 1] = {
    x: endX,
    z: endZ,
    y: terrain.getHeight(endX, endZ),
  };
  return path;
}

/** Generate a straight-line fallback path */
export function generateDirectPath(
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
  stepSize: number,
  terrain: RoadTerrainQuerier,
): RoadPathPoint[] {
  const path: RoadPathPoint[] = [];
  const dx = endX - startX;
  const dz = endZ - startZ;
  const steps = Math.ceil(Math.sqrt(dx * dx + dz * dz) / stepSize);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = startX + dx * t;
    const z = startZ + dz * t;
    path.push({ x, z, y: terrain.getHeight(x, z) });
  }
  return path;
}

/**
 * BFS pathfinding between two points, avoiding water.
 * Falls back to direct path if no route found.
 */
export function findPath(
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
  config: RoadGenConfig,
  terrain: RoadTerrainQuerier,
): RoadPathPoint[] {
  const { pathStepSize, maxPathIterations } = config;
  const gridStartX = Math.round(startX / pathStepSize) * pathStepSize;
  const gridStartZ = Math.round(startZ / pathStepSize) * pathStepSize;
  const gridEndX = Math.round(endX / pathStepSize) * pathStepSize;
  const gridEndZ = Math.round(endZ / pathStepSize) * pathStepSize;

  const directions = getDirections(pathStepSize);
  const queue: BFSNode[] = [];
  const visited = new Set<string>();

  queue.push({ x: gridStartX, z: gridStartZ, parent: null });
  visited.add(`${gridStartX},${gridStartZ}`);

  let iterations = 0;
  let queueIdx = 0; // O(1) dequeue via index pointer

  while (queueIdx < queue.length && iterations < maxPathIterations) {
    iterations++;
    const current = queue[queueIdx++];

    // Check if we reached the goal
    if (
      Math.abs(current.x - gridEndX) <= pathStepSize &&
      Math.abs(current.z - gridEndZ) <= pathStepSize
    ) {
      return reconstructBFSPath(current, endX, endZ, terrain);
    }

    // Explore neighbors
    for (const dir of directions) {
      const nx = current.x + dir.dx;
      const nz = current.z + dir.dz;
      const key = `${nx},${nz}`;

      if (visited.has(key)) continue;
      if (terrain.isWater(nx, nz)) continue;

      visited.add(key);
      queue.push({ x: nx, z: nz, parent: current });
    }
  }

  // Fallback: direct path
  return generateDirectPath(startX, startZ, endX, endZ, pathStepSize, terrain);
}

// ============== SMOOTHING ==============

/**
 * Chaikin smoothing + noise displacement on a raw path.
 * Produces organic, natural-looking road curves.
 */
export function smoothPath(
  rawPath: RoadPathPoint[],
  config: RoadGenConfig,
  terrain: RoadTerrainQuerier,
  noise2D?: Noise2D,
): RoadPathPoint[] {
  if (rawPath.length < 3) return rawPath;

  const {
    smoothingIterations,
    noiseDisplacementScale,
    noiseDisplacementStrength,
    minPointSpacing,
  } = config;

  // Chaikin subdivision
  let smoothed = [...rawPath];
  for (let iter = 0; iter < smoothingIterations; iter++) {
    const newPath: RoadPathPoint[] = [smoothed[0]];
    for (let i = 0; i < smoothed.length - 1; i++) {
      const p0 = smoothed[i];
      const p1 = smoothed[i + 1];
      const q: RoadPathPoint = {
        x: p0.x * 0.75 + p1.x * 0.25,
        z: p0.z * 0.75 + p1.z * 0.25,
        y: 0,
      };
      const r: RoadPathPoint = {
        x: p0.x * 0.25 + p1.x * 0.75,
        z: p0.z * 0.25 + p1.z * 0.75,
        y: 0,
      };
      q.y = terrain.getHeight(q.x, q.z);
      r.y = terrain.getHeight(r.x, r.z);
      newPath.push(q, r);
    }
    newPath.push(smoothed[smoothed.length - 1]);
    smoothed = newPath;
  }

  // Noise displacement (skip if no noise function provided)
  if (!noise2D) {
    return filterMinSpacing(smoothed, minPointSpacing);
  }

  const displaced: RoadPathPoint[] = [smoothed[0]];
  for (let i = 1; i < smoothed.length - 1; i++) {
    const point = smoothed[i];
    const prev = smoothed[i - 1];
    const next = smoothed[i + 1];
    const dirX = next.x - prev.x;
    const dirZ = next.z - prev.z;
    const length = dist2D(0, 0, dirX, dirZ);

    if (length > 0.001) {
      const perpX = -dirZ / length;
      const perpZ = dirX / length;
      const displacement =
        noise2D(
          point.x * noiseDisplacementScale,
          point.z * noiseDisplacementScale,
        ) * noiseDisplacementStrength;
      const newX = point.x + perpX * displacement;
      const newZ = point.z + perpZ * displacement;
      const newY = terrain.getHeight(newX, newZ);
      // Keep original point if displaced into water
      displaced.push(
        !terrain.isWater(newX, newZ) ? { x: newX, z: newZ, y: newY } : point,
      );
    } else {
      displaced.push(point);
    }
  }
  displaced.push(smoothed[smoothed.length - 1]);

  return filterMinSpacing(displaced, minPointSpacing);
}

/** Remove points that are closer than minSpacing (keep first and last) */
function filterMinSpacing(
  path: RoadPathPoint[],
  minSpacing: number,
): RoadPathPoint[] {
  if (path.length < 2) return path;
  const result: RoadPathPoint[] = [path[0]];
  for (let i = 1; i < path.length; i++) {
    const last = result[result.length - 1];
    if (
      i === path.length - 1 ||
      dist2D(path[i].x, path[i].z, last.x, last.z) >= minSpacing
    ) {
      result.push(path[i]);
    }
  }
  return result;
}

// ============== FULL PIPELINE ==============

/**
 * Generate a road network connecting the given endpoints.
 *
 * 1. Build MST (+ optional extra edges) to decide which pairs to connect
 * 2. BFS pathfind each connection (avoids water)
 * 3. Smooth paths with Chaikin + noise displacement
 *
 * Returns array of roads with their smoothed paths.
 */
export function generateRoads(
  endpoints: RoadEndpoint[],
  terrain: RoadTerrainQuerier,
  config: Partial<RoadGenConfig> = {},
  noise2D?: Noise2D,
): GeneratedRoad[] {
  if (endpoints.length < 2) return [];

  const cfg: RoadGenConfig = { ...DEFAULT_ROAD_CONFIG, ...config };
  const edges = buildEdges(endpoints);
  const mstEdges = buildMST(endpoints, edges);
  const extraEdges = selectExtraEdges(
    edges,
    mstEdges,
    cfg.extraConnectionsRatio,
  );
  const allConnections = [...mstEdges, ...extraEdges];

  const endpointMap = new Map(endpoints.map((e) => [e.id, e]));
  const roads: GeneratedRoad[] = [];

  for (const edge of allConnections) {
    const from = endpointMap.get(edge.fromId);
    const to = endpointMap.get(edge.toId);
    if (!from || !to) continue;

    const rawPath = findPath(
      from.position.x,
      from.position.z,
      to.position.x,
      to.position.z,
      cfg,
      terrain,
    );

    const smoothedPath = smoothPath(rawPath, cfg, terrain, noise2D);

    roads.push({
      fromId: edge.fromId,
      toId: edge.toId,
      path: smoothedPath,
    });
  }

  return roads;
}
