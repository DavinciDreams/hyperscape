import { describe, it, expect } from "vitest";
import {
  serializeWorld,
  deserializeWorld,
  exportWorldToJSON,
  importWorldFromJSON,
  validateWorldData,
  migrateWorldData,
  generateWorldId,
  generateWorldName,
} from "@/components/WorldBuilder/utils/worldPersistence";

// ── Fixture factory ──────────────────────────────────────

function makeWorld() {
  return {
    id: "world-test-123",
    name: "Test World",
    description: "A test world",
    version: 1,
    createdAt: 1000000,
    modifiedAt: 2000000,
    foundationLocked: false,
    foundation: {
      version: 1,
      createdAt: 1000000,
      config: { terrain: { worldSize: 10, tileSize: 64 } },
      biomes: [{ id: "b1", type: "forest" }],
      towns: [{ id: "t1", name: "Townsville" }],
      buildings: [{ id: "bld1", townId: "t1" }],
      roads: [{ id: "r1", from: "t1", to: "t2" }],
      heightmapCache: new Map(),
    },
    layers: {
      biomeOverrides: new Map([["b1", { density: 0.8 }]]),
      townOverrides: new Map([["t1", { name: "Renamed" }]]),
      npcs: [{ id: "npc1", name: "Guard" }],
      quests: [{ id: "q1", name: "Main Quest" }],
      bosses: [{ id: "boss1", name: "Dragon" }],
      events: [{ id: "e1", type: "spawn" }],
      lore: [{ id: "l1", text: "Once upon..." }],
      difficultyZones: [{ id: "dz1", level: 5 }],
      customPlacements: [{ id: "cp1", type: "rock" }],
    },
  };
}

function makeSerialized() {
  return {
    id: "world-test-123",
    name: "Test World",
    description: "A test world",
    version: 1,
    createdAt: 1000000,
    modifiedAt: 2000000,
    foundationLocked: false,
    foundation: {
      version: 1,
      createdAt: 1000000,
      config: { terrain: { worldSize: 10, tileSize: 64 } },
      biomes: [{ id: "b1", type: "forest" }],
      towns: [{ id: "t1", name: "Townsville" }],
      buildings: [{ id: "bld1", townId: "t1" }],
      roads: [{ id: "r1", from: "t1", to: "t2" }],
    },
    layers: {
      biomeOverrides: { b1: { density: 0.8 } },
      townOverrides: { t1: { name: "Renamed" } },
      npcs: [{ id: "npc1", name: "Guard" }],
      quests: [{ id: "q1", name: "Main Quest" }],
      bosses: [{ id: "boss1", name: "Dragon" }],
      events: [{ id: "e1", type: "spawn" }],
      lore: [{ id: "l1", text: "Once upon..." }],
      difficultyZones: [{ id: "dz1", level: 5 }],
      customPlacements: [{ id: "cp1", type: "rock" }],
    },
  };
}

// ── serializeWorld ───────────────────────────────────────

describe("serializeWorld", () => {
  it("converts Maps to plain objects", () => {
    const world = makeWorld();
    const result = serializeWorld(world as never);
    expect(result.layers.biomeOverrides).toEqual({ b1: { density: 0.8 } });
    expect(result.layers.townOverrides).toEqual({ t1: { name: "Renamed" } });
  });

  it("drops heightmapCache (non-serializable)", () => {
    const world = makeWorld();
    const result = serializeWorld(world as never);
    expect(
      (result.foundation as Record<string, unknown>).heightmapCache,
    ).toBeUndefined();
  });

  it("preserves all scalar fields", () => {
    const world = makeWorld();
    const result = serializeWorld(world as never);
    expect(result.id).toBe("world-test-123");
    expect(result.name).toBe("Test World");
    expect(result.version).toBe(1);
    expect(result.createdAt).toBe(1000000);
    expect(result.modifiedAt).toBe(2000000);
    expect(result.foundationLocked).toBe(false);
  });

  it("preserves arrays", () => {
    const world = makeWorld();
    const result = serializeWorld(world as never);
    expect(result.layers.npcs).toHaveLength(1);
    expect(result.layers.bosses).toHaveLength(1);
    expect(result.foundation.towns).toHaveLength(1);
  });
});

