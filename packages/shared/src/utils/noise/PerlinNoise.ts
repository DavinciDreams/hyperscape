/**
 * PerlinNoise — Shared seamless Perlin noise implementation
 *
 * Single source of truth for deterministic Perlin noise used across:
 * - TerrainShader.ts (game renderer)
 * - TerrainShaderTSL.ts (procgen / Asset Forge)
 * - GrassWorker.ts (worker thread, via buildPerlinNoiseJS())
 *
 * All functions use the same LCG-shuffled permutation table, torus-mapped
 * seamless sampling, and FBM octave offsets to guarantee identical output.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Permutation table
// ---------------------------------------------------------------------------

/**
 * Create a deterministic 512-entry permutation table from a seed.
 * Uses LCG: s = (s * 1103515245 + 12345) & 0x7fffffff
 */
export function createPermutation(seed: number): number[] {
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

// ---------------------------------------------------------------------------
// Core noise
// ---------------------------------------------------------------------------

/** Classic 2D Perlin noise in [-1, 1]. */
export function perlin2D(x: number, y: number, perm: number[]): number {
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

// ---------------------------------------------------------------------------
// Seamless (torus-mapped) variants
// ---------------------------------------------------------------------------

/** Seamless 2D Perlin noise — maps (x,y) onto a 4D torus so it tiles. */
export function seamlessPerlin2D(x: number, y: number, perm: number[]): number {
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

/** Fractal Brownian Motion using seamless Perlin noise. */
export function seamlessFbm(
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

// ---------------------------------------------------------------------------
// Worker-embeddable JS string
// ---------------------------------------------------------------------------

/**
 * Returns a self-contained JS string implementing the full noise pipeline.
 * Used by GrassWorker and other Web Workers that can't import TS modules.
 *
 * The generated code defines:
 * - `createPermutation(seed)` → number[]
 * - `perlin2DPerm(x, y, perm)` → number
 * - `seamlessPerlin2D(x, y, perm)` → number
 * - `seamlessFbm(x, y, perm, octaves)` → number
 * - `sampleNoiseCPU(worldX, worldZ, scale)` → number [0,1]
 * - `_noisePerm` — pre-built permutation for seed 12345
 */
export function buildPerlinNoiseJS(): string {
  return `
  function _fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  function _lerp(a, b, t) { return a + t * (b - a); }
  function _grad(hash, x, y) {
    var h = hash & 3;
    var u = h < 2 ? x : y;
    var v = h < 2 ? y : x;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  function createPermutation(seed) {
    var p = [];
    for (var i = 0; i < 256; i++) p[i] = i;
    var s = seed;
    for (var i = 255; i > 0; i--) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      var j = s % (i + 1);
      var tmp = p[i]; p[i] = p[j]; p[j] = tmp;
    }
    return p.concat(p);
  }

  function perlin2DPerm(x, y, perm) {
    var X = Math.floor(x) & 255;
    var Y = Math.floor(y) & 255;
    var xf = x - Math.floor(x);
    var yf = y - Math.floor(y);
    var u = _fade(xf);
    var v = _fade(yf);
    var aa = perm[perm[X] + Y];
    var ab = perm[perm[X] + Y + 1];
    var ba = perm[perm[X + 1] + Y];
    var bb = perm[perm[X + 1] + Y + 1];
    var x1 = _lerp(_grad(aa, xf, yf), _grad(ba, xf - 1, yf), u);
    var x2 = _lerp(_grad(ab, xf, yf - 1), _grad(bb, xf - 1, yf - 1), u);
    return _lerp(x1, x2, v);
  }

  function seamlessPerlin2D(x, y, perm) {
    var TWO_PI = Math.PI * 2;
    var angleX = x * TWO_PI;
    var angleY = y * TWO_PI;
    var nx = Math.cos(angleX);
    var ny = Math.sin(angleX);
    var nz = Math.cos(angleY);
    var nw = Math.sin(angleY);
    var n1 = perlin2DPerm(nx * 4 + 100, nz * 4 + 100, perm);
    var n2 = perlin2DPerm(ny * 4 + 200, nw * 4 + 200, perm);
    var n3 = perlin2DPerm(nx * 4 + ny * 4 + 300, nz * 4 + nw * 4 + 300, perm);
    return (n1 + n2 + n3) / 3;
  }

  function seamlessFbm(x, y, perm, octaves) {
    var value = 0, amplitude = 0.5, maxValue = 0;
    for (var i = 0; i < octaves; i++) {
      var ox = x + i * 17.3;
      var oy = y + i * 31.7;
      value += amplitude * seamlessPerlin2D(ox, oy, perm);
      maxValue += amplitude;
      amplitude *= 0.5;
    }
    return value / maxValue;
  }

  var _noisePerm = createPermutation(12345);

  function sampleNoiseCPU(worldX, worldZ, scale) {
    var u = worldX * scale;
    var v = worldZ * scale;
    var wu = u - Math.floor(u);
    var wv = v - Math.floor(v);
    return (seamlessFbm(wu, wv, _noisePerm, 4) + 1) * 0.5;
  }
`;
}
