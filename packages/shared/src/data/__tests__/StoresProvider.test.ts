/**
 * Tests for the StoresProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { storesProvider } from "../StoresProvider";

beforeEach(() => {
  storesProvider.unload();
});
afterEach(() => {
  storesProvider.unload();
});

const validStore = {
  id: "lumbridgeGeneral",
  name: "Lumbridge General Store",
  buyback: true,
  buybackRate: 0.4,
  items: [
    {
      id: "bronze_dagger",
      itemId: "bronze_dagger",
      name: "Bronze Dagger",
      price: 10,
      stockQuantity: -1,
      restockTime: 0,
    },
  ],
};

describe("StoresProvider", () => {
  it("starts unloaded", () => {
    expect(storesProvider.isLoaded()).toBe(false);
    expect(storesProvider.getManifest()).toBeNull();
  });

  it("loadRaw() accepts empty array baseline", () => {
    const parsed = storesProvider.loadRaw([]);
    expect(parsed.length).toBe(0);
    expect(storesProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() accepts a valid store entry", () => {
    const parsed = storesProvider.loadRaw([validStore]);
    expect(parsed.length).toBe(1);
    expect(parsed[0]!.id).toBe("lumbridgeGeneral");
  });

  it("loadRaw() rejects negative price", () => {
    const bad = {
      ...validStore,
      items: [{ ...validStore.items[0], price: -1 }],
    };
    expect(() => storesProvider.loadRaw([bad])).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = storesProvider.loadRaw([validStore]);
    storesProvider.unload();
    storesProvider.load(parsed);
    expect(storesProvider.isLoaded()).toBe(true);
  });

  it("hotReload(null) clears the manifest", () => {
    storesProvider.loadRaw([validStore]);
    storesProvider.hotReload(null);
    expect(storesProvider.isLoaded()).toBe(false);
  });

  it("unload() clears a loaded manifest", () => {
    storesProvider.loadRaw([validStore]);
    storesProvider.unload();
    expect(storesProvider.isLoaded()).toBe(false);
  });

  it("singleton returns the same instance", () => {
    expect(storesProvider).toBe(storesProvider);
  });
});
