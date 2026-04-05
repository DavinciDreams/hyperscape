/**
 * Shared pure functions for terrain flattening under towns and road height blending.
 *
 * Used by both World Studio (TileBasedTerrain.tsx) and the game client (TerrainSystem.ts).
 * Changing constants here automatically updates both.
 */

// ---------------------------------------------------------------------------
// Town circular flatten
// ---------------------------------------------------------------------------

export const TOWN_FLATTEN_INNER_RATIO = 0.85;
export const TOWN_FLATTEN_OUTER_RATIO = 1.4;

export interface FlattenableTown {
  position: { x: number; z: number };
  safeZoneRadius: number;
}

/**
 * Apply town-wide circular terrain flattening.
 *   innerRadius = safeZoneRadius * 0.85  (fully flat — buildings sit here)
 *   outerRadius = safeZoneRadius * 1.4   (smooth hermite blend to natural terrain)
 *   centerHeight = terrain height at town center
 *
 * Returns the flattened height, or null if outside all town flatten zones.
 */
export function applyTownCircularFlatten(
  worldX: number,
  worldZ: number,
  naturalHeight: number,
  towns: ReadonlyArray<FlattenableTown>,
  getCenterHeight: (x: number, z: number) => number,
): number | null {
  for (const town of towns) {
    const r = town.safeZoneRadius;
    const innerRadius = r * TOWN_FLATTEN_INNER_RATIO;
    const outerRadius = r * TOWN_FLATTEN_OUTER_RATIO;

    const dx = worldX - town.position.x;
    const dz = worldZ - town.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist >= outerRadius) continue;

    const centerHeight = getCenterHeight(town.position.x, town.position.z);

    if (dist <= innerRadius) {
      return centerHeight;
    }

    // Smooth hermite blend: 0 at innerRadius → 1 at outerRadius
    const t = (dist - innerRadius) / (outerRadius - innerRadius);
    const blend = t * t * (3 - 2 * t); // smoothstep
    return centerHeight + (naturalHeight - centerHeight) * blend;
  }

  return null;
}
