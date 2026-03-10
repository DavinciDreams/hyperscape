/**
 * Single source of truth for terrain height generation parameters.
 *
 * Both TerrainSystem (main thread) and TerrainWorker (web worker) consume
 * these values. Changing a constant here automatically updates both.
 *
 * The worker receives these as injected values in its inline code string
 * (see TerrainWorker.ts → buildWorkerHeightCode()). TerrainSystem imports
 * them directly as TypeScript constants.
 */

import { BiomeType, DEFAULT_BIOME } from "./TerrainBiomeTypes";
import { TERRAIN_CONSTANTS } from "../../../constants/GameConstants";

// ---------------------------------------------------------------------------
// Core terrain generation constants
// ---------------------------------------------------------------------------

export const MAX_HEIGHT = 50;

/**
 * Derived from WATER_THRESHOLD / MAX_HEIGHT so there's one source of truth.
 * Terrain generation works in 0-1 normalized space; this is the cutoff.
 */
export const WATER_LEVEL_NORMALIZED =
  TERRAIN_CONSTANTS.WATER_THRESHOLD / MAX_HEIGHT;

// ---------------------------------------------------------------------------
// Shoreline constants — shape terrain near the water edge
// ---------------------------------------------------------------------------

export const SHORELINE_CONFIG = {
  THRESHOLD: 0.25,
  STRENGTH: 0.6,
  MIN_SLOPE: 0.06,
  SLOPE_SAMPLE_DISTANCE: 1.0,
  LAND_BAND: 3.0,
  LAND_MAX_MULTIPLIER: 1.6,
  UNDERWATER_BAND: 3.0,
  UNDERWATER_DEPTH_MULTIPLIER: 1.8,
} as const;

// ---------------------------------------------------------------------------
// Noise layer definitions — drive getBaseHeightAt()
// ---------------------------------------------------------------------------

export interface NoiseLayerDef {
  scale: number;
  weight: number;
  octaves?: number;
  persistence?: number;
  lacunarity?: number;
  /** Only for erosion noise */
  iterations?: number;
}

export const CONTINENT_LAYER: NoiseLayerDef = {
  scale: 0.0004,
  octaves: 5,
  persistence: 0.7,
  lacunarity: 2.0,
  weight: 0.35,
};

export const RIDGE_LAYER: NoiseLayerDef = {
  scale: 0.0015,
  weight: 0.15,
};

export const HILL_LAYER: NoiseLayerDef = {
  scale: 0.008,
  octaves: 4,
  persistence: 0.6,
  lacunarity: 2.2,
  weight: 0.25,
};

export const EROSION_LAYER: NoiseLayerDef = {
  scale: 0.0025,
  iterations: 3,
  weight: 0.1,
};

export const DETAIL_LAYER: NoiseLayerDef = {
  scale: 0.02,
  octaves: 2,
  persistence: 0.3,
  lacunarity: 2.5,
  weight: 0.08,
};

/** Power curve applied after blending noise layers and normalizing to [0,1] */
export const HEIGHT_POWER_CURVE = 1.1;

// ---------------------------------------------------------------------------
// Biome noise profiles — per-biome noise weight blending (Option A)
// ---------------------------------------------------------------------------

/** Global terrace step count — shared across all biomes to prevent boundary artifacts. */
export const TERRACE_STEPS = 10;

export interface BiomeNoiseProfile {
  continentWeight: number;
  ridgeWeight: number;
  hillWeight: number;
  erosionWeight: number;
  detailWeight: number;
  powerCurve: number;
  /** 0–1 blend from smooth to terraced (0 = disabled, higher = more visible) */
  terraceStrength: number;
  /** 0–1 flat zone per step (0.8 = 80% flat shelf, 20% cliff transition) */
  terraceSharpness: number;
  /**
   * Stretches shelf positions around the midpoint to make cliffs taller.
   * 1 = normal (5m cliffs at MAX_HEIGHT=50, TERRACE_STEPS=10)
   * 3 = 3x taller cliffs (~15m). Vary per biome for visual diversity.
   */
  terraceHeightScale: number;
  /**
   * 0–1 how much natural terrain slope is preserved on each shelf.
   * 0 = perfectly flat shelves, 0.3 = 30% of natural slope, 1 = no flattening.
   */
  terraceSlope: number;
}