// ── deserializeWorld ─────────────────────────────────────

describe("deserializeWorld", () => {
  it("converts plain objects back to Maps", () => {
    const data = makeSerialized();
    const result = deserializeWorld(data as never);
    expect(result.layers.biomeOverrides).toBeInstanceOf(Map);
    expect(result.layers.townOverrides).toBeInstanceOf(Map);
    expect(result.layers.biomeOverrides.get("b1")).toEqual({ density: 0.8 });
  });

  it("creates empty heightmapCache", () => {
    const data = makeSerialized();
    const result = deserializeWorld(data as never);
    expect(result.foundation.heightmapCache).toBeInstanceOf(Map);
    expect(result.foundation.heightmapCache.size).toBe(0);
  });

  it("defaults missing arrays to empty", () => {
    const data = makeSerialized();
    (data.layers as Record<string, unknown>).npcs = undefined;
    (data.layers as Record<string, unknown>).quests = undefined;
    const result = deserializeWorld(data as never);
    expect(result.layers.npcs).toEqual([]);
    expect(result.layers.quests).toEqual([]);
  });

  it("defaults missing overrides to empty Maps", () => {
    const data = makeSerialized();
    (data.layers as Record<string, unknown>).biomeOverrides = undefined;
    const result = deserializeWorld(data as never);
    expect(result.layers.biomeOverrides).toBeInstanceOf(Map);
    expect(result.layers.biomeOverrides.size).toBe(0);
  });
});

// ── Round-trip ───────────────────────────────────────────

describe("serialize/deserialize round-trip", () => {
  it("preserves data through serialize → deserialize", () => {
    const world = makeWorld();
    const serialized = serializeWorld(world as never);
    const restored = deserializeWorld(serialized as never);

    expect(restored.id).toBe(world.id);
    expect(restored.name).toBe(world.name);
    expect(restored.layers.npcs).toEqual(world.layers.npcs);
    expect(restored.layers.biomeOverrides.get("b1")).toEqual(
      world.layers.biomeOverrides.get("b1"),
    );
  });

  it("preserves data through JSON export → import", () => {
    const world = makeWorld();
    const json = exportWorldToJSON(world as never);
    const restored = importWorldFromJSON(json);

    expect(restored.id).toBe(world.id);
    expect(restored.name).toBe(world.name);
  });
});

// ── exportWorldToJSON ────────────────────────────────────

