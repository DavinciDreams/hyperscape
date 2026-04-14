import { describe, it, expect } from "vitest";
import {
  createPermutation,
  perlin2D,
  seamlessPerlin2D,
  seamlessFbm,
  buildPerlinNoiseJS,
} from "../PerlinNoise";

// ────────────────────────────────────────
// createPermutation
// ────────────────────────────────────────

describe("createPermutation", () => {
  it("returns an array of length 512", () => {
    const perm = createPermutation(42);
    expect(perm).toHaveLength(512);
  });

  it("is deterministic for the same seed", () => {
    const perm1 = createPermutation(42);
    const perm2 = createPermutation(42);
    expect(perm1).toEqual(perm2);
  });

  it("produces different results for different seeds", () => {
    const perm1 = createPermutation(42);
    const perm2 = createPermutation(123);
    // While theoretically possible for two seeds to produce the same
    // permutation, it is astronomically unlikely
    expect(perm1).not.toEqual(perm2);
  });

  it("contains values 0-255 in the first half", () => {
    const perm = createPermutation(42);
    const firstHalf = perm.slice(0, 256);
    const sorted = [...firstHalf].sort((a, b) => a - b);
    for (let i = 0; i < 256; i++) {
      expect(sorted[i]).toBe(i);
    }
  });

  it("second half mirrors the first half (doubled permutation)", () => {
    const perm = createPermutation(42);
    for (let i = 0; i < 256; i++) {
      expect(perm[i + 256]).toBe(perm[i]);
    }
  });

  it("all values are integers in [0, 255]", () => {
    const perm = createPermutation(999);
    for (const v of perm) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(255);
    }
  });

  it("seed 0 produces a valid permutation", () => {
    const perm = createPermutation(0);
    expect(perm).toHaveLength(512);
    const firstHalf = perm.slice(0, 256);
    const sorted = [...firstHalf].sort((a, b) => a - b);
    for (let i = 0; i < 256; i++) {
      expect(sorted[i]).toBe(i);
    }
  });

  it("negative seed produces a valid permutation", () => {
    const perm = createPermutation(-1);
    expect(perm).toHaveLength(512);
    // Should still be a permutation of 0-255
    const firstHalf = perm.slice(0, 256);
    const unique = new Set(firstHalf);
    expect(unique.size).toBe(256);
  });
});

// ────────────────────────────────────────
// perlin2D
// ────────────────────────────────────────

