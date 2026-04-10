/**
 * TileBasedTerrain - Real tile-based terrain viewer matching the game's terrain system
 *
 * This component renders terrain exactly as it appears in the game:
 * - Individual 100m x 100m tiles as separate THREE.Mesh objects
 * - Same terrain generation via TerrainGenerator from @hyperscape/procgen
 * - Tile loading/unloading based on camera position
 * - Fly camera controls for exploration
 * - Town markers showing generated towns
 *
 * Uses WebGPU renderer for TSL/node materials compatibility.
 */

import { BuildingGenerator } from "@hyperscape/procgen/building";
import { TownGenerator } from "@hyperscape/procgen/building/town";
import type { GeneratedTown as ProcgenTown } from "@hyperscape/procgen/building/town";
import {
  TerrainGenerator,
  createConfigFromPreset,
  TERRAIN_PRESETS,
  type TerrainConfig,
} from "@hyperscape/procgen/terrain";
import React, {
  useEffect,
  useRef,
  useCallback,
  useState,
  useMemo,
} from "react";
import {
  MeshStandardNodeMaterial,
  MeshBasicNodeMaterial,
  LineBasicNodeMaterial,
} from "three/webgpu";

import { useCameraControls } from "./useCameraControls";
import { ViewHelper } from "three/examples/jsm/helpers/ViewHelper.js";

import { buildingWalkabilityService } from "./BuildingWalkabilityService";
import { Minimap, WILDERNESS_START_PERCENT } from "./Minimap";
import {
  createGameTerrainQuerier,
  GAME_MAX_HEIGHT,
  GAME_WATER_THRESHOLD,
  GAME_TILE_SIZE,
  GAME_WORLD_SIZE,
} from "./GameTerrainAdapter";
import {
  generateTrees,
  type ResourceGenerationContext,
  getTreeConfigForBiome,
  precomputeExclusions,
  filterTreesByExclusions,
  type VegetationExclusionInput,
} from "@hyperscape/shared/world";
import {
  initTreeModels,
  getTreeSpeciesInstance,
  getAllTreeSpeciesIds,
  clearTreeSpeciesCache,
  createBridgeMeshes,
  createDuelArena,
} from "./GameWorldAssets";
import {
  DifficultyHeatmapManager,
  type TownInfo,
  type DangerSourceInfo,
} from "./DifficultyHeatmap";
// createRoadMaterial removed — roads rendered by terrain shader, not ribbon meshes
import {
  createGameWorldEntities,
  disposeEntitySync,
  disposeEntitySyncGeometry,
  type GameEntityData,
} from "./GameWorldEntitySync";
import { SceneResourceManager } from "./SceneResourceManager";
import {
  getGpuLifecycleStats,
  processDeferredFrame,
} from "../WorldStudio/utils/deferredGpuDisposal";
import { applySculptStrokesToGeometry } from "../WorldStudio/utils/brushApplication";
import type {
  WorldCreationConfig,
  GeneratedRoad,
  VegetationConfig,
} from "./types";
import {
  type TerrainQueryResult,
  type TerrainQuerier,
  type TownFlattenZone,
  createTemplateGeometry,
  createTerrainMaterial,
  createWaterMaterial,
  generateTileGeometry,
} from "./terrainHelpers";

import {
  THREE,
  createWebGPURenderer,
  type AssetForgeRenderer,
} from "@/utils/webgpu-renderer";

// Type aliases for clarity (all WebGPU-compatible NodeMaterials)
const TownBasicMat = MeshBasicNodeMaterial;
const TownLineMat = LineBasicNodeMaterial;
const TownStdMat = MeshStandardNodeMaterial;
// VegStdMat alias removed — rocks are now generated server-side

// ============== SHARED GEOMETRY SINGLETONS (Phase 4B) ==============

let _townConeGeom: THREE.ConeGeometry | null = null;
let _townPillarGeom: THREE.CylinderGeometry | null = null;
let _townRingBaseGeom: THREE.RingGeometry | null = null;

function getTownConeGeom(): THREE.ConeGeometry {
  if (!_townConeGeom) _townConeGeom = new THREE.ConeGeometry(20, 50, 8);
  return _townConeGeom;
}

function getTownPillarGeom(): THREE.CylinderGeometry {
  if (!_townPillarGeom)
    _townPillarGeom = new THREE.CylinderGeometry(3, 3, 30, 8);
  return _townPillarGeom;
}

// ============== CONSTANTS ==============

const TILE_LOAD_RADIUS = 5; // tiles in each direction from camera (standalone)
const TILE_LOAD_RADIUS_STUDIO = 3; // full-detail radius for World Studio
const TILE_UNLOAD_RADIUS = 7; // tiles beyond this are unloaded
const TILE_UNLOAD_RADIUS_STUDIO = 5;
const MAX_TILES_PER_FRAME = 2; // limit tile generation per frame for performance
// GPU resource lifecycle (staging + disposal) is managed by SceneResourceManager.
// See SceneResourceManager.ts for rate-limiting constants and phase separation logic.

// LOD terrain: low-res tiles fill the horizon when zoomed out
const TILE_LOD_LOW_RESOLUTION = 8; // 8×8 grid for far tiles (vs 32×32 full)
const MAX_LOW_RES_TILES_PER_FRAME = 32; // low-res tiles are 16× cheaper to generate

/** Camera altitude above which entity markers are hidden (saves thousands of draw calls) */
const MARKER_HIDE_ALTITUDE = 400;

/** Compute how many tiles to load based on camera altitude */
function getDynamicLoadRadius(cameraY: number, isStudio: boolean): number {
  if (!isStudio) return TILE_LOAD_RADIUS;
  // Near ground: radius 3 (49 tiles). As altitude increases, scale up.
  // Y=50→3, Y=200→5, Y=400→8, Y=800→13, Y=1500→20, Y=3000+→40
  const base = TILE_LOAD_RADIUS_STUDIO;
  const extra = Math.max(0, cameraY - 50) / 80;
  return Math.min(50, Math.round(base + extra));
}

// LOD distances for buildings
const BUILDING_LOD_FULL_DISTANCE = 200; // Full detail within this distance
const BUILDING_LOD_SIMPLE_DISTANCE = 500; // Simple boxes beyond this distance

// ============== TIME-OF-DAY LIGHTING ==============

// Time-of-day color presets (RGB, 0-1 range)
const TOD_COLORS = {
  midnight: {
    sun: { r: 0.1, g: 0.1, b: 0.3 },
    ambient: { r: 0.05, g: 0.05, b: 0.15 },
    sky: 0x0a0a2e,
    fog: 0x0a0a2e,
  },
  dawn: {
    sun: { r: 1.0, g: 0.6, b: 0.3 },
    ambient: { r: 0.3, g: 0.2, b: 0.15 },
    sky: 0xff9966,
    fog: 0xffccaa,
  },
  morning: {
    sun: { r: 1.0, g: 0.9, b: 0.7 },
    ambient: { r: 0.4, g: 0.35, b: 0.3 },
    sky: 0x87ceeb,
    fog: 0x87ceeb,
  },
  noon: {
    sun: { r: 1.0, g: 1.0, b: 1.0 },
    ambient: { r: 0.5, g: 0.5, b: 0.5 },
    sky: 0x87ceeb,
    fog: 0x87ceeb,
  },
  afternoon: {
    sun: { r: 1.0, g: 0.95, b: 0.8 },
    ambient: { r: 0.45, g: 0.4, b: 0.35 },
    sky: 0x87ceeb,
    fog: 0x87ceeb,
  },
  dusk: {
    sun: { r: 1.0, g: 0.4, b: 0.2 },
    ambient: { r: 0.3, g: 0.15, b: 0.1 },
    sky: 0xff6633,
    fog: 0xff9966,
  },
  night: {
    sun: { r: 0.15, g: 0.15, b: 0.4 },
    ambient: { r: 0.08, g: 0.08, b: 0.2 },
    sky: 0x0a0a2e,
    fog: 0x0a0a2e,
  },
} as const;

// Time-of-day keyframes: [hour, preset]
const TOD_KEYFRAMES: Array<[number, keyof typeof TOD_COLORS]> = [
  [0, "midnight"],
  [5, "dawn"],
  [7, "morning"],
  [12, "noon"],
  [15, "afternoon"],
  [19, "dusk"],
  [21, "night"],
  [24, "midnight"],
];

/** Write interpolated color directly to target THREE.Color (no allocation) */
function lerpColorTo(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
  t: number,
  out: THREE.Color,
): void {
  out.setRGB(
    a.r + (b.r - a.r) * t,
    a.g + (b.g - a.g) * t,
    a.b + (b.b - a.b) * t,
  );
}

function lerpHex(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff,
    ag = (a >> 8) & 0xff,
    ab = a & 0xff;
  const br = (b >> 16) & 0xff,
    bg = (b >> 8) & 0xff,
    bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bv = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bv;
}

/** Update sun/ambient/fog/sky based on time of day (0-24). */
function updateTimeOfDayLighting(
  hour: number,
  sun: THREE.DirectionalLight,
  ambient: THREE.AmbientLight,
  scene: THREE.Scene,
) {
  // Wrap to 0-24
  const h = ((hour % 24) + 24) % 24;

  // Find surrounding keyframes
  let fromIdx = 0;
  for (let i = 0; i < TOD_KEYFRAMES.length - 1; i++) {
    if (h >= TOD_KEYFRAMES[i][0]) fromIdx = i;
  }
  const toIdx = Math.min(fromIdx + 1, TOD_KEYFRAMES.length - 1);
  const [fromHour, fromKey] = TOD_KEYFRAMES[fromIdx];
  const [toHour, toKey] = TOD_KEYFRAMES[toIdx];

  const range = toHour - fromHour;
  const t = range > 0 ? (h - fromHour) / range : 0;

  const from = TOD_COLORS[fromKey];
  const to = TOD_COLORS[toKey];

  // Interpolate colors directly into light.color (no intermediate object)
  lerpColorTo(from.sun, to.sun, t, sun.color);
  lerpColorTo(from.ambient, to.ambient, t, ambient.color);

  // Sun intensity — brighter at noon, dim at night
  const sunElevation = Math.sin(((h - 6) / 12) * Math.PI); // peaks at noon (12)
  sun.intensity = Math.max(0.1, sunElevation * 1.2);
  ambient.intensity = 0.3 + Math.max(0, sunElevation) * 0.3;

  // Sun position — orbits from east to west
  const angle = ((h - 6) / 24) * Math.PI * 2; // 6am = east horizon
  const elevation = Math.max(0.05, Math.sin(((h - 6) / 12) * Math.PI));
  sun.position.set(
    Math.cos(angle) * 2000,
    elevation * 2000,
    Math.sin(angle) * 1000,
  );

  // Sky + fog color
  const skyHex = lerpHex(from.sky, to.sky, t);
  (scene.background as THREE.Color).setHex(skyHex);
  if (scene.fog instanceof THREE.Fog) {
    scene.fog.color.setHex(lerpHex(from.fog, to.fog, t));
  }
}

// Town marker colors by size
const TOWN_SIZE_COLORS: Record<string, number> = {
  town: 0xff0000, // Red - large towns
  village: 0xff8800, // Orange - medium villages
  hamlet: 0xffff00, // Yellow - small hamlets
};

// ============== TYPES ==============

