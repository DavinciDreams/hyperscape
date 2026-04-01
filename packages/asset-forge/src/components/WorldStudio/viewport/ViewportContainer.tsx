/**
 * ViewportContainer — Hosts the TileBasedTerrain 3D viewport for both
 * creation and editing modes.
 *
 * In creation mode: terrain preview with generation controls.
 * In editing mode: same terrain + editing tools (select, place, brush).
 *
 * The TileBasedTerrain component exposes scene refs via onSceneReady,
 * allowing editing tools to add entity markers, ghost previews, etc.
 * to the same Three.js scene without switching renderers.
 *
 * Phase 1 additions:
 * - Selection outline (blue bounding box wireframe)
 * - Transform gizmo (translate/rotate/scale)
 * - F-to-focus camera animation
 */

import * as THREE from "three";
import React, {
  useRef,
  useCallback,
  useState,
  useEffect,
  useMemo,
} from "react";

import {
  TileBasedTerrain,
  type TerrainSceneRefs,
  type ViewportSelection,
  type ViewMode,
  type GameEntityData,
} from "../../WorldBuilder/TileBasedTerrain";
import { useWorldStudio } from "../WorldStudioContext";
import { useEditorWorldSync } from "../hooks/useEditorWorldSync";
import { usePlacementInteraction } from "../hooks/usePlacementInteraction";
import { useBrushInteraction } from "../hooks/useBrushInteraction";
import { usePlacementConfirmation } from "../hooks/usePlacementConfirmation";
import { useBrushOverlaySync } from "../hooks/useBrushOverlaySync";
import { useAreaBoundaryOverlay } from "../hooks/useAreaBoundaryOverlay";
import { commandHistory } from "../../../editor/commands";
import { useSelectionOutline } from "../hooks/useSelectionOutline";
import { useTransformGizmo } from "../hooks/useTransformGizmo";
import { useCameraBookmarks } from "../hooks/useCameraBookmarks";
import { ContextMenu, type ContextMenuItem } from "../layout/ContextMenu";
import { useContextMenu } from "../layout/useContextMenu";
import { executeDuplicate, executeDelete } from "../utils/entityActions";
import { ViewModeDropdown } from "./ViewModeDropdown";
import { ViewportOverlay } from "./ViewportOverlay";
import { GenerateTownDialog } from "../panels/GenerateTownDialog";

/**
 * Derive the selectableId used in the 3D scene from a WorldStudio selection.
 * This bridges the gap between Selection.id (entityId) and userData.selectableId.
 *
 * For game world entities (from GameWorldEntitySync), selectableId = group.name
 * e.g., "npc_cook", "station_anvil_2", etc. The Selection.id stores just entityId.
 * We need the selectableId to find the 3D object in the scene.
 */
function getSelectableIdFromSelection(
  selection: {
    type: string;
    id: string;
    entityData?: Record<string, unknown>;
  } | null,
): string | null {
  if (!selection) return null;
  // Extended layer entities use their id directly as selectableId
  const EXTENDED_TYPES = new Set([
    "spawnPoint",
    "teleport",
    "mobSpawn",
    "resource",
    "station",
    "poi",
    "waterBody",
  ]);
  if (EXTENDED_TYPES.has(selection.type)) return selection.id;

  // Game world entities: entityData may contain the selectableId
  if (selection.entityData?.selectableId) {
    return selection.entityData.selectableId as string;
  }

  // Foundation elements and procgen structures use their id
  if (
    selection.type === "town" ||
    selection.type === "building" ||
    selection.type === "road" ||
    selection.type === "bridge" ||
    selection.type === "duelArena"
  ) {
    return selection.id;
  }

  // Vegetation instances: promoted proxy uses selection.id as selectableId
  if (selection.type === "vegetation") {
    return selection.id;
  }

  return null;
}

