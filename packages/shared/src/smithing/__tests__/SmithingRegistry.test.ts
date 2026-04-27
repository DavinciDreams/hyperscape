import { SmithingManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it, vi } from "vitest";
import {
  SmithingNotLoadedError,
  SmithingRegistry,
} from "../SmithingRegistry.js";

function manifest() {
  return SmithingManifestSchema.parse({
    $schema: "hyperforge.smithing.v1",
    items: { hammerItemId: "hammer", coalItemId: "coal" },
    timing: { defaultSmeltingTicks: 4, defaultSmithingTicks: 5 },
    validation: { maxQuantity: 28, minQuantity: 1, maxItemIdLength: 64 },
    messages: {
      alreadySmelting: "x",
      noItems: "x",
      noOres: "x",
      invalidBar: "x",
      levelTooLowSmelt: "x",
      smeltingStart: "x",
      outOfMaterials: "x",
      smeltSuccess: "x",
      ironSmeltFail: "x",
      alreadySmithing: "x",
      noHammer: "x",
      noBars: "x",
      invalidRecipe: "x",
      levelTooLowSmith: "x",
      smithingStart: "x",
      outOfBars: "x",
      smithSuccess: "x",
    },
  });
}

describe("SmithingRegistry", () => {
  it("throws pre-load", () => {
    expect(() => new SmithingRegistry().manifest).toThrow(
      SmithingNotLoadedError,
    );
  });

  it("exposes item ids + timing", () => {
    const r = new SmithingRegistry(manifest());
    expect(r.hammerItemId).toBe("hammer");
    expect(r.coalItemId).toBe("coal");
    expect(r.defaultSmeltingTicks).toBe(4);
    expect(r.defaultSmithingTicks).toBe(5);
  });

  it("isQuantityInRange enforces min/max", () => {
    const r = new SmithingRegistry(manifest());
    expect(r.isQuantityInRange(1)).toBe(true);
    expect(r.isQuantityInRange(28)).toBe(true);
    expect(r.isQuantityInRange(29)).toBe(false);
    expect(r.isQuantityInRange(0)).toBe(false);
  });

  it("isItemIdLengthValid enforces non-empty + max length", () => {
    const r = new SmithingRegistry(manifest());
    expect(r.isItemIdLengthValid("")).toBe(false);
    expect(r.isItemIdLengthValid("bronze_bar")).toBe(true);
    expect(r.isItemIdLengthValid("x".repeat(64))).toBe(true);
    expect(r.isItemIdLengthValid("x".repeat(65))).toBe(false);
  });
});

describe("SmithingRegistry — onReloaded", () => {
  it("fires after every successful load()", () => {
    const r = new SmithingRegistry();
    const cb = vi.fn();
    r.onReloaded(cb);
    r.load(manifest());
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("returned unsubscribe stops further notifications", () => {
    const r = new SmithingRegistry();
    const cb = vi.fn();
    const off = r.onReloaded(cb);
    r.load(manifest());
    off();
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("a throwing listener does not break subsequent listeners", () => {
    const r = new SmithingRegistry();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const bad = vi.fn(() => {
      throw new Error("listener boom");
    });
    const good = vi.fn();
    r.onReloaded(bad);
    r.onReloaded(good);
    r.load(manifest());
    expect(bad).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
