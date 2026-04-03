/**
 * wildernessLandmarks — Zone boundary markers and wilderness features
 *
 * Places visual cues at zone difficulty transitions, fences near towns,
 * and environmental scatter along roads. All placement rules are
 * manifest-driven via config.
 *
 * No ECS dependencies — operates on plain data.
 */

import { dist2D } from "../MathUtils";

// ============== TYPES ==============

/** Terrain query for landmark placement */
export interface LandmarkTerrainQuerier {
  getHeight(x: number, z: number): number;
  isWater(x: number, z: number): boolean;
  getBiome(x: number, z: number): string;
}

/** Difficulty query for zone boundary detection */
export interface DifficultyQuerier {
  /** Get difficulty scalar (0-1) at world position */
  getDifficulty(x: number, z: number): number;
}

/** Town reference */
export interface LandmarkTownRef {
  id: string;
  name: string;
  position: { x: number; y: number; z: number };
  safeZoneRadius: number;
}

/** Road path point */
export interface LandmarkRoadPoint {
  x: number;
  z: number;
  y: number;
}

/** Road reference for environmental scatter along roads */
export interface LandmarkRoadRef {
  fromId: string;
  toId: string;
  path: LandmarkRoadPoint[];
}

/** Difficulty tier boundary definition */
export interface TierBoundaryDef {
  /** From tier name (lower difficulty) */
  fromTier: string;
  /** To tier name (higher difficulty) */
  toTier: string;
  /** Difficulty scalar threshold between tiers */
  threshold: number;
  /** Marker types to place at this boundary */
  markers: BoundaryMarkerType[];
}

/** Type of marker placed at a zone boundary */
export type BoundaryMarkerType =
  | "warning_sign"
  | "broken_fence"
  | "scattered_bones"
  | "warning_totem"
  | "scorched_ground"
  | "skull_on_pike"
  | "corruption_marker";

/** A placed wilderness landmark */
export interface PlacedWildernessLandmark {
  id: string;
  type: string;
  subtype?: BoundaryMarkerType;
  position: { x: number; y: number; z: number };
  rotation: number;
  scale: number;
  /** Metadata (e.g., sign text, damage level) */
  metadata?: Record<string, unknown>;
  /** Source tag */
  source: "wizard";
}

/** Wilderness landmark generation config */
export interface WildernessLandmarkConfig {
  /** Zone boundary markers */
  boundaryMarkers: {
    /** Enable boundary marker placement (default true) */
    enabled: boolean;
    /** Sample spacing along boundary contour (meters, default 40) */
    spacing: number;
    /** Number of radial samples to detect boundary (default 36) */
    radialSamples: number;
    /** Boundary detection radius from each town (meters, default 500) */
    detectionRadius: number;
    /** Tier boundary definitions */
    tiers: TierBoundaryDef[];
  };
  /** Wilderness fences near towns */
  fences: {
    /** Enable fence placement (default true) */
    enabled: boolean;
    /** Max distance from town edge for fences (meters, default 40) */
    maxDistFromTown: number;
    /** Spacing between fence segments (meters, default 8) */
    spacing: number;
    /** Damage increases with distance from town (default true) */
    increasingDamage: boolean;
  };
  /** Environmental scatter along roads */
  scatter: {
    /** Enable road-side scatter (default true) */
    enabled: boolean;
    /** Scatter types: stumps, fallen_logs, boulders */
    types: string[];
    /** Average spacing between scatter objects (meters, default 25) */
    spacing: number;
    /** Max offset from road center (meters, default 8) */
    maxRoadOffset: number;
    /** Only scatter outside town safe zones (default true) */
    outsideTownsOnly: boolean;
  };
}

export const DEFAULT_WILDERNESS_CONFIG: WildernessLandmarkConfig = {
  boundaryMarkers: {
    enabled: true,
    spacing: 40,
    radialSamples: 36,
    detectionRadius: 500,
    tiers: [
      {
        fromTier: "Safe",
        toTier: "Beginner",
        threshold: 0.05,
        markers: ["warning_sign", "broken_fence"],
      },
      {
        fromTier: "Beginner",
        toTier: "Low",
        threshold: 0.2,
        markers: ["broken_fence", "scattered_bones"],
      },
      {
        fromTier: "Low",
        toTier: "Mid",
        threshold: 0.4,
        markers: ["warning_totem", "scorched_ground"],
      },
      {
        fromTier: "Mid",
        toTier: "High",
        threshold: 0.6,
        markers: ["warning_totem", "skull_on_pike"],
      },
      {
        fromTier: "High",
        toTier: "Extreme",
        threshold: 0.8,
        markers: ["skull_on_pike", "corruption_marker"],
      },
    ],
  },
  fences: {
    enabled: true,
    maxDistFromTown: 40,
    spacing: 8,
    increasingDamage: true,
  },
  scatter: {
    enabled: true,
    types: ["stump", "fallen_log", "boulder"],
    spacing: 25,
    maxRoadOffset: 8,
    outsideTownsOnly: true,
  },
};

