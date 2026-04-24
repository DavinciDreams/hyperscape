import { describe, expect, it } from "vitest";

import {
  CombatSpellsManifestSchema,
  type CombatSpellsManifest,
} from "./combat-spells.js";

const hyperscapeCombatSpells: CombatSpellsManifest = {
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
      {
        id: "water_strike",
        name: "Water Strike",
        level: 5,
        baseMaxHit: 4,
        baseXp: 7.5,
        element: "water",
        attackSpeed: 5,
        runes: [
          { runeId: "air_rune", quantity: 1 },
          { runeId: "water_rune", quantity: 1 },
          { runeId: "mind_rune", quantity: 1 },
        ],
      },
      {
        id: "earth_strike",
        name: "Earth Strike",
        level: 9,
        baseMaxHit: 6,
        baseXp: 9.5,
        element: "earth",
        attackSpeed: 5,
        runes: [
          { runeId: "air_rune", quantity: 1 },
          { runeId: "earth_rune", quantity: 2 },
          { runeId: "mind_rune", quantity: 1 },
        ],
      },
      {
        id: "fire_strike",
        name: "Fire Strike",
        level: 13,
        baseMaxHit: 8,
        baseXp: 11.5,
        element: "fire",
        attackSpeed: 5,
        runes: [
          { runeId: "air_rune", quantity: 2 },
          { runeId: "fire_rune", quantity: 3 },
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
      {
        id: "water_bolt",
        name: "Water Bolt",
        level: 23,
        baseMaxHit: 10,
        baseXp: 16.5,
        element: "water",
        attackSpeed: 5,
        runes: [
          { runeId: "air_rune", quantity: 2 },
          { runeId: "water_rune", quantity: 2 },
          { runeId: "chaos_rune", quantity: 1 },
        ],
      },
      {
        id: "earth_bolt",
        name: "Earth Bolt",
        level: 29,
        baseMaxHit: 11,
        baseXp: 19.5,
        element: "earth",
        attackSpeed: 5,
        runes: [
          { runeId: "air_rune", quantity: 2 },
          { runeId: "earth_rune", quantity: 3 },
          { runeId: "chaos_rune", quantity: 1 },
        ],
      },
      {
        id: "fire_bolt",
        name: "Fire Bolt",
        level: 35,
        baseMaxHit: 12,
        baseXp: 22.5,
        element: "fire",
        attackSpeed: 5,
        runes: [
          { runeId: "air_rune", quantity: 3 },
          { runeId: "fire_rune", quantity: 4 },
          { runeId: "chaos_rune", quantity: 1 },
        ],
      },
    ],
  },
};

describe("CombatSpellsManifestSchema", () => {
  it("parses the Hyperscape reference manifest cleanly", () => {
    const result = CombatSpellsManifestSchema.safeParse(hyperscapeCombatSpells);
    if (!result.success) {
      throw new Error(
        `Hyperscape combat-spells manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("rejects zero rune quantity", () => {
    const bad: CombatSpellsManifest = {
      standard: {
        strike: [
          {
            ...hyperscapeCombatSpells.standard.strike[0],
            runes: [{ runeId: "air_rune", quantity: 0 }],
          },
          ...hyperscapeCombatSpells.standard.strike.slice(1),
        ],
        bolt: hyperscapeCombatSpells.standard.bolt,
      },
    };
    expect(CombatSpellsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects empty strike array", () => {
    const bad = {
      standard: {
        strike: [],
        bolt: hyperscapeCombatSpells.standard.bolt,
      },
    };
    expect(CombatSpellsManifestSchema.safeParse(bad).success).toBe(false);
  });
});
