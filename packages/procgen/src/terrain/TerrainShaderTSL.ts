/**
 * TerrainShaderTSL - Game-accurate terrain material for TSL/WebGPU
 *
 * This is the EXACT same terrain shader code used in the game engine.
 * Both Asset Forge and the game engine share this code for visual consistency.
 *
 * Features:
 * - OSRS-style flat-shaded vertex colors (no textures)
 * - Height and slope-based biome blending
 * - Noise-based dirt patches
 * - Snow at high elevations
 * - Sand/shoreline near water
 * - Distance fog
 * - Road overlay support
 *
 * @module TerrainShaderTSL
 */

import * as THREE from "three";
import { MeshStandardNodeMaterial } from "three/webgpu";
import {
  texture,
  positionWorld,
  normalWorld,
  cameraPosition,
  attribute,
  uniform,
  float,
  vec2,
  vec3,
  add,
  sub,
  mul,
  mix,
  smoothstep,
  abs,
  sin,
  cos,
  max as tslMax,
  div,
} from "three/tsl";
import type Node from "three/src/nodes/core/Node.js";
import { MINE_BIOME_PALETTES, ROAD_COLORS } from "@hyperscape/shared/world";

// ============================================================================
// TERRAIN CONSTANTS - Shared between all terrain systems
// ============================================================================

export const TERRAIN_CONSTANTS = {
  TRIPLANAR_SCALE: 0.5,
  SNOW_HEIGHT: 50.0,
  FOG_NEAR: 150.0,
  FOG_FAR: 350.0,
  NOISE_SCALE: 0.0008,
  DIRT_THRESHOLD: 0.5,
  LOD_FULL_DETAIL: 100.0,
  LOD_MEDIUM_DETAIL: 200.0,
  WATER_LEVEL: 16, // Overridden at runtime by game; standalone default for procgen previews
  FOG_COLOR: new THREE.Color(0xd4c8b8),
} as const;

// ============================================================================
// PERLIN NOISE TEXTURE GENERATION
// ============================================================================

let cachedNoiseTexture: THREE.DataTexture | null = null;
const NOISE_SIZE = 256;

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
  return a + t * (b - a);
}

function grad(hash: number, x: number, y: number): number {
  const h = hash & 3;
  const u = h < 2 ? x : y;
  const v = h < 2 ? y : x;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

function createPermutation(seed: number): number[] {
  const p: number[] = [];
  for (let i = 0; i < 256; i++) p[i] = i;

  let s = seed;
  for (let i = 255; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [p[i], p[j]] = [p[j], p[i]];
  }

  return [...p, ...p];
}

function perlin2D(x: number, y: number, perm: number[]): number {
  const X = Math.floor(x) & 255;
  const Y = Math.floor(y) & 255;

  const xf = x - Math.floor(x);
  const yf = y - Math.floor(y);

  const u = fade(xf);
  const v = fade(yf);

  const aa = perm[perm[X] + Y];
  const ab = perm[perm[X] + Y + 1];
  const ba = perm[perm[X + 1] + Y];
  const bb = perm[perm[X + 1] + Y + 1];

  const x1 = lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u);
  const x2 = lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u);

  return lerp(x1, x2, v);
}

function seamlessPerlin2D(x: number, y: number, perm: number[]): number {
  const TWO_PI = Math.PI * 2;
  const radius = 1.0;

  const angleX = x * TWO_PI;
  const angleY = y * TWO_PI;

  const nx = Math.cos(angleX) * radius;
  const ny = Math.sin(angleX) * radius;
  const nz = Math.cos(angleY) * radius;
  const nw = Math.sin(angleY) * radius;

  const n1 = perlin2D(nx * 4 + 100, nz * 4 + 100, perm);
  const n2 = perlin2D(ny * 4 + 200, nw * 4 + 200, perm);
  const n3 = perlin2D(nx * 4 + ny * 4 + 300, nz * 4 + nw * 4 + 300, perm);

  return (n1 + n2 + n3) / 3;
}

function seamlessFbm(
  x: number,
  y: number,
  perm: number[],
  octaves: number = 4,
): number {
  let value = 0;
  let amplitude = 0.5;
  let maxValue = 0;

  for (let i = 0; i < octaves; i++) {
    const ox = x + i * 17.3;
    const oy = y + i * 31.7;
    value += amplitude * seamlessPerlin2D(ox, oy, perm);
    maxValue += amplitude;
    amplitude *= 0.5;
  }

  return value / maxValue;
}

