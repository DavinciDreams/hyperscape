/**
 * Zone auto-generation pipeline — pure orchestration functions.
 *
 * All functions here are stateless: they take configuration + dependencies
 * and return results. No React hooks, no state, no side-effects beyond
 * console.log diagnostics.
 *
 * Extracted from useZoneAutoGen to keep the hook as a thin React orchestrator.
 */

import { NoiseGenerator } from "@hyperforge/procgen/terrain";

import {
  computeZoneDifficulty,
  DEFAULT_ZONE_DIFFICULTY_CONFIG,
  type ZoneDifficultyConfig,
  type TownInfo,
  type DangerSourceInfo,
  type BiomeQuerier,
  type BiomeDifficultyLookup,
} from "../../../WorldBuilder/DifficultyHeatmap";

import type {
  PlacedSpawnPoint,
  PlacedTeleport,
  PlacedMobSpawn,
  PlacedResource,
  PlacedMine,
  DifficultyTierConfig,
  AutoGenBounds,
  AutoGenConfig,
  AutoGenResult,
  AutoGenStats,
  AutoGenZone,
  ManifestData,
} from "../../types";

import {
  floodFillZones,
  cleanupZones,
  zoneCentroid,
  zoneBounds,
  type GridCell,
} from "../../pipeline/zoneFloodFill";
import { nameZones } from "../../pipeline/zoneNaming";
import { deriveSpawnRules } from "../../pipeline/spawnTableBuilder";
import {
  placeMines,
  filterScatteredMiningRocks,
} from "../../pipeline/minePlacement";
import {
  populateEntities,
  type ExistingEntityPosition,
} from "../../pipeline/entityPopulator";
import { generateRoadNetwork } from "../../pipeline/roadGenerator";
import { TownGenerator } from "@hyperforge/procgen/building/town";
import type {
  TerrainProvider,
  GeneratedTown as ProcgenTown,
} from "@hyperforge/procgen/building/town";

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
  mines: PlacedMine[];
  stats: Pick<AutoGenStats, "totalMobs" | "totalResources" | "totalMines">;
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
  /** Bank positions — mines must be far from banks */
  banks?: Array<{ x: number; z: number }>;
}

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

/**
 * Compute the effective land radius — the farthest distance any land cell
 * sits from the nearest town edge. This replaces the raw worldRadius so the
 * difficulty gradient adapts to the actual island size rather than the full
 * world grid.
 *
 * Samples land cells at a coarse step across the land bounds, skips water,
 * and returns the 95th-percentile distance (avoids outlier peninsulas from
 * dominating). Falls back to half the land diagonal if no towns exist.
 */
function computeEffectiveLandRadius(
  landBounds: { minX: number; maxX: number; minZ: number; maxZ: number },
  towns: TownInfo[],
  gridResolution: number,
  queryBiome: BiomeQuerier,
  waterThreshold: number,
): number {
  const step = Math.max(gridResolution, 20); // coarse sample for speed
  const distances: number[] = [];

  for (let wz = landBounds.minZ; wz <= landBounds.maxZ; wz += step) {
    for (let wx = landBounds.minX; wx <= landBounds.maxX; wx += step) {
      const q = queryBiome(wx, wz);
      if (q.height < waterThreshold) continue; // skip water

      // Distance from nearest town edge
      let nearestDist = Infinity;
      for (const town of towns) {
        const dx = wx - town.position.x;
        const dz = wz - town.position.z;
        const dist = Math.max(
          0,
          Math.sqrt(dx * dx + dz * dz) - town.safeZoneRadius,
        );
        if (dist < nearestDist) nearestDist = dist;
      }
      if (nearestDist < Infinity) {
        distances.push(nearestDist);
      }
    }
  }

  if (distances.length === 0) {
    // Fallback: half the land diagonal
    const dx = landBounds.maxX - landBounds.minX;
    const dz = landBounds.maxZ - landBounds.minZ;
    return Math.sqrt(dx * dx + dz * dz) / 2;
  }

  // Use 95th percentile to avoid outlier peninsulas stretching the scale
  distances.sort((a, b) => a - b);
  const p95Index = Math.floor(distances.length * 0.95);
  const p95Distance = distances[p95Index];

  // Minimum effective radius of 200m to avoid degenerate tiny islands
  return Math.max(200, p95Distance);
}

