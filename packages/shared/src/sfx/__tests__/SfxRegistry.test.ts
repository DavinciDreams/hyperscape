import { SoundEffectManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import { SfxRegistry, UnknownSoundError } from "../SfxRegistry.js";

function manifest() {
  return SoundEffectManifestSchema.parse([
    {
      id: "uiClick",
      name: "UI click",
      category: "ui",
      path: "asset://sfx/ui/click.ogg",
      volume: 0.8,
      pitchVariance: 0,
    },
    {
      id: "footstepGrass",
      name: "Footstep grass",
      category: "footstep",
      path: "asset://sfx/foot/grass.ogg",
      volume: 0.5,
      pitchVariance: 0.5,
      cullable: true,
    },
    {
      id: "hitMetal",
      name: "Metal hit",
      category: "impact",
      path: "asset://sfx/impact/metal.ogg",
      volume: 1,
      pitchVariance: 0.25,
    },
  ]);
}

describe("SfxRegistry — lookup", () => {
  it("indexes by id", () => {
    const r = new SfxRegistry(manifest());
    expect(r.size).toBe(3);
    expect(r.has("uiClick")).toBe(true);
    expect(r.get("uiClick").category).toBe("ui");
  });

  it("get throws UnknownSoundError on miss", () => {
    const r = new SfxRegistry(manifest());
    expect(() => r.get("ghost")).toThrow(UnknownSoundError);
  });

  it("byCategory returns cues in a bucket", () => {
    const r = new SfxRegistry(manifest());
    expect(r.byCategory("footstep").map((s) => s.id)).toEqual([
      "footstepGrass",
    ]);
  });

  it("loadFromJson validates", () => {
    const r = new SfxRegistry();
    r.loadFromJson([{ id: "a", name: "A", category: "ui", path: "p" }]);
    expect(r.size).toBe(1);
  });
});

describe("SfxRegistry — resolve", () => {
  it("applies volumeScale and clamps to [0..1]", () => {
    const r = new SfxRegistry(manifest());
    const a = r.resolve("uiClick", { volumeScale: 0.5 });
    expect(a.volume).toBeCloseTo(0.4);
    const b = r.resolve("uiClick", { volumeScale: 10 });
    expect(b.volume).toBe(1);
  });

  it("deterministic pitch with injected rng", () => {
    const r = new SfxRegistry(manifest());
    // rng=0 → offset = (0*2-1)*variance = -variance → pitch = 2^(-v/12)
    const low = r.resolve("hitMetal", { rng: () => 0 });
    expect(low.pitch).toBeCloseTo(Math.pow(2, -0.25 / 12), 6);
    // rng=0.5 → offset = 0 → pitch = 1
    const mid = r.resolve("hitMetal", { rng: () => 0.5 });
    expect(mid.pitch).toBeCloseTo(1, 6);
  });

  it("pitch is exactly 1 when variance=0", () => {
    const r = new SfxRegistry(manifest());
    const a = r.resolve("uiClick", { rng: () => 0 });
    expect(a.pitch).toBe(1);
  });

  it("rejects negative volumeScale", () => {
    const r = new SfxRegistry(manifest());
    expect(() => r.resolve("uiClick", { volumeScale: -1 })).toThrow(TypeError);
  });
});
