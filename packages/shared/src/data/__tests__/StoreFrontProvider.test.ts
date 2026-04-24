/**
 * Tests for the StoreFrontProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { storeFrontProvider } from "../StoreFrontProvider";

beforeEach(() => {
  storeFrontProvider.unload();
});
afterEach(() => {
  storeFrontProvider.unload();
});

describe("StoreFrontProvider", () => {
  it("starts unloaded", () => {
    expect(storeFrontProvider.isLoaded()).toBe(false);
    expect(storeFrontProvider.getManifest()).toBeNull();
  });

  it("loadRaw() accepts {} baseline — all fields default", () => {
    const parsed = storeFrontProvider.loadRaw({});
    expect(parsed.enabled).toBe(true);
    expect(parsed.priceTiers).toEqual([]);
    expect(parsed.bundles).toEqual([]);
    expect(parsed.shelves).toEqual([]);
    expect(parsed.discountRules).toEqual([]);
    expect(parsed.requiresLicenseAgreement).toBe(true);
  });

  it("loadRaw() rejects unknown top-level keys (.strict)", () => {
    expect(() => storeFrontProvider.loadRaw({ unknownField: true })).toThrow();
  });

  it("loadRaw() rejects shelf referencing undefined bundle id", () => {
    expect(() =>
      storeFrontProvider.loadRaw({
        shelves: [
          {
            id: "topShelf",
            titleLocalizationKey: "store.topShelf",
            bundleIds: ["ghost"],
          },
        ],
      }),
    ).toThrow();
  });

  it("loadRaw() accepts enabled=false with empty catalogs", () => {
    const parsed = storeFrontProvider.loadRaw({ enabled: false });
    expect(parsed.enabled).toBe(false);
  });

  it("loadRaw() rejects globalDailySpendCapCents below 0", () => {
    expect(() =>
      storeFrontProvider.loadRaw({ globalDailySpendCapCents: -1 }),
    ).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = storeFrontProvider.loadRaw({});
    storeFrontProvider.unload();
    storeFrontProvider.load(parsed);
    expect(storeFrontProvider.isLoaded()).toBe(true);
  });

  it("hotReload(null) clears the manifest", () => {
    storeFrontProvider.loadRaw({});
    storeFrontProvider.hotReload(null);
    expect(storeFrontProvider.isLoaded()).toBe(false);
  });

  it("singleton returns the same instance", () => {
    expect(storeFrontProvider).toBe(storeFrontProvider);
  });
});
