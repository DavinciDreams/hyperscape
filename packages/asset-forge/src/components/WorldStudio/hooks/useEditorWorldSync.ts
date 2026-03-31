/**
 * useEditorWorldSync — Bridge between WorldStudioContext state and TileBasedTerrain scene
 *
 * Translates WorldStudioContext state changes into 3D scene objects:
 * - Extended layer entities (spawn points, teleports, mob spawns, resources, stations)
 *   are visualized as colored marker meshes in the viewport
 * - Markers are registered as selectables via TerrainSceneRefs.addSelectable
 * - Active placement ghost is rendered as a translucent preview mesh
 * - Teleport network connections are drawn as lines
 */

import * as THREE from "three";
import { useEffect, useRef, useCallback } from "react";

import type { TerrainSceneRefs } from "../../WorldBuilder/TileBasedTerrain";

/** Safe material dispose — WebGPU renderer can race with React cleanup */
function safeDispose(mat: THREE.Material | THREE.Material[]): void {
  try {
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else mat.dispose();
  } catch {
    /* WebGPU internal state already cleaned up */
  }
}
import type { WorldStudioState } from "../WorldStudioContext";
import type {
  ExtendedWorldLayers,
  ActivePlacement,
  PlacedSpawnPoint,
  PlacedTeleport,
  PlacedMobSpawn,
  PlacedResource,
  PlacedStation,
  PlacedPOI,
  PlacedWaterBody,
} from "../types";

// ============== MARKER COLORS ==============

const MARKER_COLORS = {
  spawnPoint: 0x22c55e, // green
  teleport: 0x8b5cf6, // violet
  mobSpawn: 0xef4444, // red
  resource: 0x3b82f6, // blue
  station: 0xf59e0b, // amber
  poi: 0xec4899, // pink
  waterBody: 0x06b6d4, // cyan
  ghost: 0xffffff, // white (translucent)
} as const;

const MARKER_GEOMETRY_CACHE = new Map<string, THREE.BufferGeometry>();

function getMarkerGeometry(type: string): THREE.BufferGeometry {
  let geo = MARKER_GEOMETRY_CACHE.get(type);
  if (geo) return geo;

  switch (type) {
    case "spawnPoint":
      geo = new THREE.ConeGeometry(0.6, 1.5, 6);
      geo.translate(0, 0.75, 0);
      break;
    case "teleport":
      geo = new THREE.TorusGeometry(0.8, 0.15, 8, 16);
      geo.rotateX(Math.PI / 2);
      geo.translate(0, 0.3, 0);
      break;
    case "mobSpawn":
      geo = new THREE.SphereGeometry(0.7, 8, 6);
      geo.translate(0, 0.7, 0);
      break;
    case "resource":
      geo = new THREE.OctahedronGeometry(0.6);
      geo.translate(0, 0.6, 0);
      break;
    case "station":
      geo = new THREE.BoxGeometry(1, 1, 1);
      geo.translate(0, 0.5, 0);
      break;
    case "poi":
      geo = new THREE.DodecahedronGeometry(0.7);
      geo.translate(0, 0.7, 0);
      break;
    case "waterBody":
      geo = new THREE.CylinderGeometry(0.8, 0.8, 0.3, 12);
      geo.translate(0, 0.15, 0);
      break;
    default:
      geo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
      geo.translate(0, 0.25, 0);
  }

  MARKER_GEOMETRY_CACHE.set(type, geo);
  return geo;
}

