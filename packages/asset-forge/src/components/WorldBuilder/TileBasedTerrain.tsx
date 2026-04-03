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
  createTerrainMaterial as createGameTerrainMaterial,
  type TerrainConfig,
  type TerrainUniforms,
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

import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { ViewHelper } from "three/examples/jsm/helpers/ViewHelper.js";

import { buildingWalkabilityService } from "./BuildingWalkabilityService";
import {
  createGameTerrainQuerier,
  GAME_MAX_HEIGHT,
  GAME_WATER_THRESHOLD,
  GAME_TILE_SIZE,
  GAME_WORLD_SIZE,
} from "./GameTerrainAdapter";
import { generateTrees } from "@hyperscape/shared/world/BiomeResourceGenerator";
import type { ResourceGenerationContext } from "@hyperscape/shared/world/BiomeResourceGenerator";
import { getTreeConfigForBiome } from "@hyperscape/shared/world/TerrainBiomeTypes";
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
import {
  createGameWorldEntities,
  disposeEntitySync,
  disposeEntitySyncGeometry,
  type GameEntityData,
} from "./GameWorldEntitySync";
import type {
  WorldCreationConfig,
  GeneratedRoad,
  VegetationConfig,
} from "./types";

/** Generic terrain query interface — satisfied by both procgen TerrainGenerator and GameTerrainAdapter */
interface TerrainQueryResult {
  height: number;
  biome: string;
  color?: { r: number; g: number; b: number };
  /** Forest biome weight 0-1 for per-biome shader blending */
  biomeForestWeight?: number;
  /** Canyon biome weight 0-1 for per-biome shader blending */
  biomeCanyonWeight?: number;
}
type TerrainQuerier = (worldX: number, worldZ: number) => TerrainQueryResult;

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

// ============== CONSTANTS ==============

const TILE_LOAD_RADIUS = 5; // tiles in each direction from camera (standalone)
const TILE_LOAD_RADIUS_STUDIO = 3; // full-detail radius for World Studio
const TILE_UNLOAD_RADIUS = 7; // tiles beyond this are unloaded
const TILE_UNLOAD_RADIUS_STUDIO = 5;
const MAX_TILES_PER_FRAME = 2; // limit tile generation per frame for performance

// LOD terrain: low-res tiles fill the horizon when zoomed out
const TILE_LOD_LOW_RESOLUTION = 8; // 8×8 grid for far tiles (vs 32×32 full)
const MAX_LOW_RES_TILES_PER_FRAME = 8; // low-res tiles are 16× cheaper to generate

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

// Biome colors matching the game's BIOMES data
const BIOME_COLORS: Record<string, { r: number; g: number; b: number }> = {
  plains: { r: 0.486, g: 0.729, b: 0.373 },
  forest: { r: 0.227, g: 0.42, b: 0.208 },
  valley: { r: 0.353, g: 0.541, b: 0.31 },
  desert: { r: 0.769, g: 0.639, b: 0.353 },
  tundra: { r: 0.722, g: 0.784, b: 0.784 },
  swamp: { r: 0.29, g: 0.353, b: 0.227 },
  mountains: { r: 0.541, g: 0.541, b: 0.541 },
  lakes: { r: 0.29, g: 0.478, b: 0.722 },
};

// Shoreline tint color (sandy brown)
const SHORELINE_COLOR = { r: 0.545, g: 0.451, b: 0.333 };

// Water colors
const WATER_COLOR = 0x2a5599;
const WATER_OPACITY = 0.75;

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
}

interface CameraState {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  euler: THREE.Euler;
  moveSpeed: number;
  lookSpeed: number;
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
export interface VegetationExclusions {
  /** Hard keep-out zones — buildings, resources, spawn points.
   *  Trees inside the footprint are always removed; trees near the edge are
   *  probabilistically thinned with noise-distorted boundaries. */
  circles: Array<{ x: number; z: number; radius: number }>;
  /** Road/path exclusions — hard cutoff on road surface, gradual density
   *  ramp at the road shoulders. */
  roads: Array<{ path: Array<{ x: number; z: number }>; halfWidth: number }>;
  /** Town centers — creates a broad density gradient (RuneScape-style: sparse
   *  near town center, gradually reaching full density in the wilderness).
   *  This replaces giant circular cutouts with natural thinning. */
  towns?: Array<{ x: number; z: number; safeZoneRadius: number }>;
}

// ---------------------------------------------------------------------------
// Vegetation density field — simplified two-layer approach
// ---------------------------------------------------------------------------
// Layer 1: Hard exclusions (buildings, roads) — binary remove, no noise.
// Layer 2: Town proximity gradient — smooth density ramp with FBM noise on
//          the boundary for organic town edges. This is the ONLY probabilistic
//          layer. Noise is NOT applied to individual buildings (that caused
//          random tree clusters inside towns from noise-created survival pockets).
// ---------------------------------------------------------------------------

/** Spatial hash for value noise (shader-style, deterministic) */
function _vegHash(x: number, z: number): number {
  const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

/** Bicubic-interpolated value noise [0..1] */
function _vegSmoothNoise(x: number, z: number): number {
  const ix = Math.floor(x),
    iz = Math.floor(z);
  const fx = x - ix,
    fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  return (
    _vegHash(ix, iz) * (1 - sx) * (1 - sz) +
    _vegHash(ix + 1, iz) * sx * (1 - sz) +
    _vegHash(ix, iz + 1) * (1 - sx) * sz +
    _vegHash(ix + 1, iz + 1) * sx * sz
  );
}

/** 3-octave FBM [0..1] for organic town boundary distortion */
function _vegFbm(x: number, z: number): number {
  return (
    _vegSmoothNoise(x, z) * 0.5714 +
    _vegSmoothNoise(x * 2, z * 2) * 0.2857 +
    _vegSmoothNoise(x * 4, z * 4) * 0.1429
  );
}

/** Deterministic per-position random [0..1] for survival roll */
function _vegRand(x: number, z: number): number {
  const n = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

/** Hermite smoothstep (clamped) */
function _vegSmoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// Town gradient constants — tuned for RuneScape-style settlement→wilderness
const _VEG_NOISE_FREQ = 0.07; // Noise frequency (features ~14m, subtle wobble)
const _VEG_NOISE_AMP = 6; // ±6m town boundary wobble (subtle, not chaotic)
const _VEG_TOWN_INNER_FRAC = 0.3; // Fraction of safeZone ≈ zero density
const _VEG_TOWN_OUTER_FRAC = 1.5; // Fraction of safeZone ≈ full density
const _VEG_MIN_EDGE_SCALE = 0.35; // Smallest trees at town fringe

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
const _BIOME_DOMINANCE_THRESHOLD = 0.55;

function _getVisualBiomeForTrees(q: TerrainQueryResult): string {
  const fW = q.biomeForestWeight ?? 0;
  const cW = q.biomeCanyonWeight ?? 0;
  const tW = Math.max(0, 1 - fW - cW);

  if (fW > _BIOME_DOMINANCE_THRESHOLD) return "forest";
  if (cW > _BIOME_DOMINANCE_THRESHOLD) return "canyon";
  if (tW > _BIOME_DOMINANCE_THRESHOLD) return "tundra";

  // No clear winner — tundra conifers are visually neutral on blended ground
  return "tundra";
}

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
  /** Rebuild town 3D meshes (buildings, roads, landmarks) from full procgen data. */
  refreshTownMarkers: (towns: ProcgenTown[]) => void;
  /** Show or hide the decorative instanced vegetation layer. */
  setVegetationVisible: (visible: boolean) => void;
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
  /** Called when camera move speed changes (scroll wheel or [ ] keys) */
  onMoveSpeedChange?: (speed: number) => void;
  /** Pre-generated road network (uses actual pathfinding data) */
  roads?: GeneratedRoad[];
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
}

export type { GameEntityData };

// ============== MINIMAP COMPONENT ==============

interface MinimapProps {
  worldSize: number; // World size in meters
  cameraPosition: THREE.Vector3;
  cameraRotationY: number;
  towns: Array<{
    id: string;
    name: string;
    position: { x: number; z: number };
    size: string;
  }>;
  roads: Array<{ path: Array<{ x: number; z: number }> }>;
  className?: string;
  onNavigate?: (x: number, z: number) => void;
  showWilderness?: boolean;
}

const MINIMAP_SIZE = 180; // pixels
const WILDERNESS_START_PERCENT = 0.7; // Wilderness starts at 70% from south

const Minimap: React.FC<MinimapProps> = ({
  worldSize,
  cameraPosition,
  cameraRotationY,
  towns,
  roads,
  className = "",
  onNavigate,
  showWilderness = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Convert world coords to minimap coords
  // World coordinates: X increases east, Z increases north
  // Minimap coordinates: X increases right, Y increases DOWN (canvas standard)
  // So we need to flip Z to Y: high Z (north) should be low Y (top of minimap)
  const worldToMinimap = useCallback(
    (worldX: number, worldZ: number) => {
      const normalizedX = worldX / worldSize;
      const normalizedZ = worldZ / worldSize;
      return {
        x: Math.max(0, Math.min(MINIMAP_SIZE, normalizedX * MINIMAP_SIZE)),
        y: Math.max(
          0,
          Math.min(MINIMAP_SIZE, (1 - normalizedZ) * MINIMAP_SIZE),
        ), // Flip Z to Y
      };
    },
    [worldSize],
  );

  // Convert minimap coords to world coords
  // Reverse the flip: low Y (top/north) should be high Z
  const minimapToWorld = useCallback(
    (minimapX: number, minimapY: number) => {
      const normalizedX = minimapX / MINIMAP_SIZE;
      const normalizedZ = 1 - minimapY / MINIMAP_SIZE; // Flip Y back to Z
      return {
        x: normalizedX * worldSize,
        z: normalizedZ * worldSize,
      };
    },
    [worldSize],
  );

  // Update minimap on each frame
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;

    const drawMinimap = () => {
      // Clear with dark background
      ctx.fillStyle = "#0d1117";
      ctx.fillRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);

      const centerX = MINIMAP_SIZE / 2;
      const centerY = MINIMAP_SIZE / 2;
      const radius = MINIMAP_SIZE / 2 - 4;

      // Water background
      ctx.fillStyle = "#1e3a5f";
      ctx.fillRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);

      // Create clipping path for island shape
      ctx.save();
      ctx.beginPath();
      for (let angle = 0; angle < Math.PI * 2; angle += 0.05) {
        const variation =
          0.85 + Math.sin(angle * 8) * 0.1 + Math.cos(angle * 5) * 0.05;
        const r = radius * variation;
        const x = centerX + Math.cos(angle) * r;
        const y = centerY + Math.sin(angle) * r;
        if (angle === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.clip();

      // Draw safe zone (southern green area)
      const wildernessY = MINIMAP_SIZE * (1 - WILDERNESS_START_PERCENT);
      ctx.fillStyle = "#2d4a1c";
      ctx.fillRect(0, wildernessY, MINIMAP_SIZE, MINIMAP_SIZE - wildernessY);

      // Draw wilderness zone (northern red-tinted area) if enabled
      if (showWilderness) {
        // Gradient from green to red as you go north
        const gradient = ctx.createLinearGradient(0, wildernessY, 0, 0);
        gradient.addColorStop(0, "#3d5a2c"); // Transition zone
        gradient.addColorStop(0.3, "#4a3c2c"); // Dark transition
        gradient.addColorStop(1, "#5a2a2a"); // Deep wilderness (red-brown)
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, MINIMAP_SIZE, wildernessY + 10);

        // Add wilderness danger line
        ctx.strokeStyle = "rgba(255, 50, 50, 0.6)";
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(0, wildernessY);
        ctx.lineTo(MINIMAP_SIZE, wildernessY);
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        // Just green if wilderness not shown
        ctx.fillStyle = "#2d4a1c";
        ctx.fillRect(0, 0, MINIMAP_SIZE, wildernessY);
      }

      // Restore clipping
      ctx.restore();

      // Redraw island outline
      ctx.strokeStyle = "rgba(100, 150, 100, 0.4)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let angle = 0; angle < Math.PI * 2; angle += 0.05) {
        const variation =
          0.85 + Math.sin(angle * 8) * 0.1 + Math.cos(angle * 5) * 0.05;
        const r = radius * variation;
        const x = centerX + Math.cos(angle) * r;
        const y = centerY + Math.sin(angle) * r;
        if (angle === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();

      // Draw grid lines
      ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
      ctx.lineWidth = 1;
      for (let i = 1; i < 4; i++) {
        const pos = (i / 4) * MINIMAP_SIZE;
        ctx.beginPath();
        ctx.moveTo(pos, 0);
        ctx.lineTo(pos, MINIMAP_SIZE);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, pos);
        ctx.lineTo(MINIMAP_SIZE, pos);
        ctx.stroke();
      }

      // Draw roads
      ctx.strokeStyle = "#8b7355";
      ctx.lineWidth = 2;
      for (const road of roads) {
        if (road.path.length < 2) continue;
        ctx.beginPath();
        const start = worldToMinimap(road.path[0].x, road.path[0].z);
        ctx.moveTo(start.x, start.y);
        for (let i = 1; i < road.path.length; i++) {
          const point = worldToMinimap(road.path[i].x, road.path[i].z);
          ctx.lineTo(point.x, point.y);
        }
        ctx.stroke();
      }

      // Draw towns
      for (const town of towns) {
        const pos = worldToMinimap(town.position.x, town.position.z);

        // Town size determines marker size
        const markerSize =
          town.size === "town" ? 6 : town.size === "village" ? 4 : 3;
        const color =
          town.size === "town"
            ? "#ffd700"
            : town.size === "village"
              ? "#c0c0c0"
              : "#cd7f32";

        // Draw town marker (square)
        ctx.fillStyle = color;
        ctx.fillRect(
          pos.x - markerSize / 2,
          pos.y - markerSize / 2,
          markerSize,
          markerSize,
        );

        // Draw town border
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1;
        ctx.strokeRect(
          pos.x - markerSize / 2,
          pos.y - markerSize / 2,
          markerSize,
          markerSize,
        );
      }

      // Draw camera position and view cone
      const camPos = worldToMinimap(cameraPosition.x, cameraPosition.z);

      // View cone (field of view indicator)
      const coneLength = 20;
      const coneAngle = Math.PI / 4; // 45 degree FOV on each side
      const facing = -cameraRotationY - Math.PI / 2; // Adjust for coordinate system

      ctx.fillStyle = "rgba(255, 100, 100, 0.2)";
      ctx.beginPath();
      ctx.moveTo(camPos.x, camPos.y);
      ctx.lineTo(
        camPos.x + Math.cos(facing - coneAngle) * coneLength,
        camPos.y + Math.sin(facing - coneAngle) * coneLength,
      );
      ctx.lineTo(
        camPos.x + Math.cos(facing + coneAngle) * coneLength,
        camPos.y + Math.sin(facing + coneAngle) * coneLength,
      );
      ctx.closePath();
      ctx.fill();

      // Camera marker (triangle pointing in view direction)
      ctx.fillStyle = "#ff4444";
      ctx.beginPath();
      const triSize = 6;
      ctx.moveTo(
        camPos.x + Math.cos(facing) * triSize,
        camPos.y + Math.sin(facing) * triSize,
      );
      ctx.lineTo(
        camPos.x + Math.cos(facing + 2.5) * triSize,
        camPos.y + Math.sin(facing + 2.5) * triSize,
      );
      ctx.lineTo(
        camPos.x + Math.cos(facing - 2.5) * triSize,
        camPos.y + Math.sin(facing - 2.5) * triSize,
      );
      ctx.closePath();
      ctx.fill();

      // White outline around camera
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(camPos.x, camPos.y, 8, 0, Math.PI * 2);
      ctx.stroke();

      // Border
      ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
      ctx.lineWidth = 2;
      ctx.strokeRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);

      // Compass directions
      ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
      ctx.font = "10px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("N", MINIMAP_SIZE / 2, 12);
      ctx.fillText("S", MINIMAP_SIZE / 2, MINIMAP_SIZE - 4);
      ctx.fillText("W", 8, MINIMAP_SIZE / 2 + 4);
      ctx.fillText("E", MINIMAP_SIZE - 8, MINIMAP_SIZE / 2 + 4);

      animationId = requestAnimationFrame(drawMinimap);
    };

    drawMinimap();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [
    worldSize,
    cameraPosition,
    cameraRotationY,
    towns,
    roads,
    worldToMinimap,
    showWilderness,
  ]);

