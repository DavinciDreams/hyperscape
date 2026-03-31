/**
 * useTransformGizmo — Three.js TransformControls integration for World Studio.
 *
 * Inspired by UE5's transform gizmo:
 * - W = Translate, E = Rotate, R = Scale
 * - Ctrl = grid snap (0.25m translate, 15° rotate, 0.25 scale)
 * - Gizmo interaction mode disables OrbitControls left-click
 * - Creates undo/redo commands via CommandHistory
 *
 * Handles a critical edge case: game world entities (from GameWorldEntitySync)
 * have their children positioned in world-space while the parent group sits at
 * (0,0,0). Without normalization the gizmo would appear at the world origin
 * instead of at the entity's visual location.
 */

import * as THREE from "three";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { useEffect, useRef, useCallback } from "react";

import type { TerrainSceneRefs } from "../../WorldBuilder/TileBasedTerrain";
import {
  commandHistory,
  MoveEntityCommand,
  RotateEntityCommand,
  ScaleEntityCommand,
} from "../../../editor/commands";

export type TransformMode = "translate" | "rotate" | "scale";
export type TransformSpace = "world" | "local";

interface TransformGizmoOptions {
  sceneRefs: TerrainSceneRefs | null;
  /** The selectableId of the currently selected entity */
  selectedSelectableId: string | null;
  /** Current transform mode */
  mode: TransformMode;
  /** World or local space */
  space: TransformSpace;
  /** Whether snapping is enabled */
  snapEnabled: boolean;
  /** Surface snap: keep entity Y on terrain surface during translate */
  surfaceSnap: boolean;
  /** Called when an entity is moved via the gizmo */
  onEntityMoved?: (
    entityId: string,
    position: { x: number; y: number; z: number },
  ) => void;
  /** Called when an entity is rotated via the gizmo */
  onEntityRotated?: (
    entityId: string,
    rotation: { x: number; y: number; z: number },
  ) => void;
  /** Called when an entity is scaled via the gizmo */
  onEntityScaled?: (
    entityId: string,
    scale: { x: number; y: number; z: number },
  ) => void;
  /** Called when dragging state changes (for disabling orbit controls) */
  onDraggingChanged?: (isDragging: boolean) => void;
}

// Snap values — finer than default for precise positioning
const TRANSLATE_SNAP = 0.25; // 25cm
const ROTATE_SNAP = THREE.MathUtils.degToRad(15); // 15 degrees
const SCALE_SNAP = 0.25;

interface GizmoState {
  controls: TransformControls | null;
  attachedObject: THREE.Object3D | null;
  attachedEntityId: string | null;
  dragStartPosition: THREE.Vector3;
  dragStartRotation: THREE.Euler;
  dragStartScale: THREE.Vector3;
  isDragging: boolean;
  /** Whether we normalized the object's position on attach */
  wasNormalized: boolean;
}

// ---------------------------------------------------------------------------
// Scene search
// ---------------------------------------------------------------------------

/**
 * Find a selectable object by selectableId.
 * Checks the entity overlay first (editor-placed markers) for O(n) on a
 * smaller set, then falls back to full scene traversal for game entities.
 */
function findSelectableInScene(
  scene: THREE.Scene,
  entityOverlay: THREE.Group,
  selectableId: string,
): THREE.Object3D | null {
  // Fast path — editor entity markers
  for (const child of entityOverlay.children) {
    if (
      child.userData?.selectable &&
      child.userData?.selectableId === selectableId
    ) {
      return child;
    }
  }
  // Slow path — game world entities / foundation objects
  let found: THREE.Object3D | null = null;
  scene.traverse((obj) => {
    if (found) return;
    if (
      obj.userData?.selectable &&
      obj.userData?.selectableId === selectableId
    ) {
      found = obj;
    }
  });
  return found;
}

// ---------------------------------------------------------------------------
// Position normalization for game-world entities
// ---------------------------------------------------------------------------

/**
 * Game entities from GameWorldEntitySync place children in world-space
 * coordinates while the parent group stays at (0,0,0).  TransformControls
 * positions the gizmo at the attached object's origin, so without
 * normalization the gizmo appears at the scene origin.
 *
 * Normalization moves the group to its bounding-box center and converts
 * all children to local-space positions.  The visual result is identical —
 * every child's world position is preserved.
 */
function normalizeGroupPosition(obj: THREE.Object3D): boolean {
  if (obj.children.length === 0) return false;

  const bbox = new THREE.Box3().setFromObject(obj);
  if (bbox.isEmpty()) return false;

  const center = bbox.getCenter(new THREE.Vector3());
  const offset = center.clone().sub(obj.position);

  // Only normalize when there's a meaningful discrepancy (> 2 world units)
  if (offset.length() < 2) return false;

  // Shift children into local space relative to the new group center
  for (const child of obj.children) {
    child.position.sub(offset);
  }
  obj.position.copy(center);

  return true;
}

/**
 * Reverse of normalizeGroupPosition — restores children to world-space
 * positions and resets the group back to the origin.
 */
