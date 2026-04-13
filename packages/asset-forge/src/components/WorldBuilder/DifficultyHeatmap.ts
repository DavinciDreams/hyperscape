/**
 * DifficultyHeatmap — Terrain-conforming overlay showing difficulty gradient
 *
 * Replicates the exact difficulty calculation from TerrainSystem.getDifficultyAtWorldPosition()
 * so the editor shows what-you-see-is-what-you-get difficulty. Renders as semi-transparent
 * vertex-colored meshes that sit slightly above the terrain.
 *
 * The heatmap is tile-based — each terrain tile gets a matching low-resolution overlay
 * mesh that loads/unloads alongside the terrain tile.
 */

import * as THREE from "three/webgpu";
import { MeshBasicNodeMaterial } from "three/webgpu";
import { NoiseGenerator } from "@hyperscape/procgen/terrain";

// ============== DIFFICULTY CONSTANTS ==============
// Must match TerrainSystem.ts CONFIG values exactly

const DIFFICULTY_NOISE_SCALE = 0.0007;
const DIFFICULTY_NOISE_WEIGHT = 0.3;
const DIFFICULTY_CURVE_EXPONENT = 2.2;
const DIFFICULTY_TOWN_FALLOFF_RADIUS = 300;

// ============== TYPES ==============

export interface TownInfo {
  position: { x: number; z: number };
  safeZoneRadius: number;
}

export interface DangerSourceInfo {
  position: { x: number; z: number };
  radius: number;
  intensity: number; // 0-3, adds to biome difficulty
  falloffCurve: number;
}

export interface DifficultySample {
  level: number;
  scalar: number;
  biome: string;
  difficultyTier: number;
  isSafe: boolean;
}

export type BiomeQuerier = (
  worldX: number,
  worldZ: number,
) => {
  biome: string;
  height: number;
};

export type BiomeDifficultyLookup = (biomeId: string) => number;

// ============== BIOME DIFFICULTY FALLBACK ==============
// Game biome difficulties from biomes.json — used when the procgen BiomeSystem
// doesn't carry gameplay difficulty data (difficultyLevel defaults to 0).
const BIOME_DIFFICULTY_FALLBACK: Record<string, number> = {
  plains: 0,
  valley: 0,
  lakes: 0,
  forest: 1,
  swamp: 1,
  mountains: 2,
  desert: 2,
  canyon: 2,
  tundra: 3,
};

/** Wrap a getBiomeDifficulty callback with the game fallback map */
export function withBiomeDifficultyFallback(
  getBiomeDifficulty: BiomeDifficultyLookup,
): BiomeDifficultyLookup {
  return (biomeId: string) => {
    const val = getBiomeDifficulty(biomeId);
    if (val > 0) return val;
    return BIOME_DIFFICULTY_FALLBACK[biomeId] ?? 0;
  };
}

// ============== DIFFICULTY CALCULATION ==============

/**
 * Compute danger source influence at a position.
 * Returns an additive difficulty bonus (0 to max intensity).
 */
function computeDangerInfluence(
  worldX: number,
  worldZ: number,
  dangerSources: DangerSourceInfo[],
): number {
  let maxInfluence = 0;
  for (const ds of dangerSources) {
    const dx = worldX - ds.position.x;
    const dz = worldZ - ds.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist >= ds.radius) continue;
    // Smooth falloff from center (intensity) to edge (0)
    const t = dist / ds.radius;
    const influence = ds.intensity * Math.pow(1 - t, ds.falloffCurve);
    if (influence > maxInfluence) maxInfluence = influence;
  }
  return maxInfluence;
}

/**
 * Replicates TerrainSystem.getDifficultyAtWorldPosition() exactly,
 * extended with danger source influence overlay.
 */
