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
  PlacedMobSpawn,
  PlacedResource,
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
  VEGETATION_BUFFER,
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
import { generateRoadNetwork } from "../pipeline/roadGenerator";
import { TownGenerator } from "@hyperscape/procgen/building/town";
import type {
  TerrainProvider,
  GeneratedTown as ProcgenTown,
} from "@hyperscape/procgen/building/town";

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

// ============== STAGE RESULT TYPES ==============

/** Result of the town generation stage */
export interface TownStageResult {
  generatedTowns: ProcgenTown[];
  towns: TownInfo[];
  townDetails: AutoGenDeps["townDetails"];
  landBounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}

/** Result of the road + zone generation stage */
export interface RoadZoneStageResult {
  zones: AutoGenZone[];
  roads: AutoGenResult["roads"];
  spawnPoints: PlacedSpawnPoint[];
  teleports: PlacedTeleport[];
  stats: Pick<
    AutoGenStats,
    "zonesGenerated" | "zoneMerged" | "totalArea" | "tierBreakdown"
  >;
}

/** Result of the population (entity scatter) stage */
export interface PopulationStageResult {
  mobSpawns: PlacedMobSpawn[];
  resources: PlacedResource[];
  stats: Pick<AutoGenStats, "totalMobs" | "totalResources">;
}

// ============== PIPELINE DEPENDENCIES ==============

export interface AutoGenDeps {
  queryBiome: BiomeQuerier;
  getBiomeDifficulty: BiomeDifficultyLookup;
  worldSize: number;
  waterThreshold: number;
  seed: number;
  towns: TownInfo[];
  /** Full town data for road generation */
  townDetails: Array<{
    id: string;
    name: string;
    position: { x: number; y: number; z: number };
    /** Fallback offset if no entry points */
    radius?: number;
    /** Town entry/exit points where internal roads meet the perimeter */
    entryPoints?: Array<{ angle: number; position: { x: number; z: number } }>;
  }>;
  dangerSources: DangerSourceInfo[];
  manifests: ManifestData;
  existingEntities: ExistingEntityPosition[];
  /** Structure obstacles for road avoidance (buildings, platforms, POIs) */
  structureObstacles: Array<{ x: number; z: number; radius: number }>;
  zoneDifficultyConfig?: ZoneDifficultyConfig;
  /** Town generation config from world creation settings */
  townConfig?: {
    townCount: number;
    minTownSpacing: number;
  };
}

// ============== STAGE 1: TOWN GENERATION ==============

