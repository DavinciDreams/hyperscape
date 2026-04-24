/**
 * Tests for the QualityPresetsProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { qualityPresetsProvider } from "../QualityPresetsProvider";

beforeEach(() => {
  qualityPresetsProvider.unload();
});
afterEach(() => {
  qualityPresetsProvider.unload();
});

const validPreset = {
  id: "medium",
  name: "Medium",
  shadowResolution: "2048" as const,
  shadowDistance: 100,
  reflections: "cubemap" as const,
  postProcess: {
    bloom: true,
    toneMapping: true,
    ssao: false,
    motionBlur: false,
    depthOfField: false,
    colorGrading: true,
    vignette: false,
  },
  particleDensity: 0.7,
};

describe("QualityPresetsProvider", () => {
  it("starts unloaded", () => {
    expect(qualityPresetsProvider.isLoaded()).toBe(false);
    expect(qualityPresetsProvider.getManifest()).toBeNull();
  });

  it("loadRaw() rejects empty array — min(1) refinement", () => {
    expect(() => qualityPresetsProvider.loadRaw([])).toThrow();
  });

  it("loadRaw() accepts a valid single preset", () => {
    const parsed = qualityPresetsProvider.loadRaw([validPreset]);
    expect(parsed.length).toBe(1);
    expect(parsed[0]!.id).toBe("medium");
  });

  it("loadRaw() rejects duplicate preset ids", () => {
    expect(() =>
      qualityPresetsProvider.loadRaw([validPreset, { ...validPreset }]),
    ).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = qualityPresetsProvider.loadRaw([validPreset]);
    qualityPresetsProvider.unload();
    qualityPresetsProvider.load(parsed);
    expect(qualityPresetsProvider.isLoaded()).toBe(true);
  });

  it("hotReload(null) clears the manifest", () => {
    qualityPresetsProvider.loadRaw([validPreset]);
    qualityPresetsProvider.hotReload(null);
    expect(qualityPresetsProvider.isLoaded()).toBe(false);
  });

  it("unload() clears a loaded manifest", () => {
    qualityPresetsProvider.loadRaw([validPreset]);
    qualityPresetsProvider.unload();
    expect(qualityPresetsProvider.isLoaded()).toBe(false);
  });

  it("singleton returns the same instance", () => {
    expect(qualityPresetsProvider).toBe(qualityPresetsProvider);
  });
});