// ============== SEEDED RNG ==============

function createLCG(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

// ============== BOUNDARY MARKER PLACEMENT ==============

/**
 * Detect zone difficulty boundaries by radial sampling from towns
 * and place markers at transition points.
 */
function placeBoundaryMarkers(
  towns: LandmarkTownRef[],
  terrain: LandmarkTerrainQuerier,
  difficulty: DifficultyQuerier,
  config: WildernessLandmarkConfig["boundaryMarkers"],
  rng: () => number,
  startIdx: number,
): PlacedWildernessLandmark[] {
  if (!config.enabled) return [];

  const landmarks: PlacedWildernessLandmark[] = [];
  let idx = startIdx;
  const placedPositions: { x: number; z: number }[] = [];

  for (const town of towns) {
    // For each tier boundary, search radially for the transition
    for (const tierDef of config.tiers) {
      const threshold = tierDef.threshold;

      for (let ray = 0; ray < config.radialSamples; ray++) {
        const angle = (ray / config.radialSamples) * Math.PI * 2;

        // Walk outward from town center to find the boundary
        let foundBoundary = false;
        let prevDiff = 0;

        for (
          let dist = town.safeZoneRadius;
          dist < config.detectionRadius;
          dist += 10
        ) {
          const x = town.position.x + Math.cos(angle) * dist;
          const z = town.position.z + Math.sin(angle) * dist;

          if (terrain.isWater(x, z)) continue;

          const diff = difficulty.getDifficulty(x, z);

          // Detect crossing: previous sample below threshold, current above
          if (
            prevDiff < threshold &&
            diff >= threshold &&
            dist > town.safeZoneRadius + 5
          ) {
            // Check spacing against existing markers
            const tooClose = placedPositions.some(
              (p) => dist2D(p.x, p.z, x, z) < config.spacing,
            );
            if (tooClose) {
              prevDiff = diff;
              continue;
            }

            // Place marker
            const markerType =
              tierDef.markers[Math.floor(rng() * tierDef.markers.length)];

            landmarks.push({
              id: `boundary_${idx++}`,
              type: "boundary_marker",
              subtype: markerType,
              position: {
                x,
                y: terrain.getHeight(x, z),
                z,
              },
              rotation: angle + Math.PI, // Face toward town
              scale: 0.8 + rng() * 0.4,
              metadata: {
                fromTier: tierDef.fromTier,
                toTier: tierDef.toTier,
                markerType,
              },
              source: "wizard",
            });

            placedPositions.push({ x, z });
            foundBoundary = true;
            break;
          }

          prevDiff = diff;
        }

        // Don't need to continue if we already found this boundary on this ray
        if (foundBoundary) continue;
      }
    }
  }

  return landmarks;
}

// ============== WILDERNESS FENCE PLACEMENT ==============

/**
 * Place dilapidated fence segments near town edges.
 * Fences become more damaged further from town.
 */
function placeWildernessFences(
  towns: LandmarkTownRef[],
  terrain: LandmarkTerrainQuerier,
  config: WildernessLandmarkConfig["fences"],
  rng: () => number,
  startIdx: number,
): PlacedWildernessLandmark[] {
  if (!config.enabled) return [];

  const landmarks: PlacedWildernessLandmark[] = [];
  let idx = startIdx;

  for (const town of towns) {
    const minDist = town.safeZoneRadius * 0.9;
    const maxDist = town.safeZoneRadius + config.maxDistFromTown;

    // Place fence segments in a ring around the town
    const circumference = (Math.PI * 2 * (minDist + maxDist)) / 2;
    const fenceCount = Math.floor(circumference / config.spacing);

    for (let i = 0; i < fenceCount; i++) {
      const angle = (i / fenceCount) * Math.PI * 2 + rng() * 0.2;
      const dist = minDist + rng() * (maxDist - minDist);
      const x = town.position.x + Math.cos(angle) * dist;
      const z = town.position.z + Math.sin(angle) * dist;

      if (terrain.isWater(x, z)) continue;

      // Skip ~30% randomly for organic look
      if (rng() < 0.3) continue;

      // Damage increases with distance
      const distFraction = (dist - minDist) / (maxDist - minDist);
      const damage = config.increasingDamage
        ? 0.1 + distFraction * 0.8
        : 0.3 + rng() * 0.4;

      // Fence follows the tangent of the circle
      const tangentAngle = angle + Math.PI / 2;

      landmarks.push({
        id: `fence_${idx++}`,
        type: "wilderness_fence",
        position: { x, y: terrain.getHeight(x, z), z },
        rotation: tangentAngle + (rng() - 0.5) * 0.3, // Slight wobble
        scale: 0.9 + rng() * 0.2,
        metadata: {
          damage,
          missingRails: damage > 0.5 ? Math.floor(rng() * 3) : 0,
          tilted: damage > 0.7,
        },
        source: "wizard",
      });
    }
  }

  return landmarks;
}

// ============== ENVIRONMENTAL SCATTER ==============

/**
 * Place stumps, fallen logs, and boulders along roads (outside towns).
 */
function placeEnvironmentalScatter(
  roads: LandmarkRoadRef[],
  towns: LandmarkTownRef[],
  terrain: LandmarkTerrainQuerier,
  config: WildernessLandmarkConfig["scatter"],
  rng: () => number,
  startIdx: number,
): PlacedWildernessLandmark[] {
  if (!config.enabled || config.types.length === 0) return [];

  const landmarks: PlacedWildernessLandmark[] = [];
  let idx = startIdx;

  for (const road of roads) {
    let accDist = 0;
    let nextDist = config.spacing * (0.5 + rng() * 0.5); // Randomize first placement

    for (let i = 1; i < road.path.length; i++) {
      const prev = road.path[i - 1];
      const curr = road.path[i];
      const segDist = dist2D(curr.x, curr.z, prev.x, prev.z);
      accDist += segDist;

      if (accDist < nextDist) continue;

      // Reset next distance with jitter
      nextDist = accDist + config.spacing * (0.7 + rng() * 0.6);

      // Random offset perpendicular to road
      const dx = curr.x - prev.x;
      const dz = curr.z - prev.z;
      const len = Math.sqrt(dx * dx + dz * dz);
      if (len < 0.001) continue;

      const perpX = -dz / len;
      const perpZ = dx / len;
      const offset = (rng() - 0.5) * 2 * config.maxRoadOffset;
      const sign = rng() > 0.5 ? 1 : -1;
      const wx = curr.x + perpX * (3 + Math.abs(offset)) * sign;
      const wz = curr.z + perpZ * (3 + Math.abs(offset)) * sign;

      if (terrain.isWater(wx, wz)) continue;

      // Check if inside a town safe zone
      if (config.outsideTownsOnly) {
        let insideTown = false;
        for (const town of towns) {
          if (
            dist2D(wx, wz, town.position.x, town.position.z) <
            town.safeZoneRadius
          ) {
            insideTown = true;
            break;
          }
        }
        if (insideTown) continue;
      }

      const type = config.types[Math.floor(rng() * config.types.length)];

      landmarks.push({
        id: `scatter_${idx++}`,
        type: "environmental_scatter",
        subtype: undefined,
        position: { x: wx, y: terrain.getHeight(wx, wz), z: wz },
        rotation: rng() * Math.PI * 2,
        scale: 0.7 + rng() * 0.6,
        metadata: { scatterType: type },
        source: "wizard",
      });
    }
  }

  return landmarks;
}

// ============== MAIN API ==============

/**
 * Generate all wilderness landmarks: boundary markers, fences, environmental scatter.
 *
 * @param towns - Towns for fence placement and boundary detection
 * @param roads - Roads for environmental scatter
 * @param terrain - Terrain query
 * @param difficulty - Difficulty scalar query
 * @param seed - Random seed
 * @param config - Landmark config (defaults applied)
 * @returns Array of placed wilderness landmarks
 */
export function generateWildernessLandmarks(
  towns: LandmarkTownRef[],
  roads: LandmarkRoadRef[],
  terrain: LandmarkTerrainQuerier,
  difficulty: DifficultyQuerier,
  seed: number,
  config: Partial<WildernessLandmarkConfig> = {},
): PlacedWildernessLandmark[] {
  const cfg: WildernessLandmarkConfig = {
    boundaryMarkers: {
      ...DEFAULT_WILDERNESS_CONFIG.boundaryMarkers,
      ...config.boundaryMarkers,
      tiers:
        config.boundaryMarkers?.tiers ??
        DEFAULT_WILDERNESS_CONFIG.boundaryMarkers.tiers,
    },
    fences: { ...DEFAULT_WILDERNESS_CONFIG.fences, ...config.fences },
    scatter: {
      ...DEFAULT_WILDERNESS_CONFIG.scatter,
      ...config.scatter,
      types: config.scatter?.types ?? DEFAULT_WILDERNESS_CONFIG.scatter.types,
    },
  };

  const rng = createLCG(seed + 88888);
  const all: PlacedWildernessLandmark[] = [];
  let globalIdx = 0;

  // 1. Zone boundary markers
  const markers = placeBoundaryMarkers(
    towns,
    terrain,
    difficulty,
    cfg.boundaryMarkers,
    rng,
    globalIdx,
  );
  globalIdx += markers.length;
  all.push(...markers);

  // 2. Wilderness fences
  const fences = placeWildernessFences(
    towns,
    terrain,
    cfg.fences,
    rng,
    globalIdx,
  );
  globalIdx += fences.length;
  all.push(...fences);

  // 3. Environmental scatter
  const scatter = placeEnvironmentalScatter(
    roads,
    towns,
    terrain,
    cfg.scatter,
    rng,
    globalIdx,
  );
  all.push(...scatter);

  return all;
}
