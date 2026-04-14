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

// PIE types and factory — local to asset-forge to avoid shared package rebuild.
// The canonical factory lives in @hyperscape/shared/runtime/createPlayTestWorld.ts
// and will be used once shared is rebuilt.

interface PIEEntity {
  id: string;
  type: "player" | "mob" | "npc" | "resource" | "station";
  position: { x: number; y: number; z: number };
  rotation: number;
  name: string;
  patrolCenter?: { x: number; z: number };
  patrolRadius?: number;
  moveTarget?: { x: number; z: number } | null;
  mobId?: string;
  resourceType?: string;
  stationType?: string;
  npcType?: string;
}

interface PlayTestWorldOptions {
  mobSpawns?: Array<{
    id: string;
    mobId: string;
    name: string;
    position: { x: number; y: number; z: number };
    spawnRadius: number;
    maxCount: number;
  }>;
  npcs?: Array<{
    id: string;
    type: string;
    name: string;
    position: { x: number; y: number; z: number };
  }>;
  resources?: Array<{
    id: string;
    resourceId: string;
    resourceType: string;
    name: string;
    position: { x: number; y: number; z: number };
  }>;
  playerSpawn?: { x: number; y: number; z: number };
}

class PlayTestWorld {
  readonly entities = new Map<string, PIEEntity>();
  private _tickCount = 0;
  private _isRunning = false;
  player: PIEEntity | null = null;

  get isRunning(): boolean {
    return this._isRunning;
  }

  start(options: PlayTestWorldOptions): void {
    this._isRunning = true;
    this._tickCount = 0;
    this.entities.clear();

    const spawn = options.playerSpawn ?? { x: 0, y: 2, z: 0 };
    this.player = {
      id: "pie-player",
      type: "player",
      position: { ...spawn },
      rotation: 0,
      name: "Player",
    };
    this.entities.set(this.player.id, this.player);

    if (options.mobSpawns) {
      for (const ms of options.mobSpawns) {
        for (let i = 0; i < ms.maxCount; i++) {
          const angle = (i / ms.maxCount) * Math.PI * 2;
          const dist = ms.spawnRadius * 0.5;
          const entity: PIEEntity = {
            id: `mob_${ms.id}_${i}`,
            type: "mob",
            position: {
              x: ms.position.x + Math.cos(angle) * dist,
              y: ms.position.y,
              z: ms.position.z + Math.sin(angle) * dist,
            },
            rotation: angle,
            name: ms.name,
            mobId: ms.mobId,
            patrolCenter: { x: ms.position.x, z: ms.position.z },
            patrolRadius: ms.spawnRadius,
            moveTarget: null,
          };
          this.entities.set(entity.id, entity);
        }
      }
    }

    if (options.npcs) {
      for (const npc of options.npcs) {
        const entity: PIEEntity = {
          id: `npc_${npc.id}`,
          type: "npc",
          position: { ...npc.position },
          rotation: 0,
          name: npc.name,
          npcType: npc.type,
        };
        this.entities.set(entity.id, entity);
      }
    }

    if (options.resources) {
      for (const res of options.resources) {
        const entity: PIEEntity = {
          id: `resource_${res.id}`,
          type: "resource",
          position: { ...res.position },
          rotation: 0,
          name: res.name,
          resourceType: res.resourceType,
        };
        this.entities.set(entity.id, entity);
      }
    }

    console.log(`[PIE] Started with ${this.entities.size} entities`);
  }

  tick(deltaTime: number): void {
    if (!this._isRunning) return;
    this._tickCount++;

    for (const entity of this.entities.values()) {
      // Mob patrol AI
      if (entity.type === "mob" && entity.patrolCenter) {
        if (!entity.moveTarget || this._tickCount % 180 === 0) {
          const angle = Math.random() * Math.PI * 2;
          const dist = Math.random() * entity.patrolRadius!;
          entity.moveTarget = {
            x: entity.patrolCenter.x + Math.cos(angle) * dist,
            z: entity.patrolCenter.z + Math.sin(angle) * dist,
          };
        }
        if (entity.moveTarget) {
          const dx = entity.moveTarget.x - entity.position.x;
          const dz = entity.moveTarget.z - entity.position.z;
          const distSq = dx * dx + dz * dz;
          if (distSq > 0.25) {
            const speed = 2 * deltaTime;
            const d = Math.sqrt(distSq);
            entity.position.x += (dx / d) * speed;
            entity.position.z += (dz / d) * speed;
            entity.rotation = Math.atan2(dx, dz);
          } else {
            entity.moveTarget = null;
          }
        }
      }

      // NPC face-toward-player
      if (entity.type === "npc" && this.player) {
        const dx = this.player.position.x - entity.position.x;
        const dz = this.player.position.z - entity.position.z;
        if (dx * dx + dz * dz < 100) {
          entity.rotation = Math.atan2(dx, dz);
        }
      }
    }
  }

  stop(): void {
    this._isRunning = false;
    this.player = null;
    this.entities.clear();
    console.log("[PIE] Stopped");
  }
}

function createPlayTestWorld(): PlayTestWorld {
  return new PlayTestWorld();
}
import type { TerrainSceneRefs } from "../../WorldBuilder/TileBasedTerrain";
import type { WorldStudioState } from "../worldStudioTypes";

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
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function usePIESession({
  sceneRefs,
  state,
  onExit,
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
    const offset = refs.worldCenterOffset;

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
    }));

    // Player spawn: use camera's current XZ position at terrain height
    const camPos = refs.camera.position;
    const terrainHeight = refs.getTerrainHeight(camPos.x, camPos.z);
    const playerSpawn = {
      x: camPos.x,
      y: terrainHeight + 1.7,
      z: camPos.z,
    };

    // Start the PIE world
    world.start({ mobSpawns, npcs, resources, playerSpawn });

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

    // Enter player mode (WASD + mouse look)
    refs.enterPlayerMode();

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
  }, [state.gameEntities, state.extendedLayers]);

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

  return { startPIE, stopPIE };
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
