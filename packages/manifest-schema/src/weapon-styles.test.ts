/**
 * Faithfulness test: a weapon-styles manifest built from the values
 * currently hardcoded in
 * `packages/shared/src/constants/WeaponStyleConfig.ts` MUST parse cleanly.
 */

import { describe, expect, it } from "vitest";

import {
  WeaponStylesManifestSchema,
  type WeaponStylesManifest,
} from "./weapon-styles.js";

const hyperscapeWeaponStylesManifest: WeaponStylesManifest = {
  $schema: "hyperforge.weapon-styles.v1",
  styles: {
    sword: ["accurate", "aggressive", "defensive", "controlled"],
    scimitar: ["accurate", "aggressive", "defensive", "controlled"],
    mace: ["accurate", "aggressive", "defensive", "controlled"],
    spear: ["accurate", "aggressive", "defensive", "controlled"],
    longsword: ["accurate", "aggressive", "defensive", "controlled"],
    two_hand_sword: ["accurate", "aggressive", "defensive", "controlled"],
    halberd: ["accurate", "aggressive", "defensive", "controlled"],
    axe: ["accurate", "aggressive", "defensive"],
    dagger: ["accurate", "aggressive", "defensive"],
    none: ["accurate", "aggressive", "defensive"],
    bow: ["accurate", "rapid", "longrange"],
    crossbow: ["accurate", "rapid", "longrange"],
    staff: ["accurate", "aggressive", "defensive", "autocast"],
    wand: ["accurate", "aggressive", "defensive", "autocast"],
    shield: ["defensive"],
  },
};

describe("WeaponStylesManifestSchema", () => {
  it("parses the Hyperscape reference manifest cleanly", () => {
    const result = WeaponStylesManifestSchema.safeParse(
      hyperscapeWeaponStylesManifest,
    );
    if (!result.success) {
      throw new Error(
        `Hyperscape weapon-styles manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("rejects wrong schema version", () => {
    const wrong = {
      ...hyperscapeWeaponStylesManifest,
      $schema: "hyperforge.weapon-styles.v0",
    };
    const result = WeaponStylesManifestSchema.safeParse(wrong);
    expect(result.success).toBe(false);
  });

  it("rejects unknown weapon type", () => {
    const bad = {
      ...hyperscapeWeaponStylesManifest,
      styles: {
        ...hyperscapeWeaponStylesManifest.styles,
        bogus_weapon: ["accurate"],
      },
    };
    const result = WeaponStylesManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects unknown combat style", () => {
    const bad = {
      ...hyperscapeWeaponStylesManifest,
      styles: {
        ...hyperscapeWeaponStylesManifest.styles,
        sword: ["accurate", "heavenly"],
      },
    };
    const result = WeaponStylesManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});
