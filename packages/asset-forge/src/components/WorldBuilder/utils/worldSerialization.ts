/**
 * World serialization: serialize/deserialize, import/export JSON, file I/O, and world creation helpers.
 */

import type {
  WorldData,
  WorldFoundation,
  WorldCreationConfig,
  GeneratedBiome,
  GeneratedTown,
  GeneratedBuilding,
  GeneratedRoad,
  BiomeOverride,
  TownOverride,
  PlacedNPC,
  PlacedQuest,
  PlacedBoss,
  PlacedEvent,
  PlacedLore,
  DifficultyZone,
  CustomPlacement,
} from "../types";

import { migrateWorldData, validateWorldData } from "./worldValidation";

// Serialized format (JSON-safe, Maps converted to Records)
export interface SerializedWorldData {
  id: string;
  name: string;
  description: string;
  version: number;
  createdAt: number;
  modifiedAt: number;
  foundationLocked: boolean;
  foundation: SerializedWorldFoundation;
  layers: SerializedWorldLayers;
}

export interface SerializedWorldFoundation {
  version: number;
  createdAt: number;
  config: WorldCreationConfig;
  biomes: GeneratedBiome[];
  towns: GeneratedTown[];
  buildings: GeneratedBuilding[];
  roads: GeneratedRoad[];
}

export interface SerializedWorldLayers {
  biomeOverrides: Record<string, BiomeOverride>;
  townOverrides: Record<string, TownOverride>;
  npcs: PlacedNPC[];
  quests: PlacedQuest[];
  bosses: PlacedBoss[];
  events: PlacedEvent[];
  lore: PlacedLore[];
  difficultyZones: DifficultyZone[];
  customPlacements: CustomPlacement[];
}

export function serializeWorld(world: WorldData): SerializedWorldData {
  return {
    id: world.id,
    name: world.name,
    description: world.description,
    version: world.version,
    createdAt: world.createdAt,
    modifiedAt: world.modifiedAt,
    foundationLocked: world.foundationLocked,
    foundation: {
      version: world.foundation.version,
      createdAt: world.foundation.createdAt,
      config: world.foundation.config,
      biomes: world.foundation.biomes,
      towns: world.foundation.towns,
      buildings: world.foundation.buildings,
      roads: world.foundation.roads,
    },
    layers: {
      biomeOverrides: Object.fromEntries(world.layers.biomeOverrides),
      townOverrides: Object.fromEntries(world.layers.townOverrides),
      npcs: world.layers.npcs,
      quests: world.layers.quests,
      bosses: world.layers.bosses,
      events: world.layers.events,
      lore: world.layers.lore,
      difficultyZones: world.layers.difficultyZones,
      customPlacements: world.layers.customPlacements,
    },
  };
}

export function deserializeWorld(data: SerializedWorldData): WorldData {
  return {
    id: data.id,
    name: data.name,
    description: data.description,
    version: data.version,
    createdAt: data.createdAt,
    modifiedAt: data.modifiedAt,
    foundationLocked: data.foundationLocked,
    foundation: {
      version: data.foundation.version,
      createdAt: data.foundation.createdAt,
      config: data.foundation.config,
      biomes: data.foundation.biomes,
      towns: data.foundation.towns,
      buildings: data.foundation.buildings,
      roads: data.foundation.roads,
      heightmapCache: new Map(),
    },
    layers: {
      biomeOverrides: new Map(Object.entries(data.layers.biomeOverrides || {})),
      townOverrides: new Map(Object.entries(data.layers.townOverrides || {})),
      npcs: data.layers.npcs || [],
      quests: data.layers.quests || [],
      bosses: data.layers.bosses || [],
      events: data.layers.events || [],
      lore: data.layers.lore || [],
      difficultyZones: data.layers.difficultyZones || [],
      customPlacements: data.layers.customPlacements || [],
    },
  };
}

