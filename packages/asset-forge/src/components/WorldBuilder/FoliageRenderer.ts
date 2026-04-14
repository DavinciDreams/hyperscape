/**
 * FoliageRenderer — Per-tile GPU-instanced ground cover (grass, flowers, rocks)
 *
 * Generates foliage instances for each loaded terrain tile based on biome type,
 * terrain slope, and optional paint strokes. Uses InstancedMesh with simple
 * geometry (grass blades, flower crosses, rock meshes) for minimal draw calls.
 *
 * Architecture:
 * - Per-tile InstancedMesh batches (one per foliage category per tile)
 * - Camera-distance visibility culling (foliage hidden beyond FOLIAGE_VIEW_RADIUS)
 * - Biome-driven density presets (forest = dense, desert = sparse)
 * - Deterministic seeded placement for reproducibility
 * - Paint stroke overrides for manual density control
 *
 * Phase 7 of WORLD_STUDIO_MASTER_PLAN
 */

import * as THREE from "three/webgpu";
import { MeshStandardNodeMaterial } from "three/webgpu";

import type { TerrainQuerier } from "./terrainHelpers";
import type { FoliagePaintStroke } from "../WorldStudio/types";

// ============== CONSTANTS ==============

/** Maximum distance from camera at which foliage is visible (meters) */
const FOLIAGE_VIEW_RADIUS = 120;

/** Foliage is only generated for tiles within this radius of camera tile */
const FOLIAGE_TILE_RADIUS = 3;

/** Minimum terrain slope (radians) below which foliage can grow */
const MAX_SLOPE_FOR_FOLIAGE = 0.7; // ~40 degrees

/** Grass blade geometry segments */
const BLADE_SEGMENTS = 3; // 3 quads per blade

/** Minimum spacing between foliage instances (meters) */
const MIN_SPACING = 0.4;

// ============== BIOME FOLIAGE PRESETS ==============

export interface FoliagePreset {
  /** Grass instances per square meter */
  grassDensity: number;
  /** Flower instances per square meter */
  flowerDensity: number;
  /** Rock instances per square meter */
  rockDensity: number;
  /** Grass color (hex) */
  grassColor: number;
  /** Grass height range [min, max] meters */
  grassHeight: [number, number];
  /** Flower color palette (hex values) */
  flowerColors: number[];
}

export const BIOME_FOLIAGE_PRESETS: Record<string, FoliagePreset> = {
  plains: {
    grassDensity: 6,
    flowerDensity: 0.3,
    rockDensity: 0.02,
    grassColor: 0x5a9e2f,
    grassHeight: [0.2, 0.45],
    flowerColors: [0xf5d442, 0xe84393, 0xffffff, 0x6c5ce7],
  },
  forest: {
    grassDensity: 4,
    flowerDensity: 0.1,
    rockDensity: 0.05,
    grassColor: 0x3d7a1c,
    grassHeight: [0.15, 0.35],
    flowerColors: [0xffffff, 0xdfe6e9],
  },
  valley: {
    grassDensity: 5,
    flowerDensity: 0.4,
    rockDensity: 0.03,
    grassColor: 0x4d8c26,
    grassHeight: [0.2, 0.5],
    flowerColors: [0xf5d442, 0xe84393, 0x74b9ff, 0xffffff],
  },
  desert: {
    grassDensity: 0.3,
    flowerDensity: 0,
    rockDensity: 0.08,
    grassColor: 0xc4a84a,
    grassHeight: [0.1, 0.2],
    flowerColors: [],
  },
  tundra: {
    grassDensity: 1.5,
    flowerDensity: 0.05,
    rockDensity: 0.1,
    grassColor: 0x8a9c6a,
    grassHeight: [0.08, 0.15],
    flowerColors: [0xdfe6e9, 0xb2bec3],
  },
  swamp: {
    grassDensity: 3,
    flowerDensity: 0.05,
    rockDensity: 0.02,
    grassColor: 0x4a6b2a,
    grassHeight: [0.3, 0.6],
    flowerColors: [0x6c5ce7],
  },
  mountains: {
    grassDensity: 1,
    flowerDensity: 0.02,
    rockDensity: 0.15,
    grassColor: 0x7a8c5a,
    grassHeight: [0.08, 0.18],
    flowerColors: [0xdfe6e9],
  },
  lakes: {
    grassDensity: 0,
    flowerDensity: 0,
    rockDensity: 0,
    grassColor: 0x5a9e2f,
    grassHeight: [0.2, 0.4],
    flowerColors: [],
  },
  canyon: {
    grassDensity: 0.5,
    flowerDensity: 0,
    rockDensity: 0.12,
    grassColor: 0x9a8a5a,
    grassHeight: [0.1, 0.2],
    flowerColors: [],
  },
};

