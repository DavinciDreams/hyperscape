/**
 * TownRenderer — Encapsulates all town 3D rendering logic extracted from
 * TileBasedTerrain.tsx.
 *
 * Responsibilities:
 * - Town center cone markers (color-coded by size)
 * - Safe zone ring meshes
 * - Town center pillar indicators
 * - Building LOD meshes (3-tier: procedural, simple box, far box)
 * - Landmark colored meshes (wells, fountains, signposts, etc.)
 * - Internal road line rendering
 * - Moving existing towns to new positions
 * - LOD update dispatch
 * - Cleanup / disposal
 *
 * This class does NOT own the scene container — it receives a parent Group and
 * a SceneResourceManager from the caller, and stages all objects through the
 * resource manager to respect WebGPU/Metal rate-limiting.
 */

import { BuildingGenerator } from "@hyperscape/procgen/building";
import type { GeneratedTown as ProcgenTown } from "@hyperscape/procgen/building/town";
import {
  MeshStandardNodeMaterial,
  MeshBasicNodeMaterial,
  LineBasicNodeMaterial,
} from "three/webgpu";

import { THREE } from "@/utils/webgpu-renderer";
import type { SceneResourceManager } from "../SceneResourceManager";
import { buildingWalkabilityService } from "../BuildingWalkabilityService";

// ============== Constants ==============

/** LOD distances for buildings */
const BUILDING_LOD_FULL_DISTANCE = 200;
const BUILDING_LOD_SIMPLE_DISTANCE = 500;

/** Town marker colors by size */
const TOWN_SIZE_COLORS: Record<string, number> = {
  town: 0xff0000,
  village: 0xff8800,
  hamlet: 0xffff00,
};

/** Landmark type → hex color mapping */
const LANDMARK_COLORS: Record<string, number> = {
  well: 0x5a5a6a,
  fountain: 0x4a7aaa,
  market_stall: 0xaa7a4a,
  signpost: 0x8a6a4a,
  bench: 0x7a5a3a,
  barrel: 0x6a5a4a,
  crate: 0x8a7a5a,
  lamppost: 0x3a3a3a,
  planter: 0x5a8a5a,
  tree: 0x3a6a3a,
  fence_post: 0x6a5030,
  fence_gate: 0x7a6040,
};

/** Landmark types with overridden height */
const LANDMARK_HEIGHT_OVERRIDES: Record<string, number> = {
  tree: 4,
};

// Type aliases for WebGPU-compatible node materials
const TownBasicMat = MeshBasicNodeMaterial;
const TownStdMat = MeshStandardNodeMaterial;
const TownLineMat = LineBasicNodeMaterial;

// ============== Shared Geometry Singletons ==============

let _townConeGeom: THREE.ConeGeometry | null = null;
let _townPillarGeom: THREE.CylinderGeometry | null = null;

function getTownConeGeom(): THREE.ConeGeometry {
  if (!_townConeGeom) _townConeGeom = new THREE.ConeGeometry(20, 50, 8);
  return _townConeGeom;
}

function getTownPillarGeom(): THREE.CylinderGeometry {
  if (!_townPillarGeom)
    _townPillarGeom = new THREE.CylinderGeometry(3, 3, 30, 8);
  return _townPillarGeom;
}

// ============== Types ==============

/** Height query function: given world-space (x, z) returns terrain height */
export type HeightQuerier = (worldX: number, worldZ: number) => number;

/** Callback fired when a selectable mesh is added (for raycasting arrays) */
export type OnSelectableAdded = (object: THREE.Object3D) => void;

/** Callback fired when a LOD object is added (for per-frame LOD updates) */
export type OnLODAdded = (lod: THREE.LOD) => void;

/** Runtime town data stored for terrain flattening and export */
export interface RuntimeTownData {
  id: string;
  name: string;
  position: { x: number; y: number; z: number };
  size: string;
  safeZoneRadius: number;
}

// ============== Shared Material Set ==============

/**
 * A set of shared materials allocated once per refresh call.
 *
 * Without sharing, N towns x M buildings x 6+ materials = thousands of GPU
 * pipelines which exhausts Metal's staging buffer pool on macOS.
 */
