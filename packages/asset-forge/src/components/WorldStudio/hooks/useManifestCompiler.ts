/**
 * useManifestCompiler — Compiles WorldProject data into deployment manifest format
 *
 * Transforms the editor's structured world data (placements, overrides, configs)
 * into the 38+ manifest JSON files that the game server expects.
 *
 * Used by the deployment pipeline when pushing to staging.
 */

import { useCallback } from "react";

import type { WorldData } from "../../WorldBuilder/types";
import type {
  ExtendedWorldLayers,
  AudioLayers,
  ManifestData,
  BrushOverlays,
  DeploymentDiff,
  ManifestDiffEntry,
} from "../types";
import { MANIFEST_REGISTRY } from "../types";
import type {
  CompiledWorldJson,
  CompiledWorldArea,
  CompiledMobSpawnPoint,
  CompiledBiomeResource,
  CompiledNPCLocation,
  CompiledStationLocation,
} from "../types/compiledManifests";
import {
  TOWN_STATION_SEARCH_RADIUS,
  getTownSafeRadius,
} from "../utils/worldConstants";
import { getBiomeTypeDefaults } from "../utils/biomeTypeDefaults";

/** Compiled manifest output: filename → JSON content */
export interface CompiledManifests {
  files: Map<string, unknown>;
  worldJson: CompiledWorldJson;
}

/**
 * Compile world data into world.json entity spawn definitions.
 * The server loads entities from this file separately from manifests.
 */
function compileWorldJson(
  world: WorldData,
  extendedLayers: ExtendedWorldLayers,
  vegetationTrees?: Array<{
    s: string;
    x: number;
    y: number;
    z: number;
    sc: number;
    r: number;
  }>,
): CompiledWorldJson {
  // Compile NPC placements
  const npcs = world.layers.npcs.map((npc) => ({
    id: npc.id,
    npcTypeId: npc.npcTypeId,
    name: npc.name,
    position: npc.position,
    rotation: npc.rotation,
    context: npc.parentContext,
    storeId: npc.storeId,
    dialogId: npc.dialogId,
  }));

  // Compile mob spawns
  // NOTE: Runtime reads `respawnTime` (MobNPCSpawnerSystem:489), NOT `respawnTicks`
  const mobSpawns = extendedLayers.mobSpawns.map((ms) => ({
    id: ms.id,
    mobId: ms.mobId,
    name: ms.name,
    position: ms.position,
    spawnRadius: ms.spawnRadius,
    maxCount: ms.maxCount,
    respawnTime: ms.respawnTicks, // field renamed to match runtime expectation
  }));

  // Compile resources
  const resources = extendedLayers.resources.map((r) => ({
    id: r.id,
    resourceId: r.resourceId,
    resourceType: r.resourceType,
    name: r.name,
    position: r.position,
    rotation: r.rotation,
    modelVariant: r.modelVariant,
  }));

  // Compile stations
  const stations = extendedLayers.stations.map((s) => ({
    id: s.id,
    stationType: s.stationType,
    name: s.name,
    position: s.position,
    rotation: s.rotation,
  }));

  // Compile spawn points
  const spawnPoints = extendedLayers.spawnPoints.map((sp) => ({
    id: sp.id,
    name: sp.name,
    position: sp.position,
    rotation: sp.rotation,
    spawnType: sp.spawnType,
    capacity: sp.capacity,
    linkedAreaId: sp.linkedAreaId,
  }));

  // Compile teleports (includes requirements + cost for runtime TeleportSystem)
  const teleports = extendedLayers.teleports.map((tp) => ({
    id: tp.id,
    name: tp.name,
    position: tp.position,
    connections: tp.connections,
    type: (tp.properties?.type as string) ?? "lodestone",
    requirements: tp.requirements,
    cost: tp.cost,
  }));

  // Compile POIs
  const pois = extendedLayers.pois.map((poi) => ({
    id: poi.id,
    name: poi.name,
    position: poi.position,
    category: poi.category,
    importance: poi.importance,
    radius: poi.radius,
  }));

  // Compile mine areas (bowl terrain + ore clusters)
  const mines = (extendedLayers.mines ?? []).map((mine) => ({
    id: mine.id,
    position: mine.position,
    radius: mine.radius,
    radialOffsets: mine.radialOffsets,
    entryAngle: mine.entryAngle,
    biome: mine.biome,
  }));

  return {
    version: 1,
    name: world.name,
    entities: {
      npcs,
      mobSpawns,
      resources,
      stations,
      spawnPoints,
      teleports,
      pois,
      mines,
      trees: vegetationTrees,
    },
    metadata: {
      compiledAt: new Date().toISOString(),
      worldSize: world.foundation.config.terrain.worldSize,
      tileSize: world.foundation.config.terrain.tileSize,
    },
  };
}

