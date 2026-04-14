/**
 * TileManager — Standalone tile lifecycle manager extracted from TileBasedTerrain.tsx
 *
 * Encapsulates all tile generation, unloading, LOD swapping, frame-budget queue
 * processing, and pre-seed logic into a single class. The component layer (React)
 * instantiates this class and feeds it dependencies that change over time via setters.
 *
 * Geometry pooling lives at module scope (shared across all TileManager instances)
 * to survive React hot-reloads without leaking GPU buffers.
 */

import { THREE } from "@/utils/webgpu-renderer";

import {
  type TerrainQuerier,
  type TownFlattenZone,
  generateTileGeometry,
} from "../terrainHelpers";
import type { GeneratedRoad } from "../types";
import { applySculptStrokesToGeometry } from "../../WorldStudio/utils/brushApplication";
import type { SceneResourceManager } from "../SceneResourceManager";
import type { DifficultyHeatmapManager } from "../DifficultyHeatmap";
import type { FoliageManager } from "../FoliageRenderer";
import type { EditorGrassManager } from "../EditorGrassManager";
import type { MineAreaData } from "../terrainHelpers";

// ============== TILE GEOMETRY POOL ==============
// Instead of disposing tile geometries on eviction and cloning templates on
// creation, pool them by vertex count for reuse. This eliminates GPU buffer
// allocation/deallocation churn during steady-state camera movement.
const _tileGeomPool = new Map<number, THREE.BufferGeometry[]>();
const MAX_POOLED_PER_SIZE = 32;

function acquirePooledGeometry(
  vertexCount: number,
): THREE.BufferGeometry | undefined {
  const pool = _tileGeomPool.get(vertexCount);
  return pool && pool.length > 0 ? pool.pop() : undefined;
}

function releaseToGeomPool(geom: THREE.BufferGeometry): void {
  const count = geom.attributes.position?.count ?? 0;
  if (count === 0) return;
  let pool = _tileGeomPool.get(count);
  if (!pool) {
    pool = [];
    _tileGeomPool.set(count, pool);
  }
  if (pool.length < MAX_POOLED_PER_SIZE) {
    pool.push(geom);
  } else {
    geom.dispose(); // Pool full — dispose normally
  }
}

/** Flush all pooled geometries (call on full scene teardown). */
export function drainGeometryPool(): void {
  for (const [, pool] of _tileGeomPool) {
    for (const geom of pool) geom.dispose();
  }
  _tileGeomPool.clear();
}

// ============== CONSTANTS ==============

const TILE_LOAD_RADIUS = 5; // tiles in each direction from camera (standalone)
const TILE_LOAD_RADIUS_STUDIO = 3; // full-detail radius for World Studio
const MAX_TILES_PER_FRAME = 2; // limit tile generation per frame for performance

// LOD terrain: low-res tiles fill the horizon when zoomed out
const TILE_LOD_LOW_RESOLUTION = 8; // 8x8 grid for far tiles (vs 32x32 full)
const MAX_LOW_RES_TILES_PER_FRAME = 32; // low-res tiles are 16x cheaper to generate

/** Compute how many tiles to load based on camera altitude */
function getDynamicLoadRadius(cameraY: number, isStudio: boolean): number {
  if (!isStudio) return TILE_LOAD_RADIUS;
  // Near ground: radius 3 (49 tiles). As altitude increases, scale up.
  // Y=50->3, Y=200->5, Y=400->8, Y=800->13, Y=1500->20, Y=3000+->40
  const base = TILE_LOAD_RADIUS_STUDIO;
  const extra = Math.max(0, cameraY - 50) / 80;
  return Math.min(50, Math.round(base + extra));
}

// ============== TYPES ==============

export interface TileData {
  mesh: THREE.Mesh;
  water: THREE.Mesh | null;
  tileX: number;
  tileZ: number;
  lastAccessed: number;
  /** Vertex resolution (e.g. 32 for full, 8 for LOD far tiles) */
  resolution: number;
  /** Dirty flag — geometry needs regeneration due to config change */
  dirty?: boolean;
}

/** Runtime town data used for flatten zone computation */
export interface RuntimeTown {
  id: string;
  name: string;
  position: { x: number; y: number; z: number };
  size: string;
  safeZoneRadius: number;
}

/** Brush overlay strokes for re-application on tile regeneration */
export interface BrushOverlays {
  terrainSculpts: Array<{
    id: string;
    center: { x: number; z: number };
    radius: number;
    strength: number;
    falloff: "smooth" | "linear" | "sharp";
    mode: "raise" | "lower" | "flatten" | "smooth";
    flattenTarget?: number;
    timestamp: number;
  }>;
  foliagePaints?: Array<{
    id: string;
    center: { x: number; z: number };
    radius: number;
    strength: number;
    falloff: "smooth" | "linear" | "sharp";
    mode: "add" | "remove";
    foliageTypes: string[];
    timestamp: number;
  }>;
}

/** Entry in the tile generation queue */
interface TileQueueEntry {
  tileX: number;
  tileZ: number;
  resolution: number;
  distance?: number;
}

/** Entry in the LOD upgrade/downgrade queues */
interface LodQueueEntry {
  key: string;
  tileX: number;
  tileZ: number;
}

/** Immutable configuration for the TileManager (set once at construction) */
export interface TileManagerConfig {
  tileSize: number;
  tileResolution: number;
  worldSize: number;
  maxHeight: number;
  waterThreshold: number;
  isStudio: boolean;
}

/**
 * Mutable dependencies that change over the lifetime of the TileManager.
 * Provided via setters so the component can push new values without
 * recreating the manager.
 */
