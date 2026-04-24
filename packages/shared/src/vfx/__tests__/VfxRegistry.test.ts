import { VfxManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import { sampleCurve, UnknownVfxError, VfxRegistry } from "../VfxRegistry.js";

function manifest() {
  return VfxManifestSchema.parse([
    {
      id: "hitBurst",
      name: "Hit burst",
      kind: "burst",
      asset: "asset://vfx/burst.glb",
      duration: 0.5,
      color: 0xff8822,
      glowIntensity: 2,
      scale: 1.5,
      sfxId: "hitMetal",
      blendMode: "additive",
      cullable: true,
      alphaOverLife: {
        anchors: [
          { t: 0, value: 1 },
          { t: 1, value: 0 },
        ],
      },
      scaleOverLife: {
        anchors: [
          { t: 0, value: 0.5 },
          { t: 0.3, value: 1 },
          { t: 1, value: 1.2 },
        ],
      },
    },
    {
      id: "healAura",
      name: "Heal aura",
      kind: "aura",
      asset: "asset://vfx/heal.glb",
      duration: 3,
      color: 0x33ff66,
      attachToSource: true,
    },
  ]);
}

describe("VfxRegistry — lookup", () => {
  it("indexes by id", () => {
    const r = new VfxRegistry(manifest());
    expect(r.size).toBe(2);
    expect(r.has("hitBurst")).toBe(true);
  });

  it("get throws UnknownVfxError on miss", () => {
    const r = new VfxRegistry(manifest());
    expect(() => r.get("ghost")).toThrow(UnknownVfxError);
  });

  it("byKind filters", () => {
    const r = new VfxRegistry(manifest());
    expect(r.byKind("aura").map((e) => e.id)).toEqual(["healAura"]);
  });
});

describe("VfxRegistry — resolve", () => {
  it("mirrors authored fields", () => {
    const r = new VfxRegistry(manifest());
    const s = r.resolve("hitBurst");
    expect(s.color).toBe(0xff8822);
    expect(s.blendMode).toBe("additive");
    expect(s.sfxId).toBe("hitMetal");
    expect(s.cullable).toBe(true);
  });

  it("omits sfxId when not authored", () => {
    const r = new VfxRegistry(manifest());
    const s = r.resolve("healAura");
    expect(s.sfxId).toBeUndefined();
    expect(s.attachToSource).toBe(true);
  });
});

describe("VfxRegistry — curves", () => {
  it("sampleAlpha interpolates linearly", () => {
    const r = new VfxRegistry(manifest());
    expect(r.sampleAlpha("hitBurst", 0)).toBe(1);
    expect(r.sampleAlpha("hitBurst", 0.5)).toBeCloseTo(0.5);
    expect(r.sampleAlpha("hitBurst", 1)).toBe(0);
  });

  it("sampleScale handles mid-anchor correctly", () => {
    const r = new VfxRegistry(manifest());
    expect(r.sampleScale("hitBurst", 0)).toBeCloseTo(0.5);
    expect(r.sampleScale("hitBurst", 0.3)).toBeCloseTo(1);
    // t=0.15 → halfway between 0 and 0.3 → (0.5+1)/2 = 0.75
    expect(r.sampleScale("hitBurst", 0.15)).toBeCloseTo(0.75);
    expect(r.sampleScale("hitBurst", 1)).toBeCloseTo(1.2);
  });

  it("returns 1 when curve absent", () => {
    const r = new VfxRegistry(manifest());
    expect(r.sampleAlpha("healAura", 0.5)).toBe(1);
    expect(r.sampleScale("healAura", 0.5)).toBe(1);
  });

  it("clamps t outside [0,1]", () => {
    const r = new VfxRegistry(manifest());
    expect(r.sampleAlpha("hitBurst", -1)).toBe(1);
    expect(r.sampleAlpha("hitBurst", 99)).toBe(0);
  });

  it("sampleCurve sorts unsorted anchors", () => {
    const v = sampleCurve(
      {
        anchors: [
          { t: 1, value: 10 },
          { t: 0, value: 0 },
        ],
      },
      0.5,
    );
    expect(v).toBeCloseTo(5);
  });
});
