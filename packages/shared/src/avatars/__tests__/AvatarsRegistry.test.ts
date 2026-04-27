import { AvatarsManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it, vi } from "vitest";
import {
  AvatarsNotLoadedError,
  AvatarsRegistry,
  UnknownAvatarError,
} from "../AvatarsRegistry.js";

function manifest() {
  return AvatarsManifestSchema.parse({
    $schema: "hyperforge.avatars.v1",
    avatars: [
      {
        id: "hero",
        name: "Hero",
        url: "asset://hero.vrm",
        lod1Url: "asset://hero.lod1.vrm",
        lod2Url: "asset://hero.lod2.vrm",
        previewPath: "/previews/hero.png",
      },
      {
        id: "villager",
        name: "Villager",
        url: "asset://villager.vrm",
        lod1Url: "asset://villager.lod1.vrm",
        previewPath: "/previews/villager.png",
      },
      {
        id: "sprite",
        name: "Sprite",
        url: "asset://sprite.vrm",
        previewPath: "/previews/sprite.png",
      },
    ],
    lodDistances: {
      lod0ToLod1: 10,
      lod1ToLod2: 25,
    },
  });
}

describe("AvatarsRegistry — not loaded", () => {
  it("throws pre-load", () => {
    expect(() => new AvatarsRegistry().manifest).toThrow(AvatarsNotLoadedError);
  });
});

describe("AvatarsRegistry — lookup", () => {
  it("indexes by id", () => {
    const r = new AvatarsRegistry(manifest());
    expect(r.has("hero")).toBe(true);
    expect(r.get("villager").name).toBe("Villager");
  });

  it("throws on unknown", () => {
    const r = new AvatarsRegistry(manifest());
    expect(() => r.get("ghost")).toThrow(UnknownAvatarError);
  });
});

describe("AvatarsRegistry — LOD selection", () => {
  it("close uses tier 0", () => {
    const r = new AvatarsRegistry(manifest());
    expect(r.pickLodTier("hero", 5)).toBe(0);
  });

  it("medium uses tier 1", () => {
    const r = new AvatarsRegistry(manifest());
    expect(r.pickLodTier("hero", 15)).toBe(1);
  });

  it("far uses tier 2 when available", () => {
    const r = new AvatarsRegistry(manifest());
    expect(r.pickLodTier("hero", 50)).toBe(2);
  });

  it("clamps down when tier url missing", () => {
    const r = new AvatarsRegistry(manifest());
    expect(r.pickLodTier("villager", 50)).toBe(1);
    expect(r.pickLodTier("sprite", 50)).toBe(0);
  });

  it("resolveForDistance returns tier and url", () => {
    const r = new AvatarsRegistry(manifest());
    const res = r.resolveForDistance("hero", 15);
    expect(res.tier).toBe(1);
    expect(res.url).toBe("asset://hero.lod1.vrm");
  });

  it("urlForTier clamps when tier url missing", () => {
    const r = new AvatarsRegistry(manifest());
    expect(r.urlForTier("sprite", 2)).toBe("asset://sprite.vrm");
    expect(r.urlForTier("villager", 2)).toBe("asset://villager.lod1.vrm");
  });
});

describe("AvatarsRegistry — onReloaded", () => {
  it("fires after every successful load()", () => {
    const r = new AvatarsRegistry();
    const cb = vi.fn();
    r.onReloaded(cb);
    r.load(manifest());
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("returned unsubscribe stops further notifications", () => {
    const r = new AvatarsRegistry();
    const cb = vi.fn();
    const off = r.onReloaded(cb);
    r.load(manifest());
    off();
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("a throwing listener does not break subsequent listeners", () => {
    const r = new AvatarsRegistry();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const bad = vi.fn(() => {
      throw new Error("listener boom");
    });
    const good = vi.fn();
    r.onReloaded(bad);
    r.onReloaded(good);
    r.load(manifest());
    expect(bad).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
