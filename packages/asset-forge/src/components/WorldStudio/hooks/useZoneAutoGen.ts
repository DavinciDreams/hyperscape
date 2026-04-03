/**
 * useZoneAutoGen — One-click zone generation pipeline (orchestrator)
 *
 * Thin React hook that wires pipeline stages together:
 *   1. scanLandBounds + sampleDifficultyGrid (grid sampling)
 *   2. floodFillZones + cleanupZones (zone extraction)
 *   3. nameZones (naming)
 *   4. deriveSpawnRules (spawn table derivation)
 *   5. populateEntities (two-phase entity scatter)
 *
 * Pipeline stages live in ../pipeline/ for single-responsibility and testability.
 */

import { useCallback } from "react";

import { NoiseGenerator } from "@hyperscape/procgen/terrain";

import {
  computeZoneDifficulty,
  withBiomeDifficultyFallback,
  DEFAULT_ZONE_DIFFICULTY_CONFIG,
  type ZoneDifficultyConfig,
  type TownInfo,
  type DangerSourceInfo,
  type BiomeQuerier,
  type BiomeDifficultyLookup,
} from "../../WorldBuilder/DifficultyHeatmap";

import type {
  PlacedRegion,
  PlacedSpawnPoint,
  PlacedTeleport,
  DifficultyTierConfig,
  AutoGenBounds,
  AutoGenConfig,
  AutoGenResult,
  AutoGenStats,
  AutoGenZone,
  ManifestData,
} from "../types";
import { useWorldStudio } from "../WorldStudioContext";
import {
  HAND_PLACED_ENTITY_BUFFER,
  getTownSafeRadius,
} from "../utils/worldConstants";

// Pipeline stages
import {
  floodFillZones,
  cleanupZones,
  zoneCentroid,
  zoneBounds,
  type GridCell,
} from "../pipeline/zoneFloodFill";
import { nameZones } from "../pipeline/zoneNaming";
import { deriveSpawnRules } from "../pipeline/spawnTableBuilder";
import {
  populateEntities,
  type ExistingEntityPosition,
} from "../pipeline/entityPopulator";

// ============== DEFAULT TIER CONFIG ==============

// Tier scalar ranges calibrated to the distance-primary auto-gen formula:
//   scalar = distanceFromTown/(worldRadius*0.75) * biomeModifier + noise
//
// With biome modifiers (0.5 → 1.5), scalars at key distances from town:
//   100m  plains(0.60):  0.13*0.60=0.08  tundra(1.50): 0.13*1.50=0.20
//   250m  plains: 0.22   tundra: 0.50
//   500m  plains: 0.40   tundra: 1.00
//   750m+ plains: 0.60   tundra: 1.50 (clamped to 1.0)
//
// This gives every biome 4-6 visible tiers as you walk away from town.
// Mob levelRange uses overlap: mob [mobMin..mobMax] overlaps [tierMin..tierMax]
export const DEFAULT_TIERS: DifficultyTierConfig[] = [
  {
    name: "Safe",
    scalarRange: [0.0, 0.05],
    levelRange: [0, 0],
    resourceLevelRange: [1, 5],
    namePrefix: "Safe",
    color: "#2e7d32",
    mobDensityMultiplier: 0,
    resourceDensityMultiplier: 2.0,
    mobResourceBuffer: 30,
  },
  {
    name: "Beginner",
    scalarRange: [0.05, 0.15],
    levelRange: [1, 10],
    resourceLevelRange: [1, 20],
    namePrefix: "Beginner",
    color: "#66bb6a",
    mobDensityMultiplier: 0.4,
    resourceDensityMultiplier: 1.5,
    mobResourceBuffer: 25,
  },
  {
    name: "Low",
    scalarRange: [0.15, 0.3],
    levelRange: [5, 25],
    resourceLevelRange: [10, 45],
    namePrefix: "Low",
    color: "#fdd835",
    mobDensityMultiplier: 0.8,
    resourceDensityMultiplier: 1.0,
    mobResourceBuffer: 20,
  },
  {
    name: "Mid",
    scalarRange: [0.3, 0.5],
    levelRange: [15, 45],
    resourceLevelRange: [30, 65],
    namePrefix: "Mid",
    color: "#ff9800",
    mobDensityMultiplier: 1.2,
    resourceDensityMultiplier: 0.6,
    mobResourceBuffer: 12,
  },
  {
    name: "High",
    scalarRange: [0.5, 0.75],
    levelRange: [25, 60],
    resourceLevelRange: [50, 85],
    namePrefix: "Dangerous",
    color: "#d32f2f",
    mobDensityMultiplier: 2.0,
    resourceDensityMultiplier: 0.3,
    mobResourceBuffer: 8,
  },
  {
    name: "Extreme",
    scalarRange: [0.75, 1.0],
    levelRange: [40, 200],
    resourceLevelRange: [65, 99],
    namePrefix: "Extreme",
    color: "#6a1b9a",
    mobDensityMultiplier: 3.0,
    resourceDensityMultiplier: 0.15,
    mobResourceBuffer: 3,
  },
];

