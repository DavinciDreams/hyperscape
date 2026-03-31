/**
 * GameTerrainAdapter — Exact replica of Hyperscape's terrain height algorithm
 *
 * This module reproduces the game's terrain pipeline from TerrainHeightParams.ts
 * so Asset Forge's World Studio can render the EXACT same terrain as the game.
 *
 * Constants and algorithm are mirrored from:
 * - packages/shared/src/systems/shared/world/TerrainHeightParams.ts
 * - packages/shared/src/systems/shared/world/TerrainBiomeTypes.ts
 * - packages/shared/src/systems/shared/world/TerrainSystem.ts
 *
 * When updating the game's terrain, these values MUST be kept in sync.
 */

import { NoiseGenerator } from "@hyperscape/procgen/terrain";
import { BiomeSystem } from "@hyperscape/procgen/terrain";
import type {
  BiomeDefinition,
  BiomeCenter,
  BiomeConfig,
} from "@hyperscape/procgen/terrain";

// ============== GAME CONSTANTS (from TerrainHeightParams.ts) ==============

export const GAME_MAX_HEIGHT = 50;
export const GAME_WATER_THRESHOLD = 8.0;
export const GAME_WATER_LEVEL_NORMALIZED =
  GAME_WATER_THRESHOLD / GAME_MAX_HEIGHT;
export const GAME_SEED = 0;
export const GAME_TILE_SIZE = 100;
export const GAME_WORLD_SIZE = 100;
export const GAME_TILE_RESOLUTION = 64;

// Island shape
const ISLAND_RADIUS = 788;
const ISLAND_FALLOFF = 450;
const ISLAND_DEEP_OCEAN_BUFFER = 113;
const BASE_ELEVATION = 0.42;
const OCEAN_FLOOR_HEIGHT = 0.05;
const HEIGHT_TERRAIN_MIX = 0.2;
const BEACH_PROFILE_POWER = 3.0;

// Coastline noise
const COASTLINE_CIRCLE_SAMPLE_RADIUS = 2;
const COAST_LARGE = {
  octaves: 3,
  persistence: 0.5,
  lacunarity: 2.0,
  weight: 0.2,
};
const COAST_MEDIUM = {
  freqMultiplier: 3,
  octaves: 2,
  persistence: 0.5,
  lacunarity: 2.0,
  weight: 0.08,
};
const COAST_SMALL = { freqMultiplier: 8, weight: 0.02 };

// Noise layers
const CONTINENT_LAYER = {
  scale: 0.0004,
  octaves: 5,
  persistence: 0.7,
  lacunarity: 2.0,
  weight: 0.35,
};
const RIDGE_LAYER = { scale: 0.0015, weight: 0.15 };
const HILL_LAYER = {
  scale: 0.008,
  octaves: 4,
  persistence: 0.6,
  lacunarity: 2.2,
  weight: 0.25,
};
const EROSION_LAYER = { scale: 0.0025, iterations: 3, weight: 0.1 };
const DETAIL_LAYER = {
  scale: 0.02,
  octaves: 2,
  persistence: 0.3,
  lacunarity: 2.5,
  weight: 0.08,
};

// Terracing
const TERRACE_STEPS = 10;

// Biome noise profiles
interface BiomeNoiseProfile {
  continentWeight: number;
  ridgeWeight: number;
  hillWeight: number;
  erosionWeight: number;
  detailWeight: number;
  powerCurve: number;
  terraceStrength: number;
  terraceSharpness: number;
  terraceHeightScale: number;
  terraceSlope: number;
}

const TUNDRA_PROFILE: BiomeNoiseProfile = {
  continentWeight: 0.32,
  ridgeWeight: 0.15,
  hillWeight: 0.28,
  erosionWeight: 0.1,
  detailWeight: 0.1,
  powerCurve: 1.1,
  terraceStrength: 0.4,
  terraceSharpness: 0.7,
  terraceHeightScale: 2.5,
  terraceSlope: 0.25,
};