export interface TileManagerDeps {
  terrainMaterial: THREE.Material;
  waterMaterial: THREE.Material | null;
  templateGeometry: THREE.PlaneGeometry;
  lowResTemplateGeometry: THREE.PlaneGeometry | null;
  waterTemplateGeometry: THREE.PlaneGeometry | null;
  terrainContainer: THREE.Group;
  waterContainer: THREE.Group;
  querier: TerrainQuerier;
}

/**
 * Optional satellite managers that are notified of tile events.
 * All are nullable — the TileManager works without them.
 */
export interface TileManagerSatellites {
  resourceManager: SceneResourceManager;
  heatmapManager?: DifficultyHeatmapManager | null;
  foliageManager?: FoliageManager | null;
  grassManager?: EditorGrassManager | null;
}

/**
 * Callback interface for state updates the component layer (React) cares about.
 * Keeps the TileManager free of React dependencies.
 */
export interface TileManagerCallbacks {
  onLoadedTilesChanged?: (count: number) => void;
  onGeneratingChanged?: (generating: boolean) => void;
  onInitialLoadComplete?: () => void;
}

// ============== HELPERS ==============

/** Build town flatten zones for a tile, with AABB rejection to skip distant towns. */
function buildTownFlattenZones(
  towns: RuntimeTown[],
  tileX: number,
  tileZ: number,
  tileSize: number,
  wcOffset: number,
  querier: TerrainQuerier,
): TownFlattenZone[] | undefined {
  if (towns.length === 0) return undefined;
  const tileMinX = tileX * tileSize - wcOffset;
  const tileMaxX = tileMinX + tileSize;
  const tileMinZ = tileZ * tileSize - wcOffset;
  const tileMaxZ = tileMinZ + tileSize;
  const zones: TownFlattenZone[] = [];
  for (const t of towns) {
    const r = t.safeZoneRadius;
    const outerR = r * 1.4;
    if (
      t.position.x + outerR < tileMinX ||
      t.position.x - outerR > tileMaxX ||
      t.position.z + outerR < tileMinZ ||
      t.position.z - outerR > tileMaxZ
    )
      continue;
    zones.push({
      x: t.position.x,
      z: t.position.z,
      centerHeight: querier(t.position.x, t.position.z).height,
      innerRadius: r * 0.85,
      outerRadius: outerR,
    });
  }
  return zones.length > 0 ? zones : undefined;
}

// ============== TILE MANAGER ==============

export class TileManager {
  // --- Core tile storage ---
  private _tiles = new Map<string, TileData>();

  // --- Tile generation queue + O(1) membership set ---
  private _tileQueue: TileQueueEntry[] = [];
  private _tileQueueSet = new Set<string>();

  // --- Dirty tile queue for incremental regeneration ---
  private _dirtyTileKeys: string[] = [];

  // --- LOD upgrade queue (low-res -> full-res in-place swap) ---
  private _lodUpgradeQueue: LodQueueEntry[] = [];
  private _lodUpgradeQueueSet = new Set<string>();

  // --- LOD downgrade queue (full-res -> low-res in-place swap) ---
  private _lodDowngradeQueue: LodQueueEntry[] = [];
  private _lodDowngradeQueueSet = new Set<string>();

  // --- Camera tile tracking for early-return optimization ---
  private _lastCameraTile = { tileX: -Infinity, tileZ: -Infinity };

  // --- Pre-allocated arrays for updateTiles loop (GC reduction) ---
  private _newEntriesPool: Array<{
    tileX: number;
    tileZ: number;
    resolution: number;
    distance: number;
  }> = [];
  private _remainingPool: TileQueueEntry[] = [];

  // --- Tile key cache (avoids template literal allocation per tile scan) ---
  private _tileKeyCache = new Map<number, string>();

  // --- State tracking ---
  private _isGenerating = false;
  private _initialLoadComplete = false;

  // --- Immutable config ---
  private readonly _tileSize: number;
  private readonly _tileResolution: number;
  private readonly _worldSize: number;
  private readonly _maxHeight: number;
  private readonly _waterThreshold: number;
  private readonly _isStudio: boolean;

  // --- Mutable deps (set via setDeps / individual setters) ---
  private _terrainMaterial: THREE.Material | null = null;
  private _waterMaterial: THREE.Material | null = null;
  private _templateGeometry: THREE.PlaneGeometry | null = null;
  private _lowResTemplateGeometry: THREE.PlaneGeometry | null = null;
  private _waterTemplateGeometry: THREE.PlaneGeometry | null = null;
  private _terrainContainer: THREE.Group | null = null;
  private _waterContainer: THREE.Group | null = null;
  private _querier: TerrainQuerier | null = null;

  // --- Mutable data sources ---
  private _runtimeTowns: RuntimeTown[] = [];
  private _roads: GeneratedRoad[] | undefined;
  private _mines: MineAreaData[] | undefined;
  private _brushOverlays: BrushOverlays | undefined;
  private _configSeed = 0;

  // --- Satellites ---
  private _resourceManager: SceneResourceManager | null = null;
  private _heatmapManager: DifficultyHeatmapManager | null = null;
  private _foliageManager: FoliageManager | null = null;
  private _grassManager: EditorGrassManager | null = null;

  // --- Callbacks ---
  private _callbacks: TileManagerCallbacks = {};

  constructor(config: TileManagerConfig) {
    this._tileSize = config.tileSize;
    this._tileResolution = config.tileResolution;
    this._worldSize = config.worldSize;
    this._maxHeight = config.maxHeight;
    this._waterThreshold = config.waterThreshold;
    this._isStudio = config.isStudio;
  }

  // ================================================================
  //  PUBLIC PROPERTY ACCESS
  // ================================================================

  /** Read-only view of loaded tiles */
  get tiles(): ReadonlyMap<string, TileData> {
    return this._tiles;
  }

  /** Number of currently loaded tiles */
  get tileCount(): number {
    return this._tiles.size;
  }

  /** Whether tile generation queues are non-empty */
  get isGenerating(): boolean {
    return this._isGenerating;
  }

