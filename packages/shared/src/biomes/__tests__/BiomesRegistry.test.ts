import { BiomesManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import {
  BiomesNotLoadedError,
  BiomesRegistry,
  UnknownBiomeError,
} from "../BiomesRegistry.js";

function biome(
  id: string,
  difficulty: number,
  heightRange: [number, number],
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    name: id,
    description: "",
    difficultyLevel: difficulty,
    terrain: "grassland",
    resources: [],
    mobs: [],
    fogIntensity: 0.3,
    ambientSound: "wind",
    colorScheme: {
      primary: "#4a7e3a",
      secondary: "#3a5c2a",
      fog: "#b0c4de",
    },
    color: 0x4a7e3a,
    heightRange,
    terrainMultiplier: 1,
    waterLevel: 0,
    maxSlope: 0.5,
    mobTypes: [],
    difficulty,
    baseHeight: 0,
    heightVariation: 1,
    resourceDensity: 0.1,
    resourceTypes: [],
    vegetation: { enabled: true, layers: [] },
    ...overrides,
  };
}

function manifest() {
  return BiomesManifestSchema.parse([
    biome("ocean", 0, [-100, 0]),
    biome("grassland", 1, [0, 10]),
    biome("forest", 2, [5, 30]),
    biome("mountain", 5, [30, 100]),
  ]);
}

describe("BiomesRegistry", () => {
  it("throws pre-load", () => {
    expect(() => new BiomesRegistry().manifest).toThrow(BiomesNotLoadedError);
  });

  it("indexes by id", () => {
    const r = new BiomesRegistry(manifest());
    expect(r.get("forest").difficultyLevel).toBe(2);
    expect(r.ids.sort()).toEqual(["forest", "grassland", "mountain", "ocean"]);
  });

  it("throws UnknownBiomeError on miss", () => {
    const r = new BiomesRegistry(manifest());
    expect(() => r.get("ghost")).toThrow(UnknownBiomeError);
  });

  it("atDifficultyRange filters inclusive", () => {
    const r = new BiomesRegistry(manifest());
    expect(r.atDifficultyRange(1, 2).map((b) => b.id)).toEqual([
      "grassland",
      "forest",
    ]);
    expect(r.atDifficultyRange(0, 0).map((b) => b.id)).toEqual(["ocean"]);
  });

  it("biomeAtHeight picks first containing biome", () => {
    const r = new BiomesRegistry(manifest());
    expect(r.biomeAtHeight(-50)?.id).toBe("ocean");
    expect(r.biomeAtHeight(3)?.id).toBe("grassland");
    // At height=8 both grassland and forest cover the range; first match wins.
    expect(r.biomeAtHeight(8)?.id).toBe("grassland");
    expect(r.biomeAtHeight(50)?.id).toBe("mountain");
    expect(r.biomeAtHeight(999)).toBeUndefined();
  });
});
