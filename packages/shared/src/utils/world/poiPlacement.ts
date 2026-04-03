/**
 * poiPlacement — Pure logic for POI generation
 *
 * Extracted from POISystem so the editor can place POIs without
 * instantiating a full ECS World. Includes:
 * - Category-based placement with spacing constraints
 * - Biome affinity scoring
 * - Noise-based clustering and importance variation
 * - Fishing spot water-edge detection
 * - Name generation
 *
 * All terrain queries go through callback interfaces.
 */

import type {
  PointOfInterest,
  POICategory,
} from "../../types/world/world-types";
import { dist2D } from "../MathUtils";

// ============== TYPES ==============

/** Terrain query callbacks for POI placement */
export interface POITerrainQuerier {
  getHeight(x: number, z: number): number;
  getBiome(x: number, z: number): string;
  isWater(x: number, z: number): boolean;
}

/** Noise function for clustering and importance variation */
export type Noise2D = (x: number, z: number) => number;

/** Town reference for spacing checks */
export interface POITownRef {
  id: string;
  position: { x: number; z: number };
}

/** POI generation config */
export interface POIGenConfig {
  countPerCategory: Partial<Record<POICategory, number>>;
  minDistanceFromTowns: number;
  minPOISpacing: number;
  /** World half-size in meters */
  halfWorldSize: number;
  /** Seed for deterministic generation */
  seed: number;
}

// ============== CATEGORY PROPERTIES ==============

export const CATEGORY_PROPERTIES: Record<
  POICategory,
  { radius: number; baseImportance: number; preferredBiomes: string[] }
> = {
  dungeon: {
    radius: 30,
    baseImportance: 0.9,
    preferredBiomes: ["canyon", "tundra"],
  },
  shrine: {
    radius: 10,
    baseImportance: 0.6,
    preferredBiomes: ["forest", "tundra"],
  },
  landmark: {
    radius: 20,
    baseImportance: 0.5,
    preferredBiomes: ["canyon", "tundra"],
  },
  resource_area: {
    radius: 25,
    baseImportance: 0.7,
    preferredBiomes: ["forest", "canyon"],
  },
  ruin: {
    radius: 35,
    baseImportance: 0.8,
    preferredBiomes: ["canyon", "tundra"],
  },
  camp: {
    radius: 20,
    baseImportance: 0.4,
    preferredBiomes: ["forest", "tundra"],
  },
  crossing: {
    radius: 15,
    baseImportance: 0.85,
    preferredBiomes: ["canyon", "tundra"],
  },
  waystation: {
    radius: 12,
    baseImportance: 0.3,
    preferredBiomes: ["forest", "tundra"],
  },
  fishing_spot: {
    radius: 15,
    baseImportance: 0.75,
    preferredBiomes: ["forest", "tundra"],
  },
};

// ============== NAME GENERATION ==============

const POI_NAME_PREFIXES: Record<POICategory, string[]> = {
  dungeon: ["Dark", "Ancient", "Forgotten", "Shadow", "Deep", "Lost", "Cursed"],
  shrine: ["Sacred", "Hidden", "Old", "Blessed", "Quiet", "Stone", "Forest"],
  landmark: ["Tall", "Great", "Ancient", "Lone", "Twin", "Fallen", "Standing"],
  resource_area: ["Rich", "Old", "Northern", "Southern", "Eastern", "Western"],
  ruin: ["Crumbling", "Ancient", "Forgotten", "Abandoned", "Broken", "Silent"],
  camp: ["Hidden", "Outlaw", "Hunter", "Ranger", "Traveler", "Merchant"],
  crossing: ["Old", "Stone", "Narrow", "Wide", "Rocky", "Swift"],
  waystation: ["Roadside", "Halfway", "Lonely", "Traveler", "Dusty", "Shady"],
  fishing_spot: [
    "Quiet",
    "Peaceful",
    "Sunny",
    "Shady",
    "Deep",
    "Clear",
    "Misty",
  ],
};

const POI_NAME_SUFFIXES: Record<POICategory, string[]> = {
  dungeon: ["Caverns", "Depths", "Mines", "Catacombs", "Tunnels", "Halls"],
  shrine: ["Shrine", "Altar", "Grove", "Circle", "Stones", "Spring"],
  landmark: ["Rock", "Tree", "Falls", "Peak", "Spire", "Mesa"],
  resource_area: ["Quarry", "Grove", "Mine", "Camp", "Fields"],
  ruin: ["Ruins", "Tower", "Keep", "Temple", "Fortress", "Manor"],
  camp: ["Camp", "Hideout", "Lair", "Den", "Outpost", "Shelter"],
  crossing: ["Bridge", "Ford", "Pass", "Crossing", "Gate", "Gap"],
  waystation: ["Rest", "Inn", "Stop", "Shelter", "Post", "Lodge"],
  fishing_spot: ["Cove", "Dock", "Pier", "Shore", "Bank", "Landing"],
};

// ============== SEEDED RNG ==============