  /** Whether the initial pre-seed / full world load has completed */
  get initialLoadComplete(): boolean {
    return this._initialLoadComplete;
  }

  /** Remaining items across all queues (tile gen + LOD + dirty) */
  get queueDepth(): number {
    return (
      this._tileQueue.length +
      this._lodUpgradeQueue.length +
      this._lodDowngradeQueue.length +
      this._dirtyTileKeys.length
    );
  }

  // ================================================================
  //  DEPENDENCY INJECTION
  // ================================================================

  /** Set all core dependencies at once */
  setDeps(deps: TileManagerDeps): void {
    this._terrainMaterial = deps.terrainMaterial;
    this._waterMaterial = deps.waterMaterial;
    this._templateGeometry = deps.templateGeometry;
    this._lowResTemplateGeometry = deps.lowResTemplateGeometry;
    this._waterTemplateGeometry = deps.waterTemplateGeometry;
    this._terrainContainer = deps.terrainContainer;
    this._waterContainer = deps.waterContainer;
    this._querier = deps.querier;
  }

  /** Set satellite managers (nullable) */
  setSatellites(sats: TileManagerSatellites): void {
    this._resourceManager = sats.resourceManager;
    this._heatmapManager = sats.heatmapManager ?? null;
    this._foliageManager = sats.foliageManager ?? null;
    this._grassManager = sats.grassManager ?? null;
  }

  /** Set callbacks for React state synchronization */
  setCallbacks(cbs: TileManagerCallbacks): void {
    this._callbacks = cbs;
  }

  /** Update runtime towns (game-space coordinates + safeZoneRadius) */
  setRuntimeTowns(towns: RuntimeTown[]): void {
    this._runtimeTowns = towns;
  }

  /** Update road data for tile generation */
  setRoads(roads: GeneratedRoad[] | undefined): void {
    this._roads = roads;
  }

  /** Update mine data for tile generation */
  setMines(mines: MineAreaData[] | undefined): void {
    this._mines = mines;
  }

  /** Update brush overlays for re-application on tile generation */
  setBrushOverlays(overlays: BrushOverlays | undefined): void {
    this._brushOverlays = overlays;
  }

  /** Update the world seed (used for foliage scheduling) */
  setConfigSeed(seed: number): void {
    this._configSeed = seed;
  }

  /** Update the terrain querier (e.g. after config change) */
  setQuerier(querier: TerrainQuerier): void {
    this._querier = querier;
  }

  /** Update the heatmap manager reference */
  setHeatmapManager(mgr: DifficultyHeatmapManager | null): void {
    this._heatmapManager = mgr;
  }

  /** Update the foliage manager reference */
  setFoliageManager(mgr: FoliageManager | null): void {
    this._foliageManager = mgr;
  }

  /** Update the grass manager reference */
  setGrassManager(mgr: EditorGrassManager | null): void {
    this._grassManager = mgr;
  }

  // ================================================================
  //  TILE KEY UTILITIES
  // ================================================================

  /** Get cached tile key string for a tile coordinate */
  getTileKey(tileX: number, tileZ: number): string {
    const packed = (tileX + 500) * 1000 + (tileZ + 500);
    let key = this._tileKeyCache.get(packed);
    if (!key) {
      key = `${tileX}_${tileZ}`;
      this._tileKeyCache.set(packed, key);
    }
    return key;
  }

  /** Check if tile coordinates are within world bounds */
  isInBounds(tileX: number, tileZ: number): boolean {
    return (
      tileX >= 0 &&
      tileX < this._worldSize &&
      tileZ >= 0 &&
      tileZ < this._worldSize
    );
  }

  // ================================================================
  //  TILE LOOKUP
  // ================================================================

  /** Get a tile by key */
  getTile(key: string): TileData | undefined {
    return this._tiles.get(key);
  }

  /** Check if a tile exists */
  hasTile(key: string): boolean {
    return this._tiles.has(key);
  }

  // ================================================================
  //  TILE GENERATION
  // ================================================================

