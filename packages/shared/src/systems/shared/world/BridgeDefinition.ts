/**
 * BridgeDefinition — data for bridge placements.
 *
 * Each bridge specifies start/end positions and style. The BridgeSystem
 * computes deck height from terrain + arch curve and generates collision.
 *
 * Devs assign exact start/end positions — no automatic river snapping.
 */

export type BridgeStyle = "stone" | "wood";

export interface BridgeDefinition {
  id: string;
  /** Start position (one bank) */
  startX: number;
  startZ: number;
  /** End position (other bank) */
  endX: number;
  endZ: number;
  /** Bridge deck width (meters) */
  width: number;
  /** Railing height above deck (meters) */
  railingHeight: number;
  /** Arch height above straight line between endpoints (meters, 0 = flat) */
  archHeight: number;
  /** Visual style */
  style: BridgeStyle;
}

/**
 * Bridge placements — devs define exact start/end coordinates.
 * Add entries here to place bridges anywhere on the map.
 */
export const ISLAND_BRIDGES: BridgeDefinition[] = [
  {
    id: "bridge_river_crossing",
    startX: 877.5,
    startZ: 512.5,
    endX: 1057.5,
    endZ: 603.5,
    width: 8,
    railingHeight: 1.2,
    archHeight: 2.0,
    style: "wood",
  },
];