function computeDifficulty(
  worldX: number,
  worldZ: number,
  biome: string,
  biomeDifficulty: number,
  noise: NoiseGenerator,
  towns: TownInfo[],
  dangerSources: DangerSourceInfo[] = [],
): DifficultySample {
  // Add danger source influence to biome difficulty
  const dangerBonus =
    dangerSources.length > 0
      ? computeDangerInfluence(worldX, worldZ, dangerSources)
      : 0;
  const difficultyTier = biomeDifficulty + dangerBonus;

  // Town falloff — distance from nearest town's safe zone edge
  let nearestTownDist: number | null = null;
  for (const town of towns) {
    const dx = worldX - town.position.x;
    const dz = worldZ - town.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const distFromEdge = Math.max(0, dist - town.safeZoneRadius);
    if (nearestTownDist === null || distFromEdge < nearestTownDist) {
      nearestTownDist = distFromEdge;
    }
  }

  const townFalloff =
    nearestTownDist === null
      ? 1
      : Math.min(
          1,
          Math.max(0, nearestTownDist / DIFFICULTY_TOWN_FALLOFF_RADIUS),
        );

  // Safe zone early exit (but danger sources can override safety)
  if (difficultyTier <= 0 || townFalloff <= 0) {
    return { level: 0, scalar: 0, biome, difficultyTier, isSafe: true };
  }

  // Blend biome difficulty with noise
  const baseScalar = Math.min(1, Math.max(0, difficultyTier / 3));
  const noiseValue = noise.simplex2D(
    worldX * DIFFICULTY_NOISE_SCALE,
    worldZ * DIFFICULTY_NOISE_SCALE,
  );
  const noiseNormalized = (noiseValue + 1) * 0.5;
  const blendedScalar =
    baseScalar * (1 - DIFFICULTY_NOISE_WEIGHT) +
    noiseNormalized * DIFFICULTY_NOISE_WEIGHT;

  // S-curve with town falloff
  const scalar = Math.min(
    1,
    Math.max(
      0,
      Math.pow(blendedScalar * townFalloff, DIFFICULTY_CURVE_EXPONENT),
    ),
  );

  const level = scalar <= 0 ? 0 : Math.max(1, Math.floor(1 + scalar * 999));

  return { level, scalar, biome, difficultyTier, isSafe: false };
}

// ============== ZONE-GENERATION DIFFICULTY (distance-primary) ==============
//
// Distance from town is the primary axis, biome is a modifier.
// This creates concentric difficulty rings from each town —
// every biome gets multiple tiers as you walk away from safety.
//
// Formula:
//   distanceScalar = clamp(distFromTownEdge / (worldRadius * 0.75), 0, 1)
//   biomeModifier  = 0.5 + (biomeDifficulty / 3) * 1.0   (range: 0.5 → 1.5)
//   scalar         = distanceScalar * biomeModifier + dangerBonus + noise
//
// Note: This is SEPARATE from the runtime combat difficulty (computeDifficulty above)
// which is biome-primary. Zone generation needs distance-primary so every biome
// gets multiple tiers. The heatmap can display either formula.

export interface ZoneDifficultySample {
  scalar: number;
  biome: string;
  isSafe: boolean;
}

export interface ZoneDifficultyConfig {
  /** Noise scale for organic zone boundary jitter. Default 0.0007 */
  noiseScale: number;
  /** Noise amplitude (±scalar jitter). Default 0.08 */
  noiseAmplitude: number;
  /** Fraction of world radius where scalar=1. Default 0.75 */
  worldRadiusFraction: number;
}

export const DEFAULT_ZONE_DIFFICULTY_CONFIG: ZoneDifficultyConfig = {
  noiseScale: 0.0007,
  noiseAmplitude: 0.08,
  worldRadiusFraction: 1.0,
};

/**
 * Zone-generation difficulty: distance from town is primary, biome is a modifier.
 *
 * @param biomeDifficulty  0-3 from biomes.json manifest (via getBiomeDifficulty callback)
 * @param worldRadius      Half the world size in meters
 * @param config           Tunable noise/scale parameters (from world-config.json)
 */
export function computeZoneDifficulty(
  worldX: number,
  worldZ: number,
  biome: string,
  biomeDifficulty: number,
  noise: NoiseGenerator,
  towns: TownInfo[],
  dangerSources: DangerSourceInfo[],
  worldRadius: number,
  config: ZoneDifficultyConfig = DEFAULT_ZONE_DIFFICULTY_CONFIG,
): ZoneDifficultySample {
  // Hard safe zone inside town radius
  for (const town of towns) {
    const dx = worldX - town.position.x;
    const dz = worldZ - town.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist <= town.safeZoneRadius) {
      return { scalar: 0, biome, isSafe: true };
    }
  }

  // Distance from nearest town edge (primary factor)
  let nearestDist = worldRadius * 2; // fallback for no towns
  for (const town of towns) {
    const dx = worldX - town.position.x;
    const dz = worldZ - town.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const distFromEdge = Math.max(0, dist - town.safeZoneRadius);
    if (distFromEdge < nearestDist) nearestDist = distFromEdge;
  }

  // Normalize: 0 at town edge, 1 at worldRadiusFraction of world radius
  const distanceScalar = Math.min(
    1,
    nearestDist / (worldRadius * config.worldRadiusFraction),
  );

  // Biome modifier: 0.8 (easy biomes, diff=0) → 1.2 (hard biomes, diff=3)
  // Distance is the primary driver; biome shifts the curve ±20%.
  // Narrow enough that easy biomes still reach High at the far edges,
  // while hard biomes get a boost but don't dominate the outer ring.
  const biomeModifier = 0.8 + (biomeDifficulty / 3) * 0.4;

  // Danger source additive bonus (capped at 0.3)
  const dangerBonus =
    dangerSources.length > 0
      ? Math.min(
          0.3,
          computeDangerInfluence(worldX, worldZ, dangerSources) * 0.15,
        )
      : 0;

  // Noise for organic boundary jitter
  const noiseVal = noise.simplex2D(
    worldX * config.noiseScale,
    worldZ * config.noiseScale,
  );
  const noiseMod = noiseVal * config.noiseAmplitude;

  // Combine
  const raw = distanceScalar * biomeModifier + dangerBonus + noiseMod;
  const scalar = Math.min(1, Math.max(0, raw));

  return { scalar, biome, isSafe: scalar < 0.01 };
}

