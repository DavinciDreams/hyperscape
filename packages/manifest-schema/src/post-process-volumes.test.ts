/**
 * Faithfulness + defensiveness tests for `PostProcessVolumeManifestSchema`.
 */

import { describe, expect, it } from "vitest";

import {
  PostProcessVolumeManifestSchema,
  type PostProcessVolumeManifest,
} from "./post-process-volumes.js";

const reference: PostProcessVolumeManifest = [
  {
    id: "world.global",
    name: "Global Fallback",
    priority: -1000,
    blendDistanceMeters: 0,
    blendWeight: 1,
    enabled: true,
    shape: { kind: "unbounded" },
    overrides: {
      saturation: 1,
      contrast: 1,
    },
  },
  {
    id: "dungeon.crypt",
    name: "Crypt Interior",
    priority: 10,
    blendDistanceMeters: 5,
    blendWeight: 1,
    enabled: true,
    shape: {
      kind: "aabb",
      min: { x: -50, y: -20, z: -50 },
      max: { x: 50, y: 20, z: 50 },
    },
    overrides: {
      exposureBiasStops: -1.5,
      saturation: 0.6,
      fogDensity: 0.8,
      fogColor: { r: 0.1, g: 0.1, b: 0.15 },
      vignette: 0.4,
    },
  },
  {
    id: "boss.arena",
    name: "Boss Arena",
    priority: 20,
    blendDistanceMeters: 2,
    blendWeight: 1,
    enabled: true,
    shape: {
      kind: "sphere",
      center: { x: 100, y: 0, z: 100 },
      radius: 30,
    },
    overrides: {
      bloomThreshold: 0.8,
      bloomStrength: 2.5,
      chromaticAberration: 0.15,
    },
  },
];

describe("PostProcessVolumeManifestSchema", () => {
  it("parses the reference manifest cleanly", () => {
    const result = PostProcessVolumeManifestSchema.safeParse(reference);
    if (!result.success) {
      throw new Error(
        `Reference manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("applies volume defaults", () => {
    const parsed = PostProcessVolumeManifestSchema.parse([
      {
        id: "v",
        name: "V",
        shape: { kind: "unbounded" },
        overrides: {},
      },
    ]);
    expect(parsed[0].priority).toBe(0);
    expect(parsed[0].blendDistanceMeters).toBe(0);
    expect(parsed[0].blendWeight).toBe(1);
    expect(parsed[0].enabled).toBe(true);
  });

  it("accepts empty manifest", () => {
    expect(PostProcessVolumeManifestSchema.safeParse([]).success).toBe(true);
  });

  it("rejects duplicate volume ids", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        shape: { kind: "sphere", center: { x: 0, y: 0, z: 0 }, radius: 5 },
        overrides: {},
      },
      {
        id: "a",
        name: "A2",
        shape: { kind: "sphere", center: { x: 10, y: 0, z: 0 }, radius: 5 },
        overrides: {},
      },
    ];
    expect(PostProcessVolumeManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects more than one unbounded volume", () => {
    const bad = [
      {
        id: "g1",
        name: "Global 1",
        shape: { kind: "unbounded" },
        overrides: {},
      },
      {
        id: "g2",
        name: "Global 2",
        shape: { kind: "unbounded" },
        overrides: {},
      },
    ];
    expect(PostProcessVolumeManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects aabb with min > max on any axis", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        shape: {
          kind: "aabb",
          min: { x: 10, y: 0, z: 0 },
          max: { x: 5, y: 10, z: 10 },
        },
        overrides: {},
      },
    ];
    expect(PostProcessVolumeManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects sphere with radius <= 0", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        shape: {
          kind: "sphere",
          center: { x: 0, y: 0, z: 0 },
          radius: 0,
        },
        overrides: {},
      },
    ];
    expect(PostProcessVolumeManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown shape kind", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        shape: { kind: "hyperboloid" },
        overrides: {},
      },
    ];
    expect(PostProcessVolumeManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects invalid volume id format", () => {
    const bad = [
      {
        id: "Has Spaces",
        name: "X",
        shape: { kind: "unbounded" },
        overrides: {},
      },
    ];
    expect(PostProcessVolumeManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects exposureBias outside [-16, 16]", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        shape: { kind: "unbounded" },
        overrides: { exposureBiasStops: 20 },
      },
    ];
    expect(PostProcessVolumeManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects saturation > 4", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        shape: { kind: "unbounded" },
        overrides: { saturation: 5 },
      },
    ];
    expect(PostProcessVolumeManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects vignette > 1", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        shape: { kind: "unbounded" },
        overrides: { vignette: 1.2 },
      },
    ];
    expect(PostProcessVolumeManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects fogColor channel out of range", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        shape: { kind: "unbounded" },
        overrides: { fogColor: { r: 1.2, g: 0.5, b: 0.5 } },
      },
    ];
    expect(PostProcessVolumeManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects blendWeight > 1", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        blendWeight: 2,
        shape: { kind: "unbounded" },
        overrides: {},
      },
    ];
    expect(PostProcessVolumeManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects priority outside [-1000, 1000]", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        priority: 2000,
        shape: { kind: "unbounded" },
        overrides: {},
      },
    ];
    expect(PostProcessVolumeManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts a single unbounded volume as global fallback", () => {
    const ok = [
      {
        id: "world.global",
        name: "Global",
        priority: -1000,
        shape: { kind: "unbounded" },
        overrides: { saturation: 1 },
      },
    ];
    expect(PostProcessVolumeManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("accepts disabled volume (A/B authoring)", () => {
    const ok = [
      {
        id: "a",
        name: "A",
        enabled: false,
        shape: { kind: "sphere", center: { x: 0, y: 0, z: 0 }, radius: 10 },
        overrides: {},
      },
    ];
    expect(PostProcessVolumeManifestSchema.safeParse(ok).success).toBe(true);
  });
});
