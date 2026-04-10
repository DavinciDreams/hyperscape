/**
 * World validation: data validation, migration, game export validation, and reference checking.
 */

import type { WorldData } from "../types";

import type {
  SerializedWorldData,
  SerializedWorldFoundation,
  SerializedWorldLayers,
} from "./worldSerialization";

/** Type guard for SerializedWorldData */
export function validateWorldData(data: unknown): data is SerializedWorldData {
  if (!data || typeof data !== "object") return false;
  const w = data as Partial<SerializedWorldData>;

  // Top-level
  if (typeof w.id !== "string" || typeof w.name !== "string") return false;
  if (typeof w.version !== "number" || typeof w.createdAt !== "number")
    return false;
  if (
    typeof w.modifiedAt !== "number" ||
    typeof w.foundationLocked !== "boolean"
  )
    return false;
  if (!w.foundation || typeof w.foundation !== "object") return false;
  if (!w.layers || typeof w.layers !== "object") return false;

  // Foundation
  const f = w.foundation as Partial<SerializedWorldFoundation>;
  if (typeof f.version !== "number" || typeof f.createdAt !== "number")
    return false;
  if (!f.config || typeof f.config !== "object") return false;
  if (!Array.isArray(f.biomes) || !Array.isArray(f.towns)) return false;
  if (!Array.isArray(f.buildings) || !Array.isArray(f.roads)) return false;

  // Layers
  const l = w.layers as Partial<SerializedWorldLayers>;
  const arrays = [
    l.npcs,
    l.quests,
    l.bosses,
    l.events,
    l.lore,
    l.difficultyZones,
    l.customPlacements,
  ];
  if (!arrays.every(Array.isArray)) return false;
  if (!l.biomeOverrides || typeof l.biomeOverrides !== "object") return false;
  if (!l.townOverrides || typeof l.townOverrides !== "object") return false;

  return true;
}

/** Migrate old world data to current schema */
export function migrateWorldData(
  data: SerializedWorldData,
): SerializedWorldData {
  const migrated: SerializedWorldData = { ...data };
  const now = Date.now();

  migrated.description = data.description ?? "";
  migrated.version = data.version ?? 0;
  migrated.createdAt = data.createdAt ?? now;
  migrated.modifiedAt = data.modifiedAt ?? now;
  migrated.foundationLocked = data.foundationLocked ?? false;

  if (data.foundation) {
    migrated.foundation = {
      version: data.foundation.version ?? 1,
      createdAt: data.foundation.createdAt ?? now,
      config: data.foundation.config,
      biomes: data.foundation.biomes ?? [],
      towns: data.foundation.towns ?? [],
      buildings: data.foundation.buildings ?? [],
      roads: data.foundation.roads ?? [],
    };
  }

  migrated.layers = {
    biomeOverrides: data.layers?.biomeOverrides ?? {},
    townOverrides: data.layers?.townOverrides ?? {},
    npcs: data.layers?.npcs ?? [],
    quests: data.layers?.quests ?? [],
    bosses: data.layers?.bosses ?? [],
    events: data.layers?.events ?? [],
    lore: data.layers?.lore ?? [],
    difficultyZones: data.layers?.difficultyZones ?? [],
    customPlacements: data.layers?.customPlacements ?? [],
  };

  if (migrated.version < 1) migrated.version = 1;

  return migrated;
}

/** Export validation error */
export interface ExportValidationError {
  field: string;
  message: string;
  severity: "error" | "warning";
}

/** Export validation result */
export interface ExportValidationResult {
  valid: boolean;
  errors: ExportValidationError[];
  warnings: ExportValidationError[];
  stats: {
    townCount: number;
    buildingCount: number;
    orphanedBuildings: number;
    emptyTowns: number;
    worldSizeMeters: number;
  };
}

