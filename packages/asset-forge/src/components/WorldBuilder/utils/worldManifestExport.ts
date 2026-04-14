/**
 * World manifest export: game manifest generation, download, clipboard, file import, and merge.
 */

import type {
  WorldData,
  TownLandmarkConfig,
  BiomeOverride,
  WildernessZone,
  WorldPosition,
  GeneratedBossConfig,
} from "../types";

import { generateMobSpawns } from "./worldGeneration";

// Game manifest types (matches TownSystem/DataManager expectations)
interface GameManifestTown {
  id: string;
  name: string;
  position: { x: number; y: number; z: number };
  size: "sm" | "md" | "lg";
  keep: boolean;
  safeZoneRadius: number;
  buildings: GameManifestBuilding[];
}

interface GameManifestBuilding {
  id: string;
  type: string;
  position: { x: number; y: number; z: number };
  rotation: number;
  size: { width: number; depth: number };
}

interface GameManifestBuildingType {
  label: string;
  widthRange: [number, number];
  depthRange: [number, number];
  floors: number;
  hasBasement: boolean;
  props?: string[];
}

interface GameManifestSizeDefinition {
  label: string;
  minBuildings: number;
  maxBuildings: number;
  radius: number;
  safeZoneRadius: number;
}

interface GameBuildingsManifest {
  version: number;
  towns: GameManifestTown[];
  buildingTypes: Record<string, GameManifestBuildingType>;
  sizeDefinitions: Record<"sm" | "md" | "lg", GameManifestSizeDefinition>;
}

interface GameWorldConfigManifest {
  terrain: {
    seed: number;
    worldSize: number;
    tileSize: number;
    tileResolution: number;
  };
  towns: {
    townCount: number;
    minTownSpacing: number;
    waterThreshold: number;
    landmarks: TownLandmarkConfig;
  };
}

