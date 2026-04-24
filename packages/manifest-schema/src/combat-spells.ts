/**
 * Combat spells manifest schema.
 *
 * Source of truth for F2P combat spells (Standard Spellbook, Strike
 * and Bolt tiers). Previously hardcoded in
 * `packages/shared/src/data/combat-spells.ts`. Extracted as part of
 * Phase A11 of `PLAN_WORLD_STUDIO_AAA_COMPLETION.md`.
 *
 * Schema mirrors the existing server JSON grouped by spellbook tier
 * (standard.strike, standard.bolt). The shared façade flattens this
 * into a `Record<spellId, SpellData>` plus an ordered `SPELL_ORDER`.
 */

import { z } from "zod";

export const CombatSpellRuneSchema = z.object({
  runeId: z.string().min(1),
  quantity: z.number().int().positive(),
});
export type CombatSpellRune = z.infer<typeof CombatSpellRuneSchema>;

export const CombatSpellEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  level: z.number().int().nonnegative(),
  baseMaxHit: z.number().nonnegative(),
  baseXp: z.number().nonnegative(),
  element: z.string().min(1),
  attackSpeed: z.number().int().positive(),
  runes: z.array(CombatSpellRuneSchema).min(1),
});
export type CombatSpellEntry = z.infer<typeof CombatSpellEntrySchema>;

export const CombatSpellsStandardSchema = z.object({
  strike: z.array(CombatSpellEntrySchema).min(1),
  bolt: z.array(CombatSpellEntrySchema).min(1),
});
export type CombatSpellsStandard = z.infer<typeof CombatSpellsStandardSchema>;

export const CombatSpellsManifestSchema = z.object({
  _comment: z.string().optional(),
  standard: CombatSpellsStandardSchema,
});
export type CombatSpellsManifest = z.infer<typeof CombatSpellsManifestSchema>;
