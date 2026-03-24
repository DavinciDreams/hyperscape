/**
 * TerrainShader - TSL Node Material for stylized terrain
 * Biome textures via triplanar/top-down mapping, blended by height/slope/noise
 *
 * **SHARED CODE:**
 * The core terrain material is also available in @hyperscape/procgen TerrainGen module.
 * For standalone terrain rendering (Asset Forge, viewers), use:
 *   import { TerrainGen } from '@hyperscape/procgen';
 *   const material = TerrainGen.createTerrainMaterial();
 *
 * This file (TerrainShader.ts) includes additional game-specific integrations
 * like heightmap support, compute shader vertex colors, and road influence.
 */

import * as THREE from "../../../extras/three/three";
import {
  MeshStandardNodeMaterial,
  texture,
  positionWorld,
  normalWorld,
  screenUV,
  cameraPosition,
  attribute,
  uniform,
  float,
  vec2,
  vec3,
  vec4,
  add,
  sub,
  mul,
  div,
  dot,
  mix,
  smoothstep,
  step,
  abs,
  sin,
  cos,
  pow,
  clamp,
  max,
  floor,
  normalize,
  Fn,
  output,
  type ShaderNode,
} from "../../../extras/three/three";
import { getRoadInfluenceTextureState } from "./RoadInfluenceMask";
import { getLamppostLightTextureState } from "./LamppostLightMask";
import { FOG_NEAR_SQ, FOG_FAR_SQ, fogRenderTarget } from "./FogConfig";
import { SUN_LIGHT, SUN_SHADE } from "./LightingConfig";

export const TERRAIN_SHADER_CONSTANTS = {
  TRIPLANAR_SCALE: 0.5,
  SNOW_HEIGHT: 90.0,
  NOISE_SCALE: 0.0008,
  DIRT_THRESHOLD: 0.5,
  LOD_FULL_DETAIL: 100.0,
  LOD_MEDIUM_DETAIL: 200.0,
  WATER_LEVEL: 5.0,
  DISTORT_NOISE_SCALE: 0.067,
  VARIATION_NOISE_SCALE: 0.0015,
  ROCK_DISTORT_STRENGTH: 0.5,
  HEIGHT_DISTORT_STRENGTH: 8.0,
  SATURATION_BOOST: 1.35,
};

/**
 * Half-lambert anime shade: wraps N·L to [0,1] for soft fill, then
 * tints the shadow side with a cool blue-teal hue shift (Genshin-style).
 * Applied to albedo before PBR so the colour shift survives lighting.
 */
export const TERRAIN_SHADE = {
  TINT_COLOR: SUN_SHADE.TINT_COLOR,
  STRENGTH: 0.7,
  FRESNEL_POWER: 3.0,
  FRESNEL_INTENSITY: 0.2,
};

const TERRAIN_TEX_TILE = 0.3;
const TERRAIN_TEX_DIR = "textures/terrain-biomes";

const TERRAIN_BIOME_TEXTURES = {
  grass: {
    file: "grass.png",
    fallback: [0.3, 0.58, 0.15] as [number, number, number],
  },
  dirt: {
    file: "dirt.png",
    fallback: [0.35, 0.24, 0.12] as [number, number, number],
  },
  cliff: {
    file: "cliff.png",
    fallback: [0.4, 0.38, 0.32] as [number, number, number],
  },
  desertGrass: {
    file: "desertGrass.png",
    fallback: [0.82, 0.52, 0.28] as [number, number, number],
  },
  desertDirt: {
    file: "desertDirt.png",
    fallback: [0.62, 0.28, 0.15] as [number, number, number],
  },
  desertCliff: {
    file: "desertDirt.png",
    fallback: [0.72, 0.38, 0.18] as [number, number, number],
  },
  snowGrass: {
    file: "snowgrass.png",
    fallback: [0.78, 0.82, 0.85] as [number, number, number],
  },
  snowDirt: {
    file: "snowdirt.png",
    fallback: [0.55, 0.55, 0.58] as [number, number, number],
  },
  snowCliff: {
    file: "snowdirt.png",
    fallback: [0.5, 0.52, 0.56] as [number, number, number],
  },
};

function getCdnUrl(): string {
  if (typeof window !== "undefined") {
    const w = window as Window & { __CDN_URL?: string };
    if (w.__CDN_URL) return w.__CDN_URL;
    const meta = import.meta as ImportMeta & {
      env?: Record<string, string>;
    };
    if (meta.env?.PUBLIC_CDN_URL) return meta.env.PUBLIC_CDN_URL;
  }
  return "http://localhost:5555/game-assets";
}

function createTerrainBiomeTex(
  url: string,
  pr: number,
  pg: number,
  pb: number,
): THREE.Texture {
  let tex: THREE.Texture;
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 2;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = `rgb(${Math.round(pr * 255)},${Math.round(pg * 255)},${Math.round(pb * 255)})`;
    ctx.fillRect(0, 0, 2, 2);
    tex = new THREE.Texture(canvas);
  } else {
    const data = new Uint8Array([
      Math.round(pr * 255),
      Math.round(pg * 255),
      Math.round(pb * 255),
      255,
    ]);
    tex = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
  }
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  if (typeof window !== "undefined") {
    new THREE.TextureLoader().load(
      url,
      (loaded) => {
        tex.image = loaded.image;
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.needsUpdate = true;
      },
      undefined,
      (err) =>
        console.warn(
          `[TerrainShader] Failed to load ${url.split("/").pop()}:`,
          err,
        ),
    );
  }
  return tex;
}

// ============================================================================
// SHARED TERRAIN BASE COLOR (used by terrain shader AND tree ground-blend)
// ============================================================================

// --- Tundra palette: snowy white-blue with frozen grey stone ---
const TUNDRA_GRASS = vec3(0.78, 0.82, 0.85);
const TUNDRA_GRASS_DARK = vec3(0.65, 0.7, 0.75);
const TUNDRA_GRASS_HIGH = vec3(0.68, 0.72, 0.78);
const TUNDRA_VARIATION = vec3(0.6, 0.64, 0.7);
const TUNDRA_DIRT = vec3(0.55, 0.55, 0.58);
const TUNDRA_DIRT_DARK = vec3(0.42, 0.42, 0.45);
const TUNDRA_CLIFF = vec3(0.5, 0.52, 0.56);
const TUNDRA_CLIFF_DARK = vec3(0.38, 0.4, 0.44);

