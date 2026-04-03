/**
 * bridgeGeneration — Automatic bridge detection and placement
 *
 * Scans road paths for water crossings, measures crossing width,
 * and selects bridge style by river width. Replaces hardcoded
 * ISLAND_BRIDGES with procedural detection.
 *
 * No ECS dependencies — operates on plain data.
 */

import { dist2D } from "../MathUtils";

// ============== TYPES ==============

/** Terrain query for bridge detection */
export interface BridgeTerrainQuerier {
  getHeight(x: number, z: number): number;
  isWater(x: number, z: number): boolean;
  /** Optional: get water surface height at position */
  getWaterHeight?(x: number, z: number): number;
}

/** Road path point */
export interface BridgeRoadPoint {
  x: number;
  z: number;
  y: number;
}

/** Road reference for bridge scanning */
export interface BridgeRoadRef {
  fromId: string;
  toId: string;
  path: BridgeRoadPoint[];
}

/** Bridge style selection */
export type BridgeStyle = "plank" | "stone" | "arched";

/** Detected water crossing on a road */
export interface DetectedCrossing {
  /** Road that crosses water */
  roadFromId: string;
  roadToId: string;
  /** Entry point on land (before water) */
  startPoint: { x: number; y: number; z: number };
  /** Exit point on land (after water) */
  endPoint: { x: number; y: number; z: number };
  /** Approximate crossing width in meters */
  width: number;
  /** Water surface Y at the midpoint */
  waterY: number;
  /** Center point of the crossing */
  center: { x: number; y: number; z: number };
}

/** Placed bridge from generation */
export interface GeneratedBridge {
  id: string;
  /** Start position (land) */
  start: { x: number; y: number; z: number };
  /** End position (land) */
  end: { x: number; y: number; z: number };
  /** Bridge width */
  bridgeWidth: number;
  /** Railing height */
  railingHeight: number;
  /** Arch height for arched bridges */
  archHeight: number;
  /** Selected bridge style */
  style: BridgeStyle;
  /** Road this bridge belongs to */
  roadFromId: string;
  roadToId: string;
  /** Water surface height below the bridge */
  waterY: number;
}

/** Bridge generation config */
export interface BridgeGenConfig {
  /** Minimum crossing width to place a bridge (meters, default 2) */
  minCrossingWidth: number;
  /** Maximum crossing width for a bridge (wider = not bridgeable, default 50) */
  maxCrossingWidth: number;
  /** Plank bridge: max width (default 5) */
  plankMaxWidth: number;
  /** Stone bridge: max width (default 15) */
  stoneMaxWidth: number;
  /** Bridge deck width (meters, default 4) */
  deckWidth: number;
  /** Railing height (meters, default 1.2) */
  railingHeight: number;
  /** Arch height for arched bridges (meters, default 1.0) */
  archHeight: number;
  /** Minimum distance between bridges (meters, default 40) */
  minBridgeSpacing: number;
  /** Road sampling step for water detection (meters, default 2) */
  samplingStep: number;
}

export const DEFAULT_BRIDGE_CONFIG: BridgeGenConfig = {
  minCrossingWidth: 2,
  maxCrossingWidth: 50,
  plankMaxWidth: 5,
  stoneMaxWidth: 15,
  deckWidth: 4,
  railingHeight: 1.2,
  archHeight: 1.0,
  minBridgeSpacing: 40,
  samplingStep: 2,
};

// ============== CROSSING DETECTION ==============

/**
 * Scan a road path for water crossings.
 * A crossing is detected when the path transitions from land → water → land.
 */