  /**
   * Generate a single tile at a given resolution (full or low-res LOD).
   * Adds the mesh to the scene, stores TileData, and notifies satellites.
   */
  generateTile(tileX: number, tileZ: number, resolution?: number): void {
    const querier = this._querier;
    const fullTemplate = this._templateGeometry;
    const lowResTemplate = this._lowResTemplateGeometry;
    const terrainMaterial = this._terrainMaterial;
    const waterMaterial = this._waterMaterial;
    const terrainContainer = this._terrainContainer;
    const waterContainer = this._waterContainer;

    if (
      !querier ||
      !fullTemplate ||
      !terrainMaterial ||
      !waterMaterial ||
      !terrainContainer ||
      !waterContainer
    )
      return;

    const key = this.getTileKey(tileX, tileZ);
    if (this._tiles.has(key)) return; // Already exists

    // Pick template based on requested resolution
    const useRes = resolution ?? this._tileResolution;
    const isLowRes = lowResTemplate && useRes <= TILE_LOD_LOW_RESOLUTION;
    const template = isLowRes ? lowResTemplate : fullTemplate;

    // Build town flatten zones with AABB rejection
    const wcOffset = (this._worldSize * this._tileSize) / 2;
    const flattenZones = buildTownFlattenZones(
      this._runtimeTowns,
      tileX,
      tileZ,
      this._tileSize,
      wcOffset,
      querier,
    );

    // Try to acquire a recycled geometry from the pool (avoids clone + GPU alloc)
    const templateVertexCount = template.attributes.position.count;
    const pooledGeom = acquirePooledGeometry(templateVertexCount);

    // Generate tile geometry with road influence + town flattening + mine influence
    const { geometry, hasWater } = generateTileGeometry(
      tileX,
      tileZ,
      template,
      querier,
      this._tileSize,
      this._waterThreshold,
      this._maxHeight,
      this._worldSize,
      this._roads,
      flattenZones,
      this._mines,
      pooledGeom, // Reuse pooled geometry if available
    );

    // Re-apply any brush sculpt strokes so they persist across tile unload/reload
    const sculpts = this._brushOverlays?.terrainSculpts;
    if (sculpts && sculpts.length > 0) {
      const halfTileOffset = this._tileSize / 2;
      applySculptStrokesToGeometry(
        geometry,
        tileX * this._tileSize + halfTileOffset,
        tileZ * this._tileSize + halfTileOffset,
        sculpts,
      );
    }

    // One-time diagnostic: check if road influence is being baked into regenerated tiles.
    const tileCount = this._tiles.size;
    if (
      this._roads &&
      this._roads.length > 0 &&
      (tileCount === 1 || tileCount === 50 || tileCount === 200)
    ) {
      const ri = geometry.attributes.roadInfluence;
      let maxRI = 0;
      let nonZeroCount = 0;
      if (ri) {
        for (let vi = 0; vi < ri.count; vi++) {
          const v = ri.getX(vi);
          if (v > maxRI) maxRI = v;
          if (v > 0) nonZeroCount++;
        }
      }
      console.log(
        `[TileManager] Tile(${tileX},${tileZ}) #${tileCount}: ${this._roads.length} roads, ` +
          `maxRI=${maxRI.toFixed(3)}, nonZeroVerts=${nonZeroCount}/${ri?.count ?? 0}, ` +
          `road0 pts=${this._roads[0]?.path?.length ?? "N/A"}`,
      );
    }

    // Mine influence diagnostic (mirrors road diagnostic above)
    if (
      this._mines &&
      this._mines.length > 0 &&
      (tileCount === 1 || tileCount === 50 || tileCount === 200)
    ) {
      const mi = geometry.attributes.mineInfluence;
      let maxMI = 0;
      let nonZeroMineVerts = 0;
      if (mi) {
        for (let vi = 0; vi < mi.count; vi++) {
          const v = mi.getX(vi);
          if (v > maxMI) maxMI = v;
          if (v > 0) nonZeroMineVerts++;
        }
      }
      console.log(
        `[TileManager] Tile(${tileX},${tileZ}) #${tileCount}: ${this._mines.length} mines, ` +
          `maxMI=${maxMI.toFixed(3)}, nonZeroVerts=${nonZeroMineVerts}/${mi?.count ?? 0}`,
      );
    }

    // Create terrain mesh
    const mesh = new THREE.Mesh(geometry, terrainMaterial);
    const halfTileSizeOffset = this._tileSize / 2;
    mesh.position.set(
      tileX * this._tileSize + halfTileSizeOffset,
      0,
      tileZ * this._tileSize + halfTileSizeOffset,
    );
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    // Add tile metadata for raycasting
    mesh.userData = {
      tileX,
      tileZ,
      tileKey: key,
    };
    terrainContainer.add(mesh);

    // Create water mesh if needed — skip in studio mode (uses single world-sized water plane)
    let waterMesh: THREE.Mesh | null = null;
    if (hasWater && !this._isStudio) {
      const waterGeometry = this._waterTemplateGeometry
        ? this._waterTemplateGeometry.clone()
        : (() => {
            const g = new THREE.PlaneGeometry(this._tileSize, this._tileSize);
            g.rotateX(-Math.PI / 2);
            return g;
          })();
      waterMesh = new THREE.Mesh(waterGeometry, waterMaterial);
      waterMesh.position.set(
        tileX * this._tileSize + this._tileSize / 2,
        this._waterThreshold,
        tileZ * this._tileSize + this._tileSize / 2,
      );
      waterContainer.add(waterMesh);
    }

    // Store tile data with resolution for LOD upgrade/downgrade
    this._tiles.set(key, {
      mesh,
      water: waterMesh,
      tileX,
      tileZ,
      lastAccessed: performance.now(),
      resolution: useRes,
    });

    // Notify heatmap manager of new tile
    this._heatmapManager?.onTileLoaded(tileX, tileZ);

    // Schedule foliage generation for this tile
    if (this._querier && this._foliageManager) {
      this._foliageManager.scheduleTile({
        tileX,
        tileZ,
        tileSize: this._tileSize,
        worldSeed: this._configSeed,
        querier: this._querier,
        waterThreshold: this._waterThreshold,
        foliagePaints: this._brushOverlays?.foliagePaints,
      });
    }

    // Add grass for this tile (EditorGrassManager)
    if (this._grassManager) {
      const halfTile = this._tileSize / 2;
      this._grassManager.addTile(
        tileX * this._tileSize + halfTile,
        tileZ * this._tileSize + halfTile,
        this._tileSize,
      );
    }

    this._callbacks.onLoadedTilesChanged?.(this._tiles.size);
  }

  // ================================================================
  //  TILE UNLOADING
  // ================================================================

  /**
   * Unload a tile — remove from scene and pool geometry for reuse.
   * Tile geometries share the terrain material (terrainMaterial) so we must
   * NOT dispose the material — only the per-tile geometry buffers.
   */
  unloadTile(key: string): void {
    const tileData = this._tiles.get(key);
    if (!tileData) return;

    const terrainContainer = this._terrainContainer;
    const waterContainer = this._waterContainer;

    // Remove terrain mesh from scene. Pool the geometry for reuse instead of
    // disposing — eliminates GPU buffer alloc/dealloc churn during camera pan.
    if (terrainContainer) {
      terrainContainer.remove(tileData.mesh);
    }
    // Pool the geometry; dispose only the mesh shell (material is shared)
    releaseToGeomPool(tileData.mesh.geometry);
    tileData.mesh.geometry = null!; // Prevent resourceManager from disposing it

    // Remove water mesh
    if (tileData.water && waterContainer) {
      waterContainer.remove(tileData.water);
      this._resourceManager?.queueDisposal(tileData.water, true);
    }

    // Notify heatmap manager
    this._heatmapManager?.onTileUnloaded(tileData.tileX, tileData.tileZ);

    // Unload foliage for this tile
    this._foliageManager?.unloadTile(tileData.tileX, tileData.tileZ);

    // Remove grass for this tile (EditorGrassManager)
    if (this._grassManager) {
      const halfTile = this._tileSize / 2;
      this._grassManager.removeTile(
        tileData.tileX * this._tileSize + halfTile,
        tileData.tileZ * this._tileSize + halfTile,
      );
    }

    this._tiles.delete(key);
    this._callbacks.onLoadedTilesChanged?.(this._tiles.size);
  }