const DEFAULT_PRESET = BIOME_FOLIAGE_PRESETS.plains;

// ============== SEEDED RNG ==============

/** Simple LCG PRNG for deterministic placement */
function createLCG(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) | 0;
    return (s >>> 0) / 0x100000000;
  };
}

/** Hash two ints into a seed */
function hashTileCoord(x: number, z: number, salt: number): number {
  let h = (x * 73856093) ^ (z * 19349663) ^ salt;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 13), 0x45d9f3b);
  return (h ^ (h >>> 16)) >>> 0;
}

// ============== GEOMETRY FACTORIES ==============

/** Pre-allocated reusable math objects (no allocations in hot paths) */
const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _euler = new THREE.Euler();

/** Shared grass blade geometry — flat tapered quad strip */
let _grassGeometry: THREE.BufferGeometry | null = null;

function getGrassGeometry(): THREE.BufferGeometry {
  if (_grassGeometry) return _grassGeometry;

  const verts: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  // Tapered blade: wide at base, pointed at tip
  for (let seg = 0; seg <= BLADE_SEGMENTS; seg++) {
    const t = seg / BLADE_SEGMENTS;
    const width = 0.04 * (1 - t * 0.85); // Taper from 4cm to ~0.6cm
    const y = t; // Height 0 to 1 (scaled by instance)

    const vi = seg * 2;
    verts.push(-width, y, 0); // left
    verts.push(width, y, 0); // right
    uvs.push(0, t);
    uvs.push(1, t);

    if (seg < BLADE_SEGMENTS) {
      indices.push(vi, vi + 1, vi + 2);
      indices.push(vi + 1, vi + 3, vi + 2);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  geom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  _grassGeometry = geom;
  return geom;
}

/** Shared flower geometry — two crossed quads */
let _flowerGeometry: THREE.BufferGeometry | null = null;

function getFlowerGeometry(): THREE.BufferGeometry {
  if (_flowerGeometry) return _flowerGeometry;

  const s = 0.12; // Half-size of each quad (24cm total)
  const h = 0.15; // Height of center

  // Two crossed quads forming an X shape
  const verts = [
    // Quad 1 (along X)
    -s,
    0,
    0,
    s,
    0,
    0,
    s,
    h * 2,
    0,
    -s,
    h * 2,
    0,
    // Quad 2 (along Z)
    0,
    0,
    -s,
    0,
    0,
    s,
    0,
    h * 2,
    s,
    0,
    h * 2,
    -s,
  ];
  const uvs = [0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1];
  const indices = [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7];

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  geom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  _flowerGeometry = geom;
  return geom;
}

/** Shared rock geometry — low-poly irregular octahedron */
let _rockGeometry: THREE.BufferGeometry | null = null;

function getRockGeometry(): THREE.BufferGeometry {
  if (_rockGeometry) return _rockGeometry;

  // Slightly irregular icosahedron scaled down
  const geom = new THREE.IcosahedronGeometry(0.15, 0);
  // Flatten vertically for rock-like proportions
  const pos = geom.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, pos.getY(i) * 0.5);
    // Add slight randomness for organic look (deterministic via vertex index)
    const jitter = ((i * 7 + 3) % 11) / 110 - 0.05;
    pos.setX(i, pos.getX(i) + jitter);
    pos.setZ(i, pos.getZ(i) + jitter * 0.7);
  }
  pos.needsUpdate = true;
  geom.computeVertexNormals();
  _rockGeometry = geom;
  return geom;
}

// ============== MATERIALS ==============

/** Material cache — one per foliage type per color */
const _materialCache = new Map<string, THREE.Material>();

