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
  scale: 0.0008,
  octaves: 5,
  persistence: 0.7,
  lacunarity: 2.0,
  weight: 0.35,
};

export const RIDGE_LAYER: NoiseLayerDef = {
  scale: 0.003,
  weight: 0.15,
};

export const HILL_LAYER: NoiseLayerDef = {
  scale: 0.02,
  octaves: 4,
  persistence: 0.6,
  lacunarity: 2.2,
  weight: 0.25,
};

export const EROSION_LAYER: NoiseLayerDef = {
  scale: 0.005,
  iterations: 3,
  weight: 0.1,
};

export const DETAIL_LAYER: NoiseLayerDef = {
  scale: 0.04,
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

export interface BiomeNoiseProfile {
  continentWeight: number;
  ridgeWeight: number;
  hillWeight: number;
  erosionWeight: number;
  detailWeight: number;
  powerCurve: number;
  terraceStrength: number;
  terraceSteps: number;
  terraceCeiling: number;
  terraceFloor: number;
}

// Tundra: rugged snowy peaks with ridges and erosion
export const TUNDRA_PROFILE: BiomeNoiseProfile = {
  continentWeight: 0.28,
  ridgeWeight: 0.2,
  hillWeight: 0.35,
  erosionWeight: 0.12,
  detailWeight: 0.15,
  powerCurve: 1.15,
  terraceStrength: 0.1,
  terraceSteps: 6,
  terraceCeiling: 0.75,
  terraceFloor: 0,
};

// Forest: gentle rolling hills, smooth and lush
export const FOREST_PROFILE: BiomeNoiseProfile = {
  continentWeight: 0.4,
  ridgeWeight: 0.05,
  hillWeight: 0.12,
  erosionWeight: 0.03,
  detailWeight: 0.02,
  powerCurve: 0.85,
  terraceStrength: 0.1,
  terraceSteps: 6,
  terraceCeiling: 0.75,
  terraceFloor: 0,
};

// Desert: dramatic mesas and canyons with strong terracing and erosion
export const DESERT_PROFILE: BiomeNoiseProfile = {
  continentWeight: 0.32,
  ridgeWeight: 0.25,
  hillWeight: 0.18,
  erosionWeight: 0.2,
  detailWeight: 0.05,
  powerCurve: 1.5,
  terraceStrength: 0.55,
  terraceSteps: 6,
  terraceCeiling: 0.75,
  terraceFloor: 0.0,
};

export const BIOME_PROFILES: Record<string, BiomeNoiseProfile> = {
  [BiomeType.Tundra]: TUNDRA_PROFILE,
  [BiomeType.Forest]: FOREST_PROFILE,
  [BiomeType.Desert]: DESERT_PROFILE,
};

export const TERRACE_NOISE_SCALE = 0.005;

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
 * Parameter guide:
 *   layers        - number of terrace levels (1 = single plateau, 4+ = tiered mountain)
 *   shapePower    - falloff curve (0.3 = dome, 1 = cone, 4+ = flat-topped mesa)
 *   edgeSharpness - transition between layers (0 = smooth blend, 1 = hard cliff)
 *   layerSlope    - incline within each layer (0 = perfectly flat shelves, 1 = full natural slope)
 *   noiseScale    - frequency of edge wobble (higher = more detailed wiggles)
 *   noiseAmount   - amplitude of edge wobble (0 = perfect circles, 0.3 = organic edges)
 */
export const LANDSCAPE_FEATURES: LandscapeFeatureDef[] = [
  {
    type: LandscapeType.Mountain,
    x: -168.5,
    z: -352.5,
    radius: 150,
    strength: 4.0,
    layers: 5,
    shapePower: 1.8,
    edgeSharpness: 0.7,
    layerSlope: 0.5,
    noiseScale: 0.015,
    noiseAmount: 0.2,
  },
  {
    type: LandscapeType.Mountain,
    x: 265.5,
    z: 128.5,
    radius: 150,
    strength: 2.0,
    layers: 3,
    shapePower: 1.5,
    edgeSharpness: 0.6,
    layerSlope: 0.4,
    noiseScale: 0.02,
    noiseAmount: 0.15,
  },
  {
    type: LandscapeType.Pond,
    x: -134.5,
    z: 127.5,
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

    const nv =
      feat.noiseAmount > 0
        ? noise.simplex2D(worldX * feat.noiseScale, worldZ * feat.noiseScale) *
          feat.noiseAmount
        : 0;

    const t = Math.max(0, Math.min(1, 1 - dist / feat.radius + nv));
    const shaped = Math.pow(t, feat.shapePower);

    let influence: number;
    if (feat.layers >= 1) {
      const stepped = Math.floor(shaped * feat.layers) / feat.layers;
      const nextStep = Math.min(1, stepped + 1 / feat.layers);
      const frac = (shaped - stepped) * feat.layers;
      const blendStart = 1 - feat.edgeSharpness;
      const edgeBlend =
        frac <= blendStart ? 0 : (frac - blendStart) / (1 - blendStart);
      const flatStep = stepped + edgeBlend * (nextStep - stepped);
      const slopedStep = stepped + frac * (nextStep - stepped);
      influence = flatStep + feat.layerSlope * (slopedStep - flatStep);
    } else {
      influence = shaped;
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
    tSt = 0,
    tC = 0,
    tF = 0;
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
    tSt += p.terraceSteps * w;
    tC += p.terraceCeiling * w;
    tF += p.terraceFloor * w;
  }

  // ── 3. Combine, normalize, power curve ──────────────────────────────
  let height = cN * cW + rN * rW + hN * hW + eN * eW + dN * dW;
  height = (height + 1) * 0.5;
  height = Math.max(0, Math.min(1, height));
  height = Math.pow(height, pC);

  // ── 4. Terracing (per-biome step count, noise-varied blend) ─────────
  const roundedSteps = Math.round(tSt);
  if (tS > 0.001 && roundedSteps >= 1) {
    const terraceNoise = noise.simplex2D(
      worldX * TERRACE_NOISE_SCALE,
      worldZ * TERRACE_NOISE_SCALE,
    );
    const range = Math.max(0.01, tC - tF);
    const normalized = Math.max(0, Math.min(1, (height - tF) / range));
    const quantized =
      (Math.round(normalized * roundedSteps) / roundedSteps) * range + tF;
    const terraceBlend = tS * (0.7 + 0.3 * (terraceNoise * 0.5 + 0.5));
    height = height + (quantized - height) * terraceBlend;
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

      var nv = feat.noiseAmount > 0
        ? noise.simplex2D(worldX * feat.noiseScale, worldZ * feat.noiseScale) * feat.noiseAmount
        : 0;

      var t = Math.max(0, Math.min(1, 1 - dist / feat.radius + nv));
      var shaped = Math.pow(t, feat.shapePower);

      var influence;
      if (feat.layers >= 1) {
        var stepped = Math.floor(shaped * feat.layers) / feat.layers;
        var nextStep = Math.min(1, stepped + 1 / feat.layers);
        var frac = (shaped - stepped) * feat.layers;
        var blendStart = 1 - feat.edgeSharpness;
        var edgeBlend = frac <= blendStart ? 0 : (frac - blendStart) / (1 - blendStart);
        var flatStep = stepped + edgeBlend * (nextStep - stepped);
        var slopedStep = stepped + frac * (nextStep - stepped);
        influence = flatStep + feat.layerSlope * (slopedStep - flatStep);
      } else {
        influence = shaped;
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
  BIOME_PROFILES[BT_TUNDRA]  = { cW: ${TUNDRA_PROFILE.continentWeight}, rW: ${TUNDRA_PROFILE.ridgeWeight}, hW: ${TUNDRA_PROFILE.hillWeight}, eW: ${TUNDRA_PROFILE.erosionWeight}, dW: ${TUNDRA_PROFILE.detailWeight}, pC: ${TUNDRA_PROFILE.powerCurve}, tS: ${TUNDRA_PROFILE.terraceStrength}, tSt: ${TUNDRA_PROFILE.terraceSteps}, tC: ${TUNDRA_PROFILE.terraceCeiling}, tF: ${TUNDRA_PROFILE.terraceFloor} };
  BIOME_PROFILES[BT_FOREST]  = { cW: ${FOREST_PROFILE.continentWeight}, rW: ${FOREST_PROFILE.ridgeWeight}, hW: ${FOREST_PROFILE.hillWeight}, eW: ${FOREST_PROFILE.erosionWeight}, dW: ${FOREST_PROFILE.detailWeight}, pC: ${FOREST_PROFILE.powerCurve}, tS: ${FOREST_PROFILE.terraceStrength}, tSt: ${FOREST_PROFILE.terraceSteps}, tC: ${FOREST_PROFILE.terraceCeiling}, tF: ${FOREST_PROFILE.terraceFloor} };
  BIOME_PROFILES[BT_DESERT]  = { cW: ${DESERT_PROFILE.continentWeight}, rW: ${DESERT_PROFILE.ridgeWeight}, hW: ${DESERT_PROFILE.hillWeight}, eW: ${DESERT_PROFILE.erosionWeight}, dW: ${DESERT_PROFILE.detailWeight}, pC: ${DESERT_PROFILE.powerCurve}, tS: ${DESERT_PROFILE.terraceStrength}, tSt: ${DESERT_PROFILE.terraceSteps}, tC: ${DESERT_PROFILE.terraceCeiling}, tF: ${DESERT_PROFILE.terraceFloor} };
  var TERRACE_NOISE_SCALE = ${TERRACE_NOISE_SCALE};
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

    var cW = 0, rW = 0, hW = 0, eW = 0, dW = 0, pC = 0, tS = 0, tSt = 0, tC = 0, tF = 0;
    for (var key in bw) {
      var w = bw[key];
      var p = BIOME_PROFILES[key] || BIOME_PROFILES[BT_DEFAULT];
      cW += p.cW * w; rW += p.rW * w; hW += p.hW * w; eW += p.eW * w; dW += p.dW * w;
      pC += p.pC * w; tS += p.tS * w; tSt += p.tSt * w; tC += p.tC * w; tF += p.tF * w;
    }

    var height = cN * cW + rN * rW + hN * hW + eN * eW + dN * dW;
    height = (height + 1) * 0.5;
    height = Math.max(0, Math.min(1, height));
    height = Math.pow(height, pC);

    var roundedSteps = Math.round(tSt);
    if (tS > 0.001 && roundedSteps >= 1) {
      var terraceNoise = noise.simplex2D(worldX * TERRACE_NOISE_SCALE, worldZ * TERRACE_NOISE_SCALE);
      var range = Math.max(0.01, tC - tF);
      var normalized = Math.max(0, Math.min(1, (height - tF) / range));
      var quantized = Math.round(normalized * roundedSteps) / roundedSteps * range + tF;
      var terraceBlend = tS * (0.7 + 0.3 * (terraceNoise * 0.5 + 0.5));
      height = height + (quantized - height) * terraceBlend;
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