  // Handle click to navigate
  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas || !onNavigate) return;

      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      // Convert minimap coords to world coords
      const world = minimapToWorld(x, y);
      onNavigate(world.x, world.z);
    },
    [minimapToWorld, onNavigate],
  );

  return (
    <div className={`${className} pointer-events-auto`}>
      <canvas
        ref={canvasRef}
        width={MINIMAP_SIZE}
        height={MINIMAP_SIZE}
        className="shadow-lg cursor-crosshair rounded border-2 border-white/30"
        onClick={handleClick}
        title="Click to teleport camera"
      />
      <div className="flex flex-col gap-0.5 text-xs text-text-muted mt-1 px-1">
        <div className="flex justify-between">
          <span>Click to teleport</span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 bg-yellow-500" /> Town
          </span>
        </div>
        {showWilderness && (
          <div className="flex items-center gap-1 text-red-400/80">
            <span className="w-2 h-2 bg-red-800/80" />
            <span>Wilderness (PVP)</span>
          </div>
        )}
      </div>
    </div>
  );
};

// ============== HELPER FUNCTIONS ==============

/**
 * Create template geometry for tiles (cloned for each tile)
 */
function createTemplateGeometry(
  tileSize: number,
  resolution: number,
): THREE.PlaneGeometry {
  const geometry = new THREE.PlaneGeometry(
    tileSize,
    tileSize,
    resolution - 1,
    resolution - 1,
  );
  geometry.rotateX(-Math.PI / 2);
  // Center at origin - tiles will be positioned by their mesh
  geometry.translate(tileSize / 2, 0, tileSize / 2);
  return geometry;
}

/**
 * Create terrain material using the game's terrain shader.
 * This ensures Asset Forge renders terrain identically to the game,
 * including road influence blending via the roadInfluence vertex attribute.
 *
 * No fallback - the game shader must load for correct road rendering.
 */
function createTerrainMaterial(): THREE.Material & {
  terrainUniforms: TerrainUniforms;
} {
  // Use the game's terrain shader for unified rendering.
  // Disable fog — the World Studio camera is at altitude 200m+
  // where the game's 150-350m fog range makes everything invisible.
  const material = createGameTerrainMaterial({
    fogEnabled: false,
    fogNear: 5000,
    fogFar: 10000,
  });
  console.log(
    "[TileBasedTerrain] Created terrain material (fog disabled for World Studio)",
  );
  return material;
}

// Road influence calculation constants - must match game engine (TerrainSystem.ts ROAD_BLEND_WIDTH)
const ROAD_INFLUENCE_BLEND_WIDTH = 2; // meters of blending beyond road edge (matches game engine)
const ROAD_INFLUENCE_MINIMUM_WIDTH = 6; // minimum road width for visibility (wider than config default)

// Debug: track which roads we've logged (by their ID to detect changes)
let lastRoadDebugId: string | null = null;
let loggedFirstInfluenceVertex = false;
let _debugVertexCount = 0;

/**
 * Calculate road influence at a point based on distance to nearest road segment.
 * Returns 0-1 where 1 = center of road, 0 = no road influence.
 */
function calculateRoadInfluenceAtPoint(
  worldX: number,
  worldZ: number,
  roads: GeneratedRoad[] | undefined,
  worldCenterOffset: number,
): number {
  if (!roads || roads.length === 0) return 0;

  // Debug: log road coordinates when roads change
  const currentRoadId = roads[0]?.id ?? null;
  if (currentRoadId !== lastRoadDebugId && roads.length > 0) {
    lastRoadDebugId = currentRoadId;
    loggedFirstInfluenceVertex = false;
    _debugVertexCount = 0;
    console.log("[RoadInfluence] ===== ROADS DATA =====");
    console.log("[RoadInfluence] Total roads:", roads.length);
    console.log("[RoadInfluence] World center offset:", worldCenterOffset);

    // Calculate road coordinate bounds
    let minRoadX = Infinity,
      maxRoadX = -Infinity;
    let minRoadZ = Infinity,
      maxRoadZ = -Infinity;

    for (const road of roads) {
      for (const point of road.path) {
        minRoadX = Math.min(minRoadX, point.x);
        maxRoadX = Math.max(maxRoadX, point.x);
        minRoadZ = Math.min(minRoadZ, point.z);
        maxRoadZ = Math.max(maxRoadZ, point.z);
      }
    }

    console.log("[RoadInfluence] Road coordinate bounds:", {
      x: `${minRoadX.toFixed(0)} to ${maxRoadX.toFixed(0)}`,
      z: `${minRoadZ.toFixed(0)} to ${maxRoadZ.toFixed(0)}`,
    });

    // Log first road details
    const firstRoad = roads[0];
    const firstPoint = firstRoad.path[0];
    const lastPoint = firstRoad.path[firstRoad.path.length - 1];
    console.log("[RoadInfluence] First road:", {
      id: firstRoad.id,
      start: { x: firstPoint.x.toFixed(1), z: firstPoint.z.toFixed(1) },
      end: { x: lastPoint.x.toFixed(1), z: lastPoint.z.toFixed(1) },
      width: firstRoad.width,
      pathLength: firstRoad.path.length,
      isMainRoad: firstRoad.isMainRoad,
    });

    // Log sample vertex position for comparison
    console.log("[RoadInfluence] First vertex worldX/worldZ:", {
      worldX: worldX.toFixed(1),
      worldZ: worldZ.toFixed(1),
    });
    console.log("[RoadInfluence] =====================");
  }

  let minDistance = Infinity;
  let closestRoadWidth = ROAD_INFLUENCE_MINIMUM_WIDTH; // Use minimum width for visibility

  for (const road of roads) {
    if (road.path.length < 2) continue;

    // Ensure road width is at least the minimum for visibility
    const effectiveWidth = Math.max(
      road.width || 4,
      ROAD_INFLUENCE_MINIMUM_WIDTH,
    );

    // Check each segment of the road
    for (let i = 0; i < road.path.length - 1; i++) {
      const p1 = road.path[i];
      const p2 = road.path[i + 1];

      // Road paths are in terrain generator coordinates (centered at 0,0)
      // This matches the worldX/worldZ we receive (also in terrain generator coords)
      const x1 = p1.x;
      const z1 = p1.z;
      const x2 = p2.x;
      const z2 = p2.z;

      // Distance from point to line segment
      const distance = distanceToLineSegment(worldX, worldZ, x1, z1, x2, z2);
      if (distance < minDistance) {
        minDistance = distance;
        closestRoadWidth = effectiveWidth;
      }
    }
  }

  // Calculate influence based on distance
  // Use effective width to make roads more visible on terrain
  const halfWidth = closestRoadWidth / 2;
  const totalInfluenceWidth = halfWidth + ROAD_INFLUENCE_BLEND_WIDTH;

  if (minDistance >= totalInfluenceWidth) {
    return 0;
  }

  // Calculate final influence value
  let influence: number;
  if (minDistance <= halfWidth) {
    influence = 1.0;
  } else {
    // Smoothstep blending at edges
    const t = 1.0 - (minDistance - halfWidth) / ROAD_INFLUENCE_BLEND_WIDTH;
    influence = t * t * (3 - 2 * t); // smoothstep
  }

  // Debug: Log first vertex with significant road influence
  if (influence > 0.5 && !loggedFirstInfluenceVertex) {
    console.log(
      `[RoadInfluence] Found vertex with influence=${influence.toFixed(2)} at (${worldX.toFixed(1)}, ${worldZ.toFixed(1)}), minDist=${minDistance.toFixed(1)}, roadWidth=${closestRoadWidth}`,
    );
    loggedFirstInfluenceVertex = true;
  }

  return influence;
}

