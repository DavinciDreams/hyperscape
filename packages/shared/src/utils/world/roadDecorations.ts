/**
 * roadDecorations — Road-side content placement
 *
 * Places signposts, lampposts, mile markers, and waystations along roads.
 * All placement rules are manifest-driven (config passed in, not hardcoded).
 *
 * No ECS dependencies — operates on plain data.
 */

import { dist2D } from "../MathUtils";

// ============== TYPES ==============

/** Terrain query for decoration placement */
export interface DecorationTerrainQuerier {
  getHeight(x: number, z: number): number;
  isWater(x: number, z: number): boolean;
}

/** Road path point */
export interface DecorationRoadPoint {
  x: number;
  z: number;
  y: number;
}

/** Road reference */
export interface DecorationRoadRef {
  fromId: string;
  toId: string;
  path: DecorationRoadPoint[];
}

/** Town reference */
export interface DecorationTownRef {
  id: string;
  name: string;
  position: { x: number; y: number; z: number };
  safeZoneRadius: number;
}

/** A placed road decoration */
export interface PlacedRoadDecoration {
  id: string;
  type: "signpost" | "lamppost" | "mile_marker" | "waystation";
  position: { x: number; y: number; z: number };
  /** Y-axis rotation (faces toward road direction or nearest town) */
  rotation: number;
  /** For signposts: destinations with distances */
  destinations?: { name: string; distance: number; direction: number }[];
  /** For mile markers: distance to nearest town */
  distanceToTown?: number;
  /** Which road this belongs to */
  roadFromId: string;
  roadToId: string;
  /** Source tag */
  source: "wizard";
}

/** Road decoration config */
export interface RoadDecorationConfig {
  /** Lamppost config */
  lampposts: {
    /** Max distance from town edge for lampposts (meters, default 100) */
    nearTownDistance: number;
    /** Spacing between lampposts (meters, default 20) */
    spacing: number;
    /** Offset from road center (meters, default 3) — placed to the side */
    roadOffset: number;
    /** Whether density tapers with distance from town (default true) */
    tapering: boolean;
  };
  /** Signpost config */
  signposts: {
    /** Place at road forks/intersections (default true) */
    atForks: boolean;
    /** Place at road endpoints near towns (default true) */
    atTownEntries: boolean;
    /** Max destinations to show on signpost (default 3) */
    maxDestinations: number;
  };
  /** Mile marker config */
  mileMarkers: {
    /** Spacing between mile markers (meters, default 100) */
    spacing: number;
    /** Offset from road center (meters, default 2) */
    roadOffset: number;
  };
  /** Waystation config */
  waystations: {
    /** Whether to place waystations at road midpoints (default true) */
    atMidpoints: boolean;
    /** Minimum road length to get a waystation (meters, default 200) */
    minRoadLength: number;
  };
}

export const DEFAULT_DECORATION_CONFIG: RoadDecorationConfig = {
  lampposts: {
    nearTownDistance: 100,
    spacing: 20,
    roadOffset: 3,
    tapering: true,
  },
  signposts: {
    atForks: true,
    atTownEntries: true,
    maxDestinations: 3,
  },
  mileMarkers: {
    spacing: 100,
    roadOffset: 2,
  },
  waystations: {
    atMidpoints: true,
    minRoadLength: 200,
  },
};

// ============== HELPERS ==============

/** Compute road length from path points */
function roadLength(path: DecorationRoadPoint[]): number {
  let len = 0;
  for (let i = 1; i < path.length; i++) {
    len += dist2D(path[i].x, path[i].z, path[i - 1].x, path[i - 1].z);
  }
  return len;
}

/** Get the perpendicular offset vector for a road segment at a given index */
function perpendicular(
  path: DecorationRoadPoint[],
  idx: number,
  offset: number,
): { x: number; z: number } {
  const prev = path[Math.max(0, idx - 1)];
  const next = path[Math.min(path.length - 1, idx + 1)];
  const dx = next.x - prev.x;
  const dz = next.z - prev.z;
  const len = Math.sqrt(dx * dx + dz * dz);
  if (len < 0.001) return { x: 0, z: 0 };
  // Perpendicular: rotate 90 degrees
  return { x: (-dz / len) * offset, z: (dx / len) * offset };
}

/** Get the road direction angle at a point index */
function roadDirectionAt(path: DecorationRoadPoint[], idx: number): number {
  const prev = path[Math.max(0, idx - 1)];
  const next = path[Math.min(path.length - 1, idx + 1)];
  return Math.atan2(next.x - prev.x, next.z - prev.z);
}

/** Find nearest town to a position */
function findNearestTown(
  x: number,
  z: number,
  towns: DecorationTownRef[],
): { town: DecorationTownRef; distance: number } | null {
  let best: DecorationTownRef | null = null;
  let bestDist = Infinity;
  for (const t of towns) {
    const d = dist2D(x, z, t.position.x, t.position.z);
    if (d < bestDist) {
      bestDist = d;
      best = t;
    }
  }
  return best ? { town: best, distance: bestDist } : null;
}

