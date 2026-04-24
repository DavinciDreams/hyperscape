import { CombatSpellsManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import {
  CombatSpellsNotLoadedError,
  CombatSpellsRegistry,
  UnknownCombatSpellError,
} from "../CombatSpellsRegistry.js";

function manifest() {
  return CombatSpellsManifestSchema.parse({
    standard: {
      strike: [
        {
          id: "windStrike",
          name: "Wind strike",
          level: 1,
          baseMaxHit: 2,
          baseXp: 5.5,
          element: "air",
          attackSpeed: 4,
          runes: [
            { runeId: "airRune", quantity: 1 },
            { runeId: "mindRune", quantity: 1 },
          ],
        },
        {
          id: "waterStrike",
          name: "Water strike",
          level: 5,
          baseMaxHit: 4,
          baseXp: 7.5,
          element: "water",
          attackSpeed: 4,
          runes: [
            { runeId: "waterRune", quantity: 1 },
            { runeId: "airRune", quantity: 1 },
            { runeId: "mindRune", quantity: 1 },
          ],
        },
      ],
      bolt: [
        {
          id: "windBolt",
          name: "Wind bolt",
          level: 17,
          baseMaxHit: 9,
          baseXp: 13.5,
          element: "air",
          attackSpeed: 4,
          runes: [
            { runeId: "airRune", quantity: 2 },
            { runeId: "chaosRune", quantity: 1 },
          ],
        },
      ],
    },
  });
}

describe("CombatSpellsRegistry — not loaded", () => {
  it("throws pre-load", () => {
    expect(() => new CombatSpellsRegistry().manifest).toThrow(
      CombatSpellsNotLoadedError,
    );
  });
});

describe("CombatSpellsRegistry — lookup", () => {
  it("flattens strike + bolt into single registry", () => {
    const r = new CombatSpellsRegistry(manifest());
    expect(r.get("windStrike").element).toBe("air");
    expect(r.get("windBolt").level).toBe(17);
    expect(r.order()).toEqual(["windStrike", "waterStrike", "windBolt"]);
  });

  it("throws on unknown", () => {
    const r = new CombatSpellsRegistry(manifest());
    expect(() => r.get("ghost")).toThrow(UnknownCombatSpellError);
  });

  it("tierOf identifies group", () => {
    const r = new CombatSpellsRegistry(manifest());
    expect(r.tierOf("windStrike")).toBe("strike");
    expect(r.tierOf("windBolt")).toBe("bolt");
  });
});

describe("CombatSpellsRegistry — filters", () => {
  it("byTier", () => {
    const r = new CombatSpellsRegistry(manifest());
    expect(r.byTier("strike").map((s) => s.id)).toEqual([
      "windStrike",
      "waterStrike",
    ]);
    expect(r.byTier("bolt").map((s) => s.id)).toEqual(["windBolt"]);
  });

  it("byElement", () => {
    const r = new CombatSpellsRegistry(manifest());
    expect(r.byElement("air").map((s) => s.id)).toEqual([
      "windStrike",
      "windBolt",
    ]);
  });
});

describe("CombatSpellsRegistry — canCast", () => {
  it("gates on magic level", () => {
    const r = new CombatSpellsRegistry(manifest());
    expect(r.canCast("windStrike", 1)).toBe(true);
    expect(r.canCast("windBolt", 16)).toBe(false);
    expect(r.canCast("windBolt", 17)).toBe(true);
  });
});
