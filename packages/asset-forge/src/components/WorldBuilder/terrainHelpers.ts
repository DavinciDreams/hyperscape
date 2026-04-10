/**
 * Terrain helper functions extracted from TileBasedTerrain.tsx.
 *
 * Pure geometry/material creation and tile generation utilities
 * used by the tile-based terrain viewer.
 */

import {
  createTerrainMaterial as createGameTerrainMaterial,
  type TerrainUniforms,
} from "@hyperscape/procgen/terrain";
import {
  calculateRoadInfluence,
  getRoadHeightAtPoint,
  getRoadHeightAndInfluence,
  computeRoadBounds,
  ROAD_BLEND_WIDTH,
  ROAD_MINIMUM_WIDTH,
  type RoadPathLike,
  type RoadBounds,
  calculateMineInfluenceAtPoint,
  getMineEffectiveRadius,
} from "@hyperscape/shared/world";
import { MeshStandardNodeMaterial } from "three/webgpu";

import { THREE } from "@/utils/webgpu-renderer";
import type { GeneratedRoad } from "./types";

// ============== TYPES ==============

/** Generic terrain query interface — satisfied by both procgen TerrainGenerator and GameTerrainAdapter */
export interface TerrainQueryResult {
  height: number;
  biome: string;
  color?: { r: number; g: number; b: number };
  /** Forest biome weight 0-1 for per-biome shader blending */
  biomeForestWeight?: number;
  /** Canyon biome weight 0-1 for per-biome shader blending */
  biomeCanyonWeight?: number;
}
export type TerrainQuerier = (
  worldX: number,
  worldZ: number,
) => TerrainQueryResult;

// Mine area type alias for backwards compatibility with prop types
export type MineAreaData = import("@hyperscape/shared/world").MineArea;

/** Town flatten data passed into tile generation */
export interface TownFlattenZone {
  /** Game-space X */
  x: number;
  /** Game-space Z */
  z: number;
  /** Terrain height at town center */
  centerHeight: number;
  /** Radius of fully-flat inner zone (buildings sit here) */
  innerRadius: number;
  /** Radius of outer blend zone (smooth ramp back to natural terrain) */
  outerRadius: number;
}

// ============== CONSTANTS ==============

// Biome colors matching the game's BIOMES data
export const BIOME_COLORS: Record<string, { r: number; g: number; b: number }> =
  {
    plains: { r: 0.486, g: 0.729, b: 0.373 },
    forest: { r: 0.227, g: 0.42, b: 0.208 },
    valley: { r: 0.353, g: 0.541, b: 0.31 },
    desert: { r: 0.769, g: 0.639, b: 0.353 },
    tundra: { r: 0.722, g: 0.784, b: 0.784 },
    swamp: { r: 0.29, g: 0.353, b: 0.227 },
    mountains: { r: 0.541, g: 0.541, b: 0.541 },
    lakes: { r: 0.29, g: 0.478, b: 0.722 },
    canyon: { r: 0.553, g: 0.431, b: 0.388 },
  };

// Shoreline tint color (sandy brown)
const SHORELINE_COLOR = { r: 0.545, g: 0.451, b: 0.333 };

// Water colors
const WATER_COLOR = 0x2a5599;
const WATER_OPACITY = 0.75;

// Road colors matching the game's terrain shader (compacted dirt with gravel)
const ROAD_CENTER_COLOR = new THREE.Color(0.4, 0.333, 0.267); // #665544 — compacted dirt
const ROAD_EDGE_COLOR = new THREE.Color(0.349, 0.29, 0.239); // #594a3d — road edge
const ROAD_MAIN_COLOR = new THREE.Color(0.32, 0.24, 0.18); // Darker main roads

// Biome name to ID mapping (matching game's shader expectations) — hoisted to module scope
const BIOME_NAME_TO_ID: Record<string, number> = {
  plains: 0,
  forest: 1,
  valley: 2,
  desert: 3,
  tundra: 4,
  swamp: 5,
  mountains: 6,
  lakes: 7,
  canyon: 8,
};

