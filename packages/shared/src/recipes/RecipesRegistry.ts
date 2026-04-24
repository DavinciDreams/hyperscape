/**
 * Recipes registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `recipes.ts`.
 * Indexes per-skill recipe lists (cooking, firemaking, smelting,
 * smithing, crafting, tanning, fletching, runecrafting) behind typed
 * lookups for level filtering and output resolution.
 */

import {
  type CookingManifest,
  type CookingRecipe,
  type CraftingManifest,
  type CraftingRecipe,
  type FiremakingManifest,
  type FiremakingRecipe,
  type FletchingManifest,
  type FletchingRecipe,
  type RunecraftingManifest,
  type RunecraftingRecipe,
  type SmeltingManifest,
  type SmeltingRecipe,
  type SmithingRecipe,
  type SmithingRecipesManifest,
  type TanningManifest,
  type TanningRecipe,
} from "@hyperforge/manifest-schema";

export class RecipesNotLoadedError extends Error {
  constructor(skill: string) {
    super(`RecipesRegistry ${skill} manifest used before load()`);
    this.name = "RecipesNotLoadedError";
  }
}

export class RecipesRegistry {
  private _cooking: CookingManifest | null = null;
  private _firemaking: FiremakingManifest | null = null;
  private _smelting: SmeltingManifest | null = null;
  private _smithing: SmithingRecipesManifest | null = null;
  private _crafting: CraftingManifest | null = null;
  private _tanning: TanningManifest | null = null;
  private _fletching: FletchingManifest | null = null;
  private _runecrafting: RunecraftingManifest | null = null;

  loadCooking(m: CookingManifest): void {
    this._cooking = m;
  }
  loadFiremaking(m: FiremakingManifest): void {
    this._firemaking = m;
  }
  loadSmelting(m: SmeltingManifest): void {
    this._smelting = m;
  }
  loadSmithing(m: SmithingRecipesManifest): void {
    this._smithing = m;
  }
  loadCrafting(m: CraftingManifest): void {
    this._crafting = m;
  }
  loadTanning(m: TanningManifest): void {
    this._tanning = m;
  }
  loadFletching(m: FletchingManifest): void {
    this._fletching = m;
  }
  loadRunecrafting(m: RunecraftingManifest): void {
    this._runecrafting = m;
  }

  get cooking(): readonly CookingRecipe[] {
    if (!this._cooking) throw new RecipesNotLoadedError("cooking");
    return this._cooking.recipes;
  }

  get firemaking(): readonly FiremakingRecipe[] {
    if (!this._firemaking) throw new RecipesNotLoadedError("firemaking");
    return this._firemaking.recipes;
  }

  get smelting(): readonly SmeltingRecipe[] {
    if (!this._smelting) throw new RecipesNotLoadedError("smelting");
    return this._smelting.recipes;
  }

  get smithing(): readonly SmithingRecipe[] {
    if (!this._smithing) throw new RecipesNotLoadedError("smithing");
    return this._smithing.recipes;
  }

  get crafting(): readonly CraftingRecipe[] {
    if (!this._crafting) throw new RecipesNotLoadedError("crafting");
    return this._crafting.recipes;
  }

  get tanning(): readonly TanningRecipe[] {
    if (!this._tanning) throw new RecipesNotLoadedError("tanning");
    return this._tanning.recipes;
  }

  get fletching(): readonly FletchingRecipe[] {
    if (!this._fletching) throw new RecipesNotLoadedError("fletching");
    return this._fletching.recipes;
  }

  get runecrafting(): readonly RunecraftingRecipe[] {
    if (!this._runecrafting) throw new RecipesNotLoadedError("runecrafting");
    return this._runecrafting.recipes;
  }

  cookingFor(rawItem: string): CookingRecipe | undefined {
    return this.cooking.find((r) => r.raw === rawItem);
  }

  firemakingFor(log: string): FiremakingRecipe | undefined {
    return this.firemaking.find((r) => r.log === log);
  }

  smeltingFor(output: string): SmeltingRecipe | undefined {
    return this.smelting.find((r) => r.output === output);
  }

  smithingFor(output: string): SmithingRecipe | undefined {
    return this.smithing.find((r) => r.output === output);
  }

  /** Cooking recipes the player can attempt at their cooking level. */
  cookingAtLevel(level: number): CookingRecipe[] {
    return this.cooking.filter((r) => r.level <= level);
  }

  /** Smelting recipes the player can attempt at their smithing level. */
  smeltingAtLevel(level: number): SmeltingRecipe[] {
    return this.smelting.filter((r) => r.level <= level);
  }

  /** Smithing recipes the player can attempt at their smithing level. */
  smithingAtLevel(level: number): SmithingRecipe[] {
    return this.smithing.filter((r) => r.level <= level);
  }
}
