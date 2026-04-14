/**
 * useBrushOverlaySync — Applies brush overlay strokes to terrain geometry
 *
 * When the user paints with brush tools, strokes are stored in WorldStudioContext
 * state but need to be visually applied to the terrain tile meshes in real-time.
 *
 * - Terrain sculpt → modifies vertex heights (position Y)
 * - Biome paint → modifies vertex colors
 * - Collision tiles → creates translucent overlay meshes showing blocked areas
 *
 * Uses TerrainSceneRefs.terrainContainer for direct geometry manipulation.
 */

import * as THREE from "three/webgpu";
import { useEffect, useRef } from "react";

import type { TerrainSceneRefs } from "../../WorldBuilder/TileBasedTerrain";
import type { WorldStudioState } from "../WorldStudioContext";
import type { VegetationPaintStroke, TileCollisionOverride } from "../types";

import {
  applyTerrainSculptToTiles,
  applyBiomePaintToTiles,
  applyMaterialPaintToTiles,
  flushDirtyNormals,
} from "../utils/brushApplication";

// ============== VEGETATION OVERLAY ==============

/** Vegetation species → color for overlay dots */
const VEGETATION_COLORS: Record<string, number> = {
  tree: 0x228b22,
  bush: 0x2e8b57,
  fern: 0x3cb371,
  rock: 0x808080,
  fallen_tree: 0x6b4226,
  flower: 0xff69b4,
  mushroom: 0x9b59b6,
  grass: 0x90ee90,
};

const VEGETATION_REMOVE_COLOR = 0xef4444;
const VEGETATION_DOT_SIZE = 0.6;

/**
 * Build an instanced-mesh overlay for vegetation paint strokes.
 * Each stroke scatters small dots within its brush radius on the terrain.
 */
