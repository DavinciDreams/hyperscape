/**
 * Faithfulness test: a vegetation manifest with representative scatter
 * assets (grass, bush, mushroom) MUST parse cleanly.
 */

import { describe, expect, it } from "vitest";

import {
  VegetationManifestSchema,
  type VegetationManifest,
} from "./vegetation.js";

const reference: VegetationManifest = {
  version: 1,
  description: "Procgen vegetation catalog",
  assets: [
    {
      id: "grass_tall",
      model: "asset://vegetation/grass_tall.glb",
      category: "grass",
      baseScale: 1,
      scaleVariation: [0.8, 1.3],
      randomRotation: true,
      weight: 1,
      maxSlope: 0.6,
      alignToNormal: false,
      yOffset: 0,
    },
    {
      id: "mushroom_red",
      model: "asset://vegetation/mushroom_red.glb",
      category: "mushroom",
      baseScale: 0.4,
      scaleVariation: [0.6, 1.2],
      randomRotation: true,
      weight: 0.3,
      maxSlope: 0.4,
      alignToNormal: true,
      yOffset: -0.01,
    },
  ],
};

describe("VegetationManifestSchema", () => {
  it("parses the reference manifest cleanly", () => {
    const result = VegetationManifestSchema.safeParse(reference);
    if (!result.success) {
      throw new Error(
        `Reference manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("rejects non-positive baseScale", () => {
    const bad: VegetationManifest = {
      ...reference,
      assets: [{ ...reference.assets[0], baseScale: 0 }],
    };
    const result = VegetationManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects maxSlope outside [0, 1]", () => {
    const bad: VegetationManifest = {
      ...reference,
      assets: [{ ...reference.assets[0], maxSlope: 1.5 }],
    };
    const result = VegetationManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects scaleVariation with wrong tuple length", () => {
    const bad = {
      ...reference,
      assets: [{ ...reference.assets[0], scaleVariation: [0.8, 1.0, 1.3] }],
    };
    const result = VegetationManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects empty asset id", () => {
    const bad: VegetationManifest = {
      ...reference,
      assets: [{ ...reference.assets[0], id: "" }],
    };
    const result = VegetationManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});