export function exportToGameManifest(world: WorldData): {
  buildingsManifest: GameBuildingsManifest;
  worldConfig: GameWorldConfigManifest;
} {
  const config = world.foundation.config;

  // Map WorldBuilder town size to game manifest size
  const townSizeToManifestSize = (size: string): "sm" | "md" | "lg" => {
    switch (size) {
      case "hamlet":
        return "sm";
      case "village":
        return "md";
      case "town":
        return "lg";
      default:
        return "md";
    }
  };

  // Build town data with buildings (applying overrides from editing layer)
  const towns: GameManifestTown[] = world.foundation.towns.map((town) => {
    const townOverride = world.layers.townOverrides.get(town.id);
    const buildingMods = townOverride?.buildingModifications ?? [];

    // Find buildings belonging to this town, applying modifications
    const townBuildings = world.foundation.buildings
      .filter((b) => b.townId === town.id)
      .filter((b) => {
        const mod = buildingMods.find((m) => m.buildingId === b.id);
        return !mod?.disabled; // Exclude disabled buildings
      })
      .map((building): GameManifestBuilding => {
        const mod = buildingMods.find((m) => m.buildingId === building.id);
        const posX = building.position.x + (mod?.positionOffset?.x ?? 0);
        const posZ = building.position.z + (mod?.positionOffset?.z ?? 0);
        return {
          id: building.id,
          type: mod?.typeOverride || building.type,
          // Position relative to town center for manifest format
          position: {
            x: posX - town.position.x,
            y: building.position.y - town.position.y,
            z: posZ - town.position.z,
          },
          rotation: mod?.rotationOverride ?? building.rotation,
          size: {
            width: building.dimensions.width,
            depth: building.dimensions.depth,
          },
        };
      });

    // Calculate safe zone radius (override or default by size)
    const defaultSafeZone =
      town.size === "hamlet" ? 40 : town.size === "village" ? 60 : 80;
    const safeZoneRadius =
      townOverride?.safeZoneRadiusOverride ?? defaultSafeZone;

    return {
      id: town.id,
      name: townOverride?.nameOverride || town.name,
      position: {
        x: town.position.x,
        y: town.position.y,
        z: town.position.z,
      },
      size: townSizeToManifestSize(town.size),
      keep: true, // All exported towns should be kept
      safeZoneRadius,
      buildings: townBuildings,
    };
  });

  // Standard building type definitions
  const buildingTypes: Record<string, GameManifestBuildingType> = {
    bank: {
      label: "Bank",
      widthRange: [8, 8],
      depthRange: [6, 6],
      floors: 1,
      hasBasement: true,
      props: ["banker"],
    },
    store: {
      label: "General Store",
      widthRange: [7, 7],
      depthRange: [5, 5],
      floors: 1,
      hasBasement: false,
      props: ["shopkeeper"],
    },
    inn: {
      label: "Inn",
      widthRange: [10, 10],
      depthRange: [12, 12],
      floors: 2,
      hasBasement: false,
      props: ["innkeeper"],
    },
    smithy: {
      label: "Smithy",
      widthRange: [7, 7],
      depthRange: [7, 7],
      floors: 1,
      hasBasement: false,
      props: ["blacksmith", "anvil"],
    },
    house: {
      label: "House",
      widthRange: [6, 6],
      depthRange: [5, 5],
      floors: 1,
      hasBasement: false,
    },
    "simple-house": {
      label: "Simple House",
      widthRange: [6, 6],
      depthRange: [6, 6],
      floors: 1,
      hasBasement: false,
    },
    "long-house": {
      label: "Long House",
      widthRange: [5, 5],
      depthRange: [12, 12],
      floors: 1,
      hasBasement: false,
    },
    well: {
      label: "Well",
      widthRange: [3, 3],
      depthRange: [3, 3],
      floors: 0,
      hasBasement: false,
    },
    anvil: {
      label: "Anvil",
      widthRange: [2, 2],
      depthRange: [2, 2],
      floors: 0,
      hasBasement: false,
    },
  };

  // Size definitions matching game expectations
  const sizeDefinitions: Record<
    "sm" | "md" | "lg",
    GameManifestSizeDefinition
  > = {
    sm: {
      label: "Hamlet",
      minBuildings: 3,
      maxBuildings: 5,
      radius: 25,
      safeZoneRadius: 40,
    },
    md: {
      label: "Village",
      minBuildings: 6,
      maxBuildings: 10,
      radius: 40,
      safeZoneRadius: 60,
    },
    lg: {
      label: "Town",
      minBuildings: 11,
      maxBuildings: 16,
      radius: 60,
      safeZoneRadius: 80,
    },
  };

  const buildingsManifest: GameBuildingsManifest = {
    version: 1,
    towns,
    buildingTypes,
    sizeDefinitions,
  };

  const worldConfig: GameWorldConfigManifest = {
    terrain: {
      seed: config.seed,
      worldSize: config.terrain.worldSize * config.terrain.tileSize, // Convert to meters
      tileSize: config.terrain.tileSize,
      tileResolution: config.terrain.tileResolution,
    },
    towns: {
      townCount: config.towns.townCount,
      minTownSpacing: config.towns.minTownSpacing,
      waterThreshold: config.shoreline.waterLevelNormalized,
      landmarks: config.towns.landmarks,
    },
  };

  return { buildingsManifest, worldConfig };
}

export interface FullGameManifest {
  version: number;
  worldId: string;
  worldName: string;
  exportedAt: number;

  // Core manifests
  buildings: GameBuildingsManifest;
  worldConfig: GameWorldConfigManifest;

  // Content manifests
  npcs: NPCManifest;
  mobs: MobManifest;
  bosses: BossManifest;
  quests: QuestManifest;

  // Zone manifests
  difficultyZones: DifficultyZoneManifest;
  wilderness: WildernessManifest;
  biomes: BiomeManifest;
}