/**
 * Compile world-config.json — terrain generation parameters for the game client.
 * Maps WorldCreationConfig → WorldConfigManifest shape so the game's
 * TerrainSystem, TownSystem, VegetationSystem, etc. can reproduce the world.
 */
function compileWorldConfig(world: WorldData): Record<string, unknown> {
  const cfg = world.foundation.config;
  return {
    version: 1,
    seed: cfg.seed,
    terrain: {
      tileSize: cfg.terrain.tileSize,
      worldSize: cfg.terrain.worldSize,
      tileResolution: cfg.terrain.tileResolution,
      maxHeight: cfg.terrain.maxHeight,
      waterThreshold: cfg.terrain.waterThreshold,
      biomeScale: 1.0,
      fogNear: 150,
      fogFar: 350,
      cameraFar: 400,
    },
    towns: {
      townCount: cfg.towns.townCount,
      minTownSpacing: cfg.towns.minTownSpacing,
      flatnessSampleRadius: 40,
      flatnessSampleCount: 16,
      waterThreshold: cfg.terrain.waterThreshold,
      optimalWaterDistanceMin: 30,
      optimalWaterDistanceMax: 150,
      townSizes: {
        hamlet: { minBuildings: 2, maxBuildings: 4, radius: 30 },
        village: { minBuildings: 4, maxBuildings: 8, radius: 50 },
        town: { minBuildings: 8, maxBuildings: 16, radius: 80 },
      },
      buildingTypes: {},
      biomeSuitability: cfg.towns.biomePreferences ?? {},
    },
    roads: {
      roadWidth: cfg.roads.roadWidth,
      pathStepSize: cfg.roads.pathStepSize,
      maxPathIterations: 10000,
      extraConnectionsRatio: cfg.roads.extraConnectionsRatio,
      smoothingIterations: cfg.roads.smoothingIterations,
      noiseDisplacementScale: 0.01,
      noiseDisplacementStrength: 3,
      minPointSpacing: 4,
      costBiomeMultipliers: {},
      costBase: 1.0,
      costSlopeMultiplier: cfg.roads.costSlopeMultiplier,
      costWaterPenalty: cfg.roads.costWaterPenalty,
      heuristicWeight: cfg.roads.heuristicWeight,
    },
  };
}

/** Categorized world areas matching the DataManager expected format */
interface CategorizedWorldAreas {
  starterTowns: Record<string, CompiledWorldArea>;
  level1Areas: Record<string, CompiledWorldArea>;
  level2Areas: Record<string, CompiledWorldArea>;
  level3Areas: Record<string, CompiledWorldArea>;
}

/**
 * Compile world areas in the full WorldArea format the game expects.
 *
 * Each town → one WorldArea with safeZone: true
 * Each auto-gen zone/region → one WorldArea with tier-derived difficulty
 *
 * Returns categorized object { starterTowns, level1Areas, level2Areas, level3Areas }
 * where each value is Record<string, WorldArea> keyed by area ID.
 */