const FOREST_PROFILE: BiomeNoiseProfile = {
  continentWeight: 0.15,
  ridgeWeight: 0.08,
  hillWeight: 0.1,
  erosionWeight: 0.05,
  detailWeight: 0.05,
  powerCurve: 1,
  terraceStrength: 0,
  terraceSharpness: 0,
  terraceHeightScale: 1,
  terraceSlope: 0,
};

const CANYON_PROFILE: BiomeNoiseProfile = {
  continentWeight: 0.32,
  ridgeWeight: 0.25,
  hillWeight: 0.18,
  erosionWeight: 0.2,
  detailWeight: 0.05,
  powerCurve: 1.45,
  terraceStrength: 0.6,
  terraceSharpness: 0.8,
  terraceHeightScale: 7,
  terraceSlope: 0.35,
};

const BIOME_PROFILES: Record<string, BiomeNoiseProfile> = {
  tundra: TUNDRA_PROFILE,
  forest: FOREST_PROFILE,
  canyon: CANYON_PROFILE,
};

const DEFAULT_BIOME = "forest";

// Biome configuration
const BIOME_CONFIG = {
  gaussianCoeff: 12.0,
  boundaryNoiseScale: 0.003,
  boundaryNoiseAmount: 0.15,
  placementRadius: ISLAND_RADIUS * 0.45,
  influenceRadius: ISLAND_RADIUS * 0.6,
};

// Landscape features (mountains, ponds)
enum LandscapeType {
  Mountain = "mountain",
  Pond = "pond",
}

interface LandscapeFeatureDef {
  type: LandscapeType;
  x: number;
  z: number;
  radius: number;
  strength: number;
  layers: number;
  shapePower: number;
  edgeSharpness: number;
  layerSlope: number;
  noiseScale: number;
  noiseAmount: number;
}

const LANDSCAPE_FEATURES: LandscapeFeatureDef[] = [
  {
    type: LandscapeType.Mountain,
    x: -168.5,
    z: -352.5,
    radius: 250,
    strength: 5.5,
    layers: 5,
    shapePower: 2.0,
    edgeSharpness: 0.2,
    layerSlope: 0.9,
    noiseScale: 0.025,
    noiseAmount: 0.6,
  },
  {
    type: LandscapeType.Mountain,
    x: 265.5,
    z: 322.5,
    radius: 130,
    strength: 2.5,
    layers: 5,
    shapePower: 1.3,
    edgeSharpness: 0.3,
    layerSlope: 0.55,
    noiseScale: 0.025,
    noiseAmount: 0.55,
  },
  {
    type: LandscapeType.Pond,
    x: -28.5,
    z: 327.5,
    radius: 90,
    strength: 1.5,
    layers: 1,
    shapePower: 3.5,
    edgeSharpness: 0.1,
    layerSlope: 0.8,
    noiseScale: 0.015,
    noiseAmount: 0.06,
  },
  {
    type: LandscapeType.Pond,
    x: -120,
    z: -290,
    radius: 35,
    strength: 1.8,
    layers: 1,
    shapePower: 3.0,
    edgeSharpness: 0.1,
    layerSlope: 0.8,
    noiseScale: 0.015,
    noiseAmount: 0.06,
  },
];

// Biome colors (from biomes.json)
const GAME_BIOME_COLORS: Record<string, number> = {
  tundra: 0xe8e4e0,
  forest: 0x388e3c,
  canyon: 0x8d6e63,
};

// Biome definitions for procgen BiomeSystem
export const GAME_BIOME_DEFINITIONS: Record<string, BiomeDefinition> = {
  tundra: {
    id: "tundra",
    name: "Tundra",
    color: 0xe8e4e0,
    terrainMultiplier: 1,
    difficultyLevel: 1,
    heightRange: [0.3, 0.8],
    maxSlope: 1.5,
    resourceDensity: 0.4,
  },
  forest: {
    id: "forest",
    name: "Forest",
    color: 0x388e3c,
    terrainMultiplier: 1,
    difficultyLevel: 0,
    heightRange: [0, 0.5],
    maxSlope: 0.8,
    resourceDensity: 1.0,
  },
  canyon: {
    id: "canyon",
    name: "Canyon",
    color: 0x8d6e63,
    terrainMultiplier: 1,
    difficultyLevel: 2,
    heightRange: [0.2, 1.0],
    maxSlope: 2.0,
    resourceDensity: 0.6,
  },
};