/** Sample road path at distance intervals, returning { index, distance } pairs */
function sampleRoadAtIntervals(
  path: DecorationRoadPoint[],
  spacing: number,
): { index: number; accDist: number }[] {
  const samples: { index: number; accDist: number }[] = [];
  let accDist = 0;
  let nextSampleDist = spacing;

  for (let i = 1; i < path.length; i++) {
    const segDist = dist2D(path[i].x, path[i].z, path[i - 1].x, path[i - 1].z);
    accDist += segDist;

    while (accDist >= nextSampleDist) {
      samples.push({ index: i, accDist: nextSampleDist });
      nextSampleDist += spacing;
    }
  }

  return samples;
}

// ============== LAMPPOST PLACEMENT ==============

function placeLampposts(
  road: DecorationRoadRef,
  towns: DecorationTownRef[],
  terrain: DecorationTerrainQuerier,
  config: RoadDecorationConfig["lampposts"],
  startIdx: number,
): PlacedRoadDecoration[] {
  const decorations: PlacedRoadDecoration[] = [];
  let idx = startIdx;

  const samples = sampleRoadAtIntervals(road.path, config.spacing);

  for (const sample of samples) {
    const pt = road.path[sample.index];
    const nearest = findNearestTown(pt.x, pt.z, towns);
    if (!nearest) continue;

    const distFromTownEdge = nearest.distance - nearest.town.safeZoneRadius;

    // Only place lampposts near towns
    if (distFromTownEdge > config.nearTownDistance) continue;
    // Don't place inside town
    if (distFromTownEdge < 0) continue;

    // Tapering: skip some lampposts further from town
    if (config.tapering) {
      const skipChance = distFromTownEdge / config.nearTownDistance;
      // Deterministic skip based on position
      const hash = ((pt.x * 73856093) ^ (pt.z * 19349663)) >>> 0;
      if ((hash % 100) / 100 < skipChance * 0.5) continue;
    }

    // Place to the side of the road
    const perp = perpendicular(road.path, sample.index, config.roadOffset);
    const wx = pt.x + perp.x;
    const wz = pt.z + perp.z;

    if (terrain.isWater(wx, wz)) continue;

    decorations.push({
      id: `lamppost_${idx++}`,
      type: "lamppost",
      position: { x: wx, y: terrain.getHeight(wx, wz), z: wz },
      rotation: roadDirectionAt(road.path, sample.index),
      roadFromId: road.fromId,
      roadToId: road.toId,
      source: "wizard",
    });
  }

  return decorations;
}

// ============== SIGNPOST PLACEMENT ==============

function placeSignposts(
  road: DecorationRoadRef,
  towns: DecorationTownRef[],
  terrain: DecorationTerrainQuerier,
  config: RoadDecorationConfig["signposts"],
  startIdx: number,
): PlacedRoadDecoration[] {
  const decorations: PlacedRoadDecoration[] = [];
  let idx = startIdx;

  if (road.path.length < 2) return decorations;

  // Place signpost near the start of the road (town entry)
  if (config.atTownEntries) {
    for (const endIdx of [3, road.path.length - 4]) {
      const ptIdx = Math.max(0, Math.min(endIdx, road.path.length - 1));
      const pt = road.path[ptIdx];

      // Build destinations: nearest towns sorted by distance
      const destinations: {
        name: string;
        distance: number;
        direction: number;
      }[] = [];
      for (const town of towns) {
        const d = dist2D(pt.x, pt.z, town.position.x, town.position.z);
        const dir = Math.atan2(town.position.x - pt.x, town.position.z - pt.z);
        destinations.push({
          name: town.name,
          distance: Math.round(d),
          direction: dir,
        });
      }

      // Sort by distance, take closest
      destinations.sort((a, b) => a.distance - b.distance);
      const topDest = destinations.slice(0, config.maxDestinations);

      if (topDest.length === 0) continue;

      const perp = perpendicular(road.path, ptIdx, 2);
      const wx = pt.x + perp.x;
      const wz = pt.z + perp.z;
      if (terrain.isWater(wx, wz)) continue;

      decorations.push({
        id: `signpost_${idx++}`,
        type: "signpost",
        position: { x: wx, y: terrain.getHeight(wx, wz), z: wz },
        rotation: roadDirectionAt(road.path, ptIdx),
        destinations: topDest,
        roadFromId: road.fromId,
        roadToId: road.toId,
        source: "wizard",
      });
    }
  }

  return decorations;
}

// ============== MILE MARKER PLACEMENT ==============

