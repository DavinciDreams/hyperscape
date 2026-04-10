/**
 * Shared pure functions for road influence and road height blending.
 *
 * Used by World Studio (TileBasedTerrain.tsx), TerrainSystem, and RoadNetworkSystem.
 * All three use the same point-to-segment distance + smoothstep formula.
 */

export const ROAD_BLEND_WIDTH = 2;
export const ROAD_MINIMUM_WIDTH = 6;

/**
 * Minimal road path interface — any object with a path array and width works.
 * Covers GeneratedRoad (asset-forge), Road (RoadNetworkSystem), etc.
 */
export interface RoadPathLike {
  path: ReadonlyArray<{ x: number; y?: number; z: number }>;
  width: number;
}

/**
 * Calculate road influence (0-1) at a world position.
 * 1 = center of road, 0 = no road influence.
 * Uses smoothstep falloff at the road edges.
 */
export function calculateRoadInfluence(
  worldX: number,
  worldZ: number,
  roads: ReadonlyArray<RoadPathLike>,
  blendWidth: number = ROAD_BLEND_WIDTH,
  minimumWidth: number = ROAD_MINIMUM_WIDTH,
): number {
  if (roads.length === 0) return 0;

  let minDistance = Infinity;
  let closestRoadWidth = minimumWidth;

  for (const road of roads) {
    if (road.path.length < 2) continue;
    const effectiveWidth = Math.max(road.width, minimumWidth);

    for (let i = 0; i < road.path.length - 1; i++) {
      const p1 = road.path[i];
      const p2 = road.path[i + 1];
      const dx = p2.x - p1.x;
      const dz = p2.z - p1.z;
      const lenSq = dx * dx + dz * dz;
      if (lenSq === 0) continue;

      let t = ((worldX - p1.x) * dx + (worldZ - p1.z) * dz) / lenSq;
      t = Math.max(0, Math.min(1, t));
      const cx = p1.x + t * dx;
      const cz = p1.z + t * dz;
      const ddx = worldX - cx;
      const ddz = worldZ - cz;
      const dist = Math.sqrt(ddx * ddx + ddz * ddz);

      if (dist < minDistance) {
        minDistance = dist;
        closestRoadWidth = effectiveWidth;
      }
    }
  }

  const halfWidth = closestRoadWidth / 2;
  const totalWidth = halfWidth + blendWidth;
  if (minDistance >= totalWidth) return 0;
  if (minDistance <= halfWidth) return 1.0;

  const f = 1.0 - (minDistance - halfWidth) / blendWidth;
  return f * f * (3 - 2 * f); // smoothstep
}

/**
 * Calculate the interpolated road path height at a world point.
 * Finds the closest road segment and lerps the Y between its endpoints.
 * Returns { height, influence } or null if no road is close enough.
 */
export function getRoadHeightAtPoint(
  worldX: number,
  worldZ: number,
  roads: ReadonlyArray<RoadPathLike>,
  blendWidth: number = ROAD_BLEND_WIDTH,
  minimumWidth: number = ROAD_MINIMUM_WIDTH,
): { height: number; influence: number } | null {
  let minDist = Infinity;
  let bestHeight = 0;
  let closestWidth = minimumWidth;

  for (const road of roads) {
    if (road.path.length < 2) continue;
    const effectiveWidth = Math.max(road.width, minimumWidth);

    for (let i = 0; i < road.path.length - 1; i++) {
      const p1 = road.path[i];
      const p2 = road.path[i + 1];
      const dx = p2.x - p1.x;
      const dz = p2.z - p1.z;
      const lenSq = dx * dx + dz * dz;
      if (lenSq === 0) continue;

      let t = ((worldX - p1.x) * dx + (worldZ - p1.z) * dz) / lenSq;
      t = Math.max(0, Math.min(1, t));
      const cx = p1.x + t * dx;
      const cz = p1.z + t * dz;
      const ddx = worldX - cx;
      const ddz = worldZ - cz;
      const dist = Math.sqrt(ddx * ddx + ddz * ddz);

      if (dist < minDist) {
        minDist = dist;
        const y1 = p1.y ?? 0;
        const y2 = p2.y ?? 0;
        bestHeight = y1 + t * (y2 - y1);
        closestWidth = effectiveWidth;
      }
    }
  }

  const halfWidth = closestWidth / 2;
  const totalWidth = halfWidth + blendWidth;
  if (minDist >= totalWidth) return null;

  if (minDist <= halfWidth) return { height: bestHeight, influence: 1.0 };
  const f = 1.0 - (minDist - halfWidth) / blendWidth;
  const influence = f * f * (3 - 2 * f); // smoothstep
  return { height: bestHeight, influence };
}