function compileWorldAreas(
  world: WorldData,
  extendedLayers: ExtendedWorldLayers,
): CategorizedWorldAreas {
  const areas: CompiledWorldArea[] = [];

  // Compile towns as safe WorldAreas
  for (const town of world.foundation.towns) {
    const safeRadius = getTownSafeRadius(town);
    const townNpcs: CompiledNPCLocation[] = world.layers.npcs
      .filter(
        (n) =>
          n.parentContext.type === "town" && n.parentContext.townId === town.id,
      )
      .map((npc) => ({
        id: npc.id, // placement-unique ID, not npcTypeId
        type: "general_store" as const,
        position: npc.position,
        name: npc.name,
        storeId: npc.storeId,
      }));

    const townStations: CompiledStationLocation[] = extendedLayers.stations
      .filter((s) => {
        const dx = s.position.x - town.position.x;
        const dz = s.position.z - town.position.z;
        return Math.sqrt(dx * dx + dz * dz) < TOWN_STATION_SEARCH_RADIUS;
      })
      .map((s) => ({
        id: s.id,
        type: s.stationType,
        position: s.position,
        rotation: s.rotation,
      }));

    areas.push({
      id: town.id,
      name: town.name,
      description: `${town.size.charAt(0).toUpperCase() + town.size.slice(1)} of ${town.name}`,
      difficultyLevel: 0,
      bounds: {
        minX: town.position.x - safeRadius,
        maxX: town.position.x + safeRadius,
        minZ: town.position.z - safeRadius,
        maxZ: town.position.z + safeRadius,
      },
      biomeType: "town",
      safeZone: true,
      npcs: townNpcs,
      resources: [],
      mobSpawns: [],
      stations: townStations,
    });
  }

  // Compile regions/zones as WorldAreas
  for (const region of extendedLayers.regions) {
    // Determine bounds from autoGenBounds or tile keys
    let bounds = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
    if (region.autoGenBounds?.boundingBox) {
      bounds = region.autoGenBounds.boundingBox;
    }

    // Map tier to difficultyLevel (0-3)
    let difficultyLevel: 0 | 1 | 2 | 3 = 0;
    if (region.autoGenBounds) {
      const scalar = region.autoGenBounds.difficultyRange[0];
      if (scalar >= 0.5) difficultyLevel = 3;
      else if (scalar >= 0.3) difficultyLevel = 2;
      else if (scalar >= 0.05) difficultyLevel = 1;
    }

    // Determine biome
    const biomeType =
      region.autoGenBounds?.biomeFilter ?? region.biomeOverride ?? "unknown";

    // Gather entities within this region
    const regionMobs: CompiledMobSpawnPoint[] = extendedLayers.mobSpawns
      .filter((m) => m.sourceRegionId === region.id)
      .map((m) => ({
        mobId: m.mobId,
        position: m.position,
        spawnRadius: m.spawnRadius,
        maxCount: m.maxCount,
        respawnTime: m.respawnTicks,
      }));

    const regionResources: CompiledBiomeResource[] = extendedLayers.resources
      .filter((r) => r.sourceRegionId === region.id)
      .map((r) => ({
        type: resourceTypeToCompiled(r.resourceType),
        position: r.position,
        resourceId: r.resourceId,
        respawnTime: 100,
        level: 1,
      }));

    // Fishing spots within region
    const fishingResources = extendedLayers.resources.filter(
      (r) => r.sourceRegionId === region.id && r.resourceType === "fishing",
    );
    const fishing =
      fishingResources.length > 0
        ? {
            enabled: true,
            spotCount: fishingResources.length,
            spotTypes: [...new Set(fishingResources.map((f) => f.resourceId))],
          }
        : undefined;

    const regionStations: CompiledStationLocation[] = extendedLayers.stations
      .filter((s) => s.sourceRegionId === region.id)
      .map((s) => ({
        id: s.id,
        type: s.stationType,
        position: s.position,
        rotation: s.rotation,
      }));

    areas.push({
      id: region.id,
      name: region.name,
      description: region.description ?? `${biomeType} zone`,
      difficultyLevel,
      bounds,
      biomeType,
      safeZone: difficultyLevel === 0,
      npcs: [],
      resources: regionResources,
      mobSpawns: regionMobs,
      fishing,
      stations: regionStations.length > 0 ? regionStations : undefined,
    });
  }

  // Categorize areas by difficulty level (matches DataManager expected format)
  const result: CategorizedWorldAreas = {
    starterTowns: {},
    level1Areas: {},
    level2Areas: {},
    level3Areas: {},
  };
  for (const area of areas) {
    if (area.safeZone || area.difficultyLevel === 0) {
      result.starterTowns[area.id] = area;
    } else if (area.difficultyLevel === 1) {
      result.level1Areas[area.id] = area;
    } else if (area.difficultyLevel === 2) {
      result.level2Areas[area.id] = area;
    } else {
      result.level3Areas[area.id] = area;
    }
  }
  return result;
}

