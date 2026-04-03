/**
 * patrolRoutes — Guard patrol route generation
 *
 * Auto-generates patrol waypoint routes for town guards:
 * - Town perimeter ring: guard walks around town boundary
 * - Road segment patrol: guard walks along road near town
 *
 * No ECS dependencies — operates on plain data.
 */

import { dist2D } from "../MathUtils";

// ============== TYPES ==============

/** Terrain query for patrol route generation */
export interface PatrolTerrainQuerier {
  getHeight(x: number, z: number): number;
  isWater(x: number, z: number): boolean;
}

/** Town reference for patrol generation */
export interface PatrolTownRef {
  id: string;
  name: string;
  position: { x: number; y: number; z: number };
  safeZoneRadius: number;
}

/** Road path point for road patrol extraction */
export interface PatrolRoadPoint {
  x: number;
  z: number;
  y: number;
}

/** Road reference for road patrols */
export interface PatrolRoadRef {
  fromId: string;
  toId: string;
  path: PatrolRoadPoint[];
}

/** A single patrol waypoint */
export interface PatrolWaypoint {
  position: { x: number; y: number; z: number };
  /** Pause duration at this waypoint (seconds, 0 = no pause) */
  pauseDuration: number;
}

/** Generated patrol route */
export interface PatrolRoute {
  id: string;
  name: string;
  type: "perimeter" | "road_segment";
  townId: string;
  waypoints: PatrolWaypoint[];
  /** Whether the route loops (perimeter) or ping-pongs (road segment) */
  loop: boolean;
  /** Suggested NPC type for this patrol */
  guardType: string;
}

/** Patrol generation config */
export interface PatrolGenConfig {
  /** Number of waypoints for perimeter routes (default 12) */
  perimeterWaypointCount: number;
  /** Perimeter patrol radius fraction of safeZoneRadius (default 0.85) */
  perimeterRadiusFraction: number;
  /** Pause duration at each perimeter waypoint in seconds (default 3) */
  perimeterPauseDuration: number;
  /** Road patrol length from town (meters, default 80) */
  roadPatrolLength: number;
  /** Road patrol waypoint spacing (meters, default 15) */
  roadPatrolSpacing: number;
  /** Default guard NPC type ID */
  defaultGuardType: string;
}

export const DEFAULT_PATROL_CONFIG: PatrolGenConfig = {
  perimeterWaypointCount: 12,
  perimeterRadiusFraction: 0.85,
  perimeterPauseDuration: 3,
  roadPatrolLength: 80,
  roadPatrolSpacing: 15,
  defaultGuardType: "town_guard",
};

// ============== SEEDED RNG ==============

