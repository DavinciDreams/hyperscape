/**
 * Faithfulness test: a representative biomes manifest (grassland +
 * wasteland) with a vegetation-scatter layer MUST parse cleanly.
 */

import { describe, expect, it } from "vitest";

import { BiomesManifestSchema, type BiomesManifest } from "./biomes.js";

const reference: BiomesManifest = [
  {
    id: "grassland",
    name: "Grassland",
    description: "Rolling green hills",
    difficultyLevel: 1,
    terrain: "grass",
    resources: ["tree_oak", "rock_copper"],
    mobs: ["goblin", "rat"],
    fogIntensity: 0.15,
    ambientSound: "asset://sfx/ambient_grassland.ogg",
    colorScheme: {
      primary: "#6db36d",
      secondary: "#98c398",
      fog: "#bcd7bc",
    },
    color: 0x6db36d,
    heightRange: [0, 8],
    terrainMultiplier: 1,
    waterLevel: 0,
    maxSlope: 0.4,
    mobTypes: ["goblin", "rat"],
    difficulty: 1,
    baseHeight: 0,
    heightVariation: 3,
    resourceDensity: 0.02,
    resourceTypes: ["tree_oak", "rock_copper"],
    vegetation: {
      enabled: true,
      layers: [
        {
          category: "grass",
          density: 0.3,
          assets: ["grass_tall", "grass_short"],
          minSpacing: 0.4,
          clustering: false,
          noiseScale: 0.01,
          noiseThreshold: 0.4,
          avoidWater: true,
          avoidSteepSlopes: true,
        },
      ],
    },
  },
  {
    id: "wasteland",
    name: "Wasteland",
    description: "Barren, mob-dense frontier",
    difficultyLevel: 4,
    terrain: "rock",
    resources: ["rock_mithril"],
    mobs: ["hobgoblin", "dark_warrior"],
    fogIntensity: 0.5,
    ambientSound: "asset://sfx/ambient_wasteland.ogg",
    colorScheme: {
      primary: "#6b5a4a",
      secondary: "#8f7b66",
      fog: "#c7b8a8",
    },
    color: 0x6b5a4a,
    heightRange: [-2, 14],
    terrainMultiplier: 1.4,
    waterLevel: -1,
    maxSlope: 0.7,
    mobTypes: ["hobgoblin"],
    difficulty: 4,
    baseHeight: 2,
    heightVariation: 6,
    resourceDensity: 0.015,
    resourceTypes: ["rock_mithril"],
    vegetation: { enabled: false, layers: [] },
  },
];

describe("BiomesManifestSchema", () => {
  it("parses the reference manifest cleanly", () => {
    const result = BiomesManifestSchema.safeParse(reference);
    if (!result.success) {
      throw new Error(
        `Reference manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("rejects a non-hex color in the color scheme", () => {
    const bad = [
      {
        ...reference[0],
        colorScheme: {
          ...reference[0].colorScheme,
          primary: "green",
        },
      },
    ];
    const result = BiomesManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects fogIntensity outside [0, 1]", () => {
    const bad = [{ ...reference[0], fogIntensity: 1.5 }];
    const result = BiomesManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects noiseThreshold outside [0, 1] in a vegetation layer", () => {
    const bad = [
      {
        ...reference[0],
        vegetation: {
          enabled: true,
          layers: [
            {
              ...reference[0].vegetation.layers[0],
              noiseThreshold: 2,
            },
          ],
        },
      },
    ];
    const result = BiomesManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects empty biome id", () => {
    const bad = [{ ...reference[0], id: "" }];
    const result = BiomesManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});
