/**
 * entityPopulator — Two-phase Poisson disc scatter with mob-resource buffer
 *
 * Phase A: Place mobs first (avoid hand-placed entities)
 * Phase B: Place resources second (avoid mobs via proximity buffer)
 *
 * The mob-resource buffer creates RuneScape-style gameplay dynamics:
 * - Safe zones: resources far from mobs (30m) — gather freely
 * - Mid zones: resources closer to mobs (15m) — need to clear area
 * - Extreme zones: resources on top of mobs (3m) — gathering is combat
 *
 * Extension point: EntityPopulator interface allows adding new entity types
 * (herbs, traps, hazards) without modifying core pipeline.
 */

import { NoiseGenerator } from "@hyperscape/procgen/terrain";

import {
  computeZoneDifficulty,
  type ZoneDifficultyConfig,
  type TownInfo,
  type DangerSourceInfo,
  type BiomeQuerier,
  type BiomeDifficultyLookup,
} from "../../WorldBuilder/DifficultyHeatmap";
import type {
  PlacedMobSpawn,
  PlacedResource,
  AutoGenConfig,
  AutoGenZone,
} from "../types";
import {
  createSeededRng,
  hashString,
  weightedSelect,
} from "../utils/procgenUtils";
import {
  poissonDiscSample,
  type PoissonBoundaryTest,
} from "../utils/poissonDisc";
import { SpatialGrid } from "../utils/SpatialGrid";
import {
  BASE_MOB_DENSITY,
  BASE_RESOURCE_DENSITY,
  HAND_PLACED_ENTITY_BUFFER,
} from "../utils/worldConstants";

// ============== ENTITY POPULATOR INTERFACE (Open/Closed) ==============

/** Proximity constraint for entity placement */
export interface ProximityConstraint {
  /** Grid to check distance against */
  gridKey: string;
  /** Minimum distance from entities in that grid */
  minDistance: number;
}

/**
 * Interface for entity populators. Implement this to add new entity types
 * to the generation pipeline without modifying core code.
 *
 * Built-in populators: mobs, mining, woodcutting, fishing
 * Example extension: herbs, traps, hazards, quest objects
 */
export interface EntityPopulator<T> {
  /** Entity type identifier */
  readonly entityType: string;
  /** Primary entities (mobs) go first; secondary (resources) go after */
  readonly phase: "primary" | "secondary";
  /** Minimum spacing between entities of this type */
  readonly spacing: number;
  /** Populate a single zone, return placed entities */
  populate(
    zone: AutoGenZone,
    config: AutoGenConfig,
    rng: () => number,
    inZone: PoissonBoundaryTest,
    grids: Map<string, SpatialGrid>,
  ): T[];
  /** Proximity constraints relative to other entity grids */
  getProximityConstraints(): ProximityConstraint[];
}

// ============== EXISTING ENTITY POSITION ==============

export interface ExistingEntityPosition {
  x: number;
  z: number;
  radius: number;
}

// ============== HELPERS ==============

export function inferResourceType(
  id: string,
): "mining" | "woodcutting" | "fishing" | "farming" {
  if (id.startsWith("ore_") || id.includes("rock")) return "mining";
  if (id.startsWith("tree_") || id.includes("wood")) return "woodcutting";
  if (id.includes("fish")) return "fishing";
  return "farming";
}

// ============== POPULATION DEPENDENCIES ==============

export interface PopulationDeps {
  queryBiome: BiomeQuerier;
  getBiomeDifficulty: BiomeDifficultyLookup;
  noise: NoiseGenerator;
  towns: TownInfo[];
  dangerSources: DangerSourceInfo[];
  waterThreshold: number;
  worldRadius: number;
  zoneDiffConfig: ZoneDifficultyConfig;
}

// ============== MAIN POPULATION ==============

