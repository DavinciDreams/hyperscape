/**
 * DockDefinition — data for dock placements.
 *
 * Each dock specifies a position, direction, and dimensions.
 * Devs assign exact positions — no automatic shoreline detection.
 *
 * The direction is a cardinal: "north" | "south" | "east" | "west",
 * indicating which way the dock extends out over water.
 */

export type DockDirection = "north" | "south" | "east" | "west";

export interface DockDefinition {
  id: string;
  /** Shore-side anchor X (where the dock meets land) */
  x: number;
  /** Shore-side anchor Z */
  z: number;
  /** Cardinal direction the dock extends over water */
  direction: DockDirection;
  /** Deck width in meters (tiles across, default 3) */
  width?: number;
  /** Deck length in meters (tiles into water, default 12) */
  length?: number;
  /** Label shown on interaction (default "Dock") */
  label?: string;
}

/**
 * Dock placements — devs define exact positions and directions.
 * Add entries here to place docks anywhere on the map.
 */
export const ISLAND_DOCKS: DockDefinition[] = [
  // Example placements — update coordinates to match your terrain:
  // {
  //   id: "dock_harbor",
  //   x: 100,
  //   z: -200,
  //   direction: "south",
  //   width: 3,
  //   length: 14,
  //   label: "Harbor Dock",
  // },
];
