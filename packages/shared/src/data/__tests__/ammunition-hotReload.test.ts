/**
 * Hot-reload tests for `ammunition`.
 *
 * Verifies that `hotReloadAmmunition(manifest)` swaps arrow + bow data
 * in place while preserving the top-level `ARROW_DATA` / `BOW_TIERS`
 * references — the invariant that lets `AmmunitionService` keep
 * reading `ARROW_DATA[id]` / `BOW_TIERS[id]` without re-importing
 * after a PIE hot-reload.
 */

import { describe, expect, it, afterAll } from "vitest";

import type { AmmunitionManifest } from "@hyperforge/manifest-schema";

import { ARROW_DATA, BOW_TIERS, hotReloadAmmunition } from "../ammunition.js";

// Snapshot the module's initial state so tests can restore it
// afterwards — otherwise mutations here would leak into other tests
// that rely on the bundled `ammunition.json`.
const INITIAL_SNAPSHOT: AmmunitionManifest = {
  $schema: "hyperforge.ammunition.v1",
  bowTiers: { ...BOW_TIERS },
  arrows: Object.fromEntries(
    Object.entries(ARROW_DATA).map(([id, a]) => [id, { ...a }]),
  ),
};

afterAll(() => {
  hotReloadAmmunition(INITIAL_SNAPSHOT);
});

describe("ammunition hot-reload", () => {
  it("preserves the top-level ARROW_DATA / BOW_TIERS references across reloads", () => {
    const arrowsBefore = ARROW_DATA;
    const bowsBefore = BOW_TIERS;
    hotReloadAmmunition({
      $schema: "hyperforge.ammunition.v1",
      bowTiers: { custom_bow: 1 },
      arrows: {
        custom_arrow: {
          id: "custom_arrow",
          name: "Custom Arrow",
          rangedStrength: 5,
          requiredRangedLevel: 1,
          requiredBowTier: 1,
        },
      },
    });
    // Same object identity — callers that imported the binding once
    // at module-load time still see the new data.
    expect(ARROW_DATA).toBe(arrowsBefore);
    expect(BOW_TIERS).toBe(bowsBefore);
  });

  it("hot-reload replaces the prior set — keys not in the new manifest vanish", () => {
    hotReloadAmmunition({
      $schema: "hyperforge.ammunition.v1",
      bowTiers: { bronze_bow: 1, iron_bow: 2 },
      arrows: {
        bronze_arrow: {
          id: "bronze_arrow",
          name: "Bronze arrow",
          rangedStrength: 7,
          requiredRangedLevel: 1,
          requiredBowTier: 1,
        },
        iron_arrow: {
          id: "iron_arrow",
          name: "Iron arrow",
          rangedStrength: 10,
          requiredRangedLevel: 1,
          requiredBowTier: 2,
        },
      },
    });
    expect(BOW_TIERS["bronze_bow"]).toBe(1);
    expect(BOW_TIERS["iron_bow"]).toBe(2);
    expect(ARROW_DATA["bronze_arrow"]?.rangedStrength).toBe(7);
    expect(ARROW_DATA["iron_arrow"]?.rangedStrength).toBe(10);

    // Second reload drops iron_*; stale keys must NOT linger.
    hotReloadAmmunition({
      $schema: "hyperforge.ammunition.v1",
      bowTiers: { bronze_bow: 1 },
      arrows: {
        bronze_arrow: {
          id: "bronze_arrow",
          name: "Bronze arrow",
          rangedStrength: 7,
          requiredRangedLevel: 1,
          requiredBowTier: 1,
        },
      },
    });
    expect(BOW_TIERS["bronze_bow"]).toBe(1);
    expect(BOW_TIERS["iron_bow"]).toBeUndefined();
    expect(ARROW_DATA["bronze_arrow"]?.rangedStrength).toBe(7);
    expect(ARROW_DATA["iron_arrow"]).toBeUndefined();
  });

  it("hot-reload overwrites same-id entries", () => {
    hotReloadAmmunition({
      $schema: "hyperforge.ammunition.v1",
      bowTiers: { magic_bow: 5 },
      arrows: {
        rune_arrow: {
          id: "rune_arrow",
          name: "Rune arrow",
          rangedStrength: 26,
          requiredRangedLevel: 40,
          requiredBowTier: 4,
        },
      },
    });
    expect(BOW_TIERS["magic_bow"]).toBe(5);
    expect(ARROW_DATA["rune_arrow"]?.rangedStrength).toBe(26);

    hotReloadAmmunition({
      $schema: "hyperforge.ammunition.v1",
      bowTiers: { magic_bow: 6 },
      arrows: {
        rune_arrow: {
          id: "rune_arrow",
          name: "Rune arrow (buffed)",
          rangedStrength: 30,
          requiredRangedLevel: 40,
          requiredBowTier: 5,
        },
      },
    });
    expect(BOW_TIERS["magic_bow"]).toBe(6);
    expect(ARROW_DATA["rune_arrow"]?.name).toBe("Rune arrow (buffed)");
    expect(ARROW_DATA["rune_arrow"]?.rangedStrength).toBe(30);
    expect(ARROW_DATA["rune_arrow"]?.requiredBowTier).toBe(5);
  });

  it("malformed manifest throws without mutating live state", () => {
    hotReloadAmmunition({
      $schema: "hyperforge.ammunition.v1",
      bowTiers: { baseline_bow: 1 },
      arrows: {
        baseline_arrow: {
          id: "baseline_arrow",
          name: "Baseline arrow",
          rangedStrength: 7,
          requiredRangedLevel: 1,
          requiredBowTier: 1,
        },
      },
    });
    const bowSnapshot = BOW_TIERS["baseline_bow"];
    const arrowSnapshot = { ...ARROW_DATA["baseline_arrow"]! };

    // `rangedStrength` must be a number — string should trip zod.
    expect(() =>
      hotReloadAmmunition({
        $schema: "hyperforge.ammunition.v1",
        bowTiers: { bad_bow: 2 },
        arrows: {
          bad_arrow: {
            id: "bad_arrow",
            name: "Bad arrow",
            rangedStrength: "oops" as unknown as number,
            requiredRangedLevel: 1,
            requiredBowTier: 1,
          },
        },
      }),
    ).toThrow();

    // Prior state preserved.
    expect(BOW_TIERS["baseline_bow"]).toBe(bowSnapshot);
    expect(ARROW_DATA["baseline_arrow"]).toEqual(arrowSnapshot);
    expect(BOW_TIERS["bad_bow"]).toBeUndefined();
    expect(ARROW_DATA["bad_arrow"]).toBeUndefined();
  });
});