interface SharedMaterials {
  buildingGen: BuildingGenerator;
  simpleMat: MeshStandardNodeMaterial;
  farMat: MeshBasicNodeMaterial;
  detailFallbackMat: MeshStandardNodeMaterial;
  pillarMat: MeshBasicNodeMaterial;
  roadLineMat: LineBasicNodeMaterial;
  coneMats: Map<number, MeshBasicNodeMaterial>;
  ringMats: Map<number, MeshBasicNodeMaterial>;
  landmarkMats: Map<number, MeshStandardNodeMaterial>;
}

function createSharedMaterials(): SharedMaterials {
  const simpleMat = new TownStdMat();
  simpleMat.color = new THREE.Color(0xd4a373);
  simpleMat.roughness = 0.9;

  const farMat = new TownBasicMat();
  farMat.color = new THREE.Color(0xc9a577);

  const detailFallbackMat = new TownStdMat();
  detailFallbackMat.color = new THREE.Color(0xd4a373);
  detailFallbackMat.roughness = 0.7;
  detailFallbackMat.metalness = 0.1;

  const pillarMat = new TownBasicMat();
  pillarMat.color = new THREE.Color(0xffffff);

  const roadLineMat = new TownLineMat();
  roadLineMat.color = new THREE.Color(0.45, 0.32, 0.18);
  roadLineMat.linewidth = 2;

  return {
    buildingGen: new BuildingGenerator(),
    simpleMat,
    farMat,
    detailFallbackMat,
    pillarMat,
    roadLineMat,
    coneMats: new Map(),
    ringMats: new Map(),
    landmarkMats: new Map(),
  };
}

// ============== Helper: get or create cached material ==============

function getOrCreateConeMat(
  cache: Map<number, MeshBasicNodeMaterial>,
  color: number,
): MeshBasicNodeMaterial {
  let mat = cache.get(color);
  if (!mat) {
    mat = new MeshBasicNodeMaterial();
    mat.color = new THREE.Color(color);
    cache.set(color, mat);
  }
  return mat;
}

function getOrCreateRingMat(
  cache: Map<number, MeshBasicNodeMaterial>,
  color: number,
): MeshBasicNodeMaterial {
  let mat = cache.get(color);
  if (!mat) {
    mat = new MeshBasicNodeMaterial();
    mat.color = new THREE.Color(color);
    mat.side = THREE.DoubleSide;
    mat.transparent = true;
    mat.opacity = 0.4;
    cache.set(color, mat);
  }
  return mat;
}

function getOrCreateLandmarkMat(
  cache: Map<number, MeshStandardNodeMaterial>,
  color: number,
): MeshStandardNodeMaterial {
  let mat = cache.get(color);
  if (!mat) {
    mat = new TownStdMat();
    mat.color = new THREE.Color(color);
    mat.roughness = 0.7;
    cache.set(color, mat);
  }
  return mat;
}

// ============== TownRenderer ==============

export class TownRenderer {
  /** Map of townId → list of THREE.Object3D children belonging to that town */
  private _townChildIndex = new Map<string, THREE.Object3D[]>();

  /** All LOD objects created by this renderer (for per-frame updates) */
  private _lodObjects: THREE.LOD[] = [];

  /** Last full ProcgenTown[] data used to render (needed for move pipeline) */
  private _lastProcgenTowns: ProcgenTown[] = [];

  /** Runtime town data (game-space coords + safeZoneRadius) */
  private _runtimeTowns: RuntimeTownData[] = [];

  constructor(
    private readonly container: THREE.Group,
    private readonly resourceManager: SceneResourceManager,
  ) {}

  // ---- Accessors ----

  /** Runtime town data from the last refresh (for terrain flattening, export) */
  get runtimeTowns(): RuntimeTownData[] {
    return this._runtimeTowns;
  }

  /** Full ProcgenTown[] from the last refresh (for town-move rebuild) */
  get lastProcgenTowns(): ProcgenTown[] {
    return this._lastProcgenTowns;
  }

  /** All active LOD objects (caller should call lod.update(camera) per frame) */
  get lodObjects(): readonly THREE.LOD[] {
    return this._lodObjects;
  }

