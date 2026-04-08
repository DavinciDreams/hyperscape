/**
 * World Structure - Data-Driven Implementation
 *
 * ALL biome and zone data is loaded from JSON manifests at runtime by DataManager.
 * This keeps world structure definitions data-driven and separate from code.
 *
 * Data loaded from:
 * - assets/manifests/biomes.json
 * - assets/manifests/zones.json
 *
 * To modify biomes or zones:
 * 1. Edit the appropriate JSON file
 * 2. Restart server to reload manifests
 *
 * DO NOT add biome/zone data here - keep it in JSON!
 */

import type { BiomeData, ZoneData } from "../types/core/core";
import { calculateDistance2D } from "../utils/game/EntityUtils";

// Re-export types for external use
export type { DeathLocationData, ZoneData } from "../types/core/core";

/**
 * Biome Database - Populated at runtime from JSON manifests
 * DataManager loads from assets/manifests/biomes.json
 */
export const BIOMES: Record<string, BiomeData> = {};

/**
 * World Zones - Populated at runtime from JSON manifests
 * DataManager loads from assets/manifests/zones.json
 */
export const WORLD_ZONES: ZoneData[] = [];

/**
 * Starter Zones - Computed from loaded zones (ZoneData[] type)
 * Note: This is different from STARTER_TOWNS in world-areas.ts which uses WorldArea type
 */
export const STARTER_ZONES: ZoneData[] = [];

/**
 * Find a biome by ID, falling back to a search by terrain type.
 * Production manifests use terrain-type IDs (e.g. "forest") while
 * World Studio staging manifests use generated IDs (e.g. "biome-1")
 * with a `terrain` field indicating the type.
 */
export function getBiomeByIdOrTerrain(
  idOrTerrain: string,
): BiomeData | undefined {
  // Exact ID match first
  const exact = BIOMES[idOrTerrain];
  if (exact) return exact;

  // Fallback: find first biome whose terrain type matches
  for (const biome of Object.values(BIOMES)) {
    if (biome.terrain === idOrTerrain) return biome;
  }
  return undefined;
}

/**
 * Helper Functions
 */
export function getNearestTown(position: {
  x: number;
  y: number;
  z: number;
}): ZoneData | null {
  const towns = WORLD_ZONES.filter((zone) => zone.isTown);
  if (towns.length === 0) return null;

  let nearestTown = towns[0];
  let minDistance = Infinity;

  for (const town of towns) {
    const spawnPoint = town.spawnPoints.find((sp) => sp.type === "player");
    if (spawnPoint) {
      const distance = calculateDistance2D(position, spawnPoint.position);
      if (distance < minDistance) {
        minDistance = distance;
        nearestTown = town;
      }
    }
  }

  return nearestTown;
}

export function getRandomTown(): ZoneData | null {
  const towns = WORLD_ZONES.filter((zone) => zone.isTown);
  if (towns.length === 0) return null;
  return towns[Math.floor(Math.random() * towns.length)];
}

export function getZoneByPosition(position: {
  x: number;
  z: number;
}): ZoneData | null {
  for (const zone of WORLD_ZONES) {
    const bounds = zone.bounds;
    if (
      position.x >= bounds.x &&
      position.x <= bounds.x + bounds.width &&
      position.z >= bounds.z &&
      position.z <= bounds.z + bounds.height
    ) {
      return zone;
    }
  }
  return null;
}

export function getZonesByDifficulty(level: 0 | 1 | 2 | 3): ZoneData[] {
  return WORLD_ZONES.filter((zone) => zone.difficultyLevel === level);
}

export function isValidPlayerMovement(
  _from: { x: number; z: number },
  _to: { x: number; z: number },
): boolean {
  // Check if movement crosses water bodies or impassable terrain
  // For MVP, all land movement is valid
  return true;
}

export function getTerrainHeight(_x: number, _z: number): number {
  // Return ground level height for position
  // For MVP, return standard ground level
  return 2;
}

/**
 * World Structure Constants (grid, terrain, zones)
 * Note: Different from WORLD_GENERATION_CONSTANTS in world-areas.ts
 */
export const WORLD_STRUCTURE_CONSTANTS = {
  GRID_SIZE: 4, // Block size for grid-based movement
  DEFAULT_SPAWN_HEIGHT: 2,
  WATER_LEVEL: 16, // Must match TERRAIN_CONSTANTS.WATER_THRESHOLD
  MAX_BUILD_HEIGHT: 100,
  SAFE_ZONE_RADIUS: 15, // Radius around starter towns with no hostile mobs
  // Note: Death/respawn timing constants are in COMBAT_CONSTANTS (tick-based)
} as const;

// ============================================================================
// WORLD.JSON — Entity placements from World Studio
// ============================================================================

export interface WorldJsonEntity {
  id: string;
  position: { x: number; y: number; z: number };
}

export interface WorldJsonResource extends WorldJsonEntity {
  resourceId: string;
  resourceType: string; // "woodcutting" | "mining" | "fishing"
  name: string;
  rotation: number;
  modelVariant: number;
}

export interface WorldJsonMobSpawn extends WorldJsonEntity {
  mobId: string;
  name: string;
  spawnRadius: number;
  maxCount: number;
  respawnTime: number;
}

