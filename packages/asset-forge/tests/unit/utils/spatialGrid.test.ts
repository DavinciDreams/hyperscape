import { describe, it, expect } from "vitest";
import { SpatialGrid } from "@/components/WorldStudio/utils/SpatialGrid";

describe("SpatialGrid", () => {
  // ── Basic insert & size ──

  describe("insert and size", () => {
    it("starts empty with size 0", () => {
      const grid = new SpatialGrid(10);
      expect(grid.size).toBe(0);
    });

    it("tracks size after insertions", () => {
      const grid = new SpatialGrid(10);
      grid.insert(5, 5);
      grid.insert(15, 15);
      grid.insert(25, 25);
      expect(grid.size).toBe(3);
    });

    it("allows multiple points in the same cell", () => {
      const grid = new SpatialGrid(100);
      grid.insert(1, 1);
      grid.insert(2, 2);
      grid.insert(3, 3);
      expect(grid.size).toBe(3);
    });
  });

  // ── clear ──

  describe("clear", () => {
    it("resets size to 0", () => {
      const grid = new SpatialGrid(10);
      grid.insert(5, 5);
      grid.insert(15, 15);
      grid.clear();
      expect(grid.size).toBe(0);
    });

    it("returns no results after clear", () => {
      const grid = new SpatialGrid(10);
      grid.insert(5, 5);
      grid.clear();
      expect(grid.nearest(5, 5)).toBeNull();
    });
  });

  // ── nearestDistance ──

  describe("nearestDistance", () => {
    it("returns Infinity for empty grid", () => {
      const grid = new SpatialGrid(10);
      expect(grid.nearestDistance(0, 0)).toBe(Infinity);
    });

    it("returns 0 for query at exact point location", () => {
      const grid = new SpatialGrid(10);
      grid.insert(5, 5);
      expect(grid.nearestDistance(5, 5)).toBe(0);
    });

    it("returns correct distance for known geometry", () => {
      const grid = new SpatialGrid(10);
      grid.insert(0, 0);
      // Point at (3, 4) → distance 5
      expect(grid.nearestDistance(3, 4)).toBeCloseTo(5, 6);
    });

    it("finds nearest among multiple points", () => {
      const grid = new SpatialGrid(10);
      grid.insert(0, 0);
      grid.insert(10, 0);
      grid.insert(20, 0);
      // Closest to (9, 0) is (10, 0) at distance 1
      expect(grid.nearestDistance(9, 0)).toBeCloseTo(1, 6);
    });
  });

  // ── nearest ──

  describe("nearest", () => {
    it("returns null for empty grid", () => {
      const grid = new SpatialGrid(10);
      expect(grid.nearest(0, 0)).toBeNull();
    });

    it("returns the only point with distance", () => {
      const grid = new SpatialGrid(10);
      grid.insert(3, 4);
      const result = grid.nearest(0, 0);
      expect(result).not.toBeNull();
      expect(result!.x).toBe(3);
      expect(result!.z).toBe(4);
      expect(result!.distance).toBeCloseTo(5, 6);
    });

    it("returns the closest of multiple points", () => {
      const grid = new SpatialGrid(10);
      grid.insert(0, 0);
      grid.insert(5, 0);
      grid.insert(20, 0);
      const result = grid.nearest(4, 0);
      expect(result).not.toBeNull();
      expect(result!.x).toBe(5);
      expect(result!.z).toBe(0);
      expect(result!.distance).toBeCloseTo(1, 6);
    });
  });

  // ── queryRadius ──

  describe("queryRadius", () => {
    it("returns empty array for empty grid", () => {
      const grid = new SpatialGrid(10);
      expect(grid.queryRadius(0, 0, 100)).toEqual([]);
    });

    it("finds points within radius", () => {
      const grid = new SpatialGrid(10);
      grid.insert(1, 0);
      grid.insert(5, 0);
      grid.insert(20, 0);

      const results = grid.queryRadius(0, 0, 6);
      const xs = results.map((r) => r.x).sort();
      expect(xs).toEqual([1, 5]);
    });

    it("includes points exactly on the radius boundary", () => {
      const grid = new SpatialGrid(10);
      grid.insert(3, 4); // distance 5 from origin
      const results = grid.queryRadius(0, 0, 5);
      expect(results).toHaveLength(1);
    });

    it("excludes points outside radius", () => {
      const grid = new SpatialGrid(10);
      grid.insert(10, 10);
      const results = grid.queryRadius(0, 0, 5);
      expect(results).toHaveLength(0);
    });

    it("works with larger radius spanning multiple cells", () => {
      const grid = new SpatialGrid(5);
      // Place points across many cells
      for (let x = 0; x < 50; x += 3) {
        grid.insert(x, 0);
      }
      // Query a large radius
      const results = grid.queryRadius(25, 0, 10);
      // Should find points from x=15 to x=35 (within 10m of x=25)
      for (const r of results) {
        expect(Math.abs(r.x - 25)).toBeLessThanOrEqual(10);
      }
      expect(results.length).toBeGreaterThan(0);
    });
  });

  // ── With associated data ──

  describe("with associated data", () => {
    it("stores and retrieves data", () => {
      const grid = new SpatialGrid<string>(10);
      grid.insert(5, 5, "hello");
      const result = grid.nearest(5, 5);
      expect(result).not.toBeNull();
      expect(result!.data).toBe("hello");
    });

    it("queryRadius returns data", () => {
      const grid = new SpatialGrid<{ type: string }>(10);
      grid.insert(1, 1, { type: "mob" });
      grid.insert(2, 2, { type: "resource" });
      const results = grid.queryRadius(0, 0, 10);
      const types = results.map((r) => r.data.type).sort();
      expect(types).toEqual(["mob", "resource"]);
    });
  });

  // ── Cell boundary edge cases ──

  describe("cell boundary behavior", () => {
    it("finds points across cell boundaries", () => {
      const grid = new SpatialGrid(10);
      // Point at cell boundary: just inside cell (0, 0)
      grid.insert(9.99, 9.99);
      // Query from just inside cell (1, 1)
      const result = grid.nearest(10.01, 10.01);
      expect(result).not.toBeNull();
      expect(result!.distance).toBeLessThan(1);
    });

    it("handles negative coordinates", () => {
      const grid = new SpatialGrid(10);
      grid.insert(-5, -5);
      grid.insert(5, 5);
      const result = grid.nearest(-4, -4);
      expect(result).not.toBeNull();
      expect(result!.x).toBe(-5);
      expect(result!.z).toBe(-5);
    });

    it("handles points at the origin", () => {
      const grid = new SpatialGrid(10);
      grid.insert(0, 0);
      const result = grid.nearest(0, 0);
      expect(result).not.toBeNull();
      expect(result!.distance).toBe(0);
    });
  });
});
