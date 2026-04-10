/**
 * brushApplication — Shared brush application utilities
 *
 * Extracted from useBrushOverlaySync so both the real-time hook AND
 * tile generation can apply brush strokes consistently.
 * This ensures sculpt strokes persist across tile unload/reload.
 */

import * as THREE from "three";

import type {
  TerrainSculptStroke,
  BiomePaintStroke,
  BrushFalloff,
} from "../types";

// ============== CONSTANTS ==============

export const SCULPT_HEIGHT_STEP = 2.0; // meters per full-strength application

// Biome colors (must match TileBasedTerrain BIOME_COLORS)
export const BIOME_COLORS: Record<string, [number, number, number]> = {
  plains: [0.486, 0.729, 0.373],
  forest: [0.227, 0.42, 0.208],
  valley: [0.353, 0.541, 0.31],
  desert: [0.769, 0.639, 0.353],
  tundra: [0.722, 0.784, 0.784],
  swamp: [0.29, 0.353, 0.227],
  mountains: [0.541, 0.541, 0.541],
  lakes: [0.29, 0.478, 0.722],
  canyon: [0.6, 0.45, 0.3],
};

// ============== BRUSH MATH ==============

export function brushInfluence(
  dist: number,
  radius: number,
  falloff: BrushFalloff,
): number {
  if (dist >= radius) return 0;
  const t = dist / radius;
  switch (falloff) {
    case "sharp":
      return t < 0.7 ? 1.0 : Math.max(0, (1 - t) / 0.3);
    case "linear":
      return 1 - t;
    case "smooth":
    default:
      return 1 - t * t * (3 - 2 * t);
  }
}

/** Check if a circle overlaps an AABB (2D in XZ plane) */
export function circleOverlapsAABB(
  cx: number,
  cz: number,
  radius: number,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
): boolean {
  const nearX = Math.max(minX, Math.min(cx, maxX));
  const nearZ = Math.max(minZ, Math.min(cz, maxZ));
  return (nearX - cx) ** 2 + (nearZ - cz) ** 2 <= radius * radius;
}

// ============== TERRAIN SCULPT ==============

/** Set of meshes that need normals recomputed after a batch of sculpt strokes. */
const _dirtyMeshes = new Set<THREE.Mesh>();

export function applyTerrainSculptToTiles(
  terrainContainer: THREE.Group,
  stroke: TerrainSculptStroke,
): void {
  const { center, radius, strength, mode, falloff, flattenTarget } = stroke;

  for (const child of terrainContainer.children) {
    if (!(child instanceof THREE.Mesh)) continue;

    const mesh = child;
    const positions = mesh.geometry.getAttribute(
      "position",
    ) as THREE.BufferAttribute;
    if (!positions) continue;

    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const bb = mesh.geometry.boundingBox!;

    // Quick culling — skip tiles that don't overlap the stroke circle
    if (
      !circleOverlapsAABB(
        center.x,
        center.z,
        radius,
        mesh.position.x + bb.min.x,
        mesh.position.x + bb.max.x,
        mesh.position.z + bb.min.z,
        mesh.position.z + bb.max.z,
      )
    )
      continue;

    let modified = false;

    for (let i = 0; i < positions.count; i++) {
      const worldX = mesh.position.x + positions.getX(i);
      const worldZ = mesh.position.z + positions.getZ(i);

      const dx = worldX - center.x;
      const dz = worldZ - center.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist >= radius) continue;

      const inf = brushInfluence(dist, radius, falloff) * strength;
      const y = positions.getY(i);

      switch (mode) {
        case "raise":
          positions.setY(i, y + inf * SCULPT_HEIGHT_STEP);
          break;
        case "lower":
          positions.setY(i, y - inf * SCULPT_HEIGHT_STEP);
          break;
        case "flatten": {
          const target = flattenTarget ?? y;
          positions.setY(i, y + (target - y) * inf);
          break;
        }
        case "smooth": {
          const stride = Math.round(Math.sqrt(positions.count));
          let sum = 0;
          let cnt = 0;
          for (const di of [-1, 0, 1]) {
            for (const dj of [-1, 0, 1]) {
              if (di === 0 && dj === 0) continue;
              const ni = i + di + dj * stride;
              if (ni >= 0 && ni < positions.count) {
                sum += positions.getY(ni);
                cnt++;
              }
            }
          }
          if (cnt > 0) {
            positions.setY(i, y + (sum / cnt - y) * inf * 0.5);
          }
          break;
        }
      }
      modified = true;
    }

    if (modified) {
      positions.needsUpdate = true;
      mesh.geometry.computeBoundingBox();
      _dirtyMeshes.add(mesh);
    }
  }
}

/** Flush deferred vertex normal computation for all modified meshes. */
export function flushDirtyNormals(): void {
  for (const mesh of _dirtyMeshes) {
    mesh.geometry.computeVertexNormals();
  }
  _dirtyMeshes.clear();
}