// ============== HELPER FUNCTIONS ==============

/**
 * Create template geometry for tiles (cloned for each tile)
 */
export function createTemplateGeometry(
  tileSize: number,
  resolution: number,
): THREE.PlaneGeometry {
  const geometry = new THREE.PlaneGeometry(
    tileSize,
    tileSize,
    resolution - 1,
    resolution - 1,
  );
  geometry.rotateX(-Math.PI / 2);
  // Center at origin - tiles will be positioned by their mesh
  geometry.translate(tileSize / 2, 0, tileSize / 2);
  return geometry;
}

/**
 * Create terrain material using the game's terrain shader.
 * This ensures Asset Forge renders terrain identically to the game,
 * including road influence blending via the roadInfluence vertex attribute.
 *
 * No fallback - the game shader must load for correct road rendering.
 */
export function createTerrainMaterial(): THREE.Material & {
  terrainUniforms: TerrainUniforms;
} {
  // Use the game's terrain shader for unified rendering.
  // Disable fog — the World Studio camera is at altitude 200m+
  // where the game's 150-350m fog range makes everything invisible.
  const material = createGameTerrainMaterial({
    fogEnabled: false,
    fogNear: 5000,
    fogFar: 10000,
  });
  console.log(
    "[TileBasedTerrain] Created terrain material (fog disabled for World Studio)",
  );
  return material;
}

/**
 * Clip a road path so it stops at town safe zone boundaries instead of
 * going through town centers. Inter-town roads connect edge-to-edge,
 * and internal town streets handle the interior.
 *
 * Uses the town's innerRadius (safeZoneRadius * 0.85) as the clip boundary
 * to match the flat terrain zone.
 */
export function clipRoadPathAtTowns<T extends { x: number; z: number }>(
  path: T[],
  connectedTowns: [string, string],
  runtimeTowns: Array<{
    id: string;
    position: { x: number; z: number };
    safeZoneRadius: number;
  }>,
): T[] {
  if (path.length < 2) return path;

  const townA = runtimeTowns.find((t) => t.id === connectedTowns[0]);
  const townB = runtimeTowns.find((t) => t.id === connectedTowns[1]);

  let startIdx = 0;
  let endIdx = path.length - 1;

  // Clip from start: skip points inside Town A
  if (townA) {
    const clipR = townA.safeZoneRadius * 0.85;
    const clipRSq = clipR * clipR;
    for (let i = 0; i < path.length - 1; i++) {
      const dx = path[i].x - townA.position.x;
      const dz = path[i].z - townA.position.z;
      if (dx * dx + dz * dz < clipRSq) {
        startIdx = i + 1;
      } else {
        break;
      }
    }
  }

  // Clip from end: skip points inside Town B
  if (townB) {
    const clipR = townB.safeZoneRadius * 0.85;
    const clipRSq = clipR * clipR;
    for (let i = path.length - 1; i > startIdx; i--) {
      const dx = path[i].x - townB.position.x;
      const dz = path[i].z - townB.position.z;
      if (dx * dx + dz * dz < clipRSq) {
        endIdx = i - 1;
      } else {
        break;
      }
    }
  }

  if (endIdx <= startIdx) return path.slice(0, 2); // Degenerate: towns overlap

  return path.slice(startIdx, endIdx + 1);
}

// Road influence and height blending — delegated to shared pure functions
// from @hyperscape/shared/world (imported at top of file).

/**
 * Thin wrapper — adapts GeneratedRoad[] to the shared calculateRoadInfluence().
 */