interface NPCManifest {
  version: number;
  npcs: Array<{
    id: string;
    name: string;
    npcTypeId: string;
    position: WorldPosition;
    townId?: string;
    buildingId?: string;
    dialogId?: string;
    storeId?: string;
  }>;
}

interface MobManifest {
  version: number;
  spawnConfigs: Array<{
    biomeId: string;
    enabled: boolean;
    spawnRate: number;
    maxPerChunk: number;
    spawnTable: Array<{
      mobTypeId: string;
      weight: number;
      levelRange: [number, number];
      groupSize: [number, number];
    }>;
    bounds: {
      minX: number;
      maxX: number;
      minZ: number;
      maxZ: number;
    };
  }>;
}

interface BossManifest {
  version: number;
  bosses: Array<{
    id: string;
    name: string;
    templateId: string;
    position: WorldPosition;
    arenaBounds: {
      minX: number;
      maxX: number;
      minZ: number;
      maxZ: number;
    };
    respawnTime: number;
    requiredLevel: number;
    lootTableId: string;
    isGenerated: boolean;
    generatedConfig?: GeneratedBossConfig;
  }>;
}

interface QuestManifest {
  version: number;
  quests: Array<{
    id: string;
    name: string;
    templateId: string;
    questGiverNpcId: string;
    turnInNpcId: string;
    requiredLevel: number;
    locations: Array<{
      type: string;
      id?: string;
      position?: WorldPosition;
      description: string;
    }>;
  }>;
}

interface DifficultyZoneManifest {
  version: number;
  zones: Array<{
    id: string;
    name: string;
    difficultyLevel: number;
    isSafeZone: boolean;
    bounds: {
      minX: number;
      maxX: number;
      minZ: number;
      maxZ: number;
    };
    center?: WorldPosition;
    linkedTownId?: string;
    mobLevelRange: [number, number];
  }>;
}

interface WildernessManifest {
  version: number;
  enabled: boolean;
  zone?: WildernessZone;
}

interface BiomeManifest {
  version: number;
  biomes: Array<{
    id: string;
    type: string;
    center: WorldPosition;
    influenceRadius: number;
    tileCount: number;
    materialConfig?: {
      baseTextureId: string;
      secondaryTextureId?: string;
      blendMode: string;
      roughness: number;
      colorTint: string;
      uvScale: number;
    };
    heightConfig?: {
      minHeight: number;
      maxHeight: number;
      variance: number;
      smoothness: number;
    };
  }>;
}