export function validateGameExport(world: WorldData): ExportValidationResult {
  const errors: ExportValidationError[] = [];
  const warnings: ExportValidationError[] = [];

  const config = world.foundation.config;
  const towns = world.foundation.towns;
  const buildings = world.foundation.buildings;

  // Basic validation
  if (!world.id) {
    errors.push({ field: "id", message: "World has no ID", severity: "error" });
  }

  if (!world.name || world.name.trim() === "") {
    errors.push({
      field: "name",
      message: "World has no name",
      severity: "error",
    });
  }

  // Config validation
  if (config.terrain.worldSize < 10) {
    errors.push({
      field: "terrain.worldSize",
      message: "World size must be at least 10 tiles",
      severity: "error",
    });
  }

  if (config.terrain.worldSize > 1000) {
    warnings.push({
      field: "terrain.worldSize",
      message: "World size over 1000 tiles may cause performance issues",
      severity: "warning",
    });
  }

  if (config.seed === 0) {
    warnings.push({
      field: "seed",
      message: "Seed is 0, terrain may be uniform",
      severity: "warning",
    });
  }

  // Town validation
  if (towns.length === 0) {
    warnings.push({
      field: "towns",
      message: "World has no towns - players may have nowhere to spawn",
      severity: "warning",
    });
  }

  const townIds = new Set(towns.map((t) => t.id));
  const townNames = new Map<string, number>();

  for (const town of towns) {
    // Check for valid position
    if (
      isNaN(town.position.x) ||
      isNaN(town.position.y) ||
      isNaN(town.position.z)
    ) {
      errors.push({
        field: `town.${town.id}.position`,
        message: `Town "${town.name}" has invalid position`,
        severity: "error",
      });
    }

    // Check for duplicate names
    const nameCount = townNames.get(town.name) || 0;
    townNames.set(town.name, nameCount + 1);

    // Check for valid size
    if (!["hamlet", "village", "town"].includes(town.size)) {
      warnings.push({
        field: `town.${town.id}.size`,
        message: `Town "${town.name}" has unknown size "${town.size}"`,
        severity: "warning",
      });
    }

    // Check town spacing
    for (const otherTown of towns) {
      if (otherTown.id === town.id) continue;
      const dist = Math.sqrt(
        (town.position.x - otherTown.position.x) ** 2 +
          (town.position.z - otherTown.position.z) ** 2,
      );
      if (dist < 100) {
        warnings.push({
          field: `town.${town.id}.spacing`,
          message: `Towns "${town.name}" and "${otherTown.name}" are very close (${dist.toFixed(0)}m apart)`,
          severity: "warning",
        });
      }
    }
  }

  // Check for duplicate town names
  for (const [name, count] of townNames) {
    if (count > 1) {
      warnings.push({
        field: "towns.names",
        message: `Duplicate town name: "${name}" appears ${count} times`,
        severity: "warning",
      });
    }
  }

  // Building validation
  let orphanedBuildings = 0;
  const buildingsPerTown = new Map<string, number>();

  for (const building of buildings) {
    // Check for valid position
    if (
      isNaN(building.position.x) ||
      isNaN(building.position.y) ||
      isNaN(building.position.z)
    ) {
      errors.push({
        field: `building.${building.id}.position`,
        message: `Building "${building.name}" has invalid position`,
        severity: "error",
      });
    }

    // Check for valid dimensions
    if (building.dimensions.width <= 0 || building.dimensions.depth <= 0) {
      errors.push({
        field: `building.${building.id}.dimensions`,
        message: `Building "${building.name}" has invalid dimensions`,
        severity: "error",
      });
    }

    // Check for orphaned buildings
    if (!townIds.has(building.townId)) {
      orphanedBuildings++;
      warnings.push({
        field: `building.${building.id}.townId`,
        message: `Building "${building.name}" references non-existent town "${building.townId}"`,
        severity: "warning",
      });
    } else {
      const count = buildingsPerTown.get(building.townId) || 0;
      buildingsPerTown.set(building.townId, count + 1);
    }

    // Check for valid building type
    const validTypes = [
      "bank",
      "store",
      "inn",
      "smithy",
      "house",
      "simple-house",
      "long-house",
      "well",
      "anvil",
    ];
    if (!validTypes.includes(building.type)) {
      warnings.push({
        field: `building.${building.id}.type`,
        message: `Building "${building.name}" has custom type "${building.type}" - ensure it's defined in buildingTypes`,
        severity: "warning",
      });
    }
  }

  // Check for empty towns
  let emptyTowns = 0;
  for (const town of towns) {
    const buildingCount = buildingsPerTown.get(town.id) || 0;
    if (buildingCount === 0) {
      emptyTowns++;
      warnings.push({
        field: `town.${town.id}.buildings`,
        message: `Town "${town.name}" has no buildings`,
        severity: "warning",
      });
    }
  }

  // Check world bounds
  const worldSizeMeters = config.terrain.worldSize * config.terrain.tileSize;
  const halfWorld = worldSizeMeters / 2;

  for (const town of towns) {
    // Check if town is within world bounds (assuming centered origin)
    if (
      Math.abs(town.position.x) > halfWorld ||
      Math.abs(town.position.z) > halfWorld
    ) {
      warnings.push({
        field: `town.${town.id}.position`,
        message: `Town "${town.name}" may be outside world bounds`,
        severity: "warning",
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stats: {
      townCount: towns.length,
      buildingCount: buildings.length,
      orphanedBuildings,
      emptyTowns,
      worldSizeMeters,
    },
  };
}

interface ValidationError {
  layer: string;
  itemId: string;
  message: string;
  severity: "error" | "warning";
}

interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

export function validateWorldReferences(world: WorldData): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  const { foundation, layers } = world;

  // Build lookup sets
  const biomeIds = new Set(foundation.biomes.map((b) => b.id));
  const townIds = new Set(foundation.towns.map((t) => t.id));
  const buildingIds = new Set(foundation.buildings.map((b) => b.id));
  const npcIds = new Set(layers.npcs.map((n) => n.id));
  const _bossIds = new Set(layers.bosses.map((b) => b.id)); // Reserved for future boss validation

  // Validate buildings reference valid towns
  for (const building of foundation.buildings) {
    if (!townIds.has(building.townId)) {
      errors.push({
        layer: "buildings",
        itemId: building.id,
        message: `Building "${building.name}" references non-existent town "${building.townId}"`,
        severity: "error",
      });
    }
  }

  // Validate roads reference valid towns
  for (const road of foundation.roads) {
    const [from, to] = road.connectedTowns;
    if (!townIds.has(from)) {
      errors.push({
        layer: "roads",
        itemId: road.id,
        message: `Road references non-existent town "${from}"`,
        severity: "error",
      });
    }
    if (!townIds.has(to)) {
      errors.push({
        layer: "roads",
        itemId: road.id,
        message: `Road references non-existent town "${to}"`,
        severity: "error",
      });
    }
  }

  // Validate NPCs in towns reference valid towns/buildings
  for (const npc of layers.npcs) {
    if (npc.parentContext.type === "town" && npc.parentContext.townId) {
      if (!townIds.has(npc.parentContext.townId)) {
        errors.push({
          layer: "npcs",
          itemId: npc.id,
          message: `NPC "${npc.name}" references non-existent town "${npc.parentContext.townId}"`,
          severity: "error",
        });
      }
    }
    if (npc.parentContext.type === "building" && npc.parentContext.buildingId) {
      if (!buildingIds.has(npc.parentContext.buildingId)) {
        errors.push({
          layer: "npcs",
          itemId: npc.id,
          message: `NPC "${npc.name}" references non-existent building "${npc.parentContext.buildingId}"`,
          severity: "error",
        });
      }
    }
  }

  // Validate quests reference valid NPCs, towns
  for (const quest of layers.quests) {
    // Check quest giver NPC
    if (quest.questGiverNpcId && !npcIds.has(quest.questGiverNpcId)) {
      errors.push({
        layer: "quests",
        itemId: quest.id,
        message: `Quest "${quest.name}" references non-existent quest giver NPC "${quest.questGiverNpcId}"`,
        severity: "error",
      });
    }

    // Check turn-in NPC
    if (quest.turnInNpcId && !npcIds.has(quest.turnInNpcId)) {
      errors.push({
        layer: "quests",
        itemId: quest.id,
        message: `Quest "${quest.name}" references non-existent turn-in NPC "${quest.turnInNpcId}"`,
        severity: "error",
      });
    }

    // Check locations
    for (const location of quest.locations) {
      if (
        location.type === "town" &&
        location.id &&
        !townIds.has(location.id)
      ) {
        errors.push({
          layer: "quests",
          itemId: quest.id,
          message: `Quest "${quest.name}" references non-existent town "${location.id}"`,
          severity: "error",
        });
      }
      if (
        location.type === "building" &&
        location.id &&
        !buildingIds.has(location.id)
      ) {
        errors.push({
          layer: "quests",
          itemId: quest.id,
          message: `Quest "${quest.name}" references non-existent building "${location.id}"`,
          severity: "error",
        });
      }
    }
  }

  // Validate difficulty zones have reasonable bounds
  for (const zone of layers.difficultyZones) {
    if (
      zone.bounds.minX >= zone.bounds.maxX ||
      zone.bounds.minZ >= zone.bounds.maxZ
    ) {
      warnings.push({
        layer: "difficultyZones",
        itemId: zone.id,
        message: `Difficulty zone "${zone.name}" has invalid bounds (min >= max)`,
        severity: "warning",
      });
    }
  }

  // Check for orphaned biome overrides
  for (const [biomeId] of layers.biomeOverrides) {
    if (!biomeIds.has(biomeId)) {
      warnings.push({
        layer: "biomeOverrides",
        itemId: biomeId,
        message: `Biome override references non-existent biome "${biomeId}"`,
        severity: "warning",
      });
    }
  }

  // Check for orphaned town overrides
  for (const [townId] of layers.townOverrides) {
    if (!townIds.has(townId)) {
      warnings.push({
        layer: "townOverrides",
        itemId: townId,
        message: `Town override references non-existent town "${townId}"`,
        severity: "warning",
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
