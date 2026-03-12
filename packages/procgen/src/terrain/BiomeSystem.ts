/**
 * Biome System
 *
 * Handles biome placement and influence calculations for terrain generation.
 * Implements a grid-jitter placement system with Gaussian influence falloff
 * for smooth, natural biome transitions.
 */

import { NoiseGenerator, createSeededRNG } from "./NoiseGenerator";
import type {
  BiomeConfig,
  BiomeCenter,
  BiomeInfluence,
  BiomeDefinition,
} from "./types";

/**
 * Default biome configuration
 */
export const DEFAULT_BIOME_CONFIG: BiomeConfig = {
  gridSize: 3,
  jitter: 0.35,
  minInfluence: 2000,
  maxInfluence: 3500,
  gaussianCoeff: 0.15,
  boundaryNoiseScale: 0.003,
  boundaryNoiseAmount: 0.15,
};

/**
 * BiomeSystem handles biome placement and influence calculations
 */
export class BiomeSystem {
  private readonly config: BiomeConfig;
  private readonly biomeDefinitions: Record<string, BiomeDefinition>;
  private readonly noise: NoiseGenerator;
  private readonly worldSize: number;
  private biomeCenters: BiomeCenter[] = [];

  constructor(
    seed: number,
    worldSizeMeters: number,
    config: Partial<BiomeConfig> = {},
    biomeDefinitions: Record<string, BiomeDefinition> = {},
  ) {
    this.config = { ...DEFAULT_BIOME_CONFIG, ...config };
    this.biomeDefinitions = biomeDefinitions;
    this.noise = new NoiseGenerator(seed);
    this.worldSize = worldSizeMeters;

    this.initializeBiomeCenters(seed);

    for (const id of Object.keys(this.biomeDefinitions)) {
      this.biomeIds[id] = this.nextBiomeId++;
    }
  }

  /**
   * Compute biome centers arranged in a regular polygon.
   * For 3 types = equilateral triangle, 4 = square, etc.
   * Generalizes the island-style biome placement for any N.
   */
  static computePolygonCenters(
    biomeTypes: string[],
    radius: number,
    influence: number,
  ): BiomeCenter[] {
    const centers: BiomeCenter[] = [];
    for (let i = 0; i < biomeTypes.length; i++) {
      const angle = (i / biomeTypes.length) * Math.PI * 2 - Math.PI / 2;
      centers.push({
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
        type: biomeTypes[i],
        influence,
      });
    }
    return centers;
  }

  /**
   * Initialize biome centers using deterministic grid-jitter placement
   */
  private initializeBiomeCenters(seed: number): void {
    if (this.config.explicitCenters) {
      this.biomeCenters = [...this.config.explicitCenters];
      return;
    }

    const { gridSize, jitter, minInfluence, maxInfluence } = this.config;
    const cellSize = this.worldSize / gridSize;

    // Use deterministic PRNG for reproducible biome placement
    const random = createSeededRNG(seed);

    const biomeTypes = Object.keys(this.biomeDefinitions);
    if (biomeTypes.length === 0) {
      return;
    }

    this.biomeCenters = [];

    // Grid-jitter placement for even distribution
    for (let gx = 0; gx < gridSize; gx++) {
      for (let gz = 0; gz < gridSize; gz++) {
        // Base position at grid cell center
        const baseX = (gx + 0.5) * cellSize - this.worldSize / 2;
        const baseZ = (gz + 0.5) * cellSize - this.worldSize / 2;

        // Jitter within cell (controlled randomness)
        const jitterX = (random() - 0.5) * 2 * jitter * cellSize;
        const jitterZ = (random() - 0.5) * 2 * jitter * cellSize;

        const x = baseX + jitterX;
        const z = baseZ + jitterZ;

        // Random biome type from provided definitions and influence
        const typeIndex = Math.floor(random() * biomeTypes.length);
        const influenceRange = maxInfluence - minInfluence;
        const influence = minInfluence + random() * influenceRange;

        this.biomeCenters.push({
          x,
          z,
          type: biomeTypes[typeIndex],
          influence,
        });
      }
    }
  }

  /**
   * Get all biome centers
   */
  getBiomeCenters(): ReadonlyArray<BiomeCenter> {
    return this.biomeCenters;
  }

  /**
   * Get biome definition by ID
   */
  getBiomeDefinition(biomeId: string): BiomeDefinition {
    const def = this.biomeDefinitions[biomeId];
    if (def) return def;
    const keys = Object.keys(this.biomeDefinitions);
    return keys.length > 0
      ? this.biomeDefinitions[keys[0]]
      : {
          id: biomeId,
          name: biomeId,
          color: 0x808080,
          terrainMultiplier: 1,
          difficultyLevel: 0,
          heightRange: [0, 1],
          resourceDensity: 1,
        };
  }