/**
 * Generate a Perlin noise texture for terrain shading
 */
export function generateNoiseTexture(seed: number = 12345): THREE.DataTexture {
  if (cachedNoiseTexture) return cachedNoiseTexture;

  const perm = createPermutation(seed);
  const data = new Uint8Array(NOISE_SIZE * NOISE_SIZE * 4);

  for (let y = 0; y < NOISE_SIZE; y++) {
    for (let x = 0; x < NOISE_SIZE; x++) {
      const nx = x / NOISE_SIZE;
      const ny = y / NOISE_SIZE;

      const noise = seamlessFbm(nx, ny, perm, 4);
      const value = (noise + 1) * 0.5;
      const byte = Math.floor(Math.max(0, Math.min(255, value * 255)));

      const idx = (y * NOISE_SIZE + x) * 4;
      data[idx] = byte;
      data[idx + 1] = byte;
      data[idx + 2] = byte;
      data[idx + 3] = 255;
    }
  }

  const tex = new THREE.DataTexture(
    data,
    NOISE_SIZE,
    NOISE_SIZE,
    THREE.RGBAFormat,
  );
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;

  cachedNoiseTexture = tex;
  return tex;
}

/**
 * Get the cached noise texture
 */
export function getNoiseTexture(): THREE.DataTexture | null {
  return cachedNoiseTexture;
}

// CPU-side noise sampling
let cachedPerm: number[] | null = null;

/**
 * Sample noise at world position (for CPU-side operations like grass placement)
 */
export function sampleNoiseAtPosition(
  worldX: number,
  worldZ: number,
  seed: number = 12345,
): number {
  if (!cachedPerm) {
    cachedPerm = createPermutation(seed);
  }

  const u = worldX * TERRAIN_CONSTANTS.NOISE_SCALE;
  const v = worldZ * TERRAIN_CONSTANTS.NOISE_SCALE;

  const wrappedU = u - Math.floor(u);
  const wrappedV = v - Math.floor(v);

  const noise = seamlessFbm(wrappedU, wrappedV, cachedPerm, 4);
  return (noise + 1) * 0.5;
}