function getGrassMaterial(color: number): THREE.Material {
  const key = `grass_${color}`;
  let mat = _materialCache.get(key);
  if (!mat) {
    mat = new MeshStandardNodeMaterial({
      color,
      side: THREE.DoubleSide,
      transparent: true,
      alphaTest: 0.1,
    });
    _materialCache.set(key, mat);
  }
  return mat;
}

function getFlowerMaterial(color: number): THREE.Material {
  const key = `flower_${color}`;
  let mat = _materialCache.get(key);
  if (!mat) {
    mat = new MeshStandardNodeMaterial({
      color,
      side: THREE.DoubleSide,
    });
    _materialCache.set(key, mat);
  }
  return mat;
}

function getRockMaterial(): THREE.Material {
  const key = "rock";
  let mat = _materialCache.get(key);
  if (!mat) {
    mat = new MeshStandardNodeMaterial({
      color: 0x888888,
      roughness: 0.95,
      metalness: 0.0,
    });
    _materialCache.set(key, mat);
  }
  return mat;
}

// ============== FOLIAGE TILE DATA ==============

export interface FoliageTileData {
  tileX: number;
  tileZ: number;
  /** All InstancedMesh objects for this tile */
  meshes: THREE.InstancedMesh[];
}

// ============== TERRAIN SLOPE HELPER ==============

/**
 * Estimate terrain slope at a point via finite-difference gradient.
 * Returns slope angle in radians (0 = flat, PI/2 = vertical).
 */
function estimateSlope(
  querier: TerrainQuerier,
  worldX: number,
  worldZ: number,
  step: number = 1.0,
): number {
  const hC = querier(worldX, worldZ).height;
  const hX = querier(worldX + step, worldZ).height;
  const hZ = querier(worldX, worldZ + step).height;
  const dx = (hX - hC) / step;
  const dz = (hZ - hC) / step;
  return Math.atan(Math.sqrt(dx * dx + dz * dz));
}

// ============== CORE GENERATION ==============

export interface FoliageGenerateOptions {
  tileX: number;
  tileZ: number;
  tileSize: number;
  worldSeed: number;
  querier: TerrainQuerier;
  waterThreshold: number;
  /** Foliage paint stroke overrides (density multiplier per area) */
  foliagePaints?: FoliagePaintStroke[];
}

/** Brush influence falloff (matches brushApplication.ts) */
function brushInfluence(
  dist: number,
  radius: number,
  falloff: "sharp" | "linear" | "smooth",
): number {
  if (dist >= radius) return 0;
  const t = dist / radius;
  switch (falloff) {
    case "sharp":
      return t < 0.7 ? 1.0 : Math.max(0, (1 - t) / 0.3);
    case "linear":
      return 1 - t;
    case "smooth":
    default:
      return 1 - t * t * (3 - 2 * t);
  }
}

/**
 * Calculate foliage density multiplier from paint strokes at a world position.
 * Returns value in [0, 2]: 0 = fully suppressed, 1 = default, 2 = doubled.
 */
function getFoliageDensityMultiplier(
  worldX: number,
  worldZ: number,
  foliageType: string,
  strokes: FoliagePaintStroke[] | undefined,
): number {
  if (!strokes || strokes.length === 0) return 1;

  let multiplier = 1;
  for (let i = 0; i < strokes.length; i++) {
    const stroke = strokes[i];
    // Skip if stroke doesn't affect this foliage type
    if (
      stroke.foliageTypes.length > 0 &&
      !stroke.foliageTypes.includes(foliageType)
    ) {
      continue;
    }
    const dx = worldX - stroke.center.x;
    const dz = worldZ - stroke.center.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const influence =
      brushInfluence(dist, stroke.radius, stroke.falloff) * stroke.strength;
    if (influence <= 0) continue;

    if (stroke.mode === "add") {
      multiplier += influence;
    } else {
      multiplier -= influence;
    }
  }
  return Math.max(0, Math.min(2, multiplier));
}

/**
 * Generate foliage instances for a single terrain tile.
 * Returns arrays of position/rotation/scale data per foliage type.
 */