// --- Forest palette: vibrant energetic greens with warm brown earth ---
const FOREST_GRASS = vec3(0.3, 0.58, 0.15);
const FOREST_GRASS_DARK = vec3(0.18, 0.42, 0.08);
const FOREST_GRASS_HIGH = vec3(0.24, 0.45, 0.18);
const FOREST_VARIATION = vec3(0.15, 0.35, 0.1);
const FOREST_DIRT = vec3(0.35, 0.24, 0.12);
const FOREST_DIRT_DARK = vec3(0.22, 0.15, 0.08);
const FOREST_CLIFF = vec3(0.4, 0.38, 0.32);
const FOREST_CLIFF_DARK = vec3(0.28, 0.26, 0.22);

// --- Canyon palette: red-orange sand with deep crimson rock ---
const CANYON_SAND = vec3(0.82, 0.52, 0.28);
const CANYON_SAND_DARK = vec3(0.72, 0.42, 0.2);
const CANYON_SAND_HIGH = vec3(0.62, 0.38, 0.22);
const CANYON_VARIATION = vec3(0.58, 0.34, 0.16);
const CANYON_ROCK = vec3(0.62, 0.28, 0.15);
const CANYON_ROCK_DARK = vec3(0.48, 0.2, 0.1);
const CANYON_CLIFF = vec3(0.72, 0.38, 0.18);
const CANYON_CLIFF_DARK = vec3(0.55, 0.25, 0.12);

const CLIFF_TINT = vec3(0.28, 0.3, 0.36);

// Legacy aliases used by road overlay and other shader sections (default = forest)
const GRASS_GREEN = FOREST_GRASS;
const GRASS_DARK = FOREST_GRASS_DARK;
const DIRT_BROWN = FOREST_DIRT;
const DIRT_DARK = FOREST_DIRT_DARK;
const ROCK_GRAY = vec3(0.45, 0.42, 0.38);
const ROCK_DARK = vec3(0.3, 0.28, 0.25);
const SAND_YELLOW = vec3(0.7, 0.6, 0.38);
const SNOW_WHITE = vec3(0.92, 0.94, 0.96);
const MUD_BROWN = vec3(0.18, 0.12, 0.08);
const WATER_EDGE = vec3(0.08, 0.06, 0.04);

/**
 * Compute the procedural terrain base color at a world position.
 * Uses noise-distorted coordinate mapping (ported from reference) for organic
 * cliff/dirt/shoreline boundaries instead of clean smoothstep bands.
 */
export function computeTerrainBaseColor(
  height: any,
  slope: any,
  noiseVal: any,
  noiseVal2: any,
  distortNoise: any,
  variationNoise: any,
  forestWeight?: any,
  canyonWeight?: any,
) {
  const fW = forestWeight ?? float(0.0);
  const dW = canyonWeight ?? float(0.0);
  const tW = sub(float(1.0), add(fW, dW));

  // Distorted slope: offset normalY by noise for organic cliff edges
  const distortedNY = add(
    sub(float(1.0), slope),
    mul(
      sub(distortNoise, float(0.5)),
      float(TERRAIN_SHADER_CONSTANTS.ROCK_DISTORT_STRENGTH),
    ),
  );
  const dSlope = sub(float(1.0), distortedNY);

  // Distorted height for organic sand/shoreline boundaries
  const dHeight = add(
    height,
    mul(
      sub(distortNoise, float(0.5)),
      float(TERRAIN_SHADER_CONSTANTS.HEIGHT_DISTORT_STRENGTH),
    ),
  );

  // Biome-blended grass
  const grassVariation = smoothstep(float(0.4), float(0.6), noiseVal2);
  const tundraGrass = mix(TUNDRA_GRASS, TUNDRA_GRASS_DARK, grassVariation);
  const forestGrass = mix(FOREST_GRASS, FOREST_GRASS_DARK, grassVariation);
  const canyonGrass = mix(CANYON_SAND, CANYON_SAND_DARK, grassVariation);
  let c: ShaderNode = add(
    add(mul(tundraGrass, tW), mul(forestGrass, fW)),
    mul(canyonGrass, dW),
  );

  // Height-based ground color gradient (subtle shift at altitude)
  const heightGrad = mul(
    smoothstep(float(25.0), float(55.0), height),
    float(0.3),
  );
  const grassHigh = add(
    add(mul(TUNDRA_GRASS_HIGH, tW), mul(FOREST_GRASS_HIGH, fW)),
    mul(CANYON_SAND_HIGH, dW),
  );
  c = mix(c, grassHigh, heightGrad);

  // Low-frequency ground variation overlay (patchy color areas)
  const gVar = clamp(
    pow(add(variationNoise, float(0.3)), float(5.0)),
    float(0.0),
    float(1.0),
  );
  const varColor = add(
    add(mul(TUNDRA_VARIATION, tW), mul(FOREST_VARIATION, fW)),
    mul(CANYON_VARIATION, dW),
  );
  c = mix(c, varColor, mul(gVar, float(0.25)));

  // Biome-blended dirt
  const dirtVariation = smoothstep(float(0.3), float(0.7), noiseVal2);
  const tundraDirt = mix(TUNDRA_DIRT, TUNDRA_DIRT_DARK, dirtVariation);
  const forestDirt = mix(FOREST_DIRT, FOREST_DIRT_DARK, dirtVariation);
  const canyonDirt = mix(CANYON_ROCK, CANYON_ROCK_DARK, dirtVariation);
  const dirtColor = add(
    add(mul(tundraDirt, tW), mul(forestDirt, fW)),
    mul(canyonDirt, dW),
  );

  // Per-biome cliff color with rock texture variation
  const cliffVariation = smoothstep(float(0.3), float(0.7), noiseVal);
  const tundraCliff = mix(TUNDRA_CLIFF, TUNDRA_CLIFF_DARK, cliffVariation);
  const forestCliff = mix(FOREST_CLIFF, FOREST_CLIFF_DARK, cliffVariation);
  const canyonCliff = mix(CANYON_CLIFF, CANYON_CLIFF_DARK, cliffVariation);
  let cliffColor: any = add(
    add(mul(tundraCliff, tW), mul(forestCliff, fW)),
    mul(canyonCliff, dW),
  );
  const rockTexVar = mul(pow(distortNoise, float(0.5)), float(0.3));
  cliffColor = mix(cliffColor, CLIFF_TINT, rockTexVar);

  // Noise-driven dirt patches on flat areas (using distorted slope)
  const nDirtFactor = mul(
    smoothstep(
      float(TERRAIN_SHADER_CONSTANTS.DIRT_THRESHOLD - 0.05),
      float(TERRAIN_SHADER_CONSTANTS.DIRT_THRESHOLD + 0.15),
      noiseVal,
    ),
    smoothstep(float(0.3), float(0.05), dSlope),
  );
  c = mix(c, dirtColor, nDirtFactor);

  // Dirt on moderate slopes (bell curve, using distorted slope)
  const dirtSlopeF = mul(
    smoothstep(float(0.15), float(0.4), dSlope),
    smoothstep(float(0.6), float(0.3), dSlope),
  );
  c = mix(c, dirtColor, mul(dirtSlopeF, float(0.6)));

  // Cliff on steep slopes (using distorted slope)
  c = mix(c, cliffColor, smoothstep(float(0.3), float(0.55), dSlope));

  // Sand near water (flat areas, stronger in canyon — using distorted height)
  const sandBlend = mul(
    smoothstep(float(18.0), float(12.0), dHeight),
    smoothstep(float(0.25), float(0.0), slope),
  );
  const sandStrength = mix(float(0.6), float(0.9), dW);
  c = mix(c, SAND_YELLOW, mul(sandBlend, sandStrength));

  // Shoreline transitions (using distorted height)
  c = mix(
    c,
    DIRT_DARK,
    mul(smoothstep(float(22.0), float(14.0), dHeight), float(0.4)),
  );
  c = mix(
    c,
    MUD_BROWN,
    mul(smoothstep(float(15.0), float(10.0), dHeight), float(0.7)),
  );
  c = mix(
    c,
    WATER_EDGE,
    mul(smoothstep(float(11.0), float(7.0), dHeight), float(0.9)),
  );

  // Saturation boost: pull color away from grey
  const luma = dot(c, vec3(0.299, 0.587, 0.114));
  const grey = vec3(luma, luma, luma);
  c = mix(grey, c, float(TERRAIN_SHADER_CONSTANTS.SATURATION_BOOST));

  return c;
}