function buildVegetationOverlay(
  strokes: VegetationPaintStroke[],
  terrainContainer: THREE.Group,
  getTerrainHeight?: (x: number, z: number) => number,
): THREE.Group {
  const group = new THREE.Group();
  group.name = "vegetation-overlay";
  group.renderOrder = 998;

  if (strokes.length === 0) return group;

  // Phase 5A: Use analytical O(1) height query when available, fall back to O(V) vertex scan
  const getHeight = getTerrainHeight
    ? (x: number, z: number) => getTerrainHeight(x, z)
    : (x: number, z: number) => sampleTerrainHeight(terrainContainer, x, z);

  // Collect dot positions from all strokes
  const addDots: Array<{ x: number; y: number; z: number; color: number }> = [];
  const removeDots: Array<{ x: number; y: number; z: number }> = [];

  for (const stroke of strokes) {
    // Scatter dots within the brush radius based on strength
    const dotCount = Math.max(
      1,
      Math.round(stroke.radius * stroke.strength * 2),
    );
    const color =
      stroke.speciesFilter.length === 1
        ? (VEGETATION_COLORS[stroke.speciesFilter[0]] ?? 0x228b22)
        : 0x228b22;

    for (let i = 0; i < dotCount; i++) {
      const angle = (i / dotCount) * Math.PI * 2 + stroke.radius * 0.1;
      const dist = (i / dotCount) * stroke.radius * 0.85;
      const x = stroke.center.x + Math.cos(angle) * dist;
      const z = stroke.center.z + Math.sin(angle) * dist;
      const y = getHeight(x, z);

      if (stroke.mode === "add") {
        addDots.push({ x, y: y + 0.2, z, color });
      } else {
        removeDots.push({ x, y: y + 0.2, z });
      }
    }
  }

  const geo = new THREE.CircleGeometry(VEGETATION_DOT_SIZE, 6);
  geo.rotateX(-Math.PI / 2);

  // Add-mode dots (green tinted)
  if (addDots.length > 0) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0x228b22,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const instanced = new THREE.InstancedMesh(geo, mat, addDots.length);
    instanced.name = "vegetation-add";
    instanced.renderOrder = 998;

    const dummy = new THREE.Object3D();
    for (let i = 0; i < addDots.length; i++) {
      dummy.position.set(addDots[i].x, addDots[i].y, addDots[i].z);
      dummy.updateMatrix();
      instanced.setMatrixAt(i, dummy.matrix);
      instanced.setColorAt(i, new THREE.Color(addDots[i].color));
    }
    instanced.instanceMatrix.needsUpdate = true;
    if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true;
    group.add(instanced);
  }

  // Remove-mode dots (red)
  if (removeDots.length > 0) {
    const mat = new THREE.MeshBasicMaterial({
      color: VEGETATION_REMOVE_COLOR,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const instanced = new THREE.InstancedMesh(geo, mat, removeDots.length);
    instanced.name = "vegetation-remove";
    instanced.renderOrder = 998;

    const dummy = new THREE.Object3D();
    for (let i = 0; i < removeDots.length; i++) {
      dummy.position.set(removeDots[i].x, removeDots[i].y, removeDots[i].z);
      dummy.updateMatrix();
      instanced.setMatrixAt(i, dummy.matrix);
    }
    instanced.instanceMatrix.needsUpdate = true;
    group.add(instanced);
  }

  return group;
}

/** Sample terrain height at a world XZ position by finding the nearest vertex. */
function sampleTerrainHeight(
  terrainContainer: THREE.Group,
  worldX: number,
  worldZ: number,
): number {
  let closestY = 0;
  let closestDist = Infinity;

  for (const child of terrainContainer.children) {
    if (!(child instanceof THREE.Mesh)) continue;
    const mesh = child;
    const positions = mesh.geometry.getAttribute(
      "position",
    ) as THREE.BufferAttribute;
    if (!positions) continue;

    // Quick bounding box check
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const bb = mesh.geometry.boundingBox!;
    const localX = worldX - mesh.position.x;
    const localZ = worldZ - mesh.position.z;
    if (localX < bb.min.x - 1 || localX > bb.max.x + 1) continue;
    if (localZ < bb.min.z - 1 || localZ > bb.max.z + 1) continue;

    for (let i = 0; i < positions.count; i++) {
      const dx = mesh.position.x + positions.getX(i) - worldX;
      const dz = mesh.position.z + positions.getZ(i) - worldZ;
      const d = dx * dx + dz * dz;
      if (d < closestDist) {
        closestDist = d;
        closestY = positions.getY(i);
      }
    }
  }

  return closestY;
}

// ============== COLLISION OVERLAY ==============

function buildCollisionOverlay(
  collisions: TileCollisionOverride[],
): THREE.Group {
  const group = new THREE.Group();
  group.name = "collision-overlay";
  group.renderOrder = 999;

  if (collisions.length === 0) return group;

  // Separate blocked and unblocked tiles
  const blocked: TileCollisionOverride[] = [];
  const unblocked: TileCollisionOverride[] = [];

  for (const col of collisions) {
    if (col.blocked) blocked.push(col);
    else unblocked.push(col);
  }

  // Create instanced mesh for blocked tiles (red)
  if (blocked.length > 0) {
    const geo = new THREE.PlaneGeometry(0.9, 0.9);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xff4444,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const instanced = new THREE.InstancedMesh(geo, mat, blocked.length);
    instanced.name = "collision-blocked";
    instanced.renderOrder = 999;

    const dummy = new THREE.Object3D();
    for (let i = 0; i < blocked.length; i++) {
      dummy.position.set(blocked[i].tileX + 0.5, 0.15, blocked[i].tileZ + 0.5);
      dummy.updateMatrix();
      instanced.setMatrixAt(i, dummy.matrix);
    }
    instanced.instanceMatrix.needsUpdate = true;
    group.add(instanced);
  }

  // Instanced mesh for unblocked tiles (green)
  if (unblocked.length > 0) {
    const geo = new THREE.PlaneGeometry(0.9, 0.9);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x44ff44,
      transparent: true,
      opacity: 0.25,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const instanced = new THREE.InstancedMesh(geo, mat, unblocked.length);
    instanced.name = "collision-unblocked";
    instanced.renderOrder = 999;

    const dummy = new THREE.Object3D();
    for (let i = 0; i < unblocked.length; i++) {
      dummy.position.set(
        unblocked[i].tileX + 0.5,
        0.15,
        unblocked[i].tileZ + 0.5,
      );
      dummy.updateMatrix();
      instanced.setMatrixAt(i, dummy.matrix);
    }
    instanced.instanceMatrix.needsUpdate = true;
    group.add(instanced);
  }

  return group;
}

// ============== HOOK ==============

interface SyncState {
  appliedSculpts: Set<string>;
  appliedPaints: Set<string>;
  appliedMaterials: Set<string>;
  vegetationOverlay: THREE.Group | null;
  collisionOverlay: THREE.Group | null;
  disposed: boolean;
}

export function useBrushOverlaySync({
  sceneRefs,
  studioState,
}: {
  sceneRefs: TerrainSceneRefs | null;
  studioState: WorldStudioState;
}): void {
  const syncRef = useRef<SyncState>({
    appliedSculpts: new Set(),
    appliedPaints: new Set(),
    appliedMaterials: new Set(),
    vegetationOverlay: null,
    collisionOverlay: null,
    disposed: false,
  });
  const sceneRefsRef = useRef(sceneRefs);
  sceneRefsRef.current = sceneRefs;

  // Apply terrain sculpt strokes incrementally
  useEffect(() => {
    if (!sceneRefs) return;
    const sync = syncRef.current;
    if (sync.disposed) return;

    const strokes = studioState.brushOverlays.terrainSculpts;

    for (const stroke of strokes) {
      if (sync.appliedSculpts.has(stroke.id)) continue;
      sync.appliedSculpts.add(stroke.id);
      applyTerrainSculptToTiles(sceneRefs.terrainContainer, stroke);
    }
    // Batch vertex normal computation after all strokes in this tick
    flushDirtyNormals();
  }, [sceneRefs, studioState.brushOverlays.terrainSculpts]);

  // Apply biome paint strokes incrementally
  useEffect(() => {
    if (!sceneRefs) return;
    const sync = syncRef.current;
    if (sync.disposed) return;

    const strokes = studioState.brushOverlays.biomePaints;

    for (const stroke of strokes) {
      if (sync.appliedPaints.has(stroke.id)) continue;
      sync.appliedPaints.add(stroke.id);
      applyBiomePaintToTiles(sceneRefs.terrainContainer, stroke);
    }
  }, [sceneRefs, studioState.brushOverlays.biomePaints]);

  // Apply material paint strokes incrementally
  useEffect(() => {
    if (!sceneRefs) return;
    const sync = syncRef.current;
    if (sync.disposed) return;

    const strokes = studioState.brushOverlays.materialPaints;

    for (const stroke of strokes) {
      if (sync.appliedMaterials.has(stroke.id)) continue;
      sync.appliedMaterials.add(stroke.id);
      applyMaterialPaintToTiles(sceneRefs.terrainContainer, stroke);
    }
  }, [sceneRefs, studioState.brushOverlays.materialPaints]);

  // Rebuild vegetation overlay when vegetation strokes change
  useEffect(() => {
    if (!sceneRefs) return;
    const sync = syncRef.current;
    if (sync.disposed) return;

    // Remove old overlay
    if (sync.vegetationOverlay) {
      sceneRefs.scene.remove(sync.vegetationOverlay);
      sync.vegetationOverlay.traverse((child) => {
        if (
          child instanceof THREE.Mesh ||
          child instanceof THREE.InstancedMesh
        ) {
          child.geometry.dispose();
          try {
            if (Array.isArray(child.material))
              child.material.forEach((m) => m.dispose());
            else child.material.dispose();
          } catch {
            /* WebGPU cleanup race */
          }
        }
      });
      sync.vegetationOverlay = null;
    }

    const strokes = studioState.brushOverlays.vegetationPaints;
    if (strokes.length > 0) {
      const overlay = buildVegetationOverlay(
        strokes,
        sceneRefs.terrainContainer,
        sceneRefs.getTerrainHeight,
      );
      sceneRefs.scene.add(overlay);
      sync.vegetationOverlay = overlay;
    }
  }, [sceneRefs, studioState.brushOverlays.vegetationPaints]);

  // Rebuild collision overlay when collisions change
  useEffect(() => {
    if (!sceneRefs) return;
    const sync = syncRef.current;
    if (sync.disposed) return;

    // Remove old overlay
    if (sync.collisionOverlay) {
      sceneRefs.scene.remove(sync.collisionOverlay);
      sync.collisionOverlay.traverse((child) => {
        if (
          child instanceof THREE.Mesh ||
          child instanceof THREE.InstancedMesh
        ) {
          child.geometry.dispose();
          try {
            if (Array.isArray(child.material))
              child.material.forEach((m) => m.dispose());
            else child.material.dispose();
          } catch {
            /* WebGPU cleanup race */
          }
        }
      });
      sync.collisionOverlay = null;
    }

    const collisions = studioState.brushOverlays.tileCollisions;
    if (collisions.length > 0) {
      const overlay = buildCollisionOverlay(collisions);
      sceneRefs.scene.add(overlay);
      sync.collisionOverlay = overlay;
    }
  }, [sceneRefs, studioState.brushOverlays.tileCollisions]);

  // Cleanup on unmount
  useEffect(() => {
    const sync = syncRef.current;
    return () => {
      sync.disposed = true;
      const refs = sceneRefsRef.current;
      if (refs) {
        for (const overlay of [sync.vegetationOverlay, sync.collisionOverlay]) {
          if (overlay) {
            refs.scene.remove(overlay);
            overlay.traverse((child) => {
              if (
                child instanceof THREE.Mesh ||
                child instanceof THREE.InstancedMesh
              ) {
                child.geometry.dispose();
                if (Array.isArray(child.material))
                  child.material.forEach((m) => m.dispose());
                else child.material.dispose();
              }
            });
          }
        }
      }
    };
  }, []);
}
