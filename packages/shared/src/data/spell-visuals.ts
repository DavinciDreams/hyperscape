/**
 * Spell Visual Configuration — manifest façade.
 *
 * Visual properties for combat spell projectiles and arrows,
 * loaded from `spell-visuals.json` and validated by
 * `SpellVisualsManifestSchema` from `@hyperforge/manifest-schema`
 * at module load time. Legacy exports (`SpellVisualConfig`,
 * `ArrowVisualConfig`, `SPELL_VISUALS`, `ARROW_VISUALS`,
 * `getSpellVisual`, `getArrowVisual`) are preserved unchanged.
 *
 * Properties:
 * - color: Base hex color for the spell orb
 * - coreColor: Bright center color (defaults to white)
 * - size: Base sprite size in world units
 * - glowIntensity: Additive blending strength (0-1)
 * - trailLength: Number of trail sprites (0 = no trail)
 * - trailFade: How quickly trail fades (higher = faster fade)
 * - pulseSpeed: Oscillation speed for size pulsing (0 = no pulse)
 * - pulseAmount: Size variation amount (0.1 = 10% size change)
 *
 * Extracted as part of Phase A11 of
 * `PLAN_WORLD_STUDIO_AAA_COMPLETION.md`.
 */

import {
  SpellVisualsManifestSchema,
  type SpellVisualConfig as SchemaSpellVisualConfig,
  type ArrowVisualConfig as SchemaArrowVisualConfig,
} from "@hyperforge/manifest-schema";

import spellVisualsManifestJson from "./spell-visuals.json" with { type: "json" };

export type SpellVisualConfig = SchemaSpellVisualConfig;
export type ArrowVisualConfig = SchemaArrowVisualConfig;

const manifest = SpellVisualsManifestSchema.parse(spellVisualsManifestJson);

/**
 * Spell visual configurations by spell ID.
 */
export const SPELL_VISUALS: Readonly<Record<string, SpellVisualConfig>> =
  Object.freeze(
    Object.fromEntries(
      Object.entries(manifest.spells).map(([id, cfg]) => [
        id,
        Object.freeze({ ...cfg }),
      ]),
    ) as Record<string, SpellVisualConfig>,
  );

/**
 * Arrow visual configuration by arrow type.
 */
export const ARROW_VISUALS: Readonly<Record<string, ArrowVisualConfig>> =
  Object.freeze(
    Object.fromEntries(
      Object.entries(manifest.arrows).map(([id, cfg]) => [
        id,
        Object.freeze({ ...cfg }),
      ]),
    ) as Record<string, ArrowVisualConfig>,
  );

const FALLBACK_SPELL_VISUAL: SpellVisualConfig = Object.freeze({
  ...manifest.fallbackSpell,
});

/**
 * Get spell visual config, with fallback to element-based default
 */
export function getSpellVisual(spellId: string): SpellVisualConfig {
  // Direct lookup
  if (spellId in SPELL_VISUALS) {
    return SPELL_VISUALS[spellId];
  }

  // Element-based fallback (strike tier)
  if (spellId.includes("wind") || spellId.includes("air")) {
    return SPELL_VISUALS.wind_strike ?? FALLBACK_SPELL_VISUAL;
  }
  if (spellId.includes("water")) {
    return SPELL_VISUALS.water_strike ?? FALLBACK_SPELL_VISUAL;
  }
  if (spellId.includes("earth")) {
    return SPELL_VISUALS.earth_strike ?? FALLBACK_SPELL_VISUAL;
  }
  if (spellId.includes("fire")) {
    return SPELL_VISUALS.fire_strike ?? FALLBACK_SPELL_VISUAL;
  }

  // Ultimate fallback - purple magic
  return FALLBACK_SPELL_VISUAL;
}

/**
 * Get arrow visual config by arrow item ID
 */
export function getArrowVisual(arrowId: string): ArrowVisualConfig {
  // Direct lookup
  if (arrowId in ARROW_VISUALS) {
    return ARROW_VISUALS[arrowId];
  }

  // Pattern matching for arrow types
  if (arrowId.includes("bronze")) {
    return ARROW_VISUALS.bronze_arrow ?? ARROW_VISUALS.default;
  }
  if (arrowId.includes("iron")) {
    return ARROW_VISUALS.iron_arrow ?? ARROW_VISUALS.default;
  }
  if (arrowId.includes("steel")) {
    return ARROW_VISUALS.steel_arrow ?? ARROW_VISUALS.default;
  }
  if (arrowId.includes("mithril")) {
    return ARROW_VISUALS.mithril_arrow ?? ARROW_VISUALS.default;
  }
  if (arrowId.includes("adamant")) {
    return ARROW_VISUALS.adamant_arrow ?? ARROW_VISUALS.default;
  }

  // Default arrow
  return ARROW_VISUALS.default;
}