// ============== COLOR MAPPING ==============

const COLOR_SAFE = new THREE.Color(0x4caf50); // Green
const COLOR_LOW = new THREE.Color(0xcddc39); // Yellow-green
const COLOR_MED = new THREE.Color(0xff9800); // Orange
const COLOR_HIGH = new THREE.Color(0xf44336); // Red
const COLOR_EXTREME = new THREE.Color(0x4a0000); // Dark red/black

/**
 * Map difficulty scalar (0-1) to a color.
 */
function difficultyToColor(scalar: number, target: THREE.Color): void {
  if (scalar <= 0) {
    target.copy(COLOR_SAFE);
  } else if (scalar < 0.25) {
    target.copy(COLOR_SAFE).lerp(COLOR_LOW, scalar / 0.25);
  } else if (scalar < 0.5) {
    target.copy(COLOR_LOW).lerp(COLOR_MED, (scalar - 0.25) / 0.25);
  } else if (scalar < 0.75) {
    target.copy(COLOR_MED).lerp(COLOR_HIGH, (scalar - 0.5) / 0.25);
  } else {
    target.copy(COLOR_HIGH).lerp(COLOR_EXTREME, (scalar - 0.75) / 0.25);
  }
}

// ============== HEATMAP TILE MESH ==============

/** Resolution of heatmap overlay per tile (lower = faster, higher = smoother) */
const HEATMAP_RESOLUTION = 16;
/** How far above terrain the overlay sits (prevents z-fighting) */
const HEATMAP_Y_OFFSET = 0.5;
/** Opacity of the overlay */
const HEATMAP_OPACITY = 0.35;

// Shared material for all heatmap tiles
let sharedMaterial: MeshBasicNodeMaterial | null = null;

function getHeatmapMaterial(): MeshBasicNodeMaterial {
  if (!sharedMaterial) {
    sharedMaterial = new MeshBasicNodeMaterial();
    sharedMaterial.transparent = true;
    sharedMaterial.opacity = HEATMAP_OPACITY;
    sharedMaterial.vertexColors = true;
    sharedMaterial.depthWrite = false;
    sharedMaterial.side = THREE.DoubleSide;
  }
  return sharedMaterial;
}

/**
 * Create a heatmap overlay mesh for a single terrain tile.
 *
 * @param tileX - Tile grid X coordinate
 * @param tileZ - Tile grid Z coordinate
 * @param tileSize - Size of tile in meters
 * @param worldCenterOffset - Half of total world size in meters
 * @param queryBiome - Function to get biome + height at world position
 * @param getBiomeDifficulty - Function to get difficulty level for a biome ID
 * @param noise - Noise generator (same seed as game)
 * @param towns - Array of town positions + safe zone radii
 * @param dangerSources - Array of danger source positions + radii
 */