/**
 * Calculate perpendicular distance from a point to a line segment
 */
function distanceToLineSegment(
  px: number,
  pz: number,
  x1: number,
  z1: number,
  x2: number,
  z2: number,
): number {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const lengthSq = dx * dx + dz * dz;

  if (lengthSq === 0) {
    // Segment is a point
    return Math.sqrt((px - x1) ** 2 + (pz - z1) ** 2);
  }

  // Parameter t of closest point on line
  let t = ((px - x1) * dx + (pz - z1) * dz) / lengthSq;
  t = Math.max(0, Math.min(1, t)); // Clamp to segment

  // Closest point on segment
  const closestX = x1 + t * dx;
  const closestZ = z1 + t * dz;

  return Math.sqrt((px - closestX) ** 2 + (pz - closestZ) ** 2);
}

// Road colors matching the game's terrain shader (compacted dirt with gravel)
const ROAD_CENTER_COLOR = new THREE.Color(0.4, 0.333, 0.267); // #665544 — compacted dirt
const ROAD_EDGE_COLOR = new THREE.Color(0.349, 0.29, 0.239); // #594a3d — road edge
const ROAD_MAIN_COLOR = new THREE.Color(0.32, 0.24, 0.18); // Darker main roads

/**
 * Create flat ribbon geometry for a road path that hugs the terrain surface.
 * Matches the game's flat dirt-path look instead of cylindrical tubes.
 *
 * Generates a triangle strip: for each path point, two vertices are placed
 * perpendicular to the path direction at ±halfWidth. Vertex colors blend
 * from center (road color) to edge (road edge color) for the soft-edge look.
 */