function resourceTypeToCompiled(
  type: string,
): "tree" | "fishing_spot" | "mine" | "herb_patch" {
  switch (type) {
    case "woodcutting":
      return "tree";
    case "fishing":
      return "fishing_spot";
    case "mining":
      return "mine";
    default:
      return "herb_patch";
  }
}

/**
 * Compile biomes.json with full BiomeData for each biome.
 *
 * Merges: biome type defaults → generated biome data → editor overrides
 * so the game receives complete BiomeData with all required fields.
 */
function compileBiomes(world: WorldData): unknown[] {
  return world.foundation.biomes.map((biome) => {
    const override = world.layers.biomeOverrides.get(biome.id);
    const effectiveType = override?.typeOverride ?? biome.type;
    const defaults = getBiomeTypeDefaults(effectiveType);

    // Start with full defaults for this biome type
    const compiled: Record<string, unknown> = {
      // Core identifiers
      id: biome.id,
      name: defaults.name,
      description: defaults.description,

      // Difficulty & terrain
      difficultyLevel: override?.difficultyOverride ?? defaults.difficultyLevel,
      terrain: effectiveType,

      // Resources & mobs
      resources: defaults.resources,
      mobs: defaults.mobs,
      mobTypes: defaults.mobTypes,

      // Atmosphere & visuals
      fogIntensity: defaults.fogIntensity,
      ambientSound: override?.ambientSoundOverride ?? defaults.ambientSound,
      colorScheme: override?.colorSchemeOverride ?? defaults.colorScheme,
      color: biome.color ?? defaults.color,

      // Terrain parameters
      heightRange: defaults.heightRange,
      terrainMultiplier: defaults.terrainMultiplier,
      waterLevel: defaults.waterLevel,
      maxSlope: defaults.maxSlope,
      difficulty: override?.difficultyOverride ?? defaults.difficulty,
      baseHeight: defaults.baseHeight,
      heightVariation: defaults.heightVariation,

      // Resource density
      resourceDensity: defaults.resourceDensity,
      resourceTypes: defaults.resourceTypes,

      // Tile assignment (from procgen)
      tileKeys: biome.tileKeys,

      // Vegetation (editor override takes precedence)
      vegetation: override?.vegetationOverride ?? defaults.vegetation,
    };

    // Apply height overrides from editor
    if (override?.heightOverride) {
      compiled.heightRange = [
        override.heightOverride.minHeight,
        override.heightOverride.maxHeight,
      ];
      compiled.heightVariation = override.heightOverride.variance;
    }

    // Apply mob spawn config overrides
    if (
      override?.mobSpawnConfig?.enabled &&
      override.mobSpawnConfig.spawnTable.length > 0
    ) {
      const mobIds = override.mobSpawnConfig.spawnTable.map(
        (entry) => entry.mobTypeId,
      );
      compiled.mobs = mobIds;
      compiled.mobTypes = mobIds;
    }

    return compiled;
  });
}

/**
 * Compile regions.json from tile-based named regions.
 */
function compileRegions(
  extendedLayers: ExtendedWorldLayers,
): Record<string, unknown> {
  return {
    regions: extendedLayers.regions.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      tileKeys: r.tileKeys,
      tags: r.tags,
      biomeOverride: r.biomeOverride,
      musicTrack: r.musicTrack,
      ambientSound: r.ambientSound,
      spawnRules: r.spawnRules,
      ...(r.autoGenBounds
        ? {
            autoGenBounds: {
              difficultyRange: r.autoGenBounds.difficultyRange,
              biomeFilter: r.autoGenBounds.biomeFilter,
              boundingBox: r.autoGenBounds.boundingBox,
              generationSeed: r.autoGenBounds.generationSeed,
              generatedAt: r.autoGenBounds.generatedAt,
            },
          }
        : {}),
    })),
  };
}