export function calculateRoadInfluenceAtPoint(
  worldX: number,
  worldZ: number,
  roads: GeneratedRoad[] | undefined,
): number {
  if (!roads || roads.length === 0) return 0;
  return calculateRoadInfluence(
    worldX,
    worldZ,
    roads as ReadonlyArray<RoadPathLike>,
    ROAD_BLEND_WIDTH,
    ROAD_MINIMUM_WIDTH,
  );
}

/**
 * Create flat ribbon geometry for a road path that hugs the terrain surface.
 * Matches the game's flat dirt-path look instead of cylindrical tubes.
 *
 * Generates a triangle strip: for each path point, two vertices are placed
 * perpendicular to the path direction at ±halfWidth. Vertex colors blend
 * from center (road color) to edge (road edge color) for the soft-edge look.
 */
export function createRoadRibbonGeometry(
  pathPoints: THREE.Vector3[],
  halfWidth: number,
  isMainRoad: boolean,
): THREE.BufferGeometry {
  if (pathPoints.length < 2) return new THREE.BufferGeometry();

  const vertCount = pathPoints.length * 2;
  const positions = new Float32Array(vertCount * 3);
  const colors = new Float32Array(vertCount * 3);
  const indices: number[] = [];

  const centerColor = isMainRoad ? ROAD_MAIN_COLOR : ROAD_CENTER_COLOR;
  const edgeColor = ROAD_EDGE_COLOR;

  // Temporary vectors
  const tangent = new THREE.Vector3();
  const perp = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  for (let i = 0; i < pathPoints.length; i++) {
    const p = pathPoints[i];

    // Calculate tangent direction (forward along path)
    if (i < pathPoints.length - 1) {
      tangent.subVectors(pathPoints[i + 1], p).normalize();
    }
    // else keep previous tangent for the last point

    // Perpendicular in the XZ plane (cross tangent with up)
    perp.crossVectors(tangent, up).normalize();

    // Left and right vertices
    const li = i * 2; // left vertex index
    const ri = i * 2 + 1; // right vertex index

    positions[li * 3] = p.x - perp.x * halfWidth;
    positions[li * 3 + 1] = p.y;
    positions[li * 3 + 2] = p.z - perp.z * halfWidth;

    positions[ri * 3] = p.x + perp.x * halfWidth;
    positions[ri * 3 + 1] = p.y;
    positions[ri * 3 + 2] = p.z + perp.z * halfWidth;

    // Vertex colors: edges slightly darker for soft-edge look
    colors[li * 3] = edgeColor.r;
    colors[li * 3 + 1] = edgeColor.g;
    colors[li * 3 + 2] = edgeColor.b;

    colors[ri * 3] = edgeColor.r;
    colors[ri * 3 + 1] = edgeColor.g;
    colors[ri * 3 + 2] = edgeColor.b;

    // Build triangle strip (two triangles per segment)
    if (i < pathPoints.length - 1) {
      const bl = li;
      const br = ri;
      const tl = (i + 1) * 2;
      const tr = (i + 1) * 2 + 1;
      indices.push(bl, br, tl); // first triangle
      indices.push(br, tr, tl); // second triangle
    }
  }

  // Add center vertices for a 3-strip ribbon: edge | center | edge
  // This gives a flat path with darkened edges like the game shader
  const centerPositions = new Float32Array(pathPoints.length * 3);
  const centerColors = new Float32Array(pathPoints.length * 3);
  for (let i = 0; i < pathPoints.length; i++) {
    centerPositions[i * 3] = pathPoints[i].x;
    centerPositions[i * 3 + 1] = pathPoints[i].y;
    centerPositions[i * 3 + 2] = pathPoints[i].z;
    centerColors[i * 3] = centerColor.r;
    centerColors[i * 3 + 1] = centerColor.g;
    centerColors[i * 3 + 2] = centerColor.b;
  }

  // Merge: [left edges, right edges, centers]
  // Rebuild with 3 verts per point: left edge, center, right edge
  const totalVerts = pathPoints.length * 3;
  const finalPositions = new Float32Array(totalVerts * 3);
  const finalColors = new Float32Array(totalVerts * 3);
  const finalIndices: number[] = [];

  const narrowEdge = halfWidth * 0.15; // Edge band is 15% of half-width on each side

  for (let i = 0; i < pathPoints.length; i++) {
    const p = pathPoints[i];
    if (i < pathPoints.length - 1) {
      tangent.subVectors(pathPoints[i + 1], p).normalize();
    }
    perp.crossVectors(tangent, up).normalize();

    const base = i * 3;

    // Left edge vertex
    finalPositions[base * 3] = p.x - perp.x * halfWidth;
    finalPositions[base * 3 + 1] = p.y;
    finalPositions[base * 3 + 2] = p.z - perp.z * halfWidth;
    finalColors[base * 3] = edgeColor.r;
    finalColors[base * 3 + 1] = edgeColor.g;
    finalColors[base * 3 + 2] = edgeColor.b;

    // Center vertex
    finalPositions[(base + 1) * 3] = p.x;
    finalPositions[(base + 1) * 3 + 1] = p.y;
    finalPositions[(base + 1) * 3 + 2] = p.z;
    finalColors[(base + 1) * 3] = centerColor.r;
    finalColors[(base + 1) * 3 + 1] = centerColor.g;
    finalColors[(base + 1) * 3 + 2] = centerColor.b;

    // Right edge vertex
    finalPositions[(base + 2) * 3] = p.x + perp.x * halfWidth;
    finalPositions[(base + 2) * 3 + 1] = p.y;
    finalPositions[(base + 2) * 3 + 2] = p.z + perp.z * halfWidth;
    finalColors[(base + 2) * 3] = edgeColor.r;
    finalColors[(base + 2) * 3 + 1] = edgeColor.g;
    finalColors[(base + 2) * 3 + 2] = edgeColor.b;

    // Triangles: connect left-center-right strips to next row
    if (i < pathPoints.length - 1) {
      const nBase = (i + 1) * 3;
      // Left strip (left edge → center)
      finalIndices.push(base, base + 1, nBase);
      finalIndices.push(base + 1, nBase + 1, nBase);
      // Right strip (center → right edge)
      finalIndices.push(base + 1, base + 2, nBase + 1);
      finalIndices.push(base + 2, nBase + 2, nBase + 1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(finalPositions, 3),
  );
  geometry.setAttribute("color", new THREE.BufferAttribute(finalColors, 3));
  geometry.setIndex(finalIndices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Create water material
 * Uses MeshStandardNodeMaterial for WebGPU compatibility
 */
export function createWaterMaterial(): THREE.Material {
  const material = new MeshStandardNodeMaterial();
  material.color = new THREE.Color(WATER_COLOR);
  material.transparent = true;
  material.opacity = WATER_OPACITY;
  material.roughness = 0.1;
  material.metalness = 0.3;
  material.side = THREE.DoubleSide;
  return material;
}

/**
 * Generate tile geometry with proper heightmap, colors, and road influence.
 * Uses the same approach as the game's TerrainSystem for unified rendering.
 */
export function generateTileGeometry(
  tileX: number,
  tileZ: number,
  templateGeometry: THREE.PlaneGeometry,
  queryTerrain: TerrainQuerier,
  tileSize: number,
  waterThreshold: number,
  maxHeight: number,
  worldSizeTiles: number,
  roads?: GeneratedRoad[],
  townFlattenZones?: TownFlattenZone[],
  mines?: MineAreaData[],
): { geometry: THREE.PlaneGeometry; hasWater: boolean } {
  const geometry = templateGeometry.clone();
  const positions = geometry.attributes.position;
  const colors = new Float32Array(positions.count * 3);
  const roadInfluences = new Float32Array(positions.count);
  const mineInfluences = new Float32Array(positions.count);
  const mineBiomeIds = new Float32Array(positions.count);
  const biomeIds = new Float32Array(positions.count);
  const forestWeights = new Float32Array(positions.count);
  const canyonWeights = new Float32Array(positions.count);

  let hasWater = false;
  const shorelineThreshold = waterThreshold / maxHeight + 0.1; // Normalized

  // Calculate world center offset - island mask is centered at (0,0)
  // so we need to offset our tile coordinates to be centered around the world center
  const worldCenterOffset = (worldSizeTiles * tileSize) / 2;

  // PlaneGeometry is centered at origin, so vertices range from -tileSize/2 to +tileSize/2
  // We need to offset by half a tile to align with the tile grid system where:
  // - Tile (0,0) covers world coords (0, 0) to (tileSize, tileSize)
  // - In terrain generator coords: (-worldCenterOffset, -worldCenterOffset) to (-worldCenterOffset + tileSize, ...)
  const halfTileSize = tileSize / 2;

  // ---- Phase 1B: Spatial pre-filtering for roads per tile ----
  // Compute tile AABB in world-space and filter roads whose bounding box overlaps.
  // Most roads are nowhere near the current tile, so this avoids iterating all segments.
  const tileWorldMinX = tileX * tileSize - worldCenterOffset;
  const tileWorldMaxX = tileWorldMinX + tileSize;
  const tileWorldMinZ = tileZ * tileSize - worldCenterOffset;
  const tileWorldMaxZ = tileWorldMinZ + tileSize;

  let tileRoads: ReadonlyArray<RoadPathLike> | undefined;
  if (roads && roads.length > 0) {
    const filtered: RoadPathLike[] = [];
    for (const road of roads) {
      if (road.path.length < 2) continue;
      const bounds = computeRoadBounds(road);
      // AABB overlap test
      if (
        bounds.maxX < tileWorldMinX ||
        bounds.minX > tileWorldMaxX ||
        bounds.maxZ < tileWorldMinZ ||
        bounds.minZ > tileWorldMaxZ
      )
        continue;
      filtered.push(road);
    }
    if (filtered.length > 0) tileRoads = filtered;
  }

  // ---- Phase 1C: Pre-compute squared radii for town/mine rejection ----
  type TownFlattenPrecomputed = TownFlattenZone & {
    outerRadiusSq: number;
    innerRadiusSq: number;
  };
  let precomputedTowns: TownFlattenPrecomputed[] | undefined;
  if (townFlattenZones && townFlattenZones.length > 0) {
    precomputedTowns = townFlattenZones.map((tz) => ({
      ...tz,
      outerRadiusSq: tz.outerRadius * tz.outerRadius,
      innerRadiusSq: tz.innerRadius * tz.innerRadius,
    }));
  }

  type MinePrecomputed = NonNullable<typeof mines>[number] & { maxRSq: number };
  let precomputedMines: MinePrecomputed[] | undefined;
  if (mines && mines.length > 0) {
    precomputedMines = mines.map((m) => ({
      ...m,
      maxRSq: m.radius * 1.5 * (m.radius * 1.5),
    }));
  }

  for (let i = 0; i < positions.count; i++) {
    const localX = positions.getX(i);
    const localZ = positions.getZ(i);

    // World coordinates in terrain generator space (centered at 0,0)
    // Add halfTileSize to convert from centered geometry coords to tile-corner coords
    const worldX = localX + halfTileSize + tileX * tileSize - worldCenterOffset;
    const worldZ = localZ + halfTileSize + tileZ * tileSize - worldCenterOffset;

    // Query terrain
    const query = queryTerrain(worldX, worldZ);
    let height = query.height;

    // Flatten terrain under towns: full-flat inside innerRadius,
    // smooth hermite blend back to natural terrain at outerRadius
    // Track how much this vertex is influenced by town flattening (0 = none, 1 = fully flat)
    let townFlattenInfluence = 0;
    if (precomputedTowns) {
      for (const tz of precomputedTowns) {
        const dx = worldX - tz.x;
        const dz = worldZ - tz.z;
        const distSq = dx * dx + dz * dz;
        // Squared distance rejection — avoid sqrt for points clearly outside
        if (distSq >= tz.outerRadiusSq) continue;
        if (distSq <= tz.innerRadiusSq) {
          // Fully flat at town center height
          height = tz.centerHeight;
          townFlattenInfluence = 1;
        } else {
          // Only compute sqrt when inside the blend zone
          const dist = Math.sqrt(distSq);
          // Smooth blend: 0 at innerRadius (full flatten) → 1 at outerRadius (natural)
          const t = (dist - tz.innerRadius) / (tz.outerRadius - tz.innerRadius);
          // Hermite smoothstep for natural-looking ramp
          const blend = t * t * (3 - 2 * t);
          height = tz.centerHeight + (height - tz.centerHeight) * blend;
          townFlattenInfluence = 1 - blend;
        }
        break; // Only one town per vertex (first match)
      }
    }

    // ---- Phase 1A: Merged road height + influence in single pass ----
    // Flatten terrain under roads AND compute shader influence attribute together.
    let roadInfluenceValue = 0;
    if (tileRoads && townFlattenInfluence < 1) {
      const roadResult = getRoadHeightAndInfluence(worldX, worldZ, tileRoads);
      roadInfluenceValue = roadResult.influence;
      if (roadResult.heightInfluence > 0) {
        // Road path height + small offset so road sits slightly above terrain
        const targetHeight = roadResult.height + 0.1;
        // Reduce road influence proportionally to town flatten influence
        const effectiveInfluence =
          roadResult.heightInfluence * (1 - townFlattenInfluence);
        height = height + (targetHeight - height) * effectiveInfluence;
      }
    } else if (tileRoads) {
      // Inside fully-flat town zone — still need influence for shader coloring
      const roadResult = getRoadHeightAndInfluence(worldX, worldZ, tileRoads);
      roadInfluenceValue = roadResult.influence;
    }

    // RuneScape-style mine depression: gentle, shallow bowl that blends
    // smoothly into the surrounding terrain. No rim or steep walls — just
    // a subtle dip where mining has worn the ground down.
    if (precomputedMines && townFlattenInfluence < 1) {
      for (const mine of precomputedMines) {
        const dx = worldX - mine.position.x;
        const dz = worldZ - mine.position.z;
        const distSq = dx * dx + dz * dz;

        // Quick squared-distance reject (avoids sqrt)
        if (distSq >= mine.maxRSq) continue;

        const dist = Math.sqrt(distSq);

        // Organic boundary: effective radius varies by angle
        const angle = Math.atan2(dz, dx);
        const R = getMineEffectiveRadius(
          mine.radius,
          mine.radialOffsets,
          angle,
        );
        if (dist >= R * 1.2) continue;

        const centerHeight = mine.position.y;
        const townBlend = 1 - townFlattenInfluence;

        // Smooth cosine bowl: deepest at center, level at edge
        const t = Math.min(dist / R, 1.0);
        const bowlFactor = 0.5 * (1 + Math.cos(Math.PI * t));

        // Asymmetric depth: gentle entry ramp (40%), steep back wall (100%)
        // Must match minePlacement.ts getMineBowlHeight exactly
        let afe = Math.abs(angle - mine.entryAngle);
        if (afe > Math.PI) afe = 2 * Math.PI - afe;
        const depthMul = 0.4 + 0.6 * (afe / Math.PI);

        // Micro-undulation: rocky, uneven mine floor (deterministic from position)
        const undulation1 =
          Math.sin(worldX * 0.7 + 1.3) * Math.cos(worldZ * 0.9 + 2.1) * 0.3;
        const undulation2 = Math.sin(worldX * 2.3 + worldZ * 1.7) * 0.15;
        const undulation3 = Math.cos(worldX * 4.1 - worldZ * 3.3) * 0.06;
        const floorNoise =
          (undulation1 + undulation2 + undulation3) * bowlFactor;

        // Rim bumps: suppressed on entry side for smooth ramp
        const rimT = Math.max(0, 1 - Math.abs(t - 0.88) / 0.12);
        const rimSuppression = Math.min(1, afe / (Math.PI * 0.4));
        const rimBump =
          (Math.sin(worldX * 1.5 + worldZ * 2.1) * 0.3 +
            Math.cos(worldX * 2.7 - worldZ * 1.3) * 0.15) *
          rimT *
          rimSuppression;

        const targetHeight =
          centerHeight - 3.0 * depthMul * bowlFactor + floorNoise + rimBump;

        // Blend bowl into natural terrain — full blend inside R, fade to 0 by 1.2R
        let blend = 1.0;
        if (dist > R) {
          const fadeT = (dist - R) / (R * 0.2);
          blend = 1.0 - fadeT * fadeT * (3 - 2 * fadeT);
        }
        blend *= townBlend;

        height = height + (targetHeight - height) * blend;
        break;
      }
    }

    // Set vertex height
    positions.setY(i, height);

    // Check if this tile has water
    if (height < waterThreshold) {
      hasWater = true;
    }

    // Get biome color — use query-provided color (game pipeline) or look up from table
    let r: number, g: number, b: number;
    if (query.color) {
      r = query.color.r;
      g = query.color.g;
      b = query.color.b;
    } else {
      const biomeColor = BIOME_COLORS[query.biome] || BIOME_COLORS.plains;
      r = biomeColor.r;
      g = biomeColor.g;
      b = biomeColor.b;
    }

    // Apply shoreline tinting near water level
    const normalizedHeight = height / maxHeight;
    const waterLevel = waterThreshold / maxHeight;

    if (
      normalizedHeight > waterLevel &&
      normalizedHeight < shorelineThreshold
    ) {
      const shoreFactor =
        (1.0 -
          (normalizedHeight - waterLevel) / (shorelineThreshold - waterLevel)) *
        0.6;
      r = r + (SHORELINE_COLOR.r - r) * shoreFactor;
      g = g + (SHORELINE_COLOR.g - g) * shoreFactor;
      b = b + (SHORELINE_COLOR.b - b) * shoreFactor;
    }

    // Store color
    colors[i * 3] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;

    // Store biome ID and per-biome weights for shader
    biomeIds[i] = BIOME_NAME_TO_ID[query.biome] ?? 0;
    forestWeights[i] = query.biomeForestWeight ?? 0;
    canyonWeights[i] = query.biomeCanyonWeight ?? 0;

    // Road influence already computed in merged pass above
    roadInfluences[i] = roadInfluenceValue;

    // Mine influence for terrain shader — rocky floor color overlay
    const mineResult = calculateMineInfluenceAtPoint(worldX, worldZ, mines);
    mineInfluences[i] = mineResult.influence;
    mineBiomeIds[i] = mineResult.biomeIndex;
  }

  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("biomeId", new THREE.BufferAttribute(biomeIds, 1));
  geometry.setAttribute(
    "biomeForestWeight",
    new THREE.BufferAttribute(forestWeights, 1),
  );
  geometry.setAttribute(
    "biomeCanyonWeight",
    new THREE.BufferAttribute(canyonWeights, 1),
  );
  geometry.setAttribute(
    "roadInfluence",
    new THREE.BufferAttribute(roadInfluences, 1),
  );
  geometry.setAttribute(
    "mineInfluence",
    new THREE.BufferAttribute(mineInfluences, 1),
  );
  geometry.setAttribute(
    "mineBiomeId",
    new THREE.BufferAttribute(mineBiomeIds, 1),
  );
  geometry.computeVertexNormals();
  positions.needsUpdate = true;

  return { geometry, hasWater };
}