function generateTileFoliageData(opts: FoliageGenerateOptions): {
  grass: Array<{
    x: number;
    y: number;
    z: number;
    scale: number;
    rotation: number;
  }>;
  flowers: Array<{
    x: number;
    y: number;
    z: number;
    scale: number;
    rotation: number;
    colorIdx: number;
  }>;
  rocks: Array<{
    x: number;
    y: number;
    z: number;
    scale: number;
    rotation: number;
  }>;
} {
  const {
    tileX,
    tileZ,
    tileSize,
    worldSeed,
    querier,
    waterThreshold,
    foliagePaints,
  } = opts;

  const grass: Array<{
    x: number;
    y: number;
    z: number;
    scale: number;
    rotation: number;
  }> = [];
  const flowers: Array<{
    x: number;
    y: number;
    z: number;
    scale: number;
    rotation: number;
    colorIdx: number;
  }> = [];
  const rocks: Array<{
    x: number;
    y: number;
    z: number;
    scale: number;
    rotation: number;
  }> = [];

  const seed = hashTileCoord(tileX, tileZ, worldSeed);
  const rng = createLCG(seed);

  const worldX0 = tileX * tileSize;
  const worldZ0 = tileZ * tileSize;

  // Sample at sub-tile grid with jitter
  const step = MIN_SPACING;
  const cols = Math.ceil(tileSize / step);

  for (let gx = 0; gx < cols; gx++) {
    for (let gz = 0; gz < cols; gz++) {
      const baseX = worldX0 + gx * step;
      const baseZ = worldZ0 + gz * step;

      // Jitter position for organic distribution
      const wx = baseX + (rng() - 0.5) * step * 0.8;
      const wz = baseZ + (rng() - 0.5) * step * 0.8;

      // Query terrain at this point
      const query = querier(wx, wz);
      const height = query.height;

      // Skip underwater
      if (height < waterThreshold + 0.1) continue;

      // Skip steep slopes
      const slope = estimateSlope(querier, wx, wz, step);
      if (slope > MAX_SLOPE_FOR_FOLIAGE) continue;

      const biome = query.biome || "plains";
      const preset = BIOME_FOLIAGE_PRESETS[biome] || DEFAULT_PRESET;

      // Slope-based density reduction (gentle slopes get less foliage)
      const slopeFactor = 1 - (slope / MAX_SLOPE_FOR_FOLIAGE) * 0.7;

      // -- GRASS --
      const grassMult = getFoliageDensityMultiplier(
        wx,
        wz,
        "grass",
        foliagePaints,
      );
      const grassChance =
        preset.grassDensity * step * step * slopeFactor * grassMult;
      if (rng() < grassChance) {
        const [minH, maxH] = preset.grassHeight;
        const bladeHeight = minH + rng() * (maxH - minH);
        grass.push({
          x: wx,
          y: height,
          z: wz,
          scale: bladeHeight,
          rotation: rng() * Math.PI * 2,
        });
      }

      // -- FLOWERS --
      if (preset.flowerColors.length > 0) {
        const flowerMult = getFoliageDensityMultiplier(
          wx,
          wz,
          "flower",
          foliagePaints,
        );
        const flowerChance =
          preset.flowerDensity * step * step * slopeFactor * flowerMult;
        if (rng() < flowerChance) {
          flowers.push({
            x: wx,
            y: height,
            z: wz,
            scale: 0.6 + rng() * 0.8,
            rotation: rng() * Math.PI * 2,
            colorIdx: Math.floor(rng() * preset.flowerColors.length),
          });
        }
      }

      // -- ROCKS --
      const rockMult = getFoliageDensityMultiplier(
        wx,
        wz,
        "rock",
        foliagePaints,
      );
      const rockChance = preset.rockDensity * step * step * rockMult;
      if (rng() < rockChance) {
        rocks.push({
          x: wx,
          y: height - 0.03, // Sink slightly into ground
          z: wz,
          scale: 0.5 + rng() * 1.5,
          rotation: rng() * Math.PI * 2,
        });
      }
    }
  }

  return { grass, flowers, rocks };
}

// ============== INSTANCED MESH BUILDER ==============

/**
 * Build InstancedMesh objects for a tile's foliage data.
 * Returns array of InstancedMesh objects ready for scene addition.
 */
