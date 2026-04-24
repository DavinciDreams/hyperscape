/**
 * Faithfulness + defensiveness tests for `SkyboxAtmosphereManifestSchema`.
 */

import { describe, expect, it } from "vitest";

import {
  SkyboxAtmosphereManifestSchema,
  type SkyboxAtmosphereManifest,
} from "./skybox-atmosphere.js";

const reference: SkyboxAtmosphereManifest = {
  skyboxes: [
    {
      id: "overworldDefault",
      name: "Overworld Default",
      description: "Earth-like blue sky.",
      sun: {
        direction: { x: 0.3, y: 0.8, z: 0.2 },
        color: "#fff4d6",
        angularDiameterDeg: 0.53,
        intensity: 1,
      },
      moon: {
        direction: { x: -0.3, y: 0.8, z: -0.2 },
        color: "#e6ecff",
        angularDiameterDeg: 0.5,
        intensity: 0.05,
        textureId: "tex.moon",
        phase: 0.5,
      },
      stars: {
        count: 4000,
        brightness: 0.8,
        twinkleSpeed: 0.4,
        seed: 42,
        visibleWindow: { t0: 0.75, t1: 0.25 },
      },
      cloudLayers: [
        {
          id: "cumulus",
          altitudeMeters: 1500,
          coverage: 0.4,
          density: 0.6,
          windSpeed: 8,
          windDirectionDeg: 45,
          color: "#ffffff",
        },
        {
          id: "cirrus",
          altitudeMeters: 8000,
          coverage: 0.2,
          density: 0.3,
          windSpeed: 20,
          windDirectionDeg: 90,
          color: "#e8eef5",
        },
      ],
      atmosphere: {
        planetRadiusKm: 6371,
        atmosphereHeightKm: 100,
        rayleighCoefficient: { r: 0.005, g: 0.013, b: 0.033 },
        rayleighScaleHeightKm: 8,
        mieCoefficient: 0.004,
        mieScaleHeightKm: 1.2,
        mieG: 0.76,
        ozoneCoefficient: { r: 0.00065, g: 0.00188, b: 0.000085 },
      },
      gradient: {
        horizonColor: "#b0c4e0",
        zenithColor: "#2a4a8a",
        blendExponent: 2,
      },
    },
  ],
  activeSkyboxId: "overworldDefault",
};

