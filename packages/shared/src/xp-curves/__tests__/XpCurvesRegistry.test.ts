import { XpCurvesManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import {
  UnknownXpCurveError,
  XpCurvesNotLoadedError,
  XpCurvesRegistry,
  XpLevelOutOfRangeError,
} from "../XpCurvesRegistry.js";

function manifest() {
  return XpCurvesManifestSchema.parse([
    {
      id: "rsClassic",
      name: "RuneScape classic",
      kind: "formula",
      formula: "rs-classic",
      maxLevel: 99,
    },
    {
      id: "linear",
      name: "Linear 100/100",
      kind: "formula",
      formula: "linear",
      maxLevel: 10,
      params: { base: 100, growth: 100 },
    },
    {
      id: "table",
      name: "Lookup",
      kind: "lookup",
      xp: [83, 174, 276, 388, 512],
    },
  ]);
}

describe("XpCurvesRegistry — not loaded", () => {
  it("throws pre-load", () => {
    expect(() => new XpCurvesRegistry().manifest).toThrow(
      XpCurvesNotLoadedError,
    );
  });
});

describe("XpCurvesRegistry — lookup", () => {
  it("indexes by id", () => {
    const r = new XpCurvesRegistry(manifest());
    expect(r.has("rsClassic")).toBe(true);
    expect(r.get("linear").name).toBe("Linear 100/100");
  });

  it("throws on unknown", () => {
    const r = new XpCurvesRegistry(manifest());
    expect(() => r.get("ghost")).toThrow(UnknownXpCurveError);
  });
});

describe("XpCurvesRegistry — rs-classic formula", () => {
  it("level 1 costs 0", () => {
    const r = new XpCurvesRegistry(manifest());
    expect(r.xpForLevel("rsClassic", 1)).toBe(0);
  });

  it("matches OSRS canonical thresholds", () => {
    const r = new XpCurvesRegistry(manifest());
    expect(r.xpForLevel("rsClassic", 2)).toBe(83);
    expect(r.xpForLevel("rsClassic", 10)).toBe(1154);
    expect(r.xpForLevel("rsClassic", 99)).toBe(13034431);
  });

  it("throws on out-of-range level", () => {
    const r = new XpCurvesRegistry(manifest());
    expect(() => r.xpForLevel("rsClassic", 100)).toThrow(
      XpLevelOutOfRangeError,
    );
  });
});

describe("XpCurvesRegistry — linear formula", () => {
  it("level 2 equals base", () => {
    const r = new XpCurvesRegistry(manifest());
    expect(r.xpForLevel("linear", 2)).toBe(100);
  });
  it("level 10 equals base + 8*growth", () => {
    const r = new XpCurvesRegistry(manifest());
    expect(r.xpForLevel("linear", 10)).toBe(900);
  });
});

describe("XpCurvesRegistry — lookup table", () => {
  it("xpForLevel pulls entry", () => {
    const r = new XpCurvesRegistry(manifest());
    expect(r.xpForLevel("table", 2)).toBe(83);
    expect(r.xpForLevel("table", 6)).toBe(512);
  });

  it("maxLevel equals table length + 1", () => {
    const r = new XpCurvesRegistry(manifest());
    expect(r.maxLevel("table")).toBe(6);
  });

  it("throws above max", () => {
    const r = new XpCurvesRegistry(manifest());
    expect(() => r.xpForLevel("table", 7)).toThrow(XpLevelOutOfRangeError);
  });
});

describe("XpCurvesRegistry — levelForXp", () => {
  it("below first threshold → level 1", () => {
    const r = new XpCurvesRegistry(manifest());
    expect(r.levelForXp("rsClassic", 0)).toBe(1);
    expect(r.levelForXp("rsClassic", 82)).toBe(1);
  });

  it("exact threshold grants next level", () => {
    const r = new XpCurvesRegistry(manifest());
    expect(r.levelForXp("rsClassic", 83)).toBe(2);
  });

  it("max xp caps at maxLevel", () => {
    const r = new XpCurvesRegistry(manifest());
    expect(r.levelForXp("rsClassic", 999_999_999)).toBe(99);
  });
});
