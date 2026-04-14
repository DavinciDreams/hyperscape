/**
 * useEditorWorldSync — Bridge between WorldStudioContext state and TileBasedTerrain scene
 *
 * Translates WorldStudioContext state changes into 3D scene objects:
 * - Extended layer entities (spawn points, teleports, mob spawns, resources, stations)
 *   are visualized as colored marker meshes in the viewport
 * - Markers are registered as selectables via TerrainSceneRefs.addSelectable
 * - Active placement ghost is rendered as a translucent preview mesh
 * - Teleport network connections are drawn as lines
 *
 * All geometry/material creation and scene-graph mutation logic lives in
 * utils/editorMarkers.ts. This hook is a thin React lifecycle wrapper.
 */

import * as THREE from "three/webgpu";
import { useEffect, useRef, useCallback } from "react";

import type { TerrainSceneRefs } from "../../WorldBuilder/TileBasedTerrain";
import { queueDisposal } from "../utils/deferredGpuDisposal";

import type { WorldStudioState } from "../WorldStudioContext";
import type { ExtendedWorldLayers, ActivePlacement } from "../types";

import {
  type SyncState,
  createInitialSyncState,
  syncExtendedLayers,
  syncGhostPlacement,
  syncBoundaryRing,
  disposeSyncState,
} from "../utils/editorMarkers";

// Re-export for external consumers that import from the hook module
export { getPlacementYOffset } from "../utils/editorMarkers";

// ============== HOOK ==============

interface SyncOptions {
  sceneRefs: TerrainSceneRefs | null;
  studioState: WorldStudioState;
  onSelectEntity?: (type: string, id: string) => void;
}

/**
 * Syncs WorldStudioContext state to TileBasedTerrain's 3D viewport.
 * Creates/updates/removes marker meshes for extended layer entities.
 */
export function useEditorWorldSync({
  sceneRefs,
  studioState,
  onSelectEntity,
}: SyncOptions) {
  const syncRef = useRef<SyncState>(createInitialSyncState());

  // Keep a stable ref to sceneRefs for cleanup
  const sceneRefsRef = useRef(sceneRefs);
  sceneRefsRef.current = sceneRefs;

  // Keep stable ref to onSelectEntity
  const onSelectEntityRef = useRef(onSelectEntity);
  onSelectEntityRef.current = onSelectEntity;

  // Sync extended layer entities
  const handleSyncLayers = useCallback((layers: ExtendedWorldLayers) => {
    const sync = syncRef.current;
    const refs = sceneRefsRef.current;
    if (!refs || sync.disposed) return;
    syncExtendedLayers(layers, sync, refs);
  }, []);

  // Sync ghost placement preview
  const handleSyncGhost = useCallback((placement: ActivePlacement | null) => {
    const sync = syncRef.current;
    const refs = sceneRefsRef.current;
    if (!refs || sync.disposed) return;
    syncGhostPlacement(placement, sync, refs);
  }, []);

  // Sync extended layers when they change
  useEffect(() => {
    handleSyncLayers(studioState.extendedLayers);
  }, [studioState.extendedLayers, handleSyncLayers]);

  // Sync ghost placement
  useEffect(() => {
    handleSyncGhost(studioState.tools.activePlacement);
  }, [studioState.tools.activePlacement, handleSyncGhost]);

  // World boundary ring visualization
  useEffect(() => {
    const sync = syncRef.current;
    const refs = sceneRefsRef.current;
    if (!refs || sync.disposed) return;

    const worldData = studioState.builder.editing.world;
    const islandConfig = worldData?.foundation.config.island?.enabled
      ? worldData.foundation.config.island
      : null;
    const tileSize = worldData?.foundation.config.terrain.tileSize ?? 1;

    syncBoundaryRing(sync, refs, islandConfig, tileSize);

    return () => {
      if (sync.boundaryRing) {
        refs.scene.remove(sync.boundaryRing);
        queueDisposal(sync.boundaryRing.geometry);
        queueDisposal(sync.boundaryRing.material as THREE.Material);
        sync.boundaryRing = null;
      }
    };
  }, [sceneRefs, studioState.builder.editing.world]);

  // Cleanup on unmount
  useEffect(() => {
    const sync = syncRef.current;
    return () => {
      disposeSyncState(sync, sceneRefsRef.current);
    };
  }, []);
}