export const DEFAULT_AUTOGEN_CONFIG: AutoGenConfig = {
  gridResolution: 10,
  minZoneArea: 5000,
  maxZoneSpan: 500,
  seed: 42,
  tiers: DEFAULT_TIERS,
  mobSpacing: 15,
  resourceSpacing: 8,
};

// ============== GRID SAMPLING ==============

/**
 * Pre-scan to find the bounding box of actual land (non-water terrain).
 */
function scanLandBounds(
  worldSize: number,
  queryBiome: BiomeQuerier,
  waterThreshold: number,
): {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  hasLand: boolean;
} {
  const half = worldSize / 2;
  const coarseStep = Math.max(20, worldSize / 100);
  let minX = Infinity,
    maxX = -Infinity;
  let minZ = Infinity,
    maxZ = -Infinity;
  let hasLand = false;

  for (let wz = -half; wz <= half; wz += coarseStep) {
    for (let wx = -half; wx <= half; wx += coarseStep) {
      const q = queryBiome(wx, wz);
      if (q.height >= waterThreshold) {
        hasLand = true;
        if (wx < minX) minX = wx;
        if (wx > maxX) maxX = wx;
        if (wz < minZ) minZ = wz;
        if (wz > maxZ) maxZ = wz;
      }
    }
  }

  if (hasLand) {
    minX -= coarseStep;
    maxX += coarseStep;
    minZ -= coarseStep;
    maxZ += coarseStep;
  }

  return { minX, maxX, minZ, maxZ, hasLand };
}

function sampleDifficultyGrid(
  resolution: number,
  queryBiome: BiomeQuerier,
  getBiomeDifficulty: BiomeDifficultyLookup,
  noise: NoiseGenerator,
  towns: TownInfo[],
  dangerSources: DangerSourceInfo[],
  tiers: DifficultyTierConfig[],
  waterThreshold: number,
  landBounds: { minX: number; maxX: number; minZ: number; maxZ: number },
  worldRadius: number,
  zoneDiffConfig: ZoneDifficultyConfig,
): GridCell[] {
  const startX = landBounds.minX;
  const startZ = landBounds.minZ;
  const rangeX = landBounds.maxX - landBounds.minX;
  const rangeZ = landBounds.maxZ - landBounds.minZ;
  const cols = Math.ceil(rangeX / resolution);
  const rows = Math.ceil(rangeZ / resolution);
  const cells: GridCell[] = [];

  for (let gz = 0; gz < rows; gz++) {
    for (let gx = 0; gx < cols; gx++) {
      const worldX = startX + gx * resolution + resolution / 2;
      const worldZ = startZ + gz * resolution + resolution / 2;

      const biomeQuery = queryBiome(worldX, worldZ);

      if (biomeQuery.height < waterThreshold) {
        cells.push({
          x: gx,
          z: gz,
          worldX,
          worldZ,
          scalar: 0,
          biome: biomeQuery.biome,
          isSafe: true,
          tierIndex: -1,
          zoneId: -1,
        });
        continue;
      }

      const sample = computeZoneDifficulty(
        worldX,
        worldZ,
        biomeQuery.biome,
        getBiomeDifficulty(biomeQuery.biome),
        noise,
        towns,
        dangerSources,
        worldRadius,
        zoneDiffConfig,
      );

      let tierIndex = -1;
      for (let t = 0; t < tiers.length; t++) {
        const [lo, hi] = tiers[t].scalarRange;
        if (sample.scalar >= lo && sample.scalar < hi) {
          tierIndex = t;
          break;
        }
      }
      if (tierIndex === -1 && sample.scalar >= 1.0 && tiers.length > 0) {
        tierIndex = tiers.length - 1;
      }

      cells.push({
        x: gx,
        z: gz,
        worldX,
        worldZ,
        scalar: sample.scalar,
        biome: biomeQuery.biome,
        isSafe: sample.isSafe,
        tierIndex,
        zoneId: -1,
      });
    }
  }

  return cells;
}