describe("SkyboxAtmosphereManifestSchema", () => {
  it("parses the reference manifest cleanly", () => {
    const result = SkyboxAtmosphereManifestSchema.safeParse(reference);
    if (!result.success) {
      throw new Error(
        `Reference manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("applies defaults on a minimal skybox", () => {
    const parsed = SkyboxAtmosphereManifestSchema.parse({
      skyboxes: [
        {
          id: "s",
          name: "S",
          sun: { direction: { x: 0, y: 1, z: 0 } },
          moon: { direction: { x: 0, y: -1, z: 0 } },
        },
      ],
      activeSkyboxId: "s",
    });
    expect(parsed.skyboxes[0].sun.color).toBe("#ffffff");
    expect(parsed.skyboxes[0].sun.intensity).toBe(1);
    expect(parsed.skyboxes[0].moon.phase).toBe(0.5);
    expect(parsed.skyboxes[0].stars.count).toBe(2000);
    expect(parsed.skyboxes[0].cloudLayers).toEqual([]);
    expect(parsed.skyboxes[0].atmosphere.mieG).toBe(0.76);
    expect(parsed.skyboxes[0].gradient.blendExponent).toBe(2);
  });

  it("rejects zero skyboxes", () => {
    const bad = { skyboxes: [], activeSkyboxId: "s" };
    expect(SkyboxAtmosphereManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate skybox ids", () => {
    const bad = {
      skyboxes: [
        {
          id: "dup",
          name: "A",
          sun: { direction: { x: 0, y: 1, z: 0 } },
          moon: { direction: { x: 0, y: -1, z: 0 } },
        },
        {
          id: "dup",
          name: "B",
          sun: { direction: { x: 0, y: 1, z: 0 } },
          moon: { direction: { x: 0, y: -1, z: 0 } },
        },
      ],
      activeSkyboxId: "dup",
    };
    expect(SkyboxAtmosphereManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects activeSkyboxId that does not resolve", () => {
    const bad = {
      skyboxes: [
        {
          id: "s",
          name: "S",
          sun: { direction: { x: 0, y: 1, z: 0 } },
          moon: { direction: { x: 0, y: -1, z: 0 } },
        },
      ],
      activeSkyboxId: "ghost",
    };
    expect(SkyboxAtmosphereManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects zero sun direction vector", () => {
    const bad = {
      skyboxes: [
        {
          id: "s",
          name: "S",
          sun: { direction: { x: 0, y: 0, z: 0 } },
          moon: { direction: { x: 0, y: -1, z: 0 } },
        },
      ],
      activeSkyboxId: "s",
    };
    expect(SkyboxAtmosphereManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects invalid skybox id format", () => {
    const bad = {
      skyboxes: [
        {
          id: "Has Spaces",
          name: "S",
          sun: { direction: { x: 0, y: 1, z: 0 } },
          moon: { direction: { x: 0, y: -1, z: 0 } },
        },
      ],
      activeSkyboxId: "Has Spaces",
    };
    expect(SkyboxAtmosphereManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate cloud layer ids within a skybox", () => {
    const bad = {
      skyboxes: [
        {
          id: "s",
          name: "S",
          sun: { direction: { x: 0, y: 1, z: 0 } },
          moon: { direction: { x: 0, y: -1, z: 0 } },
          cloudLayers: [
            {
              id: "dup",
              altitudeMeters: 1000,
            },
            {
              id: "dup",
              altitudeMeters: 5000,
            },
          ],
        },
      ],
      activeSkyboxId: "s",
    };
    expect(SkyboxAtmosphereManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects more than 8 cloud layers", () => {
    const bad = {
      skyboxes: [
        {
          id: "s",
          name: "S",
          sun: { direction: { x: 0, y: 1, z: 0 } },
          moon: { direction: { x: 0, y: -1, z: 0 } },
          cloudLayers: Array.from({ length: 9 }, (_, i) => ({
            id: `layer${i}`,
            altitudeMeters: 1000 * (i + 1),
          })),
        },
      ],
      activeSkyboxId: "s",
    };
    expect(SkyboxAtmosphereManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects cloud coverage > 1", () => {
    const bad = {
      skyboxes: [
        {
          id: "s",
          name: "S",
          sun: { direction: { x: 0, y: 1, z: 0 } },
          moon: { direction: { x: 0, y: -1, z: 0 } },
          cloudLayers: [
            {
              id: "c",
              altitudeMeters: 1000,
              coverage: 1.5,
            },
          ],
        },
      ],
      activeSkyboxId: "s",
    };
    expect(SkyboxAtmosphereManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects cloud windDirectionDeg = 360 (must be < 360)", () => {
    const bad = {
      skyboxes: [
        {
          id: "s",
          name: "S",
          sun: { direction: { x: 0, y: 1, z: 0 } },
          moon: { direction: { x: 0, y: -1, z: 0 } },
          cloudLayers: [
            {
              id: "c",
              altitudeMeters: 1000,
              windDirectionDeg: 360,
            },
          ],
        },
      ],
      activeSkyboxId: "s",
    };
    expect(SkyboxAtmosphereManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects sun angularDiameter > 30", () => {
    const bad = {
      skyboxes: [
        {
          id: "s",
          name: "S",
          sun: {
            direction: { x: 0, y: 1, z: 0 },
            angularDiameterDeg: 45,
          },
          moon: { direction: { x: 0, y: -1, z: 0 } },
        },
      ],
      activeSkyboxId: "s",
    };
    expect(SkyboxAtmosphereManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects moon phase > 1", () => {
    const bad = {
      skyboxes: [
        {
          id: "s",
          name: "S",
          sun: { direction: { x: 0, y: 1, z: 0 } },
          moon: {
            direction: { x: 0, y: -1, z: 0 },
            phase: 2,
          },
        },
      ],
      activeSkyboxId: "s",
    };
    expect(SkyboxAtmosphereManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects star count > 100_000", () => {
    const bad = {
      skyboxes: [
        {
          id: "s",
          name: "S",
          sun: { direction: { x: 0, y: 1, z: 0 } },
          moon: { direction: { x: 0, y: -1, z: 0 } },
          stars: { count: 500_000 },
        },
      ],
      activeSkyboxId: "s",
    };
    expect(SkyboxAtmosphereManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects mieG outside [-1, 1]", () => {
    const bad = {
      skyboxes: [
        {
          id: "s",
          name: "S",
          sun: { direction: { x: 0, y: 1, z: 0 } },
          moon: { direction: { x: 0, y: -1, z: 0 } },
          atmosphere: { mieG: 2 },
        },
      ],
      activeSkyboxId: "s",
    };
    expect(SkyboxAtmosphereManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects atmosphereHeightKm <= 0", () => {
    const bad = {
      skyboxes: [
        {
          id: "s",
          name: "S",
          sun: { direction: { x: 0, y: 1, z: 0 } },
          moon: { direction: { x: 0, y: -1, z: 0 } },
          atmosphere: { atmosphereHeightKm: 0 },
        },
      ],
      activeSkyboxId: "s",
    };
    expect(SkyboxAtmosphereManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects gradient blendExponent < 0.1", () => {
    const bad = {
      skyboxes: [
        {
          id: "s",
          name: "S",
          sun: { direction: { x: 0, y: 1, z: 0 } },
          moon: { direction: { x: 0, y: -1, z: 0 } },
          gradient: { blendExponent: 0 },
        },
      ],
      activeSkyboxId: "s",
    };
    expect(SkyboxAtmosphereManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects invalid hex color format", () => {
    const bad = {
      skyboxes: [
        {
          id: "s",
          name: "S",
          sun: {
            direction: { x: 0, y: 1, z: 0 },
            color: "blue",
          },
          moon: { direction: { x: 0, y: -1, z: 0 } },
        },
      ],
      activeSkyboxId: "s",
    };
    expect(SkyboxAtmosphereManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts multiple skyboxes with distinct ids", () => {
    const ok = {
      skyboxes: [
        {
          id: "overworld",
          name: "Overworld",
          sun: { direction: { x: 0, y: 1, z: 0 } },
          moon: { direction: { x: 0, y: -1, z: 0 } },
        },
        {
          id: "underwater",
          name: "Underwater",
          sun: { direction: { x: 0, y: 1, z: 0 } },
          moon: { direction: { x: 0, y: -1, z: 0 } },
        },
      ],
      activeSkyboxId: "underwater",
    };
    expect(SkyboxAtmosphereManifestSchema.safeParse(ok).success).toBe(true);
  });
});
