/**
 * Tests for the BiomesProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { biomesProvider } from "../BiomesProvider";

beforeEach(() => {
  biomesProvider.unload();
});
afterEach(() => {
  biomesProvider.unload();
});

const validBiome = {
  id: "grassland",
  name: "Grassland",
  description: "Rolling green hills",
  difficultyLevel: 1,
  terrain: "grass",
  resources: ["tree_oak"],
  mobs: ["goblin"],
  fogIntensity: 0.2,
  ambientSound: "asset://sfx/ambient/grassland.ogg",
  colorScheme: {
    primary: "#4a9a4a",
    secondary: "#7ac07a",
    fog: "#d0e8d0",
  },
  color: 0x4a9a4a,
  heightRange: [0, 10] as [number, number],
  terrainMultiplier: 1,
  waterLevel: 0,
  maxSlope: 0.7,
  mobTypes: ["goblin"],
  difficulty: 1,
  baseHeight: 0,
  heightVariation: 2,
  resourceDensity: 0.3,
  resourceTypes: ["tree"],
  vegetation: { enabled: true, layers: [] },
};

describe("BiomesProvider", () => {
  it("starts unloaded", () => {
    expect(biomesProvider.isLoaded()).toBe(false);
    expect(biomesProvider.getManifest()).toBeNull();
  });

  it("loadRaw() accepts empty array baseline", () => {
    const parsed = biomesProvider.loadRaw([]);
    expect(parsed.length).toBe(0);
    expect(biomesProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() accepts a valid biome entry", () => {
    const parsed = biomesProvider.loadRaw([validBiome]);
    expect(parsed.length).toBe(1);
    expect(parsed[0]!.id).toBe("grassland");
  });

  it("loadRaw() rejects invalid hex color", () => {
    const bad = {
      ...validBiome,
      colorScheme: { ...validBiome.colorScheme, primary: "notahex" },
    };
    expect(() => biomesProvider.loadRaw([bad])).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = biomesProvider.loadRaw([validBiome]);
    biomesProvider.unload();
    biomesProvider.load(parsed);
    expect(biomesProvider.isLoaded()).toBe(true);
  });

  it("hotReload(null) clears the manifest", () => {
    biomesProvider.loadRaw([validBiome]);
    biomesProvider.hotReload(null);
    expect(biomesProvider.isLoaded()).toBe(false);
  });

  it("unload() clears a loaded manifest", () => {
    biomesProvider.loadRaw([validBiome]);
    biomesProvider.unload();
    expect(biomesProvider.isLoaded()).toBe(false);
  });

  it("singleton returns the same instance", () => {
    expect(biomesProvider).toBe(biomesProvider);
  });
});
