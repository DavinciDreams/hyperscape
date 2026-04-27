import {
  CookingManifestSchema,
  SmeltingManifestSchema,
  SmithingRecipesManifestSchema,
} from "@hyperforge/manifest-schema";
import { describe, expect, it, vi } from "vitest";
import { RecipesNotLoadedError, RecipesRegistry } from "../RecipesRegistry.js";

function cooking() {
  return CookingManifestSchema.parse({
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
      {
        raw: "raw_lobster",
        cooked: "lobster",
        burnt: "burnt_lobster",
        level: 40,
        xp: 120,
        ticks: 4,
        stopBurnLevel: { fire: 74, range: 74 },
      },
    ],
  });
}

function smelting() {
  return SmeltingManifestSchema.parse({
    recipes: [
      {
        output: "bronze_bar",
        inputs: [
          { item: "copper_ore", amount: 1 },
          { item: "tin_ore", amount: 1 },
        ],
        level: 1,
        xp: 6.2,
        ticks: 3,
        successRate: 1,
      },
      {
        output: "iron_bar",
        inputs: [{ item: "iron_ore", amount: 1 }],
        level: 15,
        xp: 12.5,
        ticks: 3,
        successRate: 0.5,
      },
    ],
  });
}

function smithing() {
  return SmithingRecipesManifestSchema.parse({
    recipes: [
      {
        output: "bronze_dagger",
        bar: "bronze_bar",
        barsRequired: 1,
        level: 1,
        xp: 12.5,
        ticks: 5,
        category: "dagger",
      },
      {
        output: "iron_scimitar",
        bar: "iron_bar",
        barsRequired: 2,
        level: 20,
        xp: 50,
        ticks: 5,
        category: "scimitar",
      },
    ],
  });
}

describe("RecipesRegistry", () => {
  it("throws on pre-load access", () => {
    const r = new RecipesRegistry();
    expect(() => r.cooking).toThrow(RecipesNotLoadedError);
  });

  it("cooking lookups + level filter", () => {
    const r = new RecipesRegistry();
    r.loadCooking(cooking());
    expect(r.cookingFor("raw_shrimp")?.xp).toBe(30);
    expect(r.cookingAtLevel(1).map((c) => c.raw)).toEqual(["raw_shrimp"]);
    expect(r.cookingAtLevel(40).map((c) => c.raw)).toEqual([
      "raw_shrimp",
      "raw_lobster",
    ]);
  });

  it("smelting lookups + level filter", () => {
    const r = new RecipesRegistry();
    r.loadSmelting(smelting());
    expect(r.smeltingFor("iron_bar")?.successRate).toBe(0.5);
    expect(r.smeltingAtLevel(14).map((s) => s.output)).toEqual(["bronze_bar"]);
  });

  it("smithing lookups + level filter", () => {
    const r = new RecipesRegistry();
    r.loadSmithing(smithing());
    expect(r.smithingFor("iron_scimitar")?.barsRequired).toBe(2);
    expect(r.smithingAtLevel(5).map((s) => s.output)).toEqual([
      "bronze_dagger",
    ]);
  });
});

describe("RecipesRegistry — onReloaded", () => {
  it("fires after each successful loadCooking / loadSmelting / loadSmithing", () => {
    const r = new RecipesRegistry();
    const cb = vi.fn();
    r.onReloaded(cb);
    r.loadCooking(cooking());
    r.loadSmelting(smelting());
    r.loadSmithing(smithing());
    expect(cb).toHaveBeenCalledTimes(3);
  });

  it("returned unsubscribe stops further notifications", () => {
    const r = new RecipesRegistry();
    const cb = vi.fn();
    const off = r.onReloaded(cb);
    r.loadCooking(cooking());
    off();
    r.loadSmelting(smelting());
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("a throwing listener does not break subsequent listeners", () => {
    const r = new RecipesRegistry();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const bad = vi.fn(() => {
      throw new Error("listener boom");
    });
    const good = vi.fn();
    r.onReloaded(bad);
    r.onReloaded(good);
    r.loadCooking(cooking());
    expect(bad).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
