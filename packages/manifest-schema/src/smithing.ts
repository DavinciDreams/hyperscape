/**
 * Smithing manifest schema.
 *
 * Source of truth for the smithing constants previously hardcoded in
 * `packages/shared/src/constants/SmithingConstants.ts`. Extracted as part of
 * Phase A5 of `PLAN_WORLD_STUDIO_AAA_COMPLETION.md`.
 *
 * Item/recipe-specific smithing data (bar tiers, anvil recipes, level
 * requirements per bar) continues to live in `items.json` /
 * `smithing-recipes.json` and is not duplicated here. This manifest covers
 * only mechanic constants (item IDs, timings, validation limits, messages).
 */

import { z } from "zod";

export const SmithingMessagesSchema = z.object({
  // Smelting messages
  alreadySmelting: z.string().min(1),
  noItems: z.string().min(1),
  noOres: z.string().min(1),
  invalidBar: z.string().min(1),
  levelTooLowSmelt: z.string().min(1),
  smeltingStart: z.string().min(1),
  outOfMaterials: z.string().min(1),
  smeltSuccess: z.string().min(1),
  ironSmeltFail: z.string().min(1),

  // Smithing messages
  alreadySmithing: z.string().min(1),
  noHammer: z.string().min(1),
  noBars: z.string().min(1),
  invalidRecipe: z.string().min(1),
  levelTooLowSmith: z.string().min(1),
  smithingStart: z.string().min(1),
  outOfBars: z.string().min(1),
  smithSuccess: z.string().min(1),
});
export type SmithingMessages = z.infer<typeof SmithingMessagesSchema>;

export const SmithingManifestSchema = z.object({
  $schema: z.literal("hyperforge.smithing.v1"),

  items: z.object({
    hammerItemId: z.string().min(1),
    coalItemId: z.string().min(1),
  }),

  timing: z.object({
    defaultSmeltingTicks: z.number().int().positive(),
    defaultSmithingTicks: z.number().int().positive(),
  }),

  validation: z.object({
    maxQuantity: z.number().int().positive(),
    minQuantity: z.number().int().positive(),
    maxItemIdLength: z.number().int().positive(),
  }),

  messages: SmithingMessagesSchema,
});
export type SmithingManifest = z.infer<typeof SmithingManifestSchema>;