  // ================================================================
  //  LOD SWAP / DIRTY REGEN
  // ================================================================

  /**
   * Swap a tile's geometry to a target resolution in-place — mesh stays in
   * scene the whole time (no flash). Used for both LOD upgrades/downgrades
   * and dirty-tile regeneration.
   *
   * When the target resolution matches the tile's current resolution (dirty
   * regen), passes the existing geometry for IN-PLACE attribute updates —
   * no new GPU buffers are created, eliminating Metal staging buffer churn.
   */
  swapTileResolution(key: string, targetResolution: number): void {
    const tile = this._tiles.get(key);
    if (!tile) return;

    const querier = this._querier;
    const fullTemplate = this._templateGeometry;
    const lowResTemplate = this._lowResTemplateGeometry;
    const waterContainer = this._waterContainer;

    if (!querier || !fullTemplate) return;

    const isLowRes =
      lowResTemplate && targetResolution <= TILE_LOD_LOW_RESOLUTION;
    const template = isLowRes ? lowResTemplate : fullTemplate;

    // Reuse existing geometry for dirty regen (same resolution) — avoids
    // creating new GPU buffers. Only create new geometry for LOD swaps
    // where vertex count changes.
    const sameResolution = tile.resolution === targetResolution;
    const reuseGeometry = sameResolution ? tile.mesh.geometry : undefined;

    const wcOffset = (this._worldSize * this._tileSize) / 2;
    const flattenZones = buildTownFlattenZones(
      this._runtimeTowns,
      tile.tileX,
      tile.tileZ,
      this._tileSize,
      wcOffset,
      querier,
    );

    const { geometry, hasWater } = generateTileGeometry(
      tile.tileX,
      tile.tileZ,
      template,
      querier,
      this._tileSize,
      this._waterThreshold,
      this._maxHeight,
      this._worldSize,
      this._roads,
      flattenZones,
      this._mines,
      reuseGeometry,
    );

    // Apply brush strokes
    const sculpts = this._brushOverlays?.terrainSculpts;
    if (sculpts && sculpts.length > 0) {
      const halfTileOffset = this._tileSize / 2;
      applySculptStrokesToGeometry(
        geometry,
        tile.tileX * this._tileSize + halfTileOffset,
        tile.tileZ * this._tileSize + halfTileOffset,
        sculpts,
      );
    }

    // Only swap geometry when a NEW geometry was created (LOD change).
    // For in-place updates, the mesh already references the updated geometry.
    if (!sameResolution) {
      const oldGeometry = tile.mesh.geometry;
      tile.mesh.geometry = geometry;
      // Pool old geometry for reuse instead of disposing
      releaseToGeomPool(oldGeometry);
    }

    // Update per-tile water — skip in studio mode (uses single world-sized water plane)
    if (!this._isStudio) {
      if (tile.water && waterContainer) {
        if (!hasWater) {
          waterContainer.remove(tile.water);
          tile.water.geometry.dispose();
          tile.water = null;
        } else {
          tile.water.position.y = this._waterThreshold;
        }
      } else if (hasWater && waterContainer) {
        const waterGeometry = this._waterTemplateGeometry
          ? this._waterTemplateGeometry.clone()
          : (() => {
              const g = new THREE.PlaneGeometry(this._tileSize, this._tileSize);
              g.rotateX(-Math.PI / 2);
              return g;
            })();
        const waterMat = this._waterMaterial;
        if (waterMat) {
          const wm = new THREE.Mesh(waterGeometry, waterMat);
          wm.position.set(
            tile.tileX * this._tileSize + this._tileSize / 2,
            this._waterThreshold,
            tile.tileZ * this._tileSize + this._tileSize / 2,
          );
          waterContainer.add(wm);
          tile.water = wm;
        }
      }
    }

    tile.resolution = targetResolution;
  }

  /**
   * Regenerate a tile's geometry in-place (incremental update without unload/reload).
   * Used by dirty-tile processing when terrain config changes.
   * Delegates to swapTileResolution at the tile's current resolution.
   */
  regenerateTileInPlace(key: string): void {
    const tile = this._tiles.get(key);
    if (!tile) return;
    this.swapTileResolution(key, tile.resolution);
    tile.dirty = false;
  }

  // ================================================================
  //  DIRTY TILE MARKING
  // ================================================================

  /** Mark a single tile as dirty (needs geometry regeneration) */
  markDirty(key: string): void {
    const tile = this._tiles.get(key);
    if (!tile || tile.dirty) return;
    tile.dirty = true;
    this._dirtyTileKeys.push(key);
  }

  /** Mark all loaded tiles as dirty */
  markAllDirty(): void {
    for (const [key, tile] of this._tiles) {
      if (!tile.dirty) {
        tile.dirty = true;
        this._dirtyTileKeys.push(key);
      }
    }
  }

  // ================================================================
  //  FRAME UPDATE (CALL ONCE PER ANIMATION FRAME)
  // ================================================================