function createRoadRibbonGeometry(
  pathPoints: THREE.Vector3[],
  halfWidth: number,
  isMainRoad: boolean,
): THREE.BufferGeometry {
  if (pathPoints.length < 2) return new THREE.BufferGeometry();

  const vertCount = pathPoints.length * 2;
  const positions = new Float32Array(vertCount * 3);
  const colors = new Float32Array(vertCount * 3);
  const indices: number[] = [];

  const centerColor = isMainRoad ? ROAD_MAIN_COLOR : ROAD_CENTER_COLOR;
  const edgeColor = ROAD_EDGE_COLOR;

  // Temporary vectors
  const tangent = new THREE.Vector3();
  const perp = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  for (let i = 0; i < pathPoints.length; i++) {
    const p = pathPoints[i];

    // Calculate tangent direction (forward along path)
    if (i < pathPoints.length - 1) {
      tangent.subVectors(pathPoints[i + 1], p).normalize();
    }
    // else keep previous tangent for the last point

    // Perpendicular in the XZ plane (cross tangent with up)
    perp.crossVectors(tangent, up).normalize();

    // Left and right vertices
    const li = i * 2; // left vertex index
    const ri = i * 2 + 1; // right vertex index

    positions[li * 3] = p.x - perp.x * halfWidth;
    positions[li * 3 + 1] = p.y;
    positions[li * 3 + 2] = p.z - perp.z * halfWidth;

    positions[ri * 3] = p.x + perp.x * halfWidth;
    positions[ri * 3 + 1] = p.y;
    positions[ri * 3 + 2] = p.z + perp.z * halfWidth;

    // Vertex colors: edges slightly darker for soft-edge look
    colors[li * 3] = edgeColor.r;
    colors[li * 3 + 1] = edgeColor.g;
    colors[li * 3 + 2] = edgeColor.b;

    colors[ri * 3] = edgeColor.r;
    colors[ri * 3 + 1] = edgeColor.g;
    colors[ri * 3 + 2] = edgeColor.b;

    // Build triangle strip (two triangles per segment)
    if (i < pathPoints.length - 1) {
      const bl = li;
      const br = ri;
      const tl = (i + 1) * 2;
      const tr = (i + 1) * 2 + 1;
      indices.push(bl, br, tl); // first triangle
      indices.push(br, tr, tl); // second triangle
    }
  }

  // Add center vertices for a 3-strip ribbon: edge | center | edge
  // This gives a flat path with darkened edges like the game shader
  const centerPositions = new Float32Array(pathPoints.length * 3);
  const centerColors = new Float32Array(pathPoints.length * 3);
  for (let i = 0; i < pathPoints.length; i++) {
    centerPositions[i * 3] = pathPoints[i].x;
    centerPositions[i * 3 + 1] = pathPoints[i].y;
    centerPositions[i * 3 + 2] = pathPoints[i].z;
    centerColors[i * 3] = centerColor.r;
    centerColors[i * 3 + 1] = centerColor.g;
    centerColors[i * 3 + 2] = centerColor.b;
  }

  // Merge: [left edges, right edges, centers]
  // Rebuild with 3 verts per point: left edge, center, right edge
  const totalVerts = pathPoints.length * 3;
  const finalPositions = new Float32Array(totalVerts * 3);
  const finalColors = new Float32Array(totalVerts * 3);
  const finalIndices: number[] = [];

  const narrowEdge = halfWidth * 0.15; // Edge band is 15% of half-width on each side

  for (let i = 0; i < pathPoints.length; i++) {
    const p = pathPoints[i];
    if (i < pathPoints.length - 1) {
      tangent.subVectors(pathPoints[i + 1], p).normalize();
    }
    perp.crossVectors(tangent, up).normalize();

    const base = i * 3;

    // Left edge vertex
    finalPositions[base * 3] = p.x - perp.x * halfWidth;
    finalPositions[base * 3 + 1] = p.y;
    finalPositions[base * 3 + 2] = p.z - perp.z * halfWidth;
    finalColors[base * 3] = edgeColor.r;
    finalColors[base * 3 + 1] = edgeColor.g;
    finalColors[base * 3 + 2] = edgeColor.b;

    // Center vertex
    finalPositions[(base + 1) * 3] = p.x;
    finalPositions[(base + 1) * 3 + 1] = p.y;
    finalPositions[(base + 1) * 3 + 2] = p.z;
    finalColors[(base + 1) * 3] = centerColor.r;
    finalColors[(base + 1) * 3 + 1] = centerColor.g;
    finalColors[(base + 1) * 3 + 2] = centerColor.b;

    // Right edge vertex
    finalPositions[(base + 2) * 3] = p.x + perp.x * halfWidth;
    finalPositions[(base + 2) * 3 + 1] = p.y;
    finalPositions[(base + 2) * 3 + 2] = p.z + perp.z * halfWidth;
    finalColors[(base + 2) * 3] = edgeColor.r;
    finalColors[(base + 2) * 3 + 1] = edgeColor.g;
    finalColors[(base + 2) * 3 + 2] = edgeColor.b;

    // Triangles: connect left-center-right strips to next row
    if (i < pathPoints.length - 1) {
      const nBase = (i + 1) * 3;
      // Left strip (left edge → center)
      finalIndices.push(base, base + 1, nBase);
      finalIndices.push(base + 1, nBase + 1, nBase);
      // Right strip (center → right edge)
      finalIndices.push(base + 1, base + 2, nBase + 1);
      finalIndices.push(base + 2, nBase + 2, nBase + 1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(finalPositions, 3),
  );
  geometry.setAttribute("color", new THREE.BufferAttribute(finalColors, 3));
  geometry.setIndex(finalIndices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Create water material
 * Uses MeshStandardNodeMaterial for WebGPU compatibility
 */
function createWaterMaterial(): THREE.Material {
  const material = new MeshStandardNodeMaterial();
  material.color = new THREE.Color(WATER_COLOR);
  material.transparent = true;
  material.opacity = WATER_OPACITY;
  material.roughness = 0.1;
  material.metalness = 0.3;
  material.side = THREE.DoubleSide;
  return material;
}

/**
 * Generate tile geometry with proper heightmap, colors, and road influence.
 * Uses the same approach as the game's TerrainSystem for unified rendering.
 */
/** Town flatten data passed into tile generation */
interface TownFlattenZone {
  /** Game-space X */
  x: number;
  /** Game-space Z */
  z: number;
  /** Terrain height at town center */
  centerHeight: number;
  /** Radius of fully-flat inner zone (buildings sit here) */
  innerRadius: number;
  /** Radius of outer blend zone (smooth ramp back to natural terrain) */
  outerRadius: number;
}

function generateTileGeometry(
  tileX: number,
  tileZ: number,
  templateGeometry: THREE.PlaneGeometry,
  queryTerrain: TerrainQuerier,
  tileSize: number,
  waterThreshold: number,
  maxHeight: number,
  worldSizeTiles: number,
  roads?: GeneratedRoad[],
  townFlattenZones?: TownFlattenZone[],
): { geometry: THREE.PlaneGeometry; hasWater: boolean } {
  const geometry = templateGeometry.clone();
  const positions = geometry.attributes.position;
  const colors = new Float32Array(positions.count * 3);
  const roadInfluences = new Float32Array(positions.count);
  const biomeIds = new Float32Array(positions.count);
  const forestWeights = new Float32Array(positions.count);
  const canyonWeights = new Float32Array(positions.count);

  let hasWater = false;
  const shorelineThreshold = waterThreshold / maxHeight + 0.1; // Normalized

  // Calculate world center offset - island mask is centered at (0,0)
  // so we need to offset our tile coordinates to be centered around the world center
  const worldCenterOffset = (worldSizeTiles * tileSize) / 2;

  // Biome name to ID mapping (matching game's shader expectations)
  const biomeNameToId: Record<string, number> = {
    plains: 0,
    forest: 1,
    valley: 2,
    desert: 3,
    tundra: 4,
    swamp: 5,
    mountains: 6,
    lakes: 7,
  };

  // PlaneGeometry is centered at origin, so vertices range from -tileSize/2 to +tileSize/2
  // We need to offset by half a tile to align with the tile grid system where:
  // - Tile (0,0) covers world coords (0, 0) to (tileSize, tileSize)
  // - In terrain generator coords: (-worldCenterOffset, -worldCenterOffset) to (-worldCenterOffset + tileSize, ...)
  const halfTileSize = tileSize / 2;

  for (let i = 0; i < positions.count; i++) {
    const localX = positions.getX(i);
    const localZ = positions.getZ(i);

    // World coordinates in terrain generator space (centered at 0,0)
    // Add halfTileSize to convert from centered geometry coords to tile-corner coords
    const worldX = localX + halfTileSize + tileX * tileSize - worldCenterOffset;
    const worldZ = localZ + halfTileSize + tileZ * tileSize - worldCenterOffset;

    // Query terrain
    const query = queryTerrain(worldX, worldZ);
    let height = query.height;

    // Flatten terrain under towns: full-flat inside innerRadius,
    // smooth hermite blend back to natural terrain at outerRadius
    if (townFlattenZones && townFlattenZones.length > 0) {
      for (const tz of townFlattenZones) {
        const dx = worldX - tz.x;
        const dz = worldZ - tz.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist >= tz.outerRadius) continue;
        if (dist <= tz.innerRadius) {
          // Fully flat at town center height
          height = tz.centerHeight;
        } else {
          // Smooth blend: 0 at innerRadius (full flatten) → 1 at outerRadius (natural)
          const t = (dist - tz.innerRadius) / (tz.outerRadius - tz.innerRadius);
          // Hermite smoothstep for natural-looking ramp
          const blend = t * t * (3 - 2 * t);
          height = tz.centerHeight + (height - tz.centerHeight) * blend;
        }
        break; // Only one town per vertex (first match)
      }
    }

    // Set vertex height
    positions.setY(i, height);

    // Check if this tile has water
    if (height < waterThreshold) {
      hasWater = true;
    }

    // Get biome color — use query-provided color (game pipeline) or look up from table
    let r: number, g: number, b: number;
    if (query.color) {
      r = query.color.r;
      g = query.color.g;
      b = query.color.b;
    } else {
      const biomeColor = BIOME_COLORS[query.biome] || BIOME_COLORS.plains;
      r = biomeColor.r;
      g = biomeColor.g;
      b = biomeColor.b;
    }

    // Apply shoreline tinting near water level
    const normalizedHeight = height / maxHeight;
    const waterLevel = waterThreshold / maxHeight;

    if (
      normalizedHeight > waterLevel &&
      normalizedHeight < shorelineThreshold
    ) {
      const shoreFactor =
        (1.0 -
          (normalizedHeight - waterLevel) / (shorelineThreshold - waterLevel)) *
        0.6;
      r = r + (SHORELINE_COLOR.r - r) * shoreFactor;
      g = g + (SHORELINE_COLOR.g - g) * shoreFactor;
      b = b + (SHORELINE_COLOR.b - b) * shoreFactor;
    }

    // Store color
    colors[i * 3] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;

    // Store biome ID and per-biome weights for shader
    biomeIds[i] = biomeNameToId[query.biome] ?? 0;
    forestWeights[i] = query.biomeForestWeight ?? 0;
    canyonWeights[i] = query.biomeCanyonWeight ?? 0;

    // Calculate road influence at this vertex
    // Roads are in terrain-space coordinates, so use worldX/worldZ directly
    roadInfluences[i] = calculateRoadInfluenceAtPoint(
      worldX,
      worldZ,
      roads,
      worldCenterOffset,
    );
  }

  // Debug: count non-zero road influences for this tile
  let nonZeroCount = 0;
  let maxInfluence = 0;
  for (let i = 0; i < roadInfluences.length; i++) {
    if (roadInfluences[i] > 0) {
      nonZeroCount++;
      if (roadInfluences[i] > maxInfluence) maxInfluence = roadInfluences[i];
    }
  }
  // Log for tiles with road influence OR for the first few tiles to debug coords
  const shouldLog =
    nonZeroCount > 0 || (tileX >= 0 && tileX <= 2 && tileZ >= 0 && tileZ <= 2);
  if (shouldLog) {
    // Calculate the world coordinate range for this tile (in terrain generator coords)
    const tileWorldMinX = tileX * tileSize - worldCenterOffset;
    const tileWorldMaxX = (tileX + 1) * tileSize - worldCenterOffset;
    const tileWorldMinZ = tileZ * tileSize - worldCenterOffset;
    const tileWorldMaxZ = (tileZ + 1) * tileSize - worldCenterOffset;
    console.log(
      `[Tile ${tileX},${tileZ}] Road influence: ${nonZeroCount}/${roadInfluences.length} vertices, max=${maxInfluence.toFixed(2)}`,
    );
    console.log(
      `  Tile world bounds: X[${tileWorldMinX.toFixed(0)} to ${tileWorldMaxX.toFixed(0)}], Z[${tileWorldMinZ.toFixed(0)} to ${tileWorldMaxZ.toFixed(0)}]`,
    );
  }

  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("biomeId", new THREE.BufferAttribute(biomeIds, 1));
  geometry.setAttribute(
    "biomeForestWeight",
    new THREE.BufferAttribute(forestWeights, 1),
  );
  geometry.setAttribute(
    "biomeCanyonWeight",
    new THREE.BufferAttribute(canyonWeights, 1),
  );
  geometry.setAttribute(
    "roadInfluence",
    new THREE.BufferAttribute(roadInfluences, 1),
  );
  geometry.computeVertexNormals();
  positions.needsUpdate = true;

  return { geometry, hasWater };
}

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
  onSceneReady,
  hideBuiltinOverlays = false,
  onGameEntitiesLoaded,
  onViewportContextMenu,
  showDifficultyHeatmap = false,
  dangerSources,
  onTownsGenerated,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<AssetForgeRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const orbitControlsRef = useRef<OrbitControls | null>(null);
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
  /** Cached world center offset for vegetation refresh (set in main effect) */
  const worldCenterOffsetRef = useRef<number>(0);
  const generatorRef = useRef<TerrainGenerator | null>(null);
  const terrainQuerierRef = useRef<TerrainQuerier | null>(null);
  const heatmapManagerRef = useRef<DifficultyHeatmapManager | null>(null);
  /** Ref-stable copies of props that should NOT trigger full scene rebuild */
  const providedRoadsRef = useRef(providedRoads);
  providedRoadsRef.current = providedRoads;
  const townConfigRef = useRef(config.towns);
  townConfigRef.current = config.towns;
  const configSeedRef = useRef(config.seed);
  configSeedRef.current = config.seed;

  // Tile generation queue + O(1) membership set
  const tileQueueRef = useRef<
    Array<{ tileX: number; tileZ: number; resolution: number }>
  >([]);
  const tileQueueSetRef = useRef<Set<string>>(new Set());

  // Camera state for fly controls
  const cameraStateRef = useRef<CameraState>({
    position: new THREE.Vector3(0, 200, 0),
    velocity: new THREE.Vector3(),
    euler: new THREE.Euler(0, 0, 0, "YXZ"),
    moveSpeed: 200,
    lookSpeed: 0.002,
  });

  // Input state
  const keysRef = useRef<Set<string>>(new Set());
  const isPointerLockedRef = useRef(false);
  // RMB-hold fly mode (UE5-style: hold = fly, quick click = context menu)
  const isRmbHeldRef = useRef(false);
  const rmbFlyActiveRef = useRef(false);
  /** Start position of RMB press — used for drag threshold */
  const rmbStartPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  /** Timer ID for hold-to-fly delay */
  const rmbHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** True if fly mode was activated during this RMB session (for context menu suppression) */
  const rmbDidFlyRef = useRef(false);
  /** Skip the first N mouse-move events after entering fly mode — macOS pointer lock
   *  produces a bogus large movementY on the first event, snapping the camera down. */
  const flySkipMovesRef = useRef(0);
  /** Deferred orbit controls creation — wait N frames after fly-exit for all
   *  pointer-lock cursor-jump events to settle before creating OrbitControls. */
  const pendingOrbitCreateRef = useRef(0);

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

  // Get tile key
  const getTileKey = useCallback(
    (tileX: number, tileZ: number) => `${tileX}_${tileZ}`,
    [],
  );

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

      // Generate tile geometry with road influence + town flattening
      const { geometry, hasWater } = generateTileGeometry(
        tileX,
        tileZ,
        template,
        querier,
        tileSize,
        waterThreshold,
        maxHeight,
        worldSize,
        providedRoadsRef.current,
        flattenZones,
      );

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

  // Unload a tile
  const unloadTile = useCallback((key: string) => {
    const tileData = tilesRef.current.get(key);
    if (!tileData) return;

    const terrainContainer = terrainContainerRef.current;
    const waterContainer = waterContainerRef.current;

    // Remove terrain mesh
    if (terrainContainer) {
      terrainContainer.remove(tileData.mesh);
    }
    tileData.mesh.geometry.dispose();

    // Remove water mesh
    if (tileData.water && waterContainer) {
      waterContainer.remove(tileData.water);
      tileData.water.geometry.dispose();
    }

    // Notify heatmap manager
    heatmapManagerRef.current?.onTileUnloaded(tileData.tileX, tileData.tileZ);

    tilesRef.current.delete(key);
    setLoadedTiles(tilesRef.current.size);
  }, []);

  // Update tiles based on camera position with two-tier LOD:
  //   - Near tiles (within fullDetailRadius): full resolution geometry
  //   - Far tiles (beyond that, up to dynamic farRadius): low-res LOD geometry
  const updateTiles = useCallback(() => {
    const camera = cameraRef.current;
    if (!camera) return;
    const { tileX: cameraTileX, tileZ: cameraTileZ } = getCameraTile();

    const isStudio = isStudioModeRef.current;

    // Full-detail radius stays constant
    const fullDetailRadius = isStudio
      ? TILE_LOAD_RADIUS_STUDIO
      : TILE_LOAD_RADIUS;

    // Far radius scales with camera altitude — covers visible area when zoomed out
    const farRadius = getDynamicLoadRadius(camera.position.y, isStudio);

    // Unload radius is slightly beyond the far radius
    const unloadRadius = farRadius + 2;

    // Queue tiles to load across the full dynamic radius
    for (let dx = -farRadius; dx <= farRadius; dx++) {
      for (let dz = -farRadius; dz <= farRadius; dz++) {
        const tileX = cameraTileX + dx;
        const tileZ = cameraTileZ + dz;

        if (!isInBounds(tileX, tileZ)) continue;

        const key = getTileKey(tileX, tileZ);
        const dist = Math.max(Math.abs(dx), Math.abs(dz)); // Chebyshev distance
        const wantFullRes = dist <= fullDetailRadius;
        const wantRes = wantFullRes ? tileResolution : TILE_LOD_LOW_RESOLUTION;

        const existing = tilesRef.current.get(key);
        if (existing) {
          existing.lastAccessed = performance.now();
          // LOD upgrade: tile is low-res but camera moved close enough for full detail
          if (wantFullRes && existing.resolution <= TILE_LOD_LOW_RESOLUTION) {
            unloadTile(key);
            // Falls through to queue for full-res generation
          } else {
            continue;
          }
        }

        if (!tileQueueSetRef.current.has(key)) {
          tileQueueSetRef.current.add(key);
          const distance = Math.abs(dx) + Math.abs(dz);
          const entry = { tileX, tileZ, resolution: wantRes };
          const insertIndex = tileQueueRef.current.findIndex(
            (t) =>
              Math.abs(t.tileX - cameraTileX) +
                Math.abs(t.tileZ - cameraTileZ) >
              distance,
          );
          if (insertIndex === -1) {
            tileQueueRef.current.push(entry);
          } else {
            tileQueueRef.current.splice(insertIndex, 0, entry);
          }
        }
      }
    }

    // Process tile queue with separate budgets for full-res and low-res
    let fullResGen = 0;
    let lowResGen = 0;
    const remaining: typeof tileQueueRef.current = [];

    for (const entry of tileQueueRef.current) {
      const isFullRes = entry.resolution > TILE_LOD_LOW_RESOLUTION;

      if (isFullRes && fullResGen >= MAX_TILES_PER_FRAME) {
        remaining.push(entry);
        continue;
      }
      if (!isFullRes && lowResGen >= MAX_LOW_RES_TILES_PER_FRAME) {
        remaining.push(entry);
        continue;
      }

      const qKey = getTileKey(entry.tileX, entry.tileZ);
      tileQueueSetRef.current.delete(qKey);
      if (isInBounds(entry.tileX, entry.tileZ) && !tilesRef.current.has(qKey)) {
        generateTile(entry.tileX, entry.tileZ, entry.resolution);
        if (isFullRes) fullResGen++;
        else lowResGen++;
      }
    }
    tileQueueRef.current = remaining;

    // Unload tiles beyond dynamic radius
    const now = performance.now();
    for (const [key, tile] of tilesRef.current) {
      const dx = Math.abs(tile.tileX - cameraTileX);
      const dz = Math.abs(tile.tileZ - cameraTileZ);

      if (dx > unloadRadius || dz > unloadRadius) {
        if (now - tile.lastAccessed > 1000) {
          unloadTile(key);
        }
      }
    }

    // Update generating state — only call setState when the value actually changes
    // to avoid triggering React reconciliation on every animation frame.
    const isStillGenerating = tileQueueRef.current.length > 0;
    if (isGeneratingRef.current !== isStillGenerating) {
      isGeneratingRef.current = isStillGenerating;
      setIsGenerating(isStillGenerating);
    }
  }, [
    getCameraTile,
    isInBounds,
    getTileKey,
    generateTile,
    unloadTile,
    tileResolution,
  ]);

  // Create a fresh OrbitControls synced to the current camera position.
  // Called from the animation loop AFTER pointer-lock events have settled.
  //
  // IMPORTANT: OrbitControls constructor internally calls this.update() with
  // target=(0,0,0), which calls camera.lookAt(0,0,0) and CORRUPTS the camera
  // rotation. We save camera state before construction and restore it after.
  const createOrbitControls = useCallback(() => {
    const cam = cameraRef.current;
    const container = containerRef.current;
    if (!cam || !container) return;

    // Dispose any existing controls (safety — should already be null)
    if (orbitControlsRef.current) {
      orbitControlsRef.current.dispose();
    }

    // --- Save camera state BEFORE OrbitControls constructor corrupts it ---
    const savedPos = cameraStateRef.current.position.clone();
    const savedEuler = cameraStateRef.current.euler.clone();
    const savedQuat = new THREE.Quaternion().setFromEuler(savedEuler);

    // Constructor calls update() → lookAt(0,0,0) → corrupts camera rotation
    const controls = new OrbitControls(cam, container);

    // --- Restore camera state that constructor corrupted ---
    cam.position.copy(savedPos);
    cam.quaternion.copy(savedQuat);

    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.screenSpacePanning = true;
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: -1 as THREE.MOUSE, // RMB handled manually for fly mode
    };

    // Orbit target = 200 units in front of where camera was looking
    const dir = new THREE.Vector3(0, 0, -1).applyEuler(savedEuler);
    controls.target.copy(savedPos).add(dir.multiplyScalar(200));

    // Compute safe maxPolarAngle that accommodates current camera angle.
    // Without this, update() would clamp phi and snap the camera upward.
    const offset = new THREE.Vector3().subVectors(savedPos, controls.target);
    const spherical = new THREE.Spherical().setFromVector3(offset);
    const currentPhi = spherical.phi;
    controls.maxPolarAngle = Math.max(Math.PI / 2 - 0.05, currentPhi + 0.1);

    // No distance constraints yet — let first update() sync internal state
    controls.update();

    // Force-restore camera one final time as safety net against update() drift
    cam.position.copy(savedPos);
    cam.quaternion.copy(savedQuat);

    // Now apply constraints for future user interactions
    controls.minDistance = 20;
    controls.maxDistance = 3000;

    orbitControlsRef.current = controls;
  }, []);

  // Handle camera updates — fly mode (pointer lock) or orbit controls
  const updateCamera = useCallback(
    (deltaTime: number) => {
      const camera = cameraRef.current;
      const state = cameraStateRef.current;
      const keys = keysRef.current;
      const controls = orbitControlsRef.current;

      if (!camera) return;

      if (rmbFlyActiveRef.current) {
        // Fly mode: WASD + Q/E movement (UE5-style)
        const forward = new THREE.Vector3(0, 0, -1).applyEuler(state.euler);
        const right = new THREE.Vector3(1, 0, 0).applyEuler(state.euler);
        const up = new THREE.Vector3(0, 1, 0);

        const targetVelocity = new THREE.Vector3();

        if (keys.has("KeyW") || keys.has("ArrowUp")) {
          targetVelocity.add(forward);
        }
        if (keys.has("KeyS") || keys.has("ArrowDown")) {
          targetVelocity.sub(forward);
        }
        if (keys.has("KeyA") || keys.has("ArrowLeft")) {
          targetVelocity.sub(right);
        }
        if (keys.has("KeyD") || keys.has("ArrowRight")) {
          targetVelocity.add(right);
        }
        if (keys.has("Space") || keys.has("KeyE")) {
          targetVelocity.add(up);
        }
        if (
          keys.has("ShiftLeft") ||
          keys.has("ShiftRight") ||
          keys.has("KeyQ")
        ) {
          targetVelocity.sub(up);
        }

        if (targetVelocity.length() > 0) {
          targetVelocity.normalize().multiplyScalar(state.moveSpeed);
        }

        state.velocity.lerp(targetVelocity, 1 - Math.exp(-10 * deltaTime));
        state.position.add(state.velocity.clone().multiplyScalar(deltaTime));

        // Clamp to world bounds
        const worldSizeMeters = worldSize * tileSize;
        const margin = tileSize * 2;
        state.position.x = Math.max(
          -margin,
          Math.min(worldSizeMeters + margin, state.position.x),
        );
        state.position.z = Math.max(
          -margin,
          Math.min(worldSizeMeters + margin, state.position.z),
        );
        state.position.y = Math.max(10, Math.min(2000, state.position.y));

        camera.position.copy(state.position);
        camera.quaternion.setFromEuler(state.euler);
      } else if (pendingOrbitCreateRef.current > 0) {
        // Transition: camera holds perfectly still while pointer-lock
        // cursor-jump events settle. After enough frames, create OrbitControls.
        pendingOrbitCreateRef.current--;
        if (pendingOrbitCreateRef.current === 0) {
          createOrbitControls();
        }
      } else if (controls && controls.enabled) {
        // Orbit mode: OrbitControls drives the camera, sync state for tile loading.
        controls.update();
        state.position.copy(camera.position);
        state.euler.setFromQuaternion(camera.quaternion, "YXZ");
      }
    },
    [worldSize, tileSize, createOrbitControls],
  );

  // Shared fly-mode activation (called by hold timer OR drag threshold)
  const enterFlyMode = useCallback(() => {
    if (rmbFlyActiveRef.current) return;
    rmbFlyActiveRef.current = true;
    rmbDidFlyRef.current = true;
    // Skip first 2 mouse-move events — macOS pointer lock fires bogus movementY
    flySkipMovesRef.current = 2;

    // Sync euler from current camera orientation
    const cam = cameraRef.current;
    if (cam) {
      cameraStateRef.current.euler.setFromQuaternion(cam.quaternion, "YXZ");
      cameraStateRef.current.position.copy(cam.position);
    }

    // Destroy orbit controls entirely — when fly mode exits, a fresh instance
    // is created. This eliminates all stale internal state (damping inertia,
    // spherical deltas, pan offsets, event listener state).
    const controls = orbitControlsRef.current;
    if (controls) {
      controls.dispose();
      orbitControlsRef.current = null;
    }

    // Request pointer lock (transient activation from recent mousedown is valid ~5s)
    containerRef.current?.requestPointerLock();

    onFlyModeChange?.(true);
  }, [onFlyModeChange]);

  // Handle mouse movement for camera look + RMB drag threshold
  const handleMouseMove = useCallback(
    (event: MouseEvent) => {
      // Drag threshold to enter fly mode immediately (before hold timer fires)
      if (isRmbHeldRef.current && !rmbFlyActiveRef.current) {
        const dx = event.clientX - rmbStartPosRef.current.x;
        const dy = event.clientY - rmbStartPosRef.current.y;
        if (dx * dx + dy * dy > 100) {
          // Cancel hold timer (drag activated first)
          if (rmbHoldTimerRef.current) {
            clearTimeout(rmbHoldTimerRef.current);
            rmbHoldTimerRef.current = null;
          }
          enterFlyMode();
        }
        return;
      }

      if (!rmbFlyActiveRef.current) return;

      // Skip initial events after entering fly mode — macOS pointer lock
      // produces a bogus large movementY that snaps the camera downward
      if (flySkipMovesRef.current > 0) {
        flySkipMovesRef.current--;
        return;
      }

      const state = cameraStateRef.current;
      const movementX = event.movementX || 0;
      const movementY = event.movementY || 0;

      state.euler.y -= movementX * state.lookSpeed;
      state.euler.x -= movementY * state.lookSpeed;

      // Clamp vertical rotation
      state.euler.x = Math.max(
        -Math.PI / 2,
        Math.min(Math.PI / 2, state.euler.x),
      );
    },
    [enterFlyMode],
  );

  // Handle keyboard input
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      keysRef.current.add(event.code);

      // [ / ] keys adjust fly speed (trackpad-friendly alternative to scroll wheel)
      if (rmbFlyActiveRef.current) {
        if (event.code === "BracketLeft" || event.code === "BracketRight") {
          const factor = event.code === "BracketLeft" ? 0.8 : 1.25;
          const newSpeed = Math.max(
            20,
            Math.min(2000, cameraStateRef.current.moveSpeed * factor),
          );
          cameraStateRef.current.moveSpeed = newSpeed;
          onMoveSpeedChange?.(newSpeed);
        }
      }
    },
    [onMoveSpeedChange],
  );

  const handleKeyUp = useCallback((event: KeyboardEvent) => {
    keysRef.current.delete(event.code);
  }, []);

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

  // Handle RMB mousedown — start hold timer + drag tracking for fly mode
  // UE5 behavior: quick click = context menu, hold (~150ms) or drag = fly mode
  const handleMouseDown = useCallback(
    (event: MouseEvent) => {
      if (event.button === 2) {
        isRmbHeldRef.current = true;
        rmbDidFlyRef.current = false;
        rmbStartPosRef.current = { x: event.clientX, y: event.clientY };

        // Start hold timer — activates fly mode after 300ms even without mouse movement.
        // 300ms is long enough that a quick trackpad two-finger tap registers as a
        // right-click (context menu) rather than accidentally entering fly mode.
        rmbHoldTimerRef.current = setTimeout(() => {
          rmbHoldTimerRef.current = null;
          if (isRmbHeldRef.current) {
            enterFlyMode();
          }
        }, 300);
      }
    },
    [enterFlyMode],
  );

  // Handle RMB mouseup — exit fly mode or trigger context menu
  const handleMouseUp = useCallback(
    (event: MouseEvent) => {
      if (event.button === 2 && isRmbHeldRef.current) {
        // Cancel hold timer if it hasn't fired yet (quick click)
        if (rmbHoldTimerRef.current) {
          clearTimeout(rmbHoldTimerRef.current);
          rmbHoldTimerRef.current = null;
        }

        const wasFlying = rmbFlyActiveRef.current;
        isRmbHeldRef.current = false;
        rmbFlyActiveRef.current = false;

        // Zero out fly velocity so it doesn't bleed into orbit mode
        cameraStateRef.current.velocity.set(0, 0, 0);

        // Exit pointer lock if active
        if (document.pointerLockElement) {
          document.exitPointerLock();
        }

        if (wasFlying) {
          // Don't create OrbitControls now — pointer lock exit is async and
          // the browser will fire cursor-jump mousemove events. Defer creation
          // by 5 frames in the animation loop so all events settle first.
          // Camera holds perfectly still during those frames.
          pendingOrbitCreateRef.current = 5;

          onFlyModeChange?.(false);
        } else {
          // Quick click (no fly) — trigger custom context menu
          onViewportContextMenu?.(event.clientX, event.clientY);
        }
      }
    },
    [onFlyModeChange, onViewportContextMenu],
  );

  // Handle scroll wheel — speed adjustment during fly, zoom in orbit
  const handleWheel = useCallback(
    (event: WheelEvent) => {
      if (rmbFlyActiveRef.current) {
        // During fly: adjust moveSpeed (persists across sessions)
        event.preventDefault();
        const factor = event.deltaY > 0 ? 0.8 : 1.25; // 20% steps
        const newSpeed = Math.max(
          20,
          Math.min(2000, cameraStateRef.current.moveSpeed * factor),
        );
        cameraStateRef.current.moveSpeed = newSpeed;
        onMoveSpeedChange?.(newSpeed);
      }
      // In orbit mode: OrbitControls handles zoom automatically
    },
    [onMoveSpeedChange],
  );

  // Always suppress native + React contextmenu from the viewport.
  // On macOS, contextmenu fires on mousedown (before fly mode can activate).
  // Instead, quick-click context menu is triggered manually from handleMouseUp.
  const handleContextMenu = useCallback((event: MouseEvent) => {
    if (!containerRef.current?.contains(event.target as Node)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, []);

  const handlePointerLockChange = useCallback(() => {
    isPointerLockedRef.current =
      document.pointerLockElement === containerRef.current;

    // Handle unexpected pointer lock exit (e.g., user pressed Esc while RMB held)
    if (!isPointerLockedRef.current && rmbFlyActiveRef.current) {
      isRmbHeldRef.current = false;
      rmbFlyActiveRef.current = false;
      cameraStateRef.current.velocity.set(0, 0, 0);

      // Defer OrbitControls creation (same as handleMouseUp path)
      pendingOrbitCreateRef.current = 5;
      onFlyModeChange?.(false);
    }
  }, [onFlyModeChange]);

  // Initialize Three.js scene with WebGPU
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let mounted = true;

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
    const controls = new OrbitControls(camera, container);
    controls.target.set(worldCenter, 0, worldCenter);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.screenSpacePanning = true;
    controls.minDistance = 20;
    controls.maxDistance = 3000;
    controls.maxPolarAngle = Math.PI / 2 - 0.05; // Don't go below ground
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: -1 as THREE.MOUSE, // RMB handled manually for fly mode
    };
    controls.update();
    orbitControlsRef.current = controls;
    // Sync initial euler from orbit position
    cameraStateRef.current.euler.setFromQuaternion(camera.quaternion, "YXZ");

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
    vegetationContainer.visible = showVegetation;
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
    scene.add(skullSprite);

    // Store reference for cleanup (use group as main reference)
    wildernessOverlayRef.current = wildernessGroup as unknown as THREE.Mesh;
    // Store skull for animation
    (
      wildernessGroup as THREE.Group & { skullSprite?: THREE.Sprite }
    ).skullSprite = skullSprite;

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffffff, 1.0);
    sun.position.set(1000, 2000, 1000);
    // Skip shadow casting entirely in World Studio (shadows disabled on renderer)
    sun.castShadow = !hideBuiltinOverlays;
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
    const generator = new TerrainGenerator(terrainConfig);
    generatorRef.current = generator;

    // Build the terrain querier — game pipeline uses exact game algorithm,
    // procgen pipeline wraps TerrainGenerator.queryPoint
    if (config.useGamePipeline) {
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
      seed: config.seed,
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
    if (config.useGamePipeline) {
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

          // Cone marker pointing down
          const coneGeometry = new THREE.ConeGeometry(20, 50, 8);
          const coneMaterial = new MeshBasicNodeMaterial();
          coneMaterial.color = new THREE.Color(color);
          const marker = new THREE.Mesh(coneGeometry, coneMaterial);
          marker.position.set(markerX, markerY + 60, markerZ);
          marker.rotation.x = Math.PI;
          marker.userData = townUserData;
          townMarkers.add(marker);
          selectableObjectsRef.current.push(marker);

          // Safe zone ring
          const ringGeometry = new THREE.RingGeometry(
            town.safeZoneRadius - 5,
            town.safeZoneRadius,
            48,
          );
          const ringMaterial = new MeshBasicNodeMaterial();
          ringMaterial.color = new THREE.Color(color);
          ringMaterial.side = THREE.DoubleSide;
          ringMaterial.transparent = true;
          ringMaterial.opacity = 0.4;
          const ring = new THREE.Mesh(ringGeometry, ringMaterial);
          ring.rotation.x = -Math.PI / 2;
          ring.position.set(markerX, markerY + 2, markerZ);
          ring.userData = townUserData;
          townMarkers.add(ring);
          selectableObjectsRef.current.push(ring);

          // Town center pillar
          const pillarGeometry = new THREE.CylinderGeometry(3, 3, 30, 8);
          const pillarMaterial = new TownBasicMat();
          pillarMaterial.color = new THREE.Color(0xffffff);
          const pillar = new THREE.Mesh(pillarGeometry, pillarMaterial);
          pillar.position.set(markerX, markerY + 15, markerZ);
          pillar.userData = townUserData;
          townMarkers.add(pillar);
          selectableObjectsRef.current.push(pillar);

          // Internal roads — use flattened centerHeight for Y
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
              const roadLineMat = new TownLineMat();
              roadLineMat.color = new THREE.Color(0.45, 0.32, 0.18);
              roadLineMat.linewidth = 2;
              townMarkers.add(new THREE.Line(roadGeometry, roadLineMat));
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
            lodObjectsRef.current.push(buildingLOD);

            // LOD 0: Procedural building
            let fullDetailMesh: THREE.Object3D | null = null;
            const buildingGen = new BuildingGenerator();
            const generatedBuilding = buildingGen.generate(
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
              const detailMaterial = new TownStdMat();
              detailMaterial.color = new THREE.Color(0xd4a373);
              detailMaterial.roughness = 0.7;
              detailMaterial.metalness = 0.1;
              fullDetailMesh = new THREE.Mesh(detailGeometry, detailMaterial);
              fullDetailMesh.position.y = buildingHeight / 2;
              fullDetailMesh.castShadow = true;
              fullDetailMesh.receiveShadow = true;
            }

            // LOD 1: Simple box
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

            // LOD 2: Far box
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
            townMarkers.add(buildingLOD);
            selectableObjectsRef.current.push(buildingLOD);
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
              const landmarkMat = new TownStdMat();
              landmarkMat.color = new THREE.Color(color2);
              landmarkMat.roughness = 0.7;
              const landmarkMesh = new THREE.Mesh(landmarkGeo, landmarkMat);
              landmarkMesh.position.set(lx, ly + height / 2, lz);
              landmarkMesh.rotation.y = landmark.rotation;
              landmarkMesh.castShadow = true;
              landmarkMesh.receiveShadow = true;
              townMarkers.add(landmarkMesh);
            }
          }
        }

        // ---- Render inter-town roads from server BFS pathfinding ----
        if (layout.roads.length > 0) {
          const ribbonMat = new MeshBasicNodeMaterial();
          ribbonMat.vertexColors = true;
          ribbonMat.side = THREE.DoubleSide;

          for (const road of layout.roads) {
            if (road.path.length < 2) continue;

            const roadPoints: THREE.Vector3[] = road.path.map((point) => {
              const y = getHeight(point.x, point.z) + 0.15;
              return new THREE.Vector3(
                point.x + worldCenterOffset,
                y,
                point.z + worldCenterOffset,
              );
            });

            const roadWidth = road.isMainRoad ? road.width * 1.2 : road.width;
            const roadGeometry = createRoadRibbonGeometry(
              roadPoints,
              roadWidth / 2,
              !!road.isMainRoad,
            );
            const roadMesh = new THREE.Mesh(roadGeometry, ribbonMat);
            roadMesh.userData = {
              selectable: true,
              selectableType: "road",
              selectableId: road.id,
              connectedTowns: [road.fromTownId, road.toTownId],
              isMainRoad: road.isMainRoad,
            };
            townMarkers.add(roadMesh);
            selectableObjectsRef.current.push(roadMesh);
          }

          console.log(
            `[TileBasedTerrain] Created ${layout.roads.length} roads from server BFS pathfinding`,
          );
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
        seed: config.seed,
        config: {
          townCount: townCfg.townCount,
          worldSize: worldSizeMeters,
          minTownSpacing: scaledMinSpacing,
          waterThreshold: waterThreshold,
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

        // Cone marker pointing down at town location (main selectable element)
        const coneGeometry = new THREE.ConeGeometry(20, 50, 8);
        const coneMaterial = new MeshBasicNodeMaterial();
        coneMaterial.color = new THREE.Color(color);
        const marker = new THREE.Mesh(coneGeometry, coneMaterial);
        marker.position.set(markerX, markerY + 60, markerZ);
        marker.rotation.x = Math.PI; // Point downward
        marker.userData = townUserData;
        townMarkers.add(marker);
        selectableObjectsRef.current.push(marker);

        // Safe zone ring around town (also selectable as town)
        const ringGeometry = new THREE.RingGeometry(
          town.safeZoneRadius - 5,
          town.safeZoneRadius,
          48,
        );
        const ringMaterial = new MeshBasicNodeMaterial();
        ringMaterial.color = new THREE.Color(color);
        ringMaterial.side = THREE.DoubleSide;
        ringMaterial.transparent = true;
        ringMaterial.opacity = 0.4;
        const ring = new THREE.Mesh(ringGeometry, ringMaterial);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(markerX, markerY + 2, markerZ);
        ring.userData = townUserData;
        townMarkers.add(ring);
        selectableObjectsRef.current.push(ring);

        // Town center marker (small pillar) - also selectable
        const pillarGeometry = new THREE.CylinderGeometry(3, 3, 30, 8);
        const pillarMaterial = new TownBasicMat();
        pillarMaterial.color = new THREE.Color(0xffffff);
        const pillar = new THREE.Mesh(pillarGeometry, pillarMaterial);
        pillar.position.set(markerX, markerY + 15, markerZ);
        pillar.userData = townUserData;
        townMarkers.add(pillar);
        selectableObjectsRef.current.push(pillar);

        // Draw internal roads if available
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
            const roadLineMat = new TownLineMat();
            // Match terrain dirt color for town internal roads
            roadLineMat.color = new THREE.Color(0.45, 0.32, 0.18); // dirtBrown
            roadLineMat.linewidth = 2;
            const roadLine = new THREE.Line(roadGeometry, roadLineMat);
            townMarkers.add(roadLine);
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
          lodObjectsRef.current.push(buildingLOD);

          // LOD 0: Full detail - try to generate procedural building
          let fullDetailMesh: THREE.Object3D | null = null;
          const buildingGen = new BuildingGenerator();
          const generatedBuilding = buildingGen.generate(
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

          townMarkers.add(buildingLOD);
          selectableObjectsRef.current.push(buildingLOD);
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
            townMarkers.add(landmarkMesh);
          }
        }
      }

      // Generate roads using actual road network data
      const roadsToRender = providedRoadsRef.current;
      if (roadsToRender && roadsToRender.length > 0) {
        // Use pre-generated road network with actual pathfinding data
        // Flat ribbon geometry matching the game's dirt-path look
        const ribbonMat = new MeshBasicNodeMaterial();
        ribbonMat.vertexColors = true;
        ribbonMat.side = THREE.DoubleSide;

        for (const road of roadsToRender) {
          if (road.path.length < 2) continue;

          // Convert road path points to THREE.Vector3 with terrain sampling
          const roadPoints: THREE.Vector3[] = road.path.map((point) => {
            // Get actual terrain height at this point, or use provided y
            const y =
              point.y !== undefined
                ? point.y
                : generator.getHeightAt(point.x, point.z) + 0.15;
            return new THREE.Vector3(
              point.x + worldCenterOffset,
              y,
              point.z + worldCenterOffset,
            );
          });

          const roadWidth = road.isMainRoad
            ? (road.width || 4) * 1.2
            : road.width || 4;

          const roadGeometry = createRoadRibbonGeometry(
            roadPoints,
            roadWidth / 2,
            !!road.isMainRoad,
          );
          const roadMesh = new THREE.Mesh(roadGeometry, ribbonMat);
          roadMesh.userData = {
            selectable: true,
            selectableType: "road",
            selectableId: road.id,
            connectedTowns: road.connectedTowns,
            isMainRoad: road.isMainRoad,
          };

          townMarkers.add(roadMesh);
          selectableObjectsRef.current.push(roadMesh);
        }

        console.log(
          `[TileBasedTerrain] Created ${roadsToRender.length} roads from road network data`,
        );
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
        // Fallback: Generate simple MST-like roads for preview when no road data is provided
        console.warn(
          "[TileBasedTerrain] No road network data provided, using simplified preview roads",
        );

        // Flat ribbon material for fallback roads
        const ribbonMat = new MeshBasicNodeMaterial();
        ribbonMat.vertexColors = true;
        ribbonMat.side = THREE.DoubleSide;

        // Create simple road connections between nearby towns
        const connectedPairs = new Set<string>();
        const sortedTowns = [...townResult.towns];

        for (let i = 0; i < sortedTowns.length; i++) {
          const town1 = sortedTowns[i];
          // Connect to nearest 2 towns not already connected
          const distances = sortedTowns
            .map((town2, j) => ({
              town2,
              index: j,
              dist: Math.sqrt(
                (town2.position.x - town1.position.x) ** 2 +
                  (town2.position.z - town1.position.z) ** 2,
              ),
            }))
            .filter((d) => d.index !== i)
            .sort((a, b) => a.dist - b.dist);

          for (const { town2, index } of distances.slice(0, 2)) {
            const pairKey = [Math.min(i, index), Math.max(i, index)].join("-");
            if (connectedPairs.has(pairKey)) continue;
            connectedPairs.add(pairKey);

            // Create road path between towns
            const roadPoints: THREE.Vector3[] = [];
            const steps = 20;

            for (let s = 0; s <= steps; s++) {
              const t = s / steps;
              const x =
                town1.position.x + (town2.position.x - town1.position.x) * t;
              const z =
                town1.position.z + (town2.position.z - town1.position.z) * t;
              const y = generator.getHeightAt(x, z) + 0.15;

              roadPoints.push(
                new THREE.Vector3(
                  x + worldCenterOffset,
                  y,
                  z + worldCenterOffset,
                ),
              );
            }

            if (roadPoints.length >= 2) {
              const roadGeometry = createRoadRibbonGeometry(
                roadPoints,
                2, // halfWidth = 2m (4m total)
                false,
              );
              const roadMesh = new THREE.Mesh(roadGeometry, ribbonMat);
              townMarkers.add(roadMesh);
            }
          }
        }

        console.log(
          `[TileBasedTerrain] Created ${connectedPairs.size} fallback road connections`,
        );
        setRoadCount(connectedPairs.size);

        // Populate minimap roads data (simplified straight lines)
        const minimapRoadData: Array<{
          path: Array<{ x: number; z: number }>;
        }> = [];
        const sortedTownsForRoads = [...townResult.towns];
        const processedPairs = new Set<string>();

        for (let i = 0; i < sortedTownsForRoads.length; i++) {
          const town1 = sortedTownsForRoads[i];
          const distances = sortedTownsForRoads
            .map((town2, j) => ({
              town2,
              index: j,
              dist: Math.sqrt(
                (town2.position.x - town1.position.x) ** 2 +
                  (town2.position.z - town1.position.z) ** 2,
              ),
            }))
            .filter((d) => d.index !== i)
            .sort((a, b) => a.dist - b.dist);

          for (const { town2, index } of distances.slice(0, 2)) {
            const pairKey = [Math.min(i, index), Math.max(i, index)].join("-");
            if (processedPairs.has(pairKey)) continue;
            processedPairs.add(pairKey);

            minimapRoadData.push({
              path: [
                {
                  x: town1.position.x + worldCenterOffset,
                  z: town1.position.z + worldCenterOffset,
                },
                {
                  x: town2.position.x + worldCenterOffset,
                  z: town2.position.z + worldCenterOffset,
                },
              ],
            });
          }
        }
        setMinimapRoads(minimapRoadData);
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
        }
        vegetationSpeciesMapRef.current.clear();
      }

      // ---- Generate trees CLIENT-SIDE using editor's terrain querier ----
      // The server's GameWorldContext uses a different terrain implementation
      // that produces different biome/height maps. Generating locally with
      // terrainQuerierRef guarantees trees match the terrain the user sees.
      const initQuerier = terrainQuerierRef.current;
      const initSeed = config.seed;
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
            const cx = tx * GAME_TILE_SIZE + GAME_TILE_SIZE / 2;
            const cz = tz * GAME_TILE_SIZE + GAME_TILE_SIZE / 2;
            const tq = initQuerier(cx, cz);
            // Use threshold-based biome so tree species only appear on ground
            // that clearly reads as their biome (prevents maples on grey ground)
            const tileBiome = _getVisualBiomeForTrees(tq);
            const tc = getTreeConfigForBiome(tileBiome);
            if (!tc.enabled || tc.density <= 0) continue;

            const rCtx: ResourceGenerationContext = {
              tileX: tx,
              tileZ: tz,
              tileKey: `${tx}_${tz}`,
              tileSize: GAME_TILE_SIZE,
              waterThreshold: GAME_WATER_THRESHOLD,
              getHeightAt: (wx, wz) => initQuerier(wx, wz).height,
              // Per-position threshold biome — requires clear dominance before
              // using biome-exclusive species (prevents maples on grey ground)
              getDominantBiome: (wx, wz) =>
                _getVisualBiomeForTrees(initQuerier(wx, wz)),
              createRng: (salt) => _createTileRng(initSeed, tx, tz, salt),
            };

            const genResult = generateTrees(rCtx, tc);
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
      const maxPerSpecies = 20000;
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
        const data = getTreeSpeciesInstance(id);
        if (!data || data.parts.length === 0) continue;

        const meshes = data.parts.map((part) => {
          const im = new THREE.InstancedMesh(
            part.geometry,
            part.material,
            maxPerSpecies,
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
        if (!speciesData || speciesData.count >= maxPerSpecies) continue;

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

      // Finalize instance counts and add to scene
      vegetationSpeciesMapRef.current.clear();
      for (const [speciesId, data] of speciesInstanceData) {
        for (const im of data.meshes) {
          im.count = data.count;
          im.instanceMatrix.needsUpdate = true;
          vegetationContainer.add(im);
          // Register for vegetation instance selection
          vegetationSpeciesMapRef.current.set(im, speciesId);
        }
      }

      // Track vegetation positions for external consumers (auto-gen, debug panel)
      vegetationPositionsRef.current = initTrees.map((t) => ({
        x: t.x,
        z: t.z,
      }));

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
    if (config.useGamePipeline) {
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
        createGameWorldEntities(worldCenterOffset, getH, waterThreshold).then(
          (result) => {
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
          },
        );
      }
    }

    // Event listeners
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("keyup", handleKeyUp);
    document.addEventListener("pointerlockchange", handlePointerLockChange);
    document.addEventListener("mouseup", handleMouseUp);
    container.addEventListener("click", handleClick);
    container.addEventListener("mousedown", handleMouseDown);
    container.addEventListener("wheel", handleWheel, { passive: false });
    document.addEventListener("contextmenu", handleContextMenu, true);

    // Async WebGPU renderer initialization
    const initRenderer = async () => {
      const renderer = await createWebGPURenderer({
        // Disable antialiasing in World Studio for better FPS
        antialias: !hideBuiltinOverlays,
        alpha: true,
      });

      if (!mounted) {
        renderer.dispose();
        return;
      }

      // World Studio: cap pixel ratio at 1 and disable shadows for FPS
      // (editors don't need Retina resolution or shadow maps)
      const maxPixelRatio = hideBuiltinOverlays
        ? 1
        : Math.min(window.devicePixelRatio, 2);
      renderer.setPixelRatio(maxPixelRatio);
      // Guard against zero-size container (can happen during mount before layout)
      const w = container.clientWidth || 1;
      const h = container.clientHeight || 1;
      renderer.setSize(w, h);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.shadowMap.enabled = !hideBuiltinOverlays;
      if (renderer.shadowMap.enabled) {
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      }
      container.appendChild(renderer.domElement);
      rendererRef.current = renderer;

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

          // Dispose existing vegetation InstancedMeshes (keep GLB model cache)
          const toRemove = [...vegContainer.children];
          for (const child of toRemove) {
            vegContainer.remove(child);
            if (
              child instanceof THREE.InstancedMesh ||
              child instanceof THREE.Mesh
            ) {
              // Don't dispose geometry/material — they're shared from the species cache
            }
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
                // Get dominant biome at tile center (matches game's approach)
                const tileCenterX = tileX * editorTileSize + editorTileSize / 2;
                const tileCenterZ = tileZ * editorTileSize + editorTileSize / 2;
                const tileQuery = querier(tileCenterX, tileCenterZ);
                const tileBiome = _getVisualBiomeForTrees(tileQuery);
                const treeConfig = getTreeConfigForBiome(tileBiome);

                if (!treeConfig.enabled || treeConfig.density <= 0) continue;

                const resourceCtx: ResourceGenerationContext = {
                  tileX,
                  tileZ,
                  tileKey: `${tileX}_${tileZ}`,
                  tileSize: editorTileSize,
                  waterThreshold: editorWaterThreshold,
                  getHeightAt: (wx, wz) => querier(wx, wz).height,
                  getDominantBiome: (wx, wz) =>
                    _getVisualBiomeForTrees(querier(wx, wz)),
                  createRng: (salt) =>
                    _createTileRng(currentSeed, tileX, tileZ, salt),
                };

                const trees = generateTrees(resourceCtx, treeConfig);

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

          // Two-layer vegetation filtering:
          //   Layer 1 — Hard exclusions: buildings, roads, objects (binary, no noise)
          //   Layer 2 — Town gradient: smooth density ramp with FBM noise on the
          //             boundary for organic town-edge shapes + scale tapering
          //
          // Noise is ONLY on the town boundary, never on individual buildings.
          // Applying noise to building SDFs created random "survival pockets"
          // inside towns (noise pushed some trees above threshold → clusters).
          let trees = allTrees;
          if (exclusions) {
            const beforeCount = trees.length;

            // Pre-compute circle exclusions (squared radii for fast check)
            const circleSq = exclusions.circles.map((c) => ({
              x: c.x,
              z: c.z,
              rSq: c.radius * c.radius,
            }));

            // Pre-compute road segments (squared half-width)
            const roadSegs = exclusions.roads.flatMap((road) => {
              const segs: Array<{
                ax: number;
                az: number;
                abx: number;
                abz: number;
                abLenSq: number;
                hwSq: number;
              }> = [];
              for (let i = 0; i < road.path.length - 1; i++) {
                const a = road.path[i],
                  b = road.path[i + 1];
                const abx = b.x - a.x,
                  abz = b.z - a.z;
                const abLenSq = abx * abx + abz * abz;
                if (abLenSq < 0.001) continue;
                segs.push({
                  ax: a.x,
                  az: a.z,
                  abx,
                  abz,
                  abLenSq,
                  hwSq: road.halfWidth * road.halfWidth,
                });
              }
              return segs;
            });

            // Pre-compute town gradient parameters
            const townData = (exclusions.towns ?? []).map((t) => {
              const innerR = t.safeZoneRadius * _VEG_TOWN_INNER_FRAC;
              const outerR = t.safeZoneRadius * _VEG_TOWN_OUTER_FRAC;
              return {
                x: t.x,
                z: t.z,
                innerR,
                outerR,
                // Include noise amplitude in the outer check so we don't
                // skip trees that noise might push inside the gradient
                maxDSq: (outerR + _VEG_NOISE_AMP) * (outerR + _VEG_NOISE_AMP),
              };
            });

            trees = trees.filter((tree) => {
              // ---- Layer 1: Hard exclusions (binary, no noise) ----
              // Buildings, resources, plazas — precise cutouts hidden by meshes.
              for (let i = 0; i < circleSq.length; i++) {
                const c = circleSq[i];
                const dx = tree.x - c.x,
                  dz = tree.z - c.z;
                if (dx * dx + dz * dz < c.rSq) return false;
              }

              // Roads — point-to-segment distance
              for (let i = 0; i < roadSegs.length; i++) {
                const seg = roadSegs[i];
                const apx = tree.x - seg.ax,
                  apz = tree.z - seg.az;
                const t = Math.max(
                  0,
                  Math.min(1, (apx * seg.abx + apz * seg.abz) / seg.abLenSq),
                );
                const px = seg.ax + t * seg.abx - tree.x;
                const pz = seg.az + t * seg.abz - tree.z;
                if (px * px + pz * pz < seg.hwSq) return false;
              }

              // ---- Layer 2: Town density gradient (the only probabilistic layer) ----
              // Noise distorts the TOWN boundary (not individual buildings),
              // creating organic shapes without random clusters inside town.
              let townDensity = 1.0;
              for (let i = 0; i < townData.length; i++) {
                const town = townData[i];
                const dx = tree.x - town.x,
                  dz = tree.z - town.z;
                const dSq = dx * dx + dz * dz;
                if (dSq > town.maxDSq) continue;

                const dist = Math.sqrt(dSq);
                // FBM noise wobbles the effective distance → organic boundary
                const noise =
                  (_vegFbm(tree.x * _VEG_NOISE_FREQ, tree.z * _VEG_NOISE_FREQ) -
                    0.5) *
                  2 *
                  _VEG_NOISE_AMP;
                const td = _vegSmoothstep(
                  town.innerR,
                  town.outerR,
                  dist + noise,
                );
                if (td < townDensity) townDensity = td;
              }

              // Probabilistic thinning — only when inside a town's gradient
              if (townDensity < 0.999) {
                // Deterministic roll seeded by position (same tree, same result)
                if (_vegRand(tree.x, tree.z) > townDensity) return false;

                // Scale tapering: survivors near town are smaller ("younger growth")
                // density=0 → minScale, density=1 → full scale
                tree.sc *=
                  _VEG_MIN_EDGE_SCALE + (1 - _VEG_MIN_EDGE_SCALE) * townDensity;
              }

              return true;
            });

            console.log(
              `[refreshVegetation] Filter: ${circleSq.length} circles, ` +
                `${roadSegs.length} road segs, ${townData.length} town gradients → ` +
                `${beforeCount} → ${trees.length} trees (removed ${beforeCount - trees.length})`,
            );
          }

          // Cache game-space positions so the auto-gen pipeline can avoid them
          vegetationPositionsRef.current = trees.map((t) => ({
            x: t.x,
            z: t.z,
          }));

          // Rebuild InstancedMeshes per species
          const maxPerSpecies = 20000;
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
            const data = getTreeSpeciesInstance(id);
            if (!data || data.parts.length === 0) continue;
            const meshes = data.parts.map((part) => {
              const im = new THREE.InstancedMesh(
                part.geometry,
                part.material,
                maxPerSpecies,
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
            if (!sd || sd.count >= maxPerSpecies) continue;

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

          // Finalize and add to scene
          for (const [speciesId, data] of speciesInstanceData) {
            for (const im of data.meshes) {
              im.count = data.count;
              im.instanceMatrix.needsUpdate = true;
              vegContainer.add(im);
              vegetationSpeciesMapRef.current.set(im, speciesId);
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

          // Clear existing town meshes + remove from selectables & LOD tracking
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
          }

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

            // Cone marker pointing down
            const coneGeo = new THREE.ConeGeometry(20, 50, 8);
            const coneMat = new MeshBasicNodeMaterial();
            coneMat.color = new THREE.Color(color);
            const cone = new THREE.Mesh(coneGeo, coneMat);
            cone.position.set(mx, my + 60, mz);
            cone.rotation.x = Math.PI;
            cone.userData = townUserData;
            townGroup.add(cone);
            selectableObjectsRef.current.push(cone);

            // Safe zone ring
            const ringGeo = new THREE.RingGeometry(
              town.safeZoneRadius - 5,
              town.safeZoneRadius,
              48,
            );
            const ringMat = new MeshBasicNodeMaterial();
            ringMat.color = new THREE.Color(color);
            ringMat.side = THREE.DoubleSide;
            ringMat.transparent = true;
            ringMat.opacity = 0.4;
            const ring = new THREE.Mesh(ringGeo, ringMat);
            ring.rotation.x = -Math.PI / 2;
            ring.position.set(mx, my + 2, mz);
            ring.userData = townUserData;
            townGroup.add(ring);
            selectableObjectsRef.current.push(ring);

            // Center pillar
            const pillarGeo = new THREE.CylinderGeometry(3, 3, 30, 8);
            const pillarMat = new TownBasicMat();
            pillarMat.color = new THREE.Color(0xffffff);
            const pillar = new THREE.Mesh(pillarGeo, pillarMat);
            pillar.position.set(mx, my + 15, mz);
            pillar.userData = townUserData;
            townGroup.add(pillar);
            selectableObjectsRef.current.push(pillar);

            // Internal roads — use flattened centerHeight for Y
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
                const roadLineMat = new TownLineMat();
                roadLineMat.color = new THREE.Color(0.45, 0.32, 0.18);
                roadLineMat.linewidth = 2;
                townGroup.add(new THREE.Line(roadGeo, roadLineMat));
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
              lodObjectsRef.current.push(buildingLOD);

              // LOD 0: Procedural building
              let fullDetailMesh: THREE.Object3D | null = null;
              const buildingGen = new BuildingGenerator();
              const generatedBuilding = buildingGen.generate(
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
                const detailMat = new TownStdMat();
                detailMat.color = new THREE.Color(0xd4a373);
                detailMat.roughness = 0.7;
                detailMat.metalness = 0.1;
                fullDetailMesh = new THREE.Mesh(detailGeo, detailMat);
                fullDetailMesh.position.y = buildingHeight / 2;
                fullDetailMesh.castShadow = true;
                fullDetailMesh.receiveShadow = true;
              }

              // LOD 1: Simple box
              const simpleGeo = new THREE.BoxGeometry(
                buildingWidth,
                buildingHeight,
                buildingDepth,
              );
              const simpleMat = new TownStdMat();
              simpleMat.color = new THREE.Color(0xd4a373);
              simpleMat.roughness = 0.9;
              const simpleMesh = new THREE.Mesh(simpleGeo, simpleMat);
              simpleMesh.position.y = buildingHeight / 2;
              simpleMesh.castShadow = false;
              simpleMesh.receiveShadow = true;

              // LOD 2: Far box
              const farGeo = new THREE.BoxGeometry(
                buildingWidth,
                buildingHeight,
                buildingDepth,
                1,
                1,
                1,
              );
              const farMat = new TownBasicMat();
              farMat.color = new THREE.Color(0xc9a577);
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
              townGroup.add(buildingLOD);
              selectableObjectsRef.current.push(buildingLOD);
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
                const landmarkMat = new TownStdMat();
                landmarkMat.color = new THREE.Color(landmarkColor);
                landmarkMat.roughness = 0.7;
                const landmarkMesh = new THREE.Mesh(landmarkGeo, landmarkMat);
                landmarkMesh.position.set(lx, ly + height / 2, lz);
                landmarkMesh.rotation.y = landmark.rotation;
                landmarkMesh.castShadow = true;
                landmarkMesh.receiveShadow = true;
                townGroup.add(landmarkMesh);
              }
            }
          }

          // Update runtimeTowns ref so the pipeline sees them
          runtimeTownsRef.current = newTowns.map((t) => ({
            id: t.id,
            name: t.name,
            position: { ...t.position },
            size: t.size,
            safeZoneRadius: t.safeZoneRadius,
          }));

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
          }

          console.warn(
            `%c[refreshTownMarkers] DONE — Rendered ${newTowns.length} towns, townGroup now has ${townGroup.children.length} children`,
            "color: lime; font-weight: bold",
          );
        },
        setVegetationVisible: (visible: boolean) => {
          if (vegetationContainerRef.current) {
            vegetationContainerRef.current.visible = visible;
          }
        },
      });

      // Animation loop
      let lastTime = performance.now();
      // Track camera rotation for minimap (throttled updates)
      let lastRotationUpdate = 0;
      // Pre-allocated vector for label world position query (avoids GC)
      const _labelWorldPos = new THREE.Vector3();

      const animate = () => {
        if (!mounted) return;
        animationIdRef.current = requestAnimationFrame(animate);

        const now = performance.now();
        const deltaTime = Math.min((now - lastTime) / 1000, 0.1); // Cap delta
        lastTime = now;
        const elapsedSeconds = now / 1000;

        updateCamera(deltaTime);
        updateTiles();

        // Update LOD objects based on camera position
        for (const lod of lodObjectsRef.current) {
          lod.update(camera);
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
        if (!hideBuiltinOverlays && now - lastRotationUpdate > 100) {
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

        renderer.render(scene, camera);

        // Render ViewHelper orientation cube overlay
        // ViewHelper types expect WebGLRenderer but work with WebGPURenderer at runtime
        if (viewHelperRef.current) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          viewHelperRef.current.render(renderer as any);
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
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("keyup", handleKeyUp);
      document.removeEventListener(
        "pointerlockchange",
        handlePointerLockChange,
      );
      document.removeEventListener("mouseup", handleMouseUp);
      container.removeEventListener("click", handleClick);
      container.removeEventListener("mousedown", handleMouseDown);
      container.removeEventListener("wheel", handleWheel);
      document.removeEventListener("contextmenu", handleContextMenu, true);

      cancelAnimationFrame(currentAnimationId.current);

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
    terrainConfig,
    worldSize,
    tileSize,
    tileResolution,
    waterThreshold,
    config.seed,
    config.useGamePipeline,
    // config.towns and providedRoads read from refs to avoid full scene rebuild
    handleMouseMove,
    handleKeyDown,
    handleKeyUp,
    handlePointerLockChange,
    handleClick,
    handleMouseDown,
    handleMouseUp,
    handleWheel,
    handleContextMenu,
    updateCamera,
    updateTiles,
    showVegetation,
  ]);

  // Regenerate terrain when config changes
  useEffect(() => {
    // Clear existing tiles
    for (const key of tilesRef.current.keys()) {
      unloadTile(key);
    }
    tileQueueRef.current = [];
    tileQueueSetRef.current.clear();

    // Update generator and querier
    const newGenerator = new TerrainGenerator(terrainConfig);
    generatorRef.current = newGenerator;

    if (config.useGamePipeline) {
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
  }, [
    terrainConfig,
    tileSize,
    tileResolution,
    unloadTile,
    config.useGamePipeline,
    config.seed,
  ]);

  // Regenerate tiles when roads change to update road influence on terrain
  // This ensures road colors appear when roads are generated asynchronously
  const prevRoadsLengthRef = useRef<number | undefined>(undefined);
  const initialMountRef = useRef(true);
  useEffect(() => {
    const currentRoadsLength = providedRoads?.length ?? 0;
    const prevRoadsLength = prevRoadsLengthRef.current;

    // Skip on initial mount (tiles aren't loaded yet anyway)
    if (initialMountRef.current) {
      initialMountRef.current = false;
      prevRoadsLengthRef.current = currentRoadsLength;
      return;
    }

    // Check if roads actually changed (by length - simple heuristic)
    if (prevRoadsLength === currentRoadsLength) return;

    prevRoadsLengthRef.current = currentRoadsLength;

    // Regenerate tiles if any are loaded (to include road influence)
    if (tilesRef.current.size > 0) {
      console.log(
        `[TileBasedTerrain] Roads changed: ${prevRoadsLength ?? 0} -> ${currentRoadsLength} roads, regenerating ${tilesRef.current.size} tiles for road influence update`,
      );

      // Clear existing tiles to force regeneration with new road data
      for (const key of tilesRef.current.keys()) {
        unloadTile(key);
      }

      // Reset tile queue to trigger immediate regeneration
      tileQueueRef.current = [];
      tileQueueSetRef.current.clear();
    }
  }, [providedRoads, unloadTile]);

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
