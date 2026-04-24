import { LightingBakeManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import {
  LightingBakeNotLoadedError,
  LightingBakeRegistry,
} from "../LightingBakeRegistry.js";

function manifest() {
  return LightingBakeManifestSchema.parse({
    quality: "medium",
    lightprobeVolumes: [
      {
        id: "town",
        center: { x: 0, y: 0, z: 0 },
        extent: { x: 50, y: 20, z: 50 },
        density: { x: 8, y: 4, z: 8 },
      },
    ],
    levelOverrides: [
      {
        sublevelId: "dungeon_dark",
        quality: "high",
        lightmapResolutionTexelsPerMeter: 8,
      },
    ],
  });
}

describe("LightingBakeRegistry", () => {
  it("throws pre-load", () => {
    expect(() => new LightingBakeRegistry().manifest).toThrow(
      LightingBakeNotLoadedError,
    );
  });

  it("indexes volumes + overrides", () => {
    const r = new LightingBakeRegistry(manifest());
    expect(r.lightprobeVolume("town")?.density.x).toBe(8);
    expect(r.lightprobeVolume("ghost")).toBeUndefined();
    expect(r.overrideFor("dungeon_dark")?.quality).toBe("high");
    expect(r.overrideFor("ghost")).toBeUndefined();
  });

  it("effectiveBakeFor merges defaults + override", () => {
    const r = new LightingBakeRegistry(manifest());
    // No override — uses defaults
    const base = r.effectiveBakeFor("unseen");
    expect(base.quality).toBe("medium");
    expect(base.lightmapResolutionTexelsPerMeter).toBe(4);
    // With override — fields layered in
    const boosted = r.effectiveBakeFor("dungeon_dark");
    expect(boosted.quality).toBe("high");
    expect(boosted.lightmapResolutionTexelsPerMeter).toBe(8);
  });

  it("skipBake flag + quality getter", () => {
    const r = new LightingBakeRegistry(manifest());
    expect(r.skipBake).toBe(false);
    expect(r.quality).toBe("medium");
  });
});