function smoothstepCPU(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Check if terrain at position should display as grass
 */
export function getGrassiness(
  _worldX: number,
  _worldZ: number,
  height: number,
  slope: number,
  _seed: number = 12345,
): number {
  let grassiness = 1.0;

  // Very steep slopes = rock
  if (slope > 0.6) {
    const rockFactor = smoothstepCPU(0.6, 0.8, slope);
    grassiness -= rockFactor;
  }

  // Snow at high elevation
  if (height > TERRAIN_CONSTANTS.SNOW_HEIGHT - 5.0) {
    const snowFactor = smoothstepCPU(
      TERRAIN_CONSTANTS.SNOW_HEIGHT - 5.0,
      TERRAIN_CONSTANTS.SNOW_HEIGHT + 5.0,
      height,
    );
    grassiness -= snowFactor;
  }

  return Math.max(0, Math.min(1, grassiness));
}

/**
 * Calculate terrain slope from height samples
 */
export function calculateSlope(
  getHeight: (x: number, z: number) => number,
  x: number,
  z: number,
  sampleDistance: number = 1.0,
): number {
  const hPosX = getHeight(x + sampleDistance, z);
  const hNegX = getHeight(x - sampleDistance, z);
  const hPosZ = getHeight(x, z + sampleDistance);
  const hNegZ = getHeight(x, z - sampleDistance);

  const dhdx = (hPosX - hNegX) / (2 * sampleDistance);
  const dhdz = (hPosZ - hNegZ) / (2 * sampleDistance);

  const gradientMag = Math.sqrt(dhdx * dhdx + dhdz * dhdz);
  const normalY = 1 / Math.sqrt(1 + gradientMag * gradientMag);
  const slope = 1 - Math.abs(normalY);

  return slope;
}

// ============================================================================
// TERRAIN MATERIAL UNIFORMS
// ============================================================================

export interface TerrainUniforms {
  sunPosition: { value: THREE.Vector3 };
  time: { value: number };
  fogNear: { value: number };
  fogFar: { value: number };
  fogNearSq: { value: number };
  fogFarSq: { value: number };
  fogColor: { value: THREE.Vector3 };
  fogEnabled: { value: number };
}

export interface TerrainMaterialOptions {
  /** Enable fog (default: true) */
  fogEnabled?: boolean;
  /** Include road overlay attribute (default: true) */
  includeRoadOverlay?: boolean;
  /** Include mine floor overlay attribute (default: true) */
  includeMineOverlay?: boolean;
  /** Custom fog color */
  fogColor?: THREE.Color;
  /** Custom fog distances */
  fogNear?: number;
  fogFar?: number;
}

// ============================================================================
// TERRAIN MATERIAL - OSRS Style (No Textures)
// ============================================================================

/**
 * Create the game-accurate OSRS-style terrain material
 *
 * This is the EXACT same material used in the game engine.
 * Uses TSL (Three Shader Language) for WebGPU rendering.
 */
export function createTerrainMaterial(
  options: TerrainMaterialOptions = {},
): MeshStandardNodeMaterial & { terrainUniforms: TerrainUniforms } {
  const {
    fogEnabled = true,
    includeRoadOverlay = true,
    includeMineOverlay = true,
    fogColor = TERRAIN_CONSTANTS.FOG_COLOR,
    fogNear = TERRAIN_CONSTANTS.FOG_NEAR,
    fogFar = TERRAIN_CONSTANTS.FOG_FAR,
  } = options;

  // Generate noise texture
  const noiseTex = generateNoiseTexture();

  // Uniforms
  const sunPositionUniform = uniform(vec3(100, 100, 100));
  const timeUniform = uniform(float(0));
  const noiseScale = uniform(float(TERRAIN_CONSTANTS.NOISE_SCALE));

  const fogNearUniform = uniform(float(fogNear));
  const fogFarUniform = uniform(float(fogFar));
  const fogNearSqUniform = uniform(float(fogNear * fogNear));
  const fogFarSqUniform = uniform(float(fogFar * fogFar));
  const fogColorUniform = uniform(vec3(fogColor.r, fogColor.g, fogColor.b));
  const fogEnabledUniform = uniform(float(fogEnabled ? 1.0 : 0.0));

  const worldPos = positionWorld;
  const worldNormal = normalWorld;
  const height = worldPos.y;
  const slope = sub(float(1.0), abs(worldNormal.y));

  // ============================================================================
  // PER-BIOME TERRAIN COLORS (matches game's TerrainShader.ts palettes)
  // ============================================================================

  // --- Tundra palette: snowy white-blue with frozen grey stone ---
  const TUNDRA_GRASS = vec3(0.78, 0.82, 0.85);
  const TUNDRA_GRASS_DARK = vec3(0.65, 0.7, 0.75);
  const TUNDRA_DIRT = vec3(0.55, 0.55, 0.58);
  const TUNDRA_DIRT_DARK = vec3(0.42, 0.42, 0.45);
  const TUNDRA_CLIFF = vec3(0.5, 0.52, 0.56);
  const TUNDRA_CLIFF_DARK = vec3(0.38, 0.4, 0.44);

  // --- Forest palette: vibrant energetic greens with warm brown earth ---
  const FOREST_GRASS = vec3(0.3, 0.58, 0.15);
  const FOREST_GRASS_DARK = vec3(0.18, 0.42, 0.08);
  const FOREST_DIRT = vec3(0.35, 0.24, 0.12);
  const FOREST_DIRT_DARK = vec3(0.22, 0.15, 0.08);
  const FOREST_CLIFF = vec3(0.4, 0.38, 0.32);
  const FOREST_CLIFF_DARK = vec3(0.28, 0.26, 0.22);

  // --- Canyon palette: red-orange sand with deep crimson rock ---
  const CANYON_SAND = vec3(0.82, 0.52, 0.28);
  const CANYON_SAND_DARK = vec3(0.72, 0.42, 0.2);
  const CANYON_ROCK = vec3(0.62, 0.28, 0.15);
  const CANYON_ROCK_DARK = vec3(0.48, 0.2, 0.1);
  const CANYON_CLIFF = vec3(0.72, 0.38, 0.18);
  const CANYON_CLIFF_DARK = vec3(0.55, 0.25, 0.12);

  // Legacy aliases (default = forest biome)
  const dirtDark = FOREST_DIRT_DARK;
  const sandYellow = vec3(0.7, 0.6, 0.38);
  const mudBrown = vec3(0.18, 0.12, 0.08);
  const waterEdge = vec3(0.08, 0.06, 0.04);

  // Per-vertex biome weights (set by TileBasedTerrain from GameTerrainAdapter)
  const fW = attribute("biomeForestWeight", "float");
  const dW = attribute("biomeCanyonWeight", "float");
  const tW = sub(float(1.0), add(fW, dW)); // tundra = remainder

  // Distance-based LOD
  const toCamera = sub(worldPos, cameraPosition);
  const distSq = add(
    add(mul(toCamera.x, toCamera.x), mul(toCamera.y, toCamera.y)),
    mul(toCamera.z, toCamera.z),
  );

  // Noise sampling
  const noiseUV = mul(vec2(worldPos.x, worldPos.z), noiseScale);
  const noiseValue = texture(noiseTex, noiseUV).r;

  // Derived noise (no extra texture fetch)
  const noiseValue2 = add(
    mul(sin(mul(noiseValue, float(6.28))), float(0.3)),
    float(0.5),
  );

  // Fine detail (conditional based on distance)
  const closeEnough = smoothstep(float(12000.0), float(8000.0), distSq);
  const noiseUV3 = mul(vec2(worldPos.x, worldPos.z), float(0.12));
  const fineNoiseSample = texture(noiseTex, noiseUV3).r;
  const fineNoise = mix(float(0.5), fineNoiseSample, closeEnough);

  // Micro noise (derived)
  const microNoise = add(
    mul(cos(mul(noiseValue, float(12.56))), float(0.2)),
    float(0.5),
  );

  // === BIOME-BLENDED GRASS with variation ===
  const grassVariation = smoothstep(float(0.4), float(0.6), noiseValue2);
  const tundraGrass = mix(TUNDRA_GRASS, TUNDRA_GRASS_DARK, grassVariation);
  const forestGrass = mix(FOREST_GRASS, FOREST_GRASS_DARK, grassVariation);
  const canyonGrass = mix(CANYON_SAND, CANYON_SAND_DARK, grassVariation);
  let baseColor: Node = add(
    add(mul(tundraGrass, tW), mul(forestGrass, fW)),
    mul(canyonGrass, dW),
  );

  // === BIOME-BLENDED DIRT PATCHES ===
  const dirtPatchFactor = smoothstep(
    float(TERRAIN_CONSTANTS.DIRT_THRESHOLD - 0.05),
    float(TERRAIN_CONSTANTS.DIRT_THRESHOLD + 0.15),
    noiseValue,
  );
  const flatnessFactor = smoothstep(float(0.3), float(0.05), slope);
  const dirtVariation = smoothstep(float(0.3), float(0.7), noiseValue2);
  const tundraDirt = mix(TUNDRA_DIRT, TUNDRA_DIRT_DARK, dirtVariation);
  const forestDirt = mix(FOREST_DIRT, FOREST_DIRT_DARK, dirtVariation);
  const canyonDirt = mix(CANYON_ROCK, CANYON_ROCK_DARK, dirtVariation);
  const dirtColor = add(
    add(mul(tundraDirt, tW), mul(forestDirt, fW)),
    mul(canyonDirt, dW),
  );
  baseColor = mix(baseColor, dirtColor, mul(dirtPatchFactor, flatnessFactor));

  // === SLOPE-BASED DIRT (fades out where cliff takes over) ===
  const dirtSlopeFactor = mul(
    smoothstep(float(0.15), float(0.4), slope),
    smoothstep(float(0.6), float(0.3), slope),
  );
  baseColor = mix(baseColor, dirtColor, mul(dirtSlopeFactor, float(0.6)));

  // === PER-BIOME CLIFF ON STEEP SLOPES ===
  const cliffVariation = smoothstep(float(0.3), float(0.7), noiseValue);
  const tundraCliff = mix(TUNDRA_CLIFF, TUNDRA_CLIFF_DARK, cliffVariation);
  const forestCliff = mix(FOREST_CLIFF, FOREST_CLIFF_DARK, cliffVariation);
  const canyonCliff = mix(CANYON_CLIFF, CANYON_CLIFF_DARK, cliffVariation);
  const cliffColor = add(
    add(mul(tundraCliff, tW), mul(forestCliff, fW)),
    mul(canyonCliff, dW),
  );
  baseColor = mix(
    baseColor,
    cliffColor,
    smoothstep(float(0.3), float(0.55), slope),
  );

  // === SAND NEAR WATER (stronger in canyon) ===
  const sandBlend = mul(
    smoothstep(float(10.0), float(6.0), height),
    smoothstep(float(0.25), float(0.0), slope),
  );
  const sandStrength = mix(float(0.6), float(0.9), dW);
  baseColor = mix(baseColor, sandYellow, mul(sandBlend, sandStrength));

  // === SHORELINE TRANSITIONS ===
  baseColor = mix(
    baseColor,
    dirtDark,
    mul(smoothstep(float(14.0), float(8.0), height), float(0.4)),
  );
  baseColor = mix(
    baseColor,
    mudBrown,
    mul(smoothstep(float(9.0), float(6.0), height), float(0.7)),
  );
  baseColor = mix(
    baseColor,
    waterEdge,
    mul(smoothstep(float(6.5), float(5.0), height), float(0.9)),
  );

  // === ANTI-DITHERING ===
  const brightnessVar = mul(sub(fineNoise, float(0.5)), float(0.08));
  const colorVar = mul(sub(microNoise, float(0.5)), float(0.04));

  const variedColor = add(
    baseColor,
    vec3(
      add(brightnessVar, colorVar),
      brightnessVar,
      sub(brightnessVar, colorVar),
    ),
  );

  // === ROAD OVERLAY (optional) ===
  // Multi-technique procedural dirt road: noise-distorted edges, height-based
  // blending, multi-layer composition, edge border darkening
  let colorWithRoads: Node = variedColor;
  let roadRoughnessBlend: Node = float(1.0); // terrain default roughness
  if (includeRoadOverlay) {
    const roadInfluence = attribute("roadInfluence", "float");
    const roadUV = vec2(worldPos.x, worldPos.z);

    // --- Multi-scale noise samples ---
    const rn1 = texture(noiseTex, mul(roadUV, float(0.015))).r; // large patches
    const rn2 = texture(noiseTex, mul(roadUV, float(0.045))).r; // medium detail
    const rn3 = texture(noiseTex, mul(roadUV, float(0.12))).r; // fine grain
    const rn4 = texture(noiseTex, mul(roadUV, float(0.3))).r; // micro detail

    // === NOISE-DISTORTED EDGE MASK ===
    // Distort roadInfluence with noise for irregular, natural-looking edges
    const edgeDistortion = add(
      mul(sub(rn2, float(0.5)), float(0.35)), // medium wiggles
      mul(sub(rn3, float(0.5)), float(0.15)), // fine roughness
    );
    const distortedInfluence = add(roadInfluence, edgeDistortion);
    // Sharp-ish smoothstep for defined edges (0.25-0.55 controls edge width)
    const roadMask = smoothstep(float(0.25), float(0.55), distortedInfluence);

    // === MULTI-LAYER ROAD COMPOSITION ===
    // Layer 1: compacted earth base (warm brown, two-tone + micro variation)
    const earthBase = mix(
      vec3(...ROAD_COLORS.earthBaseA),
      vec3(...ROAD_COLORS.earthBaseB),
      smoothstep(
        float(0.3),
        float(0.7),
        add(mul(rn1, float(0.8)), mul(rn4, float(0.2))),
      ),
    );

    // Layer 2: surface dust (lighter sandy patches)
    const dustMask = smoothstep(float(0.55), float(0.75), rn2);
    const withDust = mix(
      earthBase,
      vec3(...ROAD_COLORS.dust),
      mul(dustMask, float(0.35)),
    );

    // Layer 3: gravel highlights + cracks between pebbles
    const gravelMask = smoothstep(float(0.7), float(0.8), rn3);
    const gravelShadow = smoothstep(float(0.15), float(0.25), rn3);
    const withGravel = mix(
      withDust,
      vec3(...ROAD_COLORS.gravel),
      mul(gravelMask, float(0.4)),
    );
    // Darken the cracks between gravel
    const withCracks = mix(
      mul(withGravel, float(0.82)),
      withGravel,
      gravelShadow,
    );

    // Layer 4: wear track darkening (center of road, compacted)
    const wearTrack = mul(mul(roadMask, roadMask), roadMask); // pow(roadMask, 3)
    const wornRoad = mul(withCracks, mix(float(1.0), float(0.88), wearTrack));

    // Layer 5: grass tufts at road margins (edge scatter)
    const edgeZone = mul(
      smoothstep(float(0.15), float(0.4), roadMask),
      smoothstep(float(0.75), float(0.45), roadMask),
    );
    const edgeScatter = mul(edgeZone, smoothstep(float(0.4), float(0.65), rn2));
    const roadDetailColor = mix(
      wornRoad,
      variedColor,
      mul(edgeScatter, float(0.4)),
    );

    // === HEIGHT-BASED BLENDING ===
    // Grass "pokes through" road at edges (taller grass wins over short dirt)
    const grassH = add(mul(noiseValue, float(0.4)), float(0.6));
    const roadH = add(mul(rn3, float(0.3)), float(0.1));
    const grassBl = add(grassH, mul(sub(float(1.0), roadMask), float(2.0)));
    const roadBl = add(roadH, mul(roadMask, float(2.0)));
    const maxH = tslMax(grassBl, roadBl);
    const depthParam = float(0.15);
    const thresh = sub(maxH, depthParam);
    const gW = tslMax(sub(grassBl, thresh), float(0.0));
    const rW = tslMax(sub(roadBl, thresh), float(0.0));
    const totalW = add(gW, rW);
    const heightBlended = div(
      add(mul(variedColor, gW), mul(roadDetailColor, rW)),
      totalW,
    );

    // === EDGE BORDER DARKENING ===
    // Narrow dark band at road edge for readability
    const edgeBand = mul(
      smoothstep(float(0.28), float(0.4), roadMask),
      smoothstep(float(0.55), float(0.42), roadMask),
    );
    const borderDarken = mul(edgeBand, float(0.12));
    colorWithRoads = mul(heightBlended, sub(float(1.0), borderDarken));

    // === ROAD ROUGHNESS ===
    // Gravel rough, compacted center smoother
    const roadRoughGravel = mix(
      float(0.65),
      float(0.92),
      sub(float(1.0), gravelShadow),
    );
    const roadRough = mix(roadRoughGravel, float(0.55), wearTrack);
    roadRoughnessBlend = mix(float(1.0), roadRough, roadMask);
  }

  // === MINE FLOOR OVERLAY (optional) ===
  // AAA multi-layered rocky quarry floor: exposed bedrock, gravel scatter,
  // dirt accumulation, radial center-to-edge gradient, height-based edge
  // blending with surrounding terrain. Matches road overlay quality level.
  let colorWithMines: Node = colorWithRoads;
  let mineRoughnessBlend: Node = roadRoughnessBlend;
  if (includeMineOverlay) {
    const mineInfluence = attribute("mineInfluence", "float");
    const mineBiomeId = attribute("mineBiomeId", "float");

    // Mine-specific noise at scales appropriate for 15-25m mine areas
    const mineUV = vec2(worldPos.x, worldPos.z);
    const mn1 = texture(noiseTex, mul(mineUV, float(0.035))).r; // stone slabs (~28m)
    const mn2 = texture(noiseTex, mul(mineUV, float(0.14))).r; // stone surface (~7m)
    const mn3 = texture(noiseTex, mul(mineUV, float(0.5))).r; // gravel (~2m)
    const mn4 = texture(noiseTex, mul(mineUV, float(1.4))).r; // micro cracks (~0.7m)

    // === NOISE-DISTORTED ORGANIC EDGE ===
    const mineEdgeDistortion = add(
      mul(sub(mn1, float(0.5)), float(0.22)),
      add(
        mul(sub(mn2, float(0.5)), float(0.14)),
        mul(sub(mn3, float(0.5)), float(0.06)),
      ),
    );
    const distortedInfluence = add(mineInfluence, mineEdgeDistortion);

    // Two-tier mask: core (solid floor) and edge (transition zone)
    const coreMask = smoothstep(float(0.42), float(0.68), distortedInfluence);
    const edgeMask = smoothstep(float(0.12), float(0.42), distortedInfluence);

    // === BIOME COLOR PALETTE (from shared MINE_BIOME_PALETTES) ===
    // 0=forest, 1=tundra, 2=desert, 3=mountains, 4=plains, 5=swamp, 6=valley
    const MP = MINE_BIOME_PALETTES;

    // Biome selection masks
    const b = mineBiomeId;
    const isForest = mul(
      smoothstep(float(-0.5), float(0.5), b),
      smoothstep(float(1.5), float(0.5), b),
    );
    const isTundra = mul(
      smoothstep(float(0.5), float(1.5), b),
      smoothstep(float(2.5), float(1.5), b),
    );
    const isDesert = mul(
      smoothstep(float(1.5), float(2.5), b),
      smoothstep(float(3.5), float(2.5), b),
    );
    const isMountain = mul(
      smoothstep(float(2.5), float(3.5), b),
      smoothstep(float(4.5), float(3.5), b),
    );
    const isSwamp = mul(
      smoothstep(float(4.5), float(5.5), b),
      smoothstep(float(6.5), float(5.5), b),
    );
    const isValley = smoothstep(float(5.5), float(6.5), b);

    // Build primary (bedrock)
    let minePrimary: Node = vec3(...MP.plains.primary);
    minePrimary = mix(minePrimary, vec3(...MP.forest.primary), isForest);
    minePrimary = mix(minePrimary, vec3(...MP.tundra.primary), isTundra);
    minePrimary = mix(minePrimary, vec3(...MP.desert.primary), isDesert);
    minePrimary = mix(minePrimary, vec3(...MP.mountains.primary), isMountain);
    minePrimary = mix(minePrimary, vec3(...MP.swamp.primary), isSwamp);
    minePrimary = mix(minePrimary, vec3(...MP.valley.primary), isValley);

    // Build secondary (dark crevices)
    let mineSecondary: Node = vec3(...MP.plains.secondary);
    mineSecondary = mix(mineSecondary, vec3(...MP.forest.secondary), isForest);
    mineSecondary = mix(mineSecondary, vec3(...MP.tundra.secondary), isTundra);
    mineSecondary = mix(mineSecondary, vec3(...MP.desert.secondary), isDesert);
    mineSecondary = mix(
      mineSecondary,
      vec3(...MP.mountains.secondary),
      isMountain,
    );
    mineSecondary = mix(mineSecondary, vec3(...MP.swamp.secondary), isSwamp);
    mineSecondary = mix(mineSecondary, vec3(...MP.valley.secondary), isValley);

    // Build tertiary (gravel highlights)
    let mineTertiary: Node = vec3(...MP.plains.tertiary);
    mineTertiary = mix(mineTertiary, vec3(...MP.forest.tertiary), isForest);
    mineTertiary = mix(mineTertiary, vec3(...MP.tundra.tertiary), isTundra);
    mineTertiary = mix(mineTertiary, vec3(...MP.desert.tertiary), isDesert);
    mineTertiary = mix(
      mineTertiary,
      vec3(...MP.mountains.tertiary),
      isMountain,
    );
    mineTertiary = mix(mineTertiary, vec3(...MP.swamp.tertiary), isSwamp);
    mineTertiary = mix(mineTertiary, vec3(...MP.valley.tertiary), isValley);

    // === LAYER 1: EXPOSED BEDROCK BASE ===
    // Large stone slab pattern — broad patches of primary/secondary
    const slabPattern = smoothstep(float(0.32), float(0.68), mn1);
    const bedrockColor = mix(minePrimary, mineSecondary, slabPattern);

    // === LAYER 2: STONE SURFACE TEXTURE ===
    // Medium-scale surface detail — highlights and shadows on stone faces
    const surfaceLight = smoothstep(float(0.45), float(0.75), mn2);
    const surfaceShadow = smoothstep(float(0.35), float(0.15), mn2);
    const texturedStone = mul(
      mix(bedrockColor, mineTertiary, mul(surfaceLight, float(0.35))),
      mix(float(1.0), float(0.88), surfaceShadow),
    );

    // === LAYER 3: GRAVEL / CRUSHED STONE SCATTER ===
    // High-freq pebble highlights with shadows between stones
    const gravelHighlight = smoothstep(float(0.58), float(0.78), mn3);
    const gravelShadow = smoothstep(float(0.22), float(0.38), mn3);
    const withGravel = mix(
      texturedStone,
      mineTertiary,
      mul(gravelHighlight, float(0.3)),
    );
    // Darken cracks between pebbles
    const withCracks = mix(
      mul(withGravel, float(0.84)),
      withGravel,
      gravelShadow,
    );

    // === LAYER 4: MICRO CRACK / SURFACE IMPERFECTIONS ===
    const crackMask = smoothstep(float(0.42), float(0.58), mn4);
    const withMicroDetail = mul(
      withCracks,
      mix(float(0.92), float(1.02), crackMask),
    );

    // === LAYER 5: RADIAL GRADIENT (center rock → edge gravel/dirt) ===
    // mineInfluence is high at center, low at edges
    const centerWeight = smoothstep(float(0.45), float(0.85), mineInfluence);
    // Edges get more gravel + dirt mixed in
    const dirtBlend = mix(mineSecondary, minePrimary, float(0.4));
    const edgeGravelDirt = mix(dirtBlend, mineTertiary, mn3);
    const radialMixed = mix(
      mix(withMicroDetail, edgeGravelDirt, float(0.4)), // edges: 40% gravel/dirt
      withMicroDetail, // center: pure detailed stone
      centerWeight,
    );

    // === LAYER 6: WEAR / FOOT TRAFFIC (darkened compacted areas) ===
    // Random patches of worn, compacted stone (like well-trodden mine paths)
    const wearPattern = smoothstep(float(0.55), float(0.75), mn1);
    const wearDarken = mul(wearPattern, mul(coreMask, float(0.08)));
    const wornFloor = mul(radialMixed, sub(float(1.0), wearDarken));

    // === LAYER 7: HEIGHT-BASED EDGE BLENDING ===
    // Terrain naturally blends into mine floor at edges (grass/soil competition)
    const terrainH = add(mul(noiseValue, float(0.4)), float(0.6));
    const mineFloorH = add(mul(mn2, float(0.3)), float(0.2));
    const terrainBias = add(
      terrainH,
      mul(sub(float(1.0), edgeMask), float(2.0)),
    );
    const mineBias = add(mineFloorH, mul(edgeMask, float(2.0)));
    const maxBias = tslMax(terrainBias, mineBias);
    const blendDepth = float(0.18);
    const blendThresh = sub(maxBias, blendDepth);
    const tWeight = tslMax(sub(terrainBias, blendThresh), float(0.0));
    const mWeight = tslMax(sub(mineBias, blendThresh), float(0.0));
    const totalWeight = add(tWeight, mWeight);
    const heightBlended = div(
      add(mul(colorWithRoads, tWeight), mul(wornFloor, mWeight)),
      totalWeight,
    );

    // === LAYER 8: EDGE DARKENING BAND ===
    // Narrow dark rim at mine boundary for visual definition (disturbed earth)
    const edgeBand = mul(
      smoothstep(float(0.15), float(0.32), edgeMask),
      smoothstep(float(0.52), float(0.32), edgeMask),
    );
    const borderDarken = mul(edgeBand, float(0.14));
    const mineFloorFinal = mul(heightBlended, sub(float(1.0), borderDarken));

    // Final blend
    colorWithMines = mix(colorWithRoads, mineFloorFinal, edgeMask);

    // === ROUGHNESS ===
    // Exposed rock = rough, gravel = medium-rough, compacted areas slightly smoother
    const rockRoughness = mix(
      float(0.82),
      float(0.96),
      sub(float(1.0), surfaceLight),
    );
    const gravelRoughBlend = mix(
      rockRoughness,
      float(0.88),
      mul(gravelHighlight, float(0.4)),
    );
    const compactSmooth = mul(wearPattern, mul(coreMask, float(0.12)));
    const mineRoughness = sub(gravelRoughBlend, compactSmooth);
    mineRoughnessBlend = mix(roadRoughnessBlend, mineRoughness, edgeMask);
  }

  // === DISTANCE FOG ===
  const baseFogFactor = smoothstep(fogNearSqUniform, fogFarSqUniform, distSq);
  const fogFactor = mul(baseFogFactor, fogEnabledUniform);
  const finalColor = mix(colorWithMines, fogColorUniform, fogFactor);

  // === CREATE MATERIAL ===
  const material = new MeshStandardNodeMaterial();
  material.colorNode = finalColor;
  material.roughnessNode = mineRoughnessBlend;
  material.metalness = 0.0;
  material.side = THREE.FrontSide;
  material.fog = false;

  const terrainUniforms: TerrainUniforms = {
    sunPosition: sunPositionUniform,
    time: timeUniform,
    fogNear: fogNearUniform,
    fogFar: fogFarUniform,
    fogNearSq: fogNearSqUniform,
    fogFarSq: fogFarSqUniform,
    fogColor: fogColorUniform,
    fogEnabled: fogEnabledUniform,
  };

  const result = material as typeof material & {
    terrainUniforms: TerrainUniforms;
  };
  result.terrainUniforms = terrainUniforms;
  return result;
}

/**
 * Update fog uniforms
 */
export function updateTerrainFog(
  uniforms: TerrainUniforms,
  near: number,
  far: number,
  color?: THREE.Color,
): void {
  uniforms.fogNear.value = near;
  uniforms.fogFar.value = far;
  uniforms.fogNearSq.value = near * near;
  uniforms.fogFarSq.value = far * far;
  if (color) {
    (uniforms.fogColor.value as THREE.Vector3).set(color.r, color.g, color.b);
  }
}

/**
 * Enable/disable fog
 */
export function setTerrainFogEnabled(
  uniforms: TerrainUniforms,
  enabled: boolean,
): void {
  uniforms.fogEnabled.value = enabled ? 1.0 : 0.0;
}