// Shoreline config
const SHORELINE = {
  landBand: 3.0,
  landMaxMultiplier: 1.6,
  underwaterBand: 3.0,
  underwaterDepthMultiplier: 1.8,
  minSlope: 0.06,
  slopeSampleDistance: 1.0,
};

// ============== NOISE ADAPTER ==============

interface NoiseAdapter {
  fractal2D(
    x: number,
    z: number,
    octaves: number,
    persistence: number,
    lacunarity: number,
  ): number;
  ridgeNoise2D(x: number, z: number): number;
  erosionNoise2D(x: number, z: number, iterations: number): number;
  simplex2D(x: number, z: number): number;
}

// ============== CORE ALGORITHM ==============

function applyLandscapeFeatures(
  height: number,
  worldX: number,
  worldZ: number,
  features: ReadonlyArray<LandscapeFeatureDef>,
  noise: NoiseAdapter,
): number {
  for (let i = 0; i < features.length; i++) {
    const feat = features[i];
    const dx = worldX - feat.x;
    const dz = worldZ - feat.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    // Pond berm
    if (
      feat.type === LandscapeType.Pond &&
      dist >= feat.radius &&
      dist < feat.radius + 5
    ) {
      const bermT = 1 - (dist - feat.radius) / 5;
      const minH = GAME_WATER_LEVEL_NORMALIZED + 0.005;
      if (height < minH) height += (minH - height) * bermT;
      continue;
    }

    if (dist >= feat.radius) continue;

    const t = Math.max(0, 1 - dist / feat.radius);
    const envelope = Math.pow(t, feat.shapePower);

    const warpScale = feat.noiseScale * 0.4;
    const warpStr = feat.radius * feat.noiseAmount * 0.3;
    const warpX =
      noise.simplex2D(worldX * warpScale, worldZ * warpScale) * warpStr;
    const warpZ =
      noise.simplex2D(worldX * warpScale + 31.7, worldZ * warpScale + 47.3) *
      warpStr;

    const sx = (worldX + warpX) * feat.noiseScale;
    const sz = (worldZ + warpZ) * feat.noiseScale;

    const ridgeN = noise.ridgeNoise2D(sx, sz);
    const detailN = noise.fractal2D(sx * 2.3, sz * 2.3, 3, 0.5, 2.0);
    const mNoise = (ridgeN * 0.6 + detailN * 0.4 + 1) * 0.5;

    let rawH = envelope * (1 - feat.noiseAmount + feat.noiseAmount * mNoise);
    rawH = Math.max(0, Math.min(1, rawH));

    let influence: number;
    if (feat.layers >= 1) {
      const stepped = Math.floor(rawH * feat.layers) / feat.layers;
      const nextStep = Math.min(1, stepped + 1 / feat.layers);
      const frac = (rawH - stepped) * feat.layers;
      const blendStart = 1 - feat.edgeSharpness;
      const edgeBlend =
        frac <= blendStart ? 0 : (frac - blendStart) / (1 - blendStart);
      const flatStep = stepped + edgeBlend * (nextStep - stepped);
      const slopedStep = stepped + frac * (nextStep - stepped);
      influence = flatStep + feat.layerSlope * (slopedStep - flatStep);
    } else {
      influence = rawH;
    }

    if (feat.type === LandscapeType.Pond) {
      height -= influence * feat.strength;
    } else {
      height += influence * feat.strength;
    }
  }
  return height;
}

/**
 * Exact replica of the game's computeBaseHeight from TerrainHeightParams.ts.
 * Produces identical terrain to the live game server.
 */
