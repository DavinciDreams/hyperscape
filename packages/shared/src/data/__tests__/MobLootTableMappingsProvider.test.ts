/**
 * Tests for the MobLootTableMappingsProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { mobLootTableMappingsProvider } from "../MobLootTableMappingsProvider";

beforeEach(() => {
  mobLootTableMappingsProvider.unload();
});
afterEach(() => {
  mobLootTableMappingsProvider.unload();
});

const validMappings = {
  goblin: "goblin-drops",
  giant_rat: "rat-drops",
};

describe("MobLootTableMappingsProvider", () => {
  it("starts unloaded with an empty mapping", () => {
    expect(mobLootTableMappingsProvider.isLoaded()).toBe(false);
    expect(mobLootTableMappingsProvider.getMappings()).toEqual({});
    expect(mobLootTableMappingsProvider.getManifest()).toBeNull();
  });

  it("load() installs an already-validated mapping", () => {
    mobLootTableMappingsProvider.load(validMappings);
    expect(mobLootTableMappingsProvider.isLoaded()).toBe(true);
    expect(mobLootTableMappingsProvider.getMappings()).toEqual(validMappings);
  });

  it("loadRaw() rejects invalid payloads", () => {
    expect(() =>
      mobLootTableMappingsProvider.loadRaw({ goblin: "" }),
    ).toThrow();
    expect(mobLootTableMappingsProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() accepts valid payload and returns parsed record", () => {
    const parsed = mobLootTableMappingsProvider.loadRaw(validMappings);
    expect(parsed).toEqual(validMappings);
    expect(mobLootTableMappingsProvider.isLoaded()).toBe(true);
  });

  it("hotReload(mapping) replaces the current mapping", () => {
    mobLootTableMappingsProvider.load(validMappings);
    const replacement = { dark_knight: "boss-t3" };
    mobLootTableMappingsProvider.hotReload(replacement);
    expect(mobLootTableMappingsProvider.getMappings()).toEqual(replacement);
  });

  it("hotReload(null) clears", () => {
    mobLootTableMappingsProvider.load(validMappings);
    mobLootTableMappingsProvider.hotReload(null);
    expect(mobLootTableMappingsProvider.isLoaded()).toBe(false);
    expect(mobLootTableMappingsProvider.getMappings()).toEqual({});
  });

  it("unload() resets to default empty state", () => {
    mobLootTableMappingsProvider.load(validMappings);
    mobLootTableMappingsProvider.unload();
    expect(mobLootTableMappingsProvider.isLoaded()).toBe(false);
    expect(mobLootTableMappingsProvider.getManifest()).toBeNull();
  });

  it("getMappings() returns {} (not null) when unloaded — safe to iterate", () => {
    const mappings = mobLootTableMappingsProvider.getMappings();
    expect(typeof mappings).toBe("object");
    expect(Object.keys(mappings).length).toBe(0);
  });
});
