import { RunesManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import {
  RunesNotLoadedError,
  RunesRegistry,
  UnknownRuneError,
} from "../RunesRegistry.js";

function manifest() {
  return RunesManifestSchema.parse({
    runes: [
      { id: "airRune", name: "Air rune", element: "air", stackable: true },
      {
        id: "waterRune",
        name: "Water rune",
        element: "water",
        stackable: true,
      },
      {
        id: "earthRune",
        name: "Earth rune",
        element: "earth",
        stackable: true,
      },
      {
        id: "fireRune",
        name: "Fire rune",
        element: "fire",
        stackable: true,
      },
      { id: "mindRune", name: "Mind rune", element: null, stackable: true },
    ],
    elementalStaves: [
      { staffId: "staffOfAir", providesInfinite: ["airRune"] },
      {
        staffId: "staffOfFire",
        providesInfinite: ["fireRune"],
      },
    ],
  });
}

describe("RunesRegistry — not loaded", () => {
  it("throws pre-load", () => {
    expect(() => new RunesRegistry().manifest).toThrow(RunesNotLoadedError);
  });
});

describe("RunesRegistry — lookup", () => {
  it("indexes by id", () => {
    const r = new RunesRegistry(manifest());
    expect(r.has("airRune")).toBe(true);
    expect(r.get("mindRune").element).toBeNull();
  });

  it("throws on unknown", () => {
    const r = new RunesRegistry(manifest());
    expect(() => r.get("ghost")).toThrow(UnknownRuneError);
  });

  it("lists names", () => {
    const r = new RunesRegistry(manifest());
    expect(r.names()).toContain("Air rune");
  });
});

describe("RunesRegistry — elemental staves", () => {
  it("staff returns entry", () => {
    const r = new RunesRegistry(manifest());
    expect(r.staff("staffOfAir")?.providesInfinite).toEqual(["airRune"]);
    expect(r.staff("ghost")).toBeNull();
  });

  it("providedBy returns empty for unknown", () => {
    const r = new RunesRegistry(manifest());
    expect(r.providedBy("ghost")).toEqual([]);
  });
});

describe("RunesRegistry — effectiveCost", () => {
  const required = [
    { runeId: "airRune", quantity: 1 },
    { runeId: "mindRune", quantity: 1 },
  ];

  it("no staff → unchanged", () => {
    const r = new RunesRegistry(manifest());
    expect(r.effectiveCost(required, null)).toEqual(required);
  });

  it("staff removes provided runes", () => {
    const r = new RunesRegistry(manifest());
    expect(r.effectiveCost(required, "staffOfAir")).toEqual([
      { runeId: "mindRune", quantity: 1 },
    ]);
  });

  it("staff without matching runes leaves cost intact", () => {
    const r = new RunesRegistry(manifest());
    expect(r.effectiveCost(required, "staffOfFire")).toEqual(required);
  });
});