function createMarkerMesh(
  type: keyof typeof MARKER_COLORS,
  position: { x: number; y: number; z: number },
  rotation: number = 0,
): THREE.Mesh {
  const geo = getMarkerGeometry(type);
  const mat = new THREE.MeshStandardMaterial({
    color: MARKER_COLORS[type],
    emissive: MARKER_COLORS[type],
    emissiveIntensity: 0.3,
    roughness: 0.7,
    metalness: 0.2,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(position.x, position.y, position.z);
  mesh.rotation.y = rotation;
  mesh.castShadow = true;
  mesh.name = `marker-${type}`;
  return mesh;
}

function createGhostMesh(
  type: string,
  position: { x: number; y: number; z: number },
  rotation: number = 0,
): THREE.Mesh {
  const markerType = categoryToMarkerType(type);
  const geo = getMarkerGeometry(markerType);
  const mat = new THREE.MeshStandardMaterial({
    color: MARKER_COLORS[markerType as keyof typeof MARKER_COLORS] ?? 0xffffff,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(position.x, position.y, position.z);
  mesh.rotation.y = rotation;
  mesh.name = "placement-ghost";
  return mesh;
}

function categoryToMarkerType(category: string): string {
  if (category.startsWith("resources-")) return "resource";
  if (category === "mob-spawns") return "mobSpawn";
  if (category === "spawn-points") return "spawnPoint";
  if (category === "water-bodies") return "waterBody";
  if (category === "pois") return "poi";
  return category.replace(/-/g, "");
}

// ============== LABEL SPRITES ==============

function createLabelSprite(text: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.font = "bold 24px sans-serif";
  ctx.fillStyle = "white";
  ctx.strokeStyle = "black";
  ctx.lineWidth = 3;
  ctx.textAlign = "center";
  ctx.strokeText(text, 128, 40);
  ctx.fillText(text, 128, 40);

  const texture = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: texture, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  const aspect = 256 / 64; // canvas dimensions
  sprite.scale.set(1.5, 0.375, 1);
  sprite.position.y = 1.5;
  // UE5 style: labels hidden by default, shown on hover/selection
  sprite.visible = false;
  sprite.userData.isLabel = true;
  sprite.userData.labelAspect = aspect; // cached for screen-space sizing
  return sprite;
}

// ============== MANAGED MARKERS ==============

interface ManagedMarker {
  id: string;
  type: string;
  mesh: THREE.Mesh;
  label: THREE.Sprite;
  group: THREE.Group;
}

interface SyncState {
  markers: Map<string, ManagedMarker>;
  ghostMesh: THREE.Mesh | null;
  boundaryRing: THREE.Mesh | null;
  connectionLines: THREE.Group | null;
  disposed: boolean;
}

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
  const syncRef = useRef<SyncState>({
    markers: new Map(),
    ghostMesh: null,
    boundaryRing: null,
    connectionLines: null,
    disposed: false,
  });
  // Keep a stable ref to sceneRefs for cleanup
  const sceneRefsRef = useRef(sceneRefs);
  sceneRefsRef.current = sceneRefs;

  // Keep stable ref to onSelectEntity
  const onSelectEntityRef = useRef(onSelectEntity);
  onSelectEntityRef.current = onSelectEntity;

  // Sync extended layer entities
  const syncExtendedLayers = useCallback((layers: ExtendedWorldLayers) => {
    const sync = syncRef.current;
    const refs = sceneRefsRef.current;
    if (!refs || sync.disposed) return;

    const overlay = refs.entityOverlay;
    const activeIds = new Set<string>();

    // Helper: add or update a marker
    const upsertMarker = (
      id: string,
      type: keyof typeof MARKER_COLORS,
      name: string,
      position: { x: number; y: number; z: number },
      rotation: number = 0,
    ) => {
      activeIds.add(id);
      const existing = sync.markers.get(id);
      if (existing) {
        existing.group.position.set(position.x, position.y, position.z);
        existing.group.rotation.y = rotation;
      } else {
        const mesh = createMarkerMesh(type, { x: 0, y: 0, z: 0 }, 0);
        const label = createLabelSprite(name);
        const group = new THREE.Group();
        group.add(mesh);
        group.add(label);
        group.position.set(position.x, position.y, position.z);
        group.rotation.y = rotation;
        group.name = `entity-${type}-${id}`;
        // Store entity info for selection routing (matches TileBasedTerrain's click handler)
        const selectData = {
          selectable: true,
          selectableType: "entity" as const,
          selectableId: id,
          entityType: type,
          entityId: id,
        };
        group.userData = selectData;
        mesh.userData = selectData;

        overlay.add(group);
        refs.addSelectable(group);

        sync.markers.set(id, { id, type, mesh, label, group });
      }
    };

    // Spawn points
    layers.spawnPoints.forEach((sp: PlacedSpawnPoint) => {
      upsertMarker(sp.id, "spawnPoint", sp.name, sp.position, sp.rotation);
    });

    // Teleports
    layers.teleports.forEach((tp: PlacedTeleport) => {
      upsertMarker(tp.id, "teleport", tp.name, tp.position);
    });

    // Mob spawns
    layers.mobSpawns.forEach((ms: PlacedMobSpawn) => {
      upsertMarker(ms.id, "mobSpawn", ms.name, ms.position);
    });

    // Resources
    layers.resources.forEach((r: PlacedResource) => {
      upsertMarker(r.id, "resource", r.name, r.position, r.rotation);
    });

    // Stations
    layers.stations.forEach((s: PlacedStation) => {
      upsertMarker(s.id, "station", s.name, s.position, s.rotation);
    });

    // POIs
    layers.pois.forEach((p: PlacedPOI) => {
      upsertMarker(p.id, "poi", p.name, p.position);
    });

    // Water Bodies
    layers.waterBodies.forEach((w: PlacedWaterBody) => {
      const pos = w.waypoints?.[0]
        ? { x: w.waypoints[0].x, y: 0, z: w.waypoints[0].z }
        : { x: 0, y: 0, z: 0 };
      upsertMarker(w.id, "waterBody", w.name, pos);
    });

    // Teleport network connection lines
    if (sync.connectionLines) {
      refs.scene.remove(sync.connectionLines);
      sync.connectionLines.traverse((child) => {
        if (child instanceof THREE.Line) {
          child.geometry.dispose();
          safeDispose(child.material as THREE.Material);
        }
      });
      sync.connectionLines = null;
    }

    const lineGroup = new THREE.Group();
    lineGroup.name = "teleport-connections";
    const drawnPairs = new Set<string>();
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x8b5cf6,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
    });

    for (const tp of layers.teleports) {
      for (const connId of tp.connections) {
        const pairKey =
          tp.id < connId ? `${tp.id}:${connId}` : `${connId}:${tp.id}`;
        if (drawnPairs.has(pairKey)) continue;
        drawnPairs.add(pairKey);

        const target = layers.teleports.find((t) => t.id === connId);
        if (!target) continue;

        const points = [
          new THREE.Vector3(tp.position.x, tp.position.y + 1, tp.position.z),
          new THREE.Vector3(
            target.position.x,
            target.position.y + 1,
            target.position.z,
          ),
        ];
        const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(lineGeo, lineMat.clone());
        line.renderOrder = 998;
        lineGroup.add(line);
      }
    }

    if (lineGroup.children.length > 0) {
      refs.scene.add(lineGroup);
      sync.connectionLines = lineGroup;
    }

    // Remove markers that no longer exist in state
    for (const [id, marker] of sync.markers) {
      if (!activeIds.has(id)) {
        overlay.remove(marker.group);
        refs.removeSelectable(marker.group);
        marker.mesh.geometry.dispose();
        safeDispose(marker.mesh.material as THREE.Material);
        try {
          (marker.label.material as THREE.SpriteMaterial).map?.dispose();
        } catch {
          /* noop */
        }
        safeDispose(marker.label.material as THREE.Material);
        sync.markers.delete(id);
      }
    }
  }, []);

  // Sync ghost placement preview
  const syncGhost = useCallback((placement: ActivePlacement | null) => {
    const sync = syncRef.current;
    const refs = sceneRefsRef.current;
    if (!refs || sync.disposed) return;

    // Remove existing ghost
    if (sync.ghostMesh) {
      refs.entityOverlay.remove(sync.ghostMesh);
      sync.ghostMesh.geometry.dispose();
      safeDispose(sync.ghostMesh.material as THREE.Material);
      sync.ghostMesh = null;
    }

    // Create new ghost if placement is active and not yet confirmed
    if (placement && !placement.confirmed) {
      const ghost = createGhostMesh(
        placement.category,
        placement.position,
        placement.rotation,
      );
      refs.entityOverlay.add(ghost);
      sync.ghostMesh = ghost;
    }
  }, []);

  // Sync extended layers when they change
  useEffect(() => {
    syncExtendedLayers(studioState.extendedLayers);
  }, [studioState.extendedLayers, syncExtendedLayers]);

  // Sync ghost placement
  useEffect(() => {
    syncGhost(studioState.tools.activePlacement);
  }, [studioState.tools.activePlacement, syncGhost]);

  // World boundary ring visualization
  useEffect(() => {
    const sync = syncRef.current;
    const refs = sceneRefsRef.current;
    if (!refs || sync.disposed) return;

    const worldData = studioState.builder.editing.world;
    if (!worldData?.foundation.config.island?.enabled) {
      if (sync.boundaryRing) {
        refs.scene.remove(sync.boundaryRing);
        sync.boundaryRing.geometry.dispose();
        safeDispose(sync.boundaryRing.material as THREE.Material);
        sync.boundaryRing = null;
      }
      return;
    }

    const island = worldData.foundation.config.island;
    const tileSize = worldData.foundation.config.terrain.tileSize;
    const boundaryRadius = (island.maxWorldSizeTiles * tileSize) / 2;

    if (sync.boundaryRing) {
      refs.scene.remove(sync.boundaryRing);
      sync.boundaryRing.geometry.dispose();
      safeDispose(sync.boundaryRing.material as THREE.Material);
      sync.boundaryRing = null;
    }

    const ringGeo = new THREE.RingGeometry(
      boundaryRadius - 5,
      boundaryRadius + 5,
      128,
    );
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xff4444,
      transparent: true,
      opacity: 0.15,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 1;
    ring.name = "world-boundary-ring";
    ring.renderOrder = 999;
    refs.scene.add(ring);
    sync.boundaryRing = ring;

    return () => {
      if (sync.boundaryRing) {
        refs.scene.remove(sync.boundaryRing);
        sync.boundaryRing.geometry.dispose();
        safeDispose(sync.boundaryRing.material as THREE.Material);
        sync.boundaryRing = null;
      }
    };
  }, [sceneRefs, studioState.builder.editing.world]);

  // Cleanup on unmount
  useEffect(() => {
    const sync = syncRef.current;
    return () => {
      sync.disposed = true;
      const refs = sceneRefsRef.current;
      if (!refs) return;

      for (const [, marker] of sync.markers) {
        refs.entityOverlay.remove(marker.group);
        refs.removeSelectable(marker.group);
        marker.mesh.geometry.dispose();
        safeDispose(marker.mesh.material as THREE.Material);
        try {
          (marker.label.material as THREE.SpriteMaterial).map?.dispose();
        } catch {
          /* noop */
        }
        safeDispose(marker.label.material as THREE.Material);
      }
      sync.markers.clear();

      if (sync.ghostMesh) {
        refs.entityOverlay.remove(sync.ghostMesh);
        sync.ghostMesh.geometry.dispose();
        safeDispose(sync.ghostMesh.material as THREE.Material);
        sync.ghostMesh = null;
      }

      if (sync.connectionLines) {
        refs.scene.remove(sync.connectionLines);
        sync.connectionLines.traverse((child) => {
          if (child instanceof THREE.Line) {
            child.geometry.dispose();
            safeDispose(child.material as THREE.Material);
          }
        });
        sync.connectionLines = null;
      }
    };
  }, []);
}