// ============== PIPELINE DEPENDENCIES ==============

export interface AutoGenDeps {
  queryBiome: BiomeQuerier;
  getBiomeDifficulty: BiomeDifficultyLookup;
  worldSize: number;
  waterThreshold: number;
  seed: number;
  towns: TownInfo[];
  dangerSources: DangerSourceInfo[];
  manifests: ManifestData;
  existingEntities: ExistingEntityPosition[];
  zoneDifficultyConfig?: ZoneDifficultyConfig;
}

// ============== MAIN PIPELINE ==============

export function runAutoGenPipeline(
  config: AutoGenConfig,
  deps: AutoGenDeps,
): AutoGenResult {
  const startTime = performance.now();
  const noise = new NoiseGenerator(deps.seed);
  const worldRadius = deps.worldSize / 2;
  const zoneDiffConfig =
    deps.zoneDifficultyConfig ?? DEFAULT_ZONE_DIFFICULTY_CONFIG;

  // Step 1: Pre-scan land bounds
  const landBounds = scanLandBounds(
    deps.worldSize,
    deps.queryBiome,
    deps.waterThreshold,
  );
  if (!landBounds.hasLand) {
    return {
      zones: [],
      mobSpawns: [],
      resources: [],
      spawnPoints: [],
      teleports: [],
      stats: {
        zonesGenerated: 0,
        zoneMerged: 0,
        totalMobs: 0,
        totalResources: 0,
        totalArea: 0,
        generationTimeMs: Math.round(performance.now() - startTime),
        tierBreakdown: [],
      },
    };
  }

  const rangeX = landBounds.maxX - landBounds.minX;
  const rangeZ = landBounds.maxZ - landBounds.minZ;
  const cols = Math.ceil(rangeX / config.gridResolution);
  const rows = Math.ceil(rangeZ / config.gridResolution);

  // Step 2: Sample difficulty grid
  const cells = sampleDifficultyGrid(
    config.gridResolution,
    deps.queryBiome,
    deps.getBiomeDifficulty,
    noise,
    deps.towns,
    deps.dangerSources,
    config.tiers,
    deps.waterThreshold,
    landBounds,
    worldRadius,
    zoneDiffConfig,
  );

  // Step 3: Flood fill
  const rawZones = floodFillZones(cells, cols, rows);

  // Step 4: Cleanup (merge small, split large)
  const cleanedZones = cleanupZones(
    rawZones,
    config.gridResolution,
    config.minZoneArea,
    config.maxZoneSpan,
  );

  // Step 5: Name zones
  const zoneNames = nameZones(cleanedZones, config.tiers, deps.towns);
  const cellArea = config.gridResolution * config.gridResolution;

  // Build AutoGenZone objects with spawn rules
  const autoGenZones: AutoGenZone[] = cleanedZones.map((raw, idx) => {
    const tier = config.tiers[raw.tierIndex];
    const bounds = zoneBounds(raw);
    const centroid = zoneCentroid(raw);
    const area = raw.cells.length * cellArea;
    const name = zoneNames.get(raw.id) ?? `Zone ${idx + 1}`;

    const spawnRules = deriveSpawnRules(tier, raw.biome, deps.manifests);

    const autoGenBounds: AutoGenBounds = {
      difficultyRange: [...tier.scalarRange],
      biomeFilter: raw.biome,
      boundingBox: bounds,
      generationSeed: config.seed,
      generatedAt: Date.now(),
      gridResolution: config.gridResolution,
      cellPositions: raw.cells.map((c) => ({ x: c.worldX, z: c.worldZ })),
    };

    return {
      id: `autogen-zone-${idx}`,
      name,
      tierIndex: raw.tierIndex,
      biome: raw.biome,
      centroid,
      bounds,
      area,
      cellCount: raw.cells.length,
      spawnRules,
      autoGenBounds,
    };
  });

  // Step 6: Populate entities
  const { mobs, resources } = populateEntities(
    autoGenZones,
    config,
    {
      queryBiome: deps.queryBiome,
      getBiomeDifficulty: deps.getBiomeDifficulty,
      noise,
      towns: deps.towns,
      dangerSources: deps.dangerSources,
      waterThreshold: deps.waterThreshold,
      worldRadius,
      zoneDiffConfig,
    },
    deps.existingEntities,
  );

  // Step 7: Auto-place spawn points + lodestones at each town plaza
  const spawnPoints: PlacedSpawnPoint[] = [];
  const teleports: PlacedTeleport[] = [];

  // Find the largest town (by safe zone radius) as the default spawn
  let largestTownIdx = 0;
  let largestRadius = 0;
  for (let i = 0; i < deps.towns.length; i++) {
    if (deps.towns[i].safeZoneRadius > largestRadius) {
      largestRadius = deps.towns[i].safeZoneRadius;
      largestTownIdx = i;
    }
  }

  for (let i = 0; i < deps.towns.length; i++) {
    const town = deps.towns[i];
    const townName = `Town ${i + 1}`;
    const isMainSpawn = i === largestTownIdx;

    // Spawn point at plaza center
    spawnPoints.push({
      id: `autogen-spawn-${i}`,
      name: isMainSpawn ? `${townName} (Default Spawn)` : `${townName} Respawn`,
      position: { x: town.position.x, y: 0, z: town.position.z },
      rotation: 0,
      spawnType: isMainSpawn ? "initial" : "death-respawn",
      capacity: isMainSpawn ? 50 : 10,
      linkedAreaId: undefined,
      properties: { source: "autogen" },
    });

    // Lodestone teleport at plaza center (slightly offset from spawn)
    const lodestoneId = `autogen-lodestone-${i}`;
    teleports.push({
      id: lodestoneId,
      name: `${townName} Lodestone`,
      position: { x: town.position.x + 3, y: 0, z: town.position.z + 3 },
      connections: [], // Lodestone network — all lodestones are implicitly connected
      requirements: { minLevel: 1 },
      cost: 0,
      properties: { source: "autogen", type: "lodestone" },
    });
  }

  const elapsed = performance.now() - startTime;

  // Build stats
  const tierBreakdown = config.tiers.map((tier) => {
    const tierZones = autoGenZones.filter(
      (z) => z.tierIndex === config.tiers.indexOf(tier),
    );
    const tierMobs = mobs.filter((m) =>
      tierZones.some((z) => m.sourceRegionId === z.id),
    );
    const tierRes = resources.filter((r) =>
      tierZones.some((z) => r.sourceRegionId === z.id),
    );
    return {
      tierName: tier.name,
      zoneCount: tierZones.length,
      mobCount: tierMobs.length,
      resourceCount: tierRes.length,
      area: tierZones.reduce((sum, z) => sum + z.area, 0),
    };
  });

  const stats: AutoGenStats = {
    zonesGenerated: autoGenZones.length,
    zoneMerged: rawZones.length - cleanedZones.length,
    totalMobs: mobs.length,
    totalResources: resources.length,
    totalArea: autoGenZones.reduce((sum, z) => sum + z.area, 0),
    generationTimeMs: Math.round(elapsed),
    landBounds,
    tierBreakdown,
  };

  return {
    zones: autoGenZones,
    mobSpawns: mobs,
    resources,
    spawnPoints,
    teleports,
    stats,
  };
}

