/**
 * Ammunition manifest schema.
 *
 * Source of truth for bow tier requirements and arrow stats used by
 * the ranged combat system. Previously hardcoded in
 * `packages/shared/src/data/ammunition.ts`. Extracted as part of Phase
 * A11 of `PLAN_WORLD_STUDIO_AAA_COMPLETION.md`.
 *
 * Arrows require a bow of equal or higher tier. F2P scope: standard
 * arrows only (no bolts, no thrown weapons).
 */

import { z } from "zod";

export const ArrowEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  rangedStrength: z.number().int().nonnegative(),
  requiredRangedLevel: z.number().int().nonnegative(),
  requiredBowTier: z.number().int().nonnegative(),
});
export type ArrowEntry = z.infer<typeof ArrowEntrySchema>;

export const AmmunitionManifestSchema = z.object({
  $schema: z.literal("hyperforge.ammunition.v1"),
  /** bowId → tier level */
  bowTiers: z.record(z.string().min(1), z.number().int().nonnegative()),
  /** arrowId → arrow data */
  arrows: z.record(z.string().min(1), ArrowEntrySchema),
});
export type AmmunitionManifest = z.infer<typeof AmmunitionManifestSchema>;