/** Linear congruential generator (matches POISystem's internal RNG) */
function createLCG(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

// ============== CORE GENERATION ==============

/**
 * Generate a name for a POI using seeded randomness.
 */
export function generatePOIName(
  category: POICategory,
  index: number,
  seed: number,
): string {
  const rng = createLCG(seed + index * 7919 + category.charCodeAt(0));
  const prefixes = POI_NAME_PREFIXES[category];
  const suffixes = POI_NAME_SUFFIXES[category];
  const prefix = prefixes[Math.floor(rng() * prefixes.length)];
  const suffix = suffixes[Math.floor(rng() * suffixes.length)];
  return `${prefix} ${suffix}`;
}

/**
 * Search for a water edge (land-to-water transition) along a ray.
 * Returns the position just before the water starts (on land).
 */
export function findWaterEdge(
  startX: number,
  startZ: number,
  angle: number,
  maxDistance: number,
  stepSize: number,
  terrain: POITerrainQuerier,
): { x: number; z: number } | null {
  const dirX = Math.cos(angle);
  const dirZ = Math.sin(angle);

  let currentX = startX;
  let currentZ = startZ;
  let lastX = currentX;
  let lastZ = currentZ;
  let wasWater = terrain.isWater(currentX, currentZ);

  // If starting underwater, first find land
  if (wasWater) {
    let foundLand = false;
    for (let dist = stepSize; dist <= maxDistance; dist += stepSize) {
      const x = startX + dirX * dist;
      const z = startZ + dirZ * dist;
      if (!terrain.isWater(x, z)) {
        currentX = x;
        currentZ = z;
        lastX = x;
        lastZ = z;
        wasWater = false;
        foundLand = true;
        break;
      }
    }
    if (!foundLand) return null;
  }

  // Search for land-to-water transition
  for (let dist = stepSize; dist <= maxDistance; dist += stepSize) {
    const x = currentX + dirX * dist;
    const z = currentZ + dirZ * dist;
    const isW = terrain.isWater(x, z);

    if (isW && !wasWater) {
      // Transition: move slightly toward the edge (30% of step)
      return {
        x: lastX + dirX * (stepSize * 0.3),
        z: lastZ + dirZ * (stepSize * 0.3),
      };
    }

    wasWater = isW;
    lastX = x;
    lastZ = z;
  }

  return null;
}

/**
 * Generate fishing spot POIs at water edges.
 */
function generateFishingSpots(
  targetCount: number,
  config: POIGenConfig,
  terrain: POITerrainQuerier,
  noise: Noise2D,
  towns: POITownRef[],
  existingPOIs: PointOfInterest[],
): PointOfInterest[] {
  const pois: PointOfInterest[] = [];
  const properties = CATEGORY_PROPERTIES.fishing_spot;
  const maxAttempts = targetCount * 50;
  const searchRadius = 300;
  const searchStepSize = 8;
  const searchDirections = 8;

  const rng = createLCG(config.seed + 99999);

  for (
    let attempt = 0;
    attempt < maxAttempts && pois.length < targetCount;
    attempt++
  ) {
    const startX = (rng() - 0.5) * config.halfWorldSize * 1.8;
    const startZ = (rng() - 0.5) * config.halfWorldSize * 1.8;

    if (
      Math.abs(startX) > config.halfWorldSize - 200 ||
      Math.abs(startZ) > config.halfWorldSize - 200
    ) {
      continue;
    }

    // Search in multiple directions for a water edge
    let waterEdge: { x: number; z: number } | null = null;
    const baseAngle = rng() * Math.PI * 2;
    for (let dir = 0; dir < searchDirections && !waterEdge; dir++) {
      const searchAngle = baseAngle + (dir / searchDirections) * Math.PI * 2;
      waterEdge = findWaterEdge(
        startX,
        startZ,
        searchAngle,
        searchRadius,
        searchStepSize,
        terrain,
      );
    }
    if (!waterEdge) continue;

    const { x, z } = waterEdge;

    // Spacing check: fishing spots can be closer to towns
    const minDistFromTown = config.minDistanceFromTowns * 0.5;
    if (
      towns.some(
        (t) => dist2D(x, z, t.position.x, t.position.z) < minDistFromTown,
      )
    )
      continue;

    // Only check against other fishing spots
    const minFishingSpacing = config.minPOISpacing * 0.75;
    if (
      pois.some(
        (p) => dist2D(x, z, p.position.x, p.position.z) < minFishingSpacing,
      )
    )
      continue;

    const y = terrain.getHeight(x, z);
    const biome = terrain.getBiome(x, z);

    let importance = properties.baseImportance;
    if (properties.preferredBiomes.includes(biome)) importance += 0.1;
    importance += noise(x * 0.002 + 2000, z * 0.002 + 2000) * 0.1;
    importance = Math.max(0.5, Math.min(1.0, importance));

    pois.push({
      id: `poi_fishing_spot_${existingPOIs.length + pois.length}`,
      name: generatePOIName("fishing_spot", pois.length, config.seed),
      category: "fishing_spot",
      position: { x, y, z },
      importance,
      radius: properties.radius,
      biome,
      connectedRoads: [],
      procedural: true,
    });
  }

  return pois;
}

/**
 * Generate POIs for a specific category (non-fishing).
 */
function generateCategoryPOIs(
  category: POICategory,
  targetCount: number,
  config: POIGenConfig,
  terrain: POITerrainQuerier,
  noise: Noise2D,
  towns: POITownRef[],
  existingPOIs: PointOfInterest[],
): PointOfInterest[] {
  const pois: PointOfInterest[] = [];
  const properties = CATEGORY_PROPERTIES[category];
  const maxAttempts = targetCount * 20;

  const rng = createLCG(config.seed + category.charCodeAt(0) * 12345);

  for (
    let attempt = 0;
    attempt < maxAttempts && pois.length < targetCount;
    attempt++
  ) {
    const baseX = (rng() - 0.5) * config.halfWorldSize * 1.8;
    const baseZ = (rng() - 0.5) * config.halfWorldSize * 1.8;

    // Noise-based clustering
    if (noise(baseX * 0.001, baseZ * 0.001) < -0.3) continue;

    const x = baseX;
    const z = baseZ;

    // World bounds
    if (
      Math.abs(x) > config.halfWorldSize - 100 ||
      Math.abs(z) > config.halfWorldSize - 100
    )
      continue;

    // Town distance
    if (
      towns.some(
        (t) =>
          dist2D(x, z, t.position.x, t.position.z) <
          config.minDistanceFromTowns,
      )
    )
      continue;

    // POI spacing (all existing + newly generated)
    if (
      [...existingPOIs, ...pois].some(
        (p) => dist2D(x, z, p.position.x, p.position.z) < config.minPOISpacing,
      )
    )
      continue;

    // Skip water (except crossings which can be at water edges)
    if (terrain.isWater(x, z) && category !== "crossing") continue;

    const y = terrain.getHeight(x, z);
    const biome = terrain.getBiome(x, z);

    let importance = properties.baseImportance;
    if (properties.preferredBiomes.includes(biome)) importance += 0.1;
    importance += noise(x * 0.002 + 1000, z * 0.002 + 1000) * 0.15;
    importance = Math.max(0.1, Math.min(1.0, importance));

    pois.push({
      id: `poi_${category}_${existingPOIs.length + pois.length}`,
      name: generatePOIName(category, pois.length, config.seed),
      category,
      position: { x, y, z },
      importance,
      radius: properties.radius,
      biome,
      connectedRoads: [],
      procedural: true,
    });
  }

  return pois;
}

// ============== MAIN API ==============

/**
 * Default POI counts per category.
 */
export const DEFAULT_POI_COUNTS: Record<POICategory, number> = {
  dungeon: 8,
  shrine: 12,
  landmark: 15,
  resource_area: 10,
  ruin: 6,
  camp: 8,
  crossing: 5,
  waystation: 10,
  fishing_spot: 12,
};

/**
 * Generate POIs across all categories.
 *
 * @param config - Generation configuration
 * @param terrain - Terrain query callbacks
 * @param noise - Noise function for clustering/variation
 * @param towns - Town positions for spacing constraints
 * @returns Array of POIs sorted by importance (highest first)
 */
export function generatePOIs(
  config: POIGenConfig,
  terrain: POITerrainQuerier,
  noise: Noise2D,
  towns: POITownRef[],
): PointOfInterest[] {
  const allPOIs: PointOfInterest[] = [];
  const categories = Object.keys(config.countPerCategory) as POICategory[];

  for (const category of categories) {
    const count = config.countPerCategory[category] ?? 0;
    if (count === 0) continue;

    const generated =
      category === "fishing_spot"
        ? generateFishingSpots(count, config, terrain, noise, towns, allPOIs)
        : generateCategoryPOIs(
            category,
            count,
            config,
            terrain,
            noise,
            towns,
            allPOIs,
          );

    allPOIs.push(...generated);
  }

  // Sort by importance (highest first) for road connection priority
  allPOIs.sort((a, b) => b.importance - a.importance);
  return allPOIs;
}

/**
 * Calculate entry point for a POI (where a road connects).
 * Returns a point on the POI perimeter closest to the target.
 */
export function calculatePOIEntryPoint(
  poi: PointOfInterest,
  targetX: number,
  targetZ: number,
): { x: number; z: number; angle: number } {
  const dx = targetX - poi.position.x;
  const dz = targetZ - poi.position.z;
  const dist = Math.sqrt(dx * dx + dz * dz);

  if (dist < 1) {
    return { x: poi.position.x, z: poi.position.z, angle: 0 };
  }

  const angle = Math.atan2(dz, dx);
  return {
    x: poi.position.x + (dx / dist) * poi.radius,
    z: poi.position.z + (dz / dist) * poi.radius,
    angle,
  };
}
