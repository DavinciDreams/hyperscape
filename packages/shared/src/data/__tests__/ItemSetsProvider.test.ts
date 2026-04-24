/**
 * Tests for the ItemSetsProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { itemSetsProvider } from "../ItemSetsProvider";

beforeEach(() => {
  itemSetsProvider.unload();
});
afterEach(() => {
  itemSetsProvider.unload();
});

const validStage = {
  requiredPieces: 2,
  statModifiers: [{ stat: "strength" as const, op: "add" as const, value: 10 }],
};

const validSet = {
  id: "warriorsMight",
  name: "Warrior's Might",
  category: "raid" as const,
  memberItemIds: ["warriorHelm", "warriorChest", "warriorLegs"],
  stages: [validStage],
};

describe("ItemSetsProvider", () => {
  it("starts unloaded", () => {
    expect(itemSetsProvider.isLoaded()).toBe(false);
    expect(itemSetsProvider.getManifest()).toBeNull();
  });

  it("loadRaw() accepts empty array baseline", () => {
    const parsed = itemSetsProvider.loadRaw([]);
    expect(parsed).toEqual([]);
    expect(itemSetsProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() accepts valid item set", () => {
    const parsed = itemSetsProvider.loadRaw([validSet]);
    expect(parsed.length).toBe(1);
    expect(parsed[0].id).toBe("warriorsMight");
  });

  it("loadRaw() rejects duplicate set ids", () => {
    expect(() =>
      itemSetsProvider.loadRaw([validSet, { ...validSet, name: "Dup" }]),
    ).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = itemSetsProvider.loadRaw([validSet]);
    itemSetsProvider.unload();
    itemSetsProvider.load(parsed);
    expect(itemSetsProvider.isLoaded()).toBe(true);
  });

  it("hotReload() replaces the manifest", () => {
    itemSetsProvider.loadRaw([validSet]);
    const parsed = itemSetsProvider.loadRaw([]);
    itemSetsProvider.hotReload(parsed);
    expect(itemSetsProvider.getManifest()).toEqual([]);
  });

  it("hotReload(null) clears the manifest", () => {
    itemSetsProvider.loadRaw([validSet]);
    itemSetsProvider.hotReload(null);
    expect(itemSetsProvider.isLoaded()).toBe(false);
  });

  it("unload() clears a loaded manifest", () => {
    itemSetsProvider.loadRaw([validSet]);
    itemSetsProvider.unload();
    expect(itemSetsProvider.isLoaded()).toBe(false);
  });
});