function createHeatmapTile(
  tileX: number,
  tileZ: number,
  tileSize: number,
  worldCenterOffset: number,
  queryBiome: BiomeQuerier,
  getBiomeDifficulty: BiomeDifficultyLookup,
  noise: NoiseGenerator,
  towns: TownInfo[],
  dangerSources: DangerSourceInfo[] = [],
): THREE.Mesh {
  const res = HEATMAP_RESOLUTION;
  const segSize = tileSize / res;

  // Create geometry
  const positions = new Float32Array((res + 1) * (res + 1) * 3);
  const colors = new Float32Array((res + 1) * (res + 1) * 3);
  const indices: number[] = [];

  const color = new THREE.Color();

  for (let iz = 0; iz <= res; iz++) {
    for (let ix = 0; ix <= res; ix++) {
      const idx = iz * (res + 1) + ix;

      // Local position within tile
      const localX = ix * segSize;
      const localZ = iz * segSize;

      // World position (terrain generator coords, centered at origin)
      const worldX = localX + tileX * tileSize - worldCenterOffset;
      const worldZ = localZ + tileZ * tileSize - worldCenterOffset;

      // Query terrain for biome + height
      const query = queryBiome(worldX, worldZ);
      const biomeDiff = getBiomeDifficulty(query.biome);

      // Compute difficulty
      const sample = computeDifficulty(
        worldX,
        worldZ,
        query.biome,
        biomeDiff,
        noise,
        towns,
        dangerSources,
      );
      difficultyToColor(sample.scalar, color);

      // Position (tile-local, slightly above terrain)
      positions[idx * 3] = localX;
      positions[idx * 3 + 1] = query.height + HEATMAP_Y_OFFSET;
      positions[idx * 3 + 2] = localZ;

      // Vertex color
      colors[idx * 3] = color.r;
      colors[idx * 3 + 1] = color.g;
      colors[idx * 3 + 2] = color.b;
    }
  }

  // Build triangle indices
  for (let iz = 0; iz < res; iz++) {
    for (let ix = 0; ix < res; ix++) {
      const a = iz * (res + 1) + ix;
      const b = a + 1;
      const c = (iz + 1) * (res + 1) + ix;
      const d = c + 1;
      indices.push(a, c, b);
      indices.push(b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(indices);

  const mesh = new THREE.Mesh(geometry, getHeatmapMaterial());
  mesh.position.set(tileX * tileSize, 0, tileZ * tileSize);
  mesh.frustumCulled = true;
  mesh.name = `heatmap_${tileX}_${tileZ}`;
  mesh.userData.isHeatmap = true;
  // Don't receive raycasts
  mesh.raycast = () => {};

  return mesh;
}

// ============== HEATMAP MANAGER ==============

/**
 * Manages heatmap overlay tiles — creates/removes them alongside terrain tiles.
 */
export class DifficultyHeatmapManager {
  private readonly container: THREE.Group;
  private readonly tiles = new Map<string, THREE.Mesh>();
  private readonly noise: NoiseGenerator;
  private readonly queryBiome: BiomeQuerier;
  private readonly getBiomeDifficulty: BiomeDifficultyLookup;
  private readonly tileSize: number;
  private readonly worldCenterOffset: number;
  private towns: TownInfo[] = [];
  private dangerSources: DangerSourceInfo[] = [];
  private _visible = false;

  constructor(opts: {
    scene: THREE.Scene;
    seed: number;
    tileSize: number;
    worldCenterOffset: number;
    queryBiome: BiomeQuerier;
    getBiomeDifficulty: BiomeDifficultyLookup;
  }) {
    this.container = new THREE.Group();
    this.container.name = "difficulty_heatmap";
    this.container.visible = false;
    opts.scene.add(this.container);

    this.noise = new NoiseGenerator(opts.seed);
    this.queryBiome = opts.queryBiome;
    this.getBiomeDifficulty = withBiomeDifficultyFallback(
      opts.getBiomeDifficulty,
    );
    this.tileSize = opts.tileSize;
    this.worldCenterOffset = opts.worldCenterOffset;
  }

  get visible(): boolean {
    return this._visible;
  }

  setVisible(v: boolean): void {
    this._visible = v;
    this.container.visible = v;
  }

  setTowns(towns: TownInfo[]): void {
    this.towns = towns;
    if (this._visible && this.tiles.size > 0) {
      this.regenerateAll();
    }
  }

  setDangerSources(sources: DangerSourceInfo[]): void {
    this.dangerSources = sources;
    if (this._visible && this.tiles.size > 0) {
      this.regenerateAll();
    }
  }

  /**
   * Called when a terrain tile is loaded — create matching heatmap overlay.
   */
  onTileLoaded(tileX: number, tileZ: number): void {
    const key = `${tileX},${tileZ}`;
    if (this.tiles.has(key)) return;

    const mesh = createHeatmapTile(
      tileX,
      tileZ,
      this.tileSize,
      this.worldCenterOffset,
      this.queryBiome,
      this.getBiomeDifficulty,
      this.noise,
      this.towns,
      this.dangerSources,
    );
    this.tiles.set(key, mesh);
    this.container.add(mesh);
  }

  /**
   * Called when a terrain tile is unloaded — remove matching heatmap overlay.
   */
  onTileUnloaded(tileX: number, tileZ: number): void {
    const key = `${tileX},${tileZ}`;
    const mesh = this.tiles.get(key);
    if (mesh) {
      this.container.remove(mesh);
      mesh.geometry.dispose();
      this.tiles.delete(key);
    }
  }

  /**
   * Regenerate all existing heatmap tiles (e.g., after towns change).
   */
  private regenerateAll(): void {
    const keys = [...this.tiles.keys()];
    for (const key of keys) {
      const [tx, tz] = key.split(",").map(Number);
      this.onTileUnloaded(tx, tz);
      this.onTileLoaded(tx, tz);
    }
  }

  dispose(): void {
    for (const mesh of this.tiles.values()) {
      mesh.geometry.dispose();
    }
    this.tiles.clear();
    this.container.parent?.remove(this.container);
    sharedMaterial?.dispose();
    sharedMaterial = null;
  }
}
