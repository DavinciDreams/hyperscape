/**
 * DockDefinition — data for dock placements.
 *
 * Each dock specifies a position, rotation, and dimensions.
 * Devs assign exact positions — no automatic shoreline detection.
 *
 * `rotation` is degrees (compass bearing) for the direction the dock
 * extends over water: 0° = north (−Z), 90° = east (+X), 180° = south (+Z), 270° = west (−X).
 */

export interface DockDefinition {
  id: string;
  /** Shore-side anchor X (where the dock meets land) */
  x: number;
  /** Shore-side anchor Z */
  z: number;
  /** Compass bearing in degrees — direction the dock extends over water */
  rotation: number;
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
  {
    id: "dock_test",
    x: 1075.5,
    z: 1172.5,
    rotation: 180, // south
    width: 3,
    length: 12,
    label: "Dock",
  },
];
