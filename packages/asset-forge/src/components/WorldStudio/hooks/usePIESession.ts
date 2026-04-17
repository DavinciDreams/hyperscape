/**
 * usePIESession — Play-In-Editor session manager
 *
 * Orchestrates the PIE lifecycle:
 * 1. Creates a PlayTestWorld with entities from manifests
 * 2. Enters player mode on the viewport camera (WASD + mouse look)
 * 3. Runs the game tick loop (mob patrol, NPC face-toward-player)
 * 4. Syncs entity transforms to the Three.js scene (animated markers)
 * 5. Cleans up on exit (ESC or explicit stop)
 *
 * The hook is used by ViewportContainer and controlled by MainToolbar's
 * Play button via the PIE state in the World Studio context.
 */

import { useRef, useCallback, useEffect } from "react";
import * as THREE from "three/webgpu";

// PIE world + script runtime live in @hyperscape/shared.
// The runtime uses the same ScriptGraphInterpreter as the production server
// so behavior graphs run identically inside PIE and in-game.
import {
  createPlayTestWorld,
  PlayTestWorld,
  type PIEEntity,
  type PlayTestWorldOptions,
  type PIEDebugEntry,
  type RuntimeScriptGraph,
  type GameModeManifest,
  HYPERSCAPE_DEFAULT_MANIFEST,
  CLICK_TO_WALK_CONTROLLER_ID,
} from "@hyperscape/shared/runtime";
import type { ScriptGraph } from "../../../scripting/types";

import type { TerrainSceneRefs } from "../../WorldBuilder/TileBasedTerrain";
import type { WorldStudioState } from "../worldStudioTypes";

/**
 * Cast an editor `ScriptGraph` to the runtime's `RuntimeScriptGraph`.
 * The two types are structurally identical for runtime fields; the editor's
 * `ScriptNode.position` is an extra field the runtime ignores.
 */