function buildFoliageMeshes(
  data: ReturnType<typeof generateTileFoliageData>,
  biome: string,
): THREE.InstancedMesh[] {
  const meshes: THREE.InstancedMesh[] = [];
  const preset = BIOME_FOLIAGE_PRESETS[biome] || DEFAULT_PRESET;

  // -- GRASS InstancedMesh --
  if (data.grass.length > 0) {
    const geom = getGrassGeometry();
    const mat = getGrassMaterial(preset.grassColor);
    const im = new THREE.InstancedMesh(geom, mat, data.grass.length);
    im.castShadow = false; // Grass doesn't cast shadows (performance)
    im.receiveShadow = true;
    im.frustumCulled = false; // Per-tile culling handles this

    for (let i = 0; i < data.grass.length; i++) {
      const g = data.grass[i];
      _position.set(g.x, g.y, g.z);
      _euler.set(0, g.rotation, 0);
      _quaternion.setFromEuler(_euler);
      _scale.set(1, g.scale, 1);
      _matrix.compose(_position, _quaternion, _scale);
      im.setMatrixAt(i, _matrix);
    }
    im.instanceMatrix.needsUpdate = true;
    im.userData._foliageType = "grass";
    meshes.push(im);
  }

  // -- FLOWER InstancedMeshes (one per color) --
  if (data.flowers.length > 0) {
    // Group by color index
    const byColor = new Map<number, typeof data.flowers>();
    for (const f of data.flowers) {
      let arr = byColor.get(f.colorIdx);
      if (!arr) {
        arr = [];
        byColor.set(f.colorIdx, arr);
      }
      arr.push(f);
    }

    const geom = getFlowerGeometry();
    for (const [colorIdx, flowerGroup] of byColor) {
      const color = preset.flowerColors[colorIdx] ?? 0xffffff;
      const mat = getFlowerMaterial(color);
      const im = new THREE.InstancedMesh(geom, mat, flowerGroup.length);
      im.castShadow = false;
      im.receiveShadow = true;
      im.frustumCulled = false;

      for (let i = 0; i < flowerGroup.length; i++) {
        const f = flowerGroup[i];
        _position.set(f.x, f.y, f.z);
        _euler.set(0, f.rotation, 0);
        _quaternion.setFromEuler(_euler);
        _scale.setScalar(f.scale);
        _matrix.compose(_position, _quaternion, _scale);
        im.setMatrixAt(i, _matrix);
      }
      im.instanceMatrix.needsUpdate = true;
      im.userData._foliageType = "flower";
      meshes.push(im);
    }
  }

  // -- ROCK InstancedMesh --
  if (data.rocks.length > 0) {
    const geom = getRockGeometry();
    const mat = getRockMaterial();
    const im = new THREE.InstancedMesh(geom, mat, data.rocks.length);
    im.castShadow = true;
    im.receiveShadow = true;
    im.frustumCulled = false;

    for (let i = 0; i < data.rocks.length; i++) {
      const r = data.rocks[i];
      _position.set(r.x, r.y, r.z);
      _euler.set(0, r.rotation, (((r.x * 7) | 0) % 5) * 0.1);
      _quaternion.setFromEuler(_euler);
      _scale.setScalar(r.scale);
      _matrix.compose(_position, _quaternion, _scale);
      im.setMatrixAt(i, _matrix);
    }
    im.instanceMatrix.needsUpdate = true;
    im.userData._foliageType = "rock";
    meshes.push(im);
  }

  return meshes;
}

// ============== FOLIAGE MANAGER ==============

/**
 * FoliageManager — manages foliage lifecycle for all loaded tiles.
 *
 * Used by TileBasedTerrain to generate and cull foliage. Tracks which tiles
 * have foliage loaded and handles generation/disposal.
 */
export class FoliageManager {
  private container: THREE.Group;
  private tiles = new Map<string, FoliageTileData>();
  private enabled = true;

  /** Queue for staged generation (rate-limited to avoid frame drops) */
  private generateQueue: Array<{
    tileX: number;
    tileZ: number;
    key: string;
    opts: FoliageGenerateOptions;
  }> = [];

