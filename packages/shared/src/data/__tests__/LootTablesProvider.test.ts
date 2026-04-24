/**
 * Tests for the LootTablesProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { lootTablesProvider } from "../LootTablesProvider";

// Reset singleton state before AND after every test so cross-file leak
// can't pollute the "starts unloaded" assertions.
beforeEach(() => {
  lootTablesProvider.unload();
});
afterEach(() => {
  lootTablesProvider.unload();
});

const validManifest = [
  {
    id: "goblin-drops",
    name: "Goblin Drops",
    description: "Common goblin loot",
    rolls: { min: 1, max: 1 },
    entries: [
      { kind: "item" as const, itemId: "coins", weight: 10 },
      { kind: "nothing" as const, weight: 5 },
    ],
  },
];

describe("LootTablesProvider", () => {
  it("starts unloaded with an empty tables list", () => {
    expect(lootTablesProvider.isLoaded()).toBe(false);
    expect(lootTablesProvider.getTables()).toEqual([]);
    expect(lootTablesProvider.getManifest()).toBeNull();
  });

  it("load() installs a validated manifest", () => {
    lootTablesProvider.load(validManifest);
    expect(lootTablesProvider.isLoaded()).toBe(true);
    expect(lootTablesProvider.getTables().length).toBe(1);
  });

  it("loadRaw() validates raw JSON and rejects invalid manifests", () => {
    // Duplicate ids trip the schema-level refinement.
    expect(() =>
      lootTablesProvider.loadRaw([validManifest[0], { ...validManifest[0] }]),
    ).toThrow();
    expect(lootTablesProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() accepts and installs a valid raw payload", () => {
    const parsed = lootTablesProvider.loadRaw(validManifest);
    expect(parsed.length).toBe(1);
    expect(parsed[0]?.id).toBe("goblin-drops");
    expect(lootTablesProvider.isLoaded()).toBe(true);
  });

  it("hotReload(manifest) replaces the current manifest", () => {
    lootTablesProvider.load(validManifest);
    const second = [{ ...validManifest[0], id: "boss-drops" }];
    lootTablesProvider.hotReload(second);
    expect(lootTablesProvider.getTables()[0]?.id).toBe("boss-drops");
  });

  it("hotReload(null) clears the authored list", () => {
    lootTablesProvider.load(validManifest);
    lootTablesProvider.hotReload(null);
    expect(lootTablesProvider.isLoaded()).toBe(false);
    expect(lootTablesProvider.getTables()).toEqual([]);
  });

  it("unload() resets to the default empty state", () => {
    lootTablesProvider.load(validManifest);
    lootTablesProvider.unload();
    expect(lootTablesProvider.isLoaded()).toBe(false);
    expect(lootTablesProvider.getTables()).toEqual([]);
    expect(lootTablesProvider.getManifest()).toBeNull();
  });

  it("getTables() returns an empty array (not null) when unloaded — safe to iterate", () => {
    const tables = lootTablesProvider.getTables();
    expect(Array.isArray(tables)).toBe(true);
    expect(tables.length).toBe(0);
  });
});