export function exportFullGameManifest(world: WorldData): FullGameManifest {
  const { buildingsManifest, worldConfig } = exportToGameManifest(world);
  const mobSpawns = generateMobSpawns(world);

  // NPCs manifest
  const npcManifest: NPCManifest = {
    version: 1,
    npcs: world.layers.npcs.map((npc) => ({
      id: npc.id,
      name: npc.name,
      npcTypeId: npc.npcTypeId,
      position: npc.position,
      townId:
        npc.parentContext.type === "town"
          ? npc.parentContext.townId
          : undefined,
      buildingId:
        npc.parentContext.type === "building"
          ? npc.parentContext.buildingId
          : undefined,
      dialogId: npc.dialogId,
      storeId: npc.storeId,
    })),
  };

  // Mobs manifest (from spawn configs)
  const mobManifest: MobManifest = {
    version: 1,
    spawnConfigs: mobSpawns.spawns.map((spawn) => ({
      biomeId: spawn.biomeId,
      enabled: spawn.enabled,
      spawnRate: spawn.spawnRate,
      maxPerChunk: spawn.maxPerChunk,
      spawnTable: spawn.spawnTable,
      bounds: spawn.bounds,
    })),
  };

  // Bosses manifest
  const bossManifest: BossManifest = {
    version: 1,
    bosses: world.layers.bosses.map((boss) => ({
      id: boss.id,
      name: boss.name,
      templateId: boss.bossTemplateId,
      position: boss.position,
      arenaBounds: boss.arenaBounds,
      respawnTime: boss.respawnTime,
      requiredLevel: boss.requiredLevel,
      lootTableId: boss.lootTableId,
      isGenerated: boss.isGenerated,
      generatedConfig: boss.generatedConfig,
    })),
  };

  // Quests manifest
  const questManifest: QuestManifest = {
    version: 1,
    quests: world.layers.quests.map((quest) => ({
      id: quest.id,
      name: quest.name,
      templateId: quest.questTemplateId,
      questGiverNpcId: quest.questGiverNpcId,
      turnInNpcId: quest.turnInNpcId,
      requiredLevel: quest.requiredLevel,
      locations: quest.locations,
    })),
  };

  // Difficulty zones manifest
  const difficultyManifest: DifficultyZoneManifest = {
    version: 1,
    zones: world.layers.difficultyZones.map((zone) => ({
      id: zone.id,
      name: zone.name,
      difficultyLevel: zone.difficultyLevel,
      isSafeZone: zone.isSafeZone,
      bounds: zone.bounds,
      center: zone.center,
      linkedTownId: zone.linkedTownId,
      mobLevelRange: zone.mobLevelRange,
    })),
  };

  // Wilderness manifest
  const wildernessManifest: WildernessManifest = {
    version: 1,
    enabled: true,
    zone: {
      id: "wilderness-main",
      name: "The Wilderness",
      direction: "north",
      startBoundary: 0.3,
      multiCombat: true,
      baseLevelAtBoundary: 1,
      levelPerHundredMeters: 1,
    },
  };

  // Biomes manifest
  const biomeManifest: BiomeManifest = {
    version: 1,
    biomes: world.foundation.biomes.map((biome) => {
      const override = world.layers.biomeOverrides.get(biome.id);
      return {
        id: biome.id,
        type: override?.typeOverride || biome.type,
        center: biome.center,
        influenceRadius: biome.influenceRadius,
        tileCount: biome.tileKeys.length,
        materialConfig: override?.materialOverride
          ? {
              baseTextureId: override.materialOverride.baseTextureId,
              secondaryTextureId: override.materialOverride.secondaryTextureId,
              blendMode: override.materialOverride.blendMode,
              roughness: override.materialOverride.roughness,
              colorTint: override.materialOverride.colorTint,
              uvScale: override.materialOverride.uvScale,
            }
          : undefined,
        heightConfig: override?.heightOverride,
      };
    }),
  };

  return {
    version: 1,
    worldId: world.id,
    worldName: world.name,
    exportedAt: Date.now(),
    buildings: buildingsManifest,
    worldConfig,
    npcs: npcManifest,
    mobs: mobManifest,
    bosses: bossManifest,
    quests: questManifest,
    difficultyZones: difficultyManifest,
    wilderness: wildernessManifest,
    biomes: biomeManifest,
  };
}

export function downloadGameManifests(
  world: WorldData,
  namePrefix?: string,
): void {
  const { buildingsManifest, worldConfig } = exportToGameManifest(world);
  const prefix = namePrefix || world.name.toLowerCase().replace(/\s+/g, "-");

  // Download buildings.json
  const buildingsBlob = new Blob([JSON.stringify(buildingsManifest, null, 2)], {
    type: "application/json",
  });
  const buildingsUrl = URL.createObjectURL(buildingsBlob);
  const buildingsLink = document.createElement("a");
  buildingsLink.href = buildingsUrl;
  buildingsLink.download = `${prefix}-buildings.json`;
  buildingsLink.click();
  URL.revokeObjectURL(buildingsUrl);

  // Download world-config.json
  const configBlob = new Blob([JSON.stringify(worldConfig, null, 2)], {
    type: "application/json",
  });
  const configUrl = URL.createObjectURL(configBlob);
  const configLink = document.createElement("a");
  configLink.href = configUrl;
  configLink.download = `${prefix}-world-config.json`;
  configLink.click();
  URL.revokeObjectURL(configUrl);
}