export function runTownStage(
  config: AutoGenConfig,
  deps: AutoGenDeps,
): TownStageResult | null {
  // Pre-scan land bounds
  const landBounds = scanLandBounds(
    deps.worldSize,
    deps.queryBiome,
    deps.waterThreshold,
  );
  if (!landBounds.hasLand) return null;

  const generatedTowns: ProcgenTown[] = [];
  let towns: TownInfo[] = [];
  let townDetails: AutoGenDeps["townDetails"] = [];

  if (deps.townConfig) {
    const desiredCount = deps.townConfig.townCount;
    console.log(
      `[AutoGen] Generating ${desiredCount} towns (replacing ${deps.towns.length} existing)`,
    );

    const terrainProvider: TerrainProvider = {
      getHeightAt: (x, z) => deps.queryBiome(x, z).height,
      getBiomeAt: (x, z) => deps.queryBiome(x, z).biome,
      getWaterThreshold: () => deps.waterThreshold,
    };

    const townGen = new TownGenerator({
      seed: deps.seed,
      terrain: terrainProvider,
      config: {
        townCount: desiredCount,
        worldSize: deps.worldSize,
        minTownSpacing: deps.townConfig.minTownSpacing,
        waterThreshold: deps.waterThreshold,
      },
    });

    // ── Strategic town placement ──
    // Scan actual land, force a spawn town at origin, ensure biome coverage,
    // then fill remaining slots with best candidates.

    const scanStep = Math.max(40, deps.worldSize / 100);
    const half = deps.worldSize / 2;
    const landSites: Array<{
      x: number;
      z: number;
      biome: string;
      height: number;
      flatness: number;
    }> = [];

    // Dense scan of land within the pre-computed land bounds
    for (let wz = landBounds.minZ; wz <= landBounds.maxZ; wz += scanStep) {
      for (let wx = landBounds.minX; wx <= landBounds.maxX; wx += scanStep) {
        if (Math.abs(wx) > half - 100 || Math.abs(wz) > half - 100) continue;
        const q = deps.queryBiome(wx, wz);
        if (q.height < deps.waterThreshold) continue;
        // Flatness: average height delta across 4 cardinal neighbours.
        // Use /20 so a 20m delta ≈ 0.37, 10m ≈ 0.61, 5m ≈ 0.78.
        // Mountains (~30m delta) still get 0.22 — enough for a hamlet.
        let totalDelta = 0;
        for (const [dx, dz] of [
          [30, 0],
          [-30, 0],
          [0, 30],
          [0, -30],
        ] as const) {
          totalDelta += Math.abs(
            deps.queryBiome(wx + dx, wz + dz).height - q.height,
          );
        }
        const avgDelta = totalDelta / 4;
        const flatness = Math.exp(-avgDelta / 20);
        landSites.push({
          x: wx,
          z: wz,
          biome: q.biome,
          height: q.height,
          flatness,
        });
      }
    }

    // Per-biome diagnostic counts
    const biomeCounts = new Map<string, { total: number; flat: number }>();
    for (const s of landSites) {
      const entry = biomeCounts.get(s.biome) ?? { total: 0, flat: 0 };
      entry.total++;
      if (s.flatness > 0.1) entry.flat++;
      biomeCounts.set(s.biome, entry);
    }
    console.log(
      `[AutoGen] Land scan: ${landSites.length} viable sites (step=${scanStep}m). ` +
        `Per-biome: ${[...biomeCounts.entries()].map(([b, c]) => `${b}=${c.total}(${c.flat} flat)`).join(", ")}`,
    );

    // Collect unique biomes present on land (exclude water biomes)
    const biomeSet = new Set(landSites.map((s) => s.biome));
    for (const water of ["lakes", "ocean", "water", "deep_ocean"])
      biomeSet.delete(water);
    const uniqueBiomes = [...biomeSet];
    console.log(`[AutoGen] Biomes on land: ${uniqueBiomes.join(", ")}`);

    // Distance helper
    const dist2 = (ax: number, az: number, bx: number, bz: number) =>
      Math.sqrt((bx - ax) ** 2 + (bz - az) ** 2);

    // Spacing must fit actual land extent, not the full (mostly ocean) world.
    const landExtentX = landBounds.maxX - landBounds.minX;
    const landExtentZ = landBounds.maxZ - landBounds.minZ;
    const landExtent = Math.max(landExtentX, landExtentZ);
    const minSpacing = Math.min(
      deps.townConfig.minTownSpacing,
      landExtent / (Math.sqrt(desiredCount) * 2),
    );
    console.log(
      `[AutoGen] Land extent: ${Math.round(landExtentX)}×${Math.round(landExtentZ)}m, ` +
        `spacing=${Math.round(minSpacing)}m (land-based=${Math.round(landExtent / (Math.sqrt(desiredCount) * 2))}m, ` +
        `config=${deps.townConfig.minTownSpacing}m)`,
    );

    type TownSlot = {
      x: number;
      z: number;
      size: "town" | "village" | "hamlet";
      name?: string;
    };
    const slots: TownSlot[] = [];

    const isTooClose = (x: number, z: number) =>
      slots.some((s) => dist2(x, z, s.x, s.z) < minSpacing);

    // 1) Starter town near origin (0,0) — "Lumbridge"
    const spawnCandidates = landSites
      .filter((s) => s.flatness > 0.15)
      .sort((a, b) => dist2(a.x, a.z, 0, 0) - dist2(b.x, b.z, 0, 0));

    if (spawnCandidates.length > 0) {
      const spawn = spawnCandidates[0];
      slots.push({
        x: spawn.x,
        z: spawn.z,
        size: "town",
        name: "Starter Town",
      });
      console.log(
        `[AutoGen] Spawn town at (${Math.round(spawn.x)}, ${Math.round(spawn.z)}) ` +
          `biome=${spawn.biome}, flatness=${spawn.flatness.toFixed(2)}, ` +
          `dist-from-origin=${Math.round(dist2(spawn.x, spawn.z, 0, 0))}m`,
      );
    }

    // Land centroid — sites closer to this are more "interior" (not coastal)
    let centX = 0,
      centZ = 0;
    for (const s of landSites) {
      centX += s.x;
      centZ += s.z;
    }
    centX /= landSites.length;
    centZ /= landSites.length;
    // Max distance any land site is from centroid (for normalisation)
    let maxCentDist = 0;
    for (const s of landSites) {
      const d = dist2(s.x, s.z, centX, centZ);
      if (d > maxCentDist) maxCentDist = d;
    }
    if (maxCentDist === 0) maxCentDist = 1;

    // Composite score: spread from existing towns + interior bonus + flatness
    //   spread  0.45 — push towns apart
    //   interior 0.35 — keep away from coastline
    //   flatness 0.20 — prefer buildable terrain
    const siteScore = (s: { x: number; z: number; flatness: number }) => {
      // Spread: min distance to any placed town, normalised
      let minDist = landExtent; // default if no slots yet
      for (const sl of slots) {
        const d = dist2(s.x, s.z, sl.x, sl.z);
        if (d < minDist) minDist = d;
      }
      const normSpread = Math.min(minDist / landExtent, 1);

      // Interior: 1.0 at centroid, 0.0 at farthest edge
      const normInterior = 1 - dist2(s.x, s.z, centX, centZ) / maxCentDist;

      return normSpread * 0.45 + normInterior * 0.35 + s.flatness * 0.2;
    };

    // 2) One town per biome — pick the site DEEPEST in each biome
    //    (farthest from existing towns) so towns spread across the island.
    const coveredBiomes = new Set(
      slots.map((s) => deps.queryBiome(s.x, s.z).biome),
    );

    for (const biome of uniqueBiomes) {
      if (coveredBiomes.has(biome)) continue;
      if (slots.length >= desiredCount) break;

      const biomeSites = landSites
        .filter((s) => s.biome === biome && !isTooClose(s.x, s.z))
        .sort((a, b) => siteScore(b) - siteScore(a));

      if (biomeSites.length > 0) {
        const pick = biomeSites[0];
        const size = pick.flatness > 0.5 ? "village" : "hamlet";
        slots.push({ x: pick.x, z: pick.z, size });
        coveredBiomes.add(biome);
        console.log(
          `[AutoGen] Biome town: ${biome} at (${Math.round(pick.x)}, ${Math.round(pick.z)}) ` +
            `size=${size}, flatness=${pick.flatness.toFixed(2)}, ` +
            `spread=${siteScore(pick).toFixed(2)}, candidates=${biomeSites.length}`,
        );
      } else {
        console.warn(
          `[AutoGen] No site for biome "${biome}" — ` +
            `${landSites.filter((s) => s.biome === biome).length} sites exist ` +
            `but all within ${minSpacing}m of existing towns`,
        );
      }
    }

    // 3) Fill remaining slots — maximise spread across the island
    //    Progressively relax spacing if we can't fit all requested towns.
    let currentSpacing = minSpacing;
    while (slots.length < desiredCount && currentSpacing >= 40) {
      const spacingForCheck = currentSpacing;
      const isTooCloseRelaxed = (x: number, z: number) =>
        slots.some((s) => dist2(x, z, s.x, s.z) < spacingForCheck);

      const remaining = landSites
        .filter((s) => !isTooCloseRelaxed(s.x, s.z))
        .sort((a, b) => siteScore(b) - siteScore(a));

      let placedThisRound = 0;
      for (const site of remaining) {
        if (slots.length >= desiredCount) break;
        if (isTooCloseRelaxed(site.x, site.z)) continue;
        const size = site.flatness > 0.5 ? "village" : "hamlet";
        slots.push({ x: site.x, z: site.z, size });
        placedThisRound++;
        console.log(
          `[AutoGen] Fill town at (${Math.round(site.x)}, ${Math.round(site.z)}) ` +
            `biome=${site.biome}, flatness=${site.flatness.toFixed(2)}, ` +
            `spacing=${Math.round(spacingForCheck)}m`,
        );
      }

      if (placedThisRound === 0 && slots.length < desiredCount) {
        // Couldn't place any at this spacing — halve it and retry
        currentSpacing = Math.floor(currentSpacing * 0.6);
        console.log(
          `[AutoGen] Relaxing spacing to ${currentSpacing}m ` +
            `(have ${slots.length}/${desiredCount} towns)`,
        );
      }
    }

    console.log(
      `[AutoGen] Placed ${slots.length}/${desiredCount} town slots ` +
        `(spacing=${Math.round(minSpacing)}m, biomes covered: ${coveredBiomes.size}/${uniqueBiomes.length})`,
    );

    // 4) Generate full town data at each slot using TownGenerator.generateSingleTown
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      const town = townGen.generateSingleTown(slot.x, slot.z, slot.size, {
        id: `town_${i}`,
        name: slot.name,
      });
      const safeRadius =
        town.safeZoneRadius ??
        (town.size === "town" ? 80 : town.size === "village" ? 50 : 30);
      generatedTowns.push({ ...town, safeZoneRadius: safeRadius });
      towns.push({
        position: { x: town.position.x, z: town.position.z },
        safeZoneRadius: safeRadius,
      });
      townDetails.push({
        id: town.id,
        name: town.name,
        position: {
          x: town.position.x,
          y: town.position.y,
          z: town.position.z,
        },
        radius: safeRadius * 0.35,
        entryPoints: town.entryPoints,
      });
    }

    console.log(
      `[AutoGen] Generated ${generatedTowns.length} towns: ` +
        generatedTowns
          .map(
            (t) =>
              `${t.name}(${t.size}, ${t.buildings.length} bldg, ${t.biome})`,
          )
          .join(", "),
    );
  } else {
    // No town config — fall back to existing towns
    towns = deps.towns;
    townDetails = deps.townDetails;
  }

  return { generatedTowns, towns, townDetails, landBounds };
}