  constructor(container: THREE.Group) {
    this.container = container;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.container.visible = false;
    } else {
      this.container.visible = true;
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Schedule foliage generation for a tile. Generation is deferred to
   * processQueue() to avoid frame spikes.
   */
  scheduleTile(opts: FoliageGenerateOptions): void {
    const key = `${opts.tileX}_${opts.tileZ}`;
    if (this.tiles.has(key)) return; // Already loaded

    // Avoid duplicate queue entries
    if (this.generateQueue.some((q) => q.key === key)) return;

    this.generateQueue.push({
      tileX: opts.tileX,
      tileZ: opts.tileZ,
      key,
      opts,
    });
  }

  /**
   * Process one queued tile per frame. Call from render loop.
   * Returns number of tiles processed.
   */
  processQueue(): number {
    if (!this.enabled || this.generateQueue.length === 0) return 0;

    // Process 1 tile per frame to avoid stutter
    const item = this.generateQueue.shift()!;
    if (this.tiles.has(item.key)) return 0; // Race condition guard

    const data = generateTileFoliageData(item.opts);

    // Determine dominant biome for material color
    const centerX =
      item.opts.tileX * item.opts.tileSize + item.opts.tileSize / 2;
    const centerZ =
      item.opts.tileZ * item.opts.tileSize + item.opts.tileSize / 2;
    const biome = item.opts.querier(centerX, centerZ).biome || "plains";

    const meshes = buildFoliageMeshes(data, biome);

    for (const mesh of meshes) {
      this.container.add(mesh);
    }

    this.tiles.set(item.key, {
      tileX: item.tileX,
      tileZ: item.tileZ,
      meshes,
    });

    return 1;
  }

  /**
   * Unload foliage for a specific tile. Called when terrain tile is unloaded.
   */
  unloadTile(tileX: number, tileZ: number): void {
    const key = `${tileX}_${tileZ}`;
    const data = this.tiles.get(key);
    if (!data) return;

    for (const mesh of data.meshes) {
      this.container.remove(mesh);
      mesh.dispose();
    }
    this.tiles.delete(key);

    // Also remove from queue if pending
    this.generateQueue = this.generateQueue.filter((q) => q.key !== key);
  }

  /**
   * Update foliage visibility based on camera position.
   * Hides tiles beyond FOLIAGE_VIEW_RADIUS from camera. Call per frame.
   */
  updateVisibility(cameraX: number, cameraZ: number): void {
    if (!this.enabled) return;

    const rSq = FOLIAGE_VIEW_RADIUS * FOLIAGE_VIEW_RADIUS;

    for (const [, data] of this.tiles) {
      // Estimate tile center (approximate — tiles are tileSize wide)
      let visible = false;
      for (const mesh of data.meshes) {
        // Use first mesh position as proxy (all foliage is on same tile)
        if (mesh.count > 0) {
          // Quick distance check using tile grid coords
          // The meshes contain world-space positions, so we check if any
          // part of the tile is within view radius
          const tileWorldX = data.tileX * 64 + 32; // Approximate
          const tileWorldZ = data.tileZ * 64 + 32;
          const dx = tileWorldX - cameraX;
          const dz = tileWorldZ - cameraZ;
          visible = dx * dx + dz * dz < rSq;
          break;
        }
      }

      for (const mesh of data.meshes) {
        mesh.visible = visible;
      }
    }
  }

  /**
   * Dispose all foliage and clear state. Called on scene teardown.
   */
  dispose(): void {
    for (const [, data] of this.tiles) {
      for (const mesh of data.meshes) {
        this.container.remove(mesh);
        mesh.dispose();
      }
    }
    this.tiles.clear();
    this.generateQueue = [];
  }

  /**
   * Clear all foliage and regenerate (e.g., after brush strokes change).
   */
  clearAll(): void {
    for (const [, data] of this.tiles) {
      for (const mesh of data.meshes) {
        this.container.remove(mesh);
        mesh.dispose();
      }
    }
    this.tiles.clear();
    this.generateQueue = [];
  }

  /** Number of tiles with foliage loaded */
  get loadedCount(): number {
    return this.tiles.size;
  }

  /** Number of tiles queued for generation */
  get queuedCount(): number {
    return this.generateQueue.length;
  }

  /** Check if a tile has foliage loaded */
  hasTile(tileX: number, tileZ: number): boolean {
    return this.tiles.has(`${tileX}_${tileZ}`);
  }
}

// ============== EXPORTS ==============

export { FOLIAGE_VIEW_RADIUS, FOLIAGE_TILE_RADIUS };
