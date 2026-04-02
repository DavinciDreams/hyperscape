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
import {
  MeshStandardNodeMaterial,
  MeshBasicNodeMaterial,
  LineBasicNodeMaterial,
  SpriteNodeMaterial,
} from "three/webgpu";
import { useEffect, useRef, useCallback } from "react";

import type { TerrainSceneRefs } from "../../WorldBuilder/TileBasedTerrain";
import {
  getNpcModel,
  getStationModel,
  getOreModel,
  getTreeSpeciesInstance,
} from "../../WorldBuilder/GameWorldAssets";

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
  PlacedNPC,
  PlacedSpawnPoint,
  PlacedTeleport,
  PlacedMobSpawn,
  PlacedResource,
  PlacedStation,
  PlacedPOI,
  PlacedWaterBody,
  PlacedDangerSource,
} from "../types";

// ============== MARKER COLORS ==============

const MARKER_COLORS = {
  npc: 0xa855f7, // purple
  spawnPoint: 0x22c55e, // green
  teleport: 0x8b5cf6, // violet
  mobSpawn: 0xef4444, // red
  resource: 0x3b82f6, // blue
  station: 0xf59e0b, // amber
  poi: 0xec4899, // pink
  waterBody: 0x06b6d4, // cyan
  dangerSource: 0xe54545, // danger red
  ghost: 0xffffff, // white (translucent)
} as const;

const MARKER_GEOMETRY_CACHE = new Map<string, THREE.BufferGeometry>();

