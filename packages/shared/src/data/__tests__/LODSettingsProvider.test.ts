/**
 * Tests for the LODSettingsProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { lodSettingsProvider } from "../LODSettingsProvider";

beforeEach(() => {
  lodSettingsProvider.unload();
});
afterEach(() => {
  lodSettingsProvider.unload();
});

const validManifest = {
  version: 1,
  distanceThresholds: {
    default: {
      lod1: 30,
      imposter: 80,
      fadeOut: 150,
    },
  },
  dissolve: {
    closeRangeStart: 0,
    closeRangeEnd: 1.5,
    transitionDuration: 0.25,
  },
};

describe("LODSettingsProvider", () => {
  it("starts unloaded", () => {
    expect(lodSettingsProvider.isLoaded()).toBe(false);
    expect(lodSettingsProvider.getManifest()).toBeNull();
  });

  it("loadRaw() rejects {} baseline — required fields are missing", () => {
    expect(() => lodSettingsProvider.loadRaw({})).toThrow();
  });

  it("loadRaw() accepts a valid manifest", () => {
    const parsed = lodSettingsProvider.loadRaw(validManifest);
    expect(parsed.version).toBe(1);
    expect(parsed.distanceThresholds.default!.lod1).toBe(30);
  });

  it("loadRaw() rejects non-positive version", () => {
    expect(() =>
      lodSettingsProvider.loadRaw({ ...validManifest, version: 0 }),
    ).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = lodSettingsProvider.loadRaw(validManifest);
    lodSettingsProvider.unload();
    lodSettingsProvider.load(parsed);
    expect(lodSettingsProvider.isLoaded()).toBe(true);
  });

  it("hotReload(null) clears the manifest", () => {
    lodSettingsProvider.loadRaw(validManifest);
    lodSettingsProvider.hotReload(null);
    expect(lodSettingsProvider.isLoaded()).toBe(false);
  });

  it("unload() clears a loaded manifest", () => {
    lodSettingsProvider.loadRaw(validManifest);
    lodSettingsProvider.unload();
    expect(lodSettingsProvider.isLoaded()).toBe(false);
  });

  it("singleton returns the same instance", () => {
    expect(lodSettingsProvider).toBe(lodSettingsProvider);
  });
});
