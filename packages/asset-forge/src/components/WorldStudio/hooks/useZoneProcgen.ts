/**
 * useZoneProcgen — Procedural entity population for tile-based regions
 *
 * Implements the layered spawn rule system:
 *   Layer 1: Biome defaults (from biomes.json)
 *   Layer 2: Region overrides (extend/replace biome defaults)
 *   Layer 3: Hand-placed entities (never touched)
 *   Layer 4: Procgen fill (this module — fills gaps respecting layers 1-3)
 *
 * Generation is per-region and deterministic given a seed.
 * Regions are defined by sets of terrain tile keys ("tileX_tileZ").
 */

import { useCallback } from "react";

import type {
  PlacedMobSpawn,
  PlacedResource,
  PlacedStation,
  PlacedRegion,
  RegionSpawnRules,
  ManifestData,
} from "../types";
import {
  parseTileKey,
  tileKey,
  tileBoundsWorld,
  ZONE_TILE_SIZE,
} from "../types";
import { useWorldStudio } from "../WorldStudioContext";
import {
  createSeededRng,
  hashString,
  dist2,
  weightedSelect,
} from "../utils/procgenUtils";
import { poissonDiscSample } from "../utils/poissonDisc";
import {
  MIN_MOB_SPACING,
  MIN_RESOURCE_SPACING,
  MIN_STATION_SPACING,
  BASE_MOB_DENSITY,
  BASE_RESOURCE_DENSITY,
} from "../utils/worldConstants";

// ============== TILE-BASED GEOMETRY HELPERS ==============

/** Check if a world position falls within the region's tile set */
function isInRegion(
  worldX: number,
  worldZ: number,
  tileKeySet: Set<string>,
  tileSize: number,
): boolean {
  const tx = Math.floor(worldX / tileSize);
  const tz = Math.floor(worldZ / tileSize);
  return tileKeySet.has(tileKey(tx, tz));
}

/** Compute centroid of a tile-based region in world coordinates */
function regionCentroid(
  tileKeys: string[],
  tileSize: number,
): { x: number; z: number } {
  if (tileKeys.length === 0) return { x: 0, z: 0 };
  let cx = 0,
    cz = 0;
  for (const key of tileKeys) {
    const { x, z } = parseTileKey(key);
    cx += x * tileSize + tileSize / 2;
    cz += z * tileSize + tileSize / 2;
  }
  return { x: cx / tileKeys.length, z: cz / tileKeys.length };
}

// Generation constants imported from ../utils/worldConstants

// ============== TYPES ==============

export interface ProcgenResult {
  mobSpawns: PlacedMobSpawn[];
  resources: PlacedResource[];
  stations: PlacedStation[];
}

export interface ProcgenStats {
  mobsGenerated: number;
  resourcesGenerated: number;
  stationsGenerated: number;
  regionArea: number;
  seed: number;
}

// ============== MOB GENERATION ==============

function generateMobs(
  region: PlacedRegion,
  rules: RegionSpawnRules,
  existingMobs: PlacedMobSpawn[],
  seed: number,
  tileSize: number,
): PlacedMobSpawn[] {
  const mobRules = rules.mobs;
  if (!mobRules || mobRules.table.length === 0) return [];
  if (region.tileKeys.length === 0) return [];

  const rng = createSeededRng(seed + hashString(region.id + ":mobs"));
  const tileKeySet = new Set(region.tileKeys);
  const density = BASE_MOB_DENSITY * (mobRules.densityMultiplier ?? 1);
  const area = region.tileKeys.length * tileSize * tileSize;
  const targetCount = Math.max(1, Math.round(area * density));
  const bounds = tileBoundsWorld(region.tileKeys, tileSize);

  const existingPositions = existingMobs
    .filter((m) => m.source !== "procgen")
    .map((m) => ({ x: m.position.x, z: m.position.z }));

  const positions = poissonDiscSample(
    bounds,
    MIN_MOB_SPACING,
    targetCount,
    rng,
    (x, z) => isInRegion(x, z, tileKeySet, tileSize),
  );

  const validPositions = positions.filter((p) =>
    existingPositions.every(
      (ep) => dist2(p.x, p.z, ep.x, ep.z) >= MIN_MOB_SPACING * MIN_MOB_SPACING,
    ),
  );

  const results: PlacedMobSpawn[] = [];
  for (let i = 0; i < validPositions.length; i++) {
    const pos = validPositions[i];
    const entry = weightedSelect(mobRules.table, rng);
    if (!entry) continue;
    results.push({
      id: `procgen-mob-${region.id}-${i}`,
      mobId: entry.mobId,
      name: `${entry.mobId} spawn`,
      position: { x: pos.x, y: 0, z: pos.z },
      spawnRadius: 5 + rng() * 10,
      maxCount: 1 + Math.floor(rng() * 3),
      respawnTicks: 50 + Math.floor(rng() * 30),
      source: "procgen",
      sourceRegionId: region.id,
      properties: {},
    });
  }
  return results;
}