function getMarkerGeometry(type: string): THREE.BufferGeometry {
  let geo = MARKER_GEOMETRY_CACHE.get(type);
  if (geo) return geo;

  switch (type) {
    case "npc": {
      // Capsule-like figure: body cylinder + head sphere
      const bodyGeo = new THREE.CylinderGeometry(0.3, 0.3, 1.2, 8);
      bodyGeo.translate(0, 0.6, 0);
      const headGeo = new THREE.SphereGeometry(0.25, 8, 6);
      headGeo.translate(0, 1.45, 0);
      const merged = new THREE.BufferGeometry();
      // Merge body + head
      const bodyPos = bodyGeo.getAttribute("position");
      const headPos = headGeo.getAttribute("position");
      const positions = new Float32Array(bodyPos.count * 3 + headPos.count * 3);
      for (let i = 0; i < bodyPos.count * 3; i++)
        positions[i] = (bodyPos.array as Float32Array)[i];
      for (let i = 0; i < headPos.count * 3; i++)
        positions[bodyPos.count * 3 + i] = (headPos.array as Float32Array)[i];
      merged.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      // Merge indices
      const bodyIdx = bodyGeo.getIndex()!;
      const headIdx = headGeo.getIndex()!;
      const indices = new Uint16Array(bodyIdx.count + headIdx.count);
      for (let i = 0; i < bodyIdx.count; i++)
        indices[i] = (bodyIdx.array as Uint16Array)[i];
      for (let i = 0; i < headIdx.count; i++)
        indices[bodyIdx.count + i] =
          (headIdx.array as Uint16Array)[i] + bodyPos.count;
      merged.setIndex(new THREE.BufferAttribute(indices, 1));
      merged.computeVertexNormals();
      bodyGeo.dispose();
      headGeo.dispose();
      geo = merged;
      break;
    }
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
    case "dangerSource":
      // Upward-pointing tetrahedron with warning feel
      geo = new THREE.TetrahedronGeometry(0.8);
      geo.translate(0, 0.8, 0);
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
  const mat = new MeshStandardNodeMaterial();
  mat.color = new THREE.Color(MARKER_COLORS[type]);
  mat.emissive = new THREE.Color(MARKER_COLORS[type]);
  mat.emissiveIntensity = 0.3;
  mat.roughness = 0.7;
  mat.metalness = 0.2;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(position.x, position.y, position.z);
  mesh.rotation.y = rotation;
  mesh.castShadow = true;
  mesh.name = `marker-${type}`;
  return mesh;
}

/**
 * Create the ghost preview for placement. Tries to use the real 3D model
 * from GameWorldAssets cache (translucent). Falls back to an abstract marker shape.
 */
function createGhostObject(
  category: string,
  templateId: string,
  position: { x: number; y: number; z: number },
  rotation: number = 0,
): THREE.Object3D {
  // Try real model first
  const modelGroup = tryLoadEntityModel(category, templateId, { ghost: true });
  if (modelGroup) {
    // Mark cloned materials for cleanup
    modelGroup.traverse((child) => {
      if (child instanceof THREE.Mesh) child.userData._ghostClone = true;
    });

    // Compute bbox offset so model bottom sits on terrain surface (not half buried)
    const bbox = new THREE.Box3().setFromObject(modelGroup);
    const bottomOffset = Math.max(0, -bbox.min.y);
    modelGroup.position.set(position.x, position.y + bottomOffset, position.z);
    modelGroup.rotation.y = rotation;
    modelGroup.name = "placement-ghost";
    modelGroup.userData.bottomOffset = bottomOffset;
    return modelGroup;
  }

  // Fallback: abstract marker shape
  const markerType = categoryToMarkerType(category);
  const geo = getMarkerGeometry(markerType);
  const mat = new MeshStandardNodeMaterial();
  mat.color = new THREE.Color(
    MARKER_COLORS[markerType as keyof typeof MARKER_COLORS] ?? 0xffffff,
  );
  mat.emissive = new THREE.Color(
    MARKER_COLORS[markerType as keyof typeof MARKER_COLORS] ?? 0xffffff,
  );
  mat.emissiveIntensity = 0.5;
  mat.transparent = true;
  mat.opacity = 0.6;
  mat.depthWrite = false;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(position.x, position.y, position.z);
  mesh.rotation.y = rotation;
  mesh.name = "placement-ghost";
  mesh.userData._fallbackGhost = true;
  return mesh;
}

function categoryToMarkerType(category: string): string {
  if (category === "npcs") return "npc";
  if (category.startsWith("resources-")) return "resource";
  if (category === "mob-spawns") return "mobSpawn";
  if (category === "spawn-points") return "spawnPoint";
  if (category === "water-bodies") return "waterBody";
  if (category === "danger-sources") return "dangerSource";
  if (category === "pois") return "poi";
  return category.replace(/-/g, "");
}

// ============== REAL MODEL LOADING ==============

/**
 * Try to load the actual 3D model for an entity from GameWorldAssets cache.
 * Returns a THREE.Group containing cloned model meshes, or null if no model is available.
 */
function tryLoadEntityModel(
  category: string,
  templateId: string,
  opts?: { ghost?: boolean },
): THREE.Group | null {
  let modelData: {
    parts: Array<{ geometry: THREE.BufferGeometry; material: THREE.Material }>;
    scale?: number;
    yOffset?: number;
    manifestScale?: number;
  } | null = null;

  if (category === "npcs" || category === "npc") {
    modelData = getNpcModel(templateId);
  } else if (category === "stations" || category === "station") {
    modelData = getStationModel(templateId);
  } else if (category === "resources-mining" || category === "resource") {
    modelData = getOreModel(templateId);
  } else if (category === "resources-woodcutting") {
    const tree = getTreeSpeciesInstance(templateId);
    if (tree) {
      modelData = {
        parts: tree.parts,
        scale: tree.manifestScale,
        yOffset: 0,
      };
    }
  } else if (category === "mob-spawns" || category === "mobSpawn") {
    // Mob spawns reference an NPC model
    modelData = getNpcModel(templateId);
  }

  if (!modelData || modelData.parts.length === 0) return null;

  const group = new THREE.Group();
  const scale =
    modelData.scale ??
    (modelData as { manifestScale?: number }).manifestScale ??
    1;

  for (const part of modelData.parts) {
    let mat: THREE.Material;
    if (opts?.ghost) {
      // Ghost: clone material, make translucent
      mat = part.material.clone();
      (mat as THREE.MeshStandardMaterial).transparent = true;
      (mat as THREE.MeshStandardMaterial).opacity = 0.45;
      mat.depthWrite = false;
    } else {
      mat = part.material;
    }
    const mesh = new THREE.Mesh(part.geometry, mat);
    mesh.castShadow = !opts?.ghost;
    group.add(mesh);
  }

  group.scale.setScalar(scale);
  if (modelData.yOffset) group.position.y = modelData.yOffset;

  return group;
}

/**
 * Compute the Y offset needed to sit a model's bottom on the ground plane.
 * Returns 0 when no model is available (abstract markers have geometry pre-translated above y=0).
 */
export function getPlacementYOffset(
  category: string,
  templateId: string,
): number {
  const group = tryLoadEntityModel(category, templateId);
  if (!group) return 0;
  const bbox = new THREE.Box3().setFromObject(group);
  return Math.max(0, -bbox.min.y);
}

/**
 * Dispose all children of a model group (cloned ghost materials).
 */
function disposeModelGroup(group: THREE.Group): void {
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      // Only dispose material if it's a ghost clone (not the cached original)
      if (child.userData._ghostClone) {
        safeDispose(child.material as THREE.Material);
      }
    }
  });
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
  const mat = new SpriteNodeMaterial();
  mat.map = texture;
  mat.depthTest = false;
  mat.transparent = true;
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
  mesh: THREE.Mesh | null; // null when using real model
  label: THREE.Sprite;
  group: THREE.Group;
  hasRealModel: boolean;
}

