import { describe, it, expect, vi } from "vitest";

/**
 * WorldBuilder terrain helper tests.
 *
 * Tests pure computational functions from terrainHelpers.ts and
 * DifficultyHeatmap.ts that don't require WebGPU or THREE scene objects.
 *
 * terrainHelpers.ts is mocked to avoid WebGPU imports — we re-test
 * clipRoadPathAtTowns and exercise DifficultyHeatmap pure functions.
 */

// ── Mock THREE/WebGPU to prevent WebGPU module init ──
vi.mock("three/webgpu", () => {
  class MockColor {
    r = 0;
    g = 0;
    b = 0;
    constructor(c?: number) {
      if (c !== undefined) {
        this.r = ((c >> 16) & 0xff) / 255;
        this.g = ((c >> 8) & 0xff) / 255;
        this.b = (c & 0xff) / 255;
      }
    }
    copy(other: MockColor) {
      this.r = other.r;
      this.g = other.g;
      this.b = other.b;
      return this;
    }
    lerp(other: MockColor, t: number) {
      this.r += (other.r - this.r) * t;
      this.g += (other.g - this.g) * t;
      this.b += (other.b - this.b) * t;
      return this;
    }
  }
  class MockMeshBasicNodeMaterial {
    transparent = false;
    opacity = 1;
    vertexColors = false;
    depthWrite = true;
    side = 0;
  }
  return {
    Color: MockColor,
    MeshBasicNodeMaterial: MockMeshBasicNodeMaterial,
    DoubleSide: 2,
    BufferGeometry: class {},
    BufferAttribute: class {},
    Mesh: class {},
    Group: class {
      name = "";
      visible = true;
      add() {}
      remove() {}
    },
  };
});

// Mock the procgen terrain import used by DifficultyHeatmap
vi.mock("@hyperscape/procgen/terrain", () => ({
  NoiseGenerator: class MockNoiseGenerator {
    constructor(_seed: number) {}
    simplex2D(x: number, _y: number): number {
      // Deterministic mock: return a simple sinusoidal value in [-1, 1]
      return Math.sin(x * 100);
    }
  },
}));

// Mock the @/utils/webgpu-renderer used by terrainHelpers
vi.mock("@/utils/webgpu-renderer", () => {
  class MockPlaneGeometry {
    attributes = { position: { count: 0 } };
    rotateX() {
      return this;
    }
    translate() {
      return this;
    }
    clone() {
      return new MockPlaneGeometry();
    }
  }
  class MockColor {
    r = 0;
    g = 0;
    b = 0;
    constructor(_c?: number) {}
  }
  return {
    THREE: {
      PlaneGeometry: MockPlaneGeometry,
      Color: MockColor,
      BufferAttribute: class {},
      DoubleSide: 2,
    },
  };
});

// Mock @hyperscape/shared for createTerrainMaterial
vi.mock("@hyperscape/shared", () => ({
  createTerrainMaterial: () => ({}),
}));

// Mock @hyperscape/shared/world for road functions
vi.mock("@hyperscape/shared/world", () => ({
  getRoadHeightAndInfluence: () => ({
    influence: 0,
    heightInfluence: 0,
    height: 0,
  }),
  computeRoadBounds: () => ({ minX: 0, maxX: 0, minZ: 0, maxZ: 0 }),
  ROAD_BLEND_WIDTH: 4,
  ROAD_MINIMUM_WIDTH: 3,
  calculateMineInfluenceAtPoint: () => ({ influence: 0, biomeIndex: 0 }),
  getMineEffectiveRadius: () => 10,
}));

import { clipRoadPathAtTowns } from "../terrainHelpers";
import {
  withBiomeDifficultyFallback,
  computeZoneDifficulty,
  DEFAULT_ZONE_DIFFICULTY_CONFIG,
  type TownInfo,
  type DangerSourceInfo,
} from "../DifficultyHeatmap";
import { NoiseGenerator } from "@hyperscape/procgen/terrain";

// ────────────────────────────────────────
// clipRoadPathAtTowns — additional edge-case coverage
// ────────────────────────────────────────

type PathPoint = { x: number; z: number };

function makePath(coords: [number, number][]): PathPoint[] {
  return coords.map(([x, z]) => ({ x, z }));
}

function makeTown(id: string, x: number, z: number, safeZoneRadius: number) {
  return { id, position: { x, z }, safeZoneRadius };
}

