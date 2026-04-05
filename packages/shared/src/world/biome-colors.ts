/**
 * Shared biome color palettes — single source of truth for terrain shader colors.
 *
 * Used by both TerrainShader.ts (game client) and TerrainShaderTSL.ts (World Studio).
 */

/** Biome mine floor colors: [R, G, B] in 0-1 range */
export interface MineBiomePalette {
  /** Exposed bedrock color */
  primary: [number, number, number];
  /** Dark crevice color */
  secondary: [number, number, number];
  /** Gravel highlight color */
  tertiary: [number, number, number];
}

/**
 * Mine floor color palettes by biome index.
 * Biome indices: 0=forest, 1=tundra, 2=desert, 3=mountains, 4=plains, 5=swamp, 6=valley
 */
export const MINE_BIOME_PALETTES = {
  forest: {
    primary: [0.56, 0.54, 0.5],
    secondary: [0.4, 0.38, 0.35],
    tertiary: [0.62, 0.6, 0.56],
  },
  tundra: {
    primary: [0.42, 0.42, 0.46],
    secondary: [0.28, 0.28, 0.32],
    tertiary: [0.5, 0.5, 0.55],
  },
  desert: {
    primary: [0.55, 0.38, 0.24],
    secondary: [0.38, 0.24, 0.13],
    tertiary: [0.64, 0.48, 0.32],
  },
  mountains: {
    primary: [0.52, 0.5, 0.47],
    secondary: [0.36, 0.34, 0.32],
    tertiary: [0.6, 0.58, 0.55],
  },
  plains: {
    primary: [0.54, 0.46, 0.36],
    secondary: [0.38, 0.32, 0.22],
    tertiary: [0.62, 0.54, 0.44],
  },
  swamp: {
    primary: [0.36, 0.3, 0.22],
    secondary: [0.24, 0.19, 0.13],
    tertiary: [0.44, 0.38, 0.3],
  },
  valley: {
    primary: [0.58, 0.5, 0.4],
    secondary: [0.42, 0.36, 0.26],
    tertiary: [0.66, 0.58, 0.48],
  },
} as const satisfies Record<string, MineBiomePalette>;

/** Road surface layer colors (shared between both shaders) */
export const ROAD_COLORS = {
  /** Compacted earth base - warm brown */
  earthBaseA: [0.42, 0.32, 0.2] as const,
  earthBaseB: [0.52, 0.4, 0.26] as const,
  /** Surface dust - lighter sandy */
  dust: [0.6, 0.52, 0.38] as const,
  /** Gravel highlights */
  gravel: [0.58, 0.52, 0.42] as const,
} as const;