interface SyncState {
  markers: Map<string, ManagedMarker>;
  ghostObject: THREE.Object3D | null;
  ghostCategory: string | null;
  ghostTemplateId: string | null;
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
    ghostObject: null,
    ghostCategory: null,
    ghostTemplateId: null,
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

    // Helper: add or update a marker. Tries to use real 3D models from cache.
    const upsertMarker = (
      id: string,
      type: keyof typeof MARKER_COLORS,
      name: string,
      position: { x: number; y: number; z: number },
      rotation: number = 0,
      modelCategory?: string,
      templateId?: string,
    ) => {
      activeIds.add(id);
      const existing = sync.markers.get(id);
      if (existing) {
        existing.group.position.set(position.x, position.y, position.z);
        existing.group.rotation.y = rotation;
      } else {
        const label = createLabelSprite(name);
        const group = new THREE.Group();

        // Try real model first
        let mesh: THREE.Mesh | null = null;
        let hasRealModel = false;
        if (modelCategory && templateId) {
          const modelGroup = tryLoadEntityModel(modelCategory, templateId);
          if (modelGroup) {
            group.add(modelGroup);
            hasRealModel = true;
          }
        }

        // Fallback: abstract colored marker
        if (!hasRealModel) {
          mesh = createMarkerMesh(type, { x: 0, y: 0, z: 0 }, 0);
          group.add(mesh);
        }

        group.add(label);
        group.position.set(position.x, position.y, position.z);
        group.rotation.y = rotation;
        group.name = `entity-${type}-${id}`;

        // Store entity info for selection routing
        // isExtendedLayer distinguishes editor-placed entities from game manifest entities
        const selectData = {
          selectable: true,
          selectableType: "entity" as const,
          selectableId: id,
          entityType: type,
          entityId: id,
          isExtendedLayer: true,
        };
        group.userData = selectData;
        // Propagate to all mesh children for raycast hit detection
        group.traverse((child) => {
          if (child instanceof THREE.Mesh) child.userData = { ...selectData };
        });

        overlay.add(group);
        refs.addSelectable(group);

        sync.markers.set(id, { id, type, mesh, label, group, hasRealModel });
      }
    };

    // NPCs — use real NPC model from cache
    layers.npcs.forEach((npc: PlacedNPC) => {
      upsertMarker(
        npc.id,
        "npc",
        npc.name,
        npc.position,
        npc.rotation,
        "npcs",
        npc.npcTypeId,
      );
    });

    // Spawn points (no model — abstract marker)
    layers.spawnPoints.forEach((sp: PlacedSpawnPoint) => {
      upsertMarker(sp.id, "spawnPoint", sp.name, sp.position, sp.rotation);
    });

    // Teleports (no model — abstract marker)
    layers.teleports.forEach((tp: PlacedTeleport) => {
      upsertMarker(tp.id, "teleport", tp.name, tp.position);
    });

    // Mob spawns — use NPC model for the mob type
    layers.mobSpawns.forEach((ms: PlacedMobSpawn) => {
      upsertMarker(
        ms.id,
        "mobSpawn",
        ms.name,
        ms.position,
        0,
        "mob-spawns",
        ms.mobId,
      );
    });

    // Resources — use ore/tree model
    layers.resources.forEach((r: PlacedResource) => {
      const resCat =
        r.resourceType === "mining"
          ? "resources-mining"
          : r.resourceType === "woodcutting"
            ? "resources-woodcutting"
            : "resource";
      upsertMarker(
        r.id,
        "resource",
        r.name,
        r.position,
        r.rotation,
        resCat,
        r.resourceId,
      );
    });

