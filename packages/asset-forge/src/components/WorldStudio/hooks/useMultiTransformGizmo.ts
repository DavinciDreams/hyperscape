/**
 * useMultiTransformGizmo — Multi-select group transform for World Studio.
 *
 * When multiple entities are selected (multiSelection.length > 1):
 * - Computes the group centroid from all selected entity positions
 * - Creates a synthetic THREE.Group at the centroid
 * - Attaches TransformControls to the synthetic group
 * - On drag: computes delta from centroid, applies to all selected entities
 * - On drag end: creates a BatchTransformCommand for undo/redo
 *
 * This hook is used alongside (not replacing) useTransformGizmo, which handles
 * single-entity transforms. ViewportContainer decides which to activate.
 */

import * as THREE from "three/webgpu";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { useEffect, useRef } from "react";

import type { TerrainSceneRefs } from "../../WorldBuilder/TileBasedTerrain";
import {
  commandHistory,
  BatchTransformCommand,
  type BatchTransformEntry,
} from "../../../editor/commands";
import { useSelectionStore } from "../../../editor/stores/useSelectionStore";
import { findEntityData } from "../utils/entityActions";
import { useWorldStudio } from "../WorldStudioContext";

import type { TransformMode, TransformSpace } from "./useTransformGizmo";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MultiTransformGizmoOptions {
  sceneRefs: TerrainSceneRefs | null;
  /** Whether multi-transform should be active */
  enabled: boolean;
  /** Current transform mode (only translate is supported for multi) */
  mode: TransformMode;
  /** World or local space */
  space: TransformSpace;
  /** Whether snapping is enabled */
  snapEnabled: boolean;
  /** Grid snap size in meters */
  gridSize: number;
  /** Called when dragging state changes (for disabling orbit controls) */
  onDraggingChanged?: (isDragging: boolean) => void;
  /** Called when entities are moved via the multi-gizmo */
  onEntitiesMoved?: (
    moves: Array<{
      entityId: string;
      entityType: string;
      position: { x: number; y: number; z: number };
    }>,
  ) => void;
}

interface MultiGizmoState {
  controls: TransformControls | null;
  pivotGroup: THREE.Group | null;
  isDragging: boolean;
  dragStartCentroid: THREE.Vector3;
  /** Entity positions at drag start (entityId → position) */
  dragStartPositions: Map<
    string,
    { x: number; y: number; z: number; type: string }
  >;
}

