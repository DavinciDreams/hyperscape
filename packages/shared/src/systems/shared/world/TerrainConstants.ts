/**
 * TerrainConstants — Single source of truth for terrain shader parameters
 *
 * Shared between:
 * - TerrainShader.ts (game renderer)
 * - TerrainShaderTSL.ts (procgen / Asset Forge)
 *
 * These are visual constants for terrain shading, NOT gameplay constants.
 * Gameplay constants (WATER_THRESHOLD, MAX_WALKABLE_SLOPE, etc.) live in
 * GameConstants.ts.
 */

// ---------------------------------------------------------------------------
// Shader tuning constants
// ---------------------------------------------------------------------------

export const TERRAIN_SHADER = {
  TRIPLANAR_SCALE: 0.5,
  SNOW_HEIGHT: 90.0,
  NOISE_SCALE: 0.0008,
  DIRT_THRESHOLD: 0.43,
  LOD_FULL_DETAIL: 100.0,
  LOD_MEDIUM_DETAIL: 200.0,
  DISTORT_NOISE_SCALE: 0.067,
  VARIATION_NOISE_SCALE: 0.0015,
  ROCK_DISTORT_STRENGTH: 0.5,
  HEIGHT_DISTORT_STRENGTH: 8.0,
  SATURATION_BOOST: 1.35,
  NOISE_SIZE: 256,
} as const;

// ---------------------------------------------------------------------------
// Biome color palettes (raw RGB triples, [0..1])
//
// Both shader files create TSL vec3() nodes from these values.
// The CPU-side computeTerrainColorCPU uses them directly as numbers.
// ---------------------------------------------------------------------------

export type RGB = readonly [number, number, number];

// --- Tundra: snowy white-blue with frozen grey stone ---
export const TUNDRA = {
  GRASS: [0.78, 0.82, 0.85] as RGB,
  GRASS_DARK: [0.65, 0.7, 0.75] as RGB,
  GRASS_HIGH: [0.68, 0.72, 0.78] as RGB,
  VARIATION: [0.6, 0.64, 0.7] as RGB,
  DIRT: [0.55, 0.55, 0.58] as RGB,
  DIRT_DARK: [0.42, 0.42, 0.45] as RGB,
  CLIFF: [0.5, 0.52, 0.56] as RGB,
  CLIFF_DARK: [0.38, 0.4, 0.44] as RGB,
} as const;

// --- Forest: vibrant greens with warm brown earth ---
export const FOREST = {
  GRASS: [0.3, 0.58, 0.15] as RGB,
  GRASS_DARK: [0.18, 0.42, 0.08] as RGB,
  GRASS_HIGH: [0.24, 0.45, 0.18] as RGB,
  VARIATION: [0.15, 0.35, 0.1] as RGB,
  DIRT: [0.26, 0.19, 0.11] as RGB,
  DIRT_DARK: [0.17, 0.12, 0.07] as RGB,
  CLIFF: [0.4, 0.38, 0.32] as RGB,
  CLIFF_DARK: [0.28, 0.26, 0.22] as RGB,
} as const;

// --- Canyon: red-orange sand with deep crimson rock ---
export const CANYON = {
  SAND: [0.82, 0.52, 0.28] as RGB,
  SAND_DARK: [0.72, 0.42, 0.2] as RGB,
  SAND_HIGH: [0.62, 0.38, 0.22] as RGB,
  VARIATION: [0.58, 0.34, 0.16] as RGB,
  ROCK: [0.62, 0.28, 0.15] as RGB,
  ROCK_DARK: [0.48, 0.2, 0.1] as RGB,
  CLIFF: [0.72, 0.38, 0.18] as RGB,
  CLIFF_DARK: [0.55, 0.25, 0.12] as RGB,
} as const;

// --- Shared accent colors ---
export const ACCENT = {
  CLIFF_TINT: [0.28, 0.3, 0.36] as RGB,
  ROCK_GRAY: [0.45, 0.42, 0.38] as RGB,
  ROCK_DARK: [0.3, 0.28, 0.25] as RGB,
  SAND_YELLOW: [0.7, 0.6, 0.38] as RGB,
  SNOW_WHITE: [0.92, 0.94, 0.96] as RGB,
  MUD_BROWN: [0.18, 0.12, 0.08] as RGB,
  WATER_EDGE: [0.08, 0.06, 0.04] as RGB,
} as const;
