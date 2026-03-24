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
    id: "bridge_west",
    startX: -330,
    startZ: -100,
    endX: -330,
    endZ: -60,
    width: 4,
    railingHeight: 1.2,
    archHeight: 1.0,
    style: "wood",
  },
  {
    id: "bridge_central",
    startX: -60,
    startZ: -150,
    endX: -60,
    endZ: -110,
    width: 4.5,
    railingHeight: 1.2,
    archHeight: 1.2,
    style: "wood",
  },
  {
    id: "bridge_east",
    startX: 230,
    startZ: -150,
    endX: 230,
    endZ: -110,
    width: 4,
    railingHeight: 1.2,
    archHeight: 1.0,
    style: "wood",
  },
  {
    id: "bridge_coastal",
    startX: 440,
    startZ: -70,
    endX: 440,
    endZ: -20,
    width: 4,
    railingHeight: 1.2,
    archHeight: 0.8,
    style: "wood",
  },
];