// ============== REACT HOOK ==============

export function useZoneAutoGen() {
  const { state, actions, viewportRef } = useWorldStudio();

  /** Run the pipeline with given config (preview only — does not commit) */
  const generate = useCallback(
    (config: AutoGenConfig): AutoGenResult | null => {
      const world = state.builder.editing.world;
      if (!world) return null;

      const vp = viewportRef?.current;
      if (!vp?.queryBiome || !vp?.getBiomeDifficulty) return null;

      const getBiomeDifficulty = withBiomeDifficultyFallback(
        vp.getBiomeDifficulty,
      );

      const worldSizeMeters =
        world.foundation.config.terrain.worldSize *
        world.foundation.config.terrain.tileSize;
      const seed = world.foundation.config.seed;

      const towns: TownInfo[] = world.foundation.towns.map((t) => ({
        position: { x: t.position.x, z: t.position.z },
        safeZoneRadius: getTownSafeRadius(t),
      }));

      console.log(
        `[AutoGen] Using ${towns.length} towns for zone generation:`,
        towns
          .map(
            (t, i) =>
              `Town ${i}: (${Math.round(t.position.x)}, ${Math.round(t.position.z)}) r=${t.safeZoneRadius}`,
          )
          .join(", "),
      );

      const dangerSources: DangerSourceInfo[] =
        state.extendedLayers.dangerSources.map((ds) => ({
          position: { x: ds.position.x, z: ds.position.z },
          radius: ds.radius,
          intensity: ds.intensity,
          falloffCurve: ds.falloffCurve,
        }));

      const waterThreshold = world.foundation.config.terrain.waterThreshold;

      // Collect all hand-placed entities to avoid overlapping them
      const existingEntities: ExistingEntityPosition[] = [];
      const entityBuffer = HAND_PLACED_ENTITY_BUFFER;
      for (const npc of world.layers.npcs) {
        existingEntities.push({
          x: npc.position.x,
          z: npc.position.z,
          radius: entityBuffer,
        });
      }
      for (const s of state.extendedLayers.stations) {
        existingEntities.push({
          x: s.position.x,
          z: s.position.z,
          radius: entityBuffer,
        });
      }
      for (const sp of state.extendedLayers.spawnPoints) {
        existingEntities.push({
          x: sp.position.x,
          z: sp.position.z,
          radius: entityBuffer,
        });
      }
      for (const tp of state.extendedLayers.teleports) {
        existingEntities.push({
          x: tp.position.x,
          z: tp.position.z,
          radius: entityBuffer,
        });
      }
      for (const poi of state.extendedLayers.pois) {
        existingEntities.push({
          x: poi.position.x,
          z: poi.position.z,
          radius: poi.radius ?? entityBuffer,
        });
      }

      return runAutoGenPipeline(config, {
        queryBiome: vp.queryBiome,
        getBiomeDifficulty,
        worldSize: worldSizeMeters,
        waterThreshold,
        seed,
        towns,
        dangerSources,
        manifests: state.manifests,
        existingEntities,
      });
    },
    [
      state.builder.editing.world,
      state.extendedLayers,
      state.manifests,
      viewportRef,
    ],
  );

  /** Commit an auto-gen result to state */
  const apply = useCallback(
    (result: AutoGenResult) => {
      // First clear any previous auto-gen
      actions.clearAllAutogen();

      // Build PlacedRegion objects from zones
      const regions: PlacedRegion[] = result.zones.map((zone) => ({
        id: zone.id,
        name: zone.name,
        description: `Auto-generated ${zone.biome} zone (${DEFAULT_TIERS[zone.tierIndex]?.name ?? "Unknown"} tier)`,
        tileKeys: [], // Contour-based zones don't use tile keys
        tags: [
          "autogen",
          zone.biome,
          DEFAULT_TIERS[zone.tierIndex]?.name.toLowerCase() ?? "unknown",
        ],
        spawnRules: zone.spawnRules,
        autoGenBounds: zone.autoGenBounds,
      }));

      actions.batchAddRegions(regions);
      actions.batchAddEntities(result.mobSpawns, result.resources);

      // Add auto-generated spawn points
      for (const sp of result.spawnPoints) {
        actions.addSpawnPoint(sp);
      }
      // Add auto-generated lodestones
      for (const tp of result.teleports) {
        actions.addTeleport(tp);
      }
    },
    [actions],
  );

  /** Clear all auto-generated content */
  const clearAutogen = useCallback(() => {
    actions.clearAllAutogen();
  }, [actions]);

  return { generate, apply, clearAutogen };
}