  /**
   * Update tiles based on camera position with two-tier LOD:
   *   - Near tiles (within fullDetailRadius): full resolution geometry
   *   - Far tiles (beyond that, up to dynamic farRadius): low-res LOD geometry
   *   - In World Studio mode: tiles are NEVER evicted (full map always visible).
   *     LOD upgrades/downgrades use in-place geometry swap (no flash).
   *
   * @param cameraTileX - Camera's current tile X (Chebyshev grid coordinate)
   * @param cameraTileZ - Camera's current tile Z
   * @param cameraY     - Camera altitude (for dynamic radius + LOD scaling)
   * @param frameTime   - Cached performance.now() from animation loop
   * @param hasStagedWork - Whether SceneResourceManager is draining its staging queue
   */
  updateTiles(
    cameraTileX: number,
    cameraTileZ: number,
    cameraY: number,
    frameTime: number,
    hasStagedWork: boolean,
  ): void {
    // Phase 2A: Skip full tile scan when camera tile hasn't changed.
    // Still process the tile queue, dirty tiles, and LOD queues even when stationary.
    const cameraTileChanged =
      cameraTileX !== this._lastCameraTile.tileX ||
      cameraTileZ !== this._lastCameraTile.tileZ;

    if (cameraTileChanged) {
      this._lastCameraTile.tileX = cameraTileX;
      this._lastCameraTile.tileZ = cameraTileZ;

      const isStudio = this._isStudio;

      // Altitude-dependent full-detail radius: at ground level, use full
      // radius (3 in studio -> 49 full-res tiles). At high altitude, scale
      // down to 1 (9 full-res tiles) since distant detail isn't visible.
      const altitudeScale = isStudio
        ? Math.max(0, 1 - (cameraY - 200) / 600)
        : 1;
      const baseFullDetailRadius = isStudio
        ? TILE_LOAD_RADIUS_STUDIO
        : TILE_LOAD_RADIUS;
      const fullDetailRadius = Math.max(
        1,
        Math.round(
          baseFullDetailRadius * Math.max(0, Math.min(1, altitudeScale)),
        ),
      );

      // Far radius scales with camera altitude — covers visible area when zoomed out
      const farRadius = getDynamicLoadRadius(cameraY, isStudio);

      // In World Studio mode, tiles are never evicted — the full map fits in memory.
      // In standalone mode, evict tiles beyond farRadius + 2.
      const unloadRadius = isStudio ? Infinity : farRadius + 2;

      // Reuse pooled array to avoid per-frame allocation (GC reduction)
      const newEntries = this._newEntriesPool;
      newEntries.length = 0;

      // Queue tiles to load across the full dynamic radius
      for (let dx = -farRadius; dx <= farRadius; dx++) {
        for (let dz = -farRadius; dz <= farRadius; dz++) {
          const tileX = cameraTileX + dx;
          const tileZ = cameraTileZ + dz;

          if (!this.isInBounds(tileX, tileZ)) continue;

          const key = this.getTileKey(tileX, tileZ);
          const dist = Math.max(Math.abs(dx), Math.abs(dz)); // Chebyshev distance
          const wantFullRes = dist <= fullDetailRadius;
          const wantRes = wantFullRes
            ? this._tileResolution
            : TILE_LOD_LOW_RESOLUTION;

          const existing = this._tiles.get(key);
          if (existing) {
            // Use cached frame timestamp instead of per-tile performance.now()
            existing.lastAccessed = frameTime;
            // LOD upgrade: tile is low-res but camera moved close enough for full detail.
            if (wantFullRes && existing.resolution <= TILE_LOD_LOW_RESOLUTION) {
              if (isStudio) {
                // Queue in-place LOD upgrade — mesh stays in scene (no flash)
                if (!this._lodUpgradeQueueSet.has(key)) {
                  this._lodUpgradeQueueSet.add(key);
                  this._lodUpgradeQueue.push({
                    key,
                    tileX: existing.tileX,
                    tileZ: existing.tileZ,
                  });
                }
                continue;
              } else {
                this.unloadTile(key);
                // Falls through to queue for full-res generation
              }
            } else if (
              isStudio &&
              !wantFullRes &&
              existing.resolution > TILE_LOD_LOW_RESOLUTION
            ) {
              // LOD downgrade: camera moved away from a full-res tile.
              // Queue in-place downgrade to reclaim GPU memory.
              if (!this._lodDowngradeQueueSet.has(key)) {
                this._lodDowngradeQueueSet.add(key);
                this._lodDowngradeQueue.push({
                  key,
                  tileX: existing.tileX,
                  tileZ: existing.tileZ,
                });
              }
              continue;
            } else {
              continue;
            }
          }

          if (!this._tileQueueSet.has(key)) {
            this._tileQueueSet.add(key);
            const distance = Math.abs(dx) + Math.abs(dz);
            newEntries.push({ tileX, tileZ, resolution: wantRes, distance });
          }
        }
      }

      // Sort new entries by distance and append to queue
      if (newEntries.length > 0) {
        newEntries.sort((a, b) => a.distance - b.distance);
        for (const entry of newEntries) {
          this._tileQueue.push(entry);
        }
      }

      // Eviction check: only in non-studio mode (studio never evicts)
      if (!isStudio) {
        for (const [key, tile] of this._tiles) {
          const dx = Math.abs(tile.tileX - cameraTileX);
          const dz = Math.abs(tile.tileZ - cameraTileZ);

          if (dx > unloadRadius || dz > unloadRadius) {
            if (frameTime - tile.lastAccessed > 1000) {
              this.unloadTile(key);
            }
          }
        }
      }
    }

    // When the scene staging queue is draining (buildings/vegetation being added),
    // reduce tile generation budget but DON'T pause entirely.
    const maxFullThisFrame = hasStagedWork ? 0 : MAX_TILES_PER_FRAME;

    // Low-res tiles use a time-based budget. During initial load, spend up to
    // 32ms/frame since the viewport is hidden — fills the map 4x faster.
    const duringInitialLoad = !this._initialLoadComplete;
    const LOW_RES_TIME_BUDGET_MS = duringInitialLoad ? 32 : 8;
    const lowResDeadline = frameTime + LOW_RES_TIME_BUDGET_MS;

    // Process tile queue with separate budgets for full-res and low-res
    let fullResGen = 0;
    let lowResGen = 0;
    const lowResCountLimit = duringInitialLoad
      ? MAX_LOW_RES_TILES_PER_FRAME * 4
      : MAX_LOW_RES_TILES_PER_FRAME;

    // Swap pooled array with queue to avoid per-frame allocation.
    // CRITICAL: after swap, pool and queue would alias the same array.
    // Swap refs so clearing the pool next frame doesn't wipe the queue.
    const remaining = this._remainingPool;
    this._remainingPool = this._tileQueue; // old queue becomes next frame's pool
    remaining.length = 0;

    for (const entry of this._tileQueue) {
      const isFullRes = entry.resolution > TILE_LOD_LOW_RESOLUTION;

      if (isFullRes && fullResGen >= maxFullThisFrame) {
        remaining.push(entry);
        continue;
      }
      if (
        !isFullRes &&
        lowResGen >= lowResCountLimit &&
        performance.now() >= lowResDeadline
      ) {
        remaining.push(entry);
        continue;
      }

      const qKey = this.getTileKey(entry.tileX, entry.tileZ);
      this._tileQueueSet.delete(qKey);
      if (this.isInBounds(entry.tileX, entry.tileZ) && !this._tiles.has(qKey)) {
        this.generateTile(entry.tileX, entry.tileZ, entry.resolution);
        if (isFullRes) fullResGen++;
        else lowResGen++;
      }
    }
    this._tileQueue = remaining;

    // Process LOD upgrade queue — swap low-res geometry to full-res in-place (no flash).
    let lodUpgraded = 0;
    const lodUpgradeBudget = hasStagedWork ? 0 : MAX_TILES_PER_FRAME;
    while (this._lodUpgradeQueue.length > 0 && lodUpgraded < lodUpgradeBudget) {
      const entry = this._lodUpgradeQueue.shift()!;
      this._lodUpgradeQueueSet.delete(entry.key);
      const tile = this._tiles.get(entry.key);
      if (tile && tile.resolution <= TILE_LOD_LOW_RESOLUTION) {
        this.swapTileResolution(entry.key, this._tileResolution);
        // Add grass for newly upgraded tile
        if (this._grassManager) {
          const halfTile = this._tileSize / 2;
          this._grassManager.addTile(
            tile.tileX * this._tileSize + halfTile,
            tile.tileZ * this._tileSize + halfTile,
            this._tileSize,
          );
        }
        lodUpgraded++;
      }
    }

    // Process LOD downgrade queue — swap distant full-res to low-res (1 per frame, low priority).
    if (
      this._lodDowngradeQueue.length > 0 &&
      lodUpgraded === 0 &&
      !hasStagedWork
    ) {
      const entry = this._lodDowngradeQueue.shift()!;
      this._lodDowngradeQueueSet.delete(entry.key);
      const tile = this._tiles.get(entry.key);
      if (tile && tile.resolution > TILE_LOD_LOW_RESOLUTION) {
        this.swapTileResolution(entry.key, TILE_LOD_LOW_RESOLUTION);
      }
    }

    // Process dirty tiles progressively — regenerate geometry in-place.
    // Uses a time-based budget (12ms) instead of a fixed count.
    {
      const DIRTY_TIME_BUDGET_MS = 12;
      const dirtyDeadline = performance.now() + DIRTY_TIME_BUDGET_MS;
      let dirtyProcessed = 0;
      while (this._dirtyTileKeys.length > 0) {
        if (hasStagedWork && dirtyProcessed >= 1) break;
        if (dirtyProcessed > 0 && performance.now() >= dirtyDeadline) break;
        const dirtyKey = this._dirtyTileKeys.shift()!;
        const dirtyTile = this._tiles.get(dirtyKey);
        if (dirtyTile?.dirty) {
          this.regenerateTileInPlace(dirtyKey);
          dirtyProcessed++;
        }
      }
    }

    // Update generating state — only fire callback when value actually changes
    const isStillGenerating =
      this._tileQueue.length > 0 ||
      this._dirtyTileKeys.length > 0 ||
      this._lodUpgradeQueue.length > 0;
    if (this._isGenerating !== isStillGenerating) {
      this._isGenerating = isStillGenerating;
      this._callbacks.onGeneratingChanged?.(isStillGenerating);
    }
  }