describe("clipRoadPathAtTowns — diagonal paths", () => {
  it("clips diagonal path points inside town zones", () => {
    // Town at origin, radius 100 => clip at 85
    const townA = makeTown("a", 0, 0, 100);
    // Diagonal path: points at distance sqrt(x^2 + z^2)
    const path = makePath([
      [0, 0], // dist 0 < 85 => clip
      [40, 40], // dist ~56.6 < 85 => clip
      [60, 60], // dist ~84.9 < 85 => clip
      [70, 70], // dist ~98.9 > 85 => keep
      [100, 100],
      [200, 200],
    ]);

    const result = clipRoadPathAtTowns(path, ["a", "b"], [townA]);
    // First three points inside clip radius
    expect(result[0].x).toBe(70);
    expect(result[0].z).toBe(70);
  });

  it("handles path where all points are inside one town", () => {
    const townA = makeTown("a", 0, 0, 1000); // Very large radius
    const path = makePath([
      [10, 0],
      [20, 0],
      [30, 0],
      [40, 0],
    ]);

    // All points inside town A, no town B => clips from start, degenerate
    const result = clipRoadPathAtTowns(path, ["a", "b"], [townA]);
    // Should return degenerate 2-point slice (start of path)
    expect(result.length).toBe(2);
  });

  it("preserves generic type properties beyond x and z", () => {
    type ExtendedPoint = { x: number; z: number; label: string };
    const path: ExtendedPoint[] = [
      { x: 100, z: 0, label: "first" },
      { x: 200, z: 0, label: "second" },
      { x: 300, z: 0, label: "third" },
    ];

    const result = clipRoadPathAtTowns(path, ["a", "b"], []);
    expect(result[0].label).toBe("first");
    expect(result[2].label).toBe("third");
  });
});

// ────────────────────────────────────────
// withBiomeDifficultyFallback
// ────────────────────────────────────────

describe("withBiomeDifficultyFallback", () => {
  it("uses the callback value when it returns > 0", () => {
    const lookup = withBiomeDifficultyFallback(() => 5);
    expect(lookup("plains")).toBe(5);
    expect(lookup("forest")).toBe(5);
  });

  it("falls back to built-in map when callback returns 0", () => {
    const lookup = withBiomeDifficultyFallback(() => 0);

    expect(lookup("plains")).toBe(0);
    expect(lookup("forest")).toBe(1);
    expect(lookup("swamp")).toBe(1);
    expect(lookup("mountains")).toBe(2);
    expect(lookup("desert")).toBe(2);
    expect(lookup("canyon")).toBe(2);
    expect(lookup("tundra")).toBe(3);
    expect(lookup("valley")).toBe(0);
    expect(lookup("lakes")).toBe(0);
  });

  it("returns 0 for unknown biomes when callback returns 0", () => {
    const lookup = withBiomeDifficultyFallback(() => 0);
    expect(lookup("unknown_biome")).toBe(0);
  });

  it("does not fall back when callback returns a negative value", () => {
    // Negative is still <= 0, so fallback should apply
    const lookup = withBiomeDifficultyFallback(() => -1);
    expect(lookup("forest")).toBe(1); // fallback
  });
});

// ────────────────────────────────────────
// computeZoneDifficulty
// ────────────────────────────────────────

