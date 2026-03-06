/**
 * TerrainShader - TSL Node Material for OSRS-style vertex color terrain
 * Flat shaded, no textures - pure vertex colors based on height/slope/noise
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

export const TERRAIN_CONSTANTS = {
  TRIPLANAR_SCALE: 0.5,
  SNOW_HEIGHT: 50.0,
  NOISE_SCALE: 0.0008,
  DIRT_THRESHOLD: 0.5,
  LOD_FULL_DETAIL: 100.0,
  LOD_MEDIUM_DETAIL: 200.0,
  WATER_LEVEL: 5.0,
};

// ============================================================================
// SHARED TERRAIN BASE COLOR (used by terrain shader AND tree ground-blend)
// ============================================================================

// --- Tundra palette: snowy white-blue with frozen grey stone ---
const TUNDRA_GRASS = vec3(0.78, 0.82, 0.85);
const TUNDRA_GRASS_DARK = vec3(0.65, 0.7, 0.75);
const TUNDRA_DIRT = vec3(0.55, 0.55, 0.58);
const TUNDRA_DIRT_DARK = vec3(0.42, 0.42, 0.45);

// --- Forest palette: vibrant energetic greens with warm brown earth ---
const FOREST_GRASS = vec3(0.3, 0.58, 0.15);
const FOREST_GRASS_DARK = vec3(0.18, 0.42, 0.08);
const FOREST_DIRT = vec3(0.35, 0.24, 0.12);
const FOREST_DIRT_DARK = vec3(0.22, 0.15, 0.08);

// --- Desert palette: red-orange sand with deep crimson rock ---
const DESERT_SAND = vec3(0.82, 0.52, 0.28);
const DESERT_SAND_DARK = vec3(0.72, 0.42, 0.2);
const DESERT_ROCK = vec3(0.62, 0.28, 0.15);
const DESERT_ROCK_DARK = vec3(0.48, 0.2, 0.1);

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
 * @param desertWeight - biome weight for desert [0..1]
 */
export function computeTerrainBaseColor(
  height: any,
  slope: any,
  noiseVal: any,
  noiseVal2: any,
  forestWeight?: any,
  desertWeight?: any,
) {
  const fW = forestWeight ?? float(0.0);
  const dW = desertWeight ?? float(0.0);
  const tW = sub(float(1.0), add(fW, dW));

  // Biome-blended grass
  const grassVariation = smoothstep(float(0.4), float(0.6), noiseVal2);
  const tundraGrass = mix(TUNDRA_GRASS, TUNDRA_GRASS_DARK, grassVariation);
  const forestGrass = mix(FOREST_GRASS, FOREST_GRASS_DARK, grassVariation);
  const desertGrass = mix(DESERT_SAND, DESERT_SAND_DARK, grassVariation);
  let c: any = add(
    add(mul(tundraGrass, tW), mul(forestGrass, fW)),
    mul(desertGrass, dW),
  );

  // Biome-blended dirt
  const dirtPatchFactor = smoothstep(
    float(TERRAIN_CONSTANTS.DIRT_THRESHOLD - 0.05),
    float(TERRAIN_CONSTANTS.DIRT_THRESHOLD + 0.15),
    noiseVal,
  );
  const flatnessFactor = smoothstep(float(0.3), float(0.05), slope);
  const dirtVariation = smoothstep(float(0.3), float(0.7), noiseVal2);
  const tundraDirt = mix(TUNDRA_DIRT, TUNDRA_DIRT_DARK, dirtVariation);
  const forestDirt = mix(FOREST_DIRT, FOREST_DIRT_DARK, dirtVariation);
  const desertDirt = mix(DESERT_ROCK, DESERT_ROCK_DARK, dirtVariation);
  const dirtColor = add(
    add(mul(tundraDirt, tW), mul(forestDirt, fW)),
    mul(desertDirt, dW),
  );
  c = mix(c, dirtColor, mul(dirtPatchFactor, flatnessFactor));

  // Slope-based dirt
  c = mix(
    c,
    dirtColor,
    mul(smoothstep(float(0.15), float(0.5), slope), float(0.6)),
  );

  // Rock on steep slopes
  const rockVariation = smoothstep(float(0.3), float(0.7), noiseVal);
  const rockColor = mix(ROCK_GRAY, ROCK_DARK, rockVariation);
  c = mix(c, rockColor, smoothstep(float(0.45), float(0.75), slope));

  // Snow at high elevation (suppressed in desert)
  const snowMask = sub(float(1.0), dW);
  c = mix(
    c,
    SNOW_WHITE,
    mul(
      smoothstep(
        float(TERRAIN_CONSTANTS.SNOW_HEIGHT - 5.0),
        float(60.0),
        height,
      ),
      snowMask,
    ),
  );

  // Sand near water (flat areas, stronger in desert)
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
  const u = worldX * TERRAIN_CONSTANTS.NOISE_SCALE;
  const v = worldZ * TERRAIN_CONSTANTS.NOISE_SCALE;

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

  // === SNOW AT HIGH ELEVATION ===
  // Snow line at ~50m, full snow by 55m
  if (height > TERRAIN_CONSTANTS.SNOW_HEIGHT - 5.0) {
    const snowFactor = smoothstepCPU(
      TERRAIN_CONSTANTS.SNOW_HEIGHT - 5.0,
      TERRAIN_CONSTANTS.SNOW_HEIGHT + 5.0,
      height,
    );
    grassiness -= snowFactor;
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
 * OSRS-style vertex color terrain material
 * No textures - pure flat shaded colors based on height, slope, and noise
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
  const noiseScale = uniform(float(TERRAIN_CONSTANTS.NOISE_SCALE));

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
  const biomeDesertW = attribute("biomeDesertWeight", "float");

  // Base color from shared procedural palette
  const baseColor = computeTerrainBaseColor(
    height,
    slope,
    noiseValue,
    noiseValue2,
    biomeForestW,
    biomeDesertW,
  );

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
  const litTerrain = mul(baseWithRoads, add(vec3(1, 1, 1), lightAccum));

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