// ============================================================================
// PERLIN NOISE TEXTURE GENERATION
// ============================================================================

// Cached noise texture - generated once, reused everywhere
let cachedNoiseTexture: THREE.DataTexture | null = null;
const NOISE_SIZE = 256; // Texture resolution

// Simple Perlin-like noise implementation
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

// Seeded permutation table for deterministic noise
function createPermutation(seed: number): number[] {
  const p: number[] = [];
  for (let i = 0; i < 256; i++) p[i] = i;

  // Fisher-Yates shuffle with seed
  let s = seed;
  for (let i = 255; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [p[i], p[j]] = [p[j], p[i]];
  }

  // Double the permutation table
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

// Multi-octave fractal noise (non-seamless version, kept for reference)
function _fbm(
  x: number,
  y: number,
  perm: number[],
  octaves: number = 4,
): number {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let maxValue = 0;

  for (let i = 0; i < octaves; i++) {
    value += amplitude * perlin2D(x * frequency, y * frequency, perm);
    maxValue += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }

  return value / maxValue;
}

/**
 * Seamless 2D Perlin noise using proper torus mapping
 * Maps the 2D plane onto a 4D torus to eliminate seams
 */
function seamlessPerlin2D(x: number, y: number, perm: number[]): number {
  // Map 2D coordinates to 4D torus
  // This creates truly seamless tiling
  const TWO_PI = Math.PI * 2;
  const radius = 1.0;

  // Convert to angles (0-1 maps to 0-2PI)
  const angleX = x * TWO_PI;
  const angleY = y * TWO_PI;

  // Map to 4D coordinates on a torus
  const nx = Math.cos(angleX) * radius;
  const ny = Math.sin(angleX) * radius;
  const nz = Math.cos(angleY) * radius;
  const nw = Math.sin(angleY) * radius;

  // Sample 2D noise at 4 different 2D positions and blend
  // This simulates 4D noise sampling using 2D noise
  const n1 = perlin2D(nx * 4 + 100, nz * 4 + 100, perm);
  const n2 = perlin2D(ny * 4 + 200, nw * 4 + 200, perm);
  const n3 = perlin2D(nx * 4 + ny * 4 + 300, nz * 4 + nw * 4 + 300, perm);

  return (n1 + n2 + n3) / 3;
}

/**
 * Multi-octave seamless fractal noise
 */
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
    // Each octave uses a different offset to add variation
    const ox = x + i * 17.3;
    const oy = y + i * 31.7;
    value += amplitude * seamlessPerlin2D(ox, oy, perm);
    maxValue += amplitude;
    amplitude *= 0.5;
  }

  return value / maxValue;
}

/**
 * Generate a Perlin noise texture - call once at startup
 * Returns a DataTexture that tiles seamlessly
 */