  // ---- Public API ----

  /**
   * Rebuild all town 3D meshes from full procgen data.
   *
   * Clears existing town meshes, then creates cone markers, safe zone rings,
   * pillar indicators, building LODs, landmarks, and internal road lines for
   * every town in the provided array.
   *
   * All objects are staged through the SceneResourceManager for rate-limited
   * GPU upload (critical on Metal/macOS).
   *
   * @param towns        Full procgen town data
   * @param offset       World center offset (scene coords = game coords + offset)
   * @param getHeight    Height query fn: (gameX, gameZ) => terrain height
   * @param onSelectable Called when a selectable mesh is added
   * @param onLOD        Called when a LOD object is added
   */
  refreshTowns(
    towns: ProcgenTown[],
    offset: number,
    getHeight: HeightQuerier,
    onSelectable?: OnSelectableAdded,
    onLOD?: OnLODAdded,
  ): void {
    console.warn(
      `%c[TownRenderer.refreshTowns] Called with ${towns.length} towns: ${towns.map((t) => `${t.name}(${t.size}, ${t.buildings.length} bldg, pos ${Math.round(t.position.x)},${Math.round(t.position.z)})`).join(", ")}`,
      "color: cyan; font-weight: bold",
    );

    // Flush any pending staged objects from a previous call
    this.resourceManager.flushStagedForParent(this.container);

    // Clear existing meshes — remove from scene + queue deferred GPU disposal.
    this._clearTownMeshes();

    // Shared materials for this batch
    const mats = createSharedMaterials();

    // Render each town
    for (const town of towns) {
      const color = TOWN_SIZE_COLORS[town.size] ?? 0xffff00;
      const mx = town.position.x + offset;
      const my = getHeight(town.position.x, town.position.z);
      const mz = town.position.z + offset;

      const townUserData = {
        selectable: true,
        selectableType: "town" as const,
        selectableId: town.id,
        townId: town.id,
        townName: town.name,
      };

      // ---- Cone marker pointing down ----
      this._createConeMarker(
        town.id,
        mx,
        my,
        mz,
        color,
        townUserData,
        mats,
        onSelectable,
      );

      // ---- Safe zone ring ----
      this._createSafeZoneRing(
        town.id,
        mx,
        my,
        mz,
        town.safeZoneRadius,
        color,
        townUserData,
        mats,
        onSelectable,
      );

      // ---- Town center pillar ----
      this._createPillar(town.id, mx, my, mz, townUserData, mats, onSelectable);

      // ---- Internal roads ----
      this._createInternalRoads(town.id, town.internalRoads, offset, my, mats);

      // ---- Buildings with LOD ----
      this._createBuildings(town, offset, my, mats, onSelectable, onLOD);

      // ---- Landmarks ----
      this._createLandmarks(town, offset, my, mats);
    }

    // Store data for move pipeline and terrain flattening
    this._lastProcgenTowns = towns;
    this._runtimeTowns = towns.map((t) => ({
      id: t.id,
      name: t.name,
      position: { ...t.position },
      size: t.size,
      safeZoneRadius: t.safeZoneRadius,
    }));

    console.warn(
      `%c[TownRenderer.refreshTowns] DONE — Rendered ${towns.length} towns, container now has ${this.container.children.length} children`,
      "color: lime; font-weight: bold",
    );
  }

