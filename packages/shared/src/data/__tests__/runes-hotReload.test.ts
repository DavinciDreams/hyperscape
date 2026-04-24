/**
 * Tests for `hotReloadRunes` — the entry point the editor's PIE session
 * uses to push rune manifest edits into the running game without a
 * Stop → Play cycle (Phase B3.1e).
 *
 * Invariant: the module-level exports (`ELEMENTAL_STAVES`, `RUNE_NAMES`,
 * `VALID_RUNES`) keep the same object/array reference across reloads —
 * consumers that cached the reference must see the new contents on
 * their next read.
 */
import { describe, it, expect } from "vitest";
import type { RunesManifest } from "@hyperforge/manifest-schema";
import {
  ELEMENTAL_STAVES,
  RUNE_NAMES,
  VALID_RUNES,
  hotReloadRunes,
} from "../runes";

const BASELINE_MANIFEST: RunesManifest = {
  runes: [
    { id: "air_rune", name: "Air rune", element: "air", stackable: true },
    { id: "water_rune", name: "Water rune", element: "water", stackable: true },
    { id: "mind_rune", name: "Mind rune", element: null, stackable: true },
  ],
  elementalStaves: [
    { staffId: "staff_of_air", providesInfinite: ["air_rune"] },
    { staffId: "staff_of_water", providesInfinite: ["water_rune"] },
  ],
};

describe("hotReloadRunes", () => {
  it("swaps manifest content in-place on the stable exports", () => {
    const stavesRef = ELEMENTAL_STAVES;
    const namesRef = RUNE_NAMES;
    const validRef = VALID_RUNES;

    hotReloadRunes(BASELINE_MANIFEST);

    // Same references — consumers that captured the export see the update.
    expect(ELEMENTAL_STAVES).toBe(stavesRef);
    expect(RUNE_NAMES).toBe(namesRef);
    expect(VALID_RUNES).toBe(validRef);

    expect(VALID_RUNES).toEqual(["air_rune", "water_rune", "mind_rune"]);
    expect(RUNE_NAMES.air_rune).toBe("Air runes");
    expect(ELEMENTAL_STAVES.staff_of_air).toEqual(["air_rune"]);
  });

  it("clears stale entries when the manifest shrinks", () => {
    hotReloadRunes(BASELINE_MANIFEST);
    expect(VALID_RUNES).toContain("water_rune");
    expect(ELEMENTAL_STAVES).toHaveProperty("staff_of_water");

    hotReloadRunes({
      runes: [
        {
          id: "fire_rune",
          name: "Fire rune",
          element: "fire",
          stackable: true,
        },
      ],
      elementalStaves: [
        { staffId: "staff_of_fire", providesInfinite: ["fire_rune"] },
      ],
    });

    expect(VALID_RUNES).toEqual(["fire_rune"]);
    expect(RUNE_NAMES).not.toHaveProperty("air_rune");
    expect(RUNE_NAMES).not.toHaveProperty("water_rune");
    expect(ELEMENTAL_STAVES).not.toHaveProperty("staff_of_air");
    expect(ELEMENTAL_STAVES).not.toHaveProperty("staff_of_water");
    expect(ELEMENTAL_STAVES.staff_of_fire).toEqual(["fire_rune"]);
  });

  it("rejects malformed manifests and leaves prior state intact", () => {
    hotReloadRunes(BASELINE_MANIFEST);
    const validBefore = [...VALID_RUNES];

    // `runes` array must have at least one entry per RunesManifestSchema.
    expect(() =>
      hotReloadRunes({
        runes: [],
        elementalStaves: [
          { staffId: "staff_of_air", providesInfinite: ["air_rune"] },
        ],
      } as unknown as RunesManifest),
    ).toThrow();

    expect(VALID_RUNES).toEqual(validBefore);
  });
});
