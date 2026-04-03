/**
 * useSelectionOutline — Visual selection feedback for the World Studio viewport.
 *
 * Creates a wireframe bounding box around the selected object. Works with both
 * Groups (entity markers) and individual Meshes (buildings, roads).
 *
 * Inspired by UE5's selection highlight — uses a blue wireframe bounding box.
 */

import * as THREE from "three";
import { MeshBasicNodeMaterial } from "three/webgpu";
import { useEffect, useRef } from "react";

import type { TerrainSceneRefs } from "../../WorldBuilder/TileBasedTerrain";

/** Safely dispose a material — WebGPU NodeManager may crash if the material was never rendered */
function safeDispose(resource: { dispose(): void }): void {
  try {
    resource.dispose();
  } catch {
    // WebGPU NodeManager.delete throws when usedTimes is undefined on unrendered materials
  }
}

const OUTLINE_COLOR = 0x4fc3f7; // Light blue (UE5-inspired)
const OUTLINE_OPACITY = 0.9;
const OUTLINE_PADDING = 0.3; // Padding around bounding box

interface SelectionOutlineOptions {
  sceneRefs: TerrainSceneRefs | null;
  /** The selectableId of the currently selected object (matches userData.selectableId) */
  selectedSelectableId: string | null;
}

interface OutlineState {
  mesh: THREE.Mesh | null;
  currentId: string | null;
}

/**
 * Finds the 3D object matching a selectableId from the selectable objects list.
 * Walks all scene children recursively to find the match.
 */
function findSelectableObject(
  scene: THREE.Scene,
  entityOverlay: THREE.Group,
  selectableId: string,
): THREE.Object3D | null {
  // Search entity overlay first (editor-placed entities)
  for (const child of entityOverlay.children) {
    if (child.userData?.selectableId === selectableId) return child;
  }

  // Search the entire scene for game world entities and foundation objects
  let found: THREE.Object3D | null = null;
  scene.traverse((obj) => {
    if (found) return;
    if (obj.userData?.selectableId === selectableId) {
      found = obj;
    }
  });
  return found;
}

export function useSelectionOutline({
  sceneRefs,
  selectedSelectableId,
}: SelectionOutlineOptions) {
  const stateRef = useRef<OutlineState>({ mesh: null, currentId: null });

  useEffect(() => {
    const state = stateRef.current;
    if (!sceneRefs) return;
    const { scene, entityOverlay } = sceneRefs;

    // Clean up existing outline
    const cleanup = () => {
      if (state.mesh) {
        scene.remove(state.mesh);
        safeDispose(state.mesh.geometry);
        if (state.mesh.material instanceof THREE.Material) {
          safeDispose(state.mesh.material);
        }
        state.mesh = null;
      }
      state.currentId = null;
    };

    // If no selection, remove outline
    if (!selectedSelectableId) {
      cleanup();
      return;
    }

    // If same object already outlined, skip
    if (state.currentId === selectedSelectableId && state.mesh) return;

    // Clean previous and create new
    cleanup();

    const selectedObject = findSelectableObject(
      scene,
      entityOverlay,
      selectedSelectableId,
    );
    if (!selectedObject) return;

    // Compute bounding box from the selected object
    const box = new THREE.Box3().setFromObject(selectedObject);
    if (box.isEmpty()) return;

    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    // Create wireframe box as selection indicator
    const outlineGeometry = new THREE.BoxGeometry(
      size.x + OUTLINE_PADDING,
      size.y + OUTLINE_PADDING,
      size.z + OUTLINE_PADDING,
    );
    const outlineMaterial = new MeshBasicNodeMaterial();
    outlineMaterial.color = new THREE.Color(OUTLINE_COLOR);
    outlineMaterial.wireframe = true;
    outlineMaterial.transparent = true;
    outlineMaterial.opacity = OUTLINE_OPACITY;
    outlineMaterial.depthTest = false;

    const outline = new THREE.Mesh(outlineGeometry, outlineMaterial);
    outline.position.copy(center);
    outline.renderOrder = 999;
    outline.name = "selection-outline";

    scene.add(outline);
    state.mesh = outline;
    state.currentId = selectedSelectableId;

    return cleanup;
  }, [sceneRefs, selectedSelectableId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const state = stateRef.current;
      if (state.mesh) {
        safeDispose(state.mesh.geometry);
        if (state.mesh.material instanceof THREE.Material) {
          safeDispose(state.mesh.material);
        }
        state.mesh = null;
      }
    };
  }, []);
}