// ============== RESOURCE GENERATION ==============

function generateResources(
  region: PlacedRegion,
  rules: RegionSpawnRules,
  existingResources: PlacedResource[],
  seed: number,
  tileSize: number,
): PlacedResource[] {
  const resourceRules = rules.resources;
  if (!resourceRules || resourceRules.table.length === 0) return [];
  if (region.tileKeys.length === 0) return [];

  const rng = createSeededRng(seed + hashString(region.id + ":resources"));
  const tileKeySet = new Set(region.tileKeys);
  const density =
    BASE_RESOURCE_DENSITY * (resourceRules.densityMultiplier ?? 1);
  const area = region.tileKeys.length * tileSize * tileSize;
  const targetCount = Math.max(1, Math.round(area * density));
  const bounds = tileBoundsWorld(region.tileKeys, tileSize);

  const existingPositions = existingResources
    .filter((r) => r.source !== "procgen")
    .map((r) => ({ x: r.position.x, z: r.position.z }));

  const positions = poissonDiscSample(
    bounds,
    MIN_RESOURCE_SPACING,
    targetCount,
    rng,
    (x, z) => isInRegion(x, z, tileKeySet, tileSize),
  );

  const validPositions = positions.filter((p) =>
    existingPositions.every(
      (ep) =>
        dist2(p.x, p.z, ep.x, ep.z) >=
        MIN_RESOURCE_SPACING * MIN_RESOURCE_SPACING,
    ),
  );

  const inferType = (
    id: string,
  ): "mining" | "woodcutting" | "fishing" | "farming" => {
    if (id.startsWith("ore_") || id.includes("rock")) return "mining";
    if (id.startsWith("tree_") || id.includes("wood")) return "woodcutting";
    if (id.includes("fish")) return "fishing";
    return "farming";
  };

  const results: PlacedResource[] = [];
  for (let i = 0; i < validPositions.length; i++) {
    const pos = validPositions[i];
    const entry = weightedSelect(resourceRules.table, rng);
    if (!entry) continue;

    const clusterSize = entry.clusterSize ?? 1;
    results.push({
      id: `procgen-res-${region.id}-${i}`,
      resourceId: entry.resourceId,
      resourceType: inferType(entry.resourceId),
      name:
        clusterSize > 1
          ? `${entry.resourceId} (cluster of ${clusterSize})`
          : entry.resourceId,
      position: { x: pos.x, y: 0, z: pos.z },
      rotation: rng() * Math.PI * 2,
      modelVariant: 0,
      source: "procgen",
      sourceRegionId: region.id,
      properties: clusterSize > 1 ? { clusterSize } : {},
    });
  }
  return results;
}

// ============== STATION GENERATION ==============

function generateStations(
  region: PlacedRegion,
  rules: RegionSpawnRules,
  existingStations: PlacedStation[],
  seed: number,
  tileSize: number,
): PlacedStation[] {
  if (!rules.stations || rules.stations.length === 0) return [];
  if (region.tileKeys.length === 0) return [];

  const rng = createSeededRng(seed + hashString(region.id + ":stations"));
  const tileKeySet = new Set(region.tileKeys);
  const centroid = regionCentroid(region.tileKeys, tileSize);
  const bounds = tileBoundsWorld(region.tileKeys, tileSize);

  const existingPositions = existingStations
    .filter((s) => s.source !== "procgen")
    .map((s) => ({ x: s.position.x, z: s.position.z }));

  const results: PlacedStation[] = [];

  for (const stationRule of rules.stations) {
    for (let i = 0; i < stationRule.count; i++) {
      let pos: { x: number; z: number } | null = null;

      switch (stationRule.placement) {
        case "center":
          pos = {
            x: centroid.x + (rng() - 0.5) * 20,
            z: centroid.z + (rng() - 0.5) * 20,
          };
          // Ensure center placement is in region
          if (!isInRegion(pos.x, pos.z, tileKeySet, tileSize)) {
            pos = null;
          }
          break;
        case "random":
        case "near-road":
        case "near-water":
        default: {
          for (let att = 0; att < 50; att++) {
            const px = bounds.minX + rng() * (bounds.maxX - bounds.minX);
            const pz = bounds.minZ + rng() * (bounds.maxZ - bounds.minZ);
            if (isInRegion(px, pz, tileKeySet, tileSize)) {
              pos = { x: px, z: pz };
              break;
            }
          }
          break;
        }
      }

      if (!pos) continue;

      const tooClose = existingPositions.some(
        (ep) =>
          dist2(pos!.x, pos!.z, ep.x, ep.z) <
          MIN_STATION_SPACING * MIN_STATION_SPACING,
      );
      if (tooClose) continue;

      results.push({
        id: `procgen-sta-${region.id}-${results.length}`,
        stationType: stationRule.stationType,
        name: stationRule.stationType,
        position: { x: pos.x, y: 0, z: pos.z },
        rotation: rng() * Math.PI * 2,
        source: "procgen",
        sourceRegionId: region.id,
        properties: {},
      });

      existingPositions.push(pos);
    }
  }

  return results;
}

