import { describe, expect, it } from "vitest";

import {
  SpellVisualsManifestSchema,
  type SpellVisualsManifest,
} from "./spell-visuals.js";

const hyperscapeSpellVisuals: SpellVisualsManifest = {
  $schema: "hyperforge.spell-visuals.v1",
  spells: {
    wind_strike: {
      color: 0xcccccc,
      coreColor: 0xffffff,
      size: 0.35,
      glowIntensity: 0.4,
      trailLength: 3,
      trailFade: 0.5,
      pulseSpeed: 0,
      pulseAmount: 0,
    },
    fire_bolt: {
      color: 0xff4500,
      coreColor: 0xffff00,
      size: 0.7,
      glowIntensity: 0.9,
      trailLength: 5,
      trailFade: 0.4,
      pulseSpeed: 5,
      pulseAmount: 0.2,
    },
  },
  arrows: {
    default: {
      shaftColor: 0x8b4513,
      headColor: 0xa0a0a0,
      fletchingColor: 0xffffff,
      length: 0.5,
      width: 0.08,
      rotateToDirection: true,
      arcHeight: 0,
    },
  },
  fallbackSpell: {
    color: 0x9966ff,
    coreColor: 0xccaaff,
    size: 0.3,
    glowIntensity: 0.4,
    trailLength: 4,
    trailFade: 0.35,
  },
};

describe("SpellVisualsManifestSchema", () => {
  it("parses a realistic manifest cleanly", () => {
    const result = SpellVisualsManifestSchema.safeParse(hyperscapeSpellVisuals);
    if (!result.success) {
      throw new Error(
        `Spell visuals manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("rejects missing 'default' arrow entry", () => {
    const bad = { ...hyperscapeSpellVisuals, arrows: {} };
    expect(SpellVisualsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects glow intensity above 1", () => {
    const bad = {
      ...hyperscapeSpellVisuals,
      spells: {
        wind_strike: {
          ...hyperscapeSpellVisuals.spells.wind_strike,
          glowIntensity: 1.5,
        },
      },
    };
    expect(SpellVisualsManifestSchema.safeParse(bad).success).toBe(false);
  });
});