interface TileData {
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

/** Selection info returned when clicking objects in the viewport */
export interface ViewportSelection {
  type:
    | "terrain"
    | "chunk"
    | "tile"
    | "biome"
    | "town"
    | "building"
    | "road"
    | "entity"
    | "vegetation"
    | "bridge"
    | "duelArena";
  id: string;
  position: { x: number; y: number; z: number };
  townId?: string;
  townName?: string;
  buildingType?: string;
  biomeType?: string;
  tileKey?: string;
  /** Entity type for entity selections (spawnPoint, teleport, mobSpawn, etc.) */
  entityType?: string;
  /** Entity ID for entity selections */
  entityId?: string;
  /** Display name for entity selections */
  entityDisplayName?: string;
  /** Full entity metadata from userData (for game world entities) */
  entityData?: Record<string, unknown>;
  /** Vegetation instance data (for vegetation selections) */
  vegetationSpecies?: string;
  vegetationInstanceIndex?: number;
  /** Tile inspector data for terrain selections */
  tileData?: {
    tileX: number;
    tileZ: number;
    chunkX: number;
    chunkZ: number;
    worldX: number;
    worldZ: number;
    height: number;
    biome: string;
    slope: number;
    walkable: boolean;
    inTown: boolean;
    townId?: string;
    inWilderness: boolean;
    difficultyLevel: number;
  };
}

/** View mode for the viewport */
export type ViewMode = "lit" | "wireframe" | "biomeColors";

/**
 * Exclusion zones for vegetation filtering. Inspired by Far Cry 5's SDF-based
 * density field and Horizon Zero Dawn's distance-to-civilization maps.
 *
 * Instead of binary keep/remove, the system computes a continuous survival
 * probability per tree using signed distance fields + FBM noise distortion +
 * town proximity gradients + scale tapering at forest edges.
 *
 * All positions are in game-space (centered coordinates).
 */
/** Vegetation exclusion input — re-exported from shared for external callers */
export type VegetationExclusions = VegetationExclusionInput;

/**
 * Determine the visually dominant biome from terrain shader blend weights.
 * Uses simple max-weight for general reporting (queryBiome on viewport ref).
 */
function _getVisualBiome(q: TerrainQueryResult): string {
  const fW = q.biomeForestWeight ?? 0;
  const cW = q.biomeCanyonWeight ?? 0;
  const tW = Math.max(0, 1 - fW - cW);
  if (fW >= cW && fW >= tW) return "forest";
  if (cW >= fW && cW >= tW) return "canyon";
  return "tundra";
}

/**
 * Biome selection specifically for tree species placement.
 *
 * The terrain shader linearly blends biome colors:
 *   finalColor = tundra*tW + forest*fW + canyon*cW
 *
 * At boundaries (e.g., forest=0.4, tundra=0.35, canyon=0.25), the max-weight
 * biome is "forest" but the blended visual color is grey-muddy — NOT clearly
 * forest-green. Placing forest-exclusive species (Maple, Knotwood) on this
 * grey ground looks wrong.
 *
 * Fix: require a biome to have >55% weight (clear visual dominance) before
 * using its full species set. Below that threshold the blended color is
 * ambiguous, so we fall back to "tundra" whose conifers (WindPine, Fir, Pine,
 * Birch) look natural on any ground color and create a pleasing transition.
 */
/**
 * Deterministic LCG RNG for tile-based tree generation (client-side).
 * Matches the server's createTileRng exactly so same seed → same trees.
 */
function _createTileRng(
  baseSeed: number,
  tileX: number,
  tileZ: number,
  salt: string,
): () => number {
  const seed = baseSeed >>> 0;
  let saltHash = 5381 >>> 0;
  for (let i = 0; i < salt.length; i++) {
    saltHash = (((saltHash << 5) + saltHash) ^ salt.charCodeAt(i)) >>> 0;
  }
  let state =
    (seed ^
      ((tileX * 73856093) >>> 0) ^
      ((tileZ * 19349663) >>> 0) ^
      saltHash) >>>
    0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

/** Refs exposed to parent for editing tool integration */
export interface TerrainSceneRefs {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  raycaster: THREE.Raycaster;
  /** DOM container element for mouse event binding */
  container: HTMLDivElement;
  terrainContainer: THREE.Group;
  /** Group for adding editor entity markers (NPCs, spawn points, etc.) */
  entityOverlay: THREE.Group;
  /** Register an object as clickable for selection */
  addSelectable: (obj: THREE.Object3D) => void;
  /** Remove an object from selectables */
  removeSelectable: (obj: THREE.Object3D) => void;
  /**
   * Set interaction mode to prevent OrbitControls from conflicting with editing tools.
   * 'orbit' = normal camera controls (left-click rotates)
   * 'tool'  = editing mode (left-click disabled on orbit, middle dolly, right pan)
   * 'gizmo' = transform gizmo active (left disabled for gizmo, middle orbit, right pan)
   */
  setInteractionMode: (mode: "orbit" | "tool" | "gizmo") => void;
  /** Animate camera to focus on a world position with a given bounding radius */
  focusOnPosition: (target: THREE.Vector3, radius: number) => void;
  /** Change the viewport rendering mode */
  setViewMode: (mode: ViewMode) => void;
  /** Toggle the ground grid helper */
  setGridVisible: (visible: boolean) => void;
  /**
   * Promote a vegetation InstancedMesh instance into a standalone Object3D
   * so TransformControls can attach to it. Hides the original instance.
   * Returns the proxy group (already added to entityOverlay), or null if not found.
   */
  promoteVegetationInstance: (
    speciesId: string,
    instanceIndex: number,
    selectableId: string,
  ) => THREE.Group | null;
  /**
   * Write the proxy group's current transform back to the InstancedMesh
   * instance and remove the proxy from the scene.
   */
  demoteVegetationInstance: (proxyGroup: THREE.Group) => void;
  /**
   * Re-fetch tree positions from the server and rebuild all vegetation
   * InstancedMeshes without tearing down the rest of the scene.
   * Pass a VegetationConfig to override biome defaults, or omit for defaults.
   * Pass exclusions to filter out trees near wizard-placed content.
   */
  refreshVegetation: (
    vegConfig?: VegetationConfig,
    exclusions?: VegetationExclusions,
  ) => Promise<void>;
  /** Teleport camera to a world position. Pass close=true for entity-level zoom. */
  navigateCamera: (x: number, z: number, close?: boolean) => void;
  /** True if RMB fly mode was used in the current mouse interaction (for context menu suppression) */
  wasRecentlyFlying: () => boolean;
  /** Sample terrain height at scene coordinates (analytical — no raycasting). Returns 0 if querier not ready. */
  getTerrainHeight: (sceneX: number, sceneZ: number) => number;
  /** Enter player preview mode: ground-locked, WASD walk, mouse look. Press Escape to exit. */
  enterPlayerMode: () => void;
  /** Exit player preview mode and return to orbit camera. */
  exitPlayerMode: () => void;
  /** Whether player preview mode is currently active. */
  isPlayerMode: () => boolean;
  /** Offset to convert between scene-space (0..worldSize) and game-space (-half..+half). sceneX = gameX + offset. */
  worldCenterOffset: number;
  /** Query biome + height at world coordinates (game space). Used by auto-gen pipeline. */
  queryBiome: (
    worldX: number,
    worldZ: number,
  ) => { biome: string; height: number };
  /** Get difficulty level for a biome ID. Used by auto-gen pipeline. */
  getBiomeDifficulty: (biomeId: string) => number;
  /** Runtime-generated towns with positions in game-space. Set by terrain generation. */
  runtimeTowns: Array<{
    id: string;
    name: string;
    position: { x: number; y: number; z: number };
    size: string;
    safeZoneRadius: number;
  }>;
  /** Vegetation tree positions in game-space, populated by refreshVegetation(). */
  vegetationPositions: Array<{ x: number; z: number }>;
  /** Full vegetation tree data for manifest export (species, world pos, scale, rotation). */
  vegetationTrees: Array<{
    s: string;
    x: number;
    y: number;
    z: number;
    sc: number;
    r: number;
  }>;
  /** Rebuild town 3D meshes (buildings, roads, landmarks) from full procgen data. */
  refreshTownMarkers: (towns: ProcgenTown[]) => void;
  /** Move a town's 3D scene markers + update runtimeTownsRef for flatten zones.
   *  Does NOT unload tiles — that's handled by the useEffect when roads prop changes. */
  moveTownInScene: (
    townId: string,
    newPosition: { x: number; y: number; z: number },
  ) => void;
  /** Remove all inter-town road ribbon meshes and re-render from provided roads. */
  rebuildRoadRibbons: (
    roads: Array<{
      id: string;
      path: Array<{ x: number; y: number; z: number }>;
      width: number;
      connectedTowns: [string, string];
      isMainRoad: boolean;
    }>,
  ) => void;
  /** Get the last ProcgenTown[] passed to refreshTownMarkers (for town-move pipeline). */
  getLastProcgenTowns: () => ProcgenTown[];
  /** Show or hide the decorative instanced vegetation layer. */
  setVegetationVisible: (visible: boolean) => void;
  /** Get the current terrain querier function (for heightmap export). */
  getTerrainQuerier: () =>
    | ((worldX: number, worldZ: number) => TerrainQueryResult)
    | null;
}

export interface TileBasedTerrainProps {
  config: WorldCreationConfig;
  className?: string;
  onTileCountChange?: (loaded: number, total: number) => void;
  /** Called when user clicks on an object in the viewport */
  onSelect?: (selection: ViewportSelection | null) => void;
  /** Currently selected object ID for highlighting */
  selectedId?: string | null;
  /** Whether to show vegetation (trees, grass, rocks) - GPU instanced */
  showVegetation?: boolean;
  /** Whether fly mode is enabled (controlled externally) */
  flyModeEnabled?: boolean;
  /** Called when fly mode state changes */
  onFlyModeChange?: (enabled: boolean) => void;
  /** Called when player preview mode state changes */
  onPlayerModeChange?: (enabled: boolean) => void;
  /** Called when camera move speed changes (scroll wheel or [ ] keys) */
  onMoveSpeedChange?: (speed: number) => void;
  /** Pre-generated road network (uses actual pathfinding data) */
  roads?: GeneratedRoad[];
  /** Placed mine areas for terrain influence overlay */
  mines?: Array<{
    position: { x: number; y: number; z: number };
    radius: number;
    radialOffsets: number[];
    entryAngle: number;
    biome: string;
  }>;
  /** Called when scene is ready, exposes refs for editing tool integration */
  onSceneReady?: (refs: TerrainSceneRefs) => void;
  /** When true, suppress built-in HUD overlays (used by World Studio which has its own) */
  hideBuiltinOverlays?: boolean;
  /** Called after game world entities are loaded from the manifest API */
  onGameEntitiesLoaded?: (data: GameEntityData) => void;
  /** Called on quick RMB click (no fly) with screen coords for context menu */
  onViewportContextMenu?: (x: number, y: number) => void;
  /** Show difficulty heatmap overlay on terrain */
  showDifficultyHeatmap?: boolean;
  /** Danger sources for difficulty heatmap overlay */
  dangerSources?: DangerSourceInfo[];
  /** Called after towns are generated/loaded — used to sync runtime towns back to foundation */
  onTownsGenerated?: (
    towns: Array<{
      id: string;
      name: string;
      position: { x: number; y: number; z: number };
      size: "hamlet" | "village" | "town";
      safeZoneRadius: number;
      biomeId?: string;
    }>,
  ) => void;
  /** Brush overlay strokes (terrain sculpt, biome paint) to re-apply on tile generation */
  brushOverlays?: {
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
  };
  /** Override the terrain querier with an imported heightmap querier */
  importedQuerier?:
    | ((worldX: number, worldZ: number) => TerrainQueryResult)
    | null;
  /** Time of day for lighting (0-24, where 0/24=midnight, 6=dawn, 12=noon, 18=dusk) */
  timeOfDay?: number;
}

export type { GameEntityData };

// Minimap extracted to ./Minimap.tsx
// Terrain helper functions extracted to ./terrainHelpers.ts

// ============== MAIN COMPONENT ==============

export const TileBasedTerrain: React.FC<TileBasedTerrainProps> = ({
  config,
  className = "",
  onTileCountChange,
  onSelect,
  selectedId,
  showVegetation = false,
  flyModeEnabled = false,
  onFlyModeChange,
  onMoveSpeedChange,
  roads: providedRoads,
  mines: providedMines,
  onSceneReady,
  hideBuiltinOverlays = false,
  onGameEntitiesLoaded,
  onViewportContextMenu,
  showDifficultyHeatmap = false,
  dangerSources,
  onTownsGenerated,
  onPlayerModeChange,
  brushOverlays,
  importedQuerier,
  timeOfDay = 12,
}) => {
  // Terrain querier ref (defined early so camera hook can use it for player mode)
  const terrainQuerierRef = useRef<TerrainQuerier | null>(null);
  const worldCenterOffsetRef = useRef<number>(0);

  // Stable terrain height callback for player-mode ground lock
  const getTerrainHeightForCamera = useCallback(
    (sceneX: number, sceneZ: number): number => {
      const querier = terrainQuerierRef.current;
      if (!querier) return 0;
      const offset = worldCenterOffsetRef.current;
      return querier(sceneX - offset, sceneZ - offset).height;
    },
    [],
  );

  // Camera controller — handles fly mode, orbit controls, all input handlers
  const cam = useCameraControls({
    worldSize: config.terrain.worldSize,
    tileSize: config.terrain.tileSize,
    onFlyModeChange,
    onMoveSpeedChange,
    onViewportContextMenu,
    onPlayerModeChange,
    getTerrainHeight: getTerrainHeightForCamera,
  });
  const {
    cameraRef,
    cameraStateRef,
    orbitControlsRef,
    containerRef,
    keysRef,
    rmbFlyActiveRef,
    rmbDidFlyRef,
    pendingOrbitCreateRef,
    playerModeRef: camPlayerModeRef,
    updateCamera,
    handleMouseMove,
    handleKeyDown,
    handleKeyUp,
    handleMouseDown,
    handleMouseUp,
    handleWheel,
    handleContextMenu,
    handlePointerLockChange,
    initOrbitControls,
    enterPlayerMode: camEnterPlayerMode,
    exitPlayerMode: camExitPlayerMode,
  } = cam;

  const rendererRef = useRef<AssetForgeRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const sunRef = useRef<THREE.DirectionalLight | null>(null);
  const ambientLightRef = useRef<THREE.AmbientLight | null>(null);
  const timeOfDayRef = useRef(timeOfDay);
  timeOfDayRef.current = timeOfDay;
  const viewHelperRef = useRef<ViewHelper | null>(null);
  const gridHelperRef = useRef<THREE.GridHelper | null>(null);
  const viewModeRef = useRef<ViewMode>("lit");
  const animationIdRef = useRef<number>(0);

  // Terrain state
  const tilesRef = useRef<Map<string, TileData>>(new Map());
  const templateGeometryRef = useRef<THREE.PlaneGeometry | null>(null);
  const lowResTemplateGeometryRef = useRef<THREE.PlaneGeometry | null>(null);
  const waterTemplateGeometryRef = useRef<THREE.PlaneGeometry | null>(null);
  const terrainMaterialRef = useRef<THREE.Material | null>(null); // MeshStandardNodeMaterial for WebGPU
  const waterMaterialRef = useRef<THREE.Material | null>(null); // MeshStandardNodeMaterial for WebGPU
  const lodObjectsRef = useRef<THREE.LOD[]>([]);
  const terrainContainerRef = useRef<THREE.Group | null>(null);
  const waterContainerRef = useRef<THREE.Group | null>(null);
  const townMarkersRef = useRef<THREE.Group | null>(null);
  const vegetationContainerRef = useRef<THREE.Group | null>(null);
  /** Map InstancedMesh → species ID for vegetation instance selection */
  const vegetationSpeciesMapRef = useRef<Map<THREE.InstancedMesh, string>>(
    new Map(),
  );
  const entitySyncRef = useRef<THREE.Group | null>(null);
  const entityOverlayRef = useRef<THREE.Group | null>(null);
  const wildernessOverlayRef = useRef<THREE.Mesh | null>(null);
  /** Vegetation tree positions in game-space, populated by refreshVegetation(). */
  const vegetationPositionsRef = useRef<Array<{ x: number; z: number }>>([]);
  /** Full vegetation tree data for manifest export. */
  const vegetationTreesRef = useRef<
    Array<{ s: string; x: number; y: number; z: number; sc: number; r: number }>
  >([]);
  const generatorRef = useRef<TerrainGenerator | null>(null);
  const heatmapManagerRef = useRef<DifficultyHeatmapManager | null>(null);
  /** Ref-stable copies of props that should NOT trigger full scene rebuild.
   *  Roads ref is ONLY updated via rebuildRoadRibbons() or the useEffect that
   *  watches providedRoads — NOT in the component body. Writing it here would
   *  overwrite the ref with stale prop data during renders that happen between
   *  rebuildRoadRibbons() and the SET_FOUNDATION_ROADS dispatch propagating. */
  const providedRoadsRef = useRef(providedRoads);
  const runtimeMinesRef = useRef(providedMines);
  const townConfigRef = useRef(config.towns);
  townConfigRef.current = config.towns;
  const configSeedRef = useRef(config.seed);
  configSeedRef.current = config.seed;

  // Tile generation queue + O(1) membership set
  const tileQueueRef = useRef<
    Array<{ tileX: number; tileZ: number; resolution: number }>
  >([]);
  const tileQueueSetRef = useRef<Set<string>>(new Set());

  // Dirty tile queue for incremental regeneration (Phase 6)
  const dirtyTileKeysRef = useRef<string[]>([]);
  /** Previous maxHeight for fast-path scaling */
  const prevMaxHeightRef = useRef<number>(config.terrain.maxHeight);
  /** Previous waterThreshold for fast-path water plane move */
  const prevWaterThresholdRef = useRef<number>(config.terrain.waterThreshold);

  // GPU resource lifecycle manager — handles staged object addition and
  // deferred GPU disposal to prevent Metal WebGPU device loss.
  // See SceneResourceManager.ts for invariants and documentation.
  const resourceManager = useRef(new SceneResourceManager()).current;

  // Camera state refs are now managed by useCameraControls hook

  // Performance: track whether we're in World Studio mode via ref
  // (avoids adding hideBuiltinOverlays to callback dep arrays)
  const isStudioModeRef = useRef(hideBuiltinOverlays);
  isStudioModeRef.current = hideBuiltinOverlays;

  // Raycasting for selection
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());
  const mouseRef = useRef<THREE.Vector2>(new THREE.Vector2());
  const selectableObjectsRef = useRef<THREE.Object3D[]>([]);

  // Selection highlighting
  const selectionOutlineRef = useRef<THREE.Mesh | null>(null);
  /** Track which selectable has labels shown due to being selected */
  const selectedLabelRef = useRef<THREE.Object3D | null>(null);

  // UI state
  const [isGenerating, setIsGenerating] = useState(false);
  const isGeneratingRef = useRef(false);
  const [loadedTiles, setLoadedTiles] = useState(0);
  const [townCount, setTownCount] = useState(0);
  /** Runtime town data from terrain generation (game-space coordinates + safeZoneRadius) */
  const runtimeTownsRef = useRef<TerrainSceneRefs["runtimeTowns"]>([]);
  /** Full ProcgenTown[] from last refreshTownMarkers call (for town-move rebuild) */
  const lastProcgenTownsRef = useRef<ProcgenTown[]>([]);
  const [roadCount, setRoadCount] = useState(0);
  const [hoveredObject, setHoveredObject] = useState<string | null>(null);
  /** Track hovered selectable group for label visibility toggle (UE5-style) */
  const hoveredSelectableRef = useRef<THREE.Object3D | null>(null);
  const [cameraRotationY, setCameraRotationY] = useState(0);

  // Minimap data
  const [minimapTowns, setMinimapTowns] = useState<
    Array<{
      id: string;
      name: string;
      position: { x: number; z: number };
      size: string;
    }>
  >([]);
  const [minimapRoads, setMinimapRoads] = useState<
    Array<{ path: Array<{ x: number; z: number }> }>
  >([]);

  // Derived values
  const tileSize = config.terrain.tileSize;
  const tileResolution = config.terrain.tileResolution;
  const worldSize = config.terrain.worldSize;
  const maxHeight = config.terrain.maxHeight;
  const waterThreshold = config.terrain.waterThreshold;

  // Create terrain config - pass ALL config including island, noise, biomes, shoreline
  const terrainConfig = useMemo((): Partial<TerrainConfig> => {
    const preset = config.preset || "large-island";

    // Build full override config from WorldCreationConfig
    const overrides: Partial<TerrainConfig> = {
      seed: config.seed,
      worldSize: config.terrain.worldSize,
      tileSize: config.terrain.tileSize,
      tileResolution: config.terrain.tileResolution,
      maxHeight: config.terrain.maxHeight,
      waterThreshold: config.terrain.waterThreshold,
      // Pass through island, noise, biomes, and shoreline configs
      island: config.island,
      noise: config.noise,
      biomes: config.biomes,
      shoreline: config.shoreline,
    };

    if (TERRAIN_PRESETS[preset]) {
      return createConfigFromPreset(preset, overrides);
    }
    return createConfigFromPreset("large-island", overrides);
  }, [config]);

  // Get tile key — numeric for fast Map lookups (no string allocations)
  // Uses a Cantor-like pairing that handles negative coords via offset
  const getTileKey = useCallback(
    (tileX: number, tileZ: number) => `${tileX}_${tileZ}`,
    [],
  );

  // Track last camera tile position for early-return optimization
  const lastCameraTileRef = useRef({ tileX: -Infinity, tileZ: -Infinity });

  // Check if tile is within world bounds
  const isInBounds = useCallback(
    (tileX: number, tileZ: number) => {
      return tileX >= 0 && tileX < worldSize && tileZ >= 0 && tileZ < worldSize;
    },
    [worldSize],
  );

  // Get current camera tile position
  const getCameraTile = useCallback(() => {
    const camera = cameraRef.current;
    if (!camera) return { tileX: 0, tileZ: 0 };

    const tileX = Math.floor(camera.position.x / tileSize);
    const tileZ = Math.floor(camera.position.z / tileSize);
    return { tileX, tileZ };
  }, [tileSize]);

  // Generate a single tile at a given resolution (full or low-res LOD)
  const generateTile = useCallback(
    (tileX: number, tileZ: number, resolution?: number) => {
      const scene = sceneRef.current;
      const querier = terrainQuerierRef.current;
      const fullTemplate = templateGeometryRef.current;
      const lowResTemplate = lowResTemplateGeometryRef.current;
      const terrainMaterial = terrainMaterialRef.current;
      const waterMaterial = waterMaterialRef.current;
      const terrainContainer = terrainContainerRef.current;
      const waterContainer = waterContainerRef.current;

      if (
        !scene ||
        !querier ||
        !fullTemplate ||
        !terrainMaterial ||
        !waterMaterial ||
        !terrainContainer ||
        !waterContainer
      )
        return;

      const key = getTileKey(tileX, tileZ);
      if (tilesRef.current.has(key)) return; // Already exists

      // Pick template based on requested resolution
      const useRes = resolution ?? tileResolution;
      const isLowRes = lowResTemplate && useRes <= TILE_LOD_LOW_RESOLUTION;
      const template = isLowRes ? lowResTemplate : fullTemplate;

      // Build town flatten zones from runtime towns (game-space coords)
      // innerRadius = 85% of safeZoneRadius — covers all buildings (building placement
      //   radius is ~70% of safeZoneRadius, so 85% leaves margin)
      // outerRadius = 140% of safeZoneRadius — wide blend zone for smooth ramp to
      //   natural terrain, prevents visible cliffs and terrain gaps
      const towns = runtimeTownsRef.current;
      const wcOffset = (worldSize * tileSize) / 2;
      let flattenZones: TownFlattenZone[] | undefined;
      if (towns.length > 0) {
        // Quick AABB reject: only include towns whose outer radius could overlap this tile
        const tileMinX = tileX * tileSize - wcOffset;
        const tileMaxX = tileMinX + tileSize;
        const tileMinZ = tileZ * tileSize - wcOffset;
        const tileMaxZ = tileMinZ + tileSize;
        flattenZones = [];
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
          flattenZones.push({
            x: t.position.x,
            z: t.position.z,
            centerHeight: querier(t.position.x, t.position.z).height,
            innerRadius: r * 0.85,
            outerRadius: outerR,
          });
        }
        if (flattenZones.length === 0) flattenZones = undefined;
      }

      // Generate tile geometry with road influence + town flattening + mine influence
      const roadsForTile = providedRoadsRef.current;
      const minesForTile = runtimeMinesRef.current;
      const { geometry, hasWater } = generateTileGeometry(
        tileX,
        tileZ,
        template,
        querier,
        tileSize,
        waterThreshold,
        maxHeight,
        worldSize,
        roadsForTile,
        flattenZones,
        minesForTile,
      );

      // Re-apply any brush sculpt strokes so they persist across tile unload/reload
      const sculpts = brushOverlaysRef.current?.terrainSculpts;
      if (sculpts && sculpts.length > 0) {
        const halfTileOffset = tileSize / 2;
        applySculptStrokesToGeometry(
          geometry,
          tileX * tileSize + halfTileOffset,
          tileZ * tileSize + halfTileOffset,
          sculpts,
        );
      }

      // One-time diagnostic: check if road influence is being baked into regenerated tiles.
      // Log every 100th tile to track progress without flooding the console.
      const tileCount = tilesRef.current.size;
      if (
        roadsForTile &&
        roadsForTile.length > 0 &&
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
          `[generateTile] Tile(${tileX},${tileZ}) #${tileCount}: ${roadsForTile.length} roads, ` +
            `maxRI=${maxRI.toFixed(3)}, nonZeroVerts=${nonZeroCount}/${ri?.count ?? 0}, ` +
            `road0 pts=${roadsForTile[0]?.path?.length ?? "N/A"}`,
        );
      }

      // Mine influence diagnostic (mirrors road diagnostic above)
      if (
        minesForTile &&
        minesForTile.length > 0 &&
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
          `[generateTile] Tile(${tileX},${tileZ}) #${tileCount}: ${minesForTile.length} mines, ` +
            `maxMI=${maxMI.toFixed(3)}, nonZeroVerts=${nonZeroMineVerts}/${mi?.count ?? 0}`,
        );
      }