function createLCG(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

// ============== PERIMETER ROUTE ==============

/**
 * Generate a circular perimeter patrol route around a town.
 * Waypoints are evenly spaced around the town at the given radius fraction.
 */
function generatePerimeterRoute(
  town: PatrolTownRef,
  config: PatrolGenConfig,
  terrain: PatrolTerrainQuerier,
  rng: () => number,
  routeIndex: number,
): PatrolRoute {
  const radius = town.safeZoneRadius * config.perimeterRadiusFraction;
  const count = config.perimeterWaypointCount;
  const startAngle = rng() * Math.PI * 2; // Random start angle
  const waypoints: PatrolWaypoint[] = [];

  for (let i = 0; i < count; i++) {
    const angle = startAngle + (i / count) * Math.PI * 2;
    const x = town.position.x + Math.cos(angle) * radius;
    const z = town.position.z + Math.sin(angle) * radius;

    // Skip water positions — find nearest land
    if (terrain.isWater(x, z)) {
      // Shrink radius slightly to avoid water
      const shrunkRadius = radius * 0.7;
      const sx = town.position.x + Math.cos(angle) * shrunkRadius;
      const sz = town.position.z + Math.sin(angle) * shrunkRadius;
      if (terrain.isWater(sx, sz)) continue;
      waypoints.push({
        position: { x: sx, y: terrain.getHeight(sx, sz), z: sz },
        pauseDuration: config.perimeterPauseDuration,
      });
    } else {
      waypoints.push({
        position: { x, y: terrain.getHeight(x, z), z },
        pauseDuration: config.perimeterPauseDuration,
      });
    }
  }

  // Need at least 3 waypoints for a meaningful patrol
  if (waypoints.length < 3) {
    // Fall back to a smaller patrol
    const smallRadius = radius * 0.5;
    for (let i = 0; i < 4; i++) {
      const angle = startAngle + (i / 4) * Math.PI * 2;
      const x = town.position.x + Math.cos(angle) * smallRadius;
      const z = town.position.z + Math.sin(angle) * smallRadius;
      if (!terrain.isWater(x, z)) {
        waypoints.push({
          position: { x, y: terrain.getHeight(x, z), z },
          pauseDuration: config.perimeterPauseDuration,
        });
      }
    }
  }

  return {
    id: `patrol_perimeter_${town.id}_${routeIndex}`,
    name: `${town.name} Perimeter Guard`,
    type: "perimeter",
    townId: town.id,
    waypoints,
    loop: true,
    guardType: config.defaultGuardType,
  };
}

// ============== ROAD SEGMENT ROUTE ==============

/**
 * Generate a road segment patrol route along a road leaving a town.
 * Guard walks out along the road and returns (ping-pong).
 */
function generateRoadPatrolRoute(
  town: PatrolTownRef,
  road: PatrolRoadRef,
  config: PatrolGenConfig,
  terrain: PatrolTerrainQuerier,
  routeIndex: number,
): PatrolRoute | null {
  // Find road points near this town
  const isFromTown = road.fromId === town.id;
  const points = isFromTown ? road.path : [...road.path].reverse();

  // Extract a segment of the road starting from town
  const waypoints: PatrolWaypoint[] = [];
  let totalDist = 0;

  for (
    let i = 0;
    i < points.length && totalDist < config.roadPatrolLength;
    i++
  ) {
    const pt = points[i];
    if (i > 0) {
      totalDist += dist2D(pt.x, pt.z, points[i - 1].x, points[i - 1].z);
    }

    // Sample at spacing intervals
    if (
      waypoints.length === 0 ||
      dist2D(
        pt.x,
        pt.z,
        waypoints[waypoints.length - 1].position.x,
        waypoints[waypoints.length - 1].position.z,
      ) >= config.roadPatrolSpacing
    ) {
      if (!terrain.isWater(pt.x, pt.z)) {
        waypoints.push({
          position: { x: pt.x, y: terrain.getHeight(pt.x, pt.z), z: pt.z },
          pauseDuration: 2,
        });
      }
    }
  }

  if (waypoints.length < 2) return null;

  // Add longer pause at the turnaround point
  waypoints[waypoints.length - 1].pauseDuration = 5;

  return {
    id: `patrol_road_${town.id}_${routeIndex}`,
    name: `${town.name} Road Patrol`,
    type: "road_segment",
    townId: town.id,
    waypoints,
    loop: false, // Ping-pong
    guardType: config.defaultGuardType,
  };
}

// ============== MAIN API ==============

/**
 * Generate patrol routes for all towns.
 *
 * Each town gets:
 * - 1 perimeter patrol route
 * - 1 road segment patrol per connected road (up to 2)
 *
 * @param towns - Towns to generate patrols for
 * @param roads - Roads connecting towns
 * @param terrain - Terrain query
 * @param seed - Random seed
 * @param config - Generation config (defaults applied)
 * @returns Array of patrol routes
 */
export function generatePatrolRoutes(
  towns: PatrolTownRef[],
  roads: PatrolRoadRef[],
  terrain: PatrolTerrainQuerier,
  seed: number,
  config: Partial<PatrolGenConfig> = {},
): PatrolRoute[] {
  const cfg = { ...DEFAULT_PATROL_CONFIG, ...config };
  const rng = createLCG(seed + 33333);
  const routes: PatrolRoute[] = [];
  let routeIdx = 0;

  for (const town of towns) {
    // 1. Perimeter patrol
    const perimeter = generatePerimeterRoute(
      town,
      cfg,
      terrain,
      rng,
      routeIdx++,
    );
    if (perimeter.waypoints.length >= 3) {
      routes.push(perimeter);
    }

    // 2. Road segment patrols (up to 2 per town)
    const townRoads = roads.filter(
      (r) => r.fromId === town.id || r.toId === town.id,
    );
    let roadPatrolCount = 0;
    for (const road of townRoads) {
      if (roadPatrolCount >= 2) break;
      const roadPatrol = generateRoadPatrolRoute(
        town,
        road,
        cfg,
        terrain,
        routeIdx++,
      );
      if (roadPatrol) {
        routes.push(roadPatrol);
        roadPatrolCount++;
      }
    }
  }

  return routes;
}