/**
 * Combined function: returns BOTH road height+influence AND road influence in a single pass.
 * Eliminates the double road traversal per vertex in generateTileGeometry.
 *
 * Returns { height, heightInfluence, influence } where:
 * - height/heightInfluence: same as getRoadHeightAtPoint (for terrain flattening)
 * - influence: same as calculateRoadInfluence (for shader attribute)
 */
export function getRoadHeightAndInfluence(
  worldX: number,
  worldZ: number,
  roads: ReadonlyArray<RoadPathLike>,
  blendWidth: number = ROAD_BLEND_WIDTH,
  minimumWidth: number = ROAD_MINIMUM_WIDTH,
): { height: number; heightInfluence: number; influence: number } {
  let minDistSq = Infinity;
  let minDist = Infinity;
  let bestHeight = 0;
  let closestWidth = minimumWidth;

  for (const road of roads) {
    if (road.path.length < 2) continue;
    const effectiveWidth = Math.max(road.width, minimumWidth);

    for (let i = 0; i < road.path.length - 1; i++) {
      const p1 = road.path[i];
      const p2 = road.path[i + 1];
      const dx = p2.x - p1.x;
      const dz = p2.z - p1.z;
      const lenSq = dx * dx + dz * dz;
      if (lenSq === 0) continue;

      let t = ((worldX - p1.x) * dx + (worldZ - p1.z) * dz) / lenSq;
      t = Math.max(0, Math.min(1, t));
      const cx = p1.x + t * dx;
      const cz = p1.z + t * dz;
      const ddx = worldX - cx;
      const ddz = worldZ - cz;
      const distSq = ddx * ddx + ddz * ddz;

      if (distSq < minDistSq) {
        minDistSq = distSq;
        const y1 = p1.y ?? 0;
        const y2 = p2.y ?? 0;
        bestHeight = y1 + t * (y2 - y1);
        closestWidth = effectiveWidth;
      }
    }
  }

  // Only compute sqrt once for the winning segment
  minDist = Math.sqrt(minDistSq);

  const halfWidth = closestWidth / 2;
  const totalWidth = halfWidth + blendWidth;

  if (minDist >= totalWidth) {
    return { height: 0, heightInfluence: 0, influence: 0 };
  }

  if (minDist <= halfWidth) {
    return { height: bestHeight, heightInfluence: 1.0, influence: 1.0 };
  }

  const f = 1.0 - (minDist - halfWidth) / blendWidth;
  const smoothed = f * f * (3 - 2 * f); // smoothstep
  return { height: bestHeight, heightInfluence: smoothed, influence: smoothed };
}

/**
 * Pre-computed bounding box for a road path, used for spatial pre-filtering.
 */
export interface RoadBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * Compute the axis-aligned bounding box of a road path, expanded by the road width + blend margin.
 */
export function computeRoadBounds(
  road: RoadPathLike,
  blendWidth: number = ROAD_BLEND_WIDTH,
  minimumWidth: number = ROAD_MINIMUM_WIDTH,
): RoadBounds {
  let minX = Infinity,
    maxX = -Infinity;
  let minZ = Infinity,
    maxZ = -Infinity;
  for (const p of road.path) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  const margin = Math.max(road.width, minimumWidth) / 2 + blendWidth;
  return {
    minX: minX - margin,
    maxX: maxX + margin,
    minZ: minZ - margin,
    maxZ: maxZ + margin,
  };
}
