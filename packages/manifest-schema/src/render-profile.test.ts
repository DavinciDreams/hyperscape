/**
 * Faithfulness + defensiveness tests for `RenderProfileManifestSchema`.
 */

import { describe, expect, it } from "vitest";

import {
  RenderProfileManifestSchema,
  type RenderProfileManifest,
} from "./render-profile.js";

const reference: RenderProfileManifest = [
  {
    id: "hyperscape-default",
    name: "Hyperscape Default",
    description: "Bright outdoorsy look with mild bloom and warm grade.",
    toneMapping: "aces-filmic",
    exposure: 1.0,
    bloom: { enabled: true, threshold: 0.9, strength: 0.6, radius: 0.4 },
    fog: {
      mode: "exp2",
      color: "#c8d0e0",
      density: 0.015,
      near: 10,
      far: 500,
    },
    ambient: { color: "#ffffff", intensity: 0.4 },
    environment: {
      assetId: "env_daytime_hdr",
      rotation: 0,
      intensity: 1,
      asBackground: true,
    },
    colorGrading: {
      enabled: true,
      lift: 0.0,
      gamma: 1.0,
      gain: 1.0,
      saturation: 1.1,
      contrast: 1.05,
    },
  },
  {
    id: "dark-dungeon",
    name: "Dark Dungeon",
    description: "Low ambient, heavy fog, cool grade.",
    toneMapping: "cineon",
    exposure: 0.8,
    bloom: { enabled: true, threshold: 1.2, strength: 0.9, radius: 0.5 },
    fog: { mode: "exp2", color: "#101018", density: 0.08, near: 5, far: 120 },
    ambient: { color: "#506070", intensity: 0.15 },
    environment: {
      assetId: "",
      rotation: 0,
      intensity: 0.2,
      asBackground: false,
    },
    colorGrading: {
      enabled: true,
      lift: -0.02,
      gamma: 0.95,
      gain: 1.0,
      saturation: 0.85,
      contrast: 1.15,
    },
  },
];

describe("RenderProfileManifestSchema", () => {
  it("parses the reference manifest cleanly", () => {
    const result = RenderProfileManifestSchema.safeParse(reference);
    if (!result.success) {
      throw new Error(
        `Reference manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("applies defaults on a minimal profile", () => {
    const parsed = RenderProfileManifestSchema.parse([
      { id: "min", name: "Minimal" },
    ]);
    const p = parsed[0];
    expect(p.description).toBe("");
    expect(p.toneMapping).toBe("aces-filmic");
    expect(p.exposure).toBe(1);
    expect(p.bloom.enabled).toBe(true);
    expect(p.bloom.threshold).toBe(0.9);
    expect(p.fog.mode).toBe("exp2");
    expect(p.fog.color).toBe("#c8c8d0");
    expect(p.ambient.intensity).toBe(0.4);
    expect(p.environment.assetId).toBe("");
    expect(p.colorGrading.saturation).toBe(1);
  });

  it("rejects empty manifest", () => {
    expect(RenderProfileManifestSchema.safeParse([]).success).toBe(false);
  });

  it("rejects duplicate profile ids", () => {
    const bad = [reference[0], { ...reference[0] }];
    expect(RenderProfileManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown tone-mapping operator", () => {
    const bad = [{ id: "x", name: "X", toneMapping: "cartoonify" }];
    expect(RenderProfileManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects malformed hex color", () => {
    const bad = [
      { id: "x", name: "X", ambient: { color: "red", intensity: 0.5 } },
    ];
    expect(RenderProfileManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects bloom threshold above max", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        bloom: { enabled: true, threshold: 10, strength: 1, radius: 0.3 },
      },
    ];
    expect(RenderProfileManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects negative bloom strength", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        bloom: { enabled: true, threshold: 0.5, strength: -1, radius: 0.3 },
      },
    ];
    expect(RenderProfileManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects linear fog with far <= near", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        fog: {
          mode: "linear",
          color: "#888888",
          density: 0,
          near: 100,
          far: 50,
        },
      },
    ];
    expect(RenderProfileManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts linear fog with far > near", () => {
    const ok = [
      {
        id: "x",
        name: "X",
        fog: {
          mode: "linear",
          color: "#888888",
          density: 0,
          near: 10,
          far: 200,
        },
      },
    ];
    expect(RenderProfileManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects out-of-range exposure", () => {
    const bad = [{ id: "x", name: "X", exposure: -1 }];
    expect(RenderProfileManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects gamma <= 0", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        colorGrading: {
          enabled: true,
          lift: 0,
          gamma: 0,
          gain: 1,
          saturation: 1,
          contrast: 1,
        },
      },
    ];
    expect(RenderProfileManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects lift outside [-1,1]", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        colorGrading: {
          enabled: true,
          lift: 2,
          gamma: 1,
          gain: 1,
          saturation: 1,
          contrast: 1,
        },
      },
    ];
    expect(RenderProfileManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects empty id", () => {
    const bad = [{ id: "", name: "X" }];
    expect(RenderProfileManifestSchema.safeParse(bad).success).toBe(false);
  });
});
