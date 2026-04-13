/**
 * usePlacementInteraction — Click-to-place viewport interaction
 *
 * When a placement is active (ghost preview in viewport):
 * - Mouse move → raycast to terrain, update placement position
 * - Left click → confirm placement, create the entity
 * - Right click or Escape → cancel placement
 * - R key → rotate placement 45 degrees
 *
 * Uses TerrainSceneRefs from TileBasedTerrain for raycasting.
 * Event listeners are registered once per placement session (not per frame).
 */

import * as THREE from "three/webgpu";
import { useEffect, useRef, useCallback } from "react";

import type { TerrainSceneRefs } from "../../WorldBuilder/TileBasedTerrain";
import { useWorldStudio } from "../WorldStudioContext";

const SNAP_GRID = 1; // Snap to 1m grid
const ROTATION_STEP = Math.PI / 4; // 45 degree increments

interface PlacementInteractionOptions {
  sceneRefs: TerrainSceneRefs | null;
  /** When true, snap placement X/Z to the 1m grid */
  gridSnap: boolean;
}

export function usePlacementInteraction({
  sceneRefs,
  gridSnap,
}: PlacementInteractionOptions) {
  const { state, actions } = useWorldStudio();
  const activePlacement = state.tools.activePlacement;
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());
  const groundPlaneRef = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
  const intersectionRef = useRef(new THREE.Vector3());
  const sceneRefsRef = useRef(sceneRefs);
  sceneRefsRef.current = sceneRefs;

  // Keep a ref to the current placement for keyboard handler (avoids re-registering listeners)
  const placementRef = useRef(activePlacement);
  placementRef.current = activePlacement;

  // Stable ref to actions (doesn't change between renders)
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  // Stable ref for gridSnap so event handlers see latest value without re-registering
  const gridSnapRef = useRef(gridSnap);
  gridSnapRef.current = gridSnap;

  // Snap position to grid (conditional)
  const applySnap = useCallback(
    (x: number, z: number): { x: number; z: number } => {
      if (!gridSnapRef.current) return { x, z };
      return {
        x: Math.round(x / SNAP_GRID) * SNAP_GRID,
        z: Math.round(z / SNAP_GRID) * SNAP_GRID,
      };
    },
    [],
  );

  // Raycast to ground plane and get world position
  const raycastToGround = useCallback(
    (
      clientX: number,
      clientY: number,
    ): { x: number; y: number; z: number } | null => {
      const refs = sceneRefsRef.current;
      if (!refs) return null;

      const rect = refs.container.getBoundingClientRect();
      mouseRef.current.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((clientY - rect.top) / rect.height) * 2 + 1;

      raycasterRef.current.setFromCamera(mouseRef.current, refs.camera);

      // Try to intersect terrain meshes first (children of terrainContainer are tile meshes)
      const meshes = refs.terrainContainer.children;

      if (meshes.length > 0) {
        const intersects = raycasterRef.current.intersectObjects(meshes, false);
        if (intersects.length > 0) {
          const point = intersects[0].point;
          const snapped = applySnap(point.x, point.z);
          return { x: snapped.x, y: point.y, z: snapped.z };
        }
      }

      // Fallback: intersect ground plane
      const hit = raycasterRef.current.ray.intersectPlane(
        groundPlaneRef.current,
        intersectionRef.current,
      );
      if (hit) {
        const snapped = applySnap(hit.x, hit.z);
        return { x: snapped.x, y: 0, z: snapped.z };
      }

      return null;
    },
    [applySnap],
  );

  // Derive a stable boolean for whether we're actively placing
  const isPlacing = !!activePlacement && !activePlacement.confirmed;

  // Single effect that manages ALL placement listeners.
  // Only re-runs when isPlacing or sceneRefs change — NOT on every position update.
  useEffect(() => {
    if (!isPlacing || !sceneRefs) return;

    const el = sceneRefs.container;

    const handleMouseMove = (e: MouseEvent) => {
      const pos = raycastToGround(e.clientX, e.clientY);
      if (pos) {
        actionsRef.current.updatePlacementPosition(pos);
      }
    };

    const handleClick = (e: MouseEvent) => {
      if (e.button !== 0) return;
      e.stopPropagation(); // Prevent TileBasedTerrain selection handler
      const pos = raycastToGround(e.clientX, e.clientY);
      if (pos) {
        actionsRef.current.updatePlacementPosition(pos);
        actionsRef.current.confirmPlacement();
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      actionsRef.current.cancelPlacement();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        actionsRef.current.cancelPlacement();
        return;
      }
      if (e.key.toLowerCase() === "r" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        const cur = placementRef.current;
        if (cur) {
          actionsRef.current.updatePlacementPosition(
            cur.position,
            cur.rotation + ROTATION_STEP,
          );
        }
      }
    };

    // Use capture phase for click so we fire before TileBasedTerrain's handler
    el.addEventListener("mousemove", handleMouseMove);
    el.addEventListener("click", handleClick, true);
    el.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      el.removeEventListener("mousemove", handleMouseMove);
      el.removeEventListener("click", handleClick, true);
      el.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isPlacing, sceneRefs, raycastToGround]);
}