function placeMileMarkers(
  road: DecorationRoadRef,
  towns: DecorationTownRef[],
  terrain: DecorationTerrainQuerier,
  config: RoadDecorationConfig["mileMarkers"],
  startIdx: number,
): PlacedRoadDecoration[] {
  const decorations: PlacedRoadDecoration[] = [];
  let idx = startIdx;

  const samples = sampleRoadAtIntervals(road.path, config.spacing);

  for (const sample of samples) {
    const pt = road.path[sample.index];
    const nearest = findNearestTown(pt.x, pt.z, towns);
    if (!nearest) continue;

    // Don't place inside town safe zone
    if (nearest.distance < nearest.town.safeZoneRadius) continue;

    const perp = perpendicular(road.path, sample.index, config.roadOffset);
    const wx = pt.x + perp.x;
    const wz = pt.z + perp.z;

    if (terrain.isWater(wx, wz)) continue;

    decorations.push({
      id: `mile_marker_${idx++}`,
      type: "mile_marker",
      position: { x: wx, y: terrain.getHeight(wx, wz), z: wz },
      rotation: roadDirectionAt(road.path, sample.index),
      distanceToTown: Math.round(nearest.distance),
      roadFromId: road.fromId,
      roadToId: road.toId,
      source: "wizard",
    });
  }

  return decorations;
}

// ============== WAYSTATION PLACEMENT ==============

function placeWaystations(
  road: DecorationRoadRef,
  towns: DecorationTownRef[],
  terrain: DecorationTerrainQuerier,
  config: RoadDecorationConfig["waystations"],
  startIdx: number,
): PlacedRoadDecoration[] {
  const decorations: PlacedRoadDecoration[] = [];
  let idx = startIdx;

  if (!config.atMidpoints) return decorations;

  const totalLen = roadLength(road.path);
  if (totalLen < config.minRoadLength) return decorations;

  // Place waystation at midpoint
  const targetDist = totalLen / 2;
  let accDist = 0;

  for (let i = 1; i < road.path.length; i++) {
    const segDist = dist2D(
      road.path[i].x,
      road.path[i].z,
      road.path[i - 1].x,
      road.path[i - 1].z,
    );
    accDist += segDist;

    if (accDist >= targetDist) {
      const pt = road.path[i];

      // Don't place in water or inside a town
      if (terrain.isWater(pt.x, pt.z)) break;
      const nearest = findNearestTown(pt.x, pt.z, towns);
      if (nearest && nearest.distance < nearest.town.safeZoneRadius) break;

      // Place slightly off road
      const perp = perpendicular(road.path, i, 4);
      const wx = pt.x + perp.x;
      const wz = pt.z + perp.z;
      if (terrain.isWater(wx, wz)) break;

      // Build destinations for the signpost at waystation
      const destinations: {
        name: string;
        distance: number;
        direction: number;
      }[] = [];
      for (const town of towns) {
        const d = dist2D(wx, wz, town.position.x, town.position.z);
        const dir = Math.atan2(town.position.x - wx, town.position.z - wz);
        destinations.push({
          name: town.name,
          distance: Math.round(d),
          direction: dir,
        });
      }
      destinations.sort((a, b) => a.distance - b.distance);

      decorations.push({
        id: `waystation_${idx++}`,
        type: "waystation",
        position: { x: wx, y: terrain.getHeight(wx, wz), z: wz },
        rotation: roadDirectionAt(road.path, i),
        destinations: destinations.slice(0, 3),
        roadFromId: road.fromId,
        roadToId: road.toId,
        source: "wizard",
      });
      break;
    }
  }

  return decorations;
}

// ============== MAIN API ==============

/**
 * Generate all road decorations (lampposts, signposts, mile markers, waystations).
 *
 * @param roads - Roads to decorate
 * @param towns - Towns for distance/direction calculations
 * @param terrain - Terrain query
 * @param config - Decoration config (defaults applied)
 * @returns Array of placed decorations
 */
export function generateRoadDecorations(
  roads: DecorationRoadRef[],
  towns: DecorationTownRef[],
  terrain: DecorationTerrainQuerier,
  config: Partial<RoadDecorationConfig> = {},
): PlacedRoadDecoration[] {
  const cfg: RoadDecorationConfig = {
    lampposts: { ...DEFAULT_DECORATION_CONFIG.lampposts, ...config.lampposts },
    signposts: { ...DEFAULT_DECORATION_CONFIG.signposts, ...config.signposts },
    mileMarkers: {
      ...DEFAULT_DECORATION_CONFIG.mileMarkers,
      ...config.mileMarkers,
    },
    waystations: {
      ...DEFAULT_DECORATION_CONFIG.waystations,
      ...config.waystations,
    },
  };

  const all: PlacedRoadDecoration[] = [];
  let globalIdx = 0;

  for (const road of roads) {
    const lampposts = placeLampposts(
      road,
      towns,
      terrain,
      cfg.lampposts,
      globalIdx,
    );
    globalIdx += lampposts.length;
    all.push(...lampposts);

    const signposts = placeSignposts(
      road,
      towns,
      terrain,
      cfg.signposts,
      globalIdx,
    );
    globalIdx += signposts.length;
    all.push(...signposts);

    const markers = placeMileMarkers(
      road,
      towns,
      terrain,
      cfg.mileMarkers,
      globalIdx,
    );
    globalIdx += markers.length;
    all.push(...markers);

    const stations = placeWaystations(
      road,
      towns,
      terrain,
      cfg.waystations,
      globalIdx,
    );
    globalIdx += stations.length;
    all.push(...stations);
  }

  return all;
}
