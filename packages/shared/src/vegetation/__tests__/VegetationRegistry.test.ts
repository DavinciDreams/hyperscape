import { VegetationManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it, vi } from "vitest";
import {
  UnknownVegetationAssetError,
  VegetationNotLoadedError,
  VegetationRegistry,
} from "../VegetationRegistry.js";

function manifest() {
  return VegetationManifestSchema.parse({
    version: 1,
    assets: [
      {
        id: "bush_small",
        model: "asset://bush_small.glb",
        category: "bushes",
        baseScale: 1,
        scaleVariation: [0.8, 1.2],
        randomRotation: true,
        weight: 3,
        maxSlope: 0.5,
        alignToNormal: false,
        yOffset: 0,
      },
      {
        id: "bush_large",
        model: "asset://bush_large.glb",
        category: "bushes",
        baseScale: 1.5,
        scaleVariation: [0.9, 1.3],
        randomRotation: true,
        weight: 1,
        maxSlope: 0.4,
        alignToNormal: false,
        yOffset: 0,
      },
      {
        id: "mushroom_red",
        model: "asset://mushroom_red.glb",
        category: "mushrooms",
        baseScale: 0.5,
        scaleVariation: [0.7, 1.1],
        randomRotation: true,
        weight: 1,
        maxSlope: 0.3,
        alignToNormal: true,
        yOffset: 0,
      },
    ],
  });
}

describe("VegetationRegistry", () => {
  it("throws pre-load", () => {
    expect(() => new VegetationRegistry().manifest).toThrow(
      VegetationNotLoadedError,
    );
  });

  it("indexes by id and category", () => {
    const r = new VegetationRegistry(manifest());
    expect(r.get("bush_small").category).toBe("bushes");
    expect(r.forCategory("bushes")).toHaveLength(2);
    expect(r.forCategory("mushrooms")).toHaveLength(1);
    expect(r.forCategory("ghost")).toEqual([]);
  });

  it("throws UnknownVegetationAssetError on miss", () => {
    const r = new VegetationRegistry(manifest());
    expect(() => r.get("ghost")).toThrow(UnknownVegetationAssetError);
  });

  it("categories() lists all distinct categories", () => {
    const r = new VegetationRegistry(manifest());
    expect(r.categories().sort()).toEqual(["bushes", "mushrooms"]);
  });

  it("pickByWeight is deterministic with injected rand", () => {
    const r = new VegetationRegistry(manifest());
    // pool weights bush_small=3, bush_large=1 ; total = 4
    // rand=0.1 → roll=0.4 → bush_small (running=3)
    expect(r.pickByWeight("bushes", () => 0.1)?.id).toBe("bush_small");
    // rand=0.9 → roll=3.6 → bush_large (running=4)
    expect(r.pickByWeight("bushes", () => 0.9)?.id).toBe("bush_large");
  });

  it("pickByWeight returns undefined for empty category", () => {
    const r = new VegetationRegistry(manifest());
    expect(r.pickByWeight("ghost")).toBeUndefined();
  });
});

describe("VegetationRegistry — onReloaded", () => {
  it("fires after every successful load()", () => {
    const r = new VegetationRegistry();
    const cb = vi.fn();
    r.onReloaded(cb);
    r.load(manifest());
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("returned unsubscribe stops further notifications", () => {
    const r = new VegetationRegistry();
    const cb = vi.fn();
    const off = r.onReloaded(cb);
    r.load(manifest());
    off();
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("a throwing listener does not break subsequent listeners", () => {
    const r = new VegetationRegistry();
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
