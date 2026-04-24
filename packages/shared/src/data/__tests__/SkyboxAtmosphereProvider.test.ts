/**
 * Tests for the SkyboxAtmosphereProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { skyboxAtmosphereProvider } from "../SkyboxAtmosphereProvider";

beforeEach(() => {
  skyboxAtmosphereProvider.unload();
});
afterEach(() => {
  skyboxAtmosphereProvider.unload();
});

const validSkybox = {
  id: "defaultSky",
  name: "Default Sky",
  sun: { direction: { x: 0, y: 1, z: 0 } },
  moon: { direction: { x: 0, y: -1, z: 0 } },
};

const validManifest = {
  skyboxes: [validSkybox],
  activeSkyboxId: "defaultSky",
};

describe("SkyboxAtmosphereProvider", () => {
  it("starts unloaded", () => {
    expect(skyboxAtmosphereProvider.isLoaded()).toBe(false);
    expect(skyboxAtmosphereProvider.getManifest()).toBeNull();
  });

  it("loadRaw() accepts a valid manifest", () => {
    const parsed = skyboxAtmosphereProvider.loadRaw(validManifest);
    expect(parsed.skyboxes.length).toBe(1);
    expect(parsed.activeSkyboxId).toBe("defaultSky");
    expect(skyboxAtmosphereProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() rejects empty skyboxes array", () => {
    expect(() =>
      skyboxAtmosphereProvider.loadRaw({
        skyboxes: [],
        activeSkyboxId: "defaultSky",
      }),
    ).toThrow();
  });

  it("loadRaw() rejects duplicate skybox ids", () => {
    expect(() =>
      skyboxAtmosphereProvider.loadRaw({
        skyboxes: [validSkybox, { ...validSkybox }],
        activeSkyboxId: "defaultSky",
      }),
    ).toThrow();
  });

  it("loadRaw() rejects activeSkyboxId that doesn't resolve", () => {
    expect(() =>
      skyboxAtmosphereProvider.loadRaw({
        skyboxes: [validSkybox],
        activeSkyboxId: "nonexistent",
      }),
    ).toThrow();
  });

  it("loadRaw() rejects zero-vector sun direction", () => {
    expect(() =>
      skyboxAtmosphereProvider.loadRaw({
        skyboxes: [
          {
            ...validSkybox,
            sun: { direction: { x: 0, y: 0, z: 0 } },
          },
        ],
        activeSkyboxId: "defaultSky",
      }),
    ).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = skyboxAtmosphereProvider.loadRaw(validManifest);
    skyboxAtmosphereProvider.unload();
    skyboxAtmosphereProvider.load(parsed);
    expect(skyboxAtmosphereProvider.isLoaded()).toBe(true);
  });

  it("hotReload(null) clears the manifest", () => {
    skyboxAtmosphereProvider.loadRaw(validManifest);
    skyboxAtmosphereProvider.hotReload(null);
    expect(skyboxAtmosphereProvider.isLoaded()).toBe(false);
  });

  it("unload() clears a loaded manifest", () => {
    skyboxAtmosphereProvider.loadRaw(validManifest);
    skyboxAtmosphereProvider.unload();
    expect(skyboxAtmosphereProvider.isLoaded()).toBe(false);
  });

  it("singleton returns the same instance", () => {
    const a = skyboxAtmosphereProvider;
    const b = skyboxAtmosphereProvider;
    expect(a).toBe(b);
  });
});