  /**
   * Calculate biome influences at a world position
   * Returns all biomes with their normalized weights (sum to 1.0)
   *
   * @param worldX - World X coordinate
   * @param worldZ - World Z coordinate
   * @param _baseHeight - Reserved for future height-biome coupling (currently unused)
   */
  getBiomeInfluencesAtPosition(
    worldX: number,
    worldZ: number,
    _baseHeight: number,
  ): BiomeInfluence[] {
    const { gaussianCoeff, boundaryNoiseScale, boundaryNoiseAmount } =
      this.config;

    // Add boundary noise for organic edges
    const boundaryNoise = this.noise.simplex2D(
      worldX * boundaryNoiseScale,
      worldZ * boundaryNoiseScale,
    );

    // Map to collect and merge same-type biomes
    const biomeWeightMap = new Map<string, number>();

    // Calculate influence from ALL biome centers (no hard cutoff)
    for (const center of this.biomeCenters) {
      const dx = worldX - center.x;
      const dz = worldZ - center.z;
      const distance = Math.sqrt(dx * dx + dz * dz);

      // Add subtle noise to distance for organic boundaries
      const noisyDistance =
        distance * (1 + boundaryNoise * boundaryNoiseAmount);

      // Pure Gaussian falloff - NO hard distance cutoff
      // The gaussian naturally approaches 0 at large distances
      const normalizedDistance = noisyDistance / center.influence;
      const weight = Math.exp(
        -normalizedDistance * normalizedDistance * gaussianCoeff,
      );

      // Merge same-type biomes
      const existing = biomeWeightMap.get(center.type) ?? 0;
      biomeWeightMap.set(center.type, existing + weight);
    }

    // Convert map to array
    const biomeInfluences: BiomeInfluence[] = [];
    for (const [type, weight] of biomeWeightMap) {
      biomeInfluences.push({ type, weight });
    }

    // Normalize weights
    const totalWeight = biomeInfluences.reduce((sum, b) => sum + b.weight, 0);
    if (totalWeight > 0) {
      for (const influence of biomeInfluences) {
        influence.weight /= totalWeight;
      }
    } else {
      const fallback = Object.keys(this.biomeDefinitions)[0] ?? "unknown";
      biomeInfluences.push({ type: fallback, weight: 1.0 });
    }

    // Sort by weight descending
    biomeInfluences.sort((a, b) => b.weight - a.weight);

    return biomeInfluences;
  }

  /**
   * Get the dominant biome at a world position
   */
  getDominantBiome(worldX: number, worldZ: number, baseHeight: number): string {
    const influences = this.getBiomeInfluencesAtPosition(
      worldX,
      worldZ,
      baseHeight,
    );
    if (influences.length > 0) return influences[0].type;
    const keys = Object.keys(this.biomeDefinitions);
    return keys.length > 0 ? keys[0] : "unknown";
  }

  /**
   * Get the dominant biome for a terrain tile (at tile center)
   */
  getBiomeForTile(tileX: number, tileZ: number, tileSize: number): string {
    // Tile geometry is centered at (tileX * tileSize, tileZ * tileSize)
    const worldX = tileX * tileSize;
    const worldZ = tileZ * tileSize;
    return this.getDominantBiome(worldX, worldZ, 0);
  }

  private biomeIds: Record<string, number> = {};
  private nextBiomeId = 0;

  /** Get numeric biome ID for shader use */
  getBiomeId(biomeName: string): number {
    const id = this.biomeIds[biomeName];
    if (id === undefined) {
      this.biomeIds[biomeName] = this.nextBiomeId++;
      return this.biomeIds[biomeName];
    }
    return id;
  }

  /**
   * Blend multiple biome colors based on influences
   * @returns RGB color (0-1 range)
   */
  blendBiomeColors(influences: BiomeInfluence[]): {
    r: number;
    g: number;
    b: number;
  } {
    let r = 0;
    let g = 0;
    let b = 0;

    for (const influence of influences) {
      const biome = this.getBiomeDefinition(influence.type);
      const color = biome.color;

      // Extract RGB from hex
      const biomeR = ((color >> 16) & 0xff) / 255;
      const biomeG = ((color >> 8) & 0xff) / 255;
      const biomeB = (color & 0xff) / 255;

      r += biomeR * influence.weight;
      g += biomeG * influence.weight;
      b += biomeB * influence.weight;
    }

    return { r, g, b };
  }
}
