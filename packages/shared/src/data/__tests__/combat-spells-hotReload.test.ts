/**
 * Tests for `hotReloadCombatSpells` — the entry point the editor's PIE
 * session uses to push spell manifest edits into the running game
 * without a Stop → Play cycle (Phase B3.1e).
 *
 * Invariant: the module-level exports (`COMBAT_SPELLS`, `SPELL_ORDER`)
 * keep the same object/array reference across reloads — CombatSystem
 * reads the map each attack, so updates are visible on the next swing.
 */
import { describe, it, expect } from "vitest";
import type { CombatSpellsManifest } from "@hyperforge/manifest-schema";
import {
  COMBAT_SPELLS,
  SPELL_ORDER,
  hotReloadCombatSpells,
} from "../combat-spells";

const BASELINE: CombatSpellsManifest = {
  standard: {
    strike: [
      {
        id: "wind_strike",
        name: "Wind Strike",
        level: 1,
        baseMaxHit: 2,
        baseXp: 5.5,
        element: "air",
        attackSpeed: 5,
        runes: [
          { runeId: "air_rune", quantity: 1 },
          { runeId: "mind_rune", quantity: 1 },
        ],
      },
    ],
    bolt: [
      {
        id: "wind_bolt",
        name: "Wind Bolt",
        level: 17,
        baseMaxHit: 9,
        baseXp: 13.5,
        element: "air",
        attackSpeed: 5,
        runes: [
          { runeId: "air_rune", quantity: 2 },
          { runeId: "chaos_rune", quantity: 1 },
        ],
      },
    ],
  },
};

describe("hotReloadCombatSpells", () => {
  it("swaps manifest content in-place on the stable exports", () => {
    const spellsRef = COMBAT_SPELLS;
    const orderRef = SPELL_ORDER;

    hotReloadCombatSpells(BASELINE);

    expect(COMBAT_SPELLS).toBe(spellsRef);
    expect(SPELL_ORDER).toBe(orderRef);

    expect(SPELL_ORDER).toEqual(["wind_strike", "wind_bolt"]);
    expect(COMBAT_SPELLS.wind_strike?.baseMaxHit).toBe(2);
    expect(COMBAT_SPELLS.wind_bolt?.level).toBe(17);
    expect(COMBAT_SPELLS.wind_strike?.runes).toEqual([
      { runeId: "air_rune", quantity: 1 },
      { runeId: "mind_rune", quantity: 1 },
    ]);
  });

  it("picks up per-spell edits on the next lookup", () => {
    hotReloadCombatSpells(BASELINE);
    expect(COMBAT_SPELLS.wind_strike?.baseMaxHit).toBe(2);

    hotReloadCombatSpells({
      ...BASELINE,
      standard: {
        ...BASELINE.standard,
        strike: [
          {
            ...BASELINE.standard.strike[0]!,
            baseMaxHit: 99,
            baseXp: 42,
          },
        ],
      },
    });

    expect(COMBAT_SPELLS.wind_strike?.baseMaxHit).toBe(99);
    expect(COMBAT_SPELLS.wind_strike?.baseXp).toBe(42);
  });

  it("rejects malformed manifests and leaves prior state intact", () => {
    hotReloadCombatSpells(BASELINE);
    const orderBefore = [...SPELL_ORDER];

    // `strike` array must be non-empty per CombatSpellsStandardSchema.
    expect(() =>
      hotReloadCombatSpells({
        standard: {
          strike: [],
          bolt: BASELINE.standard.bolt,
        },
      } as unknown as CombatSpellsManifest),
    ).toThrow();

    expect(SPELL_ORDER).toEqual(orderBefore);
  });
});
