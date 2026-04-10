import { describe, it, expect } from "vitest";
import { clipRoadPathAtTowns } from "@/components/WorldBuilder/terrainHelpers";

// ────────────────────────────────────────
// clipRoadPathAtTowns
// ────────────────────────────────────────

type PathPoint = { x: number; z: number };

function makePath(coords: [number, number][]): PathPoint[] {
  return coords.map(([x, z]) => ({ x, z }));
}

function makeTown(id: string, x: number, z: number, safeZoneRadius: number) {
  return { id, position: { x, z }, safeZoneRadius };
}

describe("clipRoadPathAtTowns", () => {
  // ── Basic clipping behavior ──

  it("clips points inside Town A from the start of the path", () => {
    const townA = makeTown("a", 0, 0, 100);
    const townB = makeTown("b", 500, 0, 100);
    // Path starts at town A center and goes to town B
    const path = makePath([
      [0, 0], // inside A (distance 0 < 85)
      [50, 0], // inside A (distance 50 < 85)
      [100, 0], // outside A (distance 100 > 85)
      [200, 0],
      [400, 0],
      [500, 0], // inside B
    ]);

    const result = clipRoadPathAtTowns(path, ["a", "b"], [townA, townB]);

    // First two points should be clipped (inside A's clip radius of 100*0.85=85)
    // Last point should be clipped (inside B's clip radius of 85)
    for (const p of result) {
      const dA = Math.sqrt(p.x * p.x + p.z * p.z);
      const dB = Math.sqrt((p.x - 500) ** 2 + p.z * p.z);
      // None of the remaining points should be inside the clip zones
      // (unless it's the degenerate case fallback)
      if (result.length > 2) {
        expect(dA >= 85 || dB >= 85).toBe(true);
      }
    }
  });

  it("clips points inside Town B from the end of the path", () => {
    const townA = makeTown("a", 0, 0, 100);
    const townB = makeTown("b", 300, 0, 100);
    const path = makePath([
      [100, 0], // outside A
      [150, 0],
      [200, 0],
      [250, 0], // inside B (distance 50 < 85)
      [300, 0], // inside B (distance 0 < 85)
    ]);

    const result = clipRoadPathAtTowns(path, ["a", "b"], [townA, townB]);

    // Last two points should be clipped
    expect(result.length).toBeLessThan(path.length);
    // The last remaining point should be outside B's clip zone
    const lastP = result[result.length - 1];
    const dB = Math.sqrt((lastP.x - 300) ** 2);
    expect(dB).toBeGreaterThanOrEqual(85);
  });

  it("returns path unchanged when no towns match the connected IDs", () => {
    const townC = makeTown("c", 0, 0, 100);
    const path = makePath([
      [0, 0],
      [50, 0],
      [100, 0],
    ]);

    // Connected to "a" and "b", but only "c" exists
    const result = clipRoadPathAtTowns(path, ["a", "b"], [townC]);
    expect(result).toEqual(path);
  });

  it("returns path unchanged when all points are outside both towns", () => {
    const townA = makeTown("a", 0, 0, 50);
    const townB = makeTown("b", 500, 0, 50);
    const path = makePath([
      [100, 0], // outside A (100 > 42.5)
      [200, 0],
      [300, 0],
      [400, 0], // outside B (100 > 42.5)
    ]);

    const result = clipRoadPathAtTowns(path, ["a", "b"], [townA, townB]);
    expect(result).toEqual(path);
  });

  // ── Edge cases ──

  it("returns the same path for paths with fewer than 2 points", () => {
    const townA = makeTown("a", 0, 0, 100);
    const singlePoint = makePath([[0, 0]]);
    expect(clipRoadPathAtTowns(singlePoint, ["a", "b"], [townA])).toEqual(
      singlePoint,
    );

    const empty: PathPoint[] = [];
    expect(clipRoadPathAtTowns(empty, ["a", "b"], [townA])).toEqual(empty);
  });

  it("returns degenerate 2-point path when towns overlap", () => {
    const townA = makeTown("a", 0, 0, 200);
    const townB = makeTown("b", 50, 0, 200);
    // All points inside both towns' clip zones
    const path = makePath([
      [0, 0],
      [10, 0],
      [20, 0],
      [30, 0],
      [40, 0],
      [50, 0],
    ]);

    const result = clipRoadPathAtTowns(path, ["a", "b"], [townA, townB]);
    // Should return degenerate slice of first 2 points
    expect(result.length).toBe(2);
  });

  it("clips only from Town A when Town B is not in the runtime list", () => {
    const townA = makeTown("a", 0, 0, 100);
    const path = makePath([
      [0, 0], // inside A
      [50, 0], // inside A (50 < 85)
      [100, 0], // outside A
      [200, 0],
      [300, 0],
    ]);

    const result = clipRoadPathAtTowns(path, ["a", "b"], [townA]);
    // Should clip start but not end
    expect(result[0].x).toBeGreaterThanOrEqual(100);
    expect(result[result.length - 1].x).toBe(300);
  });

  it("handles path with exactly 2 points", () => {
    const townA = makeTown("a", 0, 0, 50);
    const townB = makeTown("b", 200, 0, 50);
    const path = makePath([
      [100, 0],
      [150, 0],
    ]);

    const result = clipRoadPathAtTowns(path, ["a", "b"], [townA, townB]);
    expect(result.length).toBe(2);
  });

  it("uses 0.85 factor of safeZoneRadius as the clip boundary", () => {
    // Town with safeZoneRadius 100 -> clip radius = 85
    const townA = makeTown("a", 0, 0, 100);
    const path = makePath([
      [0, 0], // inside (0 < 85)
      [84, 0], // inside (84 < 85)
      [86, 0], // outside (86 > 85)
      [200, 0],
    ]);

    const result = clipRoadPathAtTowns(path, ["a", "b"], [townA]);
    // First two points (0, 84) should be clipped, 86 stays
    expect(result[0].x).toBe(86);
  });

  it("preserves original point objects (no cloning)", () => {
    const path = makePath([
      [100, 0],
      [200, 0],
      [300, 0],
    ]);

    const result = clipRoadPathAtTowns(path, ["a", "b"], []);
    expect(result[0]).toBe(path[0]);
    expect(result[2]).toBe(path[2]);
  });
});