export function ViewportContainer() {
  const { state, actions, viewportRef } = useWorldStudio();
  const isEditing = state.builder.mode === "editing";
  // In editing mode, use the loaded world's foundation config (preserves useGamePipeline, etc.)
  // In creation mode, use the creation panel config
  const config =
    isEditing && state.builder.editing.world
      ? state.builder.editing.world.foundation.config
      : state.builder.creation.config;

  // Scene refs from TileBasedTerrain for editing tool integration
  const sceneRefsRef = useRef<TerrainSceneRefs | null>(null);
  const [sceneReady, setSceneReady] = useState(false);

  const handleSceneReady = useCallback(
    (refs: TerrainSceneRefs) => {
      sceneRefsRef.current = refs;
      // Expose refreshVegetation to sibling components via viewportRef
      viewportRef.current.refreshVegetation = refs.refreshVegetation;
      viewportRef.current.navigateCamera = refs.navigateCamera;
      setSceneReady(true);
    },
    [viewportRef],
  );

  const handleGameEntitiesLoaded = useCallback(
    (data: GameEntityData) => {
      actions.setGameEntities(data);
    },
    [actions],
  );

  const activeSceneRefs = sceneReady ? sceneRefsRef.current : null;

  // ----- View mode state -----
  const [viewMode, setViewMode] = useState<ViewMode>("lit");
  const [gridVisible, setGridVisible] = useState(false);

  // ----- Tile loading progress -----
  const [tileProgress, setTileProgress] = useState<{
    loaded: number;
    total: number;
  } | null>(null);

  // ----- Context menu -----
  const { contextMenu, showContextMenuAt, hideContextMenu } = useContextMenu();

  // ----- Viewport context menu from TileBasedTerrain (quick RMB click) -----
  const handleViewportContextMenu = useCallback(
    (x: number, y: number) => {
      if (!isEditing) return;
      showContextMenuAt(x, y);
    },
    [isEditing, showContextMenuAt],
  );

  // ----- Generate Town dialog state -----
  const [townDialogPosition, setTownDialogPosition] = useState<{
    x: number;
    y: number;
    z: number;
  } | null>(null);

  // ----- Camera bookmarks -----
  const projectId = state.project.currentProjectId ?? "";
  const { bookmarks, addBookmark } = useCameraBookmarks(projectId);

  // ----- Transform gizmo state -----
  const transformMode = state.tools.transformMode;
  const transformSpace = state.tools.transformSpace;
  const [snapEnabled, setSnapEnabled] = useState(false);
  const [surfaceSnap, setSurfaceSnap] = useState(true);

  // Derive the selectableId from the current selection
  const selection = state.builder.editing.selection;
  const selectedSelectableId = useMemo(
    () =>
      getSelectableIdFromSelection(
        selection as {
          type: string;
          id: string;
          entityData?: Record<string, unknown>;
        } | null,
      ),
    [selection],
  );

  // ----- Vegetation instance promote/demote for gizmo transform -----
  // InstancedMesh instances can't be individually transformed by TransformControls.
  // When a biome tree is selected, we "promote" it into a standalone Object3D,
  // and "demote" it back to the InstancedMesh when deselected.
  const vegProxyRef = useRef<THREE.Group | null>(null);

  useEffect(() => {
    if (!activeSceneRefs) return;

    // Demote previous proxy if selection changed away from it
    if (vegProxyRef.current) {
      const prevId = vegProxyRef.current.userData.selectableId;
      if (
        !selection ||
        selection.type !== "vegetation" ||
        selection.id !== prevId
      ) {
        activeSceneRefs.demoteVegetationInstance(vegProxyRef.current);
        vegProxyRef.current = null;
      }
    }

    // Promote new vegetation instance if selected
    if (
      selection?.type === "vegetation" &&
      selection.entityData?.species &&
      selection.entityData?.instanceIndex !== undefined &&
      !vegProxyRef.current
    ) {
      const proxy = activeSceneRefs.promoteVegetationInstance(
        selection.entityData.species as string,
        selection.entityData.instanceIndex as number,
        selection.id,
      );
      vegProxyRef.current = proxy;
    }
  }, [activeSceneRefs, selection]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (vegProxyRef.current && sceneRefsRef.current) {
        sceneRefsRef.current.demoteVegetationInstance(vegProxyRef.current);
        vegProxyRef.current = null;
      }
    };
  }, []);

  // ----- Interaction mode management -----
  const activeTool = state.tools.activeTool;
  const hasActivePlacement =
    !!state.tools.activePlacement && !state.tools.activePlacement.confirmed;

  // Compute showGizmo early — needed for interaction mode decision
  const MOVABLE_TYPES = useMemo(
    () =>
      new Set([
        "spawnPoint",
        "teleport",
        "mobSpawn",
        "resource",
        "station",
        "poi",
        "waterBody",
        "gameNpc",
        "gameStation",
        "gameResource",
        "gameMobSpawn",
        "npc",
        "quest",
        "boss",
        "event",
        "lore",
        "vegetation",
        "bridge",
        "duelArena",
        "building",
      ]),
    [],
  );
  const showGizmo =
    isEditing &&
    activeTool === "select" &&
    selection &&
    MOVABLE_TYPES.has(selection.type);

  const needsToolMode =
    isEditing &&
    (activeTool === "brush" || activeTool === "place" || hasActivePlacement);

  useEffect(() => {
    if (!activeSceneRefs) return;
    if (showGizmo) {
      // Gizmo visible: left free for gizmo handles, middle = orbit, right = pan
      activeSceneRefs.setInteractionMode("gizmo");
    } else if (needsToolMode) {
      activeSceneRefs.setInteractionMode("tool");
    } else {
      activeSceneRefs.setInteractionMode("orbit");
    }
  }, [activeSceneRefs, needsToolMode, showGizmo]);

  // ----- View mode sync -----
  const handleViewModeChange = useCallback(
    (mode: ViewMode) => {
      setViewMode(mode);
      activeSceneRefs?.setViewMode(mode);
    },
    [activeSceneRefs],
  );

  // ----- Grid toggle -----
  const handleGridToggle = useCallback(() => {
    setGridVisible((v) => {
      const next = !v;
      activeSceneRefs?.setGridVisible(next);
      return next;
    });
  }, [activeSceneRefs]);

  // ----- Snap toggle (click-based, complements Ctrl hold) -----
  const handleSnapToggle = useCallback(() => {
    setSnapEnabled((v) => !v);
  }, []);

  // ----- Surface snap toggle (terrain snapping during translate) -----
  const handleSurfaceSnapToggle = useCallback(() => {
    setSurfaceSnap((v) => !v);
  }, []);

  // ----- Selection outline -----
  useSelectionOutline({
    sceneRefs: activeSceneRefs,
    selectedSelectableId: isEditing ? selectedSelectableId : null,
  });

  // ----- Transform gizmo -----

  // ----- Gizmo transform persistence -----
  // Map selection type → update action for extended layer entities
  const handleEntityMoved = useCallback(
    (entityId: string, position: { x: number; y: number; z: number }) => {
      if (!selection) return;
      const pos = { x: position.x, y: position.y, z: position.z };
      switch (selection.type) {
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
    },
    [selection, actions],
  );

  const handleEntityRotated = useCallback(
    (entityId: string, rotation: { x: number; y: number; z: number }) => {
      if (!selection) return;
      // Extended layer entities store rotation as a single Y-axis value
      const rotY = rotation.y;
      switch (selection.type) {
        case "spawnPoint":
          actions.updateSpawnPoint(entityId, { rotation: rotY });
          break;
        case "resource":
          actions.updateResource(entityId, { rotation: rotY });
          break;
        case "station":
          actions.updateStation(entityId, { rotation: rotY });
          break;
        default:
          break;
      }
    },
    [selection, actions],
  );

  const handleEntityScaled = useCallback(
    (_entityId: string, _scale: { x: number; y: number; z: number }) => {
      // Scale is visual-only — extended layer entities don't have a scale field
    },
    [],
  );

  useTransformGizmo({
    sceneRefs: activeSceneRefs,
    selectedSelectableId: showGizmo ? selectedSelectableId : null,
    mode: transformMode,
    space: transformSpace,
    snapEnabled,
    surfaceSnap,
    onEntityMoved: handleEntityMoved,
    onEntityRotated: handleEntityRotated,
    onEntityScaled: handleEntityScaled,
    onDraggingChanged: undefined,
  });

  // ----- Keyboard shortcuts for gizmo -----
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore when typing in inputs
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      )
        return;
      if (!isEditing) return;

      // During RMB fly mode, WASD/QE/F are used for camera — don't intercept
      const isInFlyMode = document.pointerLockElement != null;

      // W = translate, E = rotate, R = scale (matches UE5) — only outside fly mode
      if (
        !isInFlyMode &&
        e.key === "w" &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        activeTool === "select"
      ) {
        e.preventDefault();
        actions.setTransformMode("translate");
        return;
      }
      if (
        !isInFlyMode &&
        e.key === "e" &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        activeTool === "select"
      ) {
        e.preventDefault();
        actions.setTransformMode("rotate");
        return;
      }
      if (
        !isInFlyMode &&
        e.key === "r" &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        activeTool === "select"
      ) {
        e.preventDefault();
        actions.setTransformMode("scale");
        return;
      }

      // F = focus on selected object — only outside fly mode
      if (
        !isInFlyMode &&
        e.key === "f" &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        selectedSelectableId &&
        activeSceneRefs
      ) {
        e.preventDefault();
        // Find the selected object and focus camera on it
        let found: THREE.Object3D | null = null;
        activeSceneRefs.scene.traverse((obj) => {
          if (found) return;
          if (obj.userData?.selectableId === selectedSelectableId) {
            found = obj;
          }
        });
        if (found) {
          const box = new THREE.Box3().setFromObject(found);
          const center = box.getCenter(new THREE.Vector3());
          const size = box.getSize(new THREE.Vector3());
          const radius = size.length() / 2;
          activeSceneRefs.focusOnPosition(center, radius);
        }
        return;
      }

      // Delete selected entity — delegates to shared utility for command history
      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        selection &&
        activeTool === "select"
      ) {
        e.preventDefault();
        executeDelete(state, actions, selection.type, selection.id);
        return;
      }

      // Toggle snap with Ctrl (hold)
      // Handled via keydown/keyup below
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      // Snap toggle via Ctrl hold is handled here
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("keyup", handleKeyUp);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("keyup", handleKeyUp);
    };
  }, [
    isEditing,
    activeTool,
    selectedSelectableId,
    activeSceneRefs,
    selection,
    state.extendedLayers,
    actions,
  ]);

  // Ctrl hold for snap toggle
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Control") setSnapEnabled(true);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Control") setSnapEnabled(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("keyup", handleKeyUp);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  // ----- Camera position polling (for viewport overlay) -----
  // Only update state when position has meaningfully changed (>1 unit) to avoid
  // cascading re-renders in minimap/overlay every 500ms.
  const [cameraPosition, setCameraPosition] = useState<
    { x: number; y: number; z: number } | undefined
  >(undefined);
  const lastCamPosRef = useRef<{ x: number; y: number; z: number }>({
    x: 0,
    y: 0,
    z: 0,
  });
  useEffect(() => {
    if (!activeSceneRefs) return;
    const interval = setInterval(() => {
      const cam = activeSceneRefs.camera;
      const lp = lastCamPosRef.current;
      const dx = cam.position.x - lp.x;
      const dy = cam.position.y - lp.y;
      const dz = cam.position.z - lp.z;
      // Only trigger React re-render if camera moved >1 unit
      if (dx * dx + dy * dy + dz * dz > 1) {
        const pos = { x: cam.position.x, y: cam.position.y, z: cam.position.z };
        lastCamPosRef.current = pos;
        setCameraPosition(pos);
      }
    }, 500);
    return () => clearInterval(interval);
  }, [activeSceneRefs]);

  // ----- Camera teleport from outliner selection -----
  const teleportTarget = state.tools.cameraTeleportTarget;
  useEffect(() => {
    if (!teleportTarget) return;
    viewportRef.current.navigateCamera?.(
      teleportTarget.x,
      teleportTarget.z,
      teleportTarget.close,
    );
    actions.cameraTeleportConsumed();
  }, [teleportTarget, viewportRef, actions]);

  // ----- Entity count for viewport overlay -----
  const entityCount = useMemo(() => {
    const ext = state.extendedLayers;
    const world = state.builder.editing.world;
    let count = 0;
    count += ext.spawnPoints.length;
    count += ext.teleports.length;
    count += ext.mobSpawns.length;
    count += ext.resources.length;
    count += ext.stations.length;
    count += ext.pois.length;
    count += ext.waterBodies.length;
    if (world) {
      count += world.layers.npcs.length;
      count += world.layers.quests.length;
      count += world.layers.bosses.length;
      count += world.layers.events.length;
    }
    return count;
  }, [state.extendedLayers, state.builder.editing.world]);

  // ----- Editing hooks (self-guard on null sceneRefs / inactive tools) -----

  // Sync extended-layer entity markers and ghost preview to the 3D scene
  useEditorWorldSync({
    sceneRefs: activeSceneRefs,
    studioState: state,
    onSelectEntity: useCallback(
      (type: string, id: string) => {
        if (!isEditing) return;
        actions.setSelection({
          type: type as never,
          id,
          path: [{ type, id, name: id }],
        });
      },
      [isEditing, actions],
    ),
  });

  // Click-to-place viewport interaction (raycasts, rotation, confirm/cancel)
  usePlacementInteraction({
    sceneRefs: activeSceneRefs,
  });

  // Brush painting (terrain sculpt, biome paint, vegetation, collision)
  useBrushInteraction({
    sceneRefs: activeSceneRefs,
    studioState: state,
    onTerrainSculpt: useCallback(
      (stroke) => actions.addTerrainSculpt(stroke),
      [actions],
    ),
    onBiomePaint: useCallback(
      (stroke) => actions.addBiomePaint(stroke),
      [actions],
    ),
    onVegetationPaint: useCallback(
      (stroke) => actions.addVegetationPaint(stroke),
      [actions],
    ),
    onTileCollision: useCallback(
      (tiles) => actions.setTileCollision(tiles),
      [actions],
    ),
  });

  // Apply brush strokes to terrain geometry (visual feedback)
  useBrushOverlaySync({
    sceneRefs: activeSceneRefs,
    studioState: state,
  });

  // Area boundary overlays (difficulty zones, town boundaries, biome regions)
  useAreaBoundaryOverlay(activeSceneRefs);

  // Convert confirmed placement ghost into an actual entity in state
  usePlacementConfirmation();

  // ----- TileBasedTerrain callbacks -----

  // Handle tile count changes during creation preview
  const handleTileCountChange = useCallback(
    (loaded: number, total: number) => {
      setTileProgress({ loaded, total });
      if (loaded > 0 && state.builder.creation.isGenerating) {
        actions.finishGeneration({
          generationTime: 0,
          tiles: total,
          biomes: 0,
          towns: 0,
          roads: 0,
        });
      }
    },
    [state.builder.creation.isGenerating, actions],
  );

  // Map TileBasedTerrain selection to WorldStudio selection
  const handleSelect = useCallback(
    (selection: ViewportSelection | null) => {
      if (!isEditing) return;
      if (!selection) {
        actions.setSelection(null);
        return;
      }
      // Map viewport selection types to WorldStudio selection
      if (
        selection.type === "entity" &&
        selection.entityType &&
        selection.entityId
      ) {
        // Map game world entity types to Selection types
        const GAME_ENTITY_TYPE_MAP: Record<string, string> = {
          npc: "gameNpc",
          station: "gameStation",
          ore: "gameResource",
          tree: "gameResource",
          mob_spawn: "gameMobSpawn",
        };
        const selType =
          GAME_ENTITY_TYPE_MAP[selection.entityType] ?? selection.entityType;
        const displayName =
          selection.entityDisplayName ?? selection.entityId.replace(/_/g, " ");
        actions.setSelection({
          type: selType as never,
          id: selection.entityId,
          path: [{ type: selType, id: selection.entityId, name: displayName }],
          entityData: {
            ...selection.entityData,
            selectableId: selection.id, // Preserve the selectableId for 3D object lookup
            position: selection.position,
          },
        });
      } else if (selection.type === "town") {
        actions.setSelection({
          type: "town" as never,
          id: selection.id,
          path: [
            {
              type: "town",
              id: selection.id,
              name: selection.townName ?? selection.id,
            },
          ],
        });
      } else if (selection.type === "building") {
        actions.setSelection({
          type: "building" as never,
          id: selection.id,
          path: [
            {
              type: "town",
              id: selection.townId ?? "",
              name: selection.townName ?? "",
            },
            {
              type: "building",
              id: selection.id,
              name: selection.buildingType ?? selection.id,
            },
          ],
        });
      } else if (
        selection.type === "vegetation" &&
        selection.vegetationSpecies
      ) {
        // Vegetation instance selection
        const speciesLabel = selection.vegetationSpecies
          .replace(/^tree_/, "")
          .replace(/_/g, " ");
        actions.setSelection({
          type: "vegetation" as never,
          id: selection.id,
          path: [{ type: "vegetation", id: selection.id, name: speciesLabel }],
          entityData: {
            species: selection.vegetationSpecies,
            instanceIndex: selection.vegetationInstanceIndex,
            position: selection.position,
          },
        });
      } else if (selection.type === "bridge") {
        actions.setSelection({
          type: "bridge" as never,
          id: selection.id,
          path: [
            {
              type: "bridge",
              id: selection.id,
              name: selection.id.replace(/_/g, " "),
            },
          ],
        });
      } else if (selection.type === "duelArena") {
        actions.setSelection({
          type: "duelArena" as never,
          id: selection.id,
          path: [{ type: "duelArena", id: selection.id, name: "Duel Arena" }],
        });
      } else if (
        selection.type === "tile" &&
        selection.tileData &&
        activeTool === "select"
      ) {
        // Tile inspector — only when select tool is active (not brush/place)
        actions.setSelection({
          type: "tile" as never,
          id: selection.id,
          path: [
            {
              type: "tile",
              id: selection.id,
              name: `Tile ${selection.tileKey ?? selection.id}`,
            },
          ],
          tileData: selection.tileData,
        });
      }
    },
    [isEditing, actions, activeTool],
  );

  // ----- Drag-and-drop from EntityPalette -----
  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes("application/x-entity-palette")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      const data = e.dataTransfer.getData("application/x-entity-palette");
      if (!data || !activeSceneRefs) return;
      e.preventDefault();

      try {
        const { category, id, name } = JSON.parse(data) as {
          category: string;
          id: string;
          name: string;
        };
        // Raycast to find drop position on terrain
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const mouseY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        const mouse = new THREE.Vector2(mouseX, mouseY);
        activeSceneRefs.raycaster.setFromCamera(mouse, activeSceneRefs.camera);
        const intersects = activeSceneRefs.raycaster.intersectObject(
          activeSceneRefs.terrainContainer,
          true,
        );
        if (intersects.length > 0) {
          const pos = intersects[0].point;
          // Start placement, set position, confirm — one-gesture placement
          actions.startPlacement(category as never, id, name);
          actions.updatePlacementPosition({ x: pos.x, y: pos.y, z: pos.z });
          actions.confirmPlacement();
        }
      } catch {
        // Invalid data
      }
    },
    [activeSceneRefs, actions],
  );

  // Derive the selectedId to pass to TileBasedTerrain for its own highlighting
  const terrainSelectedId = isEditing ? selectedSelectableId : null;

  // Derive overlay selection info from WorldStudio selection
  const overlaySelection = useMemo(() => {
    if (!selection) return null;
    const name =
      selection.path.length > 0
        ? selection.path[selection.path.length - 1].name
        : selection.id;
    return { type: selection.type, id: selection.id, name };
  }, [selection]);

  // ----- Viewport context menu items -----
  const viewportContextItems = useMemo((): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [];

    if (selection) {
      const selType = selection.type;
      const selId = selection.id;
      items.push(
        {
          label: "Focus Selection",
          shortcut: "F",
          onClick: () => {
            if (selectedSelectableId && activeSceneRefs) {
              let found: THREE.Object3D | null = null;
              activeSceneRefs.scene.traverse((obj) => {
                if (found) return;
                if (obj.userData?.selectableId === selectedSelectableId) {
                  found = obj;
                }
              });
              if (found) {
                const box = new THREE.Box3().setFromObject(found);
                const center = box.getCenter(new THREE.Vector3());
                const size = box.getSize(new THREE.Vector3());
                const radius = size.length() / 2;
                activeSceneRefs.focusOnPosition(center, radius);
              }
            }
            hideContextMenu();
          },
        },
        {
          label: "Duplicate",
          shortcut: "⌘D",
          onClick: () => {
            executeDuplicate(state, actions, selType, selId);
            hideContextMenu();
          },
        },
        {
          label: "Delete",
          shortcut: "Del",
          danger: true,
          onClick: () => {
            executeDelete(state, actions, selType, selId);
            hideContextMenu();
          },
        },
        { label: "", separator: true },
      );

      // Flatten Terrain Below — for structures that sit on terrain
      const FLATTENABLE_TYPES = new Set(["building", "bridge", "duelArena"]);
      if (FLATTENABLE_TYPES.has(selType)) {
        items.push({
          label: "Flatten Terrain Below",
          onClick: () => {
            if (selectedSelectableId && activeSceneRefs) {
              let found: THREE.Object3D | null = null;
              activeSceneRefs.scene.traverse((obj) => {
                if (found) return;
                if (obj.userData?.selectableId === selectedSelectableId) {
                  found = obj;
                }
              });
              if (found) {
                const box = new THREE.Box3().setFromObject(found);
                const center = box.getCenter(new THREE.Vector3());
                const size = box.getSize(new THREE.Vector3());
                // Sharp falloff gives full strength within 70% of radius, so
                // divide by 0.7 to ensure the entire footprint is fully flattened.
                const diagonal = Math.sqrt(size.x * size.x + size.z * size.z);
                const footprintRadius = diagonal / 2 + 2;
                actions.addTerrainSculpt({
                  id: `flatten_${selId}_${Date.now()}`,
                  center: { x: center.x, z: center.z },
                  radius: footprintRadius / 0.7,
                  strength: 1.0,
                  falloff: "sharp",
                  mode: "flatten",
                  flattenTarget: box.min.y,
                  timestamp: Date.now(),
                });
              }
            }
            hideContextMenu();
          },
        });
      }
    }

    items.push({
      label: "Toggle Grid",
      onClick: () => {
        handleGridToggle();
        hideContextMenu();
      },
    });

    // Generate Town Here — raycast from context menu click position to get world coordinates
    items.push({
      label: "Generate Town Here",
      icon: undefined,
      onClick: () => {
        // Compute world position from the context menu click via camera look-at or raycast
        let worldPos = { x: 0, y: 0, z: 0 };
        if (activeSceneRefs) {
          // Raycast from context menu screen position to terrain
          const rect = activeSceneRefs.container.getBoundingClientRect();
          const ndcX =
            ((contextMenu.position.x - rect.left) / rect.width) * 2 - 1;
          const ndcY =
            -((contextMenu.position.y - rect.top) / rect.height) * 2 + 1;
          const mouse = new THREE.Vector2(ndcX, ndcY);
          activeSceneRefs.raycaster.setFromCamera(
            mouse,
            activeSceneRefs.camera,
          );
          const hits = activeSceneRefs.raycaster.intersectObject(
            activeSceneRefs.terrainContainer,
            true,
          );
          if (hits.length > 0) {
            const p = hits[0].point;
            worldPos = { x: p.x, y: p.y, z: p.z };
          } else {
            // Fallback: project to y=0 plane from camera
            const cam = activeSceneRefs.camera;
            const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(
              cam.quaternion,
            );
            if (dir.y !== 0) {
              const t = -cam.position.y / dir.y;
              worldPos = {
                x: cam.position.x + dir.x * t,
                y: 0,
                z: cam.position.z + dir.z * t,
              };
            }
          }
        }
        setTownDialogPosition(worldPos);
        hideContextMenu();
      },
    });

    // Camera bookmarks
    if (activeSceneRefs) {
      items.push({ label: "", separator: true });
      items.push({
        label: "Save Camera Bookmark",
        onClick: () => {
          const cam = activeSceneRefs.camera;
          const name = `Bookmark ${bookmarks.length + 1}`;
          addBookmark(
            name,
            { x: cam.position.x, y: cam.position.y, z: cam.position.z },
            { x: 0, y: 0, z: 0 },
          );
          hideContextMenu();
        },
      });
      if (bookmarks.length > 0) {
        for (const bm of bookmarks) {
          items.push({
            label: `📍 ${bm.name}`,
            onClick: () => {
              activeSceneRefs.focusOnPosition(
                new THREE.Vector3(bm.position.x, bm.position.y, bm.position.z),
                20,
              );
              hideContextMenu();
            },
          });
        }
      }
    }

    return items;
  }, [
    selection,
    selectedSelectableId,
    state,
    actions,
    activeSceneRefs,
    bookmarks,
    addBookmark,
    hideContextMenu,
    handleGridToggle,
    contextMenu.position,
  ]);

  return (
    <div
      className="flex-1 relative bg-bg-primary"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <TileBasedTerrain
        config={config}
        showVegetation={true}
        selectedId={terrainSelectedId}
        onTileCountChange={handleTileCountChange}
        onSelect={handleSelect}
        onSceneReady={handleSceneReady}
        hideBuiltinOverlays={isEditing}
        onGameEntitiesLoaded={handleGameEntitiesLoaded}
        onViewportContextMenu={handleViewportContextMenu}
      />
      {/* Viewport info overlay (UE5-style corner HUD) */}
      {isEditing && (
        <ViewportOverlay
          selection={overlaySelection}
          entityCount={entityCount}
          activeTool={activeTool}
          transformMode={transformMode}
          transformSpace={transformSpace}
          cameraPosition={cameraPosition}
          gridEnabled={gridVisible}
          snapEnabled={snapEnabled}
          surfaceSnap={surfaceSnap}
          tileProgress={tileProgress}
          worldSizeTiles={config?.terrain.worldSize}
          tileSize={config?.terrain.tileSize}
          biomes={state.builder.editing.world?.foundation.biomes.map((b) => ({
            type: b.type,
            tileKeys: b.tileKeys,
          }))}
          roads={state.builder.editing.world?.foundation.roads.map((r) => ({
            path: r.path,
          }))}
          towns={state.builder.editing.world?.foundation.towns.map((t) => ({
            id: t.id,
            name: t.name,
            position: t.position,
            size: t.size,
          }))}
          onNavigateCamera={(x, z) =>
            viewportRef.current.navigateCamera?.(x, z)
          }
          onToggleGrid={handleGridToggle}
          onToggleSnap={handleSnapToggle}
          onToggleSurfaceSnap={handleSurfaceSnapToggle}
        />
      )}

      {/* View mode dropdown (top-right, above overlay z-level) */}
      {isEditing && (
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5">
          <ViewModeDropdown
            currentMode={viewMode}
            onModeChange={handleViewModeChange}
          />
        </div>
      )}

      {/* Viewport context menu */}
      {contextMenu.visible && (
        <ContextMenu
          items={viewportContextItems}
          position={contextMenu.position}
          onClose={hideContextMenu}
        />
      )}

      {/* Generate Town dialog */}
      {townDialogPosition && (
        <GenerateTownDialog
          position={townDialogPosition}
          onClose={() => setTownDialogPosition(null)}
          onGenerated={() => setTownDialogPosition(null)}
        />
      )}
    </div>
  );
}
