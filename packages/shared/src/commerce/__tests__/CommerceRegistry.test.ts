import { CommerceManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
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
});
