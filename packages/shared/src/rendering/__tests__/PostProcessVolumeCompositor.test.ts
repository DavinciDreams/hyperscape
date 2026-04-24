import { PostProcessVolumeManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import { PostProcessVolumeCompositor } from "../PostProcessVolumeCompositor.js";

function manifest() {
  return PostProcessVolumeManifestSchema.parse([
    {
      id: "fallback",
      name: "Global",
      priority: -1000,
      blendDistanceMeters: 0,
      blendWeight: 1,
      shape: { kind: "unbounded" },
      overrides: {
        saturation: 1,
        fogDensity: 0.01,
        fogColor: { r: 0.5, g: 0.5, b: 0.5 },
      },
    },
    {
      id: "cave",
      name: "Cave",
      priority: 10,
      blendDistanceMeters: 5,
      blendWeight: 1,
      shape: {
        kind: "sphere",
        center: { x: 0, y: 0, z: 0 },
        radius: 10,
      },
      overrides: {
        saturation: 0.2,
        fogDensity: 0.2,
        fogColor: { r: 0.05, g: 0.05, b: 0.1 },
      },
    },
    {
      id: "lava-room",
      name: "Lava Room",
      priority: 20,
      blendDistanceMeters: 2,
      blendWeight: 1,
      shape: {
        kind: "aabb",
        min: { x: -2, y: -2, z: -2 },
        max: { x: 2, y: 2, z: 2 },
      },
      overrides: {
        saturation: 1.6,
        exposureBiasStops: 1.2,
        fogColor: { r: 1, g: 0.2, b: 0 },
      },
    },
  ]);
}

describe("PostProcessVolumeCompositor — shape + weight", () => {
  it("unbounded volume always contributes", () => {
    const c = new PostProcessVolumeCompositor(manifest());
    const active = c.resolveAt({ x: 1000, y: 1000, z: 1000 });
    expect(active.map((a) => a.volume.id)).toContain("fallback");
  });

  it("sphere volume includes point inside radius at full weight", () => {
    const c = new PostProcessVolumeCompositor(manifest());
    const active = c.resolveAt({ x: 0, y: 0, z: 0 });
    const cave = active.find((a) => a.volume.id === "cave");
    expect(cave?.weight).toBe(1);
  });

  it("sphere volume fades across blendDistanceMeters", () => {
    const c = new PostProcessVolumeCompositor(manifest());
    // radius=10, blend=5 → distance 12.5 is halfway through the fade
    const active = c.resolveAt({ x: 12.5, y: 0, z: 0 });
    const cave = active.find((a) => a.volume.id === "cave");
    expect(cave?.weight).toBeCloseTo(0.5, 5);
  });

  it("sphere volume drops out beyond radius + blendDistance", () => {
    const c = new PostProcessVolumeCompositor(manifest());
    const active = c.resolveAt({ x: 100, y: 0, z: 0 });
    expect(active.find((a) => a.volume.id === "cave")).toBeUndefined();
  });

  it("aabb volume includes interior points at full weight", () => {
    const c = new PostProcessVolumeCompositor(manifest());
    const active = c.resolveAt({ x: 0, y: 0, z: 0 });
    const lava = active.find((a) => a.volume.id === "lava-room");
    expect(lava?.weight).toBe(1);
  });

  it("aabb volume fades outside the box", () => {
    const c = new PostProcessVolumeCompositor(manifest());
    // box reaches (2,2,2), blend=2. point at (3,0,0) → 1m outside → weight 0.5
    const active = c.resolveAt({ x: 3, y: 0, z: 0 });
    const lava = active.find((a) => a.volume.id === "lava-room");
    expect(lava?.weight).toBeCloseTo(0.5, 5);
  });

  it("disabled volumes are skipped", () => {
    const c = new PostProcessVolumeCompositor(
      PostProcessVolumeManifestSchema.parse([
        {
          id: "off",
          name: "Off",
          enabled: false,
          shape: { kind: "unbounded" },
          overrides: { saturation: 0 },
        },
      ]),
    );
    expect(c.resolveAt({ x: 0, y: 0, z: 0 })).toEqual([]);
  });

  it("no blendDistance + outside → weight 0", () => {
    const c = new PostProcessVolumeCompositor(
      PostProcessVolumeManifestSchema.parse([
        {
          id: "hard-box",
          name: "Hard",
          blendDistanceMeters: 0,
          shape: {
            kind: "aabb",
            min: { x: -1, y: -1, z: -1 },
            max: { x: 1, y: 1, z: 1 },
          },
          overrides: { saturation: 2 },
        },
      ]),
    );
    expect(c.resolveAt({ x: 2, y: 0, z: 0 })).toEqual([]);
  });
});

describe("PostProcessVolumeCompositor — ordering", () => {
  it("active volumes are returned priority-descending", () => {
    const c = new PostProcessVolumeCompositor(manifest());
    const active = c.resolveAt({ x: 0, y: 0, z: 0 });
    expect(active.map((a) => a.volume.id)).toEqual([
      "lava-room", // prio 20
      "cave", // prio 10
      "fallback", // prio -1000
    ]);
  });
});

describe("PostProcessVolumeCompositor — composeOverrides", () => {
  it("picks highest-priority fully-inside overrides first", () => {
    const c = new PostProcessVolumeCompositor(manifest());
    const ov = c.composeOverrides({ x: 0, y: 0, z: 0 });
    // lava-room eats the full budget at prio 20, so its overrides win
    expect(ov.saturation).toBe(1.6);
    expect(ov.exposureBiasStops).toBe(1.2);
    expect(ov.fogColor).toEqual({ r: 1, g: 0.2, b: 0 });
  });

  it("returns an unbounded fallback's overrides when outside all region volumes", () => {
    const c = new PostProcessVolumeCompositor(manifest());
    const ov = c.composeOverrides({ x: 1000, y: 1000, z: 1000 });
    expect(ov.saturation).toBe(1);
    expect(ov.fogDensity).toBe(0.01);
  });

  it("fields not set by any active volume are absent", () => {
    const c = new PostProcessVolumeCompositor(manifest());
    const ov = c.composeOverrides({ x: 1000, y: 1000, z: 1000 });
    // fallback only sets saturation/fogDensity/fogColor
    expect(ov.bloomStrength).toBeUndefined();
    expect(ov.vignette).toBeUndefined();
  });

  it("blends two volumes with partial weights", () => {
    const c = new PostProcessVolumeCompositor(
      PostProcessVolumeManifestSchema.parse([
        {
          id: "low",
          name: "Low",
          priority: 0,
          blendWeight: 1,
          shape: { kind: "unbounded" },
          overrides: { saturation: 0 },
        },
        {
          id: "high",
          name: "High",
          priority: 10,
          blendWeight: 0.5, // eats half the budget
          shape: {
            kind: "sphere",
            center: { x: 0, y: 0, z: 0 },
            radius: 1000,
          },
          overrides: { saturation: 1 },
        },
      ]),
    );
    const ov = c.composeOverrides({ x: 0, y: 0, z: 0 });
    // high consumes 0.5 first with saturation=1; low consumes the
    // remaining 0.5 with saturation=0 → blend(1, 0, 0.5/1.0) = 0.5
    expect(ov.saturation).toBeCloseTo(0.5, 5);
  });

  it("composes color overrides componentwise", () => {
    const c = new PostProcessVolumeCompositor(
      PostProcessVolumeManifestSchema.parse([
        {
          id: "low",
          name: "Low",
          priority: 0,
          blendWeight: 0.5,
          shape: { kind: "unbounded" },
          overrides: { fogColor: { r: 0, g: 0, b: 0 } },
        },
        {
          id: "high",
          name: "High",
          priority: 10,
          blendWeight: 0.5,
          shape: {
            kind: "sphere",
            center: { x: 0, y: 0, z: 0 },
            radius: 1000,
          },
          overrides: { fogColor: { r: 1, g: 1, b: 1 } },
        },
      ]),
    );
    const ov = c.composeOverrides({ x: 0, y: 0, z: 0 });
    // high at 0.5 → (1,1,1); low at 0.5 blends (0,0,0) with alpha=0.5 → (0.5,0.5,0.5)
    expect(ov.fogColor?.r).toBeCloseTo(0.5, 5);
    expect(ov.fogColor?.g).toBeCloseTo(0.5, 5);
    expect(ov.fogColor?.b).toBeCloseTo(0.5, 5);
  });

  it("returns an empty object when no volumes are active", () => {
    const c = new PostProcessVolumeCompositor(
      PostProcessVolumeManifestSchema.parse([
        {
          id: "tiny",
          name: "Tiny",
          blendDistanceMeters: 0,
          shape: {
            kind: "sphere",
            center: { x: 0, y: 0, z: 0 },
            radius: 1,
          },
          overrides: { saturation: 0 },
        },
      ]),
    );
    expect(c.composeOverrides({ x: 100, y: 100, z: 100 })).toEqual({});
  });
});
