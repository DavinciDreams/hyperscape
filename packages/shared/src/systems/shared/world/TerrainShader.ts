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
  Fn,
  output,
  type ShaderNode,
} from "../../../extras/three/three";
import { getRoadInfluenceTextureState } from "./RoadInfluenceMask";
import { getLamppostLightTextureState } from "./LamppostLightMask";
import { FOG_NEAR_SQ, FOG_FAR_SQ, fogRenderTarget } from "./FogConfig";
import { applyTerrainSunShade } from "./GPUMaterials";

export const TERRAIN_SHADER_CONSTANTS = {
  TRIPLANAR_SCALE: 0.5,
  SNOW_HEIGHT: 50.0,
  NOISE_SCALE: 0.0008,
  DIRT_THRESHOLD: 0.5,
  LOD_FULL_DETAIL: 100.0,
  LOD_MEDIUM_DETAIL: 200.0,
  WATER_LEVEL: 5.0,
};

const TERRAIN_TEX_TILE = 0.08;
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
    file: "desertCliff.png",
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
 * This is the exact same logic the terrain shader uses (height + slope + noise),
 * extracted so the tree shader can call it for ground-blending.
 *
 * @param height - positionWorld.y
 * @param slope  - 1 - abs(normalWorld.y)  (0 = flat, 1 = vertical)
 * @param noiseVal - primary Perlin noise sample (noiseTex @ worldXZ * NOISE_SCALE)
 * @param noiseVal2 - derived noise: sin(noiseVal * 6.28) * 0.3 + 0.5
 * @param forestWeight - biome weight for forest [0..1]
 * @param canyonWeight - biome weight for canyon [0..1]
 */