  /**
   * Move a single town's 3D scene markers to a new position.
   *
   * Town center markers (cone/ring/pillar) use absolute positioning.
   * Buildings, landmarks, and roads use delta-based positioning.
   * Y is adjusted by terrain height difference for all objects.
   *
   * Does NOT unload tiles — that is handled by the caller's useEffect
   * when roads prop changes.
   *
   * @param townId      Town to move
   * @param newPosition New game-space position
   * @param offset      World center offset
   * @param getHeight   Height query fn
   */
  moveTown(
    townId: string,
    newPosition: { x: number; y: number; z: number },
    offset: number,
    getHeight: HeightQuerier,
  ): void {
    const oldTown = this._runtimeTowns.find((t) => t.id === townId);
    if (!oldTown) {
      console.warn(
        `[TownRenderer.moveTown] Town ${townId} not found in runtimeTowns`,
      );
      return;
    }

    const dx = newPosition.x - oldTown.position.x;
    const dz = newPosition.z - oldTown.position.z;
    if (Math.abs(dx) < 0.01 && Math.abs(dz) < 0.01) return;

    const newSceneX = newPosition.x + offset;
    const newSceneZ = newPosition.z + offset;

    // Query terrain height at new and old positions
    const newTerrainY = getHeight(newPosition.x, newPosition.z);
    const oldTerrainY = getHeight(oldTown.position.x, oldTown.position.z);
    const dy = newTerrainY - oldTerrainY;

    // Move direct children of container that belong to this town.
    // Town center markers (cone/ring/pillar) use absolute x/z positioning
    // because the gizmo already moved the attached cone — applying a delta
    // would double-move it. Buildings/landmarks/roads use x/z delta.
    // Y is adjusted by terrain height difference for ALL objects.
    for (const child of this.container.children) {
      if (child.userData?.townId === townId) {
        if (child.userData?.selectableType === "town") {
          child.position.x = newSceneX;
          child.position.z = newSceneZ;
        } else {
          child.position.x += dx;
          child.position.z += dz;
        }
        child.position.y += dy;
      }
    }

    // Update runtimeTowns ref so terrain flattening uses the new position
    const rt = this._runtimeTowns.find((t) => t.id === townId);
    if (rt) {
      rt.position.x = newPosition.x;
      rt.position.y = newTerrainY;
      rt.position.z = newPosition.z;
    }
  }

  /**
   * Update LOD levels for all building LODs based on camera position.
   *
   * Should be called from the render loop (throttled — e.g. every 10 frames
   * or when camera moves > 5 units).
   */
  updateLODs(camera: THREE.Camera): void {
    for (const lod of this._lodObjects) {
      lod.update(camera);
    }
  }

  /**
   * Set runtimeTowns directly (used during initial layout from server,
   * where towns are rendered inline rather than via refreshTowns).
   */
  setRuntimeTowns(towns: RuntimeTownData[]): void {
    this._runtimeTowns = towns;
  }

  /**
   * Dispose all town meshes and free GPU resources.
   *
   * Traverses all children, disposing geometry and materials synchronously.
   * Call this on component unmount.
   */
  dispose(): void {
    this.container.traverse((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
        child.geometry?.dispose();
        if (child.material instanceof THREE.Material) {
          child.material.dispose();
        }
      }
    });

    // Remove all children from the container
    while (this.container.children.length > 0) {
      this.container.remove(this.container.children[0]);
    }

