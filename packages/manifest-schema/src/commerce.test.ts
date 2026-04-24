import { describe, expect, it } from "vitest";

import { CommerceManifestSchema, type CommerceManifest } from "./commerce.js";

const hyperscapeCommerce: CommerceManifest = {
  $schema: "hyperforge.commerce.v1",
  defaultBuybackRate: 0.5,
  bankStorageUnlimited: -1,
  storeUnlimitedStock: -1,
  interactionRange: 3,
  starterStoreItemIds: ["bronze_hatchet", "fishing_rod", "tinderbox", "arrows"],
};

describe("CommerceManifestSchema", () => {
  it("parses the Hyperscape reference manifest cleanly", () => {
    const result = CommerceManifestSchema.safeParse(hyperscapeCommerce);
    if (!result.success) {
      throw new Error(
        `Hyperscape commerce manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("rejects buyback rate above 1", () => {
    const bad = { ...hyperscapeCommerce, defaultBuybackRate: 1.5 };
    expect(CommerceManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects zero interaction range", () => {
    const bad = { ...hyperscapeCommerce, interactionRange: 0 };
    expect(CommerceManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects empty starter store item list", () => {
    const bad = { ...hyperscapeCommerce, starterStoreItemIds: [] };
    expect(CommerceManifestSchema.safeParse(bad).success).toBe(false);
  });
});