/**
 * Compile danger-sources.json from danger source placements.
 */
function compileDangerSources(
  extendedLayers: ExtendedWorldLayers,
): Record<string, unknown> {
  return {
    sources: extendedLayers.dangerSources.map((ds) => ({
      id: ds.id,
      name: ds.name,
      position: { x: ds.position.x, z: ds.position.z },
      radius: ds.radius,
      intensity: ds.intensity,
      falloffCurve: ds.falloffCurve,
    })),
  };
}

/**
 * Compile brush-overlays.json from terrain sculpt and biome paint strokes.
 * These strokes are replayed at runtime by TerrainSystem to bake designer
 * edits into procedurally generated tiles.
 */
function compileBrushOverlays(
  brushOverlays: BrushOverlays,
): Record<string, unknown> | null {
  const hasSculpts = brushOverlays.terrainSculpts.length > 0;
  const hasPaints = brushOverlays.biomePaints.length > 0;
  const hasCollisions = brushOverlays.tileCollisions.length > 0;
  const hasVegetation = brushOverlays.vegetationPaints.length > 0;
  const hasMaterials = brushOverlays.materialPaints.length > 0;

  if (
    !hasSculpts &&
    !hasPaints &&
    !hasCollisions &&
    !hasVegetation &&
    !hasMaterials
  )
    return null;

  return {
    version: 1,
    terrainSculpts: brushOverlays.terrainSculpts.map((s) => ({
      id: s.id,
      center: { x: s.center.x, z: s.center.z },
      radius: s.radius,
      strength: s.strength,
      falloff: s.falloff,
      mode: s.mode,
      ...(s.flattenTarget != null ? { flattenTarget: s.flattenTarget } : {}),
    })),
    biomePaints: brushOverlays.biomePaints.map((p) => ({
      id: p.id,
      center: { x: p.center.x, z: p.center.z },
      radius: p.radius,
      strength: p.strength,
      falloff: p.falloff,
      targetBiome: p.targetBiome,
    })),
    vegetationPaints: brushOverlays.vegetationPaints.map((v) => ({
      id: v.id,
      center: { x: v.center.x, z: v.center.z },
      radius: v.radius,
      strength: v.strength,
      falloff: v.falloff,
      mode: v.mode,
      speciesFilter: v.speciesFilter,
      timestamp: v.timestamp,
    })),
    materialPaints: brushOverlays.materialPaints.map((m) => ({
      id: m.id,
      center: { x: m.center.x, z: m.center.z },
      radius: m.radius,
      strength: m.strength,
      falloff: m.falloff,
      targetMaterial: m.targetMaterial,
      timestamp: m.timestamp,
    })),
    tileCollisions: brushOverlays.tileCollisions.map((c) => ({
      tileX: c.tileX,
      tileZ: c.tileZ,
      blocked: c.blocked,
      ...(c.edges ? { edges: c.edges } : {}),
    })),
    metadata: {
      sculptCount: brushOverlays.terrainSculpts.length,
      paintCount: brushOverlays.biomePaints.length,
      vegetationCount: brushOverlays.vegetationPaints.length,
      materialPaintCount: brushOverlays.materialPaints.length,
      collisionCount: brushOverlays.tileCollisions.length,
    },
  };
}

/**
 * Compile wilderness-boundary.json from wilderness boundary polyline.
 */
function compileWildernessBoundary(
  extendedLayers: ExtendedWorldLayers,
): Record<string, unknown> | null {
  const wb = extendedLayers.wildernessBoundary;
  if (!wb) return null;
  return {
    points: wb.points,
    levelScale: wb.levelScale,
    maxLevel: wb.maxLevel,
  };
}

/**
 * Compile music.json from audio layers.
 */