// ============== BIOME PAINT ==============

export function applyBiomePaintToTiles(
  terrainContainer: THREE.Group,
  stroke: BiomePaintStroke,
): void {
  const { center, radius, strength, falloff, targetBiome } = stroke;
  const bc = BIOME_COLORS[targetBiome] ?? BIOME_COLORS.plains;

  for (const child of terrainContainer.children) {
    if (!(child instanceof THREE.Mesh)) continue;

    const mesh = child;
    const positions = mesh.geometry.getAttribute(
      "position",
    ) as THREE.BufferAttribute;
    const colors = mesh.geometry.getAttribute("color") as THREE.BufferAttribute;
    if (!positions || !colors) continue;

    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const bb = mesh.geometry.boundingBox!;

    if (
      !circleOverlapsAABB(
        center.x,
        center.z,
        radius,
        mesh.position.x + bb.min.x,
        mesh.position.x + bb.max.x,
        mesh.position.z + bb.min.z,
        mesh.position.z + bb.max.z,
      )
    )
      continue;

    let modified = false;

    for (let i = 0; i < positions.count; i++) {
      const worldX = mesh.position.x + positions.getX(i);
      const worldZ = mesh.position.z + positions.getZ(i);

      const dx = worldX - center.x;
      const dz = worldZ - center.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist >= radius) continue;

      const inf = brushInfluence(dist, radius, falloff) * strength;

      const r = colors.getX(i);
      const g = colors.getY(i);
      const b = colors.getZ(i);

      colors.setXYZ(
        i,
        r + (bc[0] - r) * inf,
        g + (bc[1] - g) * inf,
        b + (bc[2] - b) * inf,
      );
      modified = true;
    }

    if (modified) {
      colors.needsUpdate = true;
    }
  }
}

// ============== GEOMETRY-LEVEL SCULPT APPLICATION ==============

/**
 * Apply terrain sculpt strokes directly to a BufferGeometry's position attribute.
 * Used during tile generation to bake brush strokes into newly created tiles,
 * ensuring strokes persist across tile unload/reload cycles.
 *
 * @param geometry - The tile's BufferGeometry (positions in local tile space)
 * @param tileWorldX - World X offset of the tile mesh
 * @param tileWorldZ - World Z offset of the tile mesh
 * @param strokes - All terrain sculpt strokes to consider
 */
export function applySculptStrokesToGeometry(
  geometry: THREE.BufferGeometry,
  tileWorldX: number,
  tileWorldZ: number,
  strokes: TerrainSculptStroke[],
): boolean {
  if (strokes.length === 0) return false;

  const positions = geometry.getAttribute("position") as THREE.BufferAttribute;
  if (!positions) return false;

  // Compute tile AABB for quick culling
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const bb = geometry.boundingBox!;
  const minX = tileWorldX + bb.min.x;
  const maxX = tileWorldX + bb.max.x;
  const minZ = tileWorldZ + bb.min.z;
  const maxZ = tileWorldZ + bb.max.z;

  let anyModified = false;

  for (const stroke of strokes) {
    const { center, radius, strength, mode, falloff, flattenTarget } = stroke;

    // Quick culling — skip strokes that don't overlap this tile
    if (!circleOverlapsAABB(center.x, center.z, radius, minX, maxX, minZ, maxZ))
      continue;

    for (let i = 0; i < positions.count; i++) {
      const worldX = tileWorldX + positions.getX(i);
      const worldZ = tileWorldZ + positions.getZ(i);

      const dx = worldX - center.x;
      const dz = worldZ - center.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist >= radius) continue;

      const inf = brushInfluence(dist, radius, falloff) * strength;
      const y = positions.getY(i);

      switch (mode) {
        case "raise":
          positions.setY(i, y + inf * SCULPT_HEIGHT_STEP);
          break;
        case "lower":
          positions.setY(i, y - inf * SCULPT_HEIGHT_STEP);
          break;
        case "flatten": {
          const target = flattenTarget ?? y;
          positions.setY(i, y + (target - y) * inf);
          break;
        }
        case "smooth": {
          const stride = Math.round(Math.sqrt(positions.count));
          let sum = 0;
          let cnt = 0;
          for (const di of [-1, 0, 1]) {
            for (const dj of [-1, 0, 1]) {
              if (di === 0 && dj === 0) continue;
              const ni = i + di + dj * stride;
              if (ni >= 0 && ni < positions.count) {
                sum += positions.getY(ni);
                cnt++;
              }
            }
          }
          if (cnt > 0) {
            positions.setY(i, y + (sum / cnt - y) * inf * 0.5);
          }
          break;
        }
      }
      anyModified = true;
    }
  }

  if (anyModified) {
    positions.needsUpdate = true;
    geometry.computeBoundingBox();
    geometry.computeVertexNormals();
  }

  return anyModified;
}