export function downloadAllGameManifests(
  world: WorldData,
  namePrefix?: string,
): void {
  const manifest = exportFullGameManifest(world);
  const prefix = namePrefix || world.name.toLowerCase().replace(/\s+/g, "-");

  const downloadJson = (data: object, filename: string) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Download each manifest
  downloadJson(manifest.buildings, `${prefix}-buildings.json`);
  downloadJson(manifest.worldConfig, `${prefix}-world-config.json`);
  downloadJson(manifest.npcs, `${prefix}-npcs.json`);
  downloadJson(manifest.mobs, `${prefix}-mobs.json`);
  downloadJson(manifest.bosses, `${prefix}-bosses.json`);
  downloadJson(manifest.quests, `${prefix}-quests.json`);
  downloadJson(manifest.difficultyZones, `${prefix}-difficulty-zones.json`);
  downloadJson(manifest.wilderness, `${prefix}-wilderness.json`);
  downloadJson(manifest.biomes, `${prefix}-biomes.json`);

  // Also download complete manifest
  downloadJson(manifest, `${prefix}-full-manifest.json`);
}

export function copyGameManifestsToClipboard(world: WorldData): Promise<void> {
  const { buildingsManifest, worldConfig } = exportToGameManifest(world);

  const combined = {
    buildingsManifest,
    worldConfig,
    exportedAt: new Date().toISOString(),
    worldName: world.name,
    worldId: world.id,
  };

  return navigator.clipboard.writeText(JSON.stringify(combined, null, 2));
}

export function importManifestFromFile(): Promise<FullGameManifest> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";

    input.onchange = async (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) {
        reject(new Error("No file selected"));
        return;
      }

      const text = await file.text();
      const manifest = JSON.parse(text) as FullGameManifest;

      // Validate manifest structure
      if (!manifest.version || !manifest.worldId) {
        reject(
          new Error("Invalid manifest format: missing version or worldId"),
        );
        return;
      }

      resolve(manifest);
    };

    input.click();
  });
}

export type MergeStrategy = "replace" | "merge" | "skip_existing";

export interface ManifestMergeOptions {
  npcs: MergeStrategy;
  bosses: MergeStrategy;
  quests: MergeStrategy;
  difficultyZones: MergeStrategy;
  biomeOverrides: MergeStrategy;
}

export const DEFAULT_MERGE_OPTIONS: ManifestMergeOptions = {
  npcs: "merge",
  bosses: "merge",
  quests: "merge",
  difficultyZones: "replace",
  biomeOverrides: "merge",
};

