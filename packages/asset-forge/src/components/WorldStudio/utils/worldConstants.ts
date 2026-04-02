/**
 * worldConstants — Named constants and accessor helpers for world generation
 *
 * Centralizes magic numbers that appear across generation hooks.
 * Values here are defaults — runtime values should come from world-config.json.
 */

/** Default minimum spacing between mob spawns (meters) */
export const MIN_MOB_SPACING = 15;

/** Default minimum spacing between resource nodes (meters) */
export const MIN_RESOURCE_SPACING = 8;

/** Default minimum spacing between stations (meters) */
export const MIN_STATION_SPACING = 20;

/** Base mob density per m² before tier multiplier */
export const BASE_MOB_DENSITY = 0.0004;

/** Base resource density per m² before tier multiplier */
export const BASE_RESOURCE_DENSITY = 0.0004;

/** Buffer distance (meters) for auto-gen entities from hand-placed entities */
export const HAND_PLACED_ENTITY_BUFFER = 12;

/** Radius (meters) to search for stations near towns */
export const TOWN_STATION_SEARCH_RADIUS = 80;

/**
 * Get world radius in meters from a world foundation config.
 * World is centered at origin, so radius = worldSize * tileSize / 2.
 */
export function getWorldRadius(config: {
  terrain: { worldSize: number; tileSize: number };
}): number {
  return (config.terrain.worldSize * config.terrain.tileSize) / 2;
}

/**
 * Get safe zone radius for a town, with fallback heuristic by size.
 */
export function getTownSafeRadius(town: {
  safeZoneRadius?: number;
  size?: string;
}): number {
  if (town.safeZoneRadius != null) return town.safeZoneRadius;
  switch (town.size) {
    case "town":
      return 80;
    case "village":
      return 50;
    default:
      return 30;
  }
}