    this._townChildIndex.clear();
    this._lodObjects = [];
    this._lastProcgenTowns = [];
    this._runtimeTowns = [];
  }

  /**
   * Dispose shared geometry singletons. Call on full application teardown.
   */
  static disposeSharedGeometry(): void {
    if (_townConeGeom) {
      _townConeGeom.dispose();
      _townConeGeom = null;
    }
    if (_townPillarGeom) {
      _townPillarGeom.dispose();
      _townPillarGeom = null;
    }
  }

  // ---- Private: clear existing meshes ----

  private _clearTownMeshes(): void {
    const group = this.container;
    console.warn(
      `[TownRenderer] Clearing ${group.children.length} existing children`,
    );

    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);

      // Remove LOD objects that belonged to the town group
      if (child instanceof THREE.LOD) {
        const lodIdx = this._lodObjects.indexOf(child);
        if (lodIdx >= 0) this._lodObjects.splice(lodIdx, 1);
      }

      // Queue for deferred disposal — processed in small batches after render
      this.resourceManager.queueDisposal(child);
    }

    this._townChildIndex.clear();
  }

  // ---- Private: track children by town ID ----

  private _trackChild(townId: string, object: THREE.Object3D): void {
    let list = this._townChildIndex.get(townId);
    if (!list) {
      list = [];
      this._townChildIndex.set(townId, list);
    }
    list.push(object);
  }

  // ---- Private: cone marker ----

  private _createConeMarker(
    townId: string,
    mx: number,
    my: number,
    mz: number,
    color: number,
    townUserData: Record<string, unknown>,
    mats: SharedMaterials,
    onSelectable?: OnSelectableAdded,
  ): void {
    const coneGeo = getTownConeGeom();
    const coneMat = getOrCreateConeMat(mats.coneMats, color);
    const cone = new THREE.Mesh(coneGeo, coneMat);
    cone.position.set(mx, my + 60, mz);
    cone.rotation.x = Math.PI;
    cone.userData = townUserData;

    this.resourceManager.stage({
      object: cone,
      parent: this.container,
      onAdd: () => onSelectable?.(cone),
    });
    this._trackChild(townId, cone);
  }

  // ---- Private: safe zone ring ----

  private _createSafeZoneRing(
    townId: string,
    mx: number,
    my: number,
    mz: number,
    safeZoneRadius: number,
    color: number,
    townUserData: Record<string, unknown>,
    mats: SharedMaterials,
    onSelectable?: OnSelectableAdded,
  ): void {
    const ringGeo = new THREE.RingGeometry(
      safeZoneRadius - 5,
      safeZoneRadius,
      48,
    );
    const ringMat = getOrCreateRingMat(mats.ringMats, color);
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(mx, my + 2, mz);
    ring.userData = townUserData;

    this.resourceManager.stage({
      object: ring,
      parent: this.container,
      onAdd: () => onSelectable?.(ring),
    });
    this._trackChild(townId, ring);
  }

  // ---- Private: center pillar ----

  private _createPillar(
    townId: string,
    mx: number,
    my: number,
    mz: number,
    townUserData: Record<string, unknown>,
    mats: SharedMaterials,
    onSelectable?: OnSelectableAdded,
  ): void {
    const pillarGeo = getTownPillarGeom();
    const pillar = new THREE.Mesh(pillarGeo, mats.pillarMat);
    pillar.position.set(mx, my + 15, mz);
    pillar.userData = townUserData;

    this.resourceManager.stage({
      object: pillar,
      parent: this.container,
      onAdd: () => onSelectable?.(pillar),
    });
    this._trackChild(townId, pillar);
  }

  // ---- Private: internal roads ----

  private _createInternalRoads(
    townId: string,
    internalRoads:
      | Array<{
          start: { x: number; z: number };
          end: { x: number; z: number };
          isMain: boolean;
          width?: number;
        }>
      | undefined,
    offset: number,
    centerY: number,
    mats: SharedMaterials,
  ): void {
    if (!internalRoads || internalRoads.length === 0) return;

    for (const road of internalRoads) {
      const startX = road.start.x + offset;
      const startZ = road.start.z + offset;
      const endX = road.end.x + offset;
      const endZ = road.end.z + offset;
      const startY = centerY + 1;
      const endY = centerY + 1;

      const roadGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(startX, startY, startZ),
        new THREE.Vector3(endX, endY, endZ),
      ]);
      const roadLine = new THREE.Line(roadGeo, mats.roadLineMat);
      roadLine.userData = { townId };

      this.resourceManager.stage({
        object: roadLine,
        parent: this.container,
      });
      this._trackChild(townId, roadLine);
    }
  }

  // ---- Private: buildings with 3-tier LOD ----

  private _createBuildings(
    town: ProcgenTown,
    offset: number,
    centerY: number,
    mats: SharedMaterials,
    onSelectable?: OnSelectableAdded,
    onLOD?: OnLODAdded,
  ): void {
    for (const building of town.buildings) {
      const bx = building.position.x + offset;
      const bz = building.position.z + offset;
      const by = centerY;
      const buildingWidth = building.size?.width || 10;
      const buildingDepth = building.size?.depth || 10;
      const buildingHeight = 8;

      const buildingLOD = new THREE.LOD();
      buildingLOD.position.set(bx, by, bz);
      buildingLOD.rotation.y = building.rotation || 0;

      // LOD 0: Procedural building — shared BuildingGenerator reuses its
      // uberMaterial across all buildings
      let fullDetailMesh: THREE.Object3D | null = null;
      const generatedBuilding = mats.buildingGen.generate(
        building.type || "house",
        { includeRoof: true, seed: `${town.id}-${building.id}` },
      );

      if (generatedBuilding && generatedBuilding.mesh) {
        fullDetailMesh = generatedBuilding.mesh;
        fullDetailMesh.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

        // Register building for walkability tracking (unified with game logic)
        if (generatedBuilding.layout) {
          buildingWalkabilityService.registerBuilding(
            building.id,
            town.id,
            { x: bx, y: by, z: bz },
            building.rotation || 0,
            generatedBuilding.layout,
            by,
          );
        }
      } else {
        // Fallback to detailed box if generation fails
        const detailGeo = new THREE.BoxGeometry(
          buildingWidth,
          buildingHeight,
          buildingDepth,
        );
        fullDetailMesh = new THREE.Mesh(detailGeo, mats.detailFallbackMat);
        fullDetailMesh.position.y = buildingHeight / 2;
        fullDetailMesh.castShadow = true;
        fullDetailMesh.receiveShadow = true;
      }

      // LOD 1: Simple box — shared material
      const simpleGeo = new THREE.BoxGeometry(
        buildingWidth,
        buildingHeight,
        buildingDepth,
      );
      const simpleMesh = new THREE.Mesh(simpleGeo, mats.simpleMat);
      simpleMesh.position.y = buildingHeight / 2;
      simpleMesh.castShadow = false;
      simpleMesh.receiveShadow = true;

      // LOD 2: Far box — shared material, minimal segments
      const farGeo = new THREE.BoxGeometry(
        buildingWidth,
        buildingHeight,
        buildingDepth,
        1,
        1,
        1,
      );
      const farMesh = new THREE.Mesh(farGeo, mats.farMat);
      farMesh.position.y = buildingHeight / 2;

      // Building userData for selection — set on all meshes and descendants
      // so raycasting works regardless of which LOD level is active
      const buildingUserData = {
        selectable: true,
        selectableType: "building" as const,
        selectableId: building.id,
        townId: town.id,
        townName: town.name,
        buildingType: building.type,
      };

      fullDetailMesh.userData = buildingUserData;
      fullDetailMesh.traverse((child) => {
        child.userData = { ...child.userData, ...buildingUserData };
      });
      simpleMesh.userData = buildingUserData;
      farMesh.userData = buildingUserData;

      buildingLOD.addLevel(fullDetailMesh, 0);
      buildingLOD.addLevel(simpleMesh, BUILDING_LOD_FULL_DISTANCE);
      buildingLOD.addLevel(farMesh, BUILDING_LOD_SIMPLE_DISTANCE);
      buildingLOD.userData = buildingUserData;

      this.resourceManager.stage({
        object: buildingLOD,
        parent: this.container,
        onAdd: () => {
          this._lodObjects.push(buildingLOD);
          onLOD?.(buildingLOD);
          onSelectable?.(buildingLOD);
        },
      });
      this._trackChild(town.id, buildingLOD);
    }
  }

  // ---- Private: landmarks ----

  private _createLandmarks(
    town: ProcgenTown,
    offset: number,
    centerY: number,
    mats: SharedMaterials,
  ): void {
    if (!town.landmarks || town.landmarks.length === 0) return;

    for (const landmark of town.landmarks) {
      const lx = landmark.position.x + offset;
      const lz = landmark.position.z + offset;
      const ly = centerY;

      const landmarkColor = LANDMARK_COLORS[landmark.type] ?? 0x888888;
      const height =
        LANDMARK_HEIGHT_OVERRIDES[landmark.type] ?? landmark.size.height;

      const landmarkGeo = new THREE.BoxGeometry(
        landmark.size.width,
        height,
        landmark.size.depth,
      );
      const landmarkMat = getOrCreateLandmarkMat(
        mats.landmarkMats,
        landmarkColor,
      );
      const landmarkMesh = new THREE.Mesh(landmarkGeo, landmarkMat);
      landmarkMesh.position.set(lx, ly + height / 2, lz);
      landmarkMesh.rotation.y = landmark.rotation;
      landmarkMesh.castShadow = true;
      landmarkMesh.receiveShadow = true;
      landmarkMesh.userData = { townId: town.id };

      this.resourceManager.stage({
        object: landmarkMesh,
        parent: this.container,
      });
      this._trackChild(town.id, landmarkMesh);
    }
  }
}
