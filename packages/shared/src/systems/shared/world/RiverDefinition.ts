/**
 * RiverDefinition — waypoint-based river path definition.
 *
 * A river is defined by an ordered sequence of waypoints. Each waypoint
 * specifies a position, width, and depth. The river path is linearly
 * interpolated between waypoints (segment-based, no spline — keeps the
 * math simple and the worker mirror trivial).
 *
 * surfaceY is computed at init time by sampling terrain height at each
 * waypoint, then smoothing for natural water flow.
 */

export interface RiverWaypoint {
  /** World X position */
  x: number;
  /** World Z position */
  z: number;
  /** Half-width of river water surface at this waypoint (meters) */
  halfWidth: number;
  /** Channel depth below water surface (meters) — the underwater floor depth */
  depth: number;
  /**
   * Computed at init: water surface elevation at this waypoint.
   * Set by TerrainSystem after terrain is ready (not part of definition).
   */
  surfaceY?: number;
}

export interface RiverDefinition {
  id: string;
  waypoints: RiverWaypoint[];
  /** Width of raised berm ring outside valley (meters) */
  bermWidth: number;
  /**
   * Valley width multiplier — how wide the bank transition extends
   * beyond the water channel. Bank width = halfWidth * (valleyMultiplier - 1).
   */
  valleyMultiplier: number;
}

/**
 * Max terrain elevation for river placement. Waypoints above this height
 * get narrowed to a small mountain stream. This prevents the river from
 * awkwardly carving through steep mountain slopes.
 */
export const MAX_RIVER_ELEVATION = 18;

/**
 * Island river — gentle S-curve path through the flat forest corridor,
 * from the western coast to the eastern coast.
 *
 * Design principles (Minecraft-style):
 *   - River flows through LOW terrain only (forest valleys, plains)
 *   - Avoids mountains and steep slopes entirely
 *   - Gentle S-curves with 40-80m amplitude (not dramatic hairpins)
 *   - Wider near coast (estuary), narrower inland
 *   - Shallow at coasts, deeper mid-course
 *
 * Island radius ≈ 788. River enters land ~x=-600 and exits ~x=+600.
 * Path stays in the z ∈ [-140, -40] corridor (flat forest biome).
 *
 * Terrain obstacles avoided (with buffer):
 *   - Mountain at (-168.5, -352.5) radius=250 — path stays 300m+ north
 *   - Mountain at (265.5, 322.5) radius=130 — path stays 350m+ south
 *   - Pond at (-28.5, 327.5) radius=90 — path stays 350m+ south
 *   - Elevated pond at (-120, -290) radius=35 — path stays 150m+ north
 *   - Spawn (0,0) — path stays 80m+ south
 */
export const ISLAND_RIVER: RiverDefinition = {
  id: "island_river",
  waypoints: [
    // ── Western estuary (wide, shallow, near ocean level) ──
    { x: -600, z: -40, halfWidth: 22, depth: 0.3 },
    { x: -540, z: -55, halfWidth: 20, depth: 0.6 },

    // ── S-curve 1: gentle dip south through western lowlands ──
    { x: -470, z: -90, halfWidth: 17, depth: 1.0 },
    { x: -400, z: -120, halfWidth: 16, depth: 1.3 }, // apex south

    // ── Swing back north ──
    { x: -330, z: -80, halfWidth: 16, depth: 1.5 },
    { x: -270, z: -50, halfWidth: 16, depth: 1.5 }, // apex north

    // ── S-curve 2: dip south, pass south of spawn ──
    { x: -200, z: -80, halfWidth: 16, depth: 1.8 },
    { x: -130, z: -110, halfWidth: 16, depth: 1.8 },
    { x: -60, z: -130, halfWidth: 17, depth: 2.0 }, // apex south
    { x: 20, z: -110, halfWidth: 17, depth: 2.0 },

    // ── Swing back north through central forest ──
    { x: 90, z: -80, halfWidth: 17, depth: 2.0 }, // apex north

    // ── S-curve 3: gentle curve through eastern forest ──
    { x: 160, z: -100, halfWidth: 17, depth: 1.8 },
    { x: 230, z: -130, halfWidth: 17, depth: 1.8 }, // apex south
    { x: 300, z: -100, halfWidth: 16, depth: 1.5 },

    // ── Approaching east coast (widening, shallowing) ──
    { x: 370, z: -70, halfWidth: 18, depth: 1.3 },
    { x: 440, z: -45, halfWidth: 20, depth: 1.0 },

    // ── Eastern estuary ──
    { x: 510, z: -25, halfWidth: 21, depth: 0.6 },
    { x: 580, z: -10, halfWidth: 22, depth: 0.3 },
    { x: 620, z: 0, halfWidth: 23, depth: 0.2 }, // ocean entry
  ],
  bermWidth: 4,
  valleyMultiplier: 2.5,
};
