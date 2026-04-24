/**
 * Processing manifest schema.
 *
 * Source of truth for the processing constants previously hardcoded in
 * `packages/shared/src/constants/ProcessingConstants.ts`. Extracted as part
 * of Phase A4 of `PLAN_WORLD_STUDIO_AAA_COMPLETION.md`.
 *
 * Item-specific processing data (cook XP, burn levels, firemaking XP per
 * log) continues to live in `items.json` and is not duplicated here. This
 * manifest covers only mechanic constants (timing, success-rate table,
 * fire properties, walk priority).
 */

import { z } from "zod";

export const FiremakingMechanicsSchema = z.object({
  type: z.literal("fixed-roll-retry-on-fail"),
  baseRollTicks: z.number().int().positive(),
  retryOnFail: z.boolean(),
  levelAffectsSuccess: z.boolean(),
});
export type FiremakingMechanics = z.infer<typeof FiremakingMechanicsSchema>;

export const CookingMechanicsSchema = z.object({
  type: z.literal("fixed-tick-continuous"),
  ticksPerItem: z.number().int().positive(),
  levelAffectsBurn: z.boolean(),
  levelAffectsSpeed: z.boolean(),
});
export type CookingMechanics = z.infer<typeof CookingMechanicsSchema>;

export const ProcessingSkillMechanicsSchema = z.object({
  firemaking: FiremakingMechanicsSchema,
  cooking: CookingMechanicsSchema,
});
export type ProcessingSkillMechanics = z.infer<
  typeof ProcessingSkillMechanicsSchema
>;

export const FiremakingSuccessRateSchema = z.object({
  low: z.number().int().nonnegative().max(1024),
  high: z.number().int().nonnegative().max(1024),
});
export type FiremakingSuccessRate = z.infer<typeof FiremakingSuccessRateSchema>;

export const FirePropertiesSchema = z.object({
  minDurationTicks: z.number().int().positive(),
  maxDurationTicks: z.number().int().positive(),
  maxFiresPerPlayer: z.number().int().positive(),
  maxFiresPerArea: z.number().int().positive(),
  interactionRange: z.number().positive(),
});
export type FireProperties = z.infer<typeof FirePropertiesSchema>;

export const FireWalkDirectionSchema = z.enum([
  "west",
  "east",
  "south",
  "north",
]);
export type FireWalkDirection = z.infer<typeof FireWalkDirectionSchema>;

/**
 * Full processing manifest. One JSON file per game.
 */
export const ProcessingManifestSchema = z.object({
  $schema: z.literal("hyperforge.processing.v1"),
  skillMechanics: ProcessingSkillMechanicsSchema,
  firemakingSuccessRate: FiremakingSuccessRateSchema,
  fire: FirePropertiesSchema,
  fireWalkPriority: z.array(FireWalkDirectionSchema).length(4),
  timing: z.object({
    rateLimitMs: z.number().int().positive(),
    minimumCycleTicks: z.number().int().positive(),
  }),
});
export type ProcessingManifest = z.infer<typeof ProcessingManifestSchema>;