// ============== STAGE 2: ROADS + ZONES ==============

export function runRoadZoneStage(
  config: AutoGenConfig,
  deps: AutoGenDeps,
  townResult: TownStageResult,
): RoadZoneStageResult {
  const noise = new NoiseGenerator(deps.seed);
  const worldRadius = deps.worldSize / 2;
  const zoneDiffConfig =
    deps.zoneDifficultyConfig ?? DEFAULT_ZONE_DIFFICULTY_CONFIG;
  const { landBounds, towns, townDetails, generatedTowns } = townResult;

  const rangeX = landBounds.maxX - landBounds.minX;
  const rangeZ = landBounds.maxZ - landBounds.minZ;
  const cols = Math.ceil(rangeX / config.gridResolution);
  const rows = Math.ceil(rangeZ / config.gridResolution);

  // Sample difficulty grid
  const cells = sampleDifficultyGrid(
    config.gridResolution,
    deps.queryBiome,
    deps.getBiomeDifficulty,
    noise,
    towns,
    deps.dangerSources,
    config.tiers,
    deps.waterThreshold,
    landBounds,
    worldRadius,
    zoneDiffConfig,
  );

  // Flood fill
  const rawZones = floodFillZones(cells, cols, rows);

  // Cleanup (merge small, split large)
  const cleanedZones = cleanupZones(
    rawZones,
    config.gridResolution,
    config.minZoneArea,
    config.maxZoneSpan,
  );

  // Name zones
  const zoneNames = nameZones(cleanedZones, config.tiers, towns);
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

  // Auto-place spawn points + lodestones at each town plaza
  const spawnPoints: PlacedSpawnPoint[] = [];
  const teleports: PlacedTeleport[] = [];

  let largestTownIdx = 0;
  let largestRadius = 0;
  for (let i = 0; i < towns.length; i++) {
    if (towns[i].safeZoneRadius > largestRadius) {
      largestRadius = towns[i].safeZoneRadius;
      largestTownIdx = i;
    }
  }

  for (let i = 0; i < towns.length; i++) {
    const town = towns[i];
    const detail = townDetails[i];
    const townName = detail?.name ?? `Town ${i + 1}`;
    const isMainSpawn = i === largestTownIdx;

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

    const lodestoneId = `autogen-lodestone-${i}`;
    teleports.push({
      id: lodestoneId,
      name: `${townName} Lodestone`,
      position: { x: town.position.x + 3, y: 0, z: town.position.z + 3 },
      connections: [],
      requirements: { minLevel: 1 },
      cost: 0,
      properties: { source: "autogen", type: "lodestone" },
    });
  }

  // Generate road network between towns
  const roadObstacles: Array<{ x: number; z: number; radius: number }> = [
    ...deps.structureObstacles,
  ];

  const ROAD_STRUCTURE_BUFFER = 6;
  for (const town of generatedTowns) {
    for (const b of town.buildings) {
      const halfDiag =
        Math.sqrt((b.size?.width ?? 10) ** 2 + (b.size?.depth ?? 10) ** 2) / 2;
      roadObstacles.push({
        x: b.position.x,
        z: b.position.z,
        radius: halfDiag + ROAD_STRUCTURE_BUFFER,
      });
    }
    if (town.landmarks) {
      for (const lm of town.landmarks) {
        const halfDiag = Math.sqrt(lm.size.width ** 2 + lm.size.depth ** 2) / 2;
        roadObstacles.push({
          x: lm.position.x,
          z: lm.position.z,
          radius: halfDiag + ROAD_STRUCTURE_BUFFER,
        });
      }
    }
    if (town.plaza) {
      roadObstacles.push({
        x: town.plaza.position.x,
        z: town.plaza.position.z,
        radius: (town.plaza.radius ?? 8) + ROAD_STRUCTURE_BUFFER,
      });
    }
  }

  const roads = generateRoadNetwork(
    townDetails,
    deps.queryBiome,
    deps.waterThreshold,
    undefined,
    roadObstacles,
  );

  // Build stats
  const tierBreakdown = config.tiers.map((tier) => {
    const tierZones = autoGenZones.filter(
      (z) => z.tierIndex === config.tiers.indexOf(tier),
    );
    return {
      tierName: tier.name,
      zoneCount: tierZones.length,
      mobCount: 0,
      resourceCount: 0,
      area: tierZones.reduce((sum, z) => sum + z.area, 0),
    };
  });

  return {
    zones: autoGenZones,
    roads,
    spawnPoints,
    teleports,
    stats: {
      zonesGenerated: autoGenZones.length,
      zoneMerged: rawZones.length - cleanedZones.length,
      totalArea: autoGenZones.reduce((sum, z) => sum + z.area, 0),
      tierBreakdown,
    },
  };
}