      // Create terrain mesh
      const mesh = new THREE.Mesh(geometry, terrainMaterial);
      const halfTileSizeOffset = tileSize / 2;
      mesh.position.set(
        tileX * tileSize + halfTileSizeOffset,
        0,
        tileZ * tileSize + halfTileSizeOffset,
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

      // Create water mesh if needed
      let waterMesh: THREE.Mesh | null = null;
      if (hasWater) {
        const waterGeometry = waterTemplateGeometryRef.current
          ? waterTemplateGeometryRef.current.clone()
          : (() => {
              const g = new THREE.PlaneGeometry(tileSize, tileSize);
              g.rotateX(-Math.PI / 2);
              return g;
            })();
        waterMesh = new THREE.Mesh(waterGeometry, waterMaterial);
        waterMesh.position.set(
          tileX * tileSize + tileSize / 2,
          waterThreshold,
          tileZ * tileSize + tileSize / 2,
        );
        waterContainer.add(waterMesh);
      }

      // Store tile data with resolution for LOD upgrade/downgrade
      tilesRef.current.set(key, {
        mesh,
        water: waterMesh,
        tileX,
        tileZ,
        lastAccessed: performance.now(),
        resolution: useRes,
      });

      // Notify heatmap manager of new tile
      heatmapManagerRef.current?.onTileLoaded(tileX, tileZ);

      setLoadedTiles(tilesRef.current.size);
    },
    [
      getTileKey,
      tileSize,
      tileResolution,
      waterThreshold,
      maxHeight,
      worldSize,
    ],
  );

  // Unload a tile — remove from scene and queue geometry for deferred disposal.
  // Tile geometries share the terrain material (terrainMaterialRef) so we must
  // NOT dispose the material — only the per-tile geometry buffers.
  const unloadTile = useCallback((key: string) => {
    const tileData = tilesRef.current.get(key);
    if (!tileData) return;

    const terrainContainer = terrainContainerRef.current;
    const waterContainer = waterContainerRef.current;

    // Remove terrain mesh from scene — defer GPU disposal to prevent
    // Metal device loss from bulk geometry.dispose() calls (e.g. when
    // refreshTownMarkers unloads ALL tiles for terrain flattening).
    if (terrainContainer) {
      terrainContainer.remove(tileData.mesh);
    }
    resourceManager.queueDisposal(tileData.mesh, true);

    // Remove water mesh
    if (tileData.water && waterContainer) {
      waterContainer.remove(tileData.water);
      resourceManager.queueDisposal(tileData.water, true);
    }

    // Notify heatmap manager
    heatmapManagerRef.current?.onTileUnloaded(tileData.tileX, tileData.tileZ);

    tilesRef.current.delete(key);
    setLoadedTiles(tilesRef.current.size);
  }, []);

  // Regenerate a tile's geometry in-place (incremental update without unload/reload).
  // Used by dirty-tile processing when terrain config changes.
  const regenerateTileInPlace = useCallback(
    (key: string) => {
      const tile = tilesRef.current.get(key);
      if (!tile) return;

      const querier = terrainQuerierRef.current;
      const fullTemplate = templateGeometryRef.current;
      const lowResTemplate = lowResTemplateGeometryRef.current;
      const waterContainer = waterContainerRef.current;

      if (!querier || !fullTemplate) return;

      const isLowRes =
        lowResTemplate && tile.resolution <= TILE_LOD_LOW_RESOLUTION;
      const template = isLowRes ? lowResTemplate : fullTemplate;

      const roadsForTile = providedRoadsRef.current;
      const minesForTile = runtimeMinesRef.current;
      const towns = runtimeTownsRef.current;
      const wcOffset = (worldSize * tileSize) / 2;
      let flattenZones: TownFlattenZone[] | undefined;
      if (towns.length > 0) {
        const tileMinX = tile.tileX * tileSize - wcOffset;
        const tileMaxX = tileMinX + tileSize;
        const tileMinZ = tile.tileZ * tileSize - wcOffset;
        const tileMaxZ = tileMinZ + tileSize;
        flattenZones = [];
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
          flattenZones.push({
            x: t.position.x,
            z: t.position.z,
            centerHeight: querier(t.position.x, t.position.z).height,
            innerRadius: r * 0.85,
            outerRadius: outerR,
          });
        }
        if (flattenZones.length === 0) flattenZones = undefined;
      }

      const { geometry, hasWater } = generateTileGeometry(
        tile.tileX,
        tile.tileZ,
        template,
        querier,
        tileSize,
        waterThreshold,
        maxHeight,
        worldSize,
        roadsForTile,
        flattenZones,
        minesForTile,
      );

      // Apply brush strokes
      const sculpts = brushOverlaysRef.current?.terrainSculpts;
      if (sculpts && sculpts.length > 0) {
        const halfTileOffset = tileSize / 2;
        applySculptStrokesToGeometry(
          geometry,
          tile.tileX * tileSize + halfTileOffset,
          tile.tileZ * tileSize + halfTileOffset,
          sculpts,
        );
      }

      // Swap geometry on existing mesh (no scene remove/add)
      const oldGeometry = tile.mesh.geometry;
      tile.mesh.geometry = geometry;
      oldGeometry.dispose();

      // Update water
      if (tile.water && waterContainer) {
        if (!hasWater) {
          waterContainer.remove(tile.water);
          tile.water.geometry.dispose();
          tile.water = null;
        } else {
          tile.water.position.y = waterThreshold;
        }
      } else if (hasWater && waterContainer) {
        const waterGeometry = waterTemplateGeometryRef.current
          ? waterTemplateGeometryRef.current.clone()
          : (() => {
              const g = new THREE.PlaneGeometry(tileSize, tileSize);
              g.rotateX(-Math.PI / 2);
              return g;
            })();
        const waterMat = waterMaterialRef.current;
        if (waterMat) {
          const wm = new THREE.Mesh(waterGeometry, waterMat);
          wm.position.set(
            tile.tileX * tileSize + tileSize / 2,
            waterThreshold,
            tile.tileZ * tileSize + tileSize / 2,
          );
          waterContainer.add(wm);
          tile.water = wm;
        }
      }

      tile.dirty = false;
    },
    [tileSize, tileResolution, waterThreshold, maxHeight, worldSize],
  );

  // Update tiles based on camera position with two-tier LOD:
  //   - Near tiles (within fullDetailRadius): full resolution geometry
  //   - Far tiles (beyond that, up to dynamic farRadius): low-res LOD geometry
  const updateTiles = useCallback(
    (frameTime: number) => {
      const camera = cameraRef.current;
      if (!camera) return;
      const { tileX: cameraTileX, tileZ: cameraTileZ } = getCameraTile();

      // Phase 2A: Skip full tile scan when camera tile hasn't changed.
      // Still process the tile queue and dirty tiles even when stationary.
      const cameraTileChanged =
        cameraTileX !== lastCameraTileRef.current.tileX ||
        cameraTileZ !== lastCameraTileRef.current.tileZ;

      if (cameraTileChanged) {
        lastCameraTileRef.current.tileX = cameraTileX;
        lastCameraTileRef.current.tileZ = cameraTileZ;

        const isStudio = isStudioModeRef.current;

        // Full-detail radius stays constant
        const fullDetailRadius = isStudio
          ? TILE_LOAD_RADIUS_STUDIO
          : TILE_LOAD_RADIUS;

        // Far radius scales with camera altitude — covers visible area when zoomed out
        const farRadius = getDynamicLoadRadius(camera.position.y, isStudio);

        // Unload radius is slightly beyond the far radius
        const unloadRadius = farRadius + 2;

        // Collect new entries to sort once rather than findIndex + splice per entry
        const newEntries: Array<{
          tileX: number;
          tileZ: number;
          resolution: number;
          distance: number;
        }> = [];

        // Queue tiles to load across the full dynamic radius
        for (let dx = -farRadius; dx <= farRadius; dx++) {
          for (let dz = -farRadius; dz <= farRadius; dz++) {
            const tileX = cameraTileX + dx;
            const tileZ = cameraTileZ + dz;

            if (!isInBounds(tileX, tileZ)) continue;

            const key = getTileKey(tileX, tileZ);
            const dist = Math.max(Math.abs(dx), Math.abs(dz)); // Chebyshev distance
            const wantFullRes = dist <= fullDetailRadius;
            const wantRes = wantFullRes
              ? tileResolution
              : TILE_LOD_LOW_RESOLUTION;

            const existing = tilesRef.current.get(key);
            if (existing) {
              // Phase 2C: Use cached frame timestamp instead of per-tile performance.now()
              existing.lastAccessed = frameTime;
              // LOD upgrade: tile is low-res but camera moved close enough for full detail
              if (
                wantFullRes &&
                existing.resolution <= TILE_LOD_LOW_RESOLUTION
              ) {
                unloadTile(key);
                // Falls through to queue for full-res generation
              } else {
                continue;
              }
            }

            if (!tileQueueSetRef.current.has(key)) {
              tileQueueSetRef.current.add(key);
              const distance = Math.abs(dx) + Math.abs(dz);
              newEntries.push({ tileX, tileZ, resolution: wantRes, distance });
            }
          }
        }

        // Sort new entries by distance and append to queue (avoids O(n) findIndex+splice per entry)
        if (newEntries.length > 0) {
          newEntries.sort((a, b) => a.distance - b.distance);
          for (const entry of newEntries) {
            tileQueueRef.current.push(entry);
          }
        }

        // Phase 2F: Only check for unloads when camera tile changes
        for (const [key, tile] of tilesRef.current) {
          const dx = Math.abs(tile.tileX - cameraTileX);
          const dz = Math.abs(tile.tileZ - cameraTileZ);

          if (dx > unloadRadius || dz > unloadRadius) {
            if (frameTime - tile.lastAccessed > 1000) {
              unloadTile(key);
            }
          }
        }
      }

      // When the scene staging queue is draining (buildings/vegetation being added),
      // reduce tile generation budget but DON'T pause entirely. Low-res tiles are
      // tiny (8×8 = 64 vertices) — a few per frame combined with staging is fine.
      // Full-res tiles (32×32 = 1024 vertices) are paused during staging.
      const hasStagedWork = resourceManager.hasStagedWork;
      const maxFullThisFrame = hasStagedWork ? 0 : MAX_TILES_PER_FRAME;

      // Low-res tiles use a time-based budget: generate as many as possible
      // within 8ms to fill the world overview quickly (~1-2 seconds for 10k tiles)
      // without dropping below 60fps.
      const LOW_RES_TIME_BUDGET_MS = 8;
      const lowResDeadline = frameTime + LOW_RES_TIME_BUDGET_MS;

      // Process tile queue with separate budgets for full-res and low-res
      let fullResGen = 0;
      let lowResGen = 0;
      const remaining: typeof tileQueueRef.current = [];

      for (const entry of tileQueueRef.current) {
        const isFullRes = entry.resolution > TILE_LOD_LOW_RESOLUTION;

        if (isFullRes && fullResGen >= maxFullThisFrame) {
          remaining.push(entry);
          continue;
        }
        if (
          !isFullRes &&
          lowResGen >= MAX_LOW_RES_TILES_PER_FRAME &&
          performance.now() >= lowResDeadline
        ) {
          remaining.push(entry);
          continue;
        }

        const qKey = getTileKey(entry.tileX, entry.tileZ);
        tileQueueSetRef.current.delete(qKey);
        if (
          isInBounds(entry.tileX, entry.tileZ) &&
          !tilesRef.current.has(qKey)
        ) {
          generateTile(entry.tileX, entry.tileZ, entry.resolution);
          if (isFullRes) fullResGen++;
          else lowResGen++;
        }
      }
      tileQueueRef.current = remaining;

      // Process dirty tiles progressively — regenerate geometry in-place without
      // unloading. Budget is shared with new tile generation to avoid GPU spikes.
      let dirtyProcessed = 0;
      const dirtyBudget = hasStagedWork ? 1 : MAX_TILES_PER_FRAME;
      while (
        dirtyTileKeysRef.current.length > 0 &&
        dirtyProcessed < dirtyBudget
      ) {
        const dirtyKey = dirtyTileKeysRef.current.shift()!;
        const dirtyTile = tilesRef.current.get(dirtyKey);
        if (dirtyTile?.dirty) {
          regenerateTileInPlace(dirtyKey);
          dirtyProcessed++;
        }
      }

      // Update generating state — only call setState when the value actually changes
      // to avoid triggering React reconciliation on every animation frame.
      const isStillGenerating =
        tileQueueRef.current.length > 0 || dirtyTileKeysRef.current.length > 0;
      if (isGeneratingRef.current !== isStillGenerating) {
        isGeneratingRef.current = isStillGenerating;
        setIsGenerating(isStillGenerating);
      }
    },
    [
      getCameraTile,
      isInBounds,
      getTileKey,
      generateTile,
      unloadTile,
      tileResolution,
      regenerateTileInPlace,
    ],
  );

  // Handle viewport click for selection
  const handleClick = useCallback(
    (event: MouseEvent) => {
      const container = containerRef.current;
      const camera = cameraRef.current;
      const scene = sceneRef.current;

      if (!container || !camera || !scene) return;

      // During RMB fly mode, ignore LMB clicks for selection
      if (rmbFlyActiveRef.current) return;

      // Selection mode: perform raycast to find what was clicked
      const rect = container.getBoundingClientRect();
      mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycasterRef.current.setFromCamera(mouseRef.current, camera);

      // Check for intersections with selectable objects (towns, buildings) first
      const selectableIntersects = raycasterRef.current.intersectObjects(
        selectableObjectsRef.current,
        true,
      );

      if (selectableIntersects.length > 0) {
        const hit = selectableIntersects[0];
        const object = hit.object;
        // Walk up parent chain to find userData with selectable info
        // (ray may hit a child mesh inside a group)
        let current: THREE.Object3D | null = object;
        let userData: Record<string, unknown> | null = null;
        while (current) {
          const ud = current.userData as Record<string, unknown>;
          if (ud.selectable && ud.selectableType && ud.selectableId) {
            userData = ud;
            break;
          }
          current = current.parent;
        }

        if (userData) {
          const selection: ViewportSelection = {
            type: userData.selectableType as ViewportSelection["type"],
            id: userData.selectableId as string,
            position: {
              x: hit.point.x,
              y: hit.point.y,
              z: hit.point.z,
            },
            townId: userData.townId as string | undefined,
            townName: userData.townName as string | undefined,
            buildingType: userData.buildingType as string | undefined,
            biomeType: userData.biomeType as string | undefined,
            entityType: userData.entityType as string | undefined,
            entityId: userData.entityId as string | undefined,
            entityDisplayName: userData.displayName as string | undefined,
            entityData: userData as Record<string, unknown>,
          };

          onSelect?.(selection);
          return;
        }
      }

      // Check vegetation instances (InstancedMesh per-instance selection)
      const vegContainer = vegetationContainerRef.current;
      if (vegContainer && vegContainer.visible) {
        const vegChildren: THREE.InstancedMesh[] = [];
        vegContainer.traverse((child) => {
          if (child instanceof THREE.InstancedMesh) {
            vegChildren.push(child);
          }
        });
        if (vegChildren.length > 0) {
          const vegIntersects = raycasterRef.current.intersectObjects(
            vegChildren,
            false,
          );
          if (vegIntersects.length > 0) {
            const hit = vegIntersects[0];
            const im = hit.object as THREE.InstancedMesh;
            const instanceId = hit.instanceId;
            const speciesId = vegetationSpeciesMapRef.current.get(im);
            if (instanceId !== undefined && speciesId) {
              // Extract the instance position from the instance matrix
              const instanceMatrix = new THREE.Matrix4();
              im.getMatrixAt(instanceId, instanceMatrix);
              const instancePos = new THREE.Vector3();
              instanceMatrix.decompose(
                instancePos,
                new THREE.Quaternion(),
                new THREE.Vector3(),
              );
              onSelect?.({
                type: "vegetation",
                id: `${speciesId}_${instanceId}`,
                position: {
                  x: instancePos.x,
                  y: instancePos.y,
                  z: instancePos.z,
                },
                vegetationSpecies: speciesId,
                vegetationInstanceIndex: instanceId,
              });
              return;
            }
          }
        }
      }

      // Check if we hit terrain
      const terrainContainer = terrainContainerRef.current;
      if (terrainContainer) {
        const terrainIntersects = raycasterRef.current.intersectObject(
          terrainContainer,
          true,
        );

        if (terrainIntersects.length > 0) {
          const hit = terrainIntersects[0];
          const mesh = hit.object as THREE.Mesh;
          const tileData = mesh.userData as {
            tileX?: number;
            tileZ?: number;
          };

          if (tileData.tileX !== undefined && tileData.tileZ !== undefined) {
            // Query terrain at this point for detailed info
            const generator = generatorRef.current;
            const worldCenterOffset = (worldSize * tileSize) / 2;
            const worldX = hit.point.x - worldCenterOffset;
            const worldZ = hit.point.z - worldCenterOffset;

            // Get chunk coordinates (10x10 tiles per chunk)
            const chunkX = Math.floor(tileData.tileX / 10);
            const chunkZ = Math.floor(tileData.tileZ / 10);

            let biomeType = "unknown";
            let terrainHeight = hit.point.y;
            let slope = 0;
            let walkable = true;

            // Query terrain info — use procgen generator or game querier
            const clickQuerier = terrainQuerierRef.current;
            if (generator && !config.useGamePipeline) {
              const query = generator.queryPoint(worldX, worldZ);
              biomeType = query.biome;
              terrainHeight = query.height;
              slope = query.normal ? 1 - Math.abs(query.normal.y) : 0;
            } else if (clickQuerier) {
              const query = clickQuerier(worldX, worldZ);
              biomeType = query.biome;
              terrainHeight = query.height;
              // Finite-difference slope for game pipeline
              const sd = 1.0;
              const hn = clickQuerier(worldX, worldZ + sd).height;
              const hs = clickQuerier(worldX, worldZ - sd).height;
              const he = clickQuerier(worldX + sd, worldZ).height;
              const hw = clickQuerier(worldX - sd, worldZ).height;
              const dzdx = (he - hw) / (2 * sd);
              const dzdy = (hn - hs) / (2 * sd);
              slope =
                Math.sqrt(dzdx * dzdx + dzdy * dzdy) /
                (1 + Math.sqrt(dzdx * dzdx + dzdy * dzdy));
            }

            {
              // Walkable if not too steep and not underwater
              const terrainWalkable =
                slope < 0.7 && terrainHeight > waterThreshold;

              // Check building walkability (unified with game's BuildingCollisionService logic)
              const buildingCheck = buildingWalkabilityService.checkWalkability(
                worldX,
                worldZ,
                terrainWalkable,
              );
              walkable = buildingCheck.walkable;

              if (buildingCheck.inBuilding) {
                const floorHeight = buildingWalkabilityService.getFloorHeight(
                  worldX,
                  worldZ,
                );
                if (floorHeight !== null) {
                  terrainHeight = floorHeight;
                }
              }
            }

            // Check if in a town (approximate - check against generated towns)
            let inTown = false;
            let townIdForTile: string | undefined;
            const townMarkersGroup = townMarkersRef.current;
            if (townMarkersGroup) {
              townMarkersGroup.traverse((child) => {
                if (child.userData.selectableType === "town") {
                  const townPos = child.position;
                  const dist = Math.sqrt(
                    Math.pow(hit.point.x - townPos.x, 2) +
                      Math.pow(hit.point.z - townPos.z, 2),
                  );
                  // Approximate town radius
                  if (dist < 150) {
                    inTown = true;
                    townIdForTile = child.userData.selectableId;
                  }
                }
              });
            }

            // Check wilderness (northern portion of map)
            // Wilderness starts at WILDERNESS_START_PERCENT (0.7 = 70% from south = northern 30%)
            // In world coordinates, Z increases going north, so wilderness is when Z > 70% of world size
            const worldSizeMeters = worldSize * tileSize;
            const wildernessThreshold =
              worldSizeMeters * WILDERNESS_START_PERCENT;
            const inWilderness = hit.point.z > wildernessThreshold;

            // Calculate difficulty based on distance from center (starter area)
            const distFromCenter = Math.sqrt(worldX * worldX + worldZ * worldZ);
            const maxDist = (worldSize * tileSize) / 2;
            const difficultyLevel = Math.min(
              4,
              Math.floor((distFromCenter / maxDist) * 5),
            );

            const selection: ViewportSelection = {
              type: "tile",
              id: `tile_${tileData.tileX}_${tileData.tileZ}`,
              position: {
                x: hit.point.x,
                y: hit.point.y,
                z: hit.point.z,
              },
              biomeType,
              tileKey: `${tileData.tileX},${tileData.tileZ}`,
              tileData: {
                tileX: tileData.tileX,
                tileZ: tileData.tileZ,
                chunkX,
                chunkZ,
                worldX,
                worldZ,
                height: terrainHeight,
                biome: biomeType,
                slope,
                walkable,
                inTown,
                townId: townIdForTile,
                inWilderness,
                difficultyLevel,
              },
            };

            onSelect?.(selection);
            return;
          }
        }
      }

      // Click on empty space (sky/water) - deselect
      onSelect?.(null);
    },
    [onSelect, worldSize, tileSize, waterThreshold],
  );

  // ---- Stable refs for the mount-once scene effect ----
  // These allow the effect to always call the latest callback / read the
  // latest config without the callbacks themselves being in the dep array,
  // which previously caused the entire WebGPU scene to tear down on every
  // slider change or re-render.
  const terrainConfigRef = useRef(terrainConfig);
  terrainConfigRef.current = terrainConfig;
  const useGamePipelineRef = useRef(config.useGamePipeline);
  useGamePipelineRef.current = config.useGamePipeline;
  const showVegetationRef = useRef(showVegetation);
  showVegetationRef.current = showVegetation;
  const waterThresholdRef = useRef(waterThreshold);
  waterThresholdRef.current = waterThreshold;

  const handleMouseMoveRef = useRef(handleMouseMove);
  handleMouseMoveRef.current = handleMouseMove;
  const handleKeyDownRef = useRef(handleKeyDown);
  handleKeyDownRef.current = handleKeyDown;
  const handleKeyUpRef = useRef(handleKeyUp);
  handleKeyUpRef.current = handleKeyUp;
  const handleMouseDownRef = useRef(handleMouseDown);
  handleMouseDownRef.current = handleMouseDown;
  const handleMouseUpRef = useRef(handleMouseUp);
  handleMouseUpRef.current = handleMouseUp;
  const handleWheelRef = useRef(handleWheel);
  handleWheelRef.current = handleWheel;
  const handleContextMenuRef = useRef(handleContextMenu);
  handleContextMenuRef.current = handleContextMenu;
  const handlePointerLockChangeRef = useRef(handlePointerLockChange);
  handlePointerLockChangeRef.current = handlePointerLockChange;
  const handleClickRef = useRef(handleClick);
  handleClickRef.current = handleClick;
  const updateCameraRef = useRef(updateCamera);
  updateCameraRef.current = updateCamera;
  const updateTilesRef = useRef(updateTiles);
  updateTilesRef.current = updateTiles;
  const generateTileRef = useRef(generateTile);
  generateTileRef.current = generateTile;
  const brushOverlaysRef = useRef(brushOverlays);
  brushOverlaysRef.current = brushOverlays;

  // Initialize Three.js scene with WebGPU
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let mounted = true;

    // Stable event handler wrappers — delegate to latest callback via refs.
    // This lets the effect run once (mount) without re-attaching listeners
    // when handlers change due to config/state updates.
    const _onMouseMove = (e: MouseEvent) => handleMouseMoveRef.current(e);
    const _onKeyDown = (e: KeyboardEvent) => handleKeyDownRef.current(e);
    const _onKeyUp = (e: KeyboardEvent) => handleKeyUpRef.current(e);
    const _onMouseDown = (e: MouseEvent) => handleMouseDownRef.current(e);
    const _onMouseUp = (e: MouseEvent) => handleMouseUpRef.current(e);
    const _onWheel = (e: WheelEvent) => handleWheelRef.current(e);
    const _onContextMenu = (e: MouseEvent) => handleContextMenuRef.current(e);
    const _onPointerLockChange = () => handlePointerLockChangeRef.current();
    const _onClick = (e: MouseEvent) => handleClickRef.current(e);

    // Scene (create before async renderer init)
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb); // Sky blue
    scene.fog = new THREE.Fog(0x87ceeb, 500, 3000);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(
      75,
      container.clientWidth / container.clientHeight,
      1,
      10000,
    );
    // Start camera at center of world, looking down at an angle
    const worldCenter = (worldSize * tileSize) / 2;
    camera.position.set(worldCenter, 400, worldCenter + 300);
    cameraStateRef.current.position.copy(camera.position);
    cameraRef.current = camera;

    // Orbit controls — immediate mouse interaction (rotate, pan, zoom)
    const orbitTarget = new THREE.Vector3(worldCenter, 0, worldCenter);
    initOrbitControls(camera, container, orbitTarget);

    // Containers for terrain, water, and town markers
    const terrainContainer = new THREE.Group();
    scene.add(terrainContainer);
    terrainContainerRef.current = terrainContainer;

    const waterContainer = new THREE.Group();
    scene.add(waterContainer);
    waterContainerRef.current = waterContainer;

    const townMarkers = new THREE.Group();
    scene.add(townMarkers);
    townMarkersRef.current = townMarkers;

    const vegetationContainer = new THREE.Group();
    vegetationContainer.visible = showVegetationRef.current;
    scene.add(vegetationContainer);
    vegetationContainerRef.current = vegetationContainer;

    // Wilderness zone visual (PVP area in north) - border band + floating skull
    const wildernessStartPercent = 0.3; // Start at 30% from center (north direction)
    const worldSizeForWilderness = worldSize * tileSize;
    const worldCenterForWilderness = worldSizeForWilderness / 2;
    const wildernessBoundaryZ =
      worldCenterForWilderness -
      worldSizeForWilderness * wildernessStartPercent;
    const wildernessDepth = wildernessBoundaryZ; // From boundary to north edge (z=0)
    const wildernessWidth = worldSizeForWilderness;

    // Create wilderness border group
    const wildernessGroup = new THREE.Group();
    const borderHeight = 8.0; // Height of border walls
    const borderColor = 0xff0000; // Bright red

    // Border wall material (very transparent to not block grass)
    const borderWallMaterial = new MeshBasicNodeMaterial();
    borderWallMaterial.color = new THREE.Color(borderColor);
    borderWallMaterial.transparent = true;
    borderWallMaterial.opacity = 0.15;
    borderWallMaterial.side = THREE.DoubleSide;
    borderWallMaterial.depthWrite = false;

    // South wall (the main boundary line players cross)
    const southWallGeom = new THREE.PlaneGeometry(
      wildernessWidth,
      borderHeight,
    );
    const southWall = new THREE.Mesh(southWallGeom, borderWallMaterial);
    southWall.position.set(0, borderHeight / 2, wildernessDepth / 2);
    southWall.rotation.y = Math.PI;
    wildernessGroup.add(southWall);

    // East wall
    const eastWallGeom = new THREE.PlaneGeometry(wildernessDepth, borderHeight);
    const eastWall = new THREE.Mesh(eastWallGeom, borderWallMaterial);
    eastWall.position.set(wildernessWidth / 2, borderHeight / 2, 0);
    eastWall.rotation.y = -Math.PI / 2;
    wildernessGroup.add(eastWall);

    // West wall
    const westWallGeom = new THREE.PlaneGeometry(wildernessDepth, borderHeight);
    const westWall = new THREE.Mesh(westWallGeom, borderWallMaterial);
    westWall.position.set(-wildernessWidth / 2, borderHeight / 2, 0);
    westWall.rotation.y = Math.PI / 2;
    wildernessGroup.add(westWall);

    // North wall (at z=0, edge of world)
    const northWallGeom = new THREE.PlaneGeometry(
      wildernessWidth,
      borderHeight,
    );
    const northWall = new THREE.Mesh(northWallGeom, borderWallMaterial);
    northWall.position.set(0, borderHeight / 2, -wildernessDepth / 2);
    wildernessGroup.add(northWall);

    // Border edge lines
    const lineMaterial = new LineBasicNodeMaterial();
    lineMaterial.color = new THREE.Color(borderColor);

    // Top edge outline
    const topEdgePoints = [
      new THREE.Vector3(
        -wildernessWidth / 2,
        borderHeight,
        -wildernessDepth / 2,
      ),
      new THREE.Vector3(
        wildernessWidth / 2,
        borderHeight,
        -wildernessDepth / 2,
      ),
      new THREE.Vector3(wildernessWidth / 2, borderHeight, wildernessDepth / 2),
      new THREE.Vector3(
        -wildernessWidth / 2,
        borderHeight,
        wildernessDepth / 2,
      ),
      new THREE.Vector3(
        -wildernessWidth / 2,
        borderHeight,
        -wildernessDepth / 2,
      ),
    ];
    const topEdgeGeom = new THREE.BufferGeometry().setFromPoints(topEdgePoints);
    const topEdgeLine = new THREE.Line(topEdgeGeom, lineMaterial);
    wildernessGroup.add(topEdgeLine);

    // Position wilderness group at center (lifted 10m above terrain)
    wildernessGroup.position.set(
      worldCenterForWilderness,
      12,
      wildernessDepth / 2,
    );
    scene.add(wildernessGroup);

    // Create floating skull sprite
    const skullCanvas = document.createElement("canvas");
    const skullSize = 256;
    skullCanvas.width = skullSize;
    skullCanvas.height = skullSize;
    const skullCtx = skullCanvas.getContext("2d");
    if (skullCtx) {
      skullCtx.clearRect(0, 0, skullSize, skullSize);
      skullCtx.font = `${skullSize * 0.8}px serif`;
      skullCtx.textAlign = "center";
      skullCtx.textBaseline = "middle";
      skullCtx.fillText("💀", skullSize / 2, skullSize / 2);
      // Add glow
      skullCtx.shadowColor = "rgba(255, 0, 0, 0.8)";
      skullCtx.shadowBlur = 20;
      skullCtx.fillText("💀", skullSize / 2, skullSize / 2);
    }
    const skullTexture = new THREE.CanvasTexture(skullCanvas);

    const skullMaterial = new THREE.SpriteMaterial({
      map: skullTexture,
      transparent: true,
      depthWrite: false,
    });
    const skullSprite = new THREE.Sprite(skullMaterial);
    const skullSpriteSize = 30.0;
    skullSprite.scale.set(skullSpriteSize, skullSpriteSize, 1);
    skullSprite.position.set(
      worldCenterForWilderness,
      50, // High above terrain
      wildernessDepth / 4, // Centered in wilderness zone
    );
    // Phase 4E: Add skull to wildernessGroup (not scene) so cleanup traverses it
    wildernessGroup.add(skullSprite);

    // Store reference for cleanup (use group as main reference)
    wildernessOverlayRef.current = wildernessGroup as unknown as THREE.Mesh;
    // Store skull for animation
    (
      wildernessGroup as THREE.Group & { skullSprite?: THREE.Sprite }
    ).skullSprite = skullSprite;

    // Lighting — positions/colors updated per-frame by time-of-day system
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambient);
    ambientLightRef.current = ambient;

    const sun = new THREE.DirectionalLight(0xffffff, 1.0);
    sun.position.set(1000, 2000, 1000);
    sunRef.current = sun;
    // Skip shadow casting entirely in World Studio (shadows disabled on renderer)
    sun.castShadow = !isStudioModeRef.current;
    if (sun.castShadow) {
      sun.shadow.mapSize.width = 2048;
      sun.shadow.mapSize.height = 2048;
      sun.shadow.camera.near = 100;
      sun.shadow.camera.far = 5000;
      sun.shadow.camera.left = -1000;
      sun.shadow.camera.right = 1000;
      sun.shadow.camera.top = 1000;
      sun.shadow.camera.bottom = -1000;
    }
    scene.add(sun);

    // Create terrain resources (full-res + low-res LOD template)
    templateGeometryRef.current = createTemplateGeometry(
      tileSize,
      tileResolution,
    );
    lowResTemplateGeometryRef.current = createTemplateGeometry(
      tileSize,
      TILE_LOD_LOW_RESOLUTION,
    );
    const waterTemplate = new THREE.PlaneGeometry(tileSize, tileSize);
    waterTemplate.rotateX(-Math.PI / 2);
    waterTemplateGeometryRef.current = waterTemplate;
    terrainMaterialRef.current = createTerrainMaterial();
    waterMaterialRef.current = createWaterMaterial();

    // Create terrain generator and querier
    const generator = new TerrainGenerator(terrainConfigRef.current);
    generatorRef.current = generator;

    // Build the terrain querier — game pipeline uses exact game algorithm,
    // procgen pipeline wraps TerrainGenerator.queryPoint
    if (useGamePipelineRef.current) {
      const gameQuerier = createGameTerrainQuerier(configSeedRef.current);
      terrainQuerierRef.current = (worldX: number, worldZ: number) => {
        const q = gameQuerier.queryPoint(worldX, worldZ);
        return {
          height: q.height,
          biome: q.biomeId,
          color: q.biomeColor,
          biomeForestWeight: q.biomeForestWeight,
          biomeCanyonWeight: q.biomeCanyonWeight,
        };
      };
    } else {
      terrainQuerierRef.current = (worldX: number, worldZ: number) => {
        const q = generator.queryPoint(worldX, worldZ);
        // Extract per-biome weights for shader blending
        const fW =
          q.biomeInfluences?.find((b) => b.type === "forest")?.weight ?? 0;
        const cW =
          q.biomeInfluences?.find((b) => b.type === "canyon")?.weight ?? 0;
        return {
          height: q.height,
          biome: q.biome,
          biomeForestWeight: fW,
          biomeCanyonWeight: cW,
        };
      };
    }

    // Compute world metrics shared by all pipelines
    const worldSizeMeters = worldSize * tileSize;
    const worldCenterOffset = worldSizeMeters / 2;
    worldCenterOffsetRef.current = worldCenterOffset;

    // Clear selectable objects array
    selectableObjectsRef.current = [];

    // ---- Difficulty heatmap overlay ----
    // Create the manager now (querier + scene are ready). Town data arrives
    // later and is fed via setTowns(). The manager creates overlay meshes
    // as terrain tiles load/unload.
    const biomeSystem = generator.getBiomeSystem();
    const heatmapQuerier = terrainQuerierRef.current!;
    const heatmapManager = new DifficultyHeatmapManager({
      scene,
      seed: configSeedRef.current,
      tileSize,
      worldCenterOffset,
      queryBiome: (wx, wz) => {
        const q = heatmapQuerier(wx, wz);
        return { biome: q.biome, height: q.height };
      },
      getBiomeDifficulty: (biomeId: string) => {
        const def = biomeSystem.getBiomeDefinition(biomeId);
        return def?.difficultyLevel ?? 0;
      },
    });
    heatmapManagerRef.current = heatmapManager;

    // ---- Game pipeline: fetch exact towns + roads from server-side game code ----
    // The Asset Forge API runs the ACTUAL TownGenerator + BFS road pathfinding
    // from the game, producing pixel-identical town/road layouts.
    if (useGamePipelineRef.current) {
      const initLayout = async () => {
        const layoutRes = await fetch("/api/world/layout");
        if (!mounted) return;
        if (!layoutRes.ok) {
          console.error(
            "[TileBasedTerrain] Failed to fetch world layout:",
            layoutRes.status,
          );
          return;
        }

        const layout = (await layoutRes.json()) as {
          towns: Array<{
            id: string;
            name: string;
            size: string;
            biome: string;
            position: { x: number; y: number; z: number };
            safeZoneRadius: number;
            layoutType: string;
            buildings: Array<{
              id: string;
              type: string;
              position: { x: number; y: number; z: number };
              rotation: number;
              size: { width: number; depth: number };
            }>;
            entryPoints: Array<{
              position: { x: number; z: number };
              angle: number;
            }>;
            internalRoads: Array<{
              start: { x: number; z: number };
              end: { x: number; z: number };
              width: number;
              isMain: boolean;
            }>;
            paths: Array<{
              start: { x: number; z: number };
              end: { x: number; z: number };
              width: number;
            }>;
            landmarks: Array<{
              type: string;
              position: { x: number; y: number; z: number };
              rotation: number;
              size: { width: number; depth: number; height: number };
            }>;
            plaza?: { center: { x: number; z: number }; radius: number };
          }>;
          roads: Array<{
            id: string;
            fromTownId: string;
            toTownId: string;
            path: Array<{ x: number; z: number }>;
            width: number;
            isMainRoad: boolean;
          }>;
          generationTimeMs: number;
        };
        if (!mounted) return;

        console.warn(
          `%c[initLayout] Received ${layout.towns.length} towns, ${layout.roads.length} roads from server (${layout.generationTimeMs}ms). This will render initial towns.`,
          "color: orange; font-weight: bold",
        );
        setTownCount(layout.towns.length);

        // Store runtime town data for auto-gen pipeline
        runtimeTownsRef.current = layout.towns.map((t) => ({
          id: t.id,
          name: t.name,
          position: { x: t.position.x, y: t.position.y, z: t.position.z },
          size: t.size,
          safeZoneRadius: t.safeZoneRadius,
        }));

        // Sync runtime towns back to foundation (single source of truth)
        onTownsGenerated?.(
          layout.towns.map((t) => ({
            id: t.id,
            name: t.name,
            position: { x: t.position.x, y: t.position.y, z: t.position.z },
            size: t.size as "hamlet" | "village" | "town",
            safeZoneRadius: t.safeZoneRadius,
            biomeId: t.biome,
          })),
        );

        // Feed town data to difficulty heatmap
        if (heatmapManagerRef.current) {
          const townInfos: TownInfo[] = layout.towns.map((t) => ({
            position: { x: t.position.x, z: t.position.z },
            safeZoneRadius: t.safeZoneRadius,
          }));
          heatmapManagerRef.current.setTowns(townInfos);
        }

        // Get height function from game terrain querier
        const heightQuerier = terrainQuerierRef.current;
        const getHeight = (wx: number, wz: number): number =>
          heightQuerier
            ? heightQuerier(wx, wz).height
            : generator.getHeightAt(wx, wz);

        // ---- Render town markers, buildings, landmarks, internal roads ----
        // Shared materials — reuse across all towns to minimize GPU pipeline count
        const initBuildingGen = new BuildingGenerator();
        const initSimpleMat = new TownStdMat();
        initSimpleMat.color = new THREE.Color(0xd4a373);
        initSimpleMat.roughness = 0.9;
        const initFarMat = new TownBasicMat();
        initFarMat.color = new THREE.Color(0xc9a577);
        const initDetailFallbackMat = new TownStdMat();
        initDetailFallbackMat.color = new THREE.Color(0xd4a373);
        initDetailFallbackMat.roughness = 0.7;
        initDetailFallbackMat.metalness = 0.1;
        const initPillarMat = new TownBasicMat();
        initPillarMat.color = new THREE.Color(0xffffff);
        const initRoadLineMat = new TownLineMat();
        initRoadLineMat.color = new THREE.Color(0.45, 0.32, 0.18);
        initRoadLineMat.linewidth = 2;
        const initConeMats = new Map<number, MeshBasicNodeMaterial>();
        const initRingMats = new Map<number, MeshBasicNodeMaterial>();
        const initLandmarkMats = new Map<number, MeshStandardNodeMaterial>();

        for (const town of layout.towns) {
          const color = TOWN_SIZE_COLORS[town.size] ?? 0xffff00;
          const markerX = town.position.x + worldCenterOffset;
          // Use queried terrain height at town center — matches the centerHeight
          // used by generateTileGeometry for flattening
          const markerY = getHeight(town.position.x, town.position.z);
          const markerZ = town.position.z + worldCenterOffset;

          const townUserData = {
            selectable: true,
            selectableType: "town",
            selectableId: town.id,
            townId: town.id,
            townName: town.name,
          };

          // Cone marker pointing down — shared material per town-size color
          const coneGeometry = getTownConeGeom();
          if (!initConeMats.has(color)) {
            const mat = new MeshBasicNodeMaterial();
            mat.color = new THREE.Color(color);
            initConeMats.set(color, mat);
          }
          const marker = new THREE.Mesh(coneGeometry, initConeMats.get(color)!);
          marker.position.set(markerX, markerY + 60, markerZ);
          marker.rotation.x = Math.PI;
          marker.userData = townUserData;
          resourceManager.stage({
            object: marker,
            parent: townMarkers,
            onAdd: () => selectableObjectsRef.current.push(marker),
          });

          // Safe zone ring — shared material per town-size color
          const ringGeometry = new THREE.RingGeometry(
            town.safeZoneRadius - 5,
            town.safeZoneRadius,
            48,
          );
          if (!initRingMats.has(color)) {
            const mat = new MeshBasicNodeMaterial();
            mat.color = new THREE.Color(color);
            mat.side = THREE.DoubleSide;
            mat.transparent = true;
            mat.opacity = 0.4;
            initRingMats.set(color, mat);
          }
          const ring = new THREE.Mesh(ringGeometry, initRingMats.get(color)!);
          ring.rotation.x = -Math.PI / 2;
          ring.position.set(markerX, markerY + 2, markerZ);
          ring.userData = townUserData;
          resourceManager.stage({
            object: ring,
            parent: townMarkers,
            onAdd: () => selectableObjectsRef.current.push(ring),
          });

          // Town center pillar — shared material
          const pillarGeometry = getTownPillarGeom();
          const pillar = new THREE.Mesh(pillarGeometry, initPillarMat);
          pillar.position.set(markerX, markerY + 15, markerZ);
          pillar.userData = townUserData;
          resourceManager.stage({
            object: pillar,
            parent: townMarkers,
            onAdd: () => selectableObjectsRef.current.push(pillar),
          });

          // Internal roads — shared material
          if (town.internalRoads && town.internalRoads.length > 0) {
            for (const road of town.internalRoads) {
              const startX = road.start.x + worldCenterOffset;
              const startZ = road.start.z + worldCenterOffset;
              const endX = road.end.x + worldCenterOffset;
              const endZ = road.end.z + worldCenterOffset;
              const startY = markerY + 1;
              const endY = markerY + 1;

              const roadGeometry = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(startX, startY, startZ),
                new THREE.Vector3(endX, endY, endZ),
              ]);
              const roadLine = new THREE.Line(roadGeometry, initRoadLineMat);
              roadLine.userData = { townId: town.id };
              resourceManager.stage({
                object: roadLine,
                parent: townMarkers,
              });
            }
          }

          // Buildings with LOD — use flattened centerHeight for Y
          for (const building of town.buildings) {
            const bx = building.position.x + worldCenterOffset;
            const bz = building.position.z + worldCenterOffset;
            const by = markerY;
            const buildingWidth = building.size?.width || 10;
            const buildingDepth = building.size?.depth || 10;
            const buildingHeight = 8;

            const buildingLOD = new THREE.LOD();
            buildingLOD.position.set(bx, by, bz);
            buildingLOD.rotation.y = building.rotation || 0;

            // LOD 0: Procedural building — shared BuildingGenerator reuses its uberMaterial
            let fullDetailMesh: THREE.Object3D | null = null;
            const generatedBuilding = initBuildingGen.generate(
              building.type || "house",
              {
                includeRoof: true,
                seed: `${town.id}-${building.id}`,
              },
            );

            if (generatedBuilding && generatedBuilding.mesh) {
              fullDetailMesh = generatedBuilding.mesh;
              fullDetailMesh.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                  child.castShadow = true;
                  child.receiveShadow = true;
                }
              });
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
              const detailGeometry = new THREE.BoxGeometry(
                buildingWidth,
                buildingHeight,
                buildingDepth,
              );
              fullDetailMesh = new THREE.Mesh(
                detailGeometry,
                initDetailFallbackMat,
              );
              fullDetailMesh.position.y = buildingHeight / 2;
              fullDetailMesh.castShadow = true;
              fullDetailMesh.receiveShadow = true;
            }

            // LOD 1: Simple box — shared material
            const simpleGeometry = new THREE.BoxGeometry(
              buildingWidth,
              buildingHeight,
              buildingDepth,
            );
            const simpleMesh = new THREE.Mesh(simpleGeometry, initSimpleMat);
            simpleMesh.position.y = buildingHeight / 2;
            simpleMesh.castShadow = false;
            simpleMesh.receiveShadow = true;

            // LOD 2: Far box — shared material
            const farGeometry = new THREE.BoxGeometry(
              buildingWidth,
              buildingHeight,
              buildingDepth,
              1,
              1,
              1,
            );
            const farMesh = new THREE.Mesh(farGeometry, initFarMat);
            farMesh.position.y = buildingHeight / 2;

            const buildingUserData = {
              selectable: true,
              selectableType: "building",
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
            resourceManager.stage({
              object: buildingLOD,
              parent: townMarkers,
              onAdd: () => {
                lodObjectsRef.current.push(buildingLOD);
                selectableObjectsRef.current.push(buildingLOD);
              },
            });
          }

          // Landmarks — use flattened centerHeight for Y
          if (town.landmarks && town.landmarks.length > 0) {
            for (const landmark of town.landmarks) {
              const lx = landmark.position.x + worldCenterOffset;
              const lz = landmark.position.z + worldCenterOffset;
              const ly = markerY;

              let color2 = 0x888888;
              let height = landmark.size.height;
              switch (landmark.type) {
                case "well":
                  color2 = 0x5a5a6a;
                  break;
                case "fountain":
                  color2 = 0x4a7aaa;
                  break;
                case "market_stall":
                  color2 = 0xaa7a4a;
                  break;
                case "signpost":
                  color2 = 0x8a6a4a;
                  break;
                case "bench":
                  color2 = 0x7a5a3a;
                  break;
                case "barrel":
                  color2 = 0x6a5a4a;
                  break;
                case "crate":
                  color2 = 0x8a7a5a;
                  break;
                case "lamppost":
                  color2 = 0x3a3a3a;
                  break;
                case "planter":
                  color2 = 0x5a8a5a;
                  break;
                case "tree":
                  color2 = 0x3a6a3a;
                  height = 4;
                  break;
                case "fence_post":
                  color2 = 0x6a5030;
                  break;
                case "fence_gate":
                  color2 = 0x7a6040;
                  break;
              }

              const landmarkGeo = new THREE.BoxGeometry(
                landmark.size.width,
                height,
                landmark.size.depth,
              );
              if (!initLandmarkMats.has(color2)) {
                const mat = new TownStdMat();
                mat.color = new THREE.Color(color2);
                mat.roughness = 0.7;
                initLandmarkMats.set(color2, mat);
              }
              const landmarkMesh = new THREE.Mesh(
                landmarkGeo,
                initLandmarkMats.get(color2)!,
              );
              landmarkMesh.position.set(lx, ly + height / 2, lz);
              landmarkMesh.rotation.y = landmark.rotation;
              landmarkMesh.castShadow = true;
              landmarkMesh.receiveShadow = true;
              resourceManager.stage({
                object: landmarkMesh,
                parent: townMarkers,
              });
            }
          }
        }

        // ---- Inter-town roads: terrain shader handles road rendering via
        // roadInfluence vertex attribute. No ribbon meshes needed. ----
        if (layout.roads.length > 0) {
          setRoadCount(layout.roads.length);

          // Minimap roads
          setMinimapRoads(
            layout.roads.map((road) => ({
              path: road.path.map((p) => ({
                x: p.x + worldCenterOffset,
                z: p.z + worldCenterOffset,
              })),
            })),
          );
        } else {
          setRoadCount(0);
          setMinimapRoads([]);
        }

        // Minimap towns
        setMinimapTowns(
          layout.towns.map((town) => ({
            id: town.id,
            name: town.name,
            position: {
              x: town.position.x + worldCenterOffset,
              z: town.position.z + worldCenterOffset,
            },
            size: town.size,
          })),
        );
      };
      initLayout();
    } else {
      // ---- Procgen pipeline: generate towns locally ----

      // Scale town spacing based on world size (smaller worlds need closer towns)
      // Minimum spacing should allow at least 3-5 towns to fit
      const townCfg = townConfigRef.current;
      const scaledMinSpacing = Math.min(
        townCfg.minTownSpacing,
        worldSizeMeters / 5, // Ensure at least ~5 potential town spots
      );

      const townGenerator = TownGenerator.fromTerrainGenerator(generator, {
        seed: configSeedRef.current,
        config: {
          townCount: townCfg.townCount,
          worldSize: worldSizeMeters,
          minTownSpacing: scaledMinSpacing,
          waterThreshold: waterThresholdRef.current,
          landmarks: {
            fencesEnabled: townCfg.landmarks.fencesEnabled,
            fenceDensity: townCfg.landmarks.fenceDensity,
            fencePostHeight: townCfg.landmarks.fencePostHeight,
            lamppostsInVillages: townCfg.landmarks.lamppostsInVillages,
            lamppostSpacing: townCfg.landmarks.lamppostSpacing,
            marketStallsEnabled: townCfg.landmarks.marketStallsEnabled,
            decorationsEnabled: townCfg.landmarks.decorationsEnabled,
          },
        },
      });

      const townResult = townGenerator.generate();
      console.log(
        `[TileBasedTerrain] Generated ${townResult.towns.length} towns in ${townResult.stats.generationTime.toFixed(0)}ms`,
      );
      setTownCount(townResult.towns.length);

      // Store runtime town data for auto-gen pipeline
      runtimeTownsRef.current = townResult.towns.map((t) => ({
        id: t.id,
        name: t.name,
        position: { x: t.position.x, y: t.position.y, z: t.position.z },
        size: t.size,
        safeZoneRadius: t.safeZoneRadius,
      }));

      // Sync runtime towns back to foundation (single source of truth)
      onTownsGenerated?.(
        townResult.towns.map((t) => ({
          id: t.id,
          name: t.name,
          position: { x: t.position.x, y: t.position.y, z: t.position.z },
          size: t.size,
          safeZoneRadius: t.safeZoneRadius,
          biomeId: t.biome,
        })),
      );

      // Feed town data to difficulty heatmap
      if (heatmapManagerRef.current) {
        const townInfos: TownInfo[] = townResult.towns.map((t) => ({
          position: { x: t.position.x, z: t.position.z },
          safeZoneRadius: t.safeZoneRadius,
        }));
        heatmapManagerRef.current.setTowns(townInfos);
      }

      // Clear selectable objects array
      selectableObjectsRef.current = [];

      // Shared materials for standalone town rendering
      const stBuildingGen = new BuildingGenerator();
      const stSimpleMat = new TownStdMat();
      stSimpleMat.color = new THREE.Color(0xd4a373);
      stSimpleMat.roughness = 0.9;
      const stFarMat = new TownBasicMat();
      stFarMat.color = new THREE.Color(0xc9a577);
      const stDetailFallbackMat = new TownStdMat();
      stDetailFallbackMat.color = new THREE.Color(0xd4a373);
      stDetailFallbackMat.roughness = 0.7;
      stDetailFallbackMat.metalness = 0.1;
      const stPillarMat = new TownBasicMat();
      stPillarMat.color = new THREE.Color(0xffffff);
      const stRoadLineMat = new TownLineMat();
      stRoadLineMat.color = new THREE.Color(0.45, 0.32, 0.18);
      stRoadLineMat.linewidth = 2;
      const stConeMats = new Map<number, MeshBasicNodeMaterial>();
      const stRingMats = new Map<number, MeshBasicNodeMaterial>();

      // Create town markers and internal roads
      for (const town of townResult.towns) {
        const color = TOWN_SIZE_COLORS[town.size] ?? 0xffff00;
        // Offset town position to match our tile grid (towns are generated with origin at center)
        const markerX = town.position.x + worldCenterOffset;
        const markerY = town.position.y;
        const markerZ = town.position.z + worldCenterOffset;

        // Town userData for selection
        const townUserData = {
          selectable: true,
          selectableType: "town",
          selectableId: town.id,
          townId: town.id,
          townName: town.name,
        };

        // Cone marker — shared material per town-size color
        const coneGeometry = getTownConeGeom();
        if (!stConeMats.has(color)) {
          const mat = new MeshBasicNodeMaterial();
          mat.color = new THREE.Color(color);
          stConeMats.set(color, mat);
        }
        const marker = new THREE.Mesh(coneGeometry, stConeMats.get(color)!);
        marker.position.set(markerX, markerY + 60, markerZ);
        marker.rotation.x = Math.PI; // Point downward
        marker.userData = townUserData;
        resourceManager.stage({
          object: marker,
          parent: townMarkers,
          onAdd: () => selectableObjectsRef.current.push(marker),
        });

        // Safe zone ring — shared material per town-size color
        const ringGeometry = new THREE.RingGeometry(
          town.safeZoneRadius - 5,
          town.safeZoneRadius,
          48,
        );
        if (!stRingMats.has(color)) {
          const mat = new MeshBasicNodeMaterial();
          mat.color = new THREE.Color(color);
          mat.side = THREE.DoubleSide;
          mat.transparent = true;
          mat.opacity = 0.4;
          stRingMats.set(color, mat);
        }
        const ring = new THREE.Mesh(ringGeometry, stRingMats.get(color)!);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(markerX, markerY + 2, markerZ);
        ring.userData = townUserData;
        resourceManager.stage({
          object: ring,
          parent: townMarkers,
          onAdd: () => selectableObjectsRef.current.push(ring),
        });

        // Town center pillar — shared material + shared geometry
        const pillarGeometry = getTownPillarGeom();
        const pillar = new THREE.Mesh(pillarGeometry, stPillarMat);
        pillar.position.set(markerX, markerY + 15, markerZ);
        pillar.userData = townUserData;
        resourceManager.stage({
          object: pillar,
          parent: townMarkers,
          onAdd: () => selectableObjectsRef.current.push(pillar),
        });

        // Draw internal roads — shared material
        if (town.internalRoads && town.internalRoads.length > 0) {
          for (const road of town.internalRoads) {
            const roadPoints: THREE.Vector3[] = [];
            const startX = road.start.x + worldCenterOffset;
            const startZ = road.start.z + worldCenterOffset;
            const endX = road.end.x + worldCenterOffset;
            const endZ = road.end.z + worldCenterOffset;

            // Get height at road points
            const startY =
              generator.getHeightAt(road.start.x, road.start.z) + 1;
            const endY = generator.getHeightAt(road.end.x, road.end.z) + 1;

            roadPoints.push(new THREE.Vector3(startX, startY, startZ));
            roadPoints.push(new THREE.Vector3(endX, endY, endZ));

            const roadGeometry = new THREE.BufferGeometry().setFromPoints(
              roadPoints,
            );
            const roadLine = new THREE.Line(roadGeometry, stRoadLineMat);
            roadLine.userData = { townId: town.id };
            resourceManager.stage({
              object: roadLine,
              parent: townMarkers,
            });
          }
        }

        // Draw building footprints with LOD support
        for (const building of town.buildings) {
          const bx = building.position.x + worldCenterOffset;
          const bz = building.position.z + worldCenterOffset;
          const by = building.position.y;

          // Building dimensions (use defaults if not specified)
          const buildingWidth = building.size?.width || 10;
          const buildingDepth = building.size?.depth || 10;
          const buildingHeight = 8; // Default height for visualization

          // Create LOD group for this building
          const buildingLOD = new THREE.LOD();
          buildingLOD.position.set(bx, by, bz);
          buildingLOD.rotation.y = building.rotation || 0;

          // LOD 0: Full detail — shared BuildingGenerator reuses its uberMaterial
          let fullDetailMesh: THREE.Object3D | null = null;
          const generatedBuilding = stBuildingGen.generate(
            building.type || "house",
            {
              includeRoof: true,
              seed: `${town.id}-${building.id}`,
            },
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
                by, // maxGroundY approximation
              );
            }
          } else {
            // Fallback to detailed box if generation fails
            const detailGeometry = new THREE.BoxGeometry(
              buildingWidth,
              buildingHeight,
              buildingDepth,
            );
            const detailMaterial = new TownStdMat();
            detailMaterial.color = new THREE.Color(0xd4a373);
            detailMaterial.roughness = 0.7;
            detailMaterial.metalness = 0.1;
            fullDetailMesh = new THREE.Mesh(detailGeometry, detailMaterial);
            fullDetailMesh.position.y = buildingHeight / 2;
            fullDetailMesh.castShadow = true;
            fullDetailMesh.receiveShadow = true;
          }

          // LOD 1: Simple box (medium distance)
          const simpleGeometry = new THREE.BoxGeometry(
            buildingWidth,
            buildingHeight,
            buildingDepth,
          );
          const simpleMaterial = new TownStdMat();
          simpleMaterial.color = new THREE.Color(0xd4a373);
          simpleMaterial.roughness = 0.9;
          const simpleMesh = new THREE.Mesh(simpleGeometry, simpleMaterial);
          simpleMesh.position.y = buildingHeight / 2;
          simpleMesh.castShadow = false;
          simpleMesh.receiveShadow = true;

          // LOD 2: Very simple box (far distance) - less geometry
          const farGeometry = new THREE.BoxGeometry(
            buildingWidth,
            buildingHeight,
            buildingDepth,
            1,
            1,
            1,
          );
          const farMaterial = new TownBasicMat();
          farMaterial.color = new THREE.Color(0xc9a577);
          const farMesh = new THREE.Mesh(farGeometry, farMaterial);
          farMesh.position.y = buildingHeight / 2;

          // Building userData for selection
          const buildingUserData = {
            selectable: true,
            selectableType: "building",
            selectableId: building.id,
            townId: town.id,
            townName: town.name,
            buildingType: building.type,
          };

          // Set userData on all meshes and descendants so raycasting works
          // fullDetailMesh might be a group with children, so traverse it
          fullDetailMesh.userData = buildingUserData;
          fullDetailMesh.traverse((child) => {
            child.userData = { ...child.userData, ...buildingUserData };
          });
          simpleMesh.userData = buildingUserData;
          farMesh.userData = buildingUserData;

          // Add LOD levels
          buildingLOD.addLevel(fullDetailMesh, 0);
          buildingLOD.addLevel(simpleMesh, BUILDING_LOD_FULL_DISTANCE);
          buildingLOD.addLevel(farMesh, BUILDING_LOD_SIMPLE_DISTANCE);

          // Also set on LOD parent for consistency
          buildingLOD.userData = buildingUserData;

          resourceManager.stage({
            object: buildingLOD,
            parent: townMarkers,
            onAdd: () => {
              lodObjectsRef.current.push(buildingLOD);
              selectableObjectsRef.current.push(buildingLOD);
            },
          });
        }

        // Render town landmarks (fences, lampposts, wells, signposts, etc.)
        if (town.landmarks && town.landmarks.length > 0) {
          for (const landmark of town.landmarks) {
            const lx = landmark.position.x + worldCenterOffset;
            const lz = landmark.position.z + worldCenterOffset;
            const ly = landmark.position.y;

            // Color based on landmark type
            let color = 0x888888;
            let height = landmark.size.height;

            switch (landmark.type) {
              case "well":
                color = 0x5a5a6a;
                break; // Gray stone
              case "fountain":
                color = 0x4a7aaa;
                break; // Blue-gray
              case "market_stall":
                color = 0xaa7a4a;
                break; // Brown wood
              case "signpost":
                color = 0x8a6a4a;
                break; // Wood brown
              case "bench":
                color = 0x7a5a3a;
                break; // Dark wood
              case "barrel":
                color = 0x6a5a4a;
                break; // Barrel brown
              case "crate":
                color = 0x8a7a5a;
                break; // Crate tan
              case "lamppost":
                color = 0x3a3a3a;
                break; // Dark iron
              case "planter":
                color = 0x5a8a5a;
                break; // Green
              case "tree":
                color = 0x3a6a3a;
                height = 4;
                break; // Tree green
              case "fence_post":
                color = 0x6a5030;
                break; // Rustic wood brown
              case "fence_gate":
                color = 0x7a6040;
                break; // Lighter wood for gate
            }

            const landmarkGeo = new THREE.BoxGeometry(
              landmark.size.width,
              height,
              landmark.size.depth,
            );
            const landmarkMat = new TownStdMat();
            landmarkMat.color = new THREE.Color(color);
            landmarkMat.roughness = 0.7;
            const landmarkMesh = new THREE.Mesh(landmarkGeo, landmarkMat);
            landmarkMesh.position.set(lx, ly + height / 2, lz);
            landmarkMesh.rotation.y = landmark.rotation;
            landmarkMesh.castShadow = true;
            landmarkMesh.receiveShadow = true;
            resourceManager.stage({
              object: landmarkMesh,
              parent: townMarkers,
            });
          }
        }
      }

      // Roads are rendered by the terrain shader via roadInfluence vertex
      // attribute — no ribbon meshes needed. Just track count + minimap.
      const roadsToRender = providedRoadsRef.current;
      if (roadsToRender && roadsToRender.length > 0) {
        setRoadCount(roadsToRender.length);

        // Populate minimap roads data from actual road paths
        const minimapRoadData: Array<{
          path: Array<{ x: number; z: number }>;
        }> = roadsToRender.map((road) => ({
          path: road.path.map((point) => ({
            x: point.x + worldCenterOffset,
            z: point.z + worldCenterOffset,
          })),
        }));
        setMinimapRoads(minimapRoadData);
      } else if (townResult.towns.length >= 2) {
        // No road data yet — roads will appear when the terrain shader picks up
        // roadInfluence from tiles regenerated after setFoundationRoads.
        setRoadCount(0);
        setMinimapRoads([]);
      } else {
        setRoadCount(0);
        setMinimapRoads([]);
      }

      // Populate minimap towns data
      const minimapTownData = townResult.towns.map((town) => ({
        id: town.id,
        name: town.name,
        position: {
          x: town.position.x + worldCenterOffset,
          z: town.position.z + worldCenterOffset,
        },
        size: town.size,
      }));
      setMinimapTowns(minimapTownData);
    } // end else (procgen pipeline)

    // Generate vegetation if enabled — async to allow GLB model loading
    const initVegetation = async () => {
      if (!showVegetation || !mounted) return;

      // Load actual game GLB tree models from manifest
      await initTreeModels();
      if (!mounted) return;

      // Clear any existing vegetation (handles double-init from React StrictMode
      // or effect re-runs). Without this, both runs pile up in the container.
      const existingChildren = [...vegetationContainer.children];
      if (existingChildren.length > 0) {
        for (const child of existingChildren) {
          vegetationContainer.remove(child);
          resourceManager.queueDisposal(child, true);
        }
        vegetationSpeciesMapRef.current.clear();
      }

      // ---- Generate trees CLIENT-SIDE using editor's terrain querier ----
      // The server's GameWorldContext uses a different terrain implementation
      // that produces different biome/height maps. Generating locally with
      // terrainQuerierRef guarantees trees match the terrain the user sees.
      const initQuerier = terrainQuerierRef.current;
      const initSeed = configSeedRef.current;
      const initGenStart = performance.now();
      const initTrees: Array<{
        s: string;
        x: number;
        y: number;
        z: number;
        sc: number;
        r: number;
      }> = [];

      if (initQuerier) {
        const halfT = Math.floor(GAME_WORLD_SIZE / 2);
        for (let tx = -halfT; tx < halfT; tx++) {
          for (let tz = -halfT; tz < halfT; tz++) {
            // Sample biome at tile origin — matches TerrainSystem's
            // BiomeSystem.getBiomeForTile(tileX * tileSize, tileZ * tileSize)
            const cx = tx * GAME_TILE_SIZE;
            const cz = tz * GAME_TILE_SIZE;
            const tq = initQuerier(cx, cz);
            // Use getDominantBiome (highest-weight) to match TerrainSystem exactly.
            // Both sides must use the same biome determination for RNG sync.
            const tileBiome = tq.biome;
            const tc = getTreeConfigForBiome(tileBiome);
            if (!tc.enabled || tc.density <= 0) continue;

            const rCtx: ResourceGenerationContext = {
              tileX: tx,
              tileZ: tz,
              tileKey: `${tx}_${tz}`,
              tileSize: GAME_TILE_SIZE,
              waterThreshold: GAME_WATER_THRESHOLD,
              getHeightAt: (wx: number, wz: number) =>
                initQuerier(wx, wz).height,
              getDominantBiome: (wx: number, wz: number) =>
                initQuerier(wx, wz).biome,
              createRng: (salt: string) =>
                _createTileRng(initSeed, tx, tz, salt),
            };

            const genResult = generateTrees(rCtx, tc);

            // ---- DIAGNOSTIC: Log initial tree generation for comparison ----
            const isSampleInit =
              (tx === 0 && tz === 0) ||
              (tx === 1 && tz === 0) ||
              (tx === 0 && tz === 1);
            if (isSampleInit) {
              const sample = genResult
                .slice(0, 3)
                .map((t: { position: unknown; subType?: string }) => {
                  const pp = t.position as { x: number; y: number; z: number };
                  return `(${pp.x.toFixed(2)},${pp.y.toFixed(2)},${pp.z.toFixed(2)}) ${t.subType}`;
                });
              console.log(
                `[WS-INIT:TREE_DIAG] tile(${tx},${tz}) seed=${initSeed} biome=${tileBiome} ` +
                  `count=${genResult.length} sample=[${sample.join("; ")}]`,
              );
            }

            for (const node of genResult) {
              const p = node.position as { x: number; y: number; z: number };
              initTrees.push({
                s: node.subType ?? "oak",
                x: tx * GAME_TILE_SIZE + p.x,
                y: p.y,
                z: tz * GAME_TILE_SIZE + p.z,
                sc: node.scale ?? 1,
                r: node.rotation ?? 0,
              });
            }
          }
        }
      }
      if (!mounted) return;

      const initGenElapsed = performance.now() - initGenStart;
      console.log(
        `[TileBasedTerrain] Generated ${initTrees.length} trees client-side in ${initGenElapsed.toFixed(0)}ms (seed=${initSeed})`,
      );

      // ---- Set up InstancedMesh per species for GLB models ----
      // Count trees per species first so we allocate exact-size GPU buffers
      const initSpeciesCounts = new Map<string, number>();
      for (const tree of initTrees) {
        const speciesId = `tree_${tree.s}`;
        initSpeciesCounts.set(
          speciesId,
          (initSpeciesCounts.get(speciesId) || 0) + 1,
        );
      }

      const speciesIds = getAllTreeSpeciesIds();
      const speciesInstanceData = new Map<
        string,
        {
          meshes: THREE.InstancedMesh[];
          manifestScale: number;
          count: number;
        }
      >();

      for (const id of speciesIds) {
        const treeCount = initSpeciesCounts.get(id) || 0;
        if (treeCount === 0) continue; // Skip species with no trees
        const data = getTreeSpeciesInstance(id);
        if (!data || data.parts.length === 0) continue;

        const meshes = data.parts.map((part) => {
          const im = new THREE.InstancedMesh(
            part.geometry,
            part.material,
            treeCount,
          );
          im.castShadow = true;
          im.receiveShadow = true;
          return im;
        });

        speciesInstanceData.set(id, {
          meshes,
          manifestScale: data.manifestScale,
          count: 0,
        });
      }

      let totalTreeCount = 0;
      const matrix = new THREE.Matrix4();
      const pos = new THREE.Vector3();
      const scl = new THREE.Vector3();
      const quat = new THREE.Quaternion();
      const upAxis = new THREE.Vector3(0, 1, 0);

      // Place every tree from client-side generation
      // Trees are in centered world coords; scene uses 0-based coords.
      // Scene offset = worldCenterOffset (= halfWorld = worldSizeMeters / 2)
      for (const tree of initTrees) {
        const speciesId = `tree_${tree.s}`;
        const speciesData = speciesInstanceData.get(speciesId);
        if (!speciesData) continue;

        // Convert centered world coords → 0-based scene coords
        const sceneX = tree.x + worldCenterOffset;
        const sceneZ = tree.z + worldCenterOffset;

        const finalScale = speciesData.manifestScale * tree.sc;

        pos.set(sceneX, tree.y, sceneZ);
        scl.set(finalScale, finalScale, finalScale);
        quat.setFromAxisAngle(upAxis, tree.r);
        matrix.compose(pos, quat, scl);

        for (const im of speciesData.meshes) {
          im.setMatrixAt(speciesData.count, matrix);
        }
        speciesData.count++;
        totalTreeCount++;
      }

      // Finalize instance counts and stage for gradual scene addition
      vegetationSpeciesMapRef.current.clear();
      for (const [speciesId, data] of speciesInstanceData) {
        for (const im of data.meshes) {
          im.count = data.count;
          im.instanceMatrix.needsUpdate = true;
          resourceManager.stage({
            object: im,
            parent: vegetationContainer,
            onAdd: () => vegetationSpeciesMapRef.current.set(im, speciesId),
          });
        }
      }

      // Track vegetation positions for external consumers (auto-gen, debug panel)
      vegetationPositionsRef.current = initTrees.map((t) => ({
        x: t.x,
        z: t.z,
      }));
      vegetationTreesRef.current = initTrees;

      const speciesSummary = [...speciesInstanceData.entries()]
        .filter(([, d]) => d.count > 0)
        .map(([id, d]) => `${id.replace("tree_", "")}:${d.count}`)
        .join(", ");

      // Log species that had NO InstancedMesh (missing GLB model)
      const missingSpecies = initTrees
        .map((t) => `tree_${t.s}`)
        .filter((sid) => !speciesInstanceData.has(sid));
      const uniqueMissing = [...new Set(missingSpecies)];
      if (uniqueMissing.length > 0) {
        console.warn(
          `[initVegetation] Missing GLB models for species: ${uniqueMissing.join(", ")}. ` +
            `Available: ${[...speciesInstanceData.keys()].join(", ")}`,
        );
      }

      console.log(
        `%c[initVegetation] Placed ${totalTreeCount}/${initTrees.length} trees (${speciesSummary})`,
        "color: #4ade80; font-weight: bold;",
      );
      if (totalTreeCount === 0 && initTrees.length > 0) {
        console.error(
          `[initVegetation] Generated ${initTrees.length} trees but placed ZERO! ` +
            `Species lookup failed — check species ID format. ` +
            `Sample tree.s values: ${initTrees
              .slice(0, 5)
              .map((t) => t.s)
              .join(", ")}. ` +
            `Available speciesIds: ${[...speciesInstanceData.keys()].join(", ")}`,
        );
      }
    };
    initVegetation();

    // ---- Game structures: bridges + duel arena + manifest entities ----
    if (useGamePipelineRef.current) {
      const heightQuerier = terrainQuerierRef.current;
      if (heightQuerier) {
        const getH = (wx: number, wz: number) => heightQuerier(wx, wz).height;

        // Bridges at known river crossing positions
        const bridges = createBridgeMeshes(worldCenterOffset, getH);
        scene.add(bridges);
        // Register each bridge subgroup as selectable for click-to-select
        for (const child of bridges.children) {
          if (child.userData?.selectable) {
            selectableObjectsRef.current.push(child);
          }
        }

        // Duel arena at fixed game position
        const arena = createDuelArena(worldCenterOffset, getH);
        scene.add(arena);
        // Register arena group as selectable for click-to-select
        if (arena.userData?.selectable) {
          selectableObjectsRef.current.push(arena);
        }

        // All manifest entities (NPCs, stations, resources, mob spawns, fishing)
        createGameWorldEntities(
          worldCenterOffset,
          getH,
          waterThresholdRef.current,
        ).then((result) => {
          if (!mounted) {
            disposeEntitySync(result.group);
            return;
          }
          scene.add(result.group);
          entitySyncRef.current = result.group;

          // Register entity groups as selectable for click-to-select
          for (const subGroup of result.group.children) {
            if (!(subGroup instanceof THREE.Group)) continue;
            for (const entity of subGroup.children) {
              if (entity.userData?.selectable) {
                selectableObjectsRef.current.push(entity);
              }
            }
          }

          // Report entity data to parent
          onGameEntitiesLoaded?.(result.entities);
        });
      }
    }

    // Event listeners — use stable wrappers that delegate to refs
    document.addEventListener("mousemove", _onMouseMove);
    document.addEventListener("keydown", _onKeyDown);
    document.addEventListener("keyup", _onKeyUp);
    document.addEventListener("pointerlockchange", _onPointerLockChange);
    document.addEventListener("mouseup", _onMouseUp);
    container.addEventListener("click", _onClick);
    container.addEventListener("mousedown", _onMouseDown);
    container.addEventListener("wheel", _onWheel, { passive: false });
    document.addEventListener("contextmenu", _onContextMenu, true);

    // Async WebGPU renderer initialization
    const initRenderer = async () => {
      const renderer = await createWebGPURenderer({
        // Disable antialiasing in World Studio for better FPS
        antialias: !isStudioModeRef.current,
        alpha: true,
      });

      if (!mounted) {
        renderer.dispose();
        return;
      }

      // World Studio: cap pixel ratio at 1 and disable shadows for FPS
      // (editors don't need Retina resolution or shadow maps)
      const maxPixelRatio = isStudioModeRef.current
        ? 1
        : Math.min(window.devicePixelRatio, 2);
      renderer.setPixelRatio(maxPixelRatio);
      // Guard against zero-size container (can happen during mount before layout)
      const w = container.clientWidth || 1;
      const h = container.clientHeight || 1;
      renderer.setSize(w, h);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.shadowMap.enabled = !isStudioModeRef.current;
      if (renderer.shadowMap.enabled) {
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      }
      container.appendChild(renderer.domElement);
      rendererRef.current = renderer;

      // Monitor GPU device loss — logs the actual reason from Metal/WebGPU
      // "destroyed" reason is expected during effect cleanup (preset/config changes);
      // only log unexpected device losses as errors.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const backend = (renderer as any).backend;
      if (backend?.device?.lost) {
        backend.device.lost.then(
          (info: { reason: string; message: string }) => {
            if (info.reason === "destroyed") {
              console.debug(
                `[GPU-DEBUG] Device disposed (expected during config change)`,
              );
              return;
            }
            const stats = getGpuLifecycleStats();
            console.error(
              `[GPU-DEBUG] DEVICE LOST reason="${info.reason}" message="${info.message}"`,
            );
            console.error(
              `[GPU-DEBUG] DEVICE LOST state: ` +
                `tiles=${tilesRef.current.size} ` +
                `staging=${resourceManager.pendingStaged} disposing=${resourceManager.pendingDisposal} ` +
                `deferredDisposals=${stats.pendingDisposals} deferredAdditions=${stats.pendingAdditions} ` +
                `totalDisposed=${stats.totalDisposed} totalAdded=${stats.totalAdded} ` +
                `sceneChildren=${scene.children.length} ` +
                `markers=${resourceManager.areMarkersHidden ? "hidden" : "visible"}`,
            );
          },
        );
      }

      // Create ViewHelper orientation cube (bottom-right corner)
      // Skip in World Studio — it provides its own viewport controls
      if (!hideBuiltinOverlays) {
        try {
          const helper = new ViewHelper(camera, renderer.domElement);
          viewHelperRef.current = helper;
        } catch (err) {
          console.warn(
            "[TileBasedTerrain] ViewHelper init failed (non-critical):",
            err,
          );
        }
      }

      // Create ground grid helper (hidden by default)
      const worldSizeMeters = worldSize * tileSize;
      const gridDivisions = worldSize; // One line per tile
      const grid = new THREE.GridHelper(
        worldSizeMeters,
        gridDivisions,
        0x444466, // Center line color
        0x333344, // Grid line color
      );
      grid.position.set(worldSizeMeters / 2, 0.5, worldSizeMeters / 2);
      grid.visible = false;
      scene.add(grid);
      gridHelperRef.current = grid;

      // Create editor entity overlay group (for NPCs, spawn points, etc.)
      if (!entityOverlayRef.current) {
        const overlay = new THREE.Group();
        overlay.name = "editor-entity-overlay";
        scene.add(overlay);
        entityOverlayRef.current = overlay;
      }

      // Notify parent that scene is ready for editing tool integration
      onSceneReady?.({
        scene,
        camera,
        raycaster: raycasterRef.current,
        container,
        terrainContainer,
        entityOverlay: entityOverlayRef.current,
        addSelectable: (obj: THREE.Object3D) => {
          if (!selectableObjectsRef.current.includes(obj)) {
            selectableObjectsRef.current.push(obj);
          }
        },
        removeSelectable: (obj: THREE.Object3D) => {
          const idx = selectableObjectsRef.current.indexOf(obj);
          if (idx >= 0) selectableObjectsRef.current.splice(idx, 1);
        },
        setInteractionMode: (mode: "orbit" | "tool" | "gizmo") => {
          const ctrl = orbitControlsRef.current;
          if (!ctrl) return;
          // RMB always reserved for fly mode — never assign to OrbitControls
          if (mode === "gizmo") {
            // Transform gizmo active — left free for gizmo handles,
            // middle click = orbit so user can still rotate the camera
            ctrl.mouseButtons = {
              LEFT: -1 as THREE.MOUSE,
              MIDDLE: THREE.MOUSE.ROTATE,
              RIGHT: -1 as THREE.MOUSE,
            };
          } else if (mode === "tool") {
            // Brush / placement tool — left free for painting / placing
            ctrl.mouseButtons = {
              LEFT: -1 as THREE.MOUSE,
              MIDDLE: THREE.MOUSE.DOLLY,
              RIGHT: -1 as THREE.MOUSE,
            };
          } else {
            ctrl.mouseButtons = {
              LEFT: THREE.MOUSE.ROTATE,
              MIDDLE: THREE.MOUSE.PAN,
              RIGHT: -1 as THREE.MOUSE,
            };
          }
        },
        focusOnPosition: (target: THREE.Vector3, radius: number) => {
          const ctrl = orbitControlsRef.current;
          if (!ctrl) return;
          // Calculate camera distance to frame the object
          const fov = camera.fov * (Math.PI / 180);
          const distance = Math.max(radius * 2.5, 10) / Math.tan(fov / 2);
          // Animate orbit target and camera position
          const startTarget = ctrl.target.clone();
          const startPos = camera.position.clone();
          const endTarget = target.clone();
          const endPos = target
            .clone()
            .add(
              camera.position
                .clone()
                .sub(ctrl.target)
                .normalize()
                .multiplyScalar(distance),
            );
          const duration = 300; // ms
          const startTime = performance.now();
          const animateFocus = () => {
            const elapsed = performance.now() - startTime;
            const t = Math.min(elapsed / duration, 1);
            // Ease-out cubic
            const ease = 1 - Math.pow(1 - t, 3);
            ctrl.target.lerpVectors(startTarget, endTarget, ease);
            camera.position.lerpVectors(startPos, endPos, ease);
            ctrl.update();
            if (t < 1) requestAnimationFrame(animateFocus);
          };
          animateFocus();
        },
        setViewMode: (mode: ViewMode) => {
          viewModeRef.current = mode;
          const mat = terrainMaterialRef.current as
            | (THREE.Material & { wireframe?: boolean })
            | null;
          if (mat) {
            mat.wireframe = mode === "wireframe";
          }
          // Toggle vertex color display for biome mode
          // (terrain already uses vertex colors, this is a display hint)
        },
        setGridVisible: (visible: boolean) => {
          if (gridHelperRef.current) {
            gridHelperRef.current.visible = visible;
          }
        },
        promoteVegetationInstance: (
          speciesId: string,
          instanceIndex: number,
          selectableId: string,
        ): THREE.Group | null => {
          const vegContainer = vegetationContainerRef.current;
          const entityOverlay = entityOverlayRef.current;
          if (!vegContainer || !entityOverlay) return null;

          // Find the InstancedMesh(es) for this species
          const speciesMeshes: THREE.InstancedMesh[] = [];
          for (const [im, sid] of vegetationSpeciesMapRef.current) {
            if (sid === speciesId) speciesMeshes.push(im);
          }
          if (speciesMeshes.length === 0) return null;

          // Read the instance transform from the first mesh
          const instanceMatrix = new THREE.Matrix4();
          speciesMeshes[0].getMatrixAt(instanceIndex, instanceMatrix);
          const instancePos = new THREE.Vector3();
          const instanceQuat = new THREE.Quaternion();
          const instanceScl = new THREE.Vector3();
          instanceMatrix.decompose(instancePos, instanceQuat, instanceScl);

          // Create standalone proxy group with the species' mesh parts
          const speciesData = getTreeSpeciesInstance(speciesId);
          if (!speciesData) return null;

          const proxy = new THREE.Group();
          proxy.name = `veg_proxy_${selectableId}`;
          proxy.position.copy(instancePos);
          proxy.quaternion.copy(instanceQuat);
          proxy.scale.copy(instanceScl);

          for (const part of speciesData.parts) {
            const mesh = new THREE.Mesh(part.geometry, part.material);
            mesh.castShadow = true;
            mesh.userData._cachedModel = true; // Don't dispose — shared with cache
            proxy.add(mesh);
          }

          proxy.userData = {
            selectable: true,
            selectableId,
            _vegPromo: true,
            _vegSpeciesId: speciesId,
            _vegInstanceIndex: instanceIndex,
            displayName: speciesId.replace(/_/g, " "),
          };

          // Hide the original instance (scale to 0)
          const zeroMatrix = new THREE.Matrix4().compose(
            instancePos,
            instanceQuat,
            new THREE.Vector3(0, 0, 0),
          );
          for (const im of speciesMeshes) {
            im.setMatrixAt(instanceIndex, zeroMatrix);
            im.instanceMatrix.needsUpdate = true;
          }

          entityOverlay.add(proxy);
          return proxy;
        },
        demoteVegetationInstance: (proxyGroup: THREE.Group): void => {
          const entityOverlay = entityOverlayRef.current;
          if (!entityOverlay) return;

          const speciesId = proxyGroup.userData._vegSpeciesId as string;
          const instanceIndex = proxyGroup.userData._vegInstanceIndex as number;
          if (!speciesId || instanceIndex === undefined) return;

          // Find the InstancedMesh(es)
          const speciesMeshes: THREE.InstancedMesh[] = [];
          for (const [im, sid] of vegetationSpeciesMapRef.current) {
            if (sid === speciesId) speciesMeshes.push(im);
          }

          // Write the proxy's current transform back to the InstancedMesh
          const matrix = new THREE.Matrix4().compose(
            proxyGroup.position,
            proxyGroup.quaternion,
            proxyGroup.scale,
          );
          for (const im of speciesMeshes) {
            im.setMatrixAt(instanceIndex, matrix);
            im.instanceMatrix.needsUpdate = true;
          }

          // Remove proxy from overlay
          entityOverlay.remove(proxyGroup);
        },
        refreshVegetation: async (
          vegConfig?: VegetationConfig,
          exclusions?: VegetationExclusions,
        ): Promise<void> => {
          const vegContainer = vegetationContainerRef.current;
          if (!vegContainer) return;

          // Flush any pending staged vegetation from a previous call
          resourceManager.flushStagedForParent(vegContainer);

          // Remove existing vegetation InstancedMeshes from scene — queue deferred GPU disposal.
          // GPU resources are NOT disposed synchronously to prevent Metal device loss.
          // geometryOnly: true because veg InstancedMeshes share geometry/material from species cache.
          const toRemove = [...vegContainer.children];
          for (const child of toRemove) {
            vegContainer.remove(child);
            resourceManager.queueDisposal(child, true);
          }
          vegetationSpeciesMapRef.current.clear();

          // Ensure tree GLB models are loaded
          await initTreeModels();

          // Generate trees CLIENT-SIDE using the editor's own terrain querier.
          // This guarantees tree positions match the terrain the user sees — the
          // server's GameWorldContext uses a different implementation that produces
          // different biome/height maps even with the same seed.
          const currentSeed = configSeedRef.current;
          const querier = terrainQuerierRef.current;
          const genStartTime = performance.now();

          const allTrees: Array<{
            s: string;
            x: number;
            y: number;
            z: number;
            sc: number;
            r: number;
          }> = [];

          const editorTileSize = GAME_TILE_SIZE;
          const editorWorldSize = GAME_WORLD_SIZE;
          const editorWaterThreshold = GAME_WATER_THRESHOLD;
          const halfTiles = Math.floor(editorWorldSize / 2);

          if (querier) {
            for (let tileX = -halfTiles; tileX < halfTiles; tileX++) {
              for (let tileZ = -halfTiles; tileZ < halfTiles; tileZ++) {
                // Sample biome at tile origin — matches TerrainSystem's
                // BiomeSystem.getBiomeForTile(tileX * tileSize, tileZ * tileSize)
                const tileCenterX = tileX * editorTileSize;
                const tileCenterZ = tileZ * editorTileSize;
                const tileQuery = querier(tileCenterX, tileCenterZ);
                const tileBiome = tileQuery.biome;
                const treeConfig = getTreeConfigForBiome(tileBiome);

                if (!treeConfig.enabled || treeConfig.density <= 0) continue;

                const resourceCtx: ResourceGenerationContext = {
                  tileX,
                  tileZ,
                  tileKey: `${tileX}_${tileZ}`,
                  tileSize: editorTileSize,
                  waterThreshold: editorWaterThreshold,
                  getHeightAt: (wx: number, wz: number) =>
                    querier(wx, wz).height,
                  getDominantBiome: (wx: number, wz: number) =>
                    querier(wx, wz).biome,
                  createRng: (salt: string) =>
                    _createTileRng(currentSeed, tileX, tileZ, salt),
                };

                const trees = generateTrees(resourceCtx, treeConfig);

                // ---- DIAGNOSTIC: Log tree generation for comparison with TerrainSystem ----
                const isSampleTile =
                  (tileX === 0 && tileZ === 0) ||
                  (tileX === 1 && tileZ === 0) ||
                  (tileX === 0 && tileZ === 1);
                if (isSampleTile) {
                  const sample = trees
                    .slice(0, 3)
                    .map((t: { position: unknown; subType?: string }) => {
                      const pp = t.position as {
                        x: number;
                        y: number;
                        z: number;
                      };
                      return `(${pp.x.toFixed(2)},${pp.y.toFixed(2)},${pp.z.toFixed(2)}) ${t.subType}`;
                    });
                  console.log(
                    `[WS:TREE_DIAG] tile(${tileX},${tileZ}) seed=${currentSeed} biome=${tileBiome} ` +
                      `count=${trees.length} sample=[${sample.join("; ")}]`,
                  );
                }

                for (const node of trees) {
                  const pos = node.position as {
                    x: number;
                    y: number;
                    z: number;
                  };
                  allTrees.push({
                    s: node.subType ?? "oak",
                    x: tileX * editorTileSize + pos.x,
                    y: pos.y,
                    z: tileZ * editorTileSize + pos.z,
                    sc: node.scale ?? 1,
                    r: node.rotation ?? 0,
                  });
                }
              }
            }
          }

          const genElapsed = performance.now() - genStartTime;
          console.log(
            `[refreshVegetation] Generated ${allTrees.length} trees client-side in ${genElapsed.toFixed(0)}ms (seed=${currentSeed})`,
          );

          // Vegetation filtering via shared algorithm (same code runs in
          // game client TerrainSystem so staging matches exactly).
          let trees = allTrees;
          if (exclusions) {
            const beforeCount = trees.length;
            const precomputed = precomputeExclusions(exclusions);
            trees = filterTreesByExclusions(trees, precomputed);

            console.log(
              `[refreshVegetation] Filter: ${precomputed.circles.length} circles, ` +
                `${precomputed.roadSegs.length} road segs, ${precomputed.towns.length} town gradients → ` +
                `${beforeCount} → ${trees.length} trees (removed ${beforeCount - trees.length})`,
            );
          }

          // Cache game-space positions so the auto-gen pipeline can avoid them
          vegetationPositionsRef.current = trees.map((t) => ({
            x: t.x,
            z: t.z,
          }));
          vegetationTreesRef.current = trees;

          // Count trees per species first so we allocate exact-size GPU buffers
          const speciesCounts = new Map<string, number>();
          for (const tree of trees) {
            const speciesId = `tree_${tree.s}`;
            speciesCounts.set(
              speciesId,
              (speciesCounts.get(speciesId) || 0) + 1,
            );
          }

          // Rebuild InstancedMeshes per species (only for species with trees)
          const speciesIds = getAllTreeSpeciesIds();
          const speciesInstanceData = new Map<
            string,
            {
              meshes: THREE.InstancedMesh[];
              manifestScale: number;
              count: number;
            }
          >();

          for (const id of speciesIds) {
            const treeCount = speciesCounts.get(id) || 0;
            if (treeCount === 0) continue; // Skip species with no trees
            const data = getTreeSpeciesInstance(id);
            if (!data || data.parts.length === 0) continue;
            const meshes = data.parts.map((part) => {
              const im = new THREE.InstancedMesh(
                part.geometry,
                part.material,
                treeCount,
              );
              im.castShadow = true;
              im.receiveShadow = true;
              return im;
            });
            speciesInstanceData.set(id, {
              meshes,
              manifestScale: data.manifestScale,
              count: 0,
            });
          }

          let totalTreeCount = 0;
          const mat = new THREE.Matrix4();
          const p = new THREE.Vector3();
          const s = new THREE.Vector3();
          const q = new THREE.Quaternion();
          const up = new THREE.Vector3(0, 1, 0);
          const offset = worldCenterOffsetRef.current;

          for (const tree of trees) {
            const speciesId = `tree_${tree.s}`;
            const sd = speciesInstanceData.get(speciesId);
            if (!sd) continue;

            p.set(tree.x + offset, tree.y, tree.z + offset);
            const fs = sd.manifestScale * tree.sc;
            s.set(fs, fs, fs);
            q.setFromAxisAngle(up, tree.r);
            mat.compose(p, q, s);

            for (const im of sd.meshes) {
              im.setMatrixAt(sd.count, mat);
            }
            sd.count++;
            totalTreeCount++;
          }

          // Finalize and stage for gradual scene addition (prevents GPU device loss)
          for (const [speciesId, data] of speciesInstanceData) {
            for (const im of data.meshes) {
              im.count = data.count;
              im.instanceMatrix.needsUpdate = true;
              resourceManager.stage({
                object: im,
                parent: vegContainer,
                onAdd: () => vegetationSpeciesMapRef.current.set(im, speciesId),
              });
            }
          }

          console.log(`[refreshVegetation] Placed ${totalTreeCount} trees`);
        },
        navigateCamera: (x: number, z: number, close?: boolean) => {
          const viewHeight = close ? 35 : 150;
          // No Z offset — camera directly above-and-in-front so target is screen-center
          cameraStateRef.current.position.set(x, viewHeight, z);
          const cam = cameraRef.current;
          if (cam) {
            cam.position.set(x, viewHeight, z);
            const controls = orbitControlsRef.current;
            if (controls) {
              controls.target.set(x, 0, z);
              controls.update();
            }
          }
        },
        wasRecentlyFlying: () => {
          const val = rmbDidFlyRef.current;
          rmbDidFlyRef.current = false; // Auto-reset on read
          return val;
        },
        getTerrainHeight: (sceneX: number, sceneZ: number): number => {
          const querier = terrainQuerierRef.current;
          if (!querier) return 0;
          const offset = worldCenterOffsetRef.current;
          return querier(sceneX - offset, sceneZ - offset).height;
        },
        enterPlayerMode: camEnterPlayerMode,
        exitPlayerMode: camExitPlayerMode,
        isPlayerMode: () => camPlayerModeRef.current,
        worldCenterOffset: worldCenterOffsetRef.current,
        queryBiome: (worldX: number, worldZ: number) => {
          const querier = terrainQuerierRef.current;
          if (!querier) return { biome: "plains", height: 0 };
          const q = querier(worldX, worldZ);
          // Return visual biome (from shader blend weights) so external
          // consumers get the biome that matches the rendered ground color
          return { biome: _getVisualBiome(q), height: q.height };
        },
        getBiomeDifficulty: (biomeId: string) => {
          const gen = generatorRef.current;
          if (!gen) return 0;
          const def = gen.getBiomeSystem().getBiomeDefinition(biomeId);
          return def?.difficultyLevel ?? 0;
        },
        get runtimeTowns() {
          return runtimeTownsRef.current;
        },
        get vegetationPositions() {
          return vegetationPositionsRef.current;
        },
        get vegetationTrees() {
          return vegetationTreesRef.current;
        },
        refreshTownMarkers: (newTowns: ProcgenTown[]) => {
          console.warn(
            `%c[refreshTownMarkers] Called with ${newTowns.length} towns: ${newTowns.map((t) => `${t.name}(${t.size}, ${t.buildings.length} bldg, pos ${Math.round(t.position.x)},${Math.round(t.position.z)})`).join(", ")}`,
            "color: cyan; font-weight: bold",
          );
          const townGroup = townMarkersRef.current;
          if (!townGroup) {
            console.error(
              "[refreshTownMarkers] townMarkersRef.current is NULL! Aborting.",
            );
            return;
          }
          console.warn(
            `[refreshTownMarkers] Clearing ${townGroup.children.length} existing children from townMarkers group`,
          );
          const offset = worldCenterOffsetRef.current;
          const heightQuerier = terrainQuerierRef.current;
          const gen = generatorRef.current;
          const getHeight = (wx: number, wz: number): number =>
            heightQuerier
              ? heightQuerier(wx, wz).height
              : gen
                ? gen.getHeightAt(wx, wz)
                : 0;

          // Flush any pending staged objects from a previous call
          resourceManager.flushStagedForParent(townGroup);

          // Clear existing town meshes — remove from scene + queue deferred GPU disposal.
          // GPU resources are NOT disposed synchronously because bulk disposal on Metal
          // invalidates the WebGPU pipeline cache and causes device destruction.
          while (townGroup.children.length > 0) {
            const child = townGroup.children[0];
            townGroup.remove(child);
            const selIdx = selectableObjectsRef.current.indexOf(child);
            if (selIdx >= 0) selectableObjectsRef.current.splice(selIdx, 1);
            // Remove LOD objects that belonged to the town group
            if (child instanceof THREE.LOD) {
              const lodIdx = lodObjectsRef.current.indexOf(child);
              if (lodIdx >= 0) lodObjectsRef.current.splice(lodIdx, 1);
            }
            // Queue for deferred disposal — processed in small batches after render
            resourceManager.queueDisposal(child);
          }

          // Shared materials — reuse across all towns to minimize GPU pipeline count.
          // Each unique material instance requires its own GPU pipeline/uniform buffer.
          // Without sharing, 4 towns × 20 buildings × 6+ materials = 500+ GPU pipelines
          // which exhausts Metal's staging buffer pool on macOS.
          const sharedBuildingGen = new BuildingGenerator();
          const sharedSimpleMat = new TownStdMat();
          sharedSimpleMat.color = new THREE.Color(0xd4a373);
          sharedSimpleMat.roughness = 0.9;
          const sharedFarMat = new TownBasicMat();
          sharedFarMat.color = new THREE.Color(0xc9a577);
          const sharedDetailFallbackMat = new TownStdMat();
          sharedDetailFallbackMat.color = new THREE.Color(0xd4a373);
          sharedDetailFallbackMat.roughness = 0.7;
          sharedDetailFallbackMat.metalness = 0.1;
          const sharedPillarMat = new TownBasicMat();
          sharedPillarMat.color = new THREE.Color(0xffffff);
          const sharedRoadLineMat = new TownLineMat();
          sharedRoadLineMat.color = new THREE.Color(0.45, 0.32, 0.18);
          sharedRoadLineMat.linewidth = 2;
          // Cache cone/ring materials per town-size color
          const coneMaterialCache = new Map<number, MeshBasicNodeMaterial>();
          const ringMaterialCache = new Map<number, MeshBasicNodeMaterial>();
          // Cache landmark materials per color
          const landmarkMatCache = new Map<number, MeshStandardNodeMaterial>();

          // Render each town with full detail (mirrors initial layout.towns rendering)
          for (const town of newTowns) {
            const color = TOWN_SIZE_COLORS[town.size] ?? 0xffff00;
            const mx = town.position.x + offset;
            // Use the queried terrain height at town center — this is the same centerHeight
            // that generateTileGeometry uses for flattening. Building/landmark/road Y must
            // match this value, NOT the un-flattened heights from TownGenerator.
            const my = getHeight(town.position.x, town.position.z);
            const mz = town.position.z + offset;
            const townUserData = {
              selectable: true,
              selectableType: "town",
              selectableId: town.id,
              townId: town.id,
              townName: town.name,
            };

            // Cone marker pointing down — shared material per town-size color + shared geometry
            const coneGeo = getTownConeGeom();
            if (!coneMaterialCache.has(color)) {
              const mat = new MeshBasicNodeMaterial();
              mat.color = new THREE.Color(color);
              coneMaterialCache.set(color, mat);
            }
            const cone = new THREE.Mesh(coneGeo, coneMaterialCache.get(color)!);
            cone.position.set(mx, my + 60, mz);
            cone.rotation.x = Math.PI;
            cone.userData = townUserData;
            resourceManager.stage({
              object: cone,
              parent: townGroup,
              onAdd: () => selectableObjectsRef.current.push(cone),
            });

            // Safe zone ring — shared material per town-size color
            const ringGeo = new THREE.RingGeometry(
              town.safeZoneRadius - 5,
              town.safeZoneRadius,
              48,
            );
            if (!ringMaterialCache.has(color)) {
              const mat = new MeshBasicNodeMaterial();
              mat.color = new THREE.Color(color);
              mat.side = THREE.DoubleSide;
              mat.transparent = true;
              mat.opacity = 0.4;
              ringMaterialCache.set(color, mat);
            }
            const ring = new THREE.Mesh(ringGeo, ringMaterialCache.get(color)!);
            ring.rotation.x = -Math.PI / 2;
            ring.position.set(mx, my + 2, mz);
            ring.userData = townUserData;
            resourceManager.stage({
              object: ring,
              parent: townGroup,
              onAdd: () => selectableObjectsRef.current.push(ring),
            });

            // Center pillar — shared material + shared geometry
            const pillarGeo = getTownPillarGeom();
            const pillar = new THREE.Mesh(pillarGeo, sharedPillarMat);
            pillar.position.set(mx, my + 15, mz);
            pillar.userData = townUserData;
            resourceManager.stage({
              object: pillar,
              parent: townGroup,
              onAdd: () => selectableObjectsRef.current.push(pillar),
            });

            // Internal roads — shared material
            if (town.internalRoads && town.internalRoads.length > 0) {
              for (const road of town.internalRoads) {
                const startX = road.start.x + offset;
                const startZ = road.start.z + offset;
                const endX = road.end.x + offset;
                const endZ = road.end.z + offset;
                const startY = my + 1;
                const endY = my + 1;

                const roadGeo = new THREE.BufferGeometry().setFromPoints([
                  new THREE.Vector3(startX, startY, startZ),
                  new THREE.Vector3(endX, endY, endZ),
                ]);
                const roadLine = new THREE.Line(roadGeo, sharedRoadLineMat);
                roadLine.userData = { townId: town.id };
                resourceManager.stage({
                  object: roadLine,
                  parent: townGroup,
                });
              }
            }

            // Buildings with LOD — use flattened centerHeight (my) for Y,
            // not building.position.y which is the un-flattened terrain height
            for (const building of town.buildings) {
              const bx = building.position.x + offset;
              const bz = building.position.z + offset;
              const by = my;
              const buildingWidth = building.size?.width || 10;
              const buildingDepth = building.size?.depth || 10;
              const buildingHeight = 8;

              const buildingLOD = new THREE.LOD();
              buildingLOD.position.set(bx, by, bz);
              buildingLOD.rotation.y = building.rotation || 0;

              // LOD 0: Procedural building — shared BuildingGenerator reuses its uberMaterial
              let fullDetailMesh: THREE.Object3D | null = null;
              const generatedBuilding = sharedBuildingGen.generate(
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
                const detailGeo = new THREE.BoxGeometry(
                  buildingWidth,
                  buildingHeight,
                  buildingDepth,
                );
                fullDetailMesh = new THREE.Mesh(
                  detailGeo,
                  sharedDetailFallbackMat,
                );
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
              const simpleMesh = new THREE.Mesh(simpleGeo, sharedSimpleMat);
              simpleMesh.position.y = buildingHeight / 2;
              simpleMesh.castShadow = false;
              simpleMesh.receiveShadow = true;

              // LOD 2: Far box — shared material
              const farGeo = new THREE.BoxGeometry(
                buildingWidth,
                buildingHeight,
                buildingDepth,
                1,
                1,
                1,
              );
              const farMat = sharedFarMat;
              const farMesh = new THREE.Mesh(farGeo, farMat);
              farMesh.position.y = buildingHeight / 2;

              const buildingUserData = {
                selectable: true,
                selectableType: "building",
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
              resourceManager.stage({
                object: buildingLOD,
                parent: townGroup,
                onAdd: () => {
                  lodObjectsRef.current.push(buildingLOD);
                  selectableObjectsRef.current.push(buildingLOD);
                },
              });
            }

            // Landmarks — use flattened centerHeight for Y
            if (town.landmarks && town.landmarks.length > 0) {
              for (const landmark of town.landmarks) {
                const lx = landmark.position.x + offset;
                const lz = landmark.position.z + offset;
                const ly = my;

                let landmarkColor = 0x888888;
                let height = landmark.size.height;
                switch (landmark.type) {
                  case "well":
                    landmarkColor = 0x5a5a6a;
                    break;
                  case "fountain":
                    landmarkColor = 0x4a7aaa;
                    break;
                  case "market_stall":
                    landmarkColor = 0xaa7a4a;
                    break;
                  case "signpost":
                    landmarkColor = 0x8a6a4a;
                    break;
                  case "bench":
                    landmarkColor = 0x7a5a3a;
                    break;
                  case "barrel":
                    landmarkColor = 0x6a5a4a;
                    break;
                  case "crate":
                    landmarkColor = 0x8a7a5a;
                    break;
                  case "lamppost":
                    landmarkColor = 0x3a3a3a;
                    break;
                  case "planter":
                    landmarkColor = 0x5a8a5a;
                    break;
                  case "tree":
                    landmarkColor = 0x3a6a3a;
                    height = 4;
                    break;
                  case "fence_post":
                    landmarkColor = 0x6a5030;
                    break;
                  case "fence_gate":
                    landmarkColor = 0x7a6040;
                    break;
                }

                const landmarkGeo = new THREE.BoxGeometry(
                  landmark.size.width,
                  height,
                  landmark.size.depth,
                );
                if (!landmarkMatCache.has(landmarkColor)) {
                  const mat = new TownStdMat();
                  mat.color = new THREE.Color(landmarkColor);
                  mat.roughness = 0.7;
                  landmarkMatCache.set(landmarkColor, mat);
                }
                const landmarkMesh = new THREE.Mesh(
                  landmarkGeo,
                  landmarkMatCache.get(landmarkColor)!,
                );
                landmarkMesh.position.set(lx, ly + height / 2, lz);
                landmarkMesh.rotation.y = landmark.rotation;
                landmarkMesh.castShadow = true;
                landmarkMesh.receiveShadow = true;
                landmarkMesh.userData = { townId: town.id };
                resourceManager.stage({
                  object: landmarkMesh,
                  parent: townGroup,
                });
              }
            }
          }

          // Store full procgen data for town-move pipeline
          lastProcgenTownsRef.current = newTowns;

          // Update runtimeTowns ref so the pipeline sees them
          runtimeTownsRef.current = newTowns.map((t) => ({
            id: t.id,
            name: t.name,
            position: { ...t.position },
            size: t.size,
            safeZoneRadius: t.safeZoneRadius,
          }));

          // Inter-town roads are rendered by the terrain shader via roadInfluence
          // vertex attribute — no ribbon meshes needed. Tile regen below handles it.

          // Regenerate terrain tiles under/near towns so flattening takes effect
          if (tilesRef.current.size > 0) {
            console.log(
              `[refreshTownMarkers] Regenerating ${tilesRef.current.size} tiles for town terrain flattening`,
            );
            for (const key of tilesRef.current.keys()) {
              unloadTile(key);
            }
            tileQueueRef.current = [];
            tileQueueSetRef.current.clear();
            // Force updateTiles to re-scan on next frame after bulk unload
            lastCameraTileRef.current.tileX = -Infinity;
          }

          console.warn(
            `%c[refreshTownMarkers] DONE — Rendered ${newTowns.length} towns, townGroup now has ${townGroup.children.length} children`,
            "color: lime; font-weight: bold",
          );
        },
        moveTownInScene: (
          townId: string,
          newPosition: { x: number; y: number; z: number },
        ) => {
          const townGroup = townMarkersRef.current;
          if (!townGroup) return;

          // Find old position from runtimeTowns
          const oldTown = runtimeTownsRef.current.find((t) => t.id === townId);
          if (!oldTown) {
            console.warn(
              `[moveTownInScene] Town ${townId} not found in runtimeTowns`,
            );
            return;
          }

          const dx = newPosition.x - oldTown.position.x;
          const dz = newPosition.z - oldTown.position.z;
          if (Math.abs(dx) < 0.01 && Math.abs(dz) < 0.01) return;

          const offset = worldCenterOffsetRef.current;
          const newSceneX = newPosition.x + offset;
          const newSceneZ = newPosition.z + offset;

          // Query terrain height at new position — this is the Y the terrain
          // will flatten to, and where buildings/markers should sit.
          const heightQuerier = terrainQuerierRef.current;
          const gen = generatorRef.current;
          const newTerrainY = heightQuerier
            ? heightQuerier(newPosition.x, newPosition.z).height
            : gen
              ? gen.getHeightAt(newPosition.x, newPosition.z)
              : 0;
          const oldTerrainY = heightQuerier
            ? heightQuerier(oldTown.position.x, oldTown.position.z).height
            : gen
              ? gen.getHeightAt(oldTown.position.x, oldTown.position.z)
              : 0;
          const dy = newTerrainY - oldTerrainY;

          // Move direct children of townGroup that belong to this town.
          // Town center markers (cone/ring/pillar) use absolute x/z positioning
          // because the gizmo already moved the attached cone — applying a
          // delta would double-move it. Buildings/landmarks/roads use x/z delta.
          // Y is adjusted by terrain height difference for ALL objects.
          for (const child of townGroup.children) {
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

          // Update runtimeTowns ref so terrain flattening uses the new
          // position when tiles regenerate (triggered by the useEffect
          // watching providedRoads, same path as the world wizard).
          const rt = runtimeTownsRef.current.find((t) => t.id === townId);
          if (rt) {
            rt.position.x = newPosition.x;
            rt.position.y = newTerrainY;
            rt.position.z = newPosition.z;
          }
        },
        rebuildRoadRibbons: (
          roads: Array<{
            id: string;
            path: Array<{ x: number; y: number; z: number }>;
            width: number;
            connectedTowns: [string, string];
            isMainRoad: boolean;
          }>,
        ) => {
          // Eagerly update providedRoadsRef so any tile that happens to
          // regenerate before the React render uses new road data. The full
          // tile unload is handled by the useEffect (same path as wizard).
          providedRoadsRef.current = roads as GeneratedRoad[];
        },
        getLastProcgenTowns: () => lastProcgenTownsRef.current,
        setVegetationVisible: (visible: boolean) => {
          if (vegetationContainerRef.current) {
            vegetationContainerRef.current.visible = visible;
          }
        },
        getTerrainQuerier: () => terrainQuerierRef.current,
      });

      // ---- Pre-seed entire world with low-res tiles for instant overview ----
      // Queue ALL world tiles as low-res so the entire map appears quickly
      // instead of chunk-by-chunk. The regular per-frame budget handles
      // generation, but we dramatically increase the low-res budget during
      // this initial phase. Full-res tiles near the camera are generated
      // separately by updateTiles as normal.
      if (isStudioModeRef.current && terrainQuerierRef.current) {
        const queue = tileQueueRef.current;
        const queueSet = tileQueueSetRef.current;
        let preSeedQueued = 0;
        for (let tx = 0; tx < worldSize; tx++) {
          for (let tz = 0; tz < worldSize; tz++) {
            const key = `${tx}_${tz}`;
            if (!tilesRef.current.has(key) && !queueSet.has(key)) {
              queueSet.add(key);
              queue.push({
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
            `[TileBasedTerrain] Queued ${preSeedQueued} low-res tiles for instant world overview`,
          );
        }
      }

      // Animation loop
      let lastTime = performance.now();
      // Track camera rotation for minimap (throttled updates)
      let lastRotationUpdate = 0;
      // Pre-allocated vector for label world position query (avoids GC)
      const _labelWorldPos = new THREE.Vector3();
      // Phase 2D: Cache last time-of-day value to skip unchanged frames
      let lastToDValue = -1;
      // Phase 2E: Throttle LOD updates — every 10 frames or when camera moves
      let lodFrameCounter = 0;
      let lastLodCameraX = 0;
      let lastLodCameraZ = 0;

      const animate = () => {
        if (!mounted) return;
        animationIdRef.current = requestAnimationFrame(animate);

        const now = performance.now();
        const deltaTime = Math.min((now - lastTime) / 1000, 0.1); // Cap delta
        lastTime = now;
        const elapsedSeconds = now / 1000;

        updateCameraRef.current(deltaTime);
        // Phase 2C: Pass cached frame timestamp to updateTiles
        updateTilesRef.current(now);

        // Phase 2D: Only run time-of-day lighting when value changes
        const todValue = timeOfDayRef.current;
        if (
          todValue !== lastToDValue &&
          sunRef.current &&
          ambientLightRef.current
        ) {
          lastToDValue = todValue;
          updateTimeOfDayLighting(
            todValue,
            sunRef.current,
            ambientLightRef.current,
            scene,
          );
        }

        // GPU resource staging — see SceneResourceManager for invariants.
        // Must run BEFORE LOD updates so newly added LOD objects get their
        // visibility set correctly (without update(), all 3 levels render).
        resourceManager.processStaging(entitySyncRef.current);

        // Hide entity markers when zoomed far out — invisible at that distance
        // but still thousands of draw calls. Only override when RM isn't managing
        // visibility (RM hides during staging; we hide based on altitude).
        if (entitySyncRef.current && !resourceManager.areMarkersHidden) {
          entitySyncRef.current.visible =
            camera.position.y < MARKER_HIDE_ALTITUDE;
        }

        // Phase 2E: Throttle LOD updates — every 10 frames or when camera moves > 5 units
        lodFrameCounter++;
        const camDx = camera.position.x - lastLodCameraX;
        const camDz = camera.position.z - lastLodCameraZ;
        if (lodFrameCounter >= 10 || camDx * camDx + camDz * camDz > 25) {
          lodFrameCounter = 0;
          lastLodCameraX = camera.position.x;
          lastLodCameraZ = camera.position.z;
          for (const lod of lodObjectsRef.current) {
            lod.update(camera);
          }
        }

        // Animate wilderness skull (bobbing and pulsing)
        if (wildernessOverlayRef.current) {
          const wildernessGroup =
            wildernessOverlayRef.current as unknown as THREE.Group & {
              skullSprite?: THREE.Sprite;
            };
          if (wildernessGroup.skullSprite) {
            // Bob up and down
            const baseY = 50;
            const bobAmplitude = 3.0;
            const bobSpeed = 1.2;
            wildernessGroup.skullSprite.position.y =
              baseY + Math.sin(elapsedSeconds * bobSpeed) * bobAmplitude;

            // Subtle scale pulse
            const skullBaseSize = 30.0;
            const scalePulse = 1.0 + Math.sin(elapsedSeconds * 0.5) * 0.05;
            wildernessGroup.skullSprite.scale.set(
              skullBaseSize * scalePulse,
              skullBaseSize * scalePulse,
              1,
            );
          }
        }

        // Update camera rotation for minimap (only when built-in minimap is shown)
        if (!isStudioModeRef.current && now - lastRotationUpdate > 100) {
          setCameraRotationY(cameraStateRef.current.euler.y);
          lastRotationUpdate = now;
        }

        // UE5-style constant screen-space label sizing —
        // scale visible label sprites so they stay the same pixel height
        // regardless of camera distance.  Only hovered + selected are visible
        // so this is O(1).
        const LABEL_SCREEN_HEIGHT = 0.035; // fraction of viewport height
        const labelTargets = [
          hoveredSelectableRef.current,
          selectedLabelRef.current,
        ];
        for (const target of labelTargets) {
          if (!target) continue;
          for (const child of target.children) {
            if (!child.userData?.isLabel || !child.visible) continue;
            const sprite = child as THREE.Sprite;
            const dist = camera.position.distanceTo(
              sprite.getWorldPosition(_labelWorldPos),
            );
            const vFov = camera.fov * (Math.PI / 180);
            const worldHeight =
              2 * dist * Math.tan(vFov / 2) * LABEL_SCREEN_HEIGHT;
            const aspect = (sprite.userData.labelAspect as number) ?? 4;
            sprite.scale.set(worldHeight * aspect, worldHeight, 1);
          }
        }

        try {
          renderer.render(scene, camera);
        } catch (err) {
          // GPU device lost — stop the animation loop to prevent error cascade
          const crashStats = getGpuLifecycleStats();
          console.error(
            `[GPU-DEBUG] RENDER CRASH: deferDispose=${crashStats.pendingDisposals} deferAdd=${crashStats.pendingAdditions} ` +
              `rmStaging=${resourceManager.pendingStaged} rmDisposing=${resourceManager.pendingDisposal} ` +
              `scene=${scene.children.length}`,
          );
          console.error(
            "[TileBasedTerrain] GPU device lost, stopping render loop:",
            err,
          );
          mounted = false;
          return;
        }

        // Render ViewHelper orientation cube overlay
        // ViewHelper types expect WebGLRenderer but work with WebGPURenderer at runtime
        if (viewHelperRef.current) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          viewHelperRef.current.render(renderer as any);
        }

        // GPU resource disposal — runs AFTER rendering, only when staging is done.
        // See SceneResourceManager for phase separation invariant.
        resourceManager.processDisposal();

        // Process deferred GPU operations (overlay hooks) ONLY when
        // SceneResourceManager has no pending work. This prevents both
        // systems from creating GPU buffers in the same frame, which
        // exhausts Metal's staging buffer pool and kills the device.
        if (
          !resourceManager.hasStagedWork &&
          resourceManager.pendingDisposal === 0
        ) {
          processDeferredFrame();
        }
      };
      animate();
    };

    initRenderer();

    // Handle resize — use ResizeObserver so sidebar collapse/expand triggers
    // a resize (window.resize only fires when the browser window itself changes)
    const handleResize = () => {
      if (!container || !camera || !rendererRef.current) return;
      const width = container.clientWidth || 1;
      const height = container.clientHeight || 1;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      rendererRef.current.setSize(width, height);
    };
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);
    // Also listen on window resize as fallback (fullscreen changes, etc.)
    window.addEventListener("resize", handleResize);

    // Capture refs for cleanup
    const currentTiles = tilesRef.current;
    const currentAnimationId = animationIdRef;
    const currentTemplateGeometry = templateGeometryRef;
    const currentTerrainMaterial = terrainMaterialRef;
    const currentWaterMaterial = waterMaterialRef;
    const currentTownMarkers = townMarkers;

    // Cleanup
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", handleResize);
      document.removeEventListener("mousemove", _onMouseMove);
      document.removeEventListener("keydown", _onKeyDown);
      document.removeEventListener("keyup", _onKeyUp);
      document.removeEventListener("pointerlockchange", _onPointerLockChange);
      document.removeEventListener("mouseup", _onMouseUp);
      container.removeEventListener("click", _onClick);
      container.removeEventListener("mousedown", _onMouseDown);
      container.removeEventListener("wheel", _onWheel);
      document.removeEventListener("contextmenu", _onContextMenu, true);

      cancelAnimationFrame(currentAnimationId.current);

      // Flush staging + disposal queues — on unmount we can dispose everything
      // synchronously since the renderer is being torn down anyway.
      resourceManager.flush();

      // Dispose all tiles
      for (const [key] of currentTiles) {
        const tile = currentTiles.get(key);
        if (tile) {
          tile.mesh.geometry.dispose();
          if (tile.water) tile.water.geometry.dispose();
        }
      }
      currentTiles.clear();

      // Dispose town markers
      currentTownMarkers.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (child.material instanceof THREE.Material) {
            child.material.dispose();
          }
        }
      });

      // Dispose difficulty heatmap
      heatmapManagerRef.current?.dispose();
      heatmapManagerRef.current = null;

      // Clear building walkability tracking
      buildingWalkabilityService.clear();

      // Dispose vegetation (InstancedMesh per species + rocks)
      vegetationContainer.traverse((child) => {
        if (
          child instanceof THREE.InstancedMesh ||
          child instanceof THREE.Mesh
        ) {
          child.geometry.dispose();
          if (child.material instanceof THREE.Material) {
            child.material.dispose();
          }
        }
      });
      clearTreeSpeciesCache();

      // Dispose manifest entity sync markers
      if (entitySyncRef.current) {
        // Remove from selectables before disposing
        for (const subGroup of entitySyncRef.current.children) {
          if (!(subGroup instanceof THREE.Group)) continue;
          for (const entity of subGroup.children) {
            const idx = selectableObjectsRef.current.indexOf(entity);
            if (idx >= 0) selectableObjectsRef.current.splice(idx, 1);
          }
        }
        disposeEntitySync(entitySyncRef.current);
        entitySyncRef.current = null;
      }
      disposeEntitySyncGeometry();

      // Dispose wilderness overlay (stored as a Group, not a Mesh)
      if (wildernessOverlayRef.current) {
        const wildernessObj =
          wildernessOverlayRef.current as unknown as THREE.Object3D;
        wildernessObj.traverse((child) => {
          if (child instanceof THREE.Mesh || child instanceof THREE.Sprite) {
            child.geometry?.dispose();
            if (child.material instanceof THREE.Material) {
              child.material.dispose();
            }
          }
        });
      }

      // Dispose shared resources
      currentTemplateGeometry.current?.dispose();
      lowResTemplateGeometryRef.current?.dispose();
      waterTemplateGeometryRef.current?.dispose();
      currentTerrainMaterial.current?.dispose();
      currentWaterMaterial.current?.dispose();
      lodObjectsRef.current = [];

      // Dispose orbit controls
      if (orbitControlsRef.current) {
        orbitControlsRef.current.dispose();
        orbitControlsRef.current = null;
      }

      // Dispose WebGPU renderer
      if (rendererRef.current) {
        if (
          container &&
          rendererRef.current.domElement.parentNode === container
        ) {
          container.removeChild(rendererRef.current.domElement);
        }
        rendererRef.current.dispose();
        rendererRef.current = null;
      }

      // Exit pointer lock if active
      if (document.pointerLockElement === container) {
        document.exitPointerLock();
      }
    };
  }, [
    // Only STRUCTURAL params that warrant a full scene rebuild.
    // Noise weights, maxHeight, waterThreshold, seed → handled by the
    // terrain-config effect below (clears tiles, updates generator).
    // Event handlers + animation callbacks → delegated via stable refs.
    worldSize,
    tileSize,
    tileResolution,
  ]);

  // Regenerate terrain when config changes — marks existing tiles dirty for
  // incremental in-place regeneration instead of unloading everything.
  useEffect(() => {
    // Update generator and querier
    const newGenerator = new TerrainGenerator(terrainConfig);
    generatorRef.current = newGenerator;

    // If an imported heightmap querier is active, use it instead of the
    // procedural generator/game pipeline querier.
    if (importedQuerier) {
      terrainQuerierRef.current = importedQuerier;
    } else if (config.useGamePipeline) {
      const gameQuerier = createGameTerrainQuerier(config.seed);
      terrainQuerierRef.current = (worldX: number, worldZ: number) => {
        const q = gameQuerier.queryPoint(worldX, worldZ);
        return {
          height: q.height,
          biome: q.biomeId,
          color: q.biomeColor,
          biomeForestWeight: q.biomeForestWeight,
          biomeCanyonWeight: q.biomeCanyonWeight,
        };
      };
    } else {
      terrainQuerierRef.current = (worldX: number, worldZ: number) => {
        const q = newGenerator.queryPoint(worldX, worldZ);
        const fW =
          q.biomeInfluences?.find((b) => b.type === "forest")?.weight ?? 0;
        const cW =
          q.biomeInfluences?.find((b) => b.type === "canyon")?.weight ?? 0;
        return {
          height: q.height,
          biome: q.biome,
          biomeForestWeight: fW,
          biomeCanyonWeight: cW,
        };
      };
    }

    // Update template geometries if resolution changed
    if (templateGeometryRef.current) {
      templateGeometryRef.current.dispose();
      templateGeometryRef.current = createTemplateGeometry(
        tileSize,
        tileResolution,
      );
    }
    if (lowResTemplateGeometryRef.current) {
      lowResTemplateGeometryRef.current.dispose();
      lowResTemplateGeometryRef.current = createTemplateGeometry(
        tileSize,
        TILE_LOD_LOW_RESOLUTION,
      );
    }

    // Mark all loaded tiles as dirty for progressive in-place regeneration
    // instead of tearing them all down and rebuilding from scratch.
    if (tilesRef.current.size > 0) {
      dirtyTileKeysRef.current = [];
      for (const [key, tile] of tilesRef.current) {
        tile.dirty = true;
        dirtyTileKeysRef.current.push(key);
      }
    }

    prevMaxHeightRef.current = maxHeight;
  }, [
    terrainConfig,
    tileSize,
    tileResolution,
    config.useGamePipeline,
    config.seed,
    maxHeight,
    importedQuerier,
  ]);

  // Fast-path: when ONLY waterThreshold changes, move water planes without
  // regenerating terrain geometry. This runs in addition to the terrain config
  // effect which marks tiles dirty — the dirty regen will also update water,
  // but this gives an instant visual response before dirty tiles process.
  useEffect(() => {
    const prev = prevWaterThresholdRef.current;
    if (waterThreshold === prev) return;
    prevWaterThresholdRef.current = waterThreshold;

    // Instantly reposition all existing water meshes
    for (const [, tile] of tilesRef.current) {
      if (tile.water) {
        tile.water.position.y = waterThreshold;
      }
    }
  }, [waterThreshold]);

  // Fast-path: when ONLY maxHeight changes, scale vertex Y positions on all
  // loaded tiles by the ratio newMax/oldMax. This gives immediate visual
  // feedback; the dirty-tile queue will do a proper full regen progressively.
  useEffect(() => {
    const prev = prevMaxHeightRef.current;
    if (maxHeight === prev) return;
    // prevMaxHeightRef is updated by the terrain config effect

    const scale = maxHeight / prev;
    if (!isFinite(scale) || scale === 0) return;

    for (const [, tile] of tilesRef.current) {
      const posAttr = tile.mesh.geometry.getAttribute("position");
      if (!posAttr) continue;
      const arr = posAttr.array as Float32Array;
      // Y is at stride index 1 (x,y,z per vertex)
      for (let i = 1; i < arr.length; i += 3) {
        arr[i] *= scale;
      }
      posAttr.needsUpdate = true;
      tile.mesh.geometry.computeBoundingSphere();
    }
  }, [maxHeight]);

  // Regenerate ALL tiles when roads change so the terrain shader picks up
  // road influence (road coloring baked into terrain surface) and height
  // flattening. This is the SAME path used by the world wizard on initial
  // generation — roads update in state → prop changes → tiles regenerate.
  const prevRoadsRef = useRef<GeneratedRoad[] | undefined>(undefined);
  useEffect(() => {
    if (providedRoads === prevRoadsRef.current) return;
    prevRoadsRef.current = providedRoads;
    providedRoadsRef.current = providedRoads;
    if (!providedRoads || providedRoads.length === 0) return;
    if (tilesRef.current.size === 0) return; // No tiles loaded yet

    console.log(
      `[TileBasedTerrain] Roads changed — marking ${tilesRef.current.size} tiles dirty for ${providedRoads.length} roads`,
    );

    dirtyTileKeysRef.current = [];
    for (const [key, tile] of tilesRef.current) {
      tile.dirty = true;
      dirtyTileKeysRef.current.push(key);
    }
  }, [providedRoads]);

  // Regenerate ALL tiles when mines change so the terrain shader picks up
  // mine influence (rocky floor coloring) and height flattening.
  const prevMinesRef = useRef<TileBasedTerrainProps["mines"] | undefined>(
    undefined,
  );
  useEffect(() => {
    if (providedMines === prevMinesRef.current) return;
    prevMinesRef.current = providedMines;
    runtimeMinesRef.current = providedMines;
    if (!providedMines || providedMines.length === 0) return;
    if (tilesRef.current.size === 0) return;

    console.log(
      `[TileBasedTerrain] Mines changed — marking ${tilesRef.current.size} tiles dirty for ${providedMines.length} mines`,
    );

    dirtyTileKeysRef.current = [];
    for (const [key, tile] of tilesRef.current) {
      tile.dirty = true;
      dirtyTileKeysRef.current.push(key);
    }
  }, [providedMines]);

  // Notify parent of tile count changes
  useEffect(() => {
    const totalTiles = worldSize * worldSize;
    onTileCountChange?.(loadedTiles, totalTiles);
  }, [loadedTiles, worldSize, onTileCountChange]);

  // Toggle vegetation visibility
  useEffect(() => {
    if (vegetationContainerRef.current) {
      vegetationContainerRef.current.visible = showVegetation;
    }
  }, [showVegetation]);

  // Toggle difficulty heatmap visibility
  useEffect(() => {
    heatmapManagerRef.current?.setVisible(showDifficultyHeatmap);
  }, [showDifficultyHeatmap]);

  // Feed danger sources to heatmap manager
  useEffect(() => {
    if (heatmapManagerRef.current && dangerSources) {
      heatmapManagerRef.current.setDangerSources(dangerSources);
    }
  }, [dangerSources]);

  // Selection highlighting effect
  useEffect(() => {
    const scene = sceneRef.current;

    // Hide labels from previously selected entity
    if (selectedLabelRef.current) {
      for (const child of selectedLabelRef.current.children) {
        if (child.userData?.isLabel) child.visible = false;
      }
      selectedLabelRef.current = null;
    }

    if (!scene || !selectedId) {
      // Remove existing selection outline
      if (selectionOutlineRef.current) {
        scene?.remove(selectionOutlineRef.current);
        selectionOutlineRef.current.geometry.dispose();
        if (selectionOutlineRef.current.material instanceof THREE.Material) {
          selectionOutlineRef.current.material.dispose();
        }
        selectionOutlineRef.current = null;
      }
      return;
    }

    // Find the selected object
    const selectedObject = selectableObjectsRef.current.find(
      (obj) => obj.userData.selectableId === selectedId,
    );

    if (selectedObject) {
      // Show labels for selected entity (UE5 style)
      for (const child of selectedObject.children) {
        if (child.userData?.isLabel) child.visible = true;
      }
      selectedLabelRef.current = selectedObject;

      // Remove existing outline
      if (selectionOutlineRef.current) {
        scene.remove(selectionOutlineRef.current);
        selectionOutlineRef.current.geometry.dispose();
        if (selectionOutlineRef.current.material instanceof THREE.Material) {
          selectionOutlineRef.current.material.dispose();
        }
      }

      // Create outline based on object's bounding box (works for Groups and Meshes)
      const box = new THREE.Box3().setFromObject(selectedObject);
      if (box.isEmpty()) return;
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());

      // Padding scales with object size for entities vs buildings
      const padding = Math.min(size.length() * 0.15, 2);

      // Create a wireframe box as selection indicator
      const outlineGeometry = new THREE.BoxGeometry(
        size.x + padding,
        size.y + padding,
        size.z + padding,
      );
      const outlineMaterial = new MeshBasicNodeMaterial();
      outlineMaterial.color = new THREE.Color(0x4fc3f7); // Light blue (UE5-style)
      outlineMaterial.wireframe = true;
      outlineMaterial.transparent = true;
      outlineMaterial.opacity = 0.9;
      outlineMaterial.depthTest = false;
      const outline = new THREE.Mesh(outlineGeometry, outlineMaterial);
      outline.position.copy(center);
      outline.renderOrder = 999; // Render on top

      scene.add(outline);
      selectionOutlineRef.current = outline;
    }

    return () => {
      // Cleanup on unmount or selectedId change
      if (selectionOutlineRef.current && scene) {
        scene.remove(selectionOutlineRef.current);
        selectionOutlineRef.current.geometry.dispose();
        if (selectionOutlineRef.current.material instanceof THREE.Material) {
          selectionOutlineRef.current.material.dispose();
        }
        selectionOutlineRef.current = null;
      }
    };
  }, [selectedId]);

  // Hover detection for tooltip + UE5-style label visibility
  // Throttled to max ~15fps to avoid expensive raycasts on every mousemove
  const lastHoverRaycastRef = useRef(0);
  const handleMouseMoveForHover = useCallback((event: MouseEvent) => {
    const now = performance.now();
    if (now - lastHoverRaycastRef.current < 66) return; // ~15fps throttle
    lastHoverRaycastRef.current = now;

    if (rmbFlyActiveRef.current) {
      // Hide previous hover label during fly mode
      if (hoveredSelectableRef.current) {
        for (const child of hoveredSelectableRef.current.children) {
          if (child.userData?.isLabel) child.visible = false;
        }
        hoveredSelectableRef.current = null;
      }
      setHoveredObject(null);
      return;
    }

    const container = containerRef.current;
    const camera = cameraRef.current;
    if (!container || !camera) return;

    // Calculate mouse position
    const rect = container.getBoundingClientRect();
    mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // Update raycaster
    raycasterRef.current.setFromCamera(mouseRef.current, camera);

    // Check for intersections (recursive to catch building child meshes)
    const intersects = raycasterRef.current.intersectObjects(
      selectableObjectsRef.current,
      true,
    );

    if (intersects.length > 0) {
      const hit = intersects[0];
      // Walk up parent chain to find selectable group (ray may hit child mesh)
      let obj: THREE.Object3D | null = hit.object;
      let userData: Record<string, unknown> | null = null;
      while (obj) {
        const ud = obj.userData as Record<string, unknown>;
        if (ud.selectableId) {
          userData = ud;
          break;
        }
        obj = obj.parent;
      }

      if (userData && obj) {
        // Toggle label visibility — UE5 style: only show for hovered entity
        if (obj !== hoveredSelectableRef.current) {
          // Hide previous
          if (hoveredSelectableRef.current) {
            for (const child of hoveredSelectableRef.current.children) {
              if (child.userData?.isLabel) child.visible = false;
            }
          }
          // Show new (unless it's the selected item — that's handled separately)
          for (const child of obj.children) {
            if (child.userData?.isLabel) child.visible = true;
          }
          hoveredSelectableRef.current = obj;
        }

        let label = userData.selectableId as string;
        if (userData.selectableType === "town" && userData.townName) {
          label = `Town: ${userData.townName as string}`;
        } else if (
          userData.selectableType === "building" &&
          userData.buildingType
        ) {
          label = `Building: ${userData.buildingType as string}`;
        } else if (
          userData.selectableType === "entity" &&
          userData.entityType
        ) {
          const displayName = userData.displayName as string | undefined;
          label =
            displayName ??
            `${userData.entityType as string}: ${userData.entityId as string}`;
        }
        setHoveredObject(label);
        return;
      }
    }

    // No hit — hide previous hover label
    if (hoveredSelectableRef.current) {
      for (const child of hoveredSelectableRef.current.children) {
        if (child.userData?.isLabel) child.visible = false;
      }
      hoveredSelectableRef.current = null;
    }
    setHoveredObject(null);
  }, []);

  // Add hover detection to container
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener("mousemove", handleMouseMoveForHover);
    return () => {
      container.removeEventListener("mousemove", handleMouseMoveForHover);
    };
  }, [handleMouseMoveForHover]);

  // Track if fly mode is active for UI
  const [isFlyModeActive, setIsFlyModeActive] = useState(false);

  // Sync internal fly mode state with pointer lock
  useEffect(() => {
    const checkPointerLock = () => {
      setIsFlyModeActive(document.pointerLockElement === containerRef.current);
    };
    document.addEventListener("pointerlockchange", checkPointerLock);
    return () =>
      document.removeEventListener("pointerlockchange", checkPointerLock);
  }, []);

  return (
    <div className={`relative w-full h-full ${className}`}>
      <div ref={containerRef} className="w-full h-full" />

      {/* ---- Built-in HUD (hidden when World Studio provides its own overlay) ---- */}
      {!hideBuiltinOverlays && (
        <>
          {/* UE5-style camera controls overlay */}
          {isFlyModeActive ? (
            <div className="absolute top-4 left-4 rounded-lg p-3 text-xs pointer-events-none bg-blue-500/20 border border-blue-500/50 text-blue-200">
              <div className="font-semibold text-text-primary mb-2">
                Fly Mode
              </div>
              <div>WASD — Move</div>
              <div>Q / E — Down / Up</div>
              <div>
                Scroll — Speed ({Math.round(cameraStateRef.current.moveSpeed)})
              </div>
              <div className="text-text-muted mt-1">Release RMB to exit</div>
            </div>
          ) : (
            <div className="absolute top-4 left-4 bg-bg-secondary/90 rounded-lg p-3 text-xs text-text-secondary pointer-events-none">
              <div className="font-semibold text-text-primary mb-2">
                Viewport Controls
              </div>
              <div>LMB Drag — Orbit</div>
              <div>MMB Drag — Pan</div>
              <div>Scroll — Zoom</div>
              <div>RMB Hold — Fly mode</div>
              <div>F — Focus selection</div>
            </div>
          )}

          {/* Stats overlay */}
          <div className="absolute top-4 right-4 bg-bg-secondary/90 rounded-lg p-3 text-xs text-text-primary pointer-events-none">
            <div>
              Tiles: {loadedTiles} / {worldSize * worldSize}
            </div>
            <div>
              World: {worldSize * tileSize}m x {worldSize * tileSize}m
            </div>
            <div>
              Towns: {townCount} | Roads: {roadCount}
            </div>
            <div>Vegetation: {showVegetation ? "On" : "Off"}</div>
            {isGenerating && (
              <div className="text-accent-primary mt-1">Loading tiles...</div>
            )}

            {/* LOD Legend */}
            <div className="mt-2 pt-2 border-t border-border-primary">
              <div className="font-semibold mb-1">Building LOD</div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  <span>Full (0-200m)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-yellow-500" />
                  <span>Simple (200-500m)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-orange-500" />
                  <span>Box (500m+)</span>
                </div>
              </div>
            </div>

            {/* Zone Legend */}
            <div className="mt-2 pt-2 border-t border-border-primary">
              <div className="font-semibold mb-1">Zones</div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-500/50" />
                  <span>Wilderness (PVP)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Hover tooltip */}
          {hoveredObject && !rmbFlyActiveRef.current && (
            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-bg-primary/95 border border-border-primary rounded-lg px-3 py-2 text-sm text-text-primary pointer-events-none shadow-lg">
              {hoveredObject}
              <span className="text-text-muted ml-2">(click to select)</span>
            </div>
          )}

          {/* Selected item indicator */}
          {selectedId && (
            <div className="absolute bottom-4 right-4 bg-green-500/20 border border-green-500/50 rounded-lg px-3 py-2 text-sm text-green-400 pointer-events-none">
              Selected: {selectedId}
            </div>
          )}
        </>
      )}

      {/* Minimap — hidden in World Studio (it provides its own overlay controls) */}
      {!hideBuiltinOverlays && (
        <Minimap
          worldSize={worldSize * tileSize}
          cameraPosition={cameraStateRef.current.position}
          cameraRotationY={cameraRotationY}
          towns={minimapTowns}
          roads={minimapRoads}
          className="absolute bottom-4 left-4"
          onNavigate={(x, z) => {
            const newY = Math.max(cameraStateRef.current.position.y, 100);
            cameraStateRef.current.position.set(x, newY, z);
            const cam = cameraRef.current;
            if (cam) {
              cam.position.set(x, newY, z);
              const ctrl = orbitControlsRef.current;
              if (ctrl) {
                ctrl.target.set(x, 0, z);
                ctrl.update();
              }
            }
          }}
        />
      )}
    </div>
  );
};

export default TileBasedTerrain;
