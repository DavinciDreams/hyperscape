/**
 * Tests for the LightingBakeProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { lightingBakeProvider } from "../LightingBakeProvider";

beforeEach(() => {
  lightingBakeProvider.unload();
});
afterEach(() => {
  lightingBakeProvider.unload();
});

describe("LightingBakeProvider", () => {
  it("starts unloaded", () => {
    expect(lightingBakeProvider.isLoaded()).toBe(false);
    expect(lightingBakeProvider.getManifest()).toBeNull();
  });

  it("loadRaw() accepts {} baseline — every field has a default", () => {
    const parsed = lightingBakeProvider.loadRaw({});
    expect(parsed.skipBake).toBe(false);
    expect(lightingBakeProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() rejects non-power-of-two lightmapMaxAtlasSize", () => {
    expect(() =>
      lightingBakeProvider.loadRaw({ lightmapMaxAtlasSize: 1000 }),
    ).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = lightingBakeProvider.loadRaw({});
    lightingBakeProvider.unload();
    lightingBakeProvider.load(parsed);
    expect(lightingBakeProvider.isLoaded()).toBe(true);
  });

  it("hotReload(null) clears the manifest", () => {
    lightingBakeProvider.loadRaw({});
    lightingBakeProvider.hotReload(null);
    expect(lightingBakeProvider.isLoaded()).toBe(false);
  });

  it("unload() clears a loaded manifest", () => {
    lightingBakeProvider.loadRaw({});
    lightingBakeProvider.unload();
    expect(lightingBakeProvider.isLoaded()).toBe(false);
  });

  it("singleton returns the same instance", () => {
    expect(lightingBakeProvider).toBe(lightingBakeProvider);
  });
});