export const TUNDRA_PROFILE: BiomeNoiseProfile = {
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

export const FOREST_PROFILE: BiomeNoiseProfile = {
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

export const CANYON_PROFILE: BiomeNoiseProfile = {
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

export const BIOME_PROFILES: Record<string, BiomeNoiseProfile> = {
  [BiomeType.Tundra]: TUNDRA_PROFILE,
  [BiomeType.Forest]: FOREST_PROFILE,
  [BiomeType.Canyon]: CANYON_PROFILE,
};

// ---------------------------------------------------------------------------
// Island configuration
// ---------------------------------------------------------------------------

export const ISLAND_RADIUS = 788;
export const ISLAND_FALLOFF = 450;
export const ISLAND_DEEP_OCEAN_BUFFER = 113;
export const BASE_ELEVATION = 0.42;
export const OCEAN_FLOOR_HEIGHT = 0.05;
/** height = terrain * HEIGHT_TERRAIN_MIX + BASE_ELEVATION * islandMask */
export const HEIGHT_TERRAIN_MIX = 0.2;
export const BEACH_PROFILE_POWER = 3.0;

// ---------------------------------------------------------------------------
// Biome configuration — single source of truth for biome placement & blending
// ---------------------------------------------------------------------------

export const BIOME_CONFIG = {
  gaussianCoeff: 12.0,
  boundaryNoiseScale: 0.003,
  boundaryNoiseAmount: 0.15,
  placementRadius: ISLAND_RADIUS * 0.45,
  influenceRadius: ISLAND_RADIUS * 0.6,
} as const;

// ---------------------------------------------------------------------------
// Landscape features — mountains & ponds, independent of biomes
// ---------------------------------------------------------------------------

export enum LandscapeType {
  Mountain = "mountain",
  Pond = "pond",
}

export interface LandscapeFeatureDef {
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

/**
 * Predefined landscape features — add/remove entries here to control
 * exactly where mountains, ponds, and plateaus appear on the island.
 *
 * Algorithm: radial envelope × domain-warped noise → terrace quantization.
 * The envelope defines the feature's footprint; noise drives internal terrain.
 * Terracing follows noise contours, producing organic (non-circular) layers.
 *
 * Parameter guide:
 *   layers        - number of terrace levels (1 = single plateau, 6+ = tiered mountain)
 *   shapePower    - envelope falloff (0.3 = dome, 1 = cone, 4+ = flat-topped mesa)
 *   edgeSharpness - terrace cliff sharpness (0 = smooth ramp, 1 = hard cliff)
 *   layerSlope    - incline within each shelf (0 = flat, 0.5 = gentle slope, 1 = full slope)
 *   noiseScale    - frequency of internal terrain (0.02 = broad ridges, 0.05 = fine detail)
 *   noiseAmount   - noise vs envelope blend (0 = smooth dome, 0.6 = organic ridges)
 */
export const LANDSCAPE_FEATURES: LandscapeFeatureDef[] = [
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
];

// ---------------------------------------------------------------------------
// Coastline noise — varies the island radius for irregular shoreline
// ---------------------------------------------------------------------------

export const COASTLINE_CIRCLE_SAMPLE_RADIUS = 2;

export const COAST_LARGE = {
  octaves: 3,
  persistence: 0.5,
  lacunarity: 2.0,
  weight: 0.2,
};

export const COAST_MEDIUM = {
  freqMultiplier: 3,
  octaves: 2,
  persistence: 0.5,
  lacunarity: 2.0,
  weight: 0.08,
};

export const COAST_SMALL = {
  freqMultiplier: 8,
  weight: 0.02,
};

// ---------------------------------------------------------------------------
// Legacy exports — kept for backward compatibility with TerrainWorker.ts
// ---------------------------------------------------------------------------

/** @deprecated Landscape features replace hardcoded pond */
export const POND_RADIUS = 50;
/** @deprecated Landscape features replace hardcoded pond */
export const POND_DEPTH = 0.55;
/** @deprecated Landscape features replace hardcoded pond */
export const POND_CENTER_X = -80;
/** @deprecated Landscape features replace hardcoded pond */
export const POND_CENTER_Z = 60;

// ═══════════════════════════════════════════════════════════════════════════
// SINGLE SOURCE OF TRUTH — pure TypeScript functions
//
// computeBaseHeight()  →  called directly by TerrainSystem (main thread)
// applyLandscapeFeaturesPure() → called by computeBaseHeight
//
// The buildXxxJS() functions below are worker-embeddable MIRRORS of the
// same logic. They MUST stay in sync — edit both together.
// ═══════════════════════════════════════════════════════════════════════════

export interface TerrainNoiseAdapter {
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

export function applyLandscapeFeaturesPure(
  height: number,
  worldX: number,
  worldZ: number,
  features: ReadonlyArray<LandscapeFeatureDef>,
  noise: TerrainNoiseAdapter,
): number {
  for (let i = 0; i < features.length; i++) {
    const feat = features[i];
    const dx = worldX - feat.x;
    const dz = worldZ - feat.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
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
 * THE height generation algorithm. Main thread calls this directly.
 * Workers use the JS-string mirror (buildGetBaseHeightAtJS) which
 * must produce identical results — keep them in sync.
 */
export function computeBaseHeight(
  worldX: number,
  worldZ: number,
  noise: TerrainNoiseAdapter,
  biomeWeights: Record<string, number>,
  features: ReadonlyArray<LandscapeFeatureDef>,
  maxHeight: number,
): number {
  // ── 1. Sample noise layers ──────────────────────────────────────────
  const cN = noise.fractal2D(
    worldX * CONTINENT_LAYER.scale,
    worldZ * CONTINENT_LAYER.scale,
    CONTINENT_LAYER.octaves!,
    CONTINENT_LAYER.persistence!,
    CONTINENT_LAYER.lacunarity!,
  );
  const rN = noise.ridgeNoise2D(
    worldX * RIDGE_LAYER.scale,
    worldZ * RIDGE_LAYER.scale,
  );
  const hN = noise.fractal2D(
    worldX * HILL_LAYER.scale,
    worldZ * HILL_LAYER.scale,
    HILL_LAYER.octaves!,
    HILL_LAYER.persistence!,
    HILL_LAYER.lacunarity!,
  );
  const eN = noise.erosionNoise2D(
    worldX * EROSION_LAYER.scale,
    worldZ * EROSION_LAYER.scale,
    EROSION_LAYER.iterations!,
  );
  const dN = noise.fractal2D(
    worldX * DETAIL_LAYER.scale,
    worldZ * DETAIL_LAYER.scale,
    DETAIL_LAYER.octaves!,
    DETAIL_LAYER.persistence!,
    DETAIL_LAYER.lacunarity!,
  );

  // ── 2. Blend noise using biome-weighted profiles ────────────────────
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

  // ── 3. Combine, normalize, power curve ──────────────────────────────
  let height = cN * cW + rN * rW + hN * hW + eN * eW + dN * dW;
  height = (height + 1) * 0.5;
  height = Math.max(0, Math.min(1, height));
  height = Math.pow(height, pC);

  // ── 4. Terracing — floor-quantize into flat shelves with cliff edges ─
  // tHS stretches shelf positions around 0.5 so cliffs are taller per biome.
  // tSl blends natural slope back onto shelves (0 = flat, 1 = full natural slope).
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

  // ── 5. Coastline noise → island mask ────────────────────────────────
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
    const t = Math.min(1.0, edgeDist / ISLAND_FALLOFF);
    islandMask = 1.0 - Math.pow(t, BEACH_PROFILE_POWER);
  }
  if (distFromCenter > effectiveRadius + ISLAND_DEEP_OCEAN_BUFFER) {
    islandMask = 0;
  }

  // ── 6. Island mask + landscape features ─────────────────────────────
  height = height * islandMask;
  height = applyLandscapeFeaturesPure(height, worldX, worldZ, features, noise);

  if (islandMask === 0) {
    height = OCEAN_FLOOR_HEIGHT;
  }

  return height * maxHeight;
}

export interface ShorelineConfig {
  waterThreshold: number;
  shorelineLandBand: number;
  shorelineUnderwaterBand: number;
  shorelineMinSlope: number;
  shorelineLandMaxMultiplier: number;
  underwaterDepthMultiplier: number;
}

/**
 * Adjust height near shoreline to prevent flat beach zones.
 * Both main thread and workers use the same algorithm.
 */
export function adjustShorelineHeight(
  baseHeight: number,
  slope: number,
  config: ShorelineConfig,
): number {
  if (baseHeight === config.waterThreshold) return baseHeight;

  const isLand = baseHeight > config.waterThreshold;
  const band = isLand
    ? config.shorelineLandBand
    : config.shorelineUnderwaterBand;
  if (band <= 0) return baseHeight;

  const delta = Math.abs(baseHeight - config.waterThreshold);
  if (delta >= band) return baseHeight;

  if (config.shorelineMinSlope <= 0) return baseHeight;

  const maxMul = isLand
    ? config.shorelineLandMaxMultiplier
    : config.underwaterDepthMultiplier;
  if (maxMul <= 1) return baseHeight;

  const slopeSafe = Math.max(0.0001, slope);
  const targetMul = Math.min(
    maxMul,
    Math.max(1, config.shorelineMinSlope / slopeSafe),
  );
  const falloff = 1 - delta / band;
  const mul = 1 + (targetMul - 1) * falloff;
  const adjustedDelta = delta * mul;

  return isLand
    ? config.waterThreshold + adjustedDelta
    : config.waterThreshold - adjustedDelta;
}

// ═══════════════════════════════════════════════════════════════════════════
// Worker JS string mirrors — MUST match the pure functions above.
// Workers can't import TS modules, so we generate equivalent JS strings
// with constants baked in. Keep these in lock-step with the TS functions.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * JS source for position-only biome weight computation.
 * Worker mirror — depends on: noise, biomeCenters,
 * BIOME_BOUNDARY_NOISE_SCALE, BIOME_BOUNDARY_NOISE_AMOUNT, BIOME_GAUSSIAN_COEFF.
 */
export function buildComputeBiomeWeightsJS(): string {
  return `
  function computeBiomeWeightsByPosition(worldX, worldZ) {
    var boundaryNoise = noise.simplex2D(
      worldX * BIOME_BOUNDARY_NOISE_SCALE,
      worldZ * BIOME_BOUNDARY_NOISE_SCALE
    );
    var weights = {};
    var totalWeight = 0;
    for (var i = 0; i < biomeCenters.length; i++) {
      var center = biomeCenters[i];
      var dx = worldX - center.x;
      var dz = worldZ - center.z;
      var dist = Math.sqrt(dx * dx + dz * dz);
      var noisyDist = dist * (1 + boundaryNoise * BIOME_BOUNDARY_NOISE_AMOUNT);
      var normDist = noisyDist / center.influence;
      var w = Math.exp(-normDist * normDist * BIOME_GAUSSIAN_COEFF);
      var type = center.type;
      weights[type] = (weights[type] || 0) + w;
      totalWeight += w;
    }
    if (totalWeight > 0) {
      for (var key in weights) { weights[key] /= totalWeight; }
    } else {
      weights[BT_DEFAULT] = 1.0;
    }
    return weights;
  }`;
}

/**
 * JS source — worker mirror of applyLandscapeFeaturesPure().
 * Depends on: landscapeFeatures array injected into worker scope, noise object.
 */
export function buildApplyLandscapeFeaturesJS(): string {
  return `
  function applyLandscapeFeatures(height, worldX, worldZ) {
    for (var i = 0; i < landscapeFeatures.length; i++) {
      var feat = landscapeFeatures[i];
      var dx = worldX - feat.x;
      var dz = worldZ - feat.z;
      var dist = Math.sqrt(dx * dx + dz * dz);
      if (dist >= feat.radius) continue;

      var t = Math.max(0, 1 - dist / feat.radius);
      var envelope = Math.pow(t, feat.shapePower);

      var warpScale = feat.noiseScale * 0.4;
      var warpStr = feat.radius * feat.noiseAmount * 0.3;
      var warpX = noise.simplex2D(worldX * warpScale, worldZ * warpScale) * warpStr;
      var warpZ = noise.simplex2D(worldX * warpScale + 31.7, worldZ * warpScale + 47.3) * warpStr;

      var sx = (worldX + warpX) * feat.noiseScale;
      var sz = (worldZ + warpZ) * feat.noiseScale;

      var ridgeN = noise.ridgeNoise2D(sx, sz);
      var detailN = noise.fractal2D(sx * 2.3, sz * 2.3, 3, 0.5, 2.0);
      var mNoise = (ridgeN * 0.6 + detailN * 0.4 + 1) * 0.5;

      var rawH = envelope * (1 - feat.noiseAmount + feat.noiseAmount * mNoise);
      rawH = Math.max(0, Math.min(1, rawH));

      var influence;
      if (feat.layers >= 1) {
        var stepped = Math.floor(rawH * feat.layers) / feat.layers;
        var nextStep = Math.min(1, stepped + 1 / feat.layers);
        var frac = (rawH - stepped) * feat.layers;
        var blendStart = 1 - feat.edgeSharpness;
        var edgeBlend = frac <= blendStart ? 0 : (frac - blendStart) / (1 - blendStart);
        var flatStep = stepped + edgeBlend * (nextStep - stepped);
        var slopedStep = stepped + frac * (nextStep - stepped);
        influence = flatStep + feat.layerSlope * (slopedStep - flatStep);
      } else {
        influence = rawH;
      }

      if (feat.type === '${LandscapeType.Pond}') {
        height -= influence * feat.strength;
      } else {
        height += influence * feat.strength;
      }
    }
    return height;
  }`;
}

// Biome profile constants baked into JS for workers
const PROFILES_JS = `
  var BIOME_PROFILES = {};
  BIOME_PROFILES[BT_TUNDRA]  = { cW: ${TUNDRA_PROFILE.continentWeight}, rW: ${TUNDRA_PROFILE.ridgeWeight}, hW: ${TUNDRA_PROFILE.hillWeight}, eW: ${TUNDRA_PROFILE.erosionWeight}, dW: ${TUNDRA_PROFILE.detailWeight}, pC: ${TUNDRA_PROFILE.powerCurve}, tS: ${TUNDRA_PROFILE.terraceStrength}, tSh: ${TUNDRA_PROFILE.terraceSharpness}, tHS: ${TUNDRA_PROFILE.terraceHeightScale}, tSl: ${TUNDRA_PROFILE.terraceSlope} };
  BIOME_PROFILES[BT_FOREST]  = { cW: ${FOREST_PROFILE.continentWeight}, rW: ${FOREST_PROFILE.ridgeWeight}, hW: ${FOREST_PROFILE.hillWeight}, eW: ${FOREST_PROFILE.erosionWeight}, dW: ${FOREST_PROFILE.detailWeight}, pC: ${FOREST_PROFILE.powerCurve}, tS: ${FOREST_PROFILE.terraceStrength}, tSh: ${FOREST_PROFILE.terraceSharpness}, tHS: ${FOREST_PROFILE.terraceHeightScale}, tSl: ${FOREST_PROFILE.terraceSlope} };
  BIOME_PROFILES[BT_CANYON]  = { cW: ${CANYON_PROFILE.continentWeight}, rW: ${CANYON_PROFILE.ridgeWeight}, hW: ${CANYON_PROFILE.hillWeight}, eW: ${CANYON_PROFILE.erosionWeight}, dW: ${CANYON_PROFILE.detailWeight}, pC: ${CANYON_PROFILE.powerCurve}, tS: ${CANYON_PROFILE.terraceStrength}, tSh: ${CANYON_PROFILE.terraceSharpness}, tHS: ${CANYON_PROFILE.terraceHeightScale}, tSl: ${CANYON_PROFILE.terraceSlope} };
`;

/**
 * JS source — worker mirror of computeBaseHeight().
 * Accepts biome weights and blends noise per-biome.
 * MUST stay in sync with computeBaseHeight() above.
 */
export function buildGetBaseHeightAtJS(): string {
  return `
  ${PROFILES_JS}

  function getBaseHeightAt(worldX, worldZ, biomeWeights) {
    var bw = biomeWeights || computeBiomeWeightsByPosition(worldX, worldZ);

    var cN = noise.fractal2D(worldX * ${CONTINENT_LAYER.scale}, worldZ * ${CONTINENT_LAYER.scale}, ${CONTINENT_LAYER.octaves}, ${CONTINENT_LAYER.persistence}, ${CONTINENT_LAYER.lacunarity});
    var rN = noise.ridgeNoise2D(worldX * ${RIDGE_LAYER.scale}, worldZ * ${RIDGE_LAYER.scale});
    var hN = noise.fractal2D(worldX * ${HILL_LAYER.scale}, worldZ * ${HILL_LAYER.scale}, ${HILL_LAYER.octaves}, ${HILL_LAYER.persistence}, ${HILL_LAYER.lacunarity});
    var eN = noise.erosionNoise2D(worldX * ${EROSION_LAYER.scale}, worldZ * ${EROSION_LAYER.scale}, ${EROSION_LAYER.iterations});
    var dN = noise.fractal2D(worldX * ${DETAIL_LAYER.scale}, worldZ * ${DETAIL_LAYER.scale}, ${DETAIL_LAYER.octaves}, ${DETAIL_LAYER.persistence}, ${DETAIL_LAYER.lacunarity});

    var cW = 0, rW = 0, hW = 0, eW = 0, dW = 0, pC = 0, tS = 0, tSh = 0, tHS = 0, tSl = 0;
    for (var key in bw) {
      var w = bw[key];
      var p = BIOME_PROFILES[key] || BIOME_PROFILES[BT_DEFAULT];
      cW += p.cW * w; rW += p.rW * w; hW += p.hW * w; eW += p.eW * w; dW += p.dW * w;
      pC += p.pC * w; tS += p.tS * w; tSh += p.tSh * w; tHS += p.tHS * w; tSl += p.tSl * w;
    }

    var height = cN * cW + rN * rW + hN * hW + eN * eW + dN * dW;
    height = (height + 1) * 0.5;
    height = Math.max(0, Math.min(1, height));
    height = Math.pow(height, pC);

    var gSteps = ${TERRACE_STEPS};
    var ths = Math.max(1, tHS);
    if (tS > 0.01 && gSteps >= 2) {
      var gStepped = Math.floor(height * gSteps) / gSteps;
      var gNextStep = Math.min(1, gStepped + 1 / gSteps);
      var gFrac = (height - gStepped) * gSteps;
      var gEdgeBlend = gFrac < tSh ? 0 : (gFrac - tSh) / (1 - tSh + 0.001);
      var gFlatStep = gStepped + gEdgeBlend * (gNextStep - gStepped);
      var gSlopedStep = gStepped + gFrac * (gNextStep - gStepped);
      var gTerraced = gFlatStep + tSl * (gSlopedStep - gFlatStep);
      var gScaled = Math.max(0, Math.min(1, 0.5 + (gTerraced - 0.5) * ths));
      height = height + (gScaled - height) * tS;
    }

    var distFromCenter = Math.sqrt(worldX * worldX + worldZ * worldZ);
    var angle = Math.atan2(worldZ, worldX);
    var cnx = Math.cos(angle) * ${COASTLINE_CIRCLE_SAMPLE_RADIUS};
    var cnz = Math.sin(angle) * ${COASTLINE_CIRCLE_SAMPLE_RADIUS};
    var cst1 = noise.fractal2D(cnx, cnz, ${COAST_LARGE.octaves}, ${COAST_LARGE.persistence}, ${COAST_LARGE.lacunarity});
    var cst2 = noise.fractal2D(cnx * ${COAST_MEDIUM.freqMultiplier}, cnz * ${COAST_MEDIUM.freqMultiplier}, ${COAST_MEDIUM.octaves}, ${COAST_MEDIUM.persistence}, ${COAST_MEDIUM.lacunarity});
    var cst3 = noise.simplex2D(cnx * ${COAST_SMALL.freqMultiplier}, cnz * ${COAST_SMALL.freqMultiplier});
    var coastVar = cst1 * ${COAST_LARGE.weight} + cst2 * ${COAST_MEDIUM.weight} + cst3 * ${COAST_SMALL.weight};
    var effectiveRadius = ${ISLAND_RADIUS} * (1 + coastVar);

    var islandMask = 1.0;
    if (distFromCenter > effectiveRadius - ${ISLAND_FALLOFF}) {
      var edgeDist = distFromCenter - (effectiveRadius - ${ISLAND_FALLOFF});
      var t = Math.min(1.0, edgeDist / ${ISLAND_FALLOFF});
      islandMask = 1.0 - Math.pow(t, ${BEACH_PROFILE_POWER});
    }
    if (distFromCenter > effectiveRadius + ${ISLAND_DEEP_OCEAN_BUFFER}) {
      islandMask = 0;
    }

    height = height * islandMask;
    height = applyLandscapeFeatures(height, worldX, worldZ);

    if (islandMask === 0) { height = ${OCEAN_FLOOR_HEIGHT}; }
    return height * MAX_HEIGHT;
  }`;
}
