import { describe, expect, it } from "vitest";

import {
  ModelBoundsManifestSchema,
  StationsManifestSchema,
  type ModelBoundsManifest,
  type StationsManifest,
} from "./stations.js";

const hyperscapeStations: StationsManifest = {
  stations: [
    {
      type: "anvil",
      name: "Anvil",
      model: "asset://models/stations/anvil/anvil.glb",
      modelScale: 0.5,
      modelYOffset: 0.2,
      examine: "An anvil for smithing metal bars into weapons and tools.",
      flattenGround: true,
      flattenPadding: 2.0,
      flattenBlendRadius: 2.0,
    },
    {
      type: "range",
      name: "Cooking Range",
      model: null,
      modelScale: 1.0,
      modelYOffset: 0,
      examine: "A range for cooking food.",
      footprint: { width: 1, depth: 1 },
    },
  ],
};

const hyperscapeModelBounds: ModelBoundsManifest = {
  generatedAt: "2026-04-18T00:00:00Z",
  tileSize: 1,
  models: [
    {
      id: "anvil",
      assetPath: "asset://models/stations/anvil/anvil.glb",
      bounds: {
        min: { x: -1, y: 0, z: -0.6 },
        max: { x: 1, y: 0.55, z: 0.6 },
      },
      dimensions: { x: 2.01, y: 0.55, z: 1.15 },
      footprint: { width: 2, depth: 1 },
    },
  ],
};

describe("StationsManifestSchema", () => {
  it("parses a realistic manifest cleanly", () => {
    const result = StationsManifestSchema.safeParse(hyperscapeStations);
    if (!result.success) {
      throw new Error(
        `Stations manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("rejects empty stations array", () => {
    const bad = { stations: [] };
    expect(StationsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects non-positive modelScale", () => {
    const bad = {
      stations: [{ ...hyperscapeStations.stations[0], modelScale: 0 }],
    };
    expect(StationsManifestSchema.safeParse(bad).success).toBe(false);
  });
});

describe("ModelBoundsManifestSchema", () => {
  it("parses a realistic bounds manifest cleanly", () => {
    const result = ModelBoundsManifestSchema.safeParse(hyperscapeModelBounds);
    if (!result.success) {
      throw new Error(
        `Model bounds manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });
});
