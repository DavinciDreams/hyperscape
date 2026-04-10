import { describe, it, expect } from "vitest";
import { poissonDiscSample } from "@/components/WorldStudio/utils/poissonDisc";
import {
  createSeededRng,
  dist2,
} from "@/components/WorldStudio/utils/procgenUtils";

function alwaysInBounds() {
  return true;
}

function neverInBounds() {
  return false;
}

const squareBounds = { minX: 0, maxX: 100, minZ: 0, maxZ: 100 };

describe("poissonDiscSample", () => {
  // ── Spacing guarantee ──

  it("maintains minimum spacing between all points", () => {
    const rng = createSeededRng(42);
    const minSpacing = 10;
    const points = poissonDiscSample(
      squareBounds,
      minSpacing,
      500,
      rng,
      alwaysInBounds,
    );

    const minSpacing2 = minSpacing * minSpacing;
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const d = dist2(points[i].x, points[i].z, points[j].x, points[j].z);
        expect(d).toBeGreaterThanOrEqual(minSpacing2 - 1e-6); // tiny epsilon for float
      }
    }
  });

  // ── Boundary adherence ──

  it("all points are within bounds", () => {
    const rng = createSeededRng(99);
    const points = poissonDiscSample(
      squareBounds,
      5,
      1000,
      rng,
      alwaysInBounds,
    );

    for (const p of points) {
      expect(p.x).toBeGreaterThanOrEqual(squareBounds.minX);
      expect(p.x).toBeLessThanOrEqual(squareBounds.maxX);
      expect(p.z).toBeGreaterThanOrEqual(squareBounds.minZ);
      expect(p.z).toBeLessThanOrEqual(squareBounds.maxZ);
    }
  });

  // ── Determinism ──

  it("produces identical results with the same seed", () => {
    const points1 = poissonDiscSample(
      squareBounds,
      8,
      200,
      createSeededRng(777),
      alwaysInBounds,
    );
    const points2 = poissonDiscSample(
      squareBounds,
      8,
      200,
      createSeededRng(777),
      alwaysInBounds,
    );

    expect(points1).toEqual(points2);
  });

  it("produces different results with different seeds", () => {
    const points1 = poissonDiscSample(
      squareBounds,
      8,
      200,
      createSeededRng(1),
      alwaysInBounds,
    );
    const points2 = poissonDiscSample(
      squareBounds,
      8,
      200,
      createSeededRng(2),
      alwaysInBounds,
    );

    // Very unlikely to be identical
    expect(points1).not.toEqual(points2);
  });

  // ── Max points cap ──

  it("respects maxPoints limit", () => {
    const rng = createSeededRng(42);
    const maxPoints = 10;
    const points = poissonDiscSample(
      squareBounds,
      2,
      maxPoints,
      rng,
      alwaysInBounds,
    );

    expect(points.length).toBeLessThanOrEqual(maxPoints);
  });

  // ── Generates points ──

  it("generates at least one point for a valid region", () => {
    const rng = createSeededRng(1);
    const points = poissonDiscSample(squareBounds, 5, 100, rng, alwaysInBounds);

    expect(points.length).toBeGreaterThan(0);
  });

  // ── Reasonable density ──

  it("fills a large region with many points for small spacing", () => {
    const rng = createSeededRng(55);
    const points = poissonDiscSample(
      { minX: 0, maxX: 200, minZ: 0, maxZ: 200 },
      5,
      5000,
      rng,
      alwaysInBounds,
    );

    // 200x200 area with 5m spacing — should generate many points
    expect(points.length).toBeGreaterThan(100);
  });

  // ── Edge cases ──

  it("returns empty array for zero-size bounds", () => {
    const rng = createSeededRng(1);
    const points = poissonDiscSample(
      { minX: 50, maxX: 50, minZ: 50, maxZ: 50 },
      5,
      100,
      rng,
      alwaysInBounds,
    );

    expect(points).toEqual([]);
  });

  it("returns empty array when inBounds always rejects", () => {
    const rng = createSeededRng(1);
    const points = poissonDiscSample(squareBounds, 5, 100, rng, neverInBounds);

    expect(points).toEqual([]);
  });

  it("respects custom boundary test", () => {
    // Only accept points in the upper-left quadrant
    const inUpperLeft = (x: number, z: number) => x < 50 && z < 50;
    const rng = createSeededRng(42);
    const points = poissonDiscSample(squareBounds, 5, 500, rng, inUpperLeft);

    expect(points.length).toBeGreaterThan(0);
    for (const p of points) {
      expect(p.x).toBeLessThan(50);
      expect(p.z).toBeLessThan(50);
    }
  });

  it("works with non-origin bounds", () => {
    const bounds = { minX: -100, maxX: -50, minZ: 200, maxZ: 300 };
    const rng = createSeededRng(10);
    const points = poissonDiscSample(bounds, 5, 500, rng, alwaysInBounds);

    expect(points.length).toBeGreaterThan(0);
    for (const p of points) {
      expect(p.x).toBeGreaterThanOrEqual(bounds.minX);
      expect(p.x).toBeLessThanOrEqual(bounds.maxX);
      expect(p.z).toBeGreaterThanOrEqual(bounds.minZ);
      expect(p.z).toBeLessThanOrEqual(bounds.maxZ);
    }
  });

  it("handles very large minSpacing relative to bounds", () => {
    const rng = createSeededRng(1);
    // Spacing of 90 in a 100x100 box — at most a few points
    const points = poissonDiscSample(
      squareBounds,
      90,
      100,
      rng,
      alwaysInBounds,
    );

    expect(points.length).toBeGreaterThan(0);
    expect(points.length).toBeLessThanOrEqual(4);
  });
});
