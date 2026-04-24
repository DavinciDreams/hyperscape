/**
 * Tests for the PostProcessVolumesProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { postProcessVolumesProvider } from "../PostProcessVolumesProvider";

beforeEach(() => {
  postProcessVolumesProvider.unload();
});
afterEach(() => {
  postProcessVolumesProvider.unload();
});

const validManifest = [
  {
    id: "global.fallback",
    name: "Global Fallback",
    shape: { kind: "unbounded" as const },
    overrides: { saturation: 1.05 },
  },
  {
    id: "cave.dim",
    name: "Cave Dim",
    priority: 10,
    blendDistanceMeters: 2,
    shape: {
      kind: "aabb" as const,
      min: { x: -10, y: -10, z: -10 },
      max: { x: 10, y: 10, z: 10 },
    },
    overrides: { exposureBiasStops: -1, saturation: 0.8 },
  },
  {
    id: "boss.spotlight",
    name: "Boss Spotlight",
    priority: 100,
    shape: {
      kind: "sphere" as const,
      center: { x: 0, y: 0, z: 0 },
      radius: 8,
    },
    overrides: { bloomStrength: 1.5, vignette: 0.3 },
  },
];

describe("PostProcessVolumesProvider", () => {
  it("starts unloaded", () => {
    expect(postProcessVolumesProvider.isLoaded()).toBe(false);
    expect(postProcessVolumesProvider.getManifest()).toBeNull();
    expect(postProcessVolumesProvider.getVolumes()).toEqual([]);
  });

  it("loadRaw() accepts a valid manifest and fills defaults", () => {
    const parsed = postProcessVolumesProvider.loadRaw(validManifest);
    expect(parsed.length).toBe(3);
    expect(parsed[0].priority).toBe(0);
    expect(parsed[0].blendDistanceMeters).toBe(0);
    expect(parsed[0].blendWeight).toBe(1);
    expect(parsed[0].enabled).toBe(true);
    expect(postProcessVolumesProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() accepts an empty array", () => {
    const parsed = postProcessVolumesProvider.loadRaw([]);
    expect(parsed).toEqual([]);
    expect(postProcessVolumesProvider.isLoaded()).toBe(true);
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = postProcessVolumesProvider.loadRaw(validManifest);
    postProcessVolumesProvider.unload();
    postProcessVolumesProvider.load(parsed);
    expect(postProcessVolumesProvider.isLoaded()).toBe(true);
    expect(postProcessVolumesProvider.getVolumes().length).toBe(3);
  });

  it("loadRaw() rejects duplicate volume ids", () => {
    const dup = [
      {
        id: "x",
        name: "A",
        shape: { kind: "unbounded" as const },
        overrides: {},
      },
      {
        id: "x",
        name: "B",
        shape: { kind: "unbounded" as const },
        overrides: {},
      },
    ];
    expect(() => postProcessVolumesProvider.loadRaw(dup)).toThrow();
    expect(postProcessVolumesProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects more than one unbounded volume", () => {
    const bad = [
      {
        id: "global.a",
        name: "A",
        shape: { kind: "unbounded" as const },
        overrides: {},
      },
      {
        id: "global.b",
        name: "B",
        shape: { kind: "unbounded" as const },
        overrides: {},
      },
    ];
    expect(() => postProcessVolumesProvider.loadRaw(bad)).toThrow();
    expect(postProcessVolumesProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects aabb where min > max componentwise", () => {
    const bad = [
      {
        id: "bad.aabb",
        name: "Bad AABB",
        shape: {
          kind: "aabb" as const,
          min: { x: 10, y: 10, z: 10 },
          max: { x: 0, y: 0, z: 0 },
        },
        overrides: {},
      },
    ];
    expect(() => postProcessVolumesProvider.loadRaw(bad)).toThrow();
    expect(postProcessVolumesProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects negative sphere radius", () => {
    const bad = [
      {
        id: "bad.sphere",
        name: "Bad Sphere",
        shape: {
          kind: "sphere" as const,
          center: { x: 0, y: 0, z: 0 },
          radius: -3,
        },
        overrides: {},
      },
    ];
    expect(() => postProcessVolumesProvider.loadRaw(bad)).toThrow();
    expect(postProcessVolumesProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects unknown shape kind", () => {
    const bad = [
      {
        id: "bad.kind",
        name: "Bad Kind",
        shape: { kind: "polygon" },
        overrides: {},
      },
    ];
    expect(() => postProcessVolumesProvider.loadRaw(bad)).toThrow();
    expect(postProcessVolumesProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects invalid id casing", () => {
    const bad = [
      {
        id: "BadId",
        name: "X",
        shape: { kind: "unbounded" as const },
        overrides: {},
      },
    ];
    expect(() => postProcessVolumesProvider.loadRaw(bad)).toThrow();
    expect(postProcessVolumesProvider.isLoaded()).toBe(false);
  });

  it("hotReload(manifest) replaces the current manifest", () => {
    postProcessVolumesProvider.loadRaw(validManifest);
    const replacement = postProcessVolumesProvider.loadRaw([
      {
        id: "only",
        name: "Only",
        shape: { kind: "unbounded" as const },
        overrides: {},
      },
    ]);
    postProcessVolumesProvider.hotReload(replacement);
    expect(postProcessVolumesProvider.getVolumes().length).toBe(1);
    expect(postProcessVolumesProvider.getVolumes()[0].id).toBe("only");
  });

  it("hotReload(null) clears", () => {
    postProcessVolumesProvider.loadRaw(validManifest);
    postProcessVolumesProvider.hotReload(null);
    expect(postProcessVolumesProvider.isLoaded()).toBe(false);
    expect(postProcessVolumesProvider.getVolumes()).toEqual([]);
  });

  it("unload() resets", () => {
    postProcessVolumesProvider.loadRaw(validManifest);
    postProcessVolumesProvider.unload();
    expect(postProcessVolumesProvider.isLoaded()).toBe(false);
    expect(postProcessVolumesProvider.getManifest()).toBeNull();
  });
});