  // ================================================================
  //  PRE-SEED (INSTANT WORLD OVERVIEW)
  // ================================================================

  /**
   * Pre-seed entire world with low-res tiles for instant overview.
   *
   * Fast path: bypass generateTile() overhead for the initial batch.
   * Saves: per-tile town flatten zone recomputation, per-tile React state
   * updates, diagnostic logging, water mesh creation, and heatmap
   * notifications. Roads/mines are skipped (invisible at 8x8 from distance);
   * LOD upgrade to full-res will include them when the camera zooms in.
   *
   * For worlds <= MAX_SYNC_WORLD_SIZE (50x50 = 2,500 tiles), generates
   * synchronously in a single frame. Larger worlds queue tiles for
   * progressive async generation.
   */
  preSeedWorld(): void {
    if (!this._isStudio) {
      // Non-studio mode: mark as complete immediately (no loading overlay)
      this._initialLoadComplete = true;
      this._callbacks.onInitialLoadComplete?.();
      return;
    }

    const querier = this._querier;
    const lowTemplate = this._lowResTemplateGeometry;
    const tMaterial = this._terrainMaterial;
    const tContainer = this._terrainContainer;

    const MAX_SYNC_WORLD_SIZE = 50; // 50x50 = 2,500 tiles = ~16MB at 8x8
    if (
      this._worldSize <= MAX_SYNC_WORLD_SIZE &&
      querier &&
      lowTemplate &&
      tMaterial &&
      tContainer
    ) {
      const startT = performance.now();

      // Pre-compute town flatten zones once for the entire batch
      const towns = this._runtimeTowns;
      const wcOffset = (this._worldSize * this._tileSize) / 2;
      let batchFlattenZones: TownFlattenZone[] | undefined;
      if (towns.length > 0) {
        batchFlattenZones = [];
        for (const t of towns) {
          const r = t.safeZoneRadius;
          batchFlattenZones.push({
            x: t.position.x,
            z: t.position.z,
            centerHeight: querier(t.position.x, t.position.z).height,
            innerRadius: r * 0.85,
            outerRadius: r * 1.4,
          });
        }
        if (batchFlattenZones.length === 0) batchFlattenZones = undefined;
      }

      const halfTile = this._tileSize / 2;
      const now = performance.now();
      let syncGenCount = 0;

      for (let tx = 0; tx < this._worldSize; tx++) {
        for (let tz = 0; tz < this._worldSize; tz++) {
          const key = `${tx}_${tz}`;
          if (this._tiles.has(key)) continue;

          // Generate geometry — skip roads/mines for speed (invisible at low-res distance)
          const { geometry } = generateTileGeometry(
            tx,
            tz,
            lowTemplate,
            querier,
            this._tileSize,
            this._waterThreshold,
            this._maxHeight,
            this._worldSize,
            undefined, // roads — skipped for speed
            batchFlattenZones,
            undefined, // mines — skipped for speed
          );

          const mesh = new THREE.Mesh(geometry, tMaterial);
          mesh.position.set(
            tx * this._tileSize + halfTile,
            0,
            tz * this._tileSize + halfTile,
          );
          mesh.receiveShadow = true;
          mesh.userData = { tileX: tx, tileZ: tz, tileKey: key };
          tContainer.add(mesh);

          // Skip water mesh creation during pre-seed (deferred to LOD upgrade)

          this._tiles.set(key, {
            mesh,
            water: null,
            tileX: tx,
            tileZ: tz,
            lastAccessed: now,
            resolution: TILE_LOD_LOW_RESOLUTION,
          });
          syncGenCount++;
        }
      }

      // Single batched state update
      if (syncGenCount > 0) {
        this._callbacks.onLoadedTilesChanged?.(this._tiles.size);
        console.log(
          `[TileManager] Pre-seeded ${syncGenCount} low-res tiles in ${(performance.now() - startT).toFixed(1)}ms`,
        );
      }

      // Sync path: all tiles exist immediately
      this._initialLoadComplete = true;
      this._callbacks.onInitialLoadComplete?.();
    } else {
      // Large world (or missing refs): queue-based progressive generation
      let preSeedQueued = 0;
      for (let tx = 0; tx < this._worldSize; tx++) {
        for (let tz = 0; tz < this._worldSize; tz++) {
          const key = `${tx}_${tz}`;
          if (!this._tiles.has(key) && !this._tileQueueSet.has(key)) {
            this._tileQueueSet.add(key);
            this._tileQueue.push({
              tileX: tx,
              tileZ: tz,
              resolution: TILE_LOD_LOW_RESOLUTION,
            });
            preSeedQueued++;
          }
        }
      }
      if (preSeedQueued > 0) {
        console.log(
          `[TileManager] Queued ${preSeedQueued} low-res tiles for progressive world overview`,
        );
      }
      // Async path: caller should check tileCount >= totalTileCount in animation loop
    }
  }

