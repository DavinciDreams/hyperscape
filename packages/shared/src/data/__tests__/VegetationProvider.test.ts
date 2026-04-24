/**
 * Tests for the VegetationProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { vegetationProvider } from "../VegetationProvider";

beforeEach(() => {
  vegetationProvider.unload();
});
afterEach(() => {
  vegetationProvider.unload();
});

const validManifest = {
  version: 1,
  assets: [],
};

describe("VegetationProvider", () => {
  it("starts unloaded", () => {
    expect(vegetationProvider.isLoaded()).toBe(false);
    expect(vegetationProvider.getManifest()).toBeNull();
  });

  it("loadRaw() rejects {} baseline — version + assets required", () => {
    expect(() => vegetationProvider.loadRaw({})).toThrow();
  });

  it("loadRaw() accepts a valid minimal manifest", () => {
    const parsed = vegetationProvider.loadRaw(validManifest);
    expect(parsed.version).toBe(1);
    expect(parsed.assets).toEqual([]);
  });

  it("loadRaw() rejects non-positive version", () => {
    expect(() =>
      vegetationProvider.loadRaw({ ...validManifest, version: 0 }),
    ).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = vegetationProvider.loadRaw(validManifest);
    vegetationProvider.unload();
    vegetationProvider.load(parsed);
    expect(vegetationProvider.isLoaded()).toBe(true);
  });

  it("hotReload(null) clears the manifest", () => {
    vegetationProvider.loadRaw(validManifest);
    vegetationProvider.hotReload(null);
    expect(vegetationProvider.isLoaded()).toBe(false);
  });

  it("unload() clears a loaded manifest", () => {
    vegetationProvider.loadRaw(validManifest);
    vegetationProvider.unload();
    expect(vegetationProvider.isLoaded()).toBe(false);
  });

  it("singleton returns the same instance", () => {
    expect(vegetationProvider).toBe(vegetationProvider);
  });
});