// ============== STAGE 3: POPULATION ==============

export function runPopulationStage(
  config: AutoGenConfig,
  deps: AutoGenDeps,
  townResult: TownStageResult,
  roadZoneResult: RoadZoneStageResult,
): PopulationStageResult {
  const noise = new NoiseGenerator(deps.seed);
  const worldRadius = deps.worldSize / 2;
  const zoneDiffConfig =
    deps.zoneDifficultyConfig ?? DEFAULT_ZONE_DIFFICULTY_CONFIG;

  const { mobs, resources } = populateEntities(
    roadZoneResult.zones,
    config,
    {
      queryBiome: deps.queryBiome,
      getBiomeDifficulty: deps.getBiomeDifficulty,
      noise,
      towns: townResult.towns,
      dangerSources: deps.dangerSources,
      waterThreshold: deps.waterThreshold,
      worldRadius,
      zoneDiffConfig,
    },
    deps.existingEntities,
  );

  return {
    mobSpawns: mobs,
    resources,
    stats: {
      totalMobs: mobs.length,
      totalResources: resources.length,
    },
  };
}

// ============== MERGE STAGE RESULTS ==============

/** Merge the 3 stage results into a unified AutoGenResult */
export function mergeStageResults(
  townResult: TownStageResult,
  rzResult: RoadZoneStageResult,
  popResult: PopulationStageResult,
  config: AutoGenConfig,
  elapsedMs: number,
): AutoGenResult {
  // Update tier breakdown with population counts
  const tierBreakdown = rzResult.stats.tierBreakdown.map((tb) => {
    const tierZones = rzResult.zones.filter(
      (z) =>
        z.tierIndex === config.tiers.findIndex((t) => t.name === tb.tierName),
    );
    const tierMobs = popResult.mobSpawns.filter((m) =>
      tierZones.some((z) => m.sourceRegionId === z.id),
    );
    const tierRes = popResult.resources.filter((r) =>
      tierZones.some((z) => r.sourceRegionId === z.id),
    );
    return {
      ...tb,
      mobCount: tierMobs.length,
      resourceCount: tierRes.length,
    };
  });

  return {
    zones: rzResult.zones,
    mobSpawns: popResult.mobSpawns,
    resources: popResult.resources,
    spawnPoints: rzResult.spawnPoints,
    teleports: rzResult.teleports,
    roads: rzResult.roads,
    generatedTowns: townResult.generatedTowns,
    stats: {
      zonesGenerated: rzResult.stats.zonesGenerated,
      zoneMerged: rzResult.stats.zoneMerged,
      totalMobs: popResult.stats.totalMobs,
      totalResources: popResult.stats.totalResources,
      totalArea: rzResult.stats.totalArea,
      generationTimeMs: Math.round(elapsedMs),
      landBounds: townResult.landBounds,
      tierBreakdown,
    },
  };
}