function computeBaseHeight(
  worldX: number,
  worldZ: number,
  noise: NoiseAdapter,
  biomeWeights: Record<string, number>,
): number {
  // 1. Sample noise layers
  const cN = noise.fractal2D(
    worldX * CONTINENT_LAYER.scale,
    worldZ * CONTINENT_LAYER.scale,
    CONTINENT_LAYER.octaves,
    CONTINENT_LAYER.persistence,
    CONTINENT_LAYER.lacunarity,
  );
  const rN = noise.ridgeNoise2D(
    worldX * RIDGE_LAYER.scale,
    worldZ * RIDGE_LAYER.scale,
  );
  const hN = noise.fractal2D(
    worldX * HILL_LAYER.scale,
    worldZ * HILL_LAYER.scale,
    HILL_LAYER.octaves,
    HILL_LAYER.persistence,
    HILL_LAYER.lacunarity,
  );
  const eN = noise.erosionNoise2D(
    worldX * EROSION_LAYER.scale,
    worldZ * EROSION_LAYER.scale,
    EROSION_LAYER.iterations,
  );
  const dN = noise.fractal2D(
    worldX * DETAIL_LAYER.scale,
    worldZ * DETAIL_LAYER.scale,
    DETAIL_LAYER.octaves,
    DETAIL_LAYER.persistence,
    DETAIL_LAYER.lacunarity,
  );

  // 2. Blend noise using biome-weighted profiles
  let cW = 0,
    rW = 0,
    hW = 0,
    eW = 0,
    dW = 0,
    pC = 0,
    tS = 0,
    tSh = 0,
    tHS = 0,
    tSl = 0;
  for (const key of Object.keys(biomeWeights)) {
    const w = biomeWeights[key];
    const p = BIOME_PROFILES[key] ?? BIOME_PROFILES[DEFAULT_BIOME];
    cW += p.continentWeight * w;
    rW += p.ridgeWeight * w;
    hW += p.hillWeight * w;
    eW += p.erosionWeight * w;
    dW += p.detailWeight * w;
    pC += p.powerCurve * w;
    tS += p.terraceStrength * w;
    tSh += p.terraceSharpness * w;
    tHS += p.terraceHeightScale * w;
    tSl += p.terraceSlope * w;
  }

  // 3. Combine, normalize, power curve
  let height = cN * cW + rN * rW + hN * hW + eN * eW + dN * dW;
  height = (height + 1) * 0.5;
  height = Math.max(0, Math.min(1, height));
  height = Math.pow(height, pC);

  // 4. Terracing
  const steps = TERRACE_STEPS;
  const ths = Math.max(1, tHS);
  if (tS > 0.01 && steps >= 2) {
    const stepped = Math.floor(height * steps) / steps;
    const nextStep = Math.min(1, stepped + 1 / steps);
    const frac = (height - stepped) * steps;
    const edgeBlend = frac < tSh ? 0 : (frac - tSh) / (1 - tSh + 0.001);
    const flatStep = stepped + edgeBlend * (nextStep - stepped);
    const slopedStep = stepped + frac * (nextStep - stepped);
    const terraced = flatStep + tSl * (slopedStep - flatStep);
    const scaled = Math.max(0, Math.min(1, 0.5 + (terraced - 0.5) * ths));
    height = height + (scaled - height) * tS;
  }

  // 5. Coastline noise + island mask
  const distFromCenter = Math.sqrt(worldX * worldX + worldZ * worldZ);
  const angle = Math.atan2(worldZ, worldX);
  const cnx = Math.cos(angle) * COASTLINE_CIRCLE_SAMPLE_RADIUS;
  const cnz = Math.sin(angle) * COASTLINE_CIRCLE_SAMPLE_RADIUS;

  const cst1 = noise.fractal2D(
    cnx,
    cnz,
    COAST_LARGE.octaves,
    COAST_LARGE.persistence,
    COAST_LARGE.lacunarity,
  );
  const cst2 = noise.fractal2D(
    cnx * COAST_MEDIUM.freqMultiplier,
    cnz * COAST_MEDIUM.freqMultiplier,
    COAST_MEDIUM.octaves,
    COAST_MEDIUM.persistence,
    COAST_MEDIUM.lacunarity,
  );
  const cst3 = noise.simplex2D(
    cnx * COAST_SMALL.freqMultiplier,
    cnz * COAST_SMALL.freqMultiplier,
  );
  const coastVar =
    cst1 * COAST_LARGE.weight +
    cst2 * COAST_MEDIUM.weight +
    cst3 * COAST_SMALL.weight;
  const effectiveRadius = ISLAND_RADIUS * (1 + coastVar);

  let islandMask = 1.0;
  if (distFromCenter > effectiveRadius - ISLAND_FALLOFF) {
    const edgeDist = distFromCenter - (effectiveRadius - ISLAND_FALLOFF);
    const tt = Math.min(1.0, edgeDist / ISLAND_FALLOFF);
    islandMask = 1.0 - Math.pow(tt, BEACH_PROFILE_POWER);
  }
  if (distFromCenter > effectiveRadius + ISLAND_DEEP_OCEAN_BUFFER) {
    islandMask = 0;
  }

  // 6. Island mask + landscape features
  height = height * islandMask;
  height = applyLandscapeFeatures(
    height,
    worldX,
    worldZ,
    LANDSCAPE_FEATURES,
    noise,
  );
  if (islandMask === 0) height = OCEAN_FLOOR_HEIGHT;

  return height * GAME_MAX_HEIGHT;
}