describe("perlin2D", () => {
  const perm = createPermutation(12345);

  it("returns values in [-1, 1]", () => {
    // Sample many points to check range
    for (let i = 0; i < 500; i++) {
      const x = (i - 250) * 0.1;
      const y = (i * 0.7 - 175) * 0.1;
      const value = perlin2D(x, y, perm);
      expect(value).toBeGreaterThanOrEqual(-1);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it("is deterministic for the same inputs", () => {
    const v1 = perlin2D(3.7, 8.2, perm);
    const v2 = perlin2D(3.7, 8.2, perm);
    expect(v1).toBe(v2);
  });

  it("returns 0 at integer coordinates", () => {
    // Perlin noise returns 0 at integer grid points because grad
    // vectors are evaluated with zero fractional component
    const value = perlin2D(5, 10, perm);
    expect(value).toBeCloseTo(0, 10);
  });

  it("produces different values at different positions", () => {
    const v1 = perlin2D(1.5, 2.5, perm);
    const v2 = perlin2D(3.5, 7.5, perm);
    // While it's possible for two different positions to produce
    // the same value, it's extremely unlikely at arbitrary positions
    expect(v1).not.toBe(v2);
  });

  it("varies smoothly (nearby points have similar values)", () => {
    const base = perlin2D(5.0, 5.0, perm);
    const nearby = perlin2D(5.01, 5.01, perm);
    // The difference between very nearby samples should be small
    expect(Math.abs(base - nearby)).toBeLessThan(0.1);
  });

  it("produces different values with different permutation tables", () => {
    const perm2 = createPermutation(99999);
    const v1 = perlin2D(1.5, 2.5, perm);
    const v2 = perlin2D(1.5, 2.5, perm2);
    expect(v1).not.toBe(v2);
  });

  it("handles negative coordinates", () => {
    const value = perlin2D(-3.5, -7.2, perm);
    expect(value).toBeGreaterThanOrEqual(-1);
    expect(value).toBeLessThanOrEqual(1);
  });

  it("handles large coordinates", () => {
    const value = perlin2D(10000.5, 20000.5, perm);
    expect(value).toBeGreaterThanOrEqual(-1);
    expect(value).toBeLessThanOrEqual(1);
  });
});

// ────────────────────────────────────────
// seamlessPerlin2D
// ────────────────────────────────────────

describe("seamlessPerlin2D", () => {
  const perm = createPermutation(12345);

  it("returns the same value at x=0 and x=1 (seamless tiling on X)", () => {
    const y = 0.3;
    const atZero = seamlessPerlin2D(0, y, perm);
    const atOne = seamlessPerlin2D(1, y, perm);
    expect(atZero).toBeCloseTo(atOne, 10);
  });

  it("returns the same value at y=0 and y=1 (seamless tiling on Y)", () => {
    const x = 0.7;
    const atZero = seamlessPerlin2D(x, 0, perm);
    const atOne = seamlessPerlin2D(x, 1, perm);
    expect(atZero).toBeCloseTo(atOne, 10);
  });

  it("tiles seamlessly at both corners", () => {
    const v00 = seamlessPerlin2D(0, 0, perm);
    const v10 = seamlessPerlin2D(1, 0, perm);
    const v01 = seamlessPerlin2D(0, 1, perm);
    const v11 = seamlessPerlin2D(1, 1, perm);
    expect(v00).toBeCloseTo(v10, 10);
    expect(v00).toBeCloseTo(v01, 10);
    expect(v00).toBeCloseTo(v11, 10);
  });

  it("is deterministic", () => {
    const v1 = seamlessPerlin2D(0.5, 0.5, perm);
    const v2 = seamlessPerlin2D(0.5, 0.5, perm);
    expect(v1).toBe(v2);
  });

  it("returns values in a reasonable range", () => {
    // seamlessPerlin2D averages three perlin2D calls, each in [-1,1]
    // so the average should also be in [-1, 1]
    for (let i = 0; i < 100; i++) {
      const x = i / 100;
      const y = ((i * 3 + 7) % 100) / 100;
      const value = seamlessPerlin2D(x, y, perm);
      expect(value).toBeGreaterThanOrEqual(-1);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it("wraps at integer boundaries", () => {
    // x=0.3 and x=1.3 should produce the same value since torus maps with period 1
    const v1 = seamlessPerlin2D(0.3, 0.5, perm);
    const v2 = seamlessPerlin2D(1.3, 0.5, perm);
    expect(v1).toBeCloseTo(v2, 10);
  });
});

// ────────────────────────────────────────
// seamlessFbm
// ────────────────────────────────────────

describe("seamlessFbm", () => {
  const perm = createPermutation(12345);

  it("returns a number", () => {
    const value = seamlessFbm(0.5, 0.5, perm);
    expect(typeof value).toBe("number");
    expect(isNaN(value)).toBe(false);
  });

  it("is deterministic with the same inputs", () => {
    const v1 = seamlessFbm(0.3, 0.7, perm, 4);
    const v2 = seamlessFbm(0.3, 0.7, perm, 4);
    expect(v1).toBe(v2);
  });

  it("defaults to 4 octaves", () => {
    const withDefault = seamlessFbm(0.5, 0.5, perm);
    const withExplicit = seamlessFbm(0.5, 0.5, perm, 4);
    expect(withDefault).toBe(withExplicit);
  });

  it("produces different results with different octave counts", () => {
    const oct1 = seamlessFbm(0.5, 0.5, perm, 1);
    const oct4 = seamlessFbm(0.5, 0.5, perm, 4);
    const oct8 = seamlessFbm(0.5, 0.5, perm, 8);
    // Different octave counts should generally produce different values
    // (not guaranteed but very likely at non-trivial positions)
    expect(oct1 === oct4 && oct4 === oct8).toBe(false);
  });

  it("returns values in [-1, 1] range", () => {
    // FBM normalizes by maxValue, so output should be within [-1, 1]
    for (let i = 0; i < 100; i++) {
      const x = i / 100;
      const y = ((i * 7) % 100) / 100;
      const value = seamlessFbm(x, y, perm, 4);
      expect(value).toBeGreaterThanOrEqual(-1);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it("single octave equals seamlessPerlin2D with offset", () => {
    // With 1 octave, FBM(x,y) = amplitude * seamless(x + 0*17.3, y + 0*31.7) / amplitude
    // = seamlessPerlin2D(x, y)
    const x = 0.4;
    const y = 0.6;
    const fbm1 = seamlessFbm(x, y, perm, 1);
    const direct = seamlessPerlin2D(x, y, perm);
    expect(fbm1).toBeCloseTo(direct, 10);
  });
});

// ────────────────────────────────────────
// buildPerlinNoiseJS
// ────────────────────────────────────────

describe("buildPerlinNoiseJS", () => {
  it("returns a non-empty string", () => {
    const js = buildPerlinNoiseJS();
    expect(typeof js).toBe("string");
    expect(js.length).toBeGreaterThan(0);
  });

  it("contains the expected function definitions", () => {
    const js = buildPerlinNoiseJS();
    expect(js).toContain("function createPermutation(seed)");
    expect(js).toContain("function perlin2DPerm(x, y, perm)");
    expect(js).toContain("function seamlessPerlin2D(x, y, perm)");
    expect(js).toContain("function seamlessFbm(x, y, perm, octaves)");
    expect(js).toContain("function sampleNoiseCPU(worldX, worldZ, scale)");
  });

  it("contains the pre-built permutation table", () => {
    const js = buildPerlinNoiseJS();
    expect(js).toContain("_noisePerm");
    expect(js).toContain("createPermutation(12345)");
  });

  it("contains internal helper functions", () => {
    const js = buildPerlinNoiseJS();
    expect(js).toContain("function _fade(t)");
    expect(js).toContain("function _lerp(a, b, t)");
    expect(js).toContain("function _grad(hash, x, y)");
  });

  it("generates valid JavaScript that can be evaluated", () => {
    const js = buildPerlinNoiseJS();
    // Wrap in an IIFE and verify it executes without errors
    const wrapped = `(function() { ${js}; return { createPermutation, perlin2DPerm, seamlessPerlin2D, seamlessFbm, sampleNoiseCPU, _noisePerm }; })()`;
    const result = eval(wrapped);

    expect(result.createPermutation).toBeInstanceOf(Function);
    expect(result.perlin2DPerm).toBeInstanceOf(Function);
    expect(result.seamlessPerlin2D).toBeInstanceOf(Function);
    expect(result.seamlessFbm).toBeInstanceOf(Function);
    expect(result.sampleNoiseCPU).toBeInstanceOf(Function);
    expect(result._noisePerm).toHaveLength(512);
  });

  it("generated sampleNoiseCPU returns values in [0, 1]", () => {
    const js = buildPerlinNoiseJS();
    const wrapped = `(function() { ${js}; return { sampleNoiseCPU }; })()`;
    const result = eval(wrapped);

    for (let i = 0; i < 50; i++) {
      const x = (i - 25) * 10;
      const z = (i * 3 - 75) * 10;
      const value = result.sampleNoiseCPU(x, z, 0.01);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it("generated createPermutation matches TypeScript version", () => {
    const js = buildPerlinNoiseJS();
    const wrapped = `(function() { ${js}; return { createPermutation }; })()`;
    const result = eval(wrapped);

    const jsPerm = result.createPermutation(12345);
    const tsPerm = createPermutation(12345);
    expect(jsPerm).toEqual(tsPerm);
  });
});
