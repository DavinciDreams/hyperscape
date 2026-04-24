import { describe, expect, it } from "vitest";

import {
  CookingManifestSchema,
  CraftingManifestSchema,
  FiremakingManifestSchema,
  FletchingManifestSchema,
  RunecraftingManifestSchema,
  SmeltingManifestSchema,
  SmithingRecipesManifestSchema,
  TanningManifestSchema,
} from "./recipes.js";

describe("Recipe manifest schemas", () => {
  it("parses a realistic cooking manifest", () => {
    const manifest = {
      recipes: [
        {
          raw: "raw_shrimp",
          cooked: "shrimp",
          burnt: "burnt_shrimp",
          level: 1,
          xp: 30,
          ticks: 4,
          stopBurnLevel: { fire: 34, range: 34 },
        },
      ],
    };
    expect(CookingManifestSchema.safeParse(manifest).success).toBe(true);
  });

  it("parses a realistic firemaking manifest", () => {
    const manifest = {
      recipes: [
        { log: "logs", level: 1, xp: 40, ticks: 4 },
        { log: "oak_logs", level: 15, xp: 60, ticks: 4 },
      ],
    };
    expect(FiremakingManifestSchema.safeParse(manifest).success).toBe(true);
  });

  it("parses a realistic smelting manifest", () => {
    const manifest = {
      recipes: [
        {
          output: "bronze_bar",
          inputs: [
            { item: "copper_ore", amount: 1 },
            { item: "tin_ore", amount: 1 },
          ],
          level: 1,
          xp: 6.25,
          ticks: 4,
          successRate: 1,
        },
      ],
    };
    expect(SmeltingManifestSchema.safeParse(manifest).success).toBe(true);
  });

  it("rejects smelting recipe with successRate > 1", () => {
    const manifest = {
      recipes: [
        {
          output: "mithril_bar",
          inputs: [{ item: "mithril_ore", amount: 1 }],
          level: 50,
          xp: 30,
          ticks: 4,
          successRate: 1.5,
        },
      ],
    };
    expect(SmeltingManifestSchema.safeParse(manifest).success).toBe(false);
  });

  it("parses a realistic smithing manifest", () => {
    const manifest = {
      recipes: [
        {
          output: "bronze_sword",
          bar: "bronze_bar",
          barsRequired: 1,
          level: 4,
          xp: 12.5,
          ticks: 4,
          category: "weapons",
        },
      ],
    };
    expect(SmithingRecipesManifestSchema.safeParse(manifest).success).toBe(
      true,
    );
  });

  it("parses a realistic crafting manifest", () => {
    const manifest = {
      recipes: [
        {
          output: "leather_body",
          category: "leather",
          inputs: [{ item: "leather", amount: 3 }],
          tools: ["needle"],
          consumables: [{ item: "thread", uses: 5 }],
          level: 14,
          xp: 25,
          ticks: 4,
          station: "none",
        },
      ],
    };
    expect(CraftingManifestSchema.safeParse(manifest).success).toBe(true);
  });

  it("parses a realistic tanning manifest", () => {
    const manifest = {
      recipes: [
        { input: "cowhide", output: "leather", cost: 1, name: "Leather" },
      ],
    };
    expect(TanningManifestSchema.safeParse(manifest).success).toBe(true);
  });

  it("parses a realistic fletching manifest", () => {
    const manifest = {
      recipes: [
        {
          output: "arrow_shaft",
          outputQuantity: 15,
          category: "arrow_shafts",
          inputs: [{ item: "logs", amount: 1 }],
          tools: ["knife"],
          level: 1,
          xp: 5,
          ticks: 4,
          skill: "fletching",
        },
      ],
    };
    expect(FletchingManifestSchema.safeParse(manifest).success).toBe(true);
  });

  it("parses a realistic runecrafting manifest", () => {
    const manifest = {
      recipes: [
        {
          runeType: "air",
          runeItemId: "air_rune",
          levelRequired: 1,
          xpPerEssence: 5,
          essenceTypes: ["rune_essence", "pure_essence"],
          multiRuneLevels: [11, 22, 33, 44, 55, 66, 77, 88, 99],
        },
      ],
    };
    expect(RunecraftingManifestSchema.safeParse(manifest).success).toBe(true);
  });
});