describe("exportWorldToJSON", () => {
  it("produces valid JSON string", () => {
    const world = makeWorld();
    const json = exportWorldToJSON(world as never);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it("pretty prints by default", () => {
    const world = makeWorld();
    const json = exportWorldToJSON(world as never);
    expect(json).toContain("\n");
  });

  it("compact mode produces single-line JSON", () => {
    const world = makeWorld();
    const json = exportWorldToJSON(world as never, false);
    expect(json).not.toContain("\n");
  });
});

// ── importWorldFromJSON ──────────────────────────────────

describe("importWorldFromJSON", () => {
  it("throws on invalid JSON", () => {
    expect(() => importWorldFromJSON("not json")).toThrow();
  });

  it("throws on non-object JSON", () => {
    expect(() => importWorldFromJSON('"just a string"')).toThrow(
      "expected object",
    );
  });

  it("throws on missing id", () => {
    expect(() => importWorldFromJSON('{"name": "test"}')).toThrow("missing id");
  });

  it("throws on missing name", () => {
    expect(() => importWorldFromJSON('{"id": "test"}')).toThrow(
      "missing id or name",
    );
  });
});

// ── validateWorldData ────────────────────────────────────

describe("validateWorldData", () => {
  it("returns true for valid data", () => {
    expect(validateWorldData(makeSerialized())).toBe(true);
  });

  it("returns false for null", () => {
    expect(validateWorldData(null)).toBe(false);
  });

  it("returns false for non-object", () => {
    expect(validateWorldData("string")).toBe(false);
    expect(validateWorldData(42)).toBe(false);
  });

  it("returns false for missing id", () => {
    const data = makeSerialized();
    (data as Record<string, unknown>).id = undefined;
    expect(validateWorldData(data)).toBe(false);
  });

  it("returns false for non-string name", () => {
    const data = makeSerialized();
    (data as Record<string, unknown>).name = 42;
    expect(validateWorldData(data)).toBe(false);
  });

  it("returns false for missing version", () => {
    const data = makeSerialized();
    (data as Record<string, unknown>).version = undefined;
    expect(validateWorldData(data)).toBe(false);
  });

  it("returns false for missing foundation", () => {
    const data = makeSerialized();
    (data as Record<string, unknown>).foundation = undefined;
    expect(validateWorldData(data)).toBe(false);
  });

  it("returns false for missing layers", () => {
    const data = makeSerialized();
    (data as Record<string, unknown>).layers = undefined;
    expect(validateWorldData(data)).toBe(false);
  });

  it("returns false when foundation arrays are missing", () => {
    const data = makeSerialized();
    (data.foundation as Record<string, unknown>).biomes = "not array";
    expect(validateWorldData(data)).toBe(false);
  });

  it("returns false when layer arrays are missing", () => {
    const data = makeSerialized();
    (data.layers as Record<string, unknown>).npcs = "not array";
    expect(validateWorldData(data)).toBe(false);
  });

  it("returns false for non-object biomeOverrides", () => {
    const data = makeSerialized();
    (data.layers as Record<string, unknown>).biomeOverrides = null;
    expect(validateWorldData(data)).toBe(false);
  });
});

// ── migrateWorldData ─────────────────────────────────────

describe("migrateWorldData", () => {
  it("fills missing description", () => {
    const data = makeSerialized();
    (data as Record<string, unknown>).description = undefined;
    const result = migrateWorldData(data as never);
    expect(result.description).toBe("");
  });

  it("fills missing version with 1", () => {
    const data = makeSerialized();
    (data as Record<string, unknown>).version = 0;
    const result = migrateWorldData(data as never);
    expect(result.version).toBe(1);
  });

  it("fills missing layer arrays", () => {
    const data = makeSerialized();
    (data as Record<string, unknown>).layers = undefined;
    const result = migrateWorldData(data as never);
    expect(result.layers.npcs).toEqual([]);
    expect(result.layers.bosses).toEqual([]);
  });

  it("fills missing foundation arrays", () => {
    const data = makeSerialized();
    (data.foundation as Record<string, unknown>).biomes = undefined;
    const result = migrateWorldData(data as never);
    expect(result.foundation.biomes).toEqual([]);
  });

  it("preserves existing data", () => {
    const data = makeSerialized();
    const result = migrateWorldData(data as never);
    expect(result.id).toBe(data.id);
    expect(result.name).toBe(data.name);
    expect(result.layers.npcs).toEqual(data.layers.npcs);
  });
});

// ── generateWorldId ──────────────────────────────────────

describe("generateWorldId", () => {
  it("starts with 'world-'", () => {
    expect(generateWorldId()).toMatch(/^world-/);
  });

  it("generates unique ids", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateWorldId()));
    expect(ids.size).toBe(100);
  });
});

// ── generateWorldName ────────────────────────────────────

describe("generateWorldName", () => {
  it("returns a non-empty string", () => {
    expect(generateWorldName(42).length).toBeGreaterThan(0);
  });

  it("is deterministic for the same seed", () => {
    expect(generateWorldName(42)).toBe(generateWorldName(42));
  });

  it("produces different names for different seeds", () => {
    const names = new Set(
      Array.from({ length: 20 }, (_, i) => generateWorldName(i)),
    );
    expect(names.size).toBeGreaterThan(1);
  });
});