export function generateNoiseTexture(seed: number = 12345): THREE.DataTexture {
  if (cachedNoiseTexture) return cachedNoiseTexture;

  const perm = createPermutation(seed);
  const data = new Uint8Array(NOISE_SIZE * NOISE_SIZE * 4);

  for (let y = 0; y < NOISE_SIZE; y++) {
    for (let x = 0; x < NOISE_SIZE; x++) {
      // Normalize to 0-1 range
      const nx = x / NOISE_SIZE;
      const ny = y / NOISE_SIZE;

      // Use seamless noise that tiles perfectly
      const noise = seamlessFbm(nx, ny, perm, 4);

      // Normalize from [-1, 1] to [0, 1]
      const value = (noise + 1) * 0.5;
      const byte = Math.floor(Math.max(0, Math.min(255, value * 255)));

      const idx = (y * NOISE_SIZE + x) * 4;
      data[idx] = byte; // R
      data[idx + 1] = byte; // G
      data[idx + 2] = byte; // B
      data[idx + 3] = 255; // A
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
  console.log("[TerrainShader] Generated seamless Perlin noise texture");
  return tex;
}

/**
 * Get the cached noise texture (for GrassSystem alignment)
 */
export function getNoiseTexture(): THREE.DataTexture | null {
  return cachedNoiseTexture;
}

// Cached permutation for CPU sampling
let cachedPerm: number[] | null = null;

/**
 * Sample noise at world position (for CPU-side grass placement)
 * Returns 0-1 value matching EXACTLY what the shader samples from the texture
 */
export function sampleNoiseAtPosition(
  worldX: number,
  worldZ: number,
  seed: number = 12345,
): number {
  // Ensure permutation is created
  if (!cachedPerm) {
    cachedPerm = createPermutation(seed);
  }

  // Calculate UV the same way the shader does
  const u = worldX * TERRAIN_SHADER_CONSTANTS.NOISE_SCALE;
  const v = worldZ * TERRAIN_SHADER_CONSTANTS.NOISE_SCALE;

  // The texture tiles, so wrap to 0-1
  const wrappedU = u - Math.floor(u);
  const wrappedV = v - Math.floor(v);

  // Sample the same seamless noise function used to generate the texture
  const noise = seamlessFbm(wrappedU, wrappedV, cachedPerm, 4);
  return (noise + 1) * 0.5;
}

/**
 * Check if terrain at a given position should display as grass (green).
 * Uses the same logic as the terrain shader to determine surface type.
 *
 * Grass appears when:
 * - Not in a dirt patch (noise-based brown areas)
 * - Not on steep slopes (dirt/rock)
 * - Not in natural shoreline zone (near water level)
 * - Below snow line (height < 45)
 *
 * Note: Flat zones (buildings, arenas) should always have grass regardless of height,
 * since they're artificial surfaces. Detected by very low slope.
 *
 * @param worldX - World X position
 * @param worldZ - World Z position
 * @param height - Terrain height at position (Y value)
 * @param slope - Terrain slope at position (0-1, where 0 is flat, 1 is vertical)
 * @param seed - Noise seed (default 12345)
 * @returns Value from 0-1 indicating how "grassy" the terrain is (1 = full grass, 0 = no grass)
 */
export function getGrassiness(
  _worldX: number,
  _worldZ: number,
  height: number,
  slope: number,
  _seed: number = 12345,
): number {
  // SIMPLIFIED: Grow grass almost everywhere except steep rock and snow.
  // The terrain shader handles visual color blending (grass/dirt), so we don't
  // need to match it exactly. Grass should appear on ALL green-ish terrain.
  //
  // Only exclude:
  // 1. Very steep slopes (rock faces) - slope > 0.6
  // 2. Snow at high elevation - height > 45m
  //
  // DO NOT exclude based on:
  // - Dirt patches (they're brownish-green blend, still have grass)
  // - Shoreline (complex, inconsistent water levels)
  // - Moderate slopes (grass grows on hills)

  let grassiness = 1.0;

  // === VERY STEEP SLOPES = ROCK ===
  // Only exclude on truly vertical rock faces (slope > 0.6)
  // Gentler slopes (up to 0.6) should have grass
  if (slope > 0.6) {
    const rockFactor = smoothstepCPU(0.6, 0.8, slope);
    grassiness -= rockFactor;
  }

  // Clamp to 0-1
  return Math.max(0, Math.min(1, grassiness));
}

/**
 * CPU-side smoothstep matching GLSL behavior
 */
function smoothstepCPU(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Calculate terrain slope from height samples.
 * Uses central difference method with 4 neighboring samples.
 *
 * @param getHeight - Function to get terrain height at (x, z)
 * @param x - World X position
 * @param z - World Z position
 * @param sampleDistance - Distance between height samples (default 1.0m)
 * @returns Slope value from 0 (flat) to 1 (vertical)
 */
export function calculateSlope(
  getHeight: (x: number, z: number) => number,
  x: number,
  z: number,
  sampleDistance: number = 1.0,
): number {
  // Sample heights at neighboring points
  const hPosX = getHeight(x + sampleDistance, z);
  const hNegX = getHeight(x - sampleDistance, z);
  const hPosZ = getHeight(x, z + sampleDistance);
  const hNegZ = getHeight(x, z - sampleDistance);

  // Calculate gradients using central difference
  const dhdx = (hPosX - hNegX) / (2 * sampleDistance);
  const dhdz = (hPosZ - hNegZ) / (2 * sampleDistance);

  // Gradient magnitude
  const gradientMag = Math.sqrt(dhdx * dhdx + dhdz * dhdz);

  // Convert to slope (matching shader's: slope = 1 - abs(normal.y))
  // normal.y = 1 / sqrt(1 + gradientMag^2)
  const normalY = 1 / Math.sqrt(1 + gradientMag * gradientMag);
  const slope = 1 - Math.abs(normalY);

  return slope;
}

// ============================================================================
// TERRAIN MATERIAL - OSRS Style (No Textures)
// ============================================================================

/**
 * Maximum number of vertex lights supported
 * Keep low for performance - vertex lighting is cheap but not free
 */
export const MAX_VERTEX_LIGHTS = 8;

export type TerrainUniforms = {
  sunPosition: { value: THREE.Vector3 };
  sunDirection: { value: THREE.Vector3 };
  time: { value: number };
  fogEnabled: { value: number }; // 1.0 = fog enabled, 0.0 = fog disabled (for minimap)
  // Vertex lighting uniforms (lampposts, etc.)
  vertexLightPositions: { value: THREE.Vector3 }[]; // Array of 8 light positions
  vertexLightColors: { value: THREE.Vector3 }[]; // Array of 8 light colors
  vertexLightParams: { value: THREE.Vector2 }[]; // Array of 8 (intensity, range) pairs
};

/**
 * Vertex light data for updating terrain lighting
 */
export interface VertexLight {
  position: THREE.Vector3;
  color: THREE.Color;
  intensity: number;
  range: number;
}

/**
 * Update terrain vertex lights from lamppost positions
 * Call this when player moves to update nearby lights
 */
export function updateTerrainVertexLights(
  uniforms: TerrainUniforms,
  lights: VertexLight[],
): void {
  const count = Math.min(lights.length, MAX_VERTEX_LIGHTS);

  for (let i = 0; i < MAX_VERTEX_LIGHTS; i++) {
    if (i < count) {
      const light = lights[i];
      uniforms.vertexLightPositions[i].value.copy(light.position);
      uniforms.vertexLightColors[i].value.set(
        light.color.r,
        light.color.g,
        light.color.b,
      );
      uniforms.vertexLightParams[i].value.set(light.intensity, light.range);
    } else {
      // Disable unused lights by setting intensity to 0
      uniforms.vertexLightParams[i].value.set(0, 1);
    }
  }
}

/**
 * Stylized terrain material with biome texture sampling
 * Grass/dirt textures use top-down projection; cliff textures use triplanar mapping
 */
export function createTerrainMaterial(): THREE.Material & {
  terrainUniforms: TerrainUniforms;
} {
  // Ensure noise texture is generated (still used for dirt patch variation)
  const noiseTex = generateNoiseTexture();

  const sunPositionUniform = uniform(vec3(100, 100, 100));
  const sunDirectionUniform = uniform(vec3(...SUN_LIGHT.DEFAULT_DIRECTION));
  const timeUniform = uniform(float(0));
  const noiseScale = uniform(float(TERRAIN_SHADER_CONSTANTS.NOISE_SCALE));

  // Sky-color fog: uses the shared render target texture (updated in-place by SkySystem)
  const fogTexNode = texture(fogRenderTarget.texture, screenUV);
  const fogEnabledUniform = uniform(float(1.0));

  // ============================================================================
  // VERTEX LIGHTING UNIFORMS (for lampposts, torches, etc.)
  // ============================================================================
  // Create arrays of uniforms for each light
  const vertexLightPositionUniforms: ReturnType<typeof uniform>[] = [];
  const vertexLightColorUniforms: ReturnType<typeof uniform>[] = [];
  const vertexLightParamUniforms: ReturnType<typeof uniform>[] = []; // (intensity, range)

  for (let i = 0; i < MAX_VERTEX_LIGHTS; i++) {
    vertexLightPositionUniforms.push(uniform(vec3(0, 0, 0)));
    vertexLightColorUniforms.push(uniform(vec3(1, 0.9, 0.6))); // Warm lamplight default
    vertexLightParamUniforms.push(uniform(vec2(0, 15))); // intensity=0 (off), range=15m
  }

  const worldPos = positionWorld;
  const worldNormal = normalWorld;
  const height = worldPos.y;
  const slope = sub(float(1.0), abs(worldNormal.y));

  // ============================================================================
  // TERRAIN BASE COLOR (shared function + anti-dithering noise)
  // ============================================================================

  const toCamera = sub(worldPos, cameraPosition);
  const distSq = dot(toCamera, toCamera);

  // Sample Perlin noise
  const noiseUV = mul(vec2(worldPos.x, worldPos.z), noiseScale);
  const noiseValue = texture(noiseTex, noiseUV).r;
  const noiseValue2 = add(
    mul(sin(mul(noiseValue, float(6.28))), float(0.3)),
    float(0.5),
  );

  // Distortion noise (high-freq) for organic cliff/shoreline edges
  const distortNoiseUV = mul(
    vec2(worldPos.x, worldPos.z),
    float(TERRAIN_SHADER_CONSTANTS.DISTORT_NOISE_SCALE),
  );
  const distortNoise = texture(noiseTex, distortNoiseUV).r;

  // Variation noise (low-freq) for large-scale ground color patches
  const variationNoiseUV = mul(
    vec2(worldPos.x, worldPos.z),
    float(TERRAIN_SHADER_CONSTANTS.VARIATION_NOISE_SCALE),
  );
  const variationNoise = texture(noiseTex, variationNoiseUV).r;

  // Fine detail noise (LOD-gated)
  const closeEnough = smoothstep(float(12000.0), float(8000.0), distSq);
  const noiseUV3 = mul(vec2(worldPos.x, worldPos.z), float(0.12));
  const fineNoiseSample = texture(noiseTex, noiseUV3).r;
  const fineNoise = mix(float(0.5), fineNoiseSample, closeEnough);
  const microNoise = add(
    mul(cos(mul(noiseValue, float(12.56))), float(0.2)),
    float(0.5),
  );

  // Biome weight attributes (computed per-vertex by QuadChunkWorker)
  const biomeForestW = attribute("biomeForestWeight", "float");
  const biomeCanyonW = attribute("biomeCanyonWeight", "float");
  const fW = biomeForestW;
  const dW = biomeCanyonW;
  const tW = sub(float(1.0), add(fW, dW));

  // --- TERRAIN BIOME TEXTURES ---
  const texBase = `${getCdnUrl()}/${TERRAIN_TEX_DIR}`;
  const loadBiomeTex = (key: keyof typeof TERRAIN_BIOME_TEXTURES) => {
    const cfg = TERRAIN_BIOME_TEXTURES[key];
    return createTerrainBiomeTex(`${texBase}/${cfg.file}`, ...cfg.fallback);
  };

  const tGrass = loadBiomeTex("grass");
  const tDirt = loadBiomeTex("dirt");
  const tCliff = loadBiomeTex("cliff");
  const tDesertGrass = loadBiomeTex("desertGrass");
  const tDesertDirt = loadBiomeTex("desertDirt");
  const tDesertCliff = loadBiomeTex("desertCliff");
  const tSnowGrass = loadBiomeTex("snowGrass");
  const tSnowDirt = loadBiomeTex("snowDirt");
  const tSnowCliff = loadBiomeTex("snowCliff");

  // UV projections — dual-scale blend to break visible texture tiling.
  // Sample at primary scale and a non-harmonic secondary scale (×0.27),
  // blend 50/50 with noise so the two grids never visually align.
  const tileScale = float(TERRAIN_TEX_TILE);
  const tileScale2 = float(TERRAIN_TEX_TILE * 0.13);
  const uvFlat = mul(vec2(worldPos.x, worldPos.z), tileScale);
  const uvFront = mul(vec2(worldPos.x, worldPos.y), tileScale);
  const uvSide = mul(vec2(worldPos.z, worldPos.y), tileScale);
  const uvFlat2 = mul(vec2(worldPos.x, worldPos.z), tileScale2);
  const uvFront2 = mul(vec2(worldPos.x, worldPos.y), tileScale2);
  const uvSide2 = mul(vec2(worldPos.z, worldPos.y), tileScale2);
  const tileBlend = smoothstep(float(0.2), float(0.8), noiseValue);

  // Triplanar blend weights for cliff textures (^4 sharpening)
  const tnx = abs(worldNormal.x);
  const tny = abs(worldNormal.y);
  const tnz = abs(worldNormal.z);
  const tw4x = mul(mul(tnx, tnx), mul(tnx, tnx));
  const tw4y = mul(mul(tny, tny), mul(tny, tny));
  const tw4z = mul(mul(tnz, tnz), mul(tnz, tnz));
  const twSum = add(add(tw4x, tw4y), tw4z);
  const twX = div(tw4x, twSum);
  const twY = div(tw4y, twSum);
  const twZ = div(tw4z, twSum);

  // Flat textures — blend two scales per biome texture
  const dualFlat = (t: THREE.Texture) =>
    mix(texture(t, uvFlat).rgb, texture(t, uvFlat2).rgb, tileBlend);
  const sGrass = dualFlat(tGrass);
  const sDirt = dualFlat(tDirt);
  const sDesertGrass = dualFlat(tDesertGrass);
  const sDesertDirt = dualFlat(tDesertDirt);
  const sSnowGrass = dualFlat(tSnowGrass);
  const sSnowDirt = dualFlat(tSnowDirt);

  // Cliff textures — triplanar with dual-scale blend
  const triCliff = (t: THREE.Texture) => {
    const s1 = add(
      add(mul(texture(t, uvFlat).rgb, twY), mul(texture(t, uvSide).rgb, twX)),
      mul(texture(t, uvFront).rgb, twZ),
    );
    const s2 = add(
      add(mul(texture(t, uvFlat2).rgb, twY), mul(texture(t, uvSide2).rgb, twX)),
      mul(texture(t, uvFront2).rgb, twZ),
    );
    return mix(s1, s2, tileBlend);
  };
  const sCliff = triCliff(tCliff);
  const sDesertCliff = triCliff(tDesertCliff);
  const sSnowCliff = triCliff(tSnowCliff);

  const TEX_DARKEN = float(0.65);

  // Distorted slope: offset normalY by noise for organic cliff edges
  const distortedNY = add(
    abs(worldNormal.y),
    mul(
      sub(distortNoise, float(0.5)),
      float(TERRAIN_SHADER_CONSTANTS.ROCK_DISTORT_STRENGTH),
    ),
  );
  const dSlope = sub(float(1.0), distortedNY);

  // Distorted height for organic sand/shoreline boundaries
  const dHeight = add(
    height,
    mul(
      sub(distortNoise, float(0.5)),
      float(TERRAIN_SHADER_CONSTANTS.HEIGHT_DISTORT_STRENGTH),
    ),
  );

  // Biome-blended grass (textured)
  const grassVar = smoothstep(float(0.4), float(0.6), noiseValue2);
  const tundraGrassC = mix(sSnowGrass, mul(sSnowGrass, TEX_DARKEN), grassVar);
  const forestGrassC = mix(sGrass, mul(sGrass, TEX_DARKEN), grassVar);
  const canyonGrassC = mix(
    sDesertGrass,
    mul(sDesertGrass, TEX_DARKEN),
    grassVar,
  );
  let baseColor: ShaderNode = add(
    add(mul(tundraGrassC, tW), mul(forestGrassC, fW)),
    mul(canyonGrassC, dW),
  );

  // Height-based ground color gradient (subtle shift at altitude)
  const heightGrad = mul(
    smoothstep(float(25.0), float(55.0), height),
    float(0.3),
  );
  const grassHighC = add(
    add(mul(TUNDRA_GRASS_HIGH, tW), mul(FOREST_GRASS_HIGH, fW)),
    mul(CANYON_SAND_HIGH, dW),
  );
  baseColor = mix(baseColor, grassHighC, heightGrad);

  // Low-frequency ground variation overlay (patchy color areas)
  const gVariation = clamp(
    pow(add(variationNoise, float(0.3)), float(5.0)),
    float(0.0),
    float(1.0),
  );
  const varColorC = add(
    add(mul(TUNDRA_VARIATION, tW), mul(FOREST_VARIATION, fW)),
    mul(CANYON_VARIATION, dW),
  );
  baseColor = mix(baseColor, varColorC, mul(gVariation, float(0.25)));

  // Biome-blended dirt
  const dirtVar = smoothstep(float(0.3), float(0.7), noiseValue2);
  const tundraDirtC = mix(sSnowDirt, mul(sSnowDirt, TEX_DARKEN), dirtVar);
  const forestDirtC = mix(sDirt, mul(sDirt, TEX_DARKEN), dirtVar);
  const canyonDirtC = mix(sDesertDirt, mul(sDesertDirt, TEX_DARKEN), dirtVar);
  const dirtColor = add(
    add(mul(tundraDirtC, tW), mul(forestDirtC, fW)),
    mul(canyonDirtC, dW),
  );

  // Per-biome cliff with rock texture variation
  const cliffVar = smoothstep(float(0.3), float(0.7), noiseValue);
  const tundraCliffC = mix(sSnowCliff, mul(sSnowCliff, TEX_DARKEN), cliffVar);
  const forestCliffC = mix(sCliff, mul(sCliff, TEX_DARKEN), cliffVar);
  const canyonCliffC = mix(
    sDesertCliff,
    mul(sDesertCliff, TEX_DARKEN),
    cliffVar,
  );
  let cliffColor: any = add(
    add(mul(tundraCliffC, tW), mul(forestCliffC, fW)),
    mul(canyonCliffC, dW),
  );
  const rockTexVarC = mul(pow(distortNoise, float(0.5)), float(0.3));
  cliffColor = mix(cliffColor, CLIFF_TINT, rockTexVarC);

  // Noise-driven dirt patches on flat areas (using distorted slope)
  const dirtPatchFactor = smoothstep(
    float(TERRAIN_SHADER_CONSTANTS.DIRT_THRESHOLD - 0.05),
    float(TERRAIN_SHADER_CONSTANTS.DIRT_THRESHOLD + 0.15),
    noiseValue,
  );
  const flatnessFactor = smoothstep(float(0.3), float(0.05), dSlope);
  baseColor = mix(baseColor, dirtColor, mul(dirtPatchFactor, flatnessFactor));

  // Dirt on moderate slopes (bell curve, using distorted slope)
  const dirtSlopeFactor = mul(
    smoothstep(float(0.15), float(0.4), dSlope),
    smoothstep(float(0.6), float(0.3), dSlope),
  );
  baseColor = mix(baseColor, dirtColor, mul(dirtSlopeFactor, float(0.6)));

  // Cliff on steep slopes (using distorted slope)
  baseColor = mix(
    baseColor,
    cliffColor,
    smoothstep(float(0.3), float(0.55), dSlope),
  );

  // Sand near water (flat areas, stronger in canyon — using distorted height)
  const sandBlend = mul(
    smoothstep(float(18.0), float(12.0), dHeight),
    smoothstep(float(0.25), float(0.0), slope),
  );
  const sandStrength = mix(float(0.6), float(0.9), dW);
  baseColor = mix(baseColor, SAND_YELLOW, mul(sandBlend, sandStrength));

  // Shoreline transitions (using distorted height)
  baseColor = mix(
    baseColor,
    DIRT_DARK,
    mul(smoothstep(float(22.0), float(14.0), dHeight), float(0.4)),
  );
  baseColor = mix(
    baseColor,
    MUD_BROWN,
    mul(smoothstep(float(15.0), float(10.0), dHeight), float(0.7)),
  );
  baseColor = mix(
    baseColor,
    WATER_EDGE,
    mul(smoothstep(float(11.0), float(7.0), dHeight), float(0.9)),
  );

  // Saturation boost: pull color away from grey
  const lumaB = dot(baseColor, vec3(0.299, 0.587, 0.114));
  const greyB = vec3(lumaB, lumaB, lumaB);
  baseColor = mix(
    greyB,
    baseColor,
    float(TERRAIN_SHADER_CONSTANTS.SATURATION_BOOST),
  );

  // === RIVER BED / BANK COLORING ===
  // riverProximity: 1.0 = in channel (muddy brown), smoothstep to 0.0 at bank edge
  const riverProx = attribute("riverProximity", "float");
  const riverbedColor = vec3(0.32, 0.22, 0.12); // dark muddy brown
  const riverBankColor = vec3(0.45, 0.35, 0.22); // sandy bank brown
  // In channel (proximity > 0.7): full riverbed, bank zone: blend sandy brown → natural
  const riverBedBlend = smoothstep(float(0.5), float(0.8), riverProx);
  const riverColor = mix(riverBankColor, riverbedColor, riverBedBlend);
  baseColor = mix(baseColor, riverColor, riverProx);

  // Anti-dithering noise variation (±4% brightness, ±2% color shift)
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

  // === ROAD OVERLAY (disabled) ===
  // const roadInfluenceAttr = attribute("roadInfluence", "float");
  // const roadMaskState = getRoadInfluenceTextureState();
  // ... road rendering commented out for now
  const baseWithRoads = variedColor;

  // ============================================================================
  // HALF-LAMBERT ANIME SHADE (cool shadow tint — Genshin-style)
  // Wraps N·L to [0,1] for soft wrapped lighting, then tints shadow side
  // with cool blue-teal hue. Applied to albedo before PBR so the hue shift
  // survives through subsequent lighting calculations.
  // ============================================================================
  const sunDir = normalize(vec3(sunDirectionUniform));
  const NdotL = dot(worldNormal, sunDir);
  const halfLambert = add(mul(NdotL, float(0.5)), float(0.5));
  const shadeFactor = sub(float(1.0), halfLambert);
  const coolTint = vec3(...TERRAIN_SHADE.TINT_COLOR);
  const tintedBase = mul(baseWithRoads, coolTint);
  const shadedBase = mix(
    baseWithRoads,
    tintedBase,
    mul(shadeFactor, float(TERRAIN_SHADE.STRENGTH)),
  );

  // Fresnel rim highlight at grazing angles (subtle painterly edge glow)
  const viewDir = normalize(sub(worldPos, cameraPosition));
  const rim = clamp(
    add(float(1.0), dot(viewDir, worldNormal)),
    float(0.0),
    float(1.0),
  );
  const fresnelRim = mul(
    pow(rim, float(TERRAIN_SHADE.FRESNEL_POWER)),
    float(TERRAIN_SHADE.FRESNEL_INTENSITY),
  );
  const animeBase = add(shadedBase, vec3(fresnelRim, fresnelRim, fresnelRim));

  // ============================================================================
  // VERTEX LIGHTING (lampposts, torches, etc.)
  // Simple additive point lights with smooth attenuation
  // ============================================================================

  // Helper to calculate single light contribution
  // Returns additive light color contribution
  const calculateLightContribution = (
    lightPos: ReturnType<typeof uniform>,
    lightColor: ReturnType<typeof uniform>,
    lightParams: ReturnType<typeof uniform>, // x=intensity, y=range
  ) => {
    // Vector from world position to light
    const toLightVec = sub(lightPos, worldPos);
    const distToLight = add(
      add(mul(toLightVec.x, toLightVec.x), mul(toLightVec.y, toLightVec.y)),
      mul(toLightVec.z, toLightVec.z),
    );
    const dist = mul(distToLight, float(1)); // Keep as squared for now

    // Range squared for comparison
    const rangeSq = mul(lightParams.y, lightParams.y);

    // Smooth attenuation: 1 at center, 0 at range (using squared distances)
    const attenuation = mul(
      smoothstep(rangeSq, float(0), dist),
      lightParams.x, // intensity
    );

    // Light contribution = color * attenuation
    return mul(lightColor, attenuation);
  };

  // Accumulate light contributions from all 8 lights
  // Start with zero (no extra light)
  // Use ShaderNode type to allow reassignment from add() operations
  let lightAccum: ShaderNode = vec3(0, 0, 0);

  // Unroll loop for all 8 lights (TSL doesn't support dynamic loops well)
  lightAccum = add(
    lightAccum,
    calculateLightContribution(
      vertexLightPositionUniforms[0],
      vertexLightColorUniforms[0],
      vertexLightParamUniforms[0],
    ),
  );
  lightAccum = add(
    lightAccum,
    calculateLightContribution(
      vertexLightPositionUniforms[1],
      vertexLightColorUniforms[1],
      vertexLightParamUniforms[1],
    ),
  );
  lightAccum = add(
    lightAccum,
    calculateLightContribution(
      vertexLightPositionUniforms[2],
      vertexLightColorUniforms[2],
      vertexLightParamUniforms[2],
    ),
  );
  lightAccum = add(
    lightAccum,
    calculateLightContribution(
      vertexLightPositionUniforms[3],
      vertexLightColorUniforms[3],
      vertexLightParamUniforms[3],
    ),
  );
  lightAccum = add(
    lightAccum,
    calculateLightContribution(
      vertexLightPositionUniforms[4],
      vertexLightColorUniforms[4],
      vertexLightParamUniforms[4],
    ),
  );
  lightAccum = add(
    lightAccum,
    calculateLightContribution(
      vertexLightPositionUniforms[5],
      vertexLightColorUniforms[5],
      vertexLightParamUniforms[5],
    ),
  );
  lightAccum = add(
    lightAccum,
    calculateLightContribution(
      vertexLightPositionUniforms[6],
      vertexLightColorUniforms[6],
      vertexLightParamUniforms[6],
    ),
  );
  lightAccum = add(
    lightAccum,
    calculateLightContribution(
      vertexLightPositionUniforms[7],
      vertexLightColorUniforms[7],
      vertexLightParamUniforms[7],
    ),
  );

  // ============================================================================
  // LAMPPOST LIGHT MASK (baked, night-only)
  // ============================================================================
  const lampMaskState = getLamppostLightTextureState();
  const lampHalfWorld = lampMaskState.uWorldSize.mul(0.5);
  const lampUvX = worldPos.x
    .sub(lampMaskState.uCenterX)
    .add(lampHalfWorld)
    .div(lampMaskState.uWorldSize);
  const lampUvZ = worldPos.z
    .sub(lampMaskState.uCenterZ)
    .add(lampHalfWorld)
    .div(lampMaskState.uWorldSize);
  const lampUV = vec2(lampUvX.clamp(0.001, 0.999), lampUvZ.clamp(0.001, 0.999));
  const lampMask = lampMaskState.textureNode.sample(lampUV).r;
  const hasLampMask = smoothstep(
    float(1.0),
    float(2.0),
    lampMaskState.uWorldSize,
  );
  const lampDx = abs(worldPos.x.sub(lampMaskState.uCenterX));
  const lampDz = abs(worldPos.z.sub(lampMaskState.uCenterZ));
  const lampInside = step(lampDx, lampHalfWorld).mul(
    step(lampDz, lampHalfWorld),
  );
  const lampUse = hasLampMask.mul(lampInside);
  const lampIntensity = lampMask.mul(lampUse).mul(lampMaskState.uNightMix);
  const lampColor = vec3(1.0, 0.9, 0.6);
  lightAccum = add(lightAccum, mul(lampColor, lampIntensity));

  // Apply vertex lighting additively (multiply base by (1 + lightAccum))
  // This brightens terrain near lights without washing out colors
  const litTerrain = mul(animeBase, add(vec3(1, 1, 1), lightAccum));

  // === DISTANCE FOG (smoothstep with squared distances — avoids per-fragment sqrt) ===
  const baseFogFactor = smoothstep(
    float(FOG_NEAR_SQ),
    float(FOG_FAR_SQ),
    distSq,
  );
  const fogFactor = mul(baseFogFactor, fogEnabledUniform);
  const fogColor = fogTexNode.rgb;

  // === CREATE MATERIAL ===
  // Half-lambert anime shade (cool shadow tint + fresnel rim) is baked into
  // the albedo above.  PBR still applies Lambertian diffuse on top, which
  // darkens the shadow side further — the hue shift in the albedo is what
  // gives the Genshin-style warm-lit / cool-shadow look.
  const material = new MeshStandardNodeMaterial();
  material.colorNode = litTerrain;
  material.roughness = 1.0;
  material.metalness = 0.0;
  material.side = THREE.FrontSide;
  material.fog = false;

  // Fog applied AFTER PBR lighting (fog blends with sky, must be post-lit)
  material.outputNode = Fn(() => {
    const litColor = output;
    return vec4(mix(litColor.rgb, fogColor, fogFactor), litColor.a);
  })();

  const terrainUniforms: TerrainUniforms = {
    sunPosition: sunPositionUniform,
    sunDirection: sunDirectionUniform as unknown as { value: THREE.Vector3 },
    time: timeUniform,
    fogEnabled: fogEnabledUniform,
    // Vertex lighting arrays
    vertexLightPositions: vertexLightPositionUniforms.map(
      (u) => u as unknown as { value: THREE.Vector3 },
    ),
    vertexLightColors: vertexLightColorUniforms.map(
      (u) => u as unknown as { value: THREE.Vector3 },
    ),
    vertexLightParams: vertexLightParamUniforms.map(
      (u) => u as unknown as { value: THREE.Vector2 },
    ),
  };
  const result = material as typeof material & {
    terrainUniforms: TerrainUniforms;
  };
  result.terrainUniforms = terrainUniforms;
  return result;
}