export function computeTerrainBaseColor(
  height: ShaderNode,
  slope: ShaderNode,
  noiseVal: ShaderNode,
  noiseVal2: ShaderNode,
  forestWeight?: ShaderNode,
  canyonWeight?: ShaderNode,
) {
  const fW = forestWeight ?? float(0.0);
  const dW = canyonWeight ?? float(0.0);
  const tW = sub(float(1.0), add(fW, dW));

  // Biome-blended grass
  const grassVariation = smoothstep(float(0.4), float(0.6), noiseVal2);
  const tundraGrass = mix(TUNDRA_GRASS, TUNDRA_GRASS_DARK, grassVariation);
  const forestGrass = mix(FOREST_GRASS, FOREST_GRASS_DARK, grassVariation);
  const canyonGrass = mix(CANYON_SAND, CANYON_SAND_DARK, grassVariation);
  let c: ShaderNode = add(
    add(mul(tundraGrass, tW), mul(forestGrass, fW)),
    mul(canyonGrass, dW),
  );

  // Biome-blended dirt
  const dirtPatchFactor = smoothstep(
    float(TERRAIN_SHADER_CONSTANTS.DIRT_THRESHOLD - 0.05),
    float(TERRAIN_SHADER_CONSTANTS.DIRT_THRESHOLD + 0.15),
    noiseVal,
  );
  const flatnessFactor = smoothstep(float(0.3), float(0.05), slope);
  const dirtVariation = smoothstep(float(0.3), float(0.7), noiseVal2);
  const tundraDirt = mix(TUNDRA_DIRT, TUNDRA_DIRT_DARK, dirtVariation);
  const forestDirt = mix(FOREST_DIRT, FOREST_DIRT_DARK, dirtVariation);
  const canyonDirt = mix(CANYON_ROCK, CANYON_ROCK_DARK, dirtVariation);
  const dirtColor = add(
    add(mul(tundraDirt, tW), mul(forestDirt, fW)),
    mul(canyonDirt, dW),
  );
  c = mix(c, dirtColor, mul(dirtPatchFactor, flatnessFactor));

  // Slope-based dirt — fades out at steep slopes where cliff color takes over
  const dirtSlopeFactor = mul(
    smoothstep(float(0.15), float(0.4), slope),
    smoothstep(float(0.6), float(0.3), slope),
  );
  c = mix(c, dirtColor, mul(dirtSlopeFactor, float(0.6)));

  // Per-biome cliff color on steep slopes (terrace sides, rock faces)
  const cliffVariation = smoothstep(float(0.3), float(0.7), noiseVal);
  const tundraCliff = mix(TUNDRA_CLIFF, TUNDRA_CLIFF_DARK, cliffVariation);
  const forestCliff = mix(FOREST_CLIFF, FOREST_CLIFF_DARK, cliffVariation);
  const canyonCliff = mix(CANYON_CLIFF, CANYON_CLIFF_DARK, cliffVariation);
  const cliffColor = add(
    add(mul(tundraCliff, tW), mul(forestCliff, fW)),
    mul(canyonCliff, dW),
  );
  c = mix(c, cliffColor, smoothstep(float(0.3), float(0.55), slope));

  // Sand near water (flat areas, stronger in canyon)
  const sandBlend = mul(
    smoothstep(float(10.0), float(6.0), height),
    smoothstep(float(0.25), float(0.0), slope),
  );
  const sandStrength = mix(float(0.6), float(0.9), dW);
  c = mix(c, SAND_YELLOW, mul(sandBlend, sandStrength));

  // Shoreline transitions
  c = mix(
    c,
    DIRT_DARK,
    mul(smoothstep(float(14.0), float(8.0), height), float(0.4)),
  );
  c = mix(
    c,
    MUD_BROWN,
    mul(smoothstep(float(9.0), float(6.0), height), float(0.7)),
  );
  c = mix(
    c,
    WATER_EDGE,
    mul(smoothstep(float(6.5), float(5.0), height), float(0.9)),
  );

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
  shadeColor: { value: THREE.Color };
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
  const sunDirectionUniform = uniform(vec3(0.5, 0.8, 0.3));
  const shadeColorUniform = uniform(vec3(0.7, 1.08, 1.22));
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

  // UV projections (top-down for grass/dirt, triplanar for cliffs)
  const tileScale = float(TERRAIN_TEX_TILE);
  const uvFlat = mul(vec2(worldPos.x, worldPos.z), tileScale);
  const uvFront = mul(vec2(worldPos.x, worldPos.y), tileScale);
  const uvSide = mul(vec2(worldPos.z, worldPos.y), tileScale);

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

  // Flat textures sampled top-down (grass/dirt on mostly-flat surfaces)
  const sGrass = texture(tGrass, uvFlat).rgb;
  const sDirt = texture(tDirt, uvFlat).rgb;
  const sDesertGrass = texture(tDesertGrass, uvFlat).rgb;
  const sDesertDirt = texture(tDesertDirt, uvFlat).rgb;
  const sSnowGrass = texture(tSnowGrass, uvFlat).rgb;
  const sSnowDirt = texture(tSnowDirt, uvFlat).rgb;

  // Cliff textures sampled triplanarly (avoids stretching on steep faces)
  const triCliff = (t: THREE.Texture) =>
    add(
      add(mul(texture(t, uvFlat).rgb, twY), mul(texture(t, uvSide).rgb, twX)),
      mul(texture(t, uvFront).rgb, twZ),
    );
  const sCliff = triCliff(tCliff);
  const sDesertCliff = triCliff(tDesertCliff);
  const sSnowCliff = triCliff(tSnowCliff);

  const TEX_DARKEN = float(0.65);

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

  // Biome-blended dirt patches
  const dirtPatchFactor = smoothstep(
    float(TERRAIN_SHADER_CONSTANTS.DIRT_THRESHOLD - 0.05),
    float(TERRAIN_SHADER_CONSTANTS.DIRT_THRESHOLD + 0.15),
    noiseValue,
  );
  const flatnessFactor = smoothstep(float(0.3), float(0.05), slope);
  const dirtVar = smoothstep(float(0.3), float(0.7), noiseValue2);
  const tundraDirtC = mix(sSnowDirt, mul(sSnowDirt, TEX_DARKEN), dirtVar);
  const forestDirtC = mix(sDirt, mul(sDirt, TEX_DARKEN), dirtVar);
  const canyonDirtC = mix(sDesertDirt, mul(sDesertDirt, TEX_DARKEN), dirtVar);
  const dirtColor = add(
    add(mul(tundraDirtC, tW), mul(forestDirtC, fW)),
    mul(canyonDirtC, dW),
  );
  baseColor = mix(baseColor, dirtColor, mul(dirtPatchFactor, flatnessFactor));

  // Slope-based dirt
  const dirtSlopeFactor = mul(
    smoothstep(float(0.15), float(0.4), slope),
    smoothstep(float(0.6), float(0.3), slope),
  );
  baseColor = mix(baseColor, dirtColor, mul(dirtSlopeFactor, float(0.6)));

  // Per-biome cliff on steep slopes (triplanar textured)
  const cliffVar = smoothstep(float(0.3), float(0.7), noiseValue);
  const tundraCliffC = mix(sSnowCliff, mul(sSnowCliff, TEX_DARKEN), cliffVar);
  const forestCliffC = mix(sCliff, mul(sCliff, TEX_DARKEN), cliffVar);
  const canyonCliffC = mix(
    sDesertCliff,
    mul(sDesertCliff, TEX_DARKEN),
    cliffVar,
  );
  const cliffColor = add(
    add(mul(tundraCliffC, tW), mul(forestCliffC, fW)),
    mul(canyonCliffC, dW),
  );
  baseColor = mix(
    baseColor,
    cliffColor,
    smoothstep(float(0.3), float(0.55), slope),
  );

  // Sand near water (keep flat color - no sand texture)
  const sandBlend = mul(
    smoothstep(float(10.0), float(6.0), height),
    smoothstep(float(0.25), float(0.0), slope),
  );
  const sandStrength = mix(float(0.6), float(0.9), dW);
  baseColor = mix(baseColor, SAND_YELLOW, mul(sandBlend, sandStrength));

  // Shoreline transitions (keep flat colors)
  baseColor = mix(
    baseColor,
    DIRT_DARK,
    mul(smoothstep(float(14.0), float(8.0), height), float(0.4)),
  );
  baseColor = mix(
    baseColor,
    MUD_BROWN,
    mul(smoothstep(float(9.0), float(6.0), height), float(0.7)),
  );
  baseColor = mix(
    baseColor,
    WATER_EDGE,
    mul(smoothstep(float(6.5), float(5.0), height), float(0.9)),
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

  // === ROAD OVERLAY ===
  // Roads are compacted dirt paths - reuse existing dirt colors for consistency
  // Use shared road mask when available, fall back to per-vertex attribute
  const roadInfluenceAttr = attribute("roadInfluence", "float");
  const roadMaskState = getRoadInfluenceTextureState();
  const roadHalfWorld = roadMaskState.uWorldSize.mul(0.5);
  const roadUvX = worldPos.x
    .sub(roadMaskState.uCenterX)
    .add(roadHalfWorld)
    .div(roadMaskState.uWorldSize);
  const roadUvZ = worldPos.z
    .sub(roadMaskState.uCenterZ)
    .add(roadHalfWorld)
    .div(roadMaskState.uWorldSize);
  const roadUV = vec2(roadUvX.clamp(0.001, 0.999), roadUvZ.clamp(0.001, 0.999));
  const roadMask = roadMaskState.textureNode.sample(roadUV).r;
  const hasRoadMask = smoothstep(
    float(1.0),
    float(2.0),
    roadMaskState.uWorldSize,
  );
  const dx = abs(worldPos.x.sub(roadMaskState.uCenterX));
  const dz = abs(worldPos.z.sub(roadMaskState.uCenterZ));
  const insideMask = step(dx, roadHalfWorld).mul(step(dz, roadHalfWorld));
  const useMask = hasRoadMask.mul(insideMask);
  const roadInfluence = mix(roadInfluenceAttr, roadMask, useMask);

  // Reuse existing dirt colors with natural noise variation
  const roadNoiseVar = mul(noiseValue2, float(0.5)); // Natural dirt variation
  const roadBaseColor = mix(DIRT_BROWN, DIRT_DARK, roadNoiseVar);

  // Gravel/Cobblestone effect: High frequency noise for texture
  // Use fineNoise (highest freq) to create small stones
  const stoneNoise = smoothstep(float(0.4), float(0.7), fineNoise);
  const stoneColor = mix(ROCK_GRAY, ROCK_DARK, float(0.5));

  // Mix stones into dirt base - more stones in center of road
  const roadDetailColor = mix(
    roadBaseColor,
    stoneColor,
    mul(stoneNoise, float(0.6)),
  );

  // Road center is slightly worn/darker from foot traffic
  const roadCenterDarken = mul(roadInfluence, float(0.08));
  const compactedRoadColor = sub(roadDetailColor, vec3(roadCenterDarken));

  // Blend road color with terrain based on influence
  const baseWithRoads = mix(variedColor, compactedRoadColor, roadInfluence);

  // === MINE FLOOR OVERLAY ===
  // AAA multi-layered rocky quarry floor matching Asset Forge shader quality.
  // Exposed bedrock, gravel scatter, dirt accumulation, radial gradient,
  // height-based edge blending with surrounding terrain.
  const mineInfluenceAttr = attribute("mineInfluence", "float");
  const mineBiomeIdAttr = attribute("mineBiomeId", "float");

  // Mine-specific noise at scales appropriate for 15-25m mine areas
  const mineUV = vec2(worldPos.x, worldPos.z);
  const mn1 = texture(noiseTex, mul(mineUV, float(0.035))).r; // stone slabs (~28m)
  const mn2 = texture(noiseTex, mul(mineUV, float(0.14))).r; // stone surface (~7m)
  const mn3 = texture(noiseTex, mul(mineUV, float(0.5))).r; // gravel (~2m)
  const mn4 = texture(noiseTex, mul(mineUV, float(1.4))).r; // micro cracks (~0.7m)

  // Noise-distorted organic edge
  const mineEdgeDistortion = add(
    mul(sub(mn1, float(0.5)), float(0.22)),
    add(
      mul(sub(mn2, float(0.5)), float(0.14)),
      mul(sub(mn3, float(0.5)), float(0.06)),
    ),
  );
  const distortedMineInfluence = add(mineInfluenceAttr, mineEdgeDistortion);
  const mineCoreMask = smoothstep(
    float(0.42),
    float(0.68),
    distortedMineInfluence,
  );
  const mineEdgeMask = smoothstep(
    float(0.12),
    float(0.42),
    distortedMineInfluence,
  );

  // Biome color palette: primary (bedrock), secondary (dark crevices), tertiary (gravel)
  // 0=forest, 1=tundra, 2=desert, 3=mountains, 4=plains, 5=swamp, 6=valley
  const mb = mineBiomeIdAttr;
  const mbForest = mul(step(float(-0.5), mb), step(mb, float(0.5)));
  const mbTundra = mul(step(float(0.5), mb), step(mb, float(1.5)));
  const mbDesert = mul(step(float(1.5), mb), step(mb, float(2.5)));
  const mbMountain = mul(step(float(2.5), mb), step(mb, float(3.5)));
  const mbSwamp = mul(step(float(4.5), mb), step(mb, float(5.5)));
  const mbValley = step(float(5.5), mb);

  // Primary (bedrock)
  let minePrimary: ShaderNode = vec3(0.54, 0.46, 0.36);
  minePrimary = mix(minePrimary, vec3(0.56, 0.54, 0.5), mbForest);
  minePrimary = mix(minePrimary, vec3(0.42, 0.42, 0.46), mbTundra);
  minePrimary = mix(minePrimary, vec3(0.55, 0.38, 0.24), mbDesert);
  minePrimary = mix(minePrimary, vec3(0.52, 0.5, 0.47), mbMountain);
  minePrimary = mix(minePrimary, vec3(0.36, 0.3, 0.22), mbSwamp);
  minePrimary = mix(minePrimary, vec3(0.58, 0.5, 0.4), mbValley);

  // Secondary (dark crevices)
  let mineSecondary: ShaderNode = vec3(0.38, 0.32, 0.22);
  mineSecondary = mix(mineSecondary, vec3(0.4, 0.38, 0.35), mbForest);
  mineSecondary = mix(mineSecondary, vec3(0.28, 0.28, 0.32), mbTundra);
  mineSecondary = mix(mineSecondary, vec3(0.38, 0.24, 0.13), mbDesert);
  mineSecondary = mix(mineSecondary, vec3(0.36, 0.34, 0.32), mbMountain);
  mineSecondary = mix(mineSecondary, vec3(0.24, 0.19, 0.13), mbSwamp);
  mineSecondary = mix(mineSecondary, vec3(0.42, 0.36, 0.26), mbValley);

  // Tertiary (gravel highlights)
  let mineTertiary: ShaderNode = vec3(0.62, 0.54, 0.44);
  mineTertiary = mix(mineTertiary, vec3(0.62, 0.6, 0.56), mbForest);
  mineTertiary = mix(mineTertiary, vec3(0.5, 0.5, 0.55), mbTundra);
  mineTertiary = mix(mineTertiary, vec3(0.64, 0.48, 0.32), mbDesert);
  mineTertiary = mix(mineTertiary, vec3(0.6, 0.58, 0.55), mbMountain);
  mineTertiary = mix(mineTertiary, vec3(0.44, 0.38, 0.3), mbSwamp);
  mineTertiary = mix(mineTertiary, vec3(0.66, 0.58, 0.48), mbValley);

  // Layer 1: Exposed bedrock — broad slab patches
  const mineSlabPattern = smoothstep(float(0.32), float(0.68), mn1);
  const mineBedrockColor = mix(minePrimary, mineSecondary, mineSlabPattern);

  // Layer 2: Stone surface texture — highlights and shadows
  const mineSurfaceLight = smoothstep(float(0.45), float(0.75), mn2);
  const mineSurfaceShadow = smoothstep(float(0.35), float(0.15), mn2);
  const mineTexturedStone = mul(
    mix(mineBedrockColor, mineTertiary, mul(mineSurfaceLight, float(0.35))),
    mix(float(1.0), float(0.88), mineSurfaceShadow),
  );

  // Layer 3: Gravel scatter with pebble shadows
  const mineGravelHighlight = smoothstep(float(0.58), float(0.78), mn3);
  const mineGravelShadow = smoothstep(float(0.22), float(0.38), mn3);
  const mineWithGravel = mix(
    mineTexturedStone,
    mineTertiary,
    mul(mineGravelHighlight, float(0.3)),
  );
  const mineWithCracks = mix(
    mul(mineWithGravel, float(0.84)),
    mineWithGravel,
    mineGravelShadow,
  );

  // Layer 4: Micro crack imperfections
  const mineCrackMask = smoothstep(float(0.42), float(0.58), mn4);
  const mineWithMicro = mul(
    mineWithCracks,
    mix(float(0.92), float(1.02), mineCrackMask),
  );

  // Layer 5: Radial gradient — center rock, edge gravel/dirt
  const mineCenterW = smoothstep(float(0.45), float(0.85), mineInfluenceAttr);
  const mineEdgeGravelDirt = mix(
    mix(mineSecondary, minePrimary, float(0.4)),
    mineTertiary,
    mn3,
  );
  const mineRadialMixed = mix(
    mix(mineWithMicro, mineEdgeGravelDirt, float(0.4)),
    mineWithMicro,
    mineCenterW,
  );

  // Layer 6: Wear / foot traffic darkening
  const mineWearPattern = smoothstep(float(0.55), float(0.75), mn1);
  const mineWornFloor = mul(
    mineRadialMixed,
    sub(float(1.0), mul(mineWearPattern, mul(mineCoreMask, float(0.08)))),
  );

  // Layer 7: Edge darkening band
  const mineEdgeBand = mul(
    smoothstep(float(0.15), float(0.32), mineEdgeMask),
    smoothstep(float(0.52), float(0.32), mineEdgeMask),
  );
  const mineBorderDarken = mul(mineEdgeBand, float(0.14));
  const mineFloorFinal = mul(mineWornFloor, sub(float(1.0), mineBorderDarken));

  // Blend mine floor onto terrain
  const baseWithMines = mix(baseWithRoads, mineFloorFinal, mineEdgeMask);

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
  const litTerrain = mul(baseWithMines, add(vec3(1, 1, 1), lightAccum));

  // === DISTANCE FOG (smoothstep with squared distances — avoids per-fragment sqrt) ===
  const baseFogFactor = smoothstep(
    float(FOG_NEAR_SQ),
    float(FOG_FAR_SQ),
    distSq,
  );
  const fogFactor = mul(baseFogFactor, fogEnabledUniform);
  const fogColor = fogTexNode.rgb;

  // === CREATE MATERIAL ===
  const material = new MeshStandardNodeMaterial();
  material.colorNode = litTerrain;
  material.roughness = 1.0;
  material.metalness = 0.0;
  material.side = THREE.FrontSide;
  material.fog = false;

  // Apply sun shade + fog AFTER PBR lighting via outputNode
  material.outputNode = Fn(() => {
    const litColor = output;

    // Sun shade: shared function (identical to tree shader terrain blend)
    const shaded = applyTerrainSunShade(
      litColor.rgb,
      normalWorld,
      vec3(sunDirectionUniform),
      vec3(shadeColorUniform),
    );

    return vec4(mix(shaded, fogColor, fogFactor), litColor.a);
  })();

  const terrainUniforms: TerrainUniforms = {
    sunPosition: sunPositionUniform,
    sunDirection: sunDirectionUniform as unknown as { value: THREE.Vector3 },
    shadeColor: shadeColorUniform as unknown as { value: THREE.Color },
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
