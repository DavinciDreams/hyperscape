/**
 * Recipe manifest schemas.
 *
 * Source of truth for all per-skill recipe manifests consumed by
 * `ProcessingDataProvider`:
 *
 *   - recipes/cooking.json       → CookingManifestSchema
 *   - recipes/firemaking.json    → FiremakingManifestSchema
 *   - recipes/smelting.json      → SmeltingManifestSchema
 *   - recipes/smithing.json      → SmithingManifestSchema
 *   - recipes/crafting.json      → CraftingManifestSchema
 *   - recipes/tanning.json       → TanningManifestSchema
 *   - recipes/fletching.json     → FletchingManifestSchema
 *   - recipes/runecrafting.json  → RunecraftingManifestSchema
 *
 * Previously each `ProcessingDataProvider.load*` method accepted an
 * untyped manifest and relied on downstream runtime fallbacks when
 * fields were missing. These schemas enable fail-fast validation at
 * manifest load time.
 *
 * Extracted as part of Phase A11 of
 * `PLAN_WORLD_STUDIO_AAA_COMPLETION.md`.
 */

import { z } from "zod";

const ItemAmountSchema = z.object({
  item: z.string().min(1),
  amount: z.number().int().positive(),
});

const ConsumableSchema = z.object({
  item: z.string().min(1),
  uses: z.number().int().positive(),
});

/* -------------------------------------------------------------------------- */
/*                                  Cooking                                   */
/* -------------------------------------------------------------------------- */

export const CookingRecipeManifestSchema = z.object({
  raw: z.string().min(1),
  cooked: z.string().min(1),
  burnt: z.string().min(1),
  level: z.number().int().min(1).max(99),
  xp: z.number().min(0),
  ticks: z.number().int().positive(),
  stopBurnLevel: z.object({
    fire: z.number().int().min(1).max(99),
    range: z.number().int().min(1).max(99),
  }),
});
export type CookingRecipe = z.infer<typeof CookingRecipeManifestSchema>;

export const CookingManifestSchema = z.object({
  recipes: z.array(CookingRecipeManifestSchema),
});
export type CookingManifest = z.infer<typeof CookingManifestSchema>;

/* -------------------------------------------------------------------------- */
/*                                 Firemaking                                 */
/* -------------------------------------------------------------------------- */

export const FiremakingRecipeManifestSchema = z.object({
  log: z.string().min(1),
  level: z.number().int().min(1).max(99),
  xp: z.number().min(0),
  ticks: z.number().int().positive(),
});
export type FiremakingRecipe = z.infer<typeof FiremakingRecipeManifestSchema>;

export const FiremakingManifestSchema = z.object({
  recipes: z.array(FiremakingRecipeManifestSchema),
});
export type FiremakingManifest = z.infer<typeof FiremakingManifestSchema>;

/* -------------------------------------------------------------------------- */
/*                                  Smelting                                  */
/* -------------------------------------------------------------------------- */

export const SmeltingRecipeManifestSchema = z.object({
  output: z.string().min(1),
  inputs: z.array(ItemAmountSchema).min(1),
  level: z.number().int().min(1).max(99),
  xp: z.number().min(0),
  ticks: z.number().int().positive(),
  successRate: z.number().min(0).max(1),
});
export type SmeltingRecipe = z.infer<typeof SmeltingRecipeManifestSchema>;

export const SmeltingManifestSchema = z.object({
  recipes: z.array(SmeltingRecipeManifestSchema),
});
export type SmeltingManifest = z.infer<typeof SmeltingManifestSchema>;

/* -------------------------------------------------------------------------- */
/*                                  Smithing                                  */
/* -------------------------------------------------------------------------- */

export const SmithingRecipeManifestSchema = z.object({
  output: z.string().min(1),
  bar: z.string().min(1),
  barsRequired: z.number().int().positive(),
  level: z.number().int().min(1).max(99),
  xp: z.number().min(0),
  ticks: z.number().int().positive(),
  category: z.string().min(1),
  outputQuantity: z.number().int().positive().optional(),
});
export type SmithingRecipe = z.infer<typeof SmithingRecipeManifestSchema>;

export const SmithingRecipesManifestSchema = z.object({
  recipes: z.array(SmithingRecipeManifestSchema),
});
export type SmithingRecipesManifest = z.infer<
  typeof SmithingRecipesManifestSchema
>;

/* -------------------------------------------------------------------------- */
/*                                  Crafting                                  */
/* -------------------------------------------------------------------------- */

export const CraftingRecipeManifestSchema = z.object({
  output: z.string().min(1),
  category: z.string().min(1),
  inputs: z.array(ItemAmountSchema),
  tools: z.array(z.string().min(1)),
  consumables: z.array(ConsumableSchema),
  level: z.number().int().min(1).max(99),
  xp: z.number().min(0),
  ticks: z.number().int().positive(),
  station: z.string().min(1),
});
export type CraftingRecipe = z.infer<typeof CraftingRecipeManifestSchema>;

export const CraftingManifestSchema = z.object({
  recipes: z.array(CraftingRecipeManifestSchema),
});
export type CraftingManifest = z.infer<typeof CraftingManifestSchema>;

/* -------------------------------------------------------------------------- */
/*                                  Tanning                                   */
/* -------------------------------------------------------------------------- */

export const TanningRecipeManifestSchema = z.object({
  input: z.string().min(1),
  output: z.string().min(1),
  cost: z.number().int().min(0),
  name: z.string().min(1),
});
export type TanningRecipe = z.infer<typeof TanningRecipeManifestSchema>;

export const TanningManifestSchema = z.object({
  recipes: z.array(TanningRecipeManifestSchema),
});
export type TanningManifest = z.infer<typeof TanningManifestSchema>;

/* -------------------------------------------------------------------------- */
/*                                 Fletching                                  */
/* -------------------------------------------------------------------------- */

export const FletchingRecipeManifestSchema = z.object({
  output: z.string().min(1),
  outputQuantity: z.number().int().positive(),
  category: z.string().min(1),
  inputs: z.array(ItemAmountSchema).min(1),
  tools: z.array(z.string().min(1)),
  level: z.number().int().min(1).max(99),
  xp: z.number().min(0),
  ticks: z.number().int().positive(),
  skill: z.string().min(1),
});
export type FletchingRecipe = z.infer<typeof FletchingRecipeManifestSchema>;

export const FletchingManifestSchema = z.object({
  recipes: z.array(FletchingRecipeManifestSchema),
});
export type FletchingManifest = z.infer<typeof FletchingManifestSchema>;

/* -------------------------------------------------------------------------- */
/*                                Runecrafting                                */
/* -------------------------------------------------------------------------- */

export const RunecraftingRecipeManifestSchema = z.object({
  runeType: z.string().min(1),
  runeItemId: z.string().min(1),
  levelRequired: z.number().int().min(1).max(99),
  xpPerEssence: z.number().min(0),
  essenceTypes: z.array(z.string().min(1)).min(1),
  multiRuneLevels: z.array(z.number().int().min(1).max(99)),
});
export type RunecraftingRecipe = z.infer<
  typeof RunecraftingRecipeManifestSchema
>;

export const RunecraftingManifestSchema = z.object({
  recipes: z.array(RunecraftingRecipeManifestSchema),
});
export type RunecraftingManifest = z.infer<typeof RunecraftingManifestSchema>;