// ============== MAIN PIPELINE (composes stages) ==============

export function runAutoGenPipeline(
  config: AutoGenConfig,
  deps: AutoGenDeps,
): AutoGenResult {
  const startTime = performance.now();

  const townResult = runTownStage(config, deps);
  if (!townResult) {
    return {
      zones: [],
      mobSpawns: [],
      resources: [],
      spawnPoints: [],
      teleports: [],
      roads: [],
      generatedTowns: [],
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

  const rzResult = runRoadZoneStage(config, deps, townResult);
  const popResult = runPopulationStage(config, deps, townResult, rzResult);

  return mergeStageResults(
    townResult,
    rzResult,
    popResult,
    config,
    performance.now() - startTime,
  );
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

      // Include existing vegetation trees so procgen entities don't overlap them.
      // Positions are in game-space (same as other entities above).
      const vegPositions = vp.vegetationPositions ?? [];
      for (const veg of vegPositions) {
        existingEntities.push({
          x: veg.x,
          z: veg.z,
          radius: VEGETATION_BUFFER,
        });
      }

      console.log(
        `[AutoGen] Manifests loaded=${state.manifests.loaded}: ` +
          `${state.manifests.npcs.length} npcs (${state.manifests.npcs.filter((n) => n.category === "mob").length} mobs), ` +
          `${state.manifests.miningRocks.length} rocks, ` +
          `${state.manifests.trees.length} trees, ` +
          `${state.manifests.fishingSpots.length} fishing. ` +
          `Existing entities: ${existingEntities.length} (${vegPositions.length} vegetation)`,
      );

      const townDetails = world.foundation.towns.map((t) => {
        const safeR = getTownSafeRadius(t);
        // Convert foundation entryPoints (direction string) to angle-based format
        const entryPoints = t.entryPoints
          ?.filter((ep) => ep.position)
          .map((ep) => ({
            angle: Math.atan2(
              ep.position.x - t.position.x,
              ep.position.z - t.position.z,
            ),
            position: { x: ep.position.x, z: ep.position.z },
          }));
        return {
          id: t.id,
          name: t.name,
          position: { x: t.position.x, y: t.position.y, z: t.position.z },
          radius: safeR * 0.35,
          safeZoneRadius: safeR,
          entryPoints: entryPoints?.length ? entryPoints : undefined,
        };
      });

      // Build structure obstacles for road avoidance — ALL procgen structures
      // are obstacles unless explicitly road-connectable (bridges, docks).
      const structureObstacles: Array<{
        x: number;
        z: number;
        radius: number;
      }> = [];
      const ROAD_BLDG_BUFFER = 4;

      // Foundation buildings (existing world)
      for (const b of world.foundation.buildings) {
        const halfDiag =
          Math.sqrt(b.dimensions.width ** 2 + b.dimensions.depth ** 2) / 2;
        structureObstacles.push({
          x: b.position.x,
          z: b.position.z,
          radius: halfDiag + ROAD_BLDG_BUFFER,
        });
      }

      // POIs (dungeons, shrines, landmarks, resource areas, ruins, camps)
      for (const poi of state.extendedLayers.pois) {
        structureObstacles.push({
          x: poi.position.x,
          z: poi.position.z,
          radius: (poi.radius ?? 10) + ROAD_BLDG_BUFFER,
        });
      }

      // Stations (banks, anvils, furnaces, altars, etc.)
      for (const s of state.extendedLayers.stations) {
        structureObstacles.push({
          x: s.position.x,
          z: s.position.z,
          radius: 4 + ROAD_BLDG_BUFFER,
        });
      }

      // Duel arenas (from manifests — each arena has center + size)
      for (const arena of state.manifests.duelArenas) {
        structureObstacles.push({
          x: arena.center.x,
          z: arena.center.z,
          radius: Math.max(arena.size, 12) + ROAD_BLDG_BUFFER,
        });
      }

      console.log(
        `[AutoGen] Road obstacles: ${structureObstacles.length} structures ` +
          `(${world.foundation.buildings.length} buildings, ` +
          `${state.extendedLayers.pois.length} POIs, ` +
          `${state.extendedLayers.stations.length} stations, ` +
          `${state.manifests.duelArenas.length} arenas)`,
      );

      const result = runAutoGenPipeline(config, {
        queryBiome: vp.queryBiome,
        getBiomeDifficulty,
        worldSize: worldSizeMeters,
        waterThreshold,
        seed,
        towns,
        townDetails,
        dangerSources,
        manifests: state.manifests,
        existingEntities,
        structureObstacles,
        townConfig: {
          townCount: world.foundation.config.towns.townCount,
          minTownSpacing: world.foundation.config.towns.minTownSpacing,
        },
      });

      console.log(
        `[AutoGen] Pipeline result: ${result.zones.length} zones, ` +
          `${result.mobSpawns.length} mobs, ${result.resources.length} resources, ` +
          `${result.spawnPoints.length} spawns, ${result.teleports.length} teleports, ` +
          `${result.roads.length} roads, ${result.generatedTowns.length} new towns ` +
          `(requested townCount=${world.foundation.config.towns.townCount})`,
      );

      return result;
    },
    [
      state.builder.editing.world,
      state.extendedLayers,
      state.manifests,
      viewportRef,
    ],
  );

  /** Build AutoGenDeps from current state + viewport (shared by all stage wrappers) */
  const buildDeps = useCallback(
    (configOverride?: {
      seed?: number;
      townCount?: number;
      minTownSpacing?: number;
    }): {
      deps: AutoGenDeps;
      world: NonNullable<typeof state.builder.editing.world>;
    } | null => {
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
      const seed = configOverride?.seed ?? world.foundation.config.seed;

      const towns: TownInfo[] = world.foundation.towns.map((t) => ({
        position: { x: t.position.x, z: t.position.z },
        safeZoneRadius: getTownSafeRadius(t),
      }));

      const dangerSources: DangerSourceInfo[] =
        state.extendedLayers.dangerSources.map((ds) => ({
          position: { x: ds.position.x, z: ds.position.z },
          radius: ds.radius,
          intensity: ds.intensity,
          falloffCurve: ds.falloffCurve,
        }));

      const waterThreshold = world.foundation.config.terrain.waterThreshold;

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
      const vegPositions = vp.vegetationPositions ?? [];
      for (const veg of vegPositions) {
        existingEntities.push({
          x: veg.x,
          z: veg.z,
          radius: VEGETATION_BUFFER,
        });
      }

      const townDetails = world.foundation.towns.map((t) => {
        const safeR = getTownSafeRadius(t);
        const entryPoints = t.entryPoints
          ?.filter((ep) => ep.position)
          .map((ep) => ({
            angle: Math.atan2(
              ep.position.x - t.position.x,
              ep.position.z - t.position.z,
            ),
            position: { x: ep.position.x, z: ep.position.z },
          }));
        return {
          id: t.id,
          name: t.name,
          position: { x: t.position.x, y: t.position.y, z: t.position.z },
          radius: safeR * 0.35,
          safeZoneRadius: safeR,
          entryPoints: entryPoints?.length ? entryPoints : undefined,
        };
      });

      const structureObstacles: Array<{
        x: number;
        z: number;
        radius: number;
      }> = [];
      const ROAD_BLDG_BUFFER = 4;
      for (const b of world.foundation.buildings) {
        const halfDiag =
          Math.sqrt(b.dimensions.width ** 2 + b.dimensions.depth ** 2) / 2;
        structureObstacles.push({
          x: b.position.x,
          z: b.position.z,
          radius: halfDiag + ROAD_BLDG_BUFFER,
        });
      }
      for (const poi of state.extendedLayers.pois) {
        structureObstacles.push({
          x: poi.position.x,
          z: poi.position.z,
          radius: (poi.radius ?? 10) + ROAD_BLDG_BUFFER,
        });
      }
      for (const s of state.extendedLayers.stations) {
        structureObstacles.push({
          x: s.position.x,
          z: s.position.z,
          radius: 4 + ROAD_BLDG_BUFFER,
        });
      }
      for (const arena of state.manifests.duelArenas) {
        structureObstacles.push({
          x: arena.center.x,
          z: arena.center.z,
          radius: Math.max(arena.size, 12) + ROAD_BLDG_BUFFER,
        });
      }

      const deps: AutoGenDeps = {
        queryBiome: vp.queryBiome,
        getBiomeDifficulty,
        worldSize: worldSizeMeters,
        waterThreshold,
        seed,
        towns,
        townDetails,
        dangerSources,
        manifests: state.manifests,
        existingEntities,
        structureObstacles,
        townConfig: {
          townCount:
            configOverride?.townCount ??
            world.foundation.config.towns.townCount,
          minTownSpacing:
            configOverride?.minTownSpacing ??
            world.foundation.config.towns.minTownSpacing,
        },
      };

      return { deps, world };
    },
    [
      state.builder.editing.world,
      state.extendedLayers,
      state.manifests,
      viewportRef,
    ],
  );

  /** Run only the town generation stage */
  const generateTownStage = useCallback(
    (
      config: AutoGenConfig,
      overrides?: {
        seed?: number;
        townCount?: number;
        minTownSpacing?: number;
      },
    ): TownStageResult | null => {
      const built = buildDeps(overrides);
      if (!built) return null;
      return runTownStage(config, built.deps);
    },
    [buildDeps],
  );

  /** Run only the road + zone stage (requires prior TownStageResult) */
  const generateRoadZoneStage = useCallback(
    (
      config: AutoGenConfig,
      townResult: TownStageResult,
      overrides?: { seed?: number },
    ): RoadZoneStageResult | null => {
      const built = buildDeps(overrides);
      if (!built) return null;
      return runRoadZoneStage(config, built.deps, townResult);
    },
    [buildDeps],
  );

  /** Run only the population stage (requires prior stage results) */
  const generatePopulationStage = useCallback(
    (
      config: AutoGenConfig,
      townResult: TownStageResult,
      roadZoneResult: RoadZoneStageResult,
    ): PopulationStageResult | null => {
      const built = buildDeps();
      if (!built) return null;
      return runPopulationStage(config, built.deps, townResult, roadZoneResult);
    },
    [buildDeps],
  );

  /** Commit an auto-gen result to state */
  const apply = useCallback(
    (result: AutoGenResult) => {
      // Auto-gen pipeline produces positions in GAME space (-half..+half).
      // The editor viewport operates in SCENE space (0..worldSize).
      // Convert all entity positions: sceneX = gameX + worldCenterOffset.
      // Also sample terrain height for Y so markers sit on the surface.
      const vp = viewportRef?.current;
      const offset = vp?.worldCenterOffset ?? 0;
      const queryBiome = vp?.queryBiome;

      console.log(
        `[AutoGen] Applying: ${result.zones.length} zones, ` +
          `${result.mobSpawns.length} mobs, ${result.resources.length} resources, ` +
          `${result.spawnPoints.length} spawns, ${result.teleports.length} teleports, ` +
          `${result.roads.length} roads, ${result.generatedTowns.length} towns` +
          ` (worldCenterOffset=${offset}, refreshTownMarkers=${typeof vp?.refreshTownMarkers})`,
      );

      /** Convert game-space position to scene-space with terrain height */
      const toScene = (pos: { x: number; y: number; z: number }) => {
        const y = queryBiome ? queryBiome(pos.x, pos.z).height : pos.y;
        return { x: pos.x + offset, y, z: pos.z + offset };
      };

      // First clear any previous auto-gen
      actions.clearAllAutogen();

      // Sync generated towns to foundation (if any were created)
      if (result.generatedTowns.length > 0) {
        console.log(
          `[AutoGen] Syncing ${result.generatedTowns.length} generated towns:`,
          result.generatedTowns
            .map(
              (t) => `${t.name} (${t.size}, ${t.buildings.length} buildings)`,
            )
            .join(", "),
        );
        actions.syncRuntimeTowns(
          result.generatedTowns.map((t) => ({
            id: t.id,
            name: t.name,
            position: { x: t.position.x, y: t.position.y, z: t.position.z },
            size: t.size,
            safeZoneRadius: t.safeZoneRadius,
            biomeId: t.biome ?? "unknown",
          })),
        );
        // Rebuild 3D town meshes (buildings, roads, landmarks) in the viewport
        if (vp?.refreshTownMarkers) {
          console.log(
            `[AutoGen] Calling refreshTownMarkers with ${result.generatedTowns.length} towns`,
          );
          vp.refreshTownMarkers(result.generatedTowns);
        } else {
          console.warn(
            `[AutoGen] refreshTownMarkers NOT available on viewport ref!`,
          );
        }
      } else {
        console.log(`[AutoGen] No towns generated (generatedTowns is empty)`);
      }

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

      // Convert entity positions from game-space to scene-space
      const sceneMobs = result.mobSpawns.map((m) => ({
        ...m,
        position: toScene(m.position),
      }));
      const sceneResources = result.resources.map((r) => ({
        ...r,
        position: toScene(r.position),
      }));
      const sceneSpawns = result.spawnPoints.map((sp) => ({
        ...sp,
        position: toScene(sp.position),
      }));
      const sceneTeleports = result.teleports.map((tp) => ({
        ...tp,
        position: toScene(tp.position),
      }));

      actions.batchAddRegions(regions);
      actions.batchAddEntities(sceneMobs, sceneResources);

      // Add auto-generated spawn points
      for (const sp of sceneSpawns) {
        actions.addSpawnPoint(sp);
      }
      // Add auto-generated lodestones
      for (const tp of sceneTeleports) {
        actions.addTeleport(tp);
      }

      // Set auto-generated roads on the foundation (game-space, renderer handles conversion)
      if (result.roads.length > 0) {
        actions.setFoundationRoads(result.roads);
      }

      // Rebuild vegetation using AAA density field (SDF + noise + town gradient).
      // Buildings create hard exclusion footprints, towns create broad density
      // gradients, and FBM noise distorts all boundaries for organic forest edges.
      // Trees near settlement edges are scaled smaller (Far Cry 5's "age" technique).
      if (vp?.refreshVegetation) {
        const circles: Array<{ x: number; z: number; radius: number }> = [];

        // Per-building hard exclusions (tight: just the footprint + 2m for eaves/porches)
        // The density field's noise + town gradient handles the broader thinning.
        for (const town of result.generatedTowns) {
          for (const b of town.buildings) {
            const footprint = Math.max(
              b.size?.width ?? 10,
              b.size?.depth ?? 10,
            );
            circles.push({
              x: b.position.x,
              z: b.position.z,
              radius: footprint / 2 + 2,
            });
          }
          // Town plaza/fountain — compact hard exclusion (town gradient handles the rest)
          circles.push({ x: town.position.x, z: town.position.z, radius: 8 });
          // Per-landmark exclusions (wells, benches, etc.)
          if (town.landmarks) {
            for (const lm of town.landmarks) {
              circles.push({
                x: lm.position.x,
                z: lm.position.z,
                radius: Math.max(lm.size.width, lm.size.depth) / 2 + 1.5,
              });
            }
          }
        }

        // Resources — small clear zone for visual clarity
        for (const r of result.resources) {
          circles.push({ x: r.position.x, z: r.position.z, radius: 2.5 });
        }
        // Spawn points + teleports — small clear zone
        for (const sp of result.spawnPoints) {
          circles.push({ x: sp.position.x, z: sp.position.z, radius: 4 });
        }
        for (const tp of result.teleports) {
          circles.push({ x: tp.position.x, z: tp.position.z, radius: 4 });
        }

        // Roads — road surface + small buffer (noise creates organic shoulders)
        const roads = result.roads.map((r) => ({
          path: r.path.map((p) => ({ x: p.x, z: p.z })),
          halfWidth: (r.width ?? 6) / 2 + 0.5,
        }));

        // Town centers for the broad density gradient (RuneScape-style:
        // sparse near center, gradually thickening into full forest).
        const towns = result.generatedTowns.map((t) => ({
          x: t.position.x,
          z: t.position.z,
          safeZoneRadius: t.safeZoneRadius,
        }));

        // Diagnostic: dump sample coordinates to verify alignment
        if (circles.length > 0) {
          const sample = circles.slice(0, 3);
          console.log(
            `[AutoGen] Sample exclusion circles (game-space):`,
            sample
              .map(
                (c) =>
                  `(${c.x.toFixed(1)}, ${c.z.toFixed(1)}) r=${c.radius.toFixed(1)}`,
              )
              .join(", "),
          );
        }
        if (towns.length > 0) {
          console.log(
            `[AutoGen] Town centers (game-space):`,
            towns
              .map(
                (t) =>
                  `(${t.x.toFixed(1)}, ${t.z.toFixed(1)}) safeR=${t.safeZoneRadius}`,
              )
              .join(", "),
          );
        }

        vp.refreshVegetation(undefined, { circles, roads, towns });
      }

      // Navigate camera to the first generated town (where buildings are)
      // so the user immediately sees the new content.
      if (result.generatedTowns.length > 0 && vp?.navigateCamera) {
        const t0 = result.generatedTowns[0];
        const cx = t0.position.x + offset;
        const cz = t0.position.z + offset;
        vp.navigateCamera(cx, cz, true);
        console.log(
          `[AutoGen] Camera navigated to town "${t0.name}" at scene (${cx.toFixed(0)}, ${cz.toFixed(0)})`,
        );
      } else if (result.zones.length > 0 && vp?.navigateCamera) {
        const z0 = result.zones[0];
        const cx = z0.centroid.x + offset;
        const cz = z0.centroid.z + offset;
        vp.navigateCamera(cx, cz, true);
        console.log(
          `[AutoGen] Camera navigated to zone "${z0.name}" at scene (${cx.toFixed(0)}, ${cz.toFixed(0)})`,
        );
      }
    },
    [actions, viewportRef],
  );

  /** Clear all auto-generated content */
  const clearAutogen = useCallback(() => {
    actions.clearAllAutogen();
    // Restore full vegetation (no exclusion zones) since wizard content is gone
    viewportRef?.current?.refreshVegetation?.();
  }, [actions, viewportRef]);

  return {
    generate,
    generateTownStage,
    generateRoadZoneStage,
    generatePopulationStage,
    apply,
    clearAutogen,
  };
}
