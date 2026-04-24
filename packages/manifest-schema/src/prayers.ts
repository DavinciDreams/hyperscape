/**
 * Prayers manifest schema.
 *
 * Source of truth for `prayers.json`. Previously
 * `PrayerDataProvider.loadPrayers` accepted any untyped
 * `PrayersManifest` and fell back to hand-rolled per-field type guards.
 * Zod validation replaces the per-field guards with a single
 * declarative schema.
 *
 * PrayerCategory ("offensive" | "defensive" | "utility") and the
 * `isValidPrayerId` / `isValidPrayerBonuses` guards stay in
 * `prayer-types.ts` for in-engine reuse; this schema mirrors them for
 * the manifest parse path.
 *
 * Extracted as part of Phase A11 of
 * `PLAN_WORLD_STUDIO_AAA_COMPLETION.md`.
 */

import { z } from "zod";

/** Matches `PRAYER_ID_PATTERN` in `prayer-types.ts`. */
const PRAYER_ID_REGEX = /^[a-z][a-z0-9_]{0,63}$/;

export const PrayerCategorySchema = z.enum([
  "offensive",
  "defensive",
  "utility",
]);
export type PrayerCategory = z.infer<typeof PrayerCategorySchema>;

export const PrayerBonusesSchema = z
  .object({
    attackMultiplier: z.number().optional(),
    strengthMultiplier: z.number().optional(),
    defenseMultiplier: z.number().optional(),
    rangedAttackMultiplier: z.number().optional(),
    rangedStrengthMultiplier: z.number().optional(),
    magicAttackMultiplier: z.number().optional(),
    magicDefenseMultiplier: z.number().optional(),
  })
  .strict();
export type PrayerBonuses = z.infer<typeof PrayerBonusesSchema>;

export const PrayerDefinitionSchema = z.object({
  id: z.string().regex(PRAYER_ID_REGEX),
  name: z.string().min(1),
  description: z.string().min(1),
  icon: z.string().min(1),
  level: z.number().int().min(1).max(99),
  category: PrayerCategorySchema,
  /** Drain rate; non-negative. */
  drainEffect: z.number().min(0),
  bonuses: PrayerBonusesSchema,
  conflicts: z.array(z.string().regex(PRAYER_ID_REGEX)),
});
export type PrayerDefinition = z.infer<typeof PrayerDefinitionSchema>;

export const PrayersManifestSchema = z.object({
  prayers: z.array(PrayerDefinitionSchema).min(1),
});
export type PrayersManifest = z.infer<typeof PrayersManifestSchema>;
