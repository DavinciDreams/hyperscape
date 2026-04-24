/**
 * Tests for the WorldAreasProvider singleton.
 *
 * Safe baseline: 5 empty records (all area categories empty).
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { worldAreasProvider } from "../WorldAreasProvider";

const BASELINE = {
  starterTowns: {},
  level1Areas: {},
  level2Areas: {},
  level3Areas: {},
  specialAreas: {},
};

beforeEach(() => {
  worldAreasProvider.unload();
});
afterEach(() => {
  worldAreasProvider.unload();
});

describe("WorldAreasProvider", () => {
  it("starts unloaded", () => {
    expect(worldAreasProvider.isLoaded()).toBe(false);
    expect(worldAreasProvider.getManifest()).toBeNull();
  });

  it("loadRaw() accepts the 5-empty-records baseline", () => {
    const parsed = worldAreasProvider.loadRaw(BASELINE);
    expect(parsed.starterTowns).toEqual({});
    expect(parsed.level1Areas).toEqual({});
    expect(worldAreasProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() rejects {} — all 5 category records required", () => {
    expect(() => worldAreasProvider.loadRaw({})).toThrow();
  });

  it("loadRaw() rejects missing category", () => {
    const { level3Areas: _omit, ...partial } = BASELINE;
    expect(() => worldAreasProvider.loadRaw(partial)).toThrow();
  });

  it("loadRaw() rejects non-record category value", () => {
    expect(() =>
      worldAreasProvider.loadRaw({ ...BASELINE, starterTowns: "nope" }),
    ).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = worldAreasProvider.loadRaw(BASELINE);
    worldAreasProvider.unload();
    worldAreasProvider.load(parsed);
    expect(worldAreasProvider.isLoaded()).toBe(true);
  });

  it("hotReload(null) clears the manifest", () => {
    worldAreasProvider.loadRaw(BASELINE);
    worldAreasProvider.hotReload(null);
    expect(worldAreasProvider.isLoaded()).toBe(false);
  });

  it("singleton returns the same instance", () => {
    expect(worldAreasProvider).toBe(worldAreasProvider);
  });
});
