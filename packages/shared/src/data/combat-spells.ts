/**
 * Combat Spells Manifest — MANIFEST FAÇADE
 *
 * As of Phase A11 of PLAN_WORLD_STUDIO_AAA_COMPLETION.md, combat
 * spells live in `combat-spells.json`, validated at module load time
 * against `CombatSpellsManifestSchema` from
 * `@hyperforge/manifest-schema`.
 *
 * Defines all F2P combat spells (Strike and Bolt tiers).
 *
 * The exported map/array references (`COMBAT_SPELLS`, `SPELL_ORDER`)
 * are stable; their contents are rebuilt in-place by
 * `hotReloadCombatSpells()` (Phase B3.1e) so the editor's PIE session
 * can swap the spell manifest without a Stop → Play cycle. They are
 * intentionally NOT `Object.freeze`d so the hot-reload path can clear
 * and refill them.
 *
 * @see https://oldschool.runescape.wiki/w/Spells
 */

import {
  CombatSpellsManifestSchema,
  type CombatSpellsManifest,
} from "@hyperforge/manifest-schema";

import { combatSpellsRegistry } from "../combat-spells/index.js";

import combatSpellsManifestJson from "./combat-spells.json" with { type: "json" };
import type { RuneRequirement } from "../systems/shared/combat/RuneService";

export interface SpellData {
  id: string;
  name: string;
  level: number;
  baseMaxHit: number;
  baseXp: number;
  element: string;
  attackSpeed: number;
  runes: RuneRequirement[];
}

/** All F2P combat spells keyed by spell ID */
export const COMBAT_SPELLS: Record<string, SpellData> = {};

/** All spell IDs in order of level */
export const SPELL_ORDER: string[] = [];

function rebuildFromManifest(manifest: CombatSpellsManifest): void {
  for (const k of Object.keys(COMBAT_SPELLS)) delete COMBAT_SPELLS[k];
  SPELL_ORDER.length = 0;

  for (const spell of [
    ...manifest.standard.strike,
    ...manifest.standard.bolt,
  ]) {
    COMBAT_SPELLS[spell.id] = {
      id: spell.id,
      name: spell.name,
      level: spell.level,
      baseMaxHit: spell.baseMaxHit,
      baseXp: spell.baseXp,
      element: spell.element,
      attackSpeed: spell.attackSpeed,
      runes: spell.runes.map((r) => ({
        runeId: r.runeId,
        quantity: r.quantity,
      })),
    };
    SPELL_ORDER.push(spell.id);
  }
  // Mirror into the runtime combatSpellsRegistry so SpellService's
  // registry-prefer branch fires in production — not just after a
  // PIE edit. Single-source-of-truth: the data/ module owns boot-load,
  // hot-reload-in-place, AND registry-mirror.
  combatSpellsRegistry.load(manifest);
}

// Initial load — schema-validated at module load so bad JSON fails fast.
rebuildFromManifest(CombatSpellsManifestSchema.parse(combatSpellsManifestJson));

/**
 * Hot-reload combat spells from the editor's PIE session (Phase B3).
 * Validates the manifest; on success, clears and refills the exported
 * map/array in-place so the CombatSystem sees new spell data on its next
 * attack-time lookup without re-importing. Throws (and leaves prior
 * state intact) if the manifest fails schema validation.
 */
export function hotReloadCombatSpells(manifest: CombatSpellsManifest): void {
  rebuildFromManifest(CombatSpellsManifestSchema.parse(manifest));
}
