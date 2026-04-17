/**
 * Procgen Terrain Constants — single source of truth for terrain defaults.
 *
 * These values define the procgen package's default terrain parameters.
 * All files in @hyperforge/procgen should reference these instead of
 * hardcoding magic numbers.
 *
 * Aligned with @hyperforge/shared game constants:
 * - MAX_HEIGHT = 50 (TerrainHeightParams.ts)
 * - TERRAIN_CONSTANTS.WATER_THRESHOLD = 16 (GameConstants.ts)
 */

/** Default max terrain height in world units (matches game MAX_HEIGHT) */
export const DEFAULT_MAX_HEIGHT = 50;

/** Default water threshold in world units (matches game TERRAIN_CONSTANTS.WATER_THRESHOLD) */
export const DEFAULT_WATER_THRESHOLD = 16;

/**
 * Water level in world-space Y for the game runtime.
 * Must match TERRAIN_CONSTANTS.WATER_THRESHOLD in @hyperforge/shared.
 * Used by systems that need the actual game water Y (e.g. DockGenerator).
 */
export const GAME_WATER_LEVEL = 16;