// ============== MAIN GENERATION ==============

function generateForRegion(
  region: PlacedRegion,
  existingMobs: PlacedMobSpawn[],
  existingResources: PlacedResource[],
  existingStations: PlacedStation[],
  seed: number,
  tileSize: number,
): ProcgenResult {
  const rules = region.spawnRules;
  if (!rules) return { mobSpawns: [], resources: [], stations: [] };
  if (region.tileKeys.length === 0)
    return { mobSpawns: [], resources: [], stations: [] };

  const tileKeySet = new Set(region.tileKeys);

  // Only consider entities within this region for spacing checks
  const regionMobs = existingMobs.filter((m) =>
    isInRegion(m.position.x, m.position.z, tileKeySet, tileSize),
  );
  const regionResources = existingResources.filter((r) =>
    isInRegion(r.position.x, r.position.z, tileKeySet, tileSize),
  );
  const regionStations = existingStations.filter((s) =>
    isInRegion(s.position.x, s.position.z, tileKeySet, tileSize),
  );

  return {
    mobSpawns: generateMobs(region, rules, regionMobs, seed, tileSize),
    resources: generateResources(
      region,
      rules,
      regionResources,
      seed,
      tileSize,
    ),
    stations: generateStations(region, rules, regionStations, seed, tileSize),
  };
}

// ============== SKILL PROGRESSION VALIDATOR (Phase 4D) ==============

export interface ProgressionWarning {
  level: "error" | "warning" | "info";
  skill: string;
  message: string;
}

const RESOURCE_SKILL_MAP: Record<string, string> = {
  mining: "Mining",
  woodcutting: "Woodcutting",
  fishing: "Fishing",
  farming: "Farming",
};

/** Build resource level tiers dynamically from manifest data (no hardcoded levels). */
function buildResourceLevelTiers(
  manifests: ManifestData,
): Record<string, Record<string, number>> {
  const tiers: Record<string, Record<string, number>> = {
    mining: {},
    woodcutting: {},
    fishing: {},
  };

  for (const rock of manifests.miningRocks) {
    tiers.mining[rock.id] = rock.levelRequired;
  }
  for (const tree of manifests.trees) {
    tiers.woodcutting[tree.id] = tree.levelRequired;
  }
  for (const spot of manifests.fishingSpots) {
    tiers.fishing[spot.id] = spot.levelRequired;
  }

  return tiers;
}

export function validateSkillProgression(
  resources: PlacedResource[],
  regions: PlacedRegion[],
  tileSize: number,
  manifests: ManifestData,
): ProgressionWarning[] {
  const warnings: ProgressionWarning[] = [];
  const resourceLevelTiers = buildResourceLevelTiers(manifests);

  const bySkill: Record<string, PlacedResource[]> = {};
  for (const r of resources) {
    const skill = r.resourceType;
    if (!bySkill[skill]) bySkill[skill] = [];
    bySkill[skill].push(r);
  }

  for (const [skill, tiers] of Object.entries(resourceLevelTiers)) {
    const skillName = RESOURCE_SKILL_MAP[skill] ?? skill;
    const skillResources = bySkill[skill] ?? [];
    const placedIds = new Set(skillResources.map((r) => r.resourceId));

    const starterResources = Object.entries(tiers)
      .filter(([, lvl]) => lvl <= 15)
      .map(([id]) => id);

    const hasStarter = starterResources.some((id) => placedIds.has(id));
    if (!hasStarter && starterResources.length > 0) {
      warnings.push({
        level: "error",
        skill: skillName,
        message: `No starter-level ${skillName} resources found (${starterResources.join(", ")})`,
      });
    }

    const sortedTiers = Object.entries(tiers).sort(([, a], [, b]) => a - b);
    for (let i = 0; i < sortedTiers.length; i++) {
      const [resourceId, level] = sortedTiers[i];
      if (!placedIds.has(resourceId) && level <= 60) {
        warnings.push({
          level: "warning",
          skill: skillName,
          message: `No ${resourceId} placed (level ${level} ${skillName})`,
        });
      }
    }

    // Check high-level resources aren't in safe regions
    for (const r of skillResources) {
      const tier = tiers[r.resourceId];
      if (tier && tier >= 55) {
        const inSafeRegion = regions.find((reg) => {
          if (!reg.tags.includes("starter")) return false;
          const tileKeySet = new Set(reg.tileKeys);
          return isInRegion(r.position.x, r.position.z, tileKeySet, tileSize);
        });
        if (inSafeRegion) {
          warnings.push({
            level: "warning",
            skill: skillName,
            message: `High-level ${r.resourceId} (lvl ${tier}) found in starter region "${inSafeRegion.name}"`,
          });
        }
      }
    }
  }

  return warnings;
}

