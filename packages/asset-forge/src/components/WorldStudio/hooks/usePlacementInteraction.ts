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
 */

import * as THREE from "three";
import { useEffect, useRef, useCallback } from "react";

import type { TerrainSceneRefs } from "../../WorldBuilder/TileBasedTerrain";
import { useWorldStudio } from "../WorldStudioContext";

const SNAP_GRID = 1; // Snap to 1m grid
const ROTATION_STEP = Math.PI / 4; // 45 degree increments

interface PlacementInteractionOptions {
  sceneRefs: TerrainSceneRefs | null;
}

export function usePlacementInteraction({
  sceneRefs,
}: PlacementInteractionOptions) {
  const { state, actions } = useWorldStudio();
  const activePlacement = state.tools.activePlacement;
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());
  const groundPlaneRef = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
  const intersectionRef = useRef(new THREE.Vector3());
  const sceneRefsRef = useRef(sceneRefs);
  sceneRefsRef.current = sceneRefs;

  // Snap position to grid
  const snapToGrid = useCallback(
    (x: number, z: number): { x: number; z: number } => {
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
          const snapped = snapToGrid(point.x, point.z);
          return { x: snapped.x, y: point.y, z: snapped.z };
        }
      }

      // Fallback: intersect ground plane
      const hit = raycasterRef.current.ray.intersectPlane(
        groundPlaneRef.current,
        intersectionRef.current,
      );
      if (hit) {
        const snapped = snapToGrid(hit.x, hit.z);
        return { x: snapped.x, y: 0, z: snapped.z };
      }

      return null;
    },
    [snapToGrid],
  );

  // Handle mouse move — update ghost position
  useEffect(() => {
    if (!activePlacement || activePlacement.confirmed || !sceneRefs) return;

    const el = sceneRefs.container;

    const handleMouseMove = (e: MouseEvent) => {
      const pos = raycastToGround(e.clientX, e.clientY);
      if (pos) {
        actions.updatePlacementPosition(pos);
      }
    };

    el.addEventListener("mousemove", handleMouseMove);
    return () => el.removeEventListener("mousemove", handleMouseMove);
  }, [activePlacement, sceneRefs, raycastToGround, actions]);

  // Handle click — confirm placement
  useEffect(() => {
    if (!activePlacement || activePlacement.confirmed || !sceneRefs) return;

    const el = sceneRefs.container;

    const handleClick = (e: MouseEvent) => {
      if (e.button !== 0) return;

      const pos = raycastToGround(e.clientX, e.clientY);
      if (pos) {
        actions.updatePlacementPosition(pos);
        actions.confirmPlacement();
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      actions.cancelPlacement();
    };

    el.addEventListener("click", handleClick);
    el.addEventListener("contextmenu", handleContextMenu);
    return () => {
      el.removeEventListener("click", handleClick);
      el.removeEventListener("contextmenu", handleContextMenu);
    };
  }, [activePlacement, sceneRefs, raycastToGround, actions]);

  // Handle R key for rotation during placement
  useEffect(() => {
    if (!activePlacement || activePlacement.confirmed) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "r" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        actions.updatePlacementPosition(
          activePlacement.position,
          activePlacement.rotation + ROTATION_STEP,
        );
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [activePlacement, actions]);
}
