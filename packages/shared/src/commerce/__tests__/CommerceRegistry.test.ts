import { CommerceManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it, vi } from "vitest";
import {
  CommerceNotLoadedError,
  CommerceRegistry,
} from "../CommerceRegistry.js";

function manifest() {
  return CommerceManifestSchema.parse({
    $schema: "hyperforge.commerce.v1",
    defaultBuybackRate: 0.5,
    bankStorageUnlimited: -1,
    storeUnlimitedStock: -1,
    interactionRange: 3,
    starterStoreItemIds: ["bronze_axe", "bread", "fishing_rod"],
  });
}

describe("CommerceRegistry", () => {
  it("throws pre-load", () => {
    expect(() => new CommerceRegistry().manifest).toThrow(
      CommerceNotLoadedError,
    );
  });

  it("exposes constants", () => {
    const r = new CommerceRegistry(manifest());
    expect(r.defaultBuybackRate).toBe(0.5);
    expect(r.bankStorageUnlimited).toBe(-1);
    expect(r.storeUnlimitedStock).toBe(-1);
    expect(r.interactionRange).toBe(3);
    expect(r.starterStoreItemIds).toEqual([
      "bronze_axe",
      "bread",
      "fishing_rod",
    ]);
  });

  it("buybackPrice floors the refund", () => {
    const r = new CommerceRegistry(manifest());
    expect(r.buybackPrice(100)).toBe(50);
    expect(r.buybackPrice(7)).toBe(3);
    expect(r.buybackPrice(0)).toBe(0);
    expect(r.buybackPrice(-5)).toBe(0);
  });

  it("recognises unlimited sentinels", () => {
    const r = new CommerceRegistry(manifest());
    expect(r.isUnlimitedBank(-1)).toBe(true);
    expect(r.isUnlimitedBank(500)).toBe(false);
    expect(r.isUnlimitedStock(-1)).toBe(true);
    expect(r.isUnlimitedStock(100)).toBe(false);
  });

  it("isInInteractionRange checks distance bounds", () => {
    const r = new CommerceRegistry(manifest());
    expect(r.isInInteractionRange(0)).toBe(true);
    expect(r.isInInteractionRange(3)).toBe(true);
    expect(r.isInInteractionRange(3.01)).toBe(false);
    expect(r.isInInteractionRange(-0.1)).toBe(false);
  });

  describe("onReloaded", () => {
    it("fires after every successful load()", () => {
      const r = new CommerceRegistry();
      const cb = vi.fn();
      r.onReloaded(cb);
      r.load(manifest());
      r.load(manifest());
      expect(cb).toHaveBeenCalledTimes(2);
    });

    it("returned unsubscribe stops further notifications", () => {
      const r = new CommerceRegistry();
      const cb = vi.fn();
      const off = r.onReloaded(cb);
      r.load(manifest());
      off();
      r.load(manifest());
      expect(cb).toHaveBeenCalledTimes(1);
    });

    it("a throwing listener does not break subsequent listeners", () => {
      const r = new CommerceRegistry();
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
});