function denormalizeGroupPosition(obj: THREE.Object3D): void {
  const groupPos = obj.position.clone();
  if (groupPos.lengthSq() < 0.0001) return; // Already at origin

  for (const child of obj.children) {
    child.position.add(groupPos);
  }
  obj.position.set(0, 0, 0);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

// Pre-allocated objects for terrain raycast (avoids GC in hot path)
const _surfaceRayOrigin = new THREE.Vector3();
const _surfaceRayDir = new THREE.Vector3(0, -1, 0);
const _surfaceRaycaster = new THREE.Raycaster();
const _surfaceBBox = new THREE.Box3();

export function useTransformGizmo({
  sceneRefs,
  selectedSelectableId,
  mode,
  space,
  snapEnabled,
  surfaceSnap,
  onEntityMoved,
  onEntityRotated,
  onEntityScaled,
  onDraggingChanged,
}: TransformGizmoOptions) {
  const stateRef = useRef<GizmoState>({
    controls: null,
    attachedObject: null,
    attachedEntityId: null,
    dragStartPosition: new THREE.Vector3(),
    dragStartRotation: new THREE.Euler(),
    dragStartScale: new THREE.Vector3(1, 1, 1),
    isDragging: false,
    wasNormalized: false,
  });

  // Stable callback refs
  const onEntityMovedRef = useRef(onEntityMoved);
  onEntityMovedRef.current = onEntityMoved;
  const onEntityRotatedRef = useRef(onEntityRotated);
  onEntityRotatedRef.current = onEntityRotated;
  const onEntityScaledRef = useRef(onEntityScaled);
  onEntityScaledRef.current = onEntityScaled;
  const onDraggingChangedRef = useRef(onDraggingChanged);
  onDraggingChangedRef.current = onDraggingChanged;
  const surfaceSnapRef = useRef(surfaceSnap);
  surfaceSnapRef.current = surfaceSnap;

  // ---- Initialize TransformControls ----
  useEffect(() => {
    if (!sceneRefs) return;
    const { scene, camera, container, terrainContainer } = sceneRefs;
    const gizmo = stateRef.current;

    const controls = new TransformControls(camera, container);
    controls.setSize(0.5); // Compact gizmo — UE5-like
    scene.add(controls.getHelper());
    gizmo.controls = controls;

    // ------ Surface snap: project Y onto terrain during translate ------
    const handleObjectChange = () => {
      if (!surfaceSnapRef.current) return;
      if (controls.mode !== "translate") return;
      if (!gizmo.attachedObject || !gizmo.isDragging) return;

      const obj = gizmo.attachedObject;
      // Raycast straight down from high above the entity's XZ position
      _surfaceRayOrigin.set(obj.position.x, 500, obj.position.z);
      _surfaceRaycaster.set(_surfaceRayOrigin, _surfaceRayDir);
      const hits = _surfaceRaycaster.intersectObject(terrainContainer, true);
      if (hits.length > 0) {
        // Place the entity's bounding-box bottom on the terrain, not its pivot.
        // After normalization the pivot is at the bbox center, so without this
        // offset the entity would be buried halfway into the ground.
        _surfaceBBox.setFromObject(obj);
        const bottomOffset = obj.position.y - _surfaceBBox.min.y;
        obj.position.y = hits[0].point.y + bottomOffset;
      }
    };
    controls.addEventListener("objectChange", handleObjectChange);

    // ------ Drag lifecycle ------
    const handleDraggingChanged = (event: { value: unknown }) => {
      const dragging = event.value as boolean;
      gizmo.isDragging = dragging;
      onDraggingChangedRef.current?.(dragging);

      if (dragging && gizmo.attachedObject) {
        // Hide labels so they don't block the gizmo during transform
        for (const child of gizmo.attachedObject.children) {
          if (child.userData?.isLabel) child.visible = false;
        }
        // Store starting transform for undo
        gizmo.dragStartPosition.copy(gizmo.attachedObject.position);
        gizmo.dragStartRotation.copy(gizmo.attachedObject.rotation);
        gizmo.dragStartScale.copy(gizmo.attachedObject.scale);
      } else if (!dragging && gizmo.attachedObject && gizmo.attachedEntityId) {
        // Restore label visibility after drag
        for (const child of gizmo.attachedObject.children) {
          if (child.userData?.isLabel) child.visible = true;
        }
        // Drag ended — create undo/redo command and notify callbacks
        const obj = gizmo.attachedObject;
        const entityId = gizmo.attachedEntityId;

        if (controls.mode === "translate") {
          const oldPos = {
            x: gizmo.dragStartPosition.x,
            y: gizmo.dragStartPosition.y,
            z: gizmo.dragStartPosition.z,
          };
          const newPos = {
            x: obj.position.x,
            y: obj.position.y,
            z: obj.position.z,
          };
          if (
            oldPos.x !== newPos.x ||
            oldPos.y !== newPos.y ||
            oldPos.z !== newPos.z
          ) {
            const cmd = new MoveEntityCommand(
              entityId,
              {
                object3D: obj,
                onPositionChange: (pos) =>
                  onEntityMovedRef.current?.(entityId, pos),
              },
              oldPos,
              newPos,
            );
            // Don't execute — TransformControls already moved the object
            commandHistory["undoStack"].push(cmd);
            commandHistory["redoStack"].length = 0;
            onEntityMovedRef.current?.(entityId, newPos);
          }
        } else if (controls.mode === "rotate") {
          const oldRot = {
            x: gizmo.dragStartRotation.x,
            y: gizmo.dragStartRotation.y,
            z: gizmo.dragStartRotation.z,
          };
          const newRot = {
            x: obj.rotation.x,
            y: obj.rotation.y,
            z: obj.rotation.z,
          };
          if (
            oldRot.x !== newRot.x ||
            oldRot.y !== newRot.y ||
            oldRot.z !== newRot.z
          ) {
            const cmd = new RotateEntityCommand(
              entityId,
              {
                object3D: obj,
                onRotationChange: (rot) =>
                  onEntityRotatedRef.current?.(entityId, rot),
              },
              oldRot,
              newRot,
            );
            commandHistory["undoStack"].push(cmd);
            commandHistory["redoStack"].length = 0;
            onEntityRotatedRef.current?.(entityId, newRot);
          }
        } else if (controls.mode === "scale") {
          const oldScale = {
            x: gizmo.dragStartScale.x,
            y: gizmo.dragStartScale.y,
            z: gizmo.dragStartScale.z,
          };
          const newScale = { x: obj.scale.x, y: obj.scale.y, z: obj.scale.z };
          if (
            oldScale.x !== newScale.x ||
            oldScale.y !== newScale.y ||
            oldScale.z !== newScale.z
          ) {
            const cmd = new ScaleEntityCommand(
              entityId,
              {
                object3D: obj,
                onScaleChange: (s) => onEntityScaledRef.current?.(entityId, s),
              },
              oldScale,
              newScale,
            );
            commandHistory["undoStack"].push(cmd);
            commandHistory["redoStack"].length = 0;
            onEntityScaledRef.current?.(entityId, newScale);
          }
        }
      }
    };

    controls.addEventListener("dragging-changed", handleDraggingChanged);

    return () => {
      controls.removeEventListener("objectChange", handleObjectChange);
      controls.removeEventListener("dragging-changed", handleDraggingChanged);
      // Restore normalization before cleanup
      if (gizmo.wasNormalized && gizmo.attachedObject) {
        denormalizeGroupPosition(gizmo.attachedObject);
        gizmo.wasNormalized = false;
      }
      controls.detach();
      scene.remove(controls.getHelper());
      controls.dispose();
      gizmo.controls = null;
      gizmo.attachedObject = null;
      gizmo.attachedEntityId = null;
    };
  }, [sceneRefs]);

  // ---- Update mode ----
  useEffect(() => {
    const { controls } = stateRef.current;
    if (controls) controls.setMode(mode);
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
      controls.setTranslationSnap(TRANSLATE_SNAP);
      controls.setRotationSnap(ROTATE_SNAP);
      controls.setScaleSnap(SCALE_SNAP);
    } else {
      controls.setTranslationSnap(null);
      controls.setRotationSnap(null);
      controls.setScaleSnap(null);
    }
  }, [snapEnabled]);

  // ---- Attach / detach based on selection ----
  useEffect(() => {
    const gizmo = stateRef.current;
    const { controls } = gizmo;
    if (!controls || !sceneRefs) return;

    // Denormalize previous attachment
    if (gizmo.wasNormalized && gizmo.attachedObject) {
      denormalizeGroupPosition(gizmo.attachedObject);
      gizmo.wasNormalized = false;
    }

    if (!selectedSelectableId) {
      controls.detach();
      gizmo.attachedObject = null;
      gizmo.attachedEntityId = null;
      return;
    }

    // Find the 3D object for this selectable
    const obj = findSelectableInScene(
      sceneRefs.scene,
      sceneRefs.entityOverlay,
      selectedSelectableId,
    );

    if (obj && obj.userData?.selectable) {
      // Normalize group position so the gizmo appears at the entity's
      // visual center instead of at a potentially wrong origin.
      // Skip for promoted vegetation proxies — they're already correctly
      // positioned (group transform = instance matrix, children at origin).
      const wasNormalized = obj.userData._vegPromo
        ? false
        : normalizeGroupPosition(obj);
      gizmo.wasNormalized = wasNormalized;

      controls.attach(obj);
      gizmo.attachedObject = obj;
      gizmo.attachedEntityId = selectedSelectableId;
    } else {
      controls.detach();
      gizmo.attachedObject = null;
      gizmo.attachedEntityId = null;
    }
  }, [sceneRefs, selectedSelectableId]);

  /** Get the current attached object for external reference */
  const getAttachedObject = useCallback((): THREE.Object3D | null => {
    return stateRef.current.attachedObject;
  }, []);

  return { getAttachedObject };
}