describe("computeZoneDifficulty", () => {
  const noise = new NoiseGenerator(42);

  it("returns safe inside a town's safe zone", () => {
    const towns: TownInfo[] = [
      { position: { x: 0, z: 0 }, safeZoneRadius: 100 },
    ];

    const result = computeZoneDifficulty(
      10,
      10, // well inside the 100-radius safe zone
      "plains",
      0,
      noise,
      towns,
      [],
      5000,
    );

    expect(result.isSafe).toBe(true);
    expect(result.scalar).toBe(0);
  });

  it("returns non-safe outside a town", () => {
    const towns: TownInfo[] = [
      { position: { x: 0, z: 0 }, safeZoneRadius: 100 },
    ];

    const result = computeZoneDifficulty(
      500,
      500, // far outside
      "mountains",
      2,
      noise,
      towns,
      [],
      5000,
    );

    expect(result.isSafe).toBe(false);
    expect(result.scalar).toBeGreaterThan(0);
  });

  it("scalar increases with distance from town edge", () => {
    const towns: TownInfo[] = [
      { position: { x: 0, z: 0 }, safeZoneRadius: 100 },
    ];
    const config = { ...DEFAULT_ZONE_DIFFICULTY_CONFIG, noiseAmplitude: 0 };

    const near = computeZoneDifficulty(
      200,
      0,
      "plains",
      1,
      noise,
      towns,
      [],
      5000,
      config,
    );
    const far = computeZoneDifficulty(
      2000,
      0,
      "plains",
      1,
      noise,
      towns,
      [],
      5000,
      config,
    );

    expect(far.scalar).toBeGreaterThan(near.scalar);
  });

  it("harder biomes produce higher scalar at same distance", () => {
    const towns: TownInfo[] = [
      { position: { x: 0, z: 0 }, safeZoneRadius: 100 },
    ];
    const config = { ...DEFAULT_ZONE_DIFFICULTY_CONFIG, noiseAmplitude: 0 };

    const easy = computeZoneDifficulty(
      500,
      0,
      "plains",
      0,
      noise,
      towns,
      [],
      5000,
      config,
    );
    const hard = computeZoneDifficulty(
      500,
      0,
      "tundra",
      3,
      noise,
      towns,
      [],
      5000,
      config,
    );

    expect(hard.scalar).toBeGreaterThan(easy.scalar);
  });

  it("scalar is clamped to [0, 1]", () => {
    const towns: TownInfo[] = [
      { position: { x: 0, z: 0 }, safeZoneRadius: 10 },
    ];

    const result = computeZoneDifficulty(
      100000,
      100000, // extremely far
      "tundra",
      3,
      noise,
      towns,
      [],
      500,
    );

    expect(result.scalar).toBeLessThanOrEqual(1);
    expect(result.scalar).toBeGreaterThanOrEqual(0);
  });

  it("danger sources add to difficulty", () => {
    const towns: TownInfo[] = [
      { position: { x: 0, z: 0 }, safeZoneRadius: 50 },
    ];
    const config = { ...DEFAULT_ZONE_DIFFICULTY_CONFIG, noiseAmplitude: 0 };
    const dangerSources: DangerSourceInfo[] = [
      {
        position: { x: 300, z: 0 },
        radius: 200,
        intensity: 3,
        falloffCurve: 1,
      },
    ];

    const withoutDanger = computeZoneDifficulty(
      300,
      0,
      "plains",
      0,
      noise,
      towns,
      [],
      5000,
      config,
    );
    const withDanger = computeZoneDifficulty(
      300,
      0,
      "plains",
      0,
      noise,
      towns,
      dangerSources,
      5000,
      config,
    );

    expect(withDanger.scalar).toBeGreaterThan(withoutDanger.scalar);
  });

  it("returns safe when scalar < 0.01 outside town", () => {
    const towns: TownInfo[] = [
      { position: { x: 0, z: 0 }, safeZoneRadius: 100 },
    ];
    const config = { ...DEFAULT_ZONE_DIFFICULTY_CONFIG, noiseAmplitude: 0 };

    // Just outside town edge with easy biome and huge world radius
    const result = computeZoneDifficulty(
      101,
      0,
      "plains",
      0,
      noise,
      towns,
      [],
      500000,
      config,
    );

    // Distance from edge is ~1, worldRadiusFraction = 1.0, radius = 500000
    // distanceScalar = 1/500000 ~ 0, biomeModifier = 0.8
    // => scalar ~ 0 which is < 0.01
    expect(result.isSafe).toBe(true);
  });

  it("handles no towns (full wilderness)", () => {
    const config = { ...DEFAULT_ZONE_DIFFICULTY_CONFIG, noiseAmplitude: 0 };

    const result = computeZoneDifficulty(
      0,
      0,
      "mountains",
      2,
      noise,
      [],
      [],
      5000,
      config,
    );

    // No towns => nearestDist = worldRadius * 2 = 10000
    // distanceScalar = min(1, 10000 / 5000) = 1
    expect(result.isSafe).toBe(false);
    expect(result.scalar).toBeGreaterThan(0);
  });

  it("returns the biome name in the result", () => {
    const result = computeZoneDifficulty(
      500,
      500,
      "desert",
      2,
      noise,
      [],
      [],
      5000,
    );

    expect(result.biome).toBe("desert");
  });
});