function compileMusic(audioLayers: AudioLayers): Record<string, unknown> {
  return {
    tracks: audioLayers.musicZones.map((mz) => ({
      id: mz.trackId,
      name: mz.name,
      combatTrack: mz.combatTrackId,
      region: {
        polygon: mz.polygon,
        priority: mz.priority,
        blendDistance: mz.blendDistance,
      },
    })),
    ambientZones: audioLayers.ambientZones.map((az) => ({
      id: az.id,
      name: az.name,
      type: az.ambientType,
      tracks: az.tracks,
      polygon: az.polygon,
      volume: az.volume,
      falloffDistance: az.falloffDistance,
    })),
  };
}

/**
 * Compile buildings.json in BuildingsManifest format.
 *
 * Maps WorldFoundation towns + buildings into the format expected by
 * DataManager.getBuildingsManifest() and TownSystem/BuildingRenderingSystem.
 */
function compileBuildings(world: WorldData): Record<string, unknown> {
  const sizeMap: Record<string, string> = {
    hamlet: "sm",
    village: "md",
    town: "lg",
  };

  const towns = world.foundation.towns.map((town) => {
    // Building positions in foundation are absolute world coordinates,
    // but TownSystem expects positions RELATIVE to town center
    // (it adds town.position + building.position in convertManifestTown)
    const tx = town.position.x;
    const ty = town.position.y;
    const tz = town.position.z;

    let townBuildings = world.foundation.buildings
      .filter((b) => b.townId === town.id)
      .map((b) => ({
        id: b.id,
        type: b.type,
        position: {
          x: b.position.x - tx,
          y: b.position.y - ty,
          z: b.position.z - tz,
        },
        rotation: b.rotation,
        size: { width: b.dimensions.width, depth: b.dimensions.depth },
      }));

    // Generate default buildings if the town has none — TownSystem requires at least one
    if (townBuildings.length === 0) {
      const spacing = 8;
      townBuildings = [
        {
          id: `${town.id}_bank`,
          type: "bank",
          position: { x: -spacing, y: 0, z: 0 },
          rotation: 0,
          size: { width: 4, depth: 4 },
        },
        {
          id: `${town.id}_store`,
          type: "store",
          position: { x: spacing, y: 0, z: 0 },
          rotation: 0,
          size: { width: 4, depth: 4 },
        },
      ];
    }

    return {
      id: town.id,
      name: town.name,
      position: { x: town.position.x, y: town.position.y, z: town.position.z },
      size: sizeMap[town.size] ?? "md",
      keep: true,
      safeZoneRadius: town.safeZoneRadius ?? getTownSafeRadius(town),
      buildings: townBuildings,
    };
  });

  return {
    version: 1,
    towns,
    buildingTypes: {
      bank: {
        label: "Bank",
        widthRange: [3, 4],
        depthRange: [3, 4],
        floors: 1,
        hasBasement: false,
      },
      store: {
        label: "Store",
        widthRange: [3, 5],
        depthRange: [3, 5],
        floors: 1,
        hasBasement: false,
      },
      anvil: {
        label: "Anvil",
        widthRange: [2, 3],
        depthRange: [2, 3],
        floors: 1,
        hasBasement: false,
      },
      house: {
        label: "House",
        widthRange: [3, 5],
        depthRange: [3, 5],
        floors: 1,
        hasBasement: false,
      },
      well: {
        label: "Well",
        widthRange: [1, 2],
        depthRange: [1, 2],
        floors: 1,
        hasBasement: false,
      },
      inn: {
        label: "Inn",
        widthRange: [4, 6],
        depthRange: [4, 6],
        floors: 2,
        hasBasement: false,
      },
      smithy: {
        label: "Smithy",
        widthRange: [3, 5],
        depthRange: [3, 5],
        floors: 1,
        hasBasement: false,
      },
      "simple-house": {
        label: "Simple House",
        widthRange: [2, 4],
        depthRange: [2, 4],
        floors: 1,
        hasBasement: false,
      },
      "long-house": {
        label: "Long House",
        widthRange: [4, 7],
        depthRange: [3, 4],
        floors: 1,
        hasBasement: false,
      },
      church: {
        label: "Church",
        widthRange: [4, 6],
        depthRange: [5, 8],
        floors: 1,
        hasBasement: false,
      },
      chapel: {
        label: "Chapel",
        widthRange: [3, 4],
        depthRange: [4, 6],
        floors: 1,
        hasBasement: false,
      },
      keep: {
        label: "Keep",
        widthRange: [5, 7],
        depthRange: [5, 7],
        floors: 2,
        hasBasement: true,
      },
    },
    sizeDefinitions: {
      sm: {
        label: "Hamlet",
        minBuildings: 2,
        maxBuildings: 4,
        radius: 30,
        safeZoneRadius: 50,
      },
      md: {
        label: "Village",
        minBuildings: 4,
        maxBuildings: 8,
        radius: 50,
        safeZoneRadius: 80,
      },
      lg: {
        label: "Town",
        minBuildings: 8,
        maxBuildings: 16,
        radius: 80,
        safeZoneRadius: 120,
      },
    },
  };
}