  /**
   * Check if async pre-seed has completed (for large worlds that use
   * queue-based progressive generation). Call from the animation loop.
   * Returns true if just now completed (for one-shot callback firing).
   */
  checkAsyncPreSeedComplete(): boolean {
    if (this._initialLoadComplete) return false;
    const totalTileCount = this._worldSize * this._worldSize;
    if (this._tiles.size >= totalTileCount) {
      this._initialLoadComplete = true;
      this._callbacks.onInitialLoadComplete?.();
      return true;
    }
    return false;
  }

  // ================================================================
  //  QUEUE MANAGEMENT
  // ================================================================

  /** Clear all pending generation / LOD / dirty queues */
  clearQueues(): void {
    this._tileQueue.length = 0;
    this._tileQueueSet.clear();
    this._dirtyTileKeys.length = 0;
    this._lodUpgradeQueue.length = 0;
    this._lodUpgradeQueueSet.clear();
    this._lodDowngradeQueue.length = 0;
    this._lodDowngradeQueueSet.clear();
  }

  /** Reset camera tile tracking (forces full rescan on next updateTiles) */
  resetCameraTile(): void {
    this._lastCameraTile.tileX = -Infinity;
    this._lastCameraTile.tileZ = -Infinity;
  }

  // ================================================================
  //  FULL DISPOSAL
  // ================================================================

  /**
   * Dispose all tiles and release GPU resources.
   * Does NOT drain the geometry pool (call drainGeometryPool() separately
   * if you want to release pooled geometries too).
   */
  dispose(): void {
    // Unload all tiles
    const keys = [...this._tiles.keys()];
    for (const key of keys) {
      this.unloadTile(key);
    }

    // Clear all queues
    this.clearQueues();

    // Clear caches
    this._tileKeyCache.clear();
    this._newEntriesPool.length = 0;
    this._remainingPool.length = 0;

    // Reset state
    this._isGenerating = false;
    this._initialLoadComplete = false;
    this._lastCameraTile.tileX = -Infinity;
    this._lastCameraTile.tileZ = -Infinity;
  }
}