function adjustShorelineHeight(baseHeight: number, slope: number): number {
  if (baseHeight === GAME_WATER_THRESHOLD) return baseHeight;

  const isLand = baseHeight > GAME_WATER_THRESHOLD;
  const band = isLand ? SHORELINE.landBand : SHORELINE.underwaterBand;
  if (band <= 0) return baseHeight;

  const delta = Math.abs(baseHeight - GAME_WATER_THRESHOLD);
  if (delta >= band) return baseHeight;
  if (SHORELINE.minSlope <= 0) return baseHeight;

  const maxMul = isLand
    ? SHORELINE.landMaxMultiplier
    : SHORELINE.underwaterDepthMultiplier;
  if (maxMul <= 1) return baseHeight;

  const slopeSafe = Math.max(0.0001, slope);
  const targetMul = Math.min(
    maxMul,
    Math.max(1, SHORELINE.minSlope / slopeSafe),
  );
  const falloff = 1 - delta / band;
  const mul = 1 + (targetMul - 1) * falloff;
  const adjustedDelta = delta * mul;

  return isLand
    ? GAME_WATER_THRESHOLD + adjustedDelta
    : GAME_WATER_THRESHOLD - adjustedDelta;
}

// ============== PUBLIC API ==============

export interface GameTerrainQuery {
  height: number;
  biomeId: string;
  biomeColor: { r: number; g: number; b: number };
  islandMask: number;
  /** Forest biome weight 0-1 (for shader blending) */
  biomeForestWeight: number;
  /** Canyon biome weight 0-1 (for shader blending) */
  biomeCanyonWeight: number;
}

/**
 * Creates a terrain querier that produces the EXACT same terrain as the live game.
 * Uses the game's computeBaseHeight algorithm with all landscape features,
 * biome-weighted noise, terracing, and custom island mask.
 */