/**
 * Compute a diff between compiled manifests and currently deployed manifests.
 */
/** Phase 5.5: Human-readable entity labels per manifest file */
const MANIFEST_ENTITY_LABELS: Record<string, string> = {
  "npcs.json": "NPCs",
  "world-areas.json": "areas",
  "biomes.json": "biomes",
  "items.json": "items",
  "quests.json": "quests",
  "dialogue.json": "dialogue trees",
  "mobs.json": "mobs",
  "mob-spawns.json": "mob spawns",
  "stores.json": "stores",
  "prayers.json": "prayers",
  "skills.json": "skills",
  "recipes.json": "recipes",
  "gathering.json": "gathering nodes",
  "fishing.json": "fishing spots",
  "music.json": "music tracks",
  "roads.json": "roads",
  "vegetation.json": "vegetation types",
  "buildings.json": "buildings",
  "regions.json": "regions",
  "danger-sources.json": "danger sources",
  "equipment.json": "equipment",
  "loot-tables.json": "loot tables",
  "world-config.json": "config",
};

function computeDiff(
  compiled: CompiledManifests,
  deployed: Record<string, unknown>,
): DeploymentDiff {
  const manifests: ManifestDiffEntry[] = [];
  let totalAdded = 0;
  let totalModified = 0;
  let totalRemoved = 0;

  for (const entry of MANIFEST_REGISTRY) {
    const compiledData = compiled.files.get(entry.filename);
    const deployedData = deployed[entry.filename];

    if (!compiledData && !deployedData) {
      continue;
    }

    const compiledStr = JSON.stringify(compiledData ?? null);
    const deployedStr = JSON.stringify(deployedData ?? null);

    let changeType: ManifestDiffEntry["changeType"] = "unchanged";
    let entriesAdded = 0;
    let entriesModified = 0;
    let entriesRemoved = 0;

    if (!deployedData && compiledData) {
      changeType = "added";
      entriesAdded = Array.isArray(compiledData) ? compiledData.length : 1;
    } else if (deployedData && !compiledData) {
      changeType = "removed";
      entriesRemoved = Array.isArray(deployedData) ? deployedData.length : 1;
    } else if (compiledStr !== deployedStr) {
      changeType = "modified";
      // Rough estimation: count array length differences
      if (Array.isArray(compiledData) && Array.isArray(deployedData)) {
        entriesAdded = Math.max(0, compiledData.length - deployedData.length);
        entriesRemoved = Math.max(0, deployedData.length - compiledData.length);
        entriesModified = Math.min(compiledData.length, deployedData.length);
      } else {
        entriesModified = 1;
      }
    }

    if (changeType !== "unchanged") {
      totalAdded += entriesAdded;
      totalModified += entriesModified;
      totalRemoved += entriesRemoved;

      // Phase 5.5: Entity-level diff summaries
      const entityLabel = MANIFEST_ENTITY_LABELS[entry.filename] ?? "entries";
      const parts: string[] = [];
      if (entriesAdded > 0) parts.push(`${entriesAdded} ${entityLabel} added`);
      if (entriesModified > 0)
        parts.push(`${entriesModified} ${entityLabel} modified`);
      if (entriesRemoved > 0)
        parts.push(`${entriesRemoved} ${entityLabel} removed`);

      manifests.push({
        filename: entry.filename,
        category: entry.category,
        changeType,
        entriesAdded,
        entriesModified,
        entriesRemoved,
        summary: parts.join(", ") || changeType,
      });
    }
  }

  return {
    manifests,
    assetChanges: [], // TODO: track asset file changes
    totalAdded,
    totalModified,
    totalRemoved,
  };
}

