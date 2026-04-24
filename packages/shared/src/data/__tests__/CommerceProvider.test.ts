/**
 * Tests for the CommerceProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { commerceProvider } from "../CommerceProvider";

beforeEach(() => {
  commerceProvider.unload();
});
afterEach(() => {
  commerceProvider.unload();
});

const baseline = {
  $schema: "hyperforge.commerce.v1" as const,
  defaultBuybackRate: 0.5,
  bankStorageUnlimited: -1,
  storeUnlimitedStock: -1,
  interactionRange: 2,
  starterStoreItemIds: ["bronze_sword", "logs"],
};

describe("CommerceProvider", () => {
  it("starts unloaded", () => {
    expect(commerceProvider.isLoaded()).toBe(false);
    expect(commerceProvider.getManifest()).toBeNull();
  });

  it("loadRaw() rejects {} baseline — all fields required", () => {
    expect(() => commerceProvider.loadRaw({})).toThrow();
  });

  it("loadRaw() accepts a minimal valid manifest", () => {
    const parsed = commerceProvider.loadRaw(baseline);
    expect(parsed.$schema).toBe("hyperforge.commerce.v1");
    expect(parsed.defaultBuybackRate).toBe(0.5);
    expect(parsed.starterStoreItemIds).toHaveLength(2);
  });

  it("loadRaw() rejects empty starterStoreItemIds", () => {
    expect(() =>
      commerceProvider.loadRaw({ ...baseline, starterStoreItemIds: [] }),
    ).toThrow();
  });

  it("loadRaw() rejects buyback rate above 1", () => {
    expect(() =>
      commerceProvider.loadRaw({ ...baseline, defaultBuybackRate: 1.5 }),
    ).toThrow();
  });

  it("loadRaw() rejects non-positive interactionRange", () => {
    expect(() =>
      commerceProvider.loadRaw({ ...baseline, interactionRange: 0 }),
    ).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = commerceProvider.loadRaw(baseline);
    commerceProvider.unload();
    commerceProvider.load(parsed);
    expect(commerceProvider.isLoaded()).toBe(true);
  });

  it("hotReload(null) clears the manifest", () => {
    commerceProvider.loadRaw(baseline);
    commerceProvider.hotReload(null);
    expect(commerceProvider.isLoaded()).toBe(false);
  });

  it("singleton returns the same instance", () => {
    expect(commerceProvider).toBe(commerceProvider);
  });
});