export interface WorldJsonMine extends WorldJsonEntity {
  radius: number;
  radialOffsets: number[];
  entryAngle: number;
  biome: string;
}

/** Pre-filtered procgen tree from World Studio manifest */
export interface WorldJsonTree {
  /** Tree species (e.g. "oak", "pine", "knotwood") */
  s: string;
  x: number;
  y: number;
  z: number;
  /** Scale multiplier */
  sc: number;
  /** Y-axis rotation in radians */
  r: number;
}

export interface WorldJson {
  version: number;
  name: string;
  entities: {
    npcs: WorldJsonEntity[];
    mobSpawns: WorldJsonMobSpawn[];
    resources: WorldJsonResource[];
    stations: WorldJsonEntity[];
    spawnPoints: WorldJsonEntity[];
    teleports: WorldJsonEntity[];
    pois: WorldJsonEntity[];
    mines?: WorldJsonMine[];
    /** Pre-filtered procgen trees from World Studio. When present, game client
     *  uses these directly instead of running its own procgen + exclusion filter. */
    trees?: WorldJsonTree[];
  };
  metadata: {
    compiledAt: string;
    worldSize: number;
    tileSize: number;
  };
}

/** Danger source from danger-sources.json */
export interface DangerSourceManifest {
  id: string;
  name: string;
  position: { x: number; z: number };
  radius: number;
  intensity: number;
  falloffCurve: string;
}

/** Wilderness boundary from wilderness-boundary.json */
export interface WildernessBoundaryManifest {
  points: Array<{ x: number; z: number }>;
  levelScale: number;
  maxLevel: number;
}

// ============================================================================
// WORLD.JSON — Spatial Index
// ============================================================================

/**
 * Tile-based spatial index for world.json entities.
 * Key format: `${tileX}_${tileZ}`
 */
export class WorldJsonSpatialIndex {
  private resourcesByTile = new Map<string, WorldJsonResource[]>();
  private mobSpawnsByTile = new Map<string, WorldJsonMobSpawn[]>();
  private treesByTile = new Map<string, WorldJsonTree[]>();
  private mines: WorldJsonMine[] = [];
  private tileSize: number;
  private _hasManifestTrees = false;

  constructor(worldJson: WorldJson, tileSize: number) {
    this.tileSize = tileSize;
    this.buildIndex(worldJson);
  }

  private buildIndex(worldJson: WorldJson): void {
    const entities = worldJson.entities;

    // Index resources by tile
    for (const resource of entities.resources) {
      const key = this.tileKeyFor(resource.position.x, resource.position.z);
      let bucket = this.resourcesByTile.get(key);
      if (!bucket) {
        bucket = [];
        this.resourcesByTile.set(key, bucket);
      }
      bucket.push(resource);
    }

    // Index mob spawns by tile
    for (const mob of entities.mobSpawns) {
      const key = this.tileKeyFor(mob.position.x, mob.position.z);
      let bucket = this.mobSpawnsByTile.get(key);
      if (!bucket) {
        bucket = [];
        this.mobSpawnsByTile.set(key, bucket);
      }
      bucket.push(mob);
    }

    // Index manifest trees by tile (pre-filtered by World Studio)
    if (entities.trees && entities.trees.length > 0) {
      this._hasManifestTrees = true;
      for (const tree of entities.trees) {
        const key = this.tileKeyFor(tree.x, tree.z);
        let bucket = this.treesByTile.get(key);
        if (!bucket) {
          bucket = [];
          this.treesByTile.set(key, bucket);
        }
        bucket.push(tree);
      }
    }

    // Store mines (not indexed by tile — few enough to iterate)
    this.mines = entities.mines ?? [];

    const resTiles = this.resourcesByTile.size;
    const mobTiles = this.mobSpawnsByTile.size;
    console.log(
      `[WorldJsonSpatialIndex] Built index: ${entities.resources.length} resources (${resTiles} tiles), ` +
        `${entities.mobSpawns.length} mob spawns (${mobTiles} tiles), ${this.mines.length} mines` +
        (this._hasManifestTrees
          ? `, ${entities.trees!.length} trees (${this.treesByTile.size} tiles)`
          : ""),
    );
  }

  private tileKeyFor(worldX: number, worldZ: number): string {
    const tx = Math.floor(worldX / this.tileSize);
    const tz = Math.floor(worldZ / this.tileSize);
    return `${tx}_${tz}`;
  }

  getResourcesInTile(tileX: number, tileZ: number): WorldJsonResource[] {
    return this.resourcesByTile.get(`${tileX}_${tileZ}`) ?? [];
  }

  getMobSpawnsInTile(tileX: number, tileZ: number): WorldJsonMobSpawn[] {
    return this.mobSpawnsByTile.get(`${tileX}_${tileZ}`) ?? [];
  }

  getMines(): WorldJsonMine[] {
    return this.mines;
  }

  getTreesInTile(tileX: number, tileZ: number): WorldJsonTree[] {
    return this.treesByTile.get(`${tileX}_${tileZ}`) ?? [];
  }

  hasResources(): boolean {
    return this.resourcesByTile.size > 0;
  }

  hasMobSpawns(): boolean {
    return this.mobSpawnsByTile.size > 0;
  }

  /** True when world.json includes pre-filtered tree data from World Studio */
  hasManifestTrees(): boolean {
    return this._hasManifestTrees;
  }
}