export function runRoadZoneStage(
  config: AutoGenConfig,
  deps: AutoGenDeps,
  townResult: TownStageResult,
): RoadZoneStageResult {
  const noise = new NoiseGenerator(deps.seed);
  const zoneDiffConfig =
    deps.zoneDifficultyConfig ?? DEFAULT_ZONE_DIFFICULTY_CONFIG;
  const { landBounds, towns, townDetails, generatedTowns } = townResult;

  const rangeX = landBounds.maxX - landBounds.minX;
  const rangeZ = landBounds.maxZ - landBounds.minZ;
  const cols = Math.ceil(rangeX / config.gridResolution);
  const rows = Math.ceil(rangeZ / config.gridResolution);

  // Compute effective world radius from actual land extent rather than total
  // world size. On a small island, the land may only span 500-800m while the
  // world grid is 10km. Using the full world radius means the difficulty
  // scalar never reaches the upper tiers. Instead, measure the farthest land
  // corner from the nearest town and use that as the reference distance.
  // This compresses the full difficulty gradient onto whatever land exists.
  const effectiveRadius = computeEffectiveLandRadius(
    landBounds,
    towns,
    config.gridResolution,
    deps.queryBiome,
    deps.waterThreshold,
  );

  console.log(
    `[ZoneGen] Effective land radius: ${effectiveRadius.toFixed(0)}m ` +
      `(world radius: ${(deps.worldSize / 2).toFixed(0)}m)`,
  );

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
    effectiveRadius,
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

  const popDeps = {
    queryBiome: deps.queryBiome,
    getBiomeDifficulty: deps.getBiomeDifficulty,
    noise,
    towns: townResult.towns,
    dangerSources: deps.dangerSources,
    waterThreshold: deps.waterThreshold,
    worldRadius,
    zoneDiffConfig,
  };

  // Step 1: Place mines first (dedicated mine areas with clustered ore rocks)
  // Pass roads, structures, existing entities, and banks so mines avoid them
  const { mines, mineResources } = placeMines(
    roadZoneResult.zones,
    config,
    popDeps,
    deps.manifests,
    townResult.towns,
    deps.seed,
    roadZoneResult.roads,
    deps.structureObstacles,
    deps.existingEntities,
    deps.banks,
  );

  // Step 2: Extend existing entity exclusions with mine centers
  const mineExclusions = mines.map((m) => ({
    x: m.position.x,
    z: m.position.z,
    radius: m.radius,
  }));
  const existingWithMines = [...deps.existingEntities, ...mineExclusions];

  // Step 3: Populate scattered entities (mobs + resources)
  const { mobs, resources } = populateEntities(
    roadZoneResult.zones,
    config,
    popDeps,
    existingWithMines,
  );

  // Step 4: Filter out scattered mining rocks inside mine boundaries
  const filteredResources = filterScatteredMiningRocks(resources, mines);

  // Step 5: Merge mine resources into final resources array
  const allResources = [...filteredResources, ...mineResources];

  return {
    mobSpawns: mobs,
    resources: allResources,
    mines,
    stats: {
      totalMobs: mobs.length,
      totalResources: allResources.length,
      totalMines: mines.length,
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
    mines: popResult.mines,
    stats: {
      zonesGenerated: rzResult.stats.zonesGenerated,
      zoneMerged: rzResult.stats.zoneMerged,
      totalMobs: popResult.stats.totalMobs,
      totalResources: popResult.stats.totalResources,
      totalMines: popResult.stats.totalMines,
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
      mines: [],
      stats: {
        zonesGenerated: 0,
        zoneMerged: 0,
        totalMobs: 0,
        totalResources: 0,
        totalMines: 0,
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