export function mergeManifestIntoWorld(
  world: WorldData,
  manifest: FullGameManifest,
  options: Partial<ManifestMergeOptions> = {},
): WorldData {
  const mergeOptions = { ...DEFAULT_MERGE_OPTIONS, ...options };
  const updatedWorld = { ...world };

  // Deep clone layers to avoid mutation
  updatedWorld.layers = {
    ...world.layers,
    npcs: [...world.layers.npcs],
    quests: [...world.layers.quests],
    bosses: [...world.layers.bosses],
    difficultyZones: [...world.layers.difficultyZones],
    biomeOverrides: new Map(world.layers.biomeOverrides),
    townOverrides: new Map(world.layers.townOverrides),
    events: [...world.layers.events],
    lore: [...world.layers.lore],
    customPlacements: [...world.layers.customPlacements],
  };

  // Merge NPCs
  if (manifest.npcs?.npcs) {
    const existingIds = new Set(updatedWorld.layers.npcs.map((n) => n.id));

    for (const npc of manifest.npcs.npcs) {
      const exists = existingIds.has(npc.id);

      if (!exists || mergeOptions.npcs === "replace") {
        // Add or replace
        if (exists) {
          updatedWorld.layers.npcs = updatedWorld.layers.npcs.filter(
            (n) => n.id !== npc.id,
          );
        }
        updatedWorld.layers.npcs.push({
          id: npc.id,
          name: npc.name,
          npcTypeId: npc.npcTypeId,
          position: npc.position,
          rotation: 0,
          parentContext: npc.townId
            ? { type: "town", townId: npc.townId }
            : npc.buildingId
              ? { type: "building", buildingId: npc.buildingId }
              : { type: "world" },
          dialogId: npc.dialogId,
          storeId: npc.storeId,
          properties: {},
        });
      } else if (mergeOptions.npcs === "merge") {
        // Update existing
        const idx = updatedWorld.layers.npcs.findIndex((n) => n.id === npc.id);
        if (idx >= 0) {
          updatedWorld.layers.npcs[idx] = {
            ...updatedWorld.layers.npcs[idx],
            name: npc.name,
            position: npc.position,
            dialogId: npc.dialogId,
            storeId: npc.storeId,
          };
        }
      }
      // skip_existing: do nothing
    }
  }

  // Merge Bosses
  if (manifest.bosses?.bosses) {
    const existingIds = new Set(updatedWorld.layers.bosses.map((b) => b.id));

    for (const boss of manifest.bosses.bosses) {
      const exists = existingIds.has(boss.id);

      if (!exists || mergeOptions.bosses === "replace") {
        if (exists) {
          updatedWorld.layers.bosses = updatedWorld.layers.bosses.filter(
            (b) => b.id !== boss.id,
          );
        }
        updatedWorld.layers.bosses.push({
          id: boss.id,
          name: boss.name,
          bossTemplateId: boss.templateId,
          position: boss.position,
          arenaBounds: boss.arenaBounds,
          respawnTime: boss.respawnTime,
          requiredLevel: boss.requiredLevel,
          lootTableId: boss.lootTableId,
          isGenerated: boss.isGenerated,
          generatedConfig: boss.generatedConfig,
          properties: {},
        });
      } else if (mergeOptions.bosses === "merge") {
        const idx = updatedWorld.layers.bosses.findIndex(
          (b) => b.id === boss.id,
        );
        if (idx >= 0) {
          updatedWorld.layers.bosses[idx] = {
            ...updatedWorld.layers.bosses[idx],
            name: boss.name,
            position: boss.position,
            requiredLevel: boss.requiredLevel,
          };
        }
      }
    }
  }

  // Merge Quests
  if (manifest.quests?.quests) {
    const existingIds = new Set(updatedWorld.layers.quests.map((q) => q.id));

    for (const quest of manifest.quests.quests) {
      const exists = existingIds.has(quest.id);

      if (!exists || mergeOptions.quests === "replace") {
        if (exists) {
          updatedWorld.layers.quests = updatedWorld.layers.quests.filter(
            (q) => q.id !== quest.id,
          );
        }
        updatedWorld.layers.quests.push({
          id: quest.id,
          name: quest.name,
          questTemplateId: quest.templateId,
          questGiverNpcId: quest.questGiverNpcId,
          turnInNpcId: quest.turnInNpcId,
          requiredLevel: quest.requiredLevel,
          locations: quest.locations.map((loc) => ({
            type: loc.type as "town" | "biome" | "building" | "coordinate",
            id: loc.id,
            position: loc.position,
            description: loc.description,
          })),
          properties: {},
        });
      } else if (mergeOptions.quests === "merge") {
        const idx = updatedWorld.layers.quests.findIndex(
          (q) => q.id === quest.id,
        );
        if (idx >= 0) {
          updatedWorld.layers.quests[idx] = {
            ...updatedWorld.layers.quests[idx],
            name: quest.name,
            requiredLevel: quest.requiredLevel,
          };
        }
      }
    }
  }

  // Merge Difficulty Zones
  if (manifest.difficultyZones?.zones) {
    if (mergeOptions.difficultyZones === "replace") {
      // Replace all zones
      updatedWorld.layers.difficultyZones = manifest.difficultyZones.zones.map(
        (zone) => ({
          id: zone.id,
          name: zone.name,
          difficultyLevel: zone.difficultyLevel,
          zoneType: zone.center ? "voronoi" : "bounds",
          bounds: zone.bounds,
          center: zone.center,
          linkedTownId: zone.linkedTownId,
          isSafeZone: zone.isSafeZone,
          mobLevelRange: zone.mobLevelRange,
          properties: {},
        }),
      );
    } else {
      const existingIds = new Set(
        updatedWorld.layers.difficultyZones.map((z) => z.id),
      );

      for (const zone of manifest.difficultyZones.zones) {
        const exists = existingIds.has(zone.id);

        if (!exists) {
          updatedWorld.layers.difficultyZones.push({
            id: zone.id,
            name: zone.name,
            difficultyLevel: zone.difficultyLevel,
            zoneType: zone.center ? "voronoi" : "bounds",
            bounds: zone.bounds,
            center: zone.center,
            linkedTownId: zone.linkedTownId,
            isSafeZone: zone.isSafeZone,
            mobLevelRange: zone.mobLevelRange,
            properties: {},
          });
        } else if (mergeOptions.difficultyZones === "merge") {
          const idx = updatedWorld.layers.difficultyZones.findIndex(
            (z) => z.id === zone.id,
          );
          if (idx >= 0) {
            updatedWorld.layers.difficultyZones[idx] = {
              ...updatedWorld.layers.difficultyZones[idx],
              name: zone.name,
              difficultyLevel: zone.difficultyLevel,
              mobLevelRange: zone.mobLevelRange,
            };
          }
        }
      }
    }
  }

  // Merge Biome overrides
  if (manifest.biomes?.biomes) {
    for (const biome of manifest.biomes.biomes) {
      const existingOverride = updatedWorld.layers.biomeOverrides.get(biome.id);

      if (!existingOverride || mergeOptions.biomeOverrides === "replace") {
        // Create or replace override
        const override: BiomeOverride = {
          biomeId: biome.id,
        };

        if (
          biome.type !==
          world.foundation.biomes.find((b) => b.id === biome.id)?.type
        ) {
          override.typeOverride = biome.type;
        }

        if (biome.materialConfig) {
          override.materialOverride = {
            baseTextureId: biome.materialConfig.baseTextureId,
            secondaryTextureId: biome.materialConfig.secondaryTextureId,
            blendMode: biome.materialConfig.blendMode as
              | "height"
              | "slope"
              | "noise",
            blendThreshold: 0.5,
            roughness: biome.materialConfig.roughness,
            colorTint: biome.materialConfig.colorTint,
            uvScale: biome.materialConfig.uvScale,
          };
        }

        if (biome.heightConfig) {
          override.heightOverride = biome.heightConfig;
        }

        updatedWorld.layers.biomeOverrides.set(biome.id, override);
      } else if (mergeOptions.biomeOverrides === "merge") {
        // Merge with existing override
        const merged = { ...existingOverride };

        if (biome.materialConfig) {
          merged.materialOverride = {
            ...merged.materialOverride,
            baseTextureId: biome.materialConfig.baseTextureId,
            roughness: biome.materialConfig.roughness,
            colorTint: biome.materialConfig.colorTint,
            uvScale: biome.materialConfig.uvScale,
            blendMode:
              (biome.materialConfig.blendMode as
                | "height"
                | "slope"
                | "noise") || "height",
            blendThreshold: merged.materialOverride?.blendThreshold ?? 0.5,
          };
        }

        if (biome.heightConfig) {
          merged.heightOverride = biome.heightConfig;
        }

        updatedWorld.layers.biomeOverrides.set(biome.id, merged);
      }
    }
  }

  // Update modified timestamp
  updatedWorld.modifiedAt = Date.now();

  return updatedWorld;
}