/**
 * Compile roads.json — pre-computed road network from World Studio.
 * When present, RoadNetworkSystem uses these instead of regenerating via BFS.
 */
function compileRoads(world: WorldData): unknown[] {
  // Merge generated roads with user-authored custom roads
  const generated = world.foundation.roads.map((road) => ({
    id: road.id,
    path: road.path.map((p) => ({ x: p.x, y: p.y, z: p.z })),
    width: road.width,
    fromTownId: road.connectedTowns[0],
    toTownId: road.connectedTowns[1],
    isMainRoad: road.isMainRoad,
  }));

  const custom = world.layers.customRoads.map((road) => ({
    id: road.id,
    path: road.path.map((p) => ({ x: p.x, y: p.y, z: p.z })),
    width: road.width,
    fromTownId: null,
    toTownId: null,
    isMainRoad: false,
    isCustom: true,
    name: road.name,
  }));

  return [...generated, ...custom];
}

export function useManifestCompiler() {
  /**
   * Compile all world data into deployable manifest files.
   */
  const compile = useCallback(
    (
      world: WorldData,
      extendedLayers: ExtendedWorldLayers,
      audioLayers: AudioLayers,
      manifests: ManifestData,
      brushOverlays: BrushOverlays,
      vegetationTrees?: Array<{
        s: string;
        x: number;
        y: number;
        z: number;
        sc: number;
        r: number;
      }>,
    ): CompiledManifests => {
      const files = new Map<string, unknown>();

      // world.json — entity spawn definitions (separate from manifests)
      const worldJson = compileWorldJson(
        world,
        extendedLayers,
        vegetationTrees,
      );

      // world-config.json — terrain/town/road generation parameters
      files.set("world-config.json", compileWorldConfig(world));

      // world-areas.json
      files.set("world-areas.json", compileWorldAreas(world, extendedLayers));

      // biomes.json
      files.set("biomes.json", compileBiomes(world));

      // buildings.json
      if (world.foundation.towns.length > 0) {
        files.set("buildings.json", compileBuildings(world));
      }

      // roads.json — pre-computed road network + custom roads
      if (
        world.foundation.roads.length > 0 ||
        world.layers.customRoads.length > 0
      ) {
        files.set("roads.json", compileRoads(world));
      }

      // music.json
      files.set("music.json", compileMusic(audioLayers));

      // regions.json
      if (extendedLayers.regions.length > 0) {
        files.set("regions.json", compileRegions(extendedLayers));
      }

      // danger-sources.json
      if (extendedLayers.dangerSources.length > 0) {
        files.set("danger-sources.json", compileDangerSources(extendedLayers));
      }

      // wilderness-boundary.json
      const wb = compileWildernessBoundary(extendedLayers);
      if (wb) {
        files.set("wilderness-boundary.json", wb);
      }

      // brush-overlays.json — terrain sculpt + biome paint strokes for runtime replay
      const bo = compileBrushOverlays(brushOverlays);
      if (bo) {
        files.set("brush-overlays.json", bo);
      }

      // Pass through manifest data that was loaded from server
      // (items, quests, npcs, etc. may have been edited via manifest browser)
      if (manifests.rawManifests) {
        for (const [name, content] of Object.entries(manifests.rawManifests)) {
          if (content != null) {
            files.set(name, content);
          }
        }
      }

      return { files, worldJson };
    },
    [],
  );

  /**
   * Compute diff between compiled state and currently deployed state.
   */
  const diff = useCallback(
    (
      compiled: CompiledManifests,
      deployed: Record<string, unknown>,
    ): DeploymentDiff => {
      return computeDiff(compiled, deployed);
    },
    [],
  );

  return { compile, diff };
}