function toRuntimeGraph(g: ScriptGraph): RuntimeScriptGraph {
  return g as unknown as RuntimeScriptGraph;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Color palette for PIE entity markers */
const PIE_COLORS = {
  mob: 0xcc3333, // Red
  npc: 0x33cc33, // Green
  resource: 0x3399cc, // Blue
  station: 0xcccc33, // Yellow
} as const;

/** Marker geometry (shared across all PIE markers) */
let _capsuleGeom: THREE.CapsuleGeometry | null = null;
let _cylinderGeom: THREE.CylinderGeometry | null = null;

function getCapsuleGeom(): THREE.CapsuleGeometry {
  if (!_capsuleGeom) _capsuleGeom = new THREE.CapsuleGeometry(0.4, 1.0, 4, 8);
  return _capsuleGeom;
}

function getCylinderGeom(): THREE.CylinderGeometry {
  if (!_cylinderGeom)
    _cylinderGeom = new THREE.CylinderGeometry(0.3, 0.3, 0.6, 8);
  return _cylinderGeom;
}

// Material cache — one per entity type
const _materials = new Map<string, THREE.MeshBasicMaterial>();
function getMaterial(type: keyof typeof PIE_COLORS): THREE.MeshBasicMaterial {
  let mat = _materials.get(type);
  if (!mat) {
    mat = new THREE.MeshBasicMaterial({
      color: PIE_COLORS[type],
      transparent: true,
      opacity: 0.7,
    });
    _materials.set(type, mat);
  }
  return mat;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PIESessionState {
  world: PlayTestWorld | null;
  markers: Map<string, THREE.Mesh>;
  markerGroup: THREE.Group | null;
  animationId: number | null;
  lastTime: number;
}

interface UsePIESessionOptions {
  /** Current scene refs from TileBasedTerrain */
  sceneRefs: TerrainSceneRefs | null;
  /** World Studio state for reading manifest/entity data */
  state: WorldStudioState;
  /** Called when PIE exits (e.g., user presses ESC) */
  onExit: () => void;
  /**
   * Receives every script-runtime debug entry while PIE is active.
   * Wired by `WorldStudioLayout` to a PIE Console panel.
   */
  onDebug?: (entry: PIEDebugEntry) => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function usePIESession({
  sceneRefs,
  state,
  onExit,
  onDebug,
}: UsePIESessionOptions) {
  const sessionRef = useRef<PIESessionState>({
    world: null,
    markers: new Map(),
    markerGroup: null,
    animationId: null,
    lastTime: 0,
  });

  // Track the onExit callback in a ref to avoid stale closures
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;

  // Track the debug sink in a ref so updates don't restart PIE.
  const onDebugRef = useRef(onDebug);
  onDebugRef.current = onDebug;

  // Track sceneRefs in a ref
  const sceneRefsRef = useRef(sceneRefs);
  sceneRefsRef.current = sceneRefs;

  /**
   * Start the PIE session.
   * Creates the PlayTestWorld, spawns entities, enters player mode.
   */
  const startPIE = useCallback(() => {
    const refs = sceneRefsRef.current;
    if (!refs) {
      console.warn("[PIE] Cannot start — scene refs not available");
      return;
    }

    const session = sessionRef.current;

    // Clean up any existing session
    if (session.world) {
      stopPIEInternal(session, refs);
    }

    // Create PIE world
    const world = createPlayTestWorld();

    // Collect entity data from manifests
    const gameEntities = state.gameEntities;
    const extendedLayers = state.extendedLayers;
    const overrides = state.manifestOverrides;
    const offset = refs.worldCenterOffset;

    // Behavior-graph lookup helpers — return the editor-side ScriptGraph cast
    // to the runtime shape (the runtime ignores the editor's `position` field).
    const npcGraph = (typeId: string) => {
      const g = overrides.npcOverrides.get(typeId)?.behaviorGraph;
      return g ? toRuntimeGraph(g) : undefined;
    };
    const mobGraph = (spawnId: string) => {
      const g = overrides.mobSpawnOverrides.get(spawnId)?.behaviorGraph;
      return g ? toRuntimeGraph(g) : undefined;
    };
    const resGraph = (resId: string) => {
      const g = overrides.resourceOverrides.get(resId)?.behaviorGraph;
      return g ? toRuntimeGraph(g) : undefined;
    };
    const stationGraph = (stationId: string) => {
      const g = overrides.stationOverrides.get(stationId)?.behaviorGraph;
      return g ? toRuntimeGraph(g) : undefined;
    };

    // Gather mob spawns from extended layers (hand-placed + procgen)
    const mobSpawns = extendedLayers.mobSpawns.map((ms) => ({
      id: ms.id,
      mobId: ms.mobId,
      name: ms.name,
      position: {
        x: ms.position.x + offset,
        y: ms.position.y,
        z: ms.position.z + offset,
      },
      spawnRadius: ms.spawnRadius,
      maxCount: ms.maxCount,
      behaviorGraph: mobGraph(ms.id),
    }));

    // Gather NPCs (GameEntityInfo has position: {x, z} — no y)
    const npcs = (gameEntities?.npcs ?? []).map((npc) => ({
      id: npc.entityId,
      type: npc.npcType ?? "generic",
      name: npc.name,
      position: {
        x: npc.position.x + offset,
        y: 0, // Will be corrected to terrain height by the PIE world
        z: npc.position.z + offset,
      },
      behaviorGraph: npcGraph(npc.entityId),
    }));

    // Gather resources
    const resources = extendedLayers.resources.map((res) => ({
      id: res.id,
      resourceId: res.resourceId,
      resourceType: res.resourceType,
      name: res.name,
      position: {
        x: res.position.x + offset,
        y: res.position.y,
        z: res.position.z + offset,
      },
      behaviorGraph: resGraph(res.id),
    }));

    // Gather stations
    const stations = extendedLayers.stations.map((st) => ({
      id: st.id,
      type: st.stationType,
      position: {
        x: st.position.x + offset,
        y: st.position.y,
        z: st.position.z + offset,
      },
      behaviorGraph: stationGraph(st.id),
    }));

    // Player spawn: use camera's current XZ position at terrain height
    const camPos = refs.camera.position;
    const terrainHeight = refs.getTerrainHeight(camPos.x, camPos.z);
    const playerSpawn = {
      x: camPos.x,
      y: terrainHeight + 1.7,
      z: camPos.z,
    };

    // Start the PIE world. Debug entries flow up to the optional sink so
    // the PIE Console panel can render them.
    // GameMode manifest selects the viewport controller. Phase 4 persists
    // this per-game; `state.project.gameMode` is populated from the games
    // API (`fetchGame`) when the project loads. Legacy games or offline
    // projects fall back to the built-in Hyperscape click-to-walk + orbit
    // composition.
    const manifest: GameModeManifest =
      state.project.gameMode ?? HYPERSCAPE_DEFAULT_MANIFEST;

    const startOptions: PlayTestWorldOptions = {
      mobSpawns,
      npcs,
      resources,
      stations,
      playerSpawn,
      debugSink: (entry: PIEDebugEntry) => onDebugRef.current?.(entry),
      gameMode: manifest,
    };
    world.start(startOptions);

    // Create a group to hold all PIE markers
    const markerGroup = new THREE.Group();
    markerGroup.name = "pie-entities";
    refs.scene.add(markerGroup);

    // Create initial markers for mobs and NPCs
    const markers = new Map<string, THREE.Mesh>();
    for (const entity of world.entities.values()) {
      if (entity.type === "player") continue; // Player is the camera

      const marker = createMarker(entity);
      if (marker) {
        markerGroup.add(marker);
        markers.set(entity.id, marker);
      }
    }

    // Store session state
    session.world = world;
    session.markers = markers;
    session.markerGroup = markerGroup;
    session.lastTime = performance.now();

    // Branch on (pieMode, gameMode id):
    //   - Simulate: WASD fly-cam regardless of GameMode. The editor
    //     camera possesses nothing; designers move freely.
    //   - Play + click-to-walk: eventually instantiate
    //     ClickToWalkPlayerController + OrbitCameraController against
    //     the PIE world. Needs InteractionRouter + ClientCameraSystem
    //     wiring in PlayTestWorld; until that lands we fall through to
    //     the fly-cam so PIE remains functional.
    //   - Play + unknown id: alternate manifests registered by
    //     downstream games (Phase 5). Fly-cam fallback so the editor
    //     never hangs on an unrecognised controller.
    const pieMode = state.pie.mode;
    const modeId = world.gameMode?.id ?? CLICK_TO_WALK_CONTROLLER_ID;
    if (pieMode === "simulate") {
      refs.enterPlayerMode();
    } else if (modeId === CLICK_TO_WALK_CONTROLLER_ID) {
      // TODO(gamemode-phase-4): instantiate ClickToWalkPlayerController
      // + OrbitCameraController here once PlayTestWorld hosts the
      // InteractionRouter + ClientCameraSystem surface.
      refs.enterPlayerMode();
    } else {
      refs.enterPlayerMode();
    }

    // Start the tick loop
    const tickLoop = (time: number) => {
      const s = sessionRef.current;
      if (!s.world || !s.world.isRunning) return;

      const dt = Math.min((time - s.lastTime) / 1000, 0.1); // Cap at 100ms
      s.lastTime = time;

      // Tick the PIE world (mob AI, NPC behavior)
      s.world.tick(dt);

      // Sync entity positions to Three.js markers
      for (const entity of s.world.entities.values()) {
        if (entity.type === "player") continue;
        const marker = s.markers.get(entity.id);
        if (marker) {
          marker.position.set(
            entity.position.x,
            entity.position.y + 0.8, // Offset markers above ground
            entity.position.z,
          );
          marker.rotation.y = entity.rotation;
        }
      }

      s.animationId = requestAnimationFrame(tickLoop);
    };

    session.animationId = requestAnimationFrame(tickLoop);

    console.log("[PIE] Session started");
  }, [
    state.gameEntities,
    state.extendedLayers,
    state.pie.mode,
    state.project.gameMode,
  ]);

  /**
   * Stop the PIE session.
   * Cleans up markers, stops tick loop, exits player mode.
   */
  const stopPIE = useCallback(() => {
    const refs = sceneRefsRef.current;
    const session = sessionRef.current;
    if (refs) {
      stopPIEInternal(session, refs);
    }
  }, []);

  /**
   * Raycast from screen-center against PIE markers and fire `entity:interact`
   * on the first hit. Called by ViewportContainer when the user clicks while
   * PIE is active (the camera is in pointer-lock FPS mode, so cursor pos =
   * center of viewport).
   *
   * Returns the entity id that was interacted with, or null if nothing hit.
   */
  const interactAtCenter = useCallback((): string | null => {
    const refs = sceneRefsRef.current;
    const session = sessionRef.current;
    if (!refs || !session.world || !session.markerGroup) return null;

    // Pointer-lock mode: ray from the center of the camera (NDC origin).
    const ndc = new THREE.Vector2(0, 0);
    refs.raycaster.setFromCamera(ndc, refs.camera);
    const hits = refs.raycaster.intersectObjects(
      session.markerGroup.children,
      false,
    );
    if (hits.length === 0) return null;

    // Walk up to the marker mesh that carries `userData.pieEntity` —
    // intersectObjects returns the actual mesh, but be defensive.
    for (const hit of hits) {
      let obj: THREE.Object3D | null = hit.object;
      while (obj && !(obj as THREE.Object3D).userData?.pieEntity) {
        obj = obj.parent;
      }
      const entityId = obj?.userData?.entityId as string | undefined;
      if (entityId) {
        session.world.interactWith(entityId);
        return entityId;
      }
    }
    return null;
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      const refs = sceneRefsRef.current;
      const session = sessionRef.current;
      if (session.world && refs) {
        stopPIEInternal(session, refs);
      }
    };
  }, []);

  return { startPIE, stopPIE, interactAtCenter };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stopPIEInternal(
  session: PIESessionState,
  refs: TerrainSceneRefs,
): void {
  // Stop tick loop
  if (session.animationId !== null) {
    cancelAnimationFrame(session.animationId);
    session.animationId = null;
  }

  // Stop the world
  if (session.world) {
    session.world.stop();
    session.world = null;
  }

  // Remove markers from scene
  if (session.markerGroup) {
    for (const marker of session.markers.values()) {
      session.markerGroup.remove(marker);
      marker.geometry?.dispose();
    }
    refs.scene.remove(session.markerGroup);
    session.markerGroup = null;
  }
  session.markers.clear();

  // Exit player mode
  if (refs.isPlayerMode()) {
    refs.exitPlayerMode();
  }

  console.log("[PIE] Session stopped");
}

function createMarker(entity: PIEEntity): THREE.Mesh | null {
  const type = entity.type;
  if (type === "player") return null;

  let geom: THREE.BufferGeometry;
  if (type === "mob" || type === "npc") {
    geom = getCapsuleGeom();
  } else {
    geom = getCylinderGeom();
  }

  const mat =
    type === "mob" ||
    type === "npc" ||
    type === "resource" ||
    type === "station"
      ? getMaterial(type)
      : getMaterial("resource");

  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.set(
    entity.position.x,
    entity.position.y + 0.8,
    entity.position.z,
  );
  mesh.rotation.y = entity.rotation;
  mesh.name = `pie-${entity.id}`;
  mesh.userData.pieEntity = true;
  mesh.userData.entityId = entity.id;
  mesh.userData.entityType = entity.type;
  mesh.userData.entityName = entity.name;

  return mesh;
}