function detectCrossings(
  road: BridgeRoadRef,
  terrain: BridgeTerrainQuerier,
  config: BridgeGenConfig,
): DetectedCrossing[] {
  const { path } = road;
  if (path.length < 3) return [];

  const crossings: DetectedCrossing[] = [];
  let inWater = false;
  let waterEntryIdx = -1;

  for (let i = 0; i < path.length; i++) {
    const pt = path[i];
    const isWater = terrain.isWater(pt.x, pt.z);

    if (!inWater && isWater) {
      // Entered water
      inWater = true;
      waterEntryIdx = i;
    } else if (inWater && !isWater) {
      // Exited water — we have a crossing
      inWater = false;
      const exitIdx = i;

      // Calculate entry and exit points (last land point before and after water)
      const entryPt = path[Math.max(0, waterEntryIdx - 1)];
      const exitPt = path[exitIdx];

      // Measure width
      const width = dist2D(entryPt.x, entryPt.z, exitPt.x, exitPt.z);

      if (
        width >= config.minCrossingWidth &&
        width <= config.maxCrossingWidth
      ) {
        // Find water surface height at midpoint
        const midIdx = Math.floor((waterEntryIdx + exitIdx) / 2);
        const midPt = path[Math.min(midIdx, path.length - 1)];
        const waterY = terrain.getWaterHeight
          ? terrain.getWaterHeight(midPt.x, midPt.z)
          : terrain.getHeight(midPt.x, midPt.z);

        crossings.push({
          roadFromId: road.fromId,
          roadToId: road.toId,
          startPoint: {
            x: entryPt.x,
            y: terrain.getHeight(entryPt.x, entryPt.z),
            z: entryPt.z,
          },
          endPoint: {
            x: exitPt.x,
            y: terrain.getHeight(exitPt.x, exitPt.z),
            z: exitPt.z,
          },
          width,
          waterY,
          center: {
            x: (entryPt.x + exitPt.x) / 2,
            y: waterY,
            z: (entryPt.z + exitPt.z) / 2,
          },
        });
      }
    }
  }

  return crossings;
}

// ============== STYLE SELECTION ==============

/**
 * Select bridge style based on crossing width.
 */
function selectBridgeStyle(
  width: number,
  config: BridgeGenConfig,
): BridgeStyle {
  if (width <= config.plankMaxWidth) return "plank";
  if (width <= config.stoneMaxWidth) return "stone";
  return "arched";
}

// ============== MAIN API ==============

/**
 * Detect water crossings on all roads and generate bridges.
 *
 * @param roads - Road paths to scan
 * @param terrain - Terrain query
 * @param config - Bridge generation config (defaults applied)
 * @returns Array of generated bridges
 */
export function generateBridges(
  roads: BridgeRoadRef[],
  terrain: BridgeTerrainQuerier,
  config: Partial<BridgeGenConfig> = {},
): GeneratedBridge[] {
  const cfg = { ...DEFAULT_BRIDGE_CONFIG, ...config };
  const bridges: GeneratedBridge[] = [];
  let bridgeIdx = 0;

  // Collect all crossings from all roads
  const allCrossings: DetectedCrossing[] = [];
  for (const road of roads) {
    const crossings = detectCrossings(road, terrain, cfg);
    allCrossings.push(...crossings);
  }

  // Filter out crossings too close to each other
  const accepted: DetectedCrossing[] = [];
  for (const crossing of allCrossings) {
    const tooClose = accepted.some(
      (a) =>
        dist2D(a.center.x, a.center.z, crossing.center.x, crossing.center.z) <
        cfg.minBridgeSpacing,
    );
    if (!tooClose) {
      accepted.push(crossing);
    }
  }

  // Generate bridges for accepted crossings
  for (const crossing of accepted) {
    const style = selectBridgeStyle(crossing.width, cfg);
    const archHeight =
      style === "arched" ? cfg.archHeight * 1.5 : cfg.archHeight;

    bridges.push({
      id: `bridge_${bridgeIdx++}`,
      start: crossing.startPoint,
      end: crossing.endPoint,
      bridgeWidth: cfg.deckWidth,
      railingHeight: cfg.railingHeight,
      archHeight,
      style,
      roadFromId: crossing.roadFromId,
      roadToId: crossing.roadToId,
      waterY: crossing.waterY,
    });
  }

  return bridges;
}

/**
 * Utility: Check if a road segment at a given point crosses water.
 * Useful for spot-checking individual road points.
 */
export function isRoadPointOverWater(
  x: number,
  z: number,
  terrain: BridgeTerrainQuerier,
  checkRadius: number = 2,
): boolean {
  // Check center and 4 nearby points
  if (terrain.isWater(x, z)) return true;
  for (const [dx, dz] of [
    [checkRadius, 0],
    [-checkRadius, 0],
    [0, checkRadius],
    [0, -checkRadius],
  ] as const) {
    if (terrain.isWater(x + dx, z + dz)) return true;
  }
  return false;
}
