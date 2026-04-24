/**
 * Faithfulness + defensiveness tests for `LightingBakeManifestSchema`.
 */

import { describe, expect, it } from "vitest";

import {
  LightingBakeManifestSchema,
  type LightingBakeManifest,
} from "./lighting-bake.js";

const reference: LightingBakeManifest = {
  quality: "high",
  lightmapResolutionTexelsPerMeter: 8,
  lightmapFormat: "rgb16f",
  lightmapPaddingTexels: 4,
  lightmapMaxAtlasSize: 4096,
  ao: { enabled: true, radius: 2, samples: 256, intensity: 1 },
  gi: { enabled: true, bounces: 4, samples: 512, intensity: 1 },
  lightprobeVolumes: [
    {
      id: "townSquare",
      center: { x: 0, y: 2, z: 0 },
      extent: { x: 20, y: 4, z: 20 },
      density: { x: 8, y: 2, z: 8 },
    },
    {
      id: "dungeonLevel1",
      center: { x: 100, y: -5, z: 0 },
      extent: { x: 30, y: 6, z: 30 },
      density: { x: 12, y: 3, z: 12 },
    },
  ],
  levelOverrides: [
    {
      sublevelId: "bossArena",
      quality: "production",
      lightmapResolutionTexelsPerMeter: 16,
    },
  ],
  skipBake: false,
};

describe("LightingBakeManifestSchema", () => {
  it("parses the reference manifest cleanly", () => {
    const result = LightingBakeManifestSchema.safeParse(reference);
    if (!result.success) {
      throw new Error(
        `Reference manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("applies sensible defaults when fields are omitted", () => {
    const parsed = LightingBakeManifestSchema.parse({});
    expect(parsed.quality).toBe("medium");
    expect(parsed.lightmapResolutionTexelsPerMeter).toBe(4);
    expect(parsed.lightmapFormat).toBe("rgb16f");
    expect(parsed.lightmapPaddingTexels).toBe(4);
    expect(parsed.lightmapMaxAtlasSize).toBe(4096);
    expect(parsed.ao).toEqual({
      enabled: true,
      radius: 2,
      samples: 128,
      intensity: 1,
    });
    expect(parsed.gi).toEqual({
      enabled: true,
      bounces: 3,
      samples: 256,
      intensity: 1,
    });
    expect(parsed.lightprobeVolumes).toEqual([]);
    expect(parsed.levelOverrides).toEqual([]);
    expect(parsed.skipBake).toBe(false);
  });

  it("rejects non-power-of-two atlas size", () => {
    const bad = { lightmapMaxAtlasSize: 3000 };
    expect(LightingBakeManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts a power-of-two atlas size", () => {
    const ok = { lightmapMaxAtlasSize: 8192 };
    expect(LightingBakeManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects duplicate lightprobe volume ids", () => {
    const bad = {
      lightprobeVolumes: [
        {
          id: "dup",
          center: { x: 0, y: 0, z: 0 },
          extent: { x: 1, y: 1, z: 1 },
          density: { x: 2, y: 2, z: 2 },
        },
        {
          id: "dup",
          center: { x: 5, y: 0, z: 0 },
          extent: { x: 1, y: 1, z: 1 },
          density: { x: 2, y: 2, z: 2 },
        },
      ],
    };
    expect(LightingBakeManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate sublevel level-override targets", () => {
    const bad = {
      levelOverrides: [
        { sublevelId: "arena", quality: "high" },
        { sublevelId: "arena", quality: "low" },
      ],
    };
    expect(LightingBakeManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects lightprobe volume with non-positive extent", () => {
    const bad = {
      lightprobeVolumes: [
        {
          id: "bad",
          center: { x: 0, y: 0, z: 0 },
          extent: { x: 0, y: 1, z: 1 },
          density: { x: 2, y: 2, z: 2 },
        },
      ],
    };
    expect(LightingBakeManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects lightprobe volume with density less than 1", () => {
    const bad = {
      lightprobeVolumes: [
        {
          id: "bad",
          center: { x: 0, y: 0, z: 0 },
          extent: { x: 1, y: 1, z: 1 },
          density: { x: 0, y: 1, z: 1 },
        },
      ],
    };
    expect(LightingBakeManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects invalid lightprobe volume id format", () => {
    const bad = {
      lightprobeVolumes: [
        {
          id: "Has Spaces",
          center: { x: 0, y: 0, z: 0 },
          extent: { x: 1, y: 1, z: 1 },
          density: { x: 2, y: 2, z: 2 },
        },
      ],
    };
    expect(LightingBakeManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects AO samples out of range", () => {
    const bad = { ao: { samples: 3 } };
    expect(LightingBakeManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects AO radius > 100", () => {
    const bad = { ao: { radius: 101 } };
    expect(LightingBakeManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects GI bounces > 16", () => {
    const bad = { gi: { bounces: 17 } };
    expect(LightingBakeManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects GI intensity > 4", () => {
    const bad = { gi: { intensity: 5 } };
    expect(LightingBakeManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects lightmap resolution > 1024", () => {
    const bad = { lightmapResolutionTexelsPerMeter: 2048 };
    expect(LightingBakeManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects lightmap padding > 16", () => {
    const bad = { lightmapPaddingTexels: 32 };
    expect(LightingBakeManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects lightmap max atlas size < 256", () => {
    const bad = { lightmapMaxAtlasSize: 128 };
    expect(LightingBakeManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown bake quality", () => {
    const bad = { quality: "ultra-super" };
    expect(LightingBakeManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown lightmap format", () => {
    const bad = { lightmapFormat: "rgba32f" };
    expect(LightingBakeManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts skipBake dev-iteration mode", () => {
    const ok = { skipBake: true };
    expect(LightingBakeManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("accepts level overrides with only sublevelId (partial override)", () => {
    const ok = {
      levelOverrides: [{ sublevelId: "outdoor" }],
    };
    expect(LightingBakeManifestSchema.safeParse(ok).success).toBe(true);
  });
});