    // Stations — use station model
    layers.stations.forEach((s: PlacedStation) => {
      upsertMarker(
        s.id,
        "station",
        s.name,
        s.position,
        s.rotation,
        "stations",
        s.stationType,
      );
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

    // Danger Sources
    layers.dangerSources.forEach((ds: PlacedDangerSource) => {
      upsertMarker(ds.id, "dangerSource", ds.name, ds.position);
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
    const lineMat = new LineBasicNodeMaterial();
    lineMat.color = new THREE.Color(0x8b5cf6);
    lineMat.transparent = true;
    lineMat.opacity = 0.6;
    lineMat.depthWrite = false;

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
        // Only dispose the abstract marker mesh (real model geometry is shared/cached)
        if (marker.mesh) {
          marker.mesh.geometry.dispose();
          safeDispose(marker.mesh.material as THREE.Material);
        }
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

  /** Dispose a ghost object (handles both model groups and fallback meshes) */
  const disposeGhost = useCallback(
    (ghost: THREE.Object3D, refs: TerrainSceneRefs) => {
      refs.entityOverlay.remove(ghost);
      if (ghost instanceof THREE.Group) {
        disposeModelGroup(ghost);
      } else if (ghost instanceof THREE.Mesh) {
        if (ghost.userData._fallbackGhost) {
          safeDispose(ghost.material as THREE.Material);
        }
      }
    },
    [],
  );

  // Sync ghost placement preview — uses real 3D models from GameWorldAssets cache
  const syncGhost = useCallback(
    (placement: ActivePlacement | null) => {
      const sync = syncRef.current;
      const refs = sceneRefsRef.current;
      if (!refs || sync.disposed) return;

      // No placement or confirmed → remove ghost
      if (!placement || placement.confirmed) {
        if (sync.ghostObject) {
          disposeGhost(sync.ghostObject, refs);
          sync.ghostObject = null;
          sync.ghostCategory = null;
          sync.ghostTemplateId = null;
        }
        return;
      }

      // Don't show ghost until first real mouse position (avoids flash at origin)
      const pos = placement.position;
      if (pos.x === 0 && pos.y === 0 && pos.z === 0) return;

      // Reuse existing ghost if same template — just update transform
      if (
        sync.ghostObject &&
        sync.ghostCategory === placement.category &&
        sync.ghostTemplateId === placement.templateId
      ) {
        const offset = sync.ghostObject.userData.bottomOffset ?? 0;
        sync.ghostObject.position.set(pos.x, pos.y + offset, pos.z);
        sync.ghostObject.rotation.y = placement.rotation;
        return;
      }

      // Template or category changed — dispose old, create new
      if (sync.ghostObject) {
        disposeGhost(sync.ghostObject, refs);
      }

      const ghost = createGhostObject(
        placement.category,
        placement.templateId,
        pos,
        placement.rotation,
      );
      refs.entityOverlay.add(ghost);
      sync.ghostObject = ghost;
      sync.ghostCategory = placement.category;
      sync.ghostTemplateId = placement.templateId;
    },
    [disposeGhost],
  );

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
    const ringMat = new MeshBasicNodeMaterial();
    ringMat.color = new THREE.Color(0xff4444);
    ringMat.transparent = true;
    ringMat.opacity = 0.15;
    ringMat.side = THREE.DoubleSide;
    ringMat.depthWrite = false;
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
        if (marker.mesh) {
          marker.mesh.geometry.dispose();
          safeDispose(marker.mesh.material as THREE.Material);
        }
        try {
          (marker.label.material as THREE.SpriteMaterial).map?.dispose();
        } catch {
          /* noop */
        }
        safeDispose(marker.label.material as THREE.Material);
      }
      sync.markers.clear();

      if (sync.ghostObject) {
        refs.entityOverlay.remove(sync.ghostObject);
        if (sync.ghostObject instanceof THREE.Group) {
          disposeModelGroup(sync.ghostObject);
        } else if (
          sync.ghostObject instanceof THREE.Mesh &&
          sync.ghostObject.userData._fallbackGhost
        ) {
          safeDispose(sync.ghostObject.material as THREE.Material);
        }
        sync.ghostObject = null;
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