export function populateEntities(
  zones: AutoGenZone[],
  config: AutoGenConfig,
  deps: PopulationDeps,
  existingEntities: ExistingEntityPosition[],
): { mobs: PlacedMobSpawn[]; resources: PlacedResource[] } {
  const allMobs: PlacedMobSpawn[] = [];
  const allResources: PlacedResource[] = [];
  const mobGrid = new SpatialGrid(30); // for proximity checks

  // Pre-populate spatial grid with existing hand-placed entities
  // so auto-gen entities maintain distance from them
  const existingGrid = new SpatialGrid(30);
  for (const e of existingEntities) {
    existingGrid.insert(e.x, e.z);
    // Also add to mob grid so resources avoid existing entities too
    mobGrid.insert(e.x, e.z);
  }

  for (const zone of zones) {
    const tier = config.tiers[zone.tierIndex];
    if (!tier) continue;

    const rng = createSeededRng(config.seed + hashString(zone.id));
    const [scalarLo, scalarHi] = tier.scalarRange;

    // Contour boundary test: point must fall within this tier's difficulty range + biome
    const inZone: PoissonBoundaryTest = (x: number, z: number) => {
      const bq = deps.queryBiome(x, z);
      if (bq.height < deps.waterThreshold) return false; // water
      const sample = computeZoneDifficulty(
        x,
        z,
        bq.biome,
        deps.getBiomeDifficulty(bq.biome),
        deps.noise,
        deps.towns,
        deps.dangerSources,
        deps.worldRadius,
        deps.zoneDiffConfig,
      );
      return (
        sample.scalar >= scalarLo &&
        sample.scalar < scalarHi &&
        bq.biome === zone.biome
      );
    };

    // Phase A: Mobs (avoid existing hand-placed entities)
    if (zone.spawnRules.mobs && zone.spawnRules.mobs.table.length > 0) {
      const density =
        BASE_MOB_DENSITY * (zone.spawnRules.mobs.densityMultiplier ?? 1);
      const targetCount = Math.max(1, Math.round(zone.area * density));
      const existingBuffer = HAND_PLACED_ENTITY_BUFFER;

      const mobPositions = poissonDiscSample(
        zone.bounds,
        config.mobSpacing,
        targetCount,
        rng,
        (x, z) => {
          if (!inZone(x, z)) return false;
          // Keep distance from hand-placed entities
          return existingGrid.nearestDistance(x, z) >= existingBuffer;
        },
      );

      for (let i = 0; i < mobPositions.length; i++) {
        const pos = mobPositions[i];
        const entry = weightedSelect(
          zone.spawnRules.mobs.table.map((t) => ({ ...t, weight: t.weight })),
          rng,
        );
        if (!entry) continue;

        allMobs.push({
          id: `autogen-mob-${zone.id}-${i}`,
          mobId: entry.mobId,
          name: `${entry.mobId} spawn`,
          position: { x: pos.x, y: 0, z: pos.z },
          spawnRadius: 5 + rng() * 10,
          maxCount: 1 + Math.floor(rng() * 3),
          respawnTicks: 50 + Math.floor(rng() * 30),
          source: "procgen",
          sourceRegionId: zone.id,
          properties: {},
        });

        mobGrid.insert(pos.x, pos.z);
      }
    }

    // Phase B: Resources with mob-proximity buffer
    if (
      zone.spawnRules.resources &&
      zone.spawnRules.resources.table.length > 0
    ) {
      const density =
        BASE_RESOURCE_DENSITY *
        (zone.spawnRules.resources.densityMultiplier ?? 1);
      const targetCount = Math.max(1, Math.round(zone.area * density));
      const buffer = tier.mobResourceBuffer;

      const resourcePositions = poissonDiscSample(
        zone.bounds,
        config.resourceSpacing,
        targetCount * 2, // oversample since we'll reject some
        rng,
        (x, z) => {
          if (!inZone(x, z)) return false;
          // Mob-resource proximity rejection
          const mobDist = mobGrid.nearestDistance(x, z);
          return mobDist >= buffer;
        },
      );

      // Trim to target count
      const finalPositions = resourcePositions.slice(0, targetCount);

      for (let i = 0; i < finalPositions.length; i++) {
        const pos = finalPositions[i];
        const entry = weightedSelect(
          zone.spawnRules.resources.table.map((t) => ({
            ...t,
            weight: t.weight,
          })),
          rng,
        );
        if (!entry) continue;

        allResources.push({
          id: `autogen-res-${zone.id}-${i}`,
          resourceId: entry.resourceId,
          resourceType: inferResourceType(entry.resourceId),
          name: entry.resourceId,
          position: { x: pos.x, y: 0, z: pos.z },
          rotation: rng() * Math.PI * 2,
          modelVariant: 0,
          source: "procgen",
          sourceRegionId: zone.id,
          properties:
            entry.clusterSize && entry.clusterSize > 1
              ? { clusterSize: entry.clusterSize }
              : {},
        });
      }
    }
  }

  return { mobs: allMobs, resources: allResources };
}