export function exportWorldToJSON(
  world: WorldData,
  prettyPrint = true,
): string {
  const serialized = serializeWorld(world);
  return JSON.stringify(serialized, null, prettyPrint ? 2 : 0);
}

/** @throws Error on invalid JSON or structure */
export function importWorldFromJSON(json: string): WorldData {
  const parsed: unknown = JSON.parse(json);

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid world data: expected object");
  }

  const data = parsed as Record<string, unknown>;
  if (typeof data.id !== "string" || typeof data.name !== "string") {
    throw new Error("Invalid world data: missing id or name");
  }

  const migrated = migrateWorldData(parsed as unknown as SerializedWorldData);
  if (!validateWorldData(migrated)) {
    throw new Error("Invalid world data after migration");
  }

  return deserializeWorld(migrated);
}

export function downloadWorldAsFile(world: WorldData): void {
  const json = exportWorldToJSON(world);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const filename = `${world.name.toLowerCase().replace(/\s+/g, "-")}-${world.id.substring(0, 8)}.json`;

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function importWorldFromFile(file: File): Promise<WorldData> {
  if (!file.name.endsWith(".json") && !file.name.endsWith(".world")) {
    throw new Error(
      `Invalid file type: expected .json or .world, got "${file.name}"`,
    );
  }

  const json = await file.text();
  return importWorldFromJSON(json);
}

export function generateWorldId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 11);
  return `world-${timestamp}-${random}`;
}

export function generateWorldName(seed: number): string {
  const adjectives = [
    "Verdant",
    "Ancient",
    "Mystic",
    "Wild",
    "Eternal",
    "Hidden",
    "Lost",
    "Brave",
  ];
  const nouns = [
    "Realm",
    "Lands",
    "Kingdom",
    "Vale",
    "Shores",
    "Peaks",
    "Forest",
    "Wilds",
  ];

  const adjIndex = seed % adjectives.length;
  const nounIndex = Math.floor(seed / adjectives.length) % nouns.length;

  return `${adjectives[adjIndex]} ${nouns[nounIndex]}`;
}

export function createNewWorld(
  foundation: WorldFoundation,
  name?: string,
  description?: string,
): WorldData {
  const worldId = generateWorldId();
  const worldName = name || generateWorldName(foundation.config.seed);

  return {
    id: worldId,
    name: worldName,
    description:
      description || `Generated world with seed ${foundation.config.seed}`,
    version: 1,
    createdAt: Date.now(),
    modifiedAt: Date.now(),
    foundationLocked: true,
    foundation,
    layers: {
      biomeOverrides: new Map(),
      townOverrides: new Map(),
      npcs: [],
      quests: [],
      bosses: [],
      events: [],
      lore: [],
      difficultyZones: [],
      customPlacements: [],
    },
  };
}

export function calculateWorldStats(world: WorldData): {
  totalTiles: number;
  totalBiomes: number;
  totalTowns: number;
  totalBuildings: number;
  totalRoads: number;
  totalNPCs: number;
  totalQuests: number;
  totalBosses: number;
  totalEvents: number;
  worldSizeKm: number;
  hasOverrides: boolean;
} {
  const config = world.foundation.config;
  const worldSizeMeters = config.terrain.worldSize * config.terrain.tileSize;

  return {
    totalTiles: config.terrain.worldSize * config.terrain.worldSize,
    totalBiomes: world.foundation.biomes.length,
    totalTowns: world.foundation.towns.length,
    totalBuildings: world.foundation.buildings.length,
    totalRoads: world.foundation.roads.length,
    totalNPCs: world.layers.npcs.length,
    totalQuests: world.layers.quests.length,
    totalBosses: world.layers.bosses.length,
    totalEvents: world.layers.events.length,
    worldSizeKm: worldSizeMeters / 1000,
    hasOverrides:
      world.layers.biomeOverrides.size > 0 ||
      world.layers.townOverrides.size > 0,
  };
}
