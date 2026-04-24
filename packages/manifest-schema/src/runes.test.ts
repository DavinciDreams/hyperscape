/**
 * Faithfulness test: a runes manifest built from the values currently
 * in `packages/server/world/assets/manifests/runes.json` MUST parse
 * cleanly.
 */

import { describe, expect, it } from "vitest";

import { RunesManifestSchema, type RunesManifest } from "./runes.js";

const hyperscapeRunesManifest: RunesManifest = {
  _comment:
    "Runes manifest for magic combat. F2P scope: only runes needed for Strike and Bolt combat spells.",
  runes: [
    { id: "air_rune", name: "Air rune", element: "air", stackable: true },
    { id: "water_rune", name: "Water rune", element: "water", stackable: true },
    { id: "earth_rune", name: "Earth rune", element: "earth", stackable: true },
    { id: "fire_rune", name: "Fire rune", element: "fire", stackable: true },
    { id: "mind_rune", name: "Mind rune", element: null, stackable: true },
    { id: "chaos_rune", name: "Chaos rune", element: null, stackable: true },
  ],
  elementalStaves: [
    { staffId: "staff_of_air", providesInfinite: ["air_rune"] },
    { staffId: "staff_of_water", providesInfinite: ["water_rune"] },
    { staffId: "staff_of_earth", providesInfinite: ["earth_rune"] },
    { staffId: "staff_of_fire", providesInfinite: ["fire_rune"] },
  ],
};

describe("RunesManifestSchema", () => {
  it("parses the Hyperscape reference manifest cleanly", () => {
    const result = RunesManifestSchema.safeParse(hyperscapeRunesManifest);
    if (!result.success) {
      throw new Error(
        `Hyperscape runes manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("rejects empty runes list", () => {
    const bad = { ...hyperscapeRunesManifest, runes: [] };
    expect(RunesManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects rune with empty name", () => {
    const bad = {
      ...hyperscapeRunesManifest,
      runes: [
        { id: "air_rune", name: "", element: "air", stackable: true },
        ...hyperscapeRunesManifest.runes.slice(1),
      ],
    };
    expect(RunesManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects staff with empty providesInfinite", () => {
    const bad = {
      ...hyperscapeRunesManifest,
      elementalStaves: [
        { staffId: "staff_of_air", providesInfinite: [] },
        ...hyperscapeRunesManifest.elementalStaves.slice(1),
      ],
    };
    expect(RunesManifestSchema.safeParse(bad).success).toBe(false);
  });
});