export function createGameTerrainQuerier(seed: number = GAME_SEED) {
  const noise = new NoiseGenerator(seed);
  const biomeTypes = ["tundra", "forest", "canyon"];
  const explicitCenters = BiomeSystem.computePolygonCenters(
    biomeTypes,
    BIOME_CONFIG.placementRadius,
    BIOME_CONFIG.influenceRadius,
  );

  const biomeConfig: BiomeConfig = {
    gridSize: 3,
    jitter: 0,
    minInfluence: BIOME_CONFIG.influenceRadius,
    maxInfluence: BIOME_CONFIG.influenceRadius,
    gaussianCoeff: BIOME_CONFIG.gaussianCoeff,
    boundaryNoiseScale: BIOME_CONFIG.boundaryNoiseScale,
    boundaryNoiseAmount: BIOME_CONFIG.boundaryNoiseAmount,
    explicitCenters,
  };

  const worldSizeMeters = GAME_TILE_SIZE * GAME_WORLD_SIZE;
  const biomeSystem = new BiomeSystem(
    seed,
    worldSizeMeters,
    biomeConfig,
    GAME_BIOME_DEFINITIONS,
  );

  // Pre-compute biome center list for weight computation
  const biomeCenters = biomeSystem.getBiomeCenters();

  function computeBiomeWeights(
    worldX: number,
    worldZ: number,
  ): Record<string, number> {
    const boundaryNoise = noise.simplex2D(
      worldX * BIOME_CONFIG.boundaryNoiseScale,
      worldZ * BIOME_CONFIG.boundaryNoiseScale,
    );

    const weights: Record<string, number> = {};
    let totalWeight = 0;

    for (const center of biomeCenters) {
      const dx = worldX - center.x;
      const dz = worldZ - center.z;
      const distance = Math.sqrt(dx * dx + dz * dz);
      const noisyDist =
        distance * (1 + boundaryNoise * BIOME_CONFIG.boundaryNoiseAmount);
      const normDist = noisyDist / center.influence;
      const w = Math.exp(-normDist * normDist * BIOME_CONFIG.gaussianCoeff);

      weights[center.type] = (weights[center.type] || 0) + w;
      totalWeight += w;
    }

    if (totalWeight > 0) {
      for (const key of Object.keys(weights)) weights[key] /= totalWeight;
    } else {
      weights[DEFAULT_BIOME] = 1.0;
    }

    return weights;
  }

  function getDominantBiome(weights: Record<string, number>): string {
    let max = 0;
    let dominant = DEFAULT_BIOME;
    for (const [key, w] of Object.entries(weights)) {
      if (w > max) {
        max = w;
        dominant = key;
      }
    }
    return dominant;
  }

  function getBiomeColor(biomeId: string): { r: number; g: number; b: number } {
    const hex = GAME_BIOME_COLORS[biomeId] ?? 0x388e3c;
    return {
      r: ((hex >> 16) & 0xff) / 255,
      g: ((hex >> 8) & 0xff) / 255,
      b: (hex & 0xff) / 255,
    };
  }

  function blendBiomeColor(weights: Record<string, number>): {
    r: number;
    g: number;
    b: number;
  } {
    let r = 0,
      g = 0,
      b = 0;
    for (const [biomeId, w] of Object.entries(weights)) {
      const c = getBiomeColor(biomeId);
      r += c.r * w;
      g += c.g * w;
      b += c.b * w;
    }
    return { r, g, b };
  }

  const noiseAdapter: NoiseAdapter = {
    fractal2D: (x, z, octaves, persistence, lacunarity) =>
      noise.fractal2D(x, z, octaves, persistence, lacunarity),
    ridgeNoise2D: (x, z) => noise.ridgeNoise2D(x, z),
    erosionNoise2D: (x, z, iterations) =>
      noise.erosionNoise2D(x, z, iterations),
    simplex2D: (x, z) => noise.simplex2D(x, z),
  };

  /**
   * Query terrain at a world position. Coordinates are world-space
   * (origin at world center, not tile corner).
   */
  function queryPoint(worldX: number, worldZ: number): GameTerrainQuery {
    const biomeWeights = computeBiomeWeights(worldX, worldZ);
    const baseHeight = computeBaseHeight(
      worldX,
      worldZ,
      noiseAdapter,
      biomeWeights,
    );

    // Shoreline adjustment
    const sampleDist = SHORELINE.slopeSampleDistance;
    const bwForSlope = biomeWeights; // Reuse same weights (close enough for slope sample)
    const hn = computeBaseHeight(
      worldX,
      worldZ + sampleDist,
      noiseAdapter,
      bwForSlope,
    );
    const hs = computeBaseHeight(
      worldX,
      worldZ - sampleDist,
      noiseAdapter,
      bwForSlope,
    );
    const he = computeBaseHeight(
      worldX + sampleDist,
      worldZ,
      noiseAdapter,
      bwForSlope,
    );
    const hw = computeBaseHeight(
      worldX - sampleDist,
      worldZ,
      noiseAdapter,
      bwForSlope,
    );
    const slope = Math.max(
      Math.abs(hn - baseHeight) / sampleDist,
      Math.abs(hs - baseHeight) / sampleDist,
      Math.abs(he - baseHeight) / sampleDist,
      Math.abs(hw - baseHeight) / sampleDist,
    );
    const finalHeight = adjustShorelineHeight(baseHeight, slope);

    const dominant = getDominantBiome(biomeWeights);
    const color = blendBiomeColor(biomeWeights);

    // Compute island mask for external use
    const distFromCenter = Math.sqrt(worldX * worldX + worldZ * worldZ);
    const angle = Math.atan2(worldZ, worldX);
    const cnx = Math.cos(angle) * COASTLINE_CIRCLE_SAMPLE_RADIUS;
    const cnz = Math.sin(angle) * COASTLINE_CIRCLE_SAMPLE_RADIUS;
    const cst1 = noise.fractal2D(
      cnx,
      cnz,
      COAST_LARGE.octaves,
      COAST_LARGE.persistence,
      COAST_LARGE.lacunarity,
    );
    const cst2 = noise.fractal2D(
      cnx * COAST_MEDIUM.freqMultiplier,
      cnz * COAST_MEDIUM.freqMultiplier,
      COAST_MEDIUM.octaves,
      COAST_MEDIUM.persistence,
      COAST_MEDIUM.lacunarity,
    );
    const cst3 = noise.simplex2D(
      cnx * COAST_SMALL.freqMultiplier,
      cnz * COAST_SMALL.freqMultiplier,
    );
    const coastVar =
      cst1 * COAST_LARGE.weight +
      cst2 * COAST_MEDIUM.weight +
      cst3 * COAST_SMALL.weight;
    const effectiveRadius = ISLAND_RADIUS * (1 + coastVar);
    let mask = 1.0;
    if (distFromCenter > effectiveRadius - ISLAND_FALLOFF) {
      const edgeDist = distFromCenter - (effectiveRadius - ISLAND_FALLOFF);
      const tt = Math.min(1.0, edgeDist / ISLAND_FALLOFF);
      mask = 1.0 - Math.pow(tt, BEACH_PROFILE_POWER);
    }
    if (distFromCenter > effectiveRadius + ISLAND_DEEP_OCEAN_BUFFER) mask = 0;

    return {
      height: finalHeight,
      biomeId: dominant,
      biomeColor: color,
      islandMask: mask,
      biomeForestWeight: biomeWeights["forest"] ?? 0,
      biomeCanyonWeight: biomeWeights["canyon"] ?? 0,
    };
  }

  /**
   * Fast height-only query (no biome color computation).
   * For slope checks and collision queries.
   */
  function getHeightAt(worldX: number, worldZ: number): number {
    const biomeWeights = computeBiomeWeights(worldX, worldZ);
    return computeBaseHeight(worldX, worldZ, noiseAdapter, biomeWeights);
  }

  return {
    queryPoint,
    getHeightAt,
    getBiomeSystem: () => biomeSystem,
    getNoiseGenerator: () => noise,
    config: {
      maxHeight: GAME_MAX_HEIGHT,
      waterThreshold: GAME_WATER_THRESHOLD,
      tileSize: GAME_TILE_SIZE,
      worldSize: GAME_WORLD_SIZE,
      tileResolution: GAME_TILE_RESOLUTION,
      seed,
    },
  };
}
