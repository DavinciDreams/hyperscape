/**
 * TerrainQuerier — Dependency injection interface for terrain queries
 *
 * Pipeline stages accept this interface instead of importing
 * NoiseGenerator / DifficultyHeatmap directly. This enables:
 * - Editor: backed by TileBasedTerrain scene refs
 * - Tests: backed by controlled mock values
 * - Headless: backed by raw heightmap data
 */

export interface TerrainQuerier {
  /** Get terrain height at world position */
  getHeight(x: number, z: number): number;
  /** Get biome name at world position */
  getBiome(x: number, z: number): string;
  /** Get difficulty scalar (0-1) at world position */
  getDifficulty(x: number, z: number): number;
  /** Check if position is underwater */
  isWater(x: number, z: number): boolean;
}

/**
 * Create a TerrainQuerier from existing editor callbacks.
 * Bridges the TerrainSceneRefs query functions to the pipeline interface.
 */
export function createEditorTerrainQuerier(
  queryBiome: (x: number, z: number) => { height: number; biome: string },
  getDifficulty: (x: number, z: number) => number,
  waterThreshold: number,
): TerrainQuerier {
  return {
    getHeight: (x, z) => queryBiome(x, z).height,
    getBiome: (x, z) => queryBiome(x, z).biome,
    getDifficulty,
    isWater: (x, z) => queryBiome(x, z).height < waterThreshold,
  };
}

/**
 * Create a flat terrain querier for testing.
 * Returns constant values for all positions.
 */
export function createTestTerrainQuerier(
  height: number = 10,
  biome: string = "plains",
  difficulty: number = 0.5,
  waterThreshold: number = 0,
): TerrainQuerier {
  return {
    getHeight: () => height,
    getBiome: () => biome,
    getDifficulty: () => difficulty,
    isWater: () => height < waterThreshold,
  };
}
