/**
 * compiledManifests — Typed interfaces for compiler output
 *
 * These mirror the runtime types from @hyperscape/shared exactly.
 * The compiler produces these types; the game consumes them.
 */

// ============== COMPILED WORLD AREA ==============

export interface CompiledNPCLocation {
  id: string;
  type: "bank" | "general_store" | "skill_trainer" | "quest_giver";
  position: { x: number; y: number; z: number };
  name?: string;
  services?: string[];
  modelPath?: string;
  description?: string;
  storeId?: string;
}

export interface CompiledBiomeResource {
  type: "tree" | "fishing_spot" | "mine" | "herb_patch";
  position: { x: number; y: number; z: number };
  resourceId: string;
  respawnTime: number;
  level: number;
}

export interface CompiledMobSpawnPoint {
  mobId: string;
  position: { x: number; y: number; z: number };
  spawnRadius: number;
  maxCount: number;
  respawnTime: number;
}

export interface CompiledStationLocation {
  id: string;
  type: string;
  position: { x: number; y: number; z: number };
  rotation?: number;
  bankId?: string;
}

export interface CompiledWorldArea {
  id: string;
  name: string;
  description: string;
  difficultyLevel: 0 | 1 | 2 | 3;
  bounds: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
  };
  biomeType: string;
  safeZone: boolean;
  pvpEnabled?: boolean;
  npcs: CompiledNPCLocation[];
  resources: CompiledBiomeResource[];
  mobSpawns: CompiledMobSpawnPoint[];
  fishing?: {
    enabled: boolean;
    spotCount: number;
    spotTypes: string[];
  };
  stations?: CompiledStationLocation[];
}

// ============== COMPILED WORLD JSON ==============

export interface CompiledEntityNPC {
  id: string;
  npcTypeId: string;
  name: string;
  position: { x: number; y: number; z: number };
  rotation: number;
  context: { type: string; townId?: string; buildingId?: string };
  storeId?: string;
  dialogId?: string;
}

export interface CompiledEntityMobSpawn {
  id: string;
  mobId: string;
  name: string;
  position: { x: number; y: number; z: number };
  spawnRadius: number;
  maxCount: number;
  respawnTime: number;
}

export interface CompiledEntityResource {
  id: string;
  resourceId: string;
  resourceType: string;
  name: string;
  position: { x: number; y: number; z: number };
  rotation: number;
  modelVariant: number;
}

export interface CompiledWorldJson {
  version: number;
  name: string;
  entities: {
    npcs: CompiledEntityNPC[];
    mobSpawns: CompiledEntityMobSpawn[];
    resources: CompiledEntityResource[];
    stations: Array<{
      id: string;
      stationType: string;
      name: string;
      position: { x: number; y: number; z: number };
      rotation: number;
    }>;
    spawnPoints: Array<{
      id: string;
      name: string;
      position: { x: number; y: number; z: number };
      rotation: number;
      spawnType: string;
      capacity: number;
      linkedAreaId?: string;
    }>;
    teleports: Array<{
      id: string;
      name: string;
      position: { x: number; y: number; z: number };
      connections: string[];
      type?: string;
      requirements?: { questId?: string; minLevel?: number; itemId?: string };
      cost?: number;
    }>;
    pois: Array<{
      id: string;
      name: string;
      position: { x: number; y: number; z: number };
      category: string;
      importance: number;
      radius: number;
    }>;
  };
  metadata: {
    compiledAt: string;
    worldSize: number;
    tileSize: number;
  };
}

// ============== COMPILED BIOME ==============

export interface CompiledBiome {
  id: string;
  type: string;
  tileKeys: string[];
  vegetation: Record<string, unknown>;
}

// ============== COMPILED REGION ==============

export interface CompiledRegion {
  id: string;
  name: string;
  description?: string;
  tileKeys: string[];
  tags: string[];
  biomeOverride?: string;
  musicTrack?: string;
  ambientSound?: string;
  spawnRules?: Record<string, unknown>;
  autoGenBounds?: {
    difficultyRange: [number, number];
    biomeFilter: string | null;
    boundingBox: {
      minX: number;
      maxX: number;
      minZ: number;
      maxZ: number;
    };
    generationSeed: number;
    generatedAt: number;
  };
}

// ============== TYPED COMPILER OUTPUT ==============

export interface TypedCompiledManifests {
  files: Map<string, unknown>;
  worldJson: CompiledWorldJson;
  worldAreas: CompiledWorldArea[];
  biomes: CompiledBiome[];
  regions: CompiledRegion[];
}
