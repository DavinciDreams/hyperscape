/**
 * Faithfulness + defensiveness tests for `QualityPresetsManifestSchema`.
 */

import { describe, expect, it } from "vitest";

import {
  QualityPresetsManifestSchema,
  type QualityPresetsManifest,
} from "./quality-presets.js";

const reference: QualityPresetsManifest = [
  {
    id: "low",
    name: "Low",
    description: "Mobile / potato baseline",
    shadowResolution: "off",
    shadowDistance: 0,
    reflections: "off",
    postProcess: {
      bloom: false,
      toneMapping: true,
      ssao: false,
      motionBlur: false,
      depthOfField: false,
      colorGrading: true,
      vignette: false,
    },
    particleDensity: 0.25,
    lodBias: 1.5,
    maxPixelRatio: 1.0,
    tag: "mobile",
  },
  {
    id: "high",
    name: "High",
    description: "Recommended desktop",
    shadowResolution: "2048",
    shadowDistance: 200,
    reflections: "ssr",
    postProcess: {
      bloom: true,
      toneMapping: true,
      ssao: true,
      motionBlur: false,
      depthOfField: false,
      colorGrading: true,
      vignette: true,
    },
    particleDensity: 1,
    lodBias: 0,
    maxPixelRatio: 2.0,
    tag: "desktop",
  },
];

describe("QualityPresetsManifestSchema", () => {
  it("parses the reference manifest cleanly", () => {
    const result = QualityPresetsManifestSchema.safeParse(reference);
    if (!result.success) {
      throw new Error(
        `Reference manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("applies defaults on a minimal entry", () => {
    const parsed = QualityPresetsManifestSchema.parse([
      {
        id: "x",
        name: "X",
        shadowResolution: "1024",
        shadowDistance: 50,
        reflections: "cubemap",
        postProcess: {},
        particleDensity: 0.5,
      },
    ]);
    expect(parsed[0].postProcess.bloom).toBe(true);
    expect(parsed[0].postProcess.toneMapping).toBe(true);
    expect(parsed[0].postProcess.ssao).toBe(false);
    expect(parsed[0].lodBias).toBe(0);
    expect(parsed[0].maxPixelRatio).toBe(0);
    expect(parsed[0].tag).toBe("");
  });

  it("rejects empty manifest", () => {
    expect(QualityPresetsManifestSchema.safeParse([]).success).toBe(false);
  });

  it("rejects unknown shadow resolution", () => {
    const bad = [{ ...reference[0], shadowResolution: "16384" }];
    expect(QualityPresetsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects negative shadow distance", () => {
    const bad = [{ ...reference[0], shadowDistance: -10 }];
    expect(QualityPresetsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown reflection quality", () => {
    const bad = [{ ...reference[0], reflections: "raytraced" }];
    expect(QualityPresetsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects particleDensity > 1", () => {
    const bad = [{ ...reference[0], particleDensity: 1.5 }];
    expect(QualityPresetsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects particleDensity < 0", () => {
    const bad = [{ ...reference[0], particleDensity: -0.1 }];
    expect(QualityPresetsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects lodBias out of range", () => {
    const bad = [{ ...reference[0], lodBias: 10 }];
    expect(QualityPresetsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects negative maxPixelRatio", () => {
    const bad = [{ ...reference[0], maxPixelRatio: -1 }];
    expect(QualityPresetsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate preset ids", () => {
    const bad = [reference[0], { ...reference[0] }];
    expect(QualityPresetsManifestSchema.safeParse(bad).success).toBe(false);
  });
});
