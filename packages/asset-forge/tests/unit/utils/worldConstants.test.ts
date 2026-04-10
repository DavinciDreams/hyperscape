import { describe, it, expect } from "vitest";
import {
  getWorldRadius,
  getTownSafeRadius,
  MIN_MOB_SPACING,
  MIN_RESOURCE_SPACING,
  MIN_STATION_SPACING,
  BASE_MOB_DENSITY,
  BASE_RESOURCE_DENSITY,
  HAND_PLACED_ENTITY_BUFFER,
  VEGETATION_BUFFER,
  TOWN_STATION_SEARCH_RADIUS,
} from "@/components/WorldStudio/utils/worldConstants";

// ────────────────────────────────────────
// getWorldRadius
// ────────────────────────────────────────

describe("getWorldRadius", () => {
  it("computes radius as worldSize * tileSize / 2", () => {
    const config = { terrain: { worldSize: 10, tileSize: 64 } };
    expect(getWorldRadius(config)).toBe(320); // 10 * 64 / 2
  });

  it("returns 0 for worldSize of 0", () => {
    const config = { terrain: { worldSize: 0, tileSize: 64 } };
    expect(getWorldRadius(config)).toBe(0);
  });

  it("returns 0 for tileSize of 0", () => {
    const config = { terrain: { worldSize: 10, tileSize: 0 } };
    expect(getWorldRadius(config)).toBe(0);
  });

  it("handles large world sizes", () => {
    const config = { terrain: { worldSize: 256, tileSize: 128 } };
    expect(getWorldRadius(config)).toBe(16384); // 256 * 128 / 2
  });

  it("handles fractional tile sizes", () => {
    const config = { terrain: { worldSize: 10, tileSize: 6.5 } };
    expect(getWorldRadius(config)).toBeCloseTo(32.5);
  });

  it("handles worldSize of 1 (minimal world)", () => {
    const config = { terrain: { worldSize: 1, tileSize: 100 } };
    expect(getWorldRadius(config)).toBe(50);
  });
});

// ────────────────────────────────────────
// getTownSafeRadius
// ────────────────────────────────────────

describe("getTownSafeRadius", () => {
  it("returns explicit safeZoneRadius when provided", () => {
    expect(getTownSafeRadius({ safeZoneRadius: 120 })).toBe(120);
  });

  it("returns explicit safeZoneRadius of 0", () => {
    expect(getTownSafeRadius({ safeZoneRadius: 0 })).toBe(0);
  });

  it("returns 80 for size 'town' when no explicit radius", () => {
    expect(getTownSafeRadius({ size: "town" })).toBe(80);
  });

  it("returns 50 for size 'village' when no explicit radius", () => {
    expect(getTownSafeRadius({ size: "village" })).toBe(50);
  });

  it("returns 30 for unknown size when no explicit radius", () => {
    expect(getTownSafeRadius({ size: "hamlet" })).toBe(30);
  });

  it("returns 30 when neither safeZoneRadius nor size is provided", () => {
    expect(getTownSafeRadius({})).toBe(30);
  });

  it("prefers explicit safeZoneRadius over size heuristic", () => {
    expect(getTownSafeRadius({ safeZoneRadius: 200, size: "village" })).toBe(
      200,
    );
  });

  it("returns 30 for undefined size", () => {
    expect(getTownSafeRadius({ size: undefined })).toBe(30);
  });
});

// ────────────────────────────────────────
// Exported constants
// ────────────────────────────────────────

describe("worldConstants exported values", () => {
  it("exports positive spacing constants", () => {
    expect(MIN_MOB_SPACING).toBeGreaterThan(0);
    expect(MIN_RESOURCE_SPACING).toBeGreaterThan(0);
    expect(MIN_STATION_SPACING).toBeGreaterThan(0);
  });

  it("exports positive density constants", () => {
    expect(BASE_MOB_DENSITY).toBeGreaterThan(0);
    expect(BASE_RESOURCE_DENSITY).toBeGreaterThan(0);
  });

  it("exports positive buffer constants", () => {
    expect(HAND_PLACED_ENTITY_BUFFER).toBeGreaterThan(0);
    expect(VEGETATION_BUFFER).toBeGreaterThan(0);
  });

  it("exports positive town station search radius", () => {
    expect(TOWN_STATION_SEARCH_RADIUS).toBeGreaterThan(0);
  });
});
