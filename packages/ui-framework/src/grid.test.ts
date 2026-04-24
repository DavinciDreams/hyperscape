import { describe, expect, it } from "vitest";
import {
  computeGridLines,
  snapBoxToGrid,
  snapPointToGrid,
  snapToGrid,
} from "./grid";

describe("snapToGrid", () => {
  it("rounds to the nearest multiple", () => {
    expect(snapToGrid(7, 8)).toBe(8);
    expect(snapToGrid(3, 8)).toBe(0);
    // 20/8 = 2.5 → Math.round rounds half up in JS (toward +∞) → 3*8 = 24
    expect(snapToGrid(20, 8)).toBe(24);
    expect(snapToGrid(21, 8)).toBe(24);
    expect(snapToGrid(19, 8)).toBe(16);
  });

  it("returns value unchanged when grid is non-positive", () => {
    expect(snapToGrid(13, 0)).toBe(13);
    expect(snapToGrid(13, -1)).toBe(13);
  });
});

describe("snapPointToGrid", () => {
  it("snaps both axes", () => {
    expect(snapPointToGrid({ x: 7, y: 17 }, 8)).toEqual({ x: 8, y: 16 });
  });
});

describe("snapBoxToGrid", () => {
  it("snaps the origin but preserves size", () => {
    const snapped = snapBoxToGrid({ x: 7, y: 17, width: 43, height: 51 }, 8);
    expect(snapped).toEqual({ x: 8, y: 16, width: 43, height: 51 });
  });
});

describe("computeGridLines", () => {
  it("separates minor and major lines by the multiplier", () => {
    const lines = computeGridLines({ width: 64, height: 32 }, 8, 4);
    // majorSize = 32
    // x lines: 0,8,16,24,32,40,48,56,64
    //   majors (multiple of 32): 0, 32, 64
    //   minors: 8, 16, 24, 40, 48, 56
    expect(lines.majorX).toEqual([0, 32, 64]);
    expect(lines.x).toEqual([8, 16, 24, 40, 48, 56]);
    // y: 0,8,16,24,32   majors = 0, 32
    expect(lines.majorY).toEqual([0, 32]);
    expect(lines.y).toEqual([8, 16, 24]);
  });

  it("returns empty arrays when grid is disabled", () => {
    expect(computeGridLines({ width: 1280, height: 720 }, 0)).toEqual({
      x: [],
      y: [],
      majorX: [],
      majorY: [],
    });
  });
});