// Snap values matching useTransformGizmo
const ROTATE_SNAP = THREE.MathUtils.degToRad(15);
const SCALE_SNAP = 0.25;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useMultiTransformGizmo({
  sceneRefs,
  enabled,
  mode,
  space,
  snapEnabled,
  gridSize,
  onDraggingChanged,
  onEntitiesMoved,
}: MultiTransformGizmoOptions) {
  const { state, actions } = useWorldStudio();
  const multiSelection = useSelectionStore((s) => s.multiSelection);

  const stateRef = useRef<MultiGizmoState>({
    controls: null,
    pivotGroup: null,
    isDragging: false,
    dragStartCentroid: new THREE.Vector3(),
    dragStartPositions: new Map(),
  });

  // Stable callback refs
  const onDraggingChangedRef = useRef(onDraggingChanged);
  onDraggingChangedRef.current = onDraggingChanged;
  const onEntitiesMovedRef = useRef(onEntitiesMoved);
  onEntitiesMovedRef.current = onEntitiesMoved;
  const studioStateRef = useRef(state);
  studioStateRef.current = state;
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const multiSelectionRef = useRef(multiSelection);
  multiSelectionRef.current = multiSelection;

  // ---- Initialize TransformControls for multi-select ----
  useEffect(() => {
    if (!sceneRefs || !enabled) return;
    const { scene, camera, container } = sceneRefs;
    const gs = stateRef.current;

    // Create a synthetic pivot group at the centroid
    const pivotGroup = new THREE.Group();
    pivotGroup.name = "__multiTransformPivot";
    pivotGroup.visible = false; // The group itself is invisible; only the gizmo shows
    scene.add(pivotGroup);
    gs.pivotGroup = pivotGroup;

    const controls = new TransformControls(camera, container);
    controls.setSize(0.6);
    // Multi-select only supports translate (rotate/scale on groups is complex)
    controls.setMode("translate");
    scene.add(controls.getHelper());
    gs.controls = controls;

    // ------ Drag lifecycle ------
    const handleDraggingChanged = (event: { value: unknown }) => {
      const dragging = event.value as boolean;
      gs.isDragging = dragging;
      onDraggingChangedRef.current?.(dragging);

      if (dragging) {
        // Store starting centroid and per-entity positions
        gs.dragStartCentroid.copy(pivotGroup.position);
        gs.dragStartPositions.clear();

        const currentState = studioStateRef.current;
        for (const sel of multiSelectionRef.current) {
          const entityData = findEntityData(currentState, sel.type, sel.id);
          if (entityData) {
            const pos = entityData.position as
              | { x: number; y: number; z: number }
              | undefined;
            if (pos) {
              gs.dragStartPositions.set(sel.id, {
                x: pos.x,
                y: pos.y,
                z: pos.z,
                type: sel.type,
              });
            }
          }
        }
      } else {
        // Drag ended — compute deltas and create BatchTransformCommand
        const delta = new THREE.Vector3().subVectors(
          pivotGroup.position,
          gs.dragStartCentroid,
        );

        if (delta.lengthSq() < 0.0001) return; // No meaningful movement

        const entries: BatchTransformEntry[] = [];
        const moves: Array<{
          entityId: string;
          entityType: string;
          position: { x: number; y: number; z: number };
        }> = [];

        for (const [entityId, startData] of gs.dragStartPositions) {
          const newPosition = {
            x: startData.x + delta.x,
            y: startData.y + delta.y,
            z: startData.z + delta.z,
          };

          const entityType = startData.type;
          // Capture entityType in closure for the onPositionChange callback
          const capturedActions = actionsRef.current;
          entries.push({
            entityId,
            oldPosition: { x: startData.x, y: startData.y, z: startData.z },
            newPosition,
            onPositionChange: (pos) => {
              applyPositionToEntity(capturedActions, entityType, entityId, pos);
            },
          });

          moves.push({ entityId, entityType, position: newPosition });
        }

        if (entries.length > 0) {
          const cmd = new BatchTransformCommand(entries);
          // Don't execute — we already applied the positions via callbacks below
          commandHistory["undoStack"].push(cmd);
          commandHistory["redoStack"].length = 0;

          // Apply positions to state
          for (const entry of entries) {
            entry.onPositionChange(entry.newPosition);
          }

          onEntitiesMovedRef.current?.(moves);
        }
      }
    };

    controls.addEventListener("dragging-changed", handleDraggingChanged);

    return () => {
      controls.removeEventListener("dragging-changed", handleDraggingChanged);
      controls.detach();
      scene.remove(controls.getHelper());
      scene.remove(pivotGroup);
      try {
        controls.dispose();
      } catch {
        // WebGPU NodeManager.delete throws when usedTimes is undefined
      }
      gs.controls = null;
      gs.pivotGroup = null;
    };
  }, [sceneRefs, enabled]);

  // ---- Update mode (force translate for multi-select) ----
  useEffect(() => {
    const { controls } = stateRef.current;
    // Multi-select only supports translate
    if (controls) controls.setMode("translate");
  }, [mode]);

  // ---- Update space ----
  useEffect(() => {
    const { controls } = stateRef.current;
    if (controls) controls.setSpace(space);
  }, [space]);

  // ---- Update snap ----
  useEffect(() => {
    const { controls } = stateRef.current;
    if (!controls) return;

    if (snapEnabled) {
      controls.setTranslationSnap(gridSize);
      controls.setRotationSnap(ROTATE_SNAP);
      controls.setScaleSnap(SCALE_SNAP);
    } else {
      controls.setTranslationSnap(null);
      controls.setRotationSnap(null);
      controls.setScaleSnap(null);
    }
  }, [snapEnabled, gridSize]);

  // ---- Compute centroid and attach controls when multi-selection changes ----
  useEffect(() => {
    const gs = stateRef.current;
    const { controls, pivotGroup } = gs;
    if (!controls || !pivotGroup || !enabled) return;

    if (multiSelection.length < 2) {
      controls.detach();
      return;
    }

    // Compute centroid from entity positions
    const centroid = new THREE.Vector3();
    let count = 0;

    for (const sel of multiSelection) {
      const entityData = findEntityData(state, sel.type, sel.id);
      if (entityData) {
        const pos = entityData.position as
          | { x: number; y: number; z: number }
          | undefined;
        if (pos) {
          centroid.x += pos.x;
          centroid.y += pos.y;
          centroid.z += pos.z;
          count++;
        }
      }
    }

    if (count === 0) {
      controls.detach();
      return;
    }

    centroid.divideScalar(count);
    pivotGroup.position.copy(centroid);

    controls.attach(pivotGroup);
  }, [sceneRefs, enabled, multiSelection, state]);

  return { isActive: enabled && multiSelection.length > 1 };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Apply a position update to the correct entity type via actions.
 * Mirrors the switch statement in ViewportContainer's handleEntityMoved.
 */
function applyPositionToEntity(
  actions: ReturnType<typeof useWorldStudio>["actions"],
  entityType: string,
  entityId: string,
  pos: { x: number; y: number; z: number },
): void {
  switch (entityType) {
    case "spawnPoint":
      actions.updateSpawnPoint(entityId, { position: pos });
      break;
    case "teleport":
      actions.updateTeleport(entityId, { position: pos });
      break;
    case "mobSpawn":
      actions.updateMobSpawn(entityId, { position: pos });
      break;
    case "resource":
      actions.updateResource(entityId, { position: pos });
      break;
    case "station":
      actions.updateStation(entityId, { position: pos });
      break;
    case "poi":
      actions.updatePOI(entityId, { position: pos });
      break;
    case "waterBody":
      actions.updateWaterBody(entityId, { surfaceY: pos.y });
      break;
    default:
      // Game entities (gameNpc, gameStation, etc.) — visual only for now
      break;
  }
}
