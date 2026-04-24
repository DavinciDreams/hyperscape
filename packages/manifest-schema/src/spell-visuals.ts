/**
 * Spell & arrow visuals manifest schema.
 *
 * Source of truth for projectile visual parameters (color, size,
 * glow, trail, pulse) used by `ProjectileRenderer`. Previously
 * hardcoded in `packages/shared/src/data/spell-visuals.ts`.
 *
 * Extracted as part of Phase A11 of
 * `PLAN_WORLD_STUDIO_AAA_COMPLETION.md`.
 */

import { z } from "zod";

export const SpellVisualConfigSchema = z.object({
  /** Base hex color for spell orb (0xRRGGBB as integer). */
  color: z.number().int().min(0).max(0xffffff),
  /** Core/center color (default: white). */
  coreColor: z.number().int().min(0).max(0xffffff).optional(),
  /** Base size in world units. */
  size: z.number().positive(),
  /** Additive blending intensity (0–1). */
  glowIntensity: z.number().min(0).max(1),
  /** Number of trail sprites (0 = none). */
  trailLength: z.number().int().min(0).optional(),
  /** Trail fade rate (higher = faster). */
  trailFade: z.number().min(0).optional(),
  /** Size pulse oscillation speed (0 = no pulse). */
  pulseSpeed: z.number().min(0).optional(),
  /** Size pulse amount (0.1 = 10%). */
  pulseAmount: z.number().min(0).optional(),
});
export type SpellVisualConfig = z.infer<typeof SpellVisualConfigSchema>;

export const ArrowVisualConfigSchema = z.object({
  shaftColor: z.number().int().min(0).max(0xffffff),
  headColor: z.number().int().min(0).max(0xffffff),
  fletchingColor: z.number().int().min(0).max(0xffffff),
  length: z.number().positive(),
  width: z.number().positive(),
  rotateToDirection: z.boolean(),
  arcHeight: z.number().min(0),
});
export type ArrowVisualConfig = z.infer<typeof ArrowVisualConfigSchema>;

export const SpellVisualsManifestSchema = z.object({
  $schema: z.literal("hyperforge.spell-visuals.v1"),
  /** Per-spell-ID visual configs. */
  spells: z.record(z.string().min(1), SpellVisualConfigSchema),
  /** Per-arrow-ID visual configs. Must include a "default" entry. */
  arrows: z
    .record(z.string().min(1), ArrowVisualConfigSchema)
    .refine((r) => "default" in r, {
      message: "arrows must include a 'default' fallback entry",
    }),
  /** Fallback purple-magic visual used when no spell match is found. */
  fallbackSpell: SpellVisualConfigSchema,
});
export type SpellVisualsManifest = z.infer<typeof SpellVisualsManifestSchema>;