// ============== HOOK ==============

export function useZoneProcgen() {
  const { state, actions } = useWorldStudio();

  const tileSize = ZONE_TILE_SIZE;

  /** Generate entities for a single region */
  const generateForSingleRegion = useCallback(
    (
      regionId: string,
      seed: number,
    ): ProcgenResult & { stats: ProcgenStats } => {
      const region = state.extendedLayers.regions.find(
        (r) => r.id === regionId,
      );
      if (!region) {
        return {
          mobSpawns: [],
          resources: [],
          stations: [],
          stats: {
            mobsGenerated: 0,
            resourcesGenerated: 0,
            stationsGenerated: 0,
            regionArea: 0,
            seed,
          },
        };
      }

      const result = generateForRegion(
        region,
        state.extendedLayers.mobSpawns,
        state.extendedLayers.resources,
        state.extendedLayers.stations,
        seed,
        tileSize,
      );

      const area = region.tileKeys.length * tileSize * tileSize;

      return {
        ...result,
        stats: {
          mobsGenerated: result.mobSpawns.length,
          resourcesGenerated: result.resources.length,
          stationsGenerated: result.stations.length,
          regionArea: Math.round(area),
          seed,
        },
      };
    },
    [state.extendedLayers, tileSize],
  );

  /** Clear all procgen entities for a region */
  const clearRegion = useCallback(
    (regionId: string) => {
      const mobsToRemove = state.extendedLayers.mobSpawns.filter(
        (m) => m.source === "procgen" && m.sourceRegionId === regionId,
      );
      for (const m of mobsToRemove) {
        actions.removeMobSpawn(m.id);
      }

      const resToRemove = state.extendedLayers.resources.filter(
        (r) => r.source === "procgen" && r.sourceRegionId === regionId,
      );
      for (const r of resToRemove) {
        actions.removeResource(r.id);
      }

      const staToRemove = state.extendedLayers.stations.filter(
        (s) => s.source === "procgen" && s.sourceRegionId === regionId,
      );
      for (const s of staToRemove) {
        actions.removeStation(s.id);
      }
    },
    [state.extendedLayers, actions],
  );

  /** Generate and commit entities for a region */
  const generateAndCommit = useCallback(
    (regionId: string, seed: number): ProcgenStats => {
      clearRegion(regionId);

      const result = generateForSingleRegion(regionId, seed);

      for (const mob of result.mobSpawns) {
        actions.addMobSpawn(mob);
      }
      for (const resource of result.resources) {
        actions.addResource(resource);
      }
      for (const station of result.stations) {
        actions.addStation(station);
      }

      return result.stats;
    },
    [generateForSingleRegion, clearRegion, actions],
  );

  /** Generate for all regions */
  const generateAll = useCallback(
    (baseSeed: number): ProcgenStats[] => {
      const allStats: ProcgenStats[] = [];
      for (const region of state.extendedLayers.regions) {
        if (region.spawnRules) {
          const stats = generateAndCommit(region.id, baseSeed);
          allStats.push(stats);
        }
      }
      return allStats;
    },
    [state.extendedLayers.regions, generateAndCommit],
  );

  /** Clear all procgen entities across all regions */
  const clearAll = useCallback(() => {
    for (const region of state.extendedLayers.regions) {
      clearRegion(region.id);
    }
  }, [state.extendedLayers.regions, clearRegion]);

  /** Preview (dry run) — returns what would be generated without committing */
  const preview = useCallback(
    (
      regionId: string,
      seed: number,
    ): ProcgenResult & { stats: ProcgenStats } => {
      return generateForSingleRegion(regionId, seed);
    },
    [generateForSingleRegion],
  );

  /** Validate skill progression across all resources */
  const validate = useCallback((): ProgressionWarning[] => {
    return validateSkillProgression(
      state.extendedLayers.resources,
      state.extendedLayers.regions,
      tileSize,
      state.manifests,
    );
  }, [
    state.extendedLayers.resources,
    state.extendedLayers.regions,
    tileSize,
    state.manifests,
  ]);

  return {
    generateAndCommit,
    generateAll,
    clearRegion,
    clearAll,
    preview,
    validate,
  };
}
