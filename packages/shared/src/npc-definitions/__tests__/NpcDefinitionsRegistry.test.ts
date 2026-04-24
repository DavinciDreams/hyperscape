/**
 * NpcDefinitionsRegistry — faithfulness + lifecycle test.
 */

import { describe, expect, it } from "vitest";

import {
  NpcDefinitionsManifestSchema,
  type NpcDefinitionsManifest,
} from "@hyperforge/manifest-schema";

import {
  NpcDefinitionsNotLoadedError,
  NpcDefinitionsRegistry,
  UnknownNpcDefinitionError,
  npcDefinitionsRegistry,
} from "../index.js";

const minimalGoblin = {
  id: "test_goblin",
  name: "Test Goblin",
  category: "mob" as const,
  faction: "monster",
  stats: {
    level: 2,
    health: 5,
    attack: 1,
    strength: 1,
    defense: 1,
    defenseBonus: 0,
    ranged: 1,
    magic: 1,
  },
  combat: {
    attackable: true,
    aggressive: false,
    retaliates: true,
    aggroRange: 4,
    combatRange: 1,
    leashRange: 7,
    attackSpeedTicks: 4,
  },
};

function buildManifest(): NpcDefinitionsManifest {
  return NpcDefinitionsManifestSchema.parse([
    minimalGoblin,
    { ...minimalGoblin, id: "test_skeleton", name: "Test Skeleton" },
    {
      ...minimalGoblin,
      id: "test_boss",
      name: "Test Boss",
      category: "boss" as const,
    },
  ]);
}

describe("NpcDefinitionsRegistry", () => {
  it("starts unloaded; isLoaded returns false; manifest getter throws", () => {
    const reg = new NpcDefinitionsRegistry();
    expect(reg.isLoaded()).toBe(false);
    expect(reg.size).toBe(0);
    expect(() => reg.manifest).toThrow(NpcDefinitionsNotLoadedError);
  });

  it("load + isLoaded + size + ids", () => {
    const reg = new NpcDefinitionsRegistry();
    reg.load(buildManifest());
    expect(reg.isLoaded()).toBe(true);
    expect(reg.size).toBe(3);
    expect(reg.ids).toEqual(["test_goblin", "test_skeleton", "test_boss"]);
  });

  it("get + has + find behave correctly for known and unknown ids", () => {
    const reg = new NpcDefinitionsRegistry();
    reg.load(buildManifest());

    expect(reg.has("test_goblin")).toBe(true);
    expect(reg.has("nonexistent")).toBe(false);

    expect(reg.get("test_goblin").name).toBe("Test Goblin");
    expect(() => reg.get("nonexistent")).toThrow(UnknownNpcDefinitionError);

    // find: non-throwing
    expect(reg.find("test_goblin")?.name).toBe("Test Goblin");
    expect(reg.find("nonexistent")).toBeUndefined();
  });

  it("all() returns every loaded npc in manifest order", () => {
    const reg = new NpcDefinitionsRegistry();
    reg.load(buildManifest());
    expect(reg.all().map((n) => n.id)).toEqual([
      "test_goblin",
      "test_skeleton",
      "test_boss",
    ]);
  });

  it("loadFromJson Zod-validates raw input", () => {
    const reg = new NpcDefinitionsRegistry();
    expect(() => reg.loadFromJson("not an array")).toThrow();
    expect(() => reg.loadFromJson([{ id: "" }])).toThrow();
  });

  it("re-loading replaces the prior manifest in-place", () => {
    const reg = new NpcDefinitionsRegistry();
    reg.load(buildManifest());
    expect(reg.size).toBe(3);

    reg.load(
      NpcDefinitionsManifestSchema.parse([
        { ...minimalGoblin, id: "only_one", name: "Only One" },
      ]),
    );
    expect(reg.size).toBe(1);
    expect(reg.has("test_goblin")).toBe(false);
    expect(reg.has("only_one")).toBe(true);
  });

  it("throws on duplicate id within a single manifest", () => {
    const reg = new NpcDefinitionsRegistry();
    expect(() =>
      reg.load(
        NpcDefinitionsManifestSchema.parse([
          minimalGoblin,
          { ...minimalGoblin },
        ]),
      ),
    ).toThrow(/id collision/);
  });

  it("_unloadForTests returns to the unloaded baseline", () => {
    const reg = new NpcDefinitionsRegistry();
    reg.load(buildManifest());
    expect(reg.isLoaded()).toBe(true);
    reg._unloadForTests();
    expect(reg.isLoaded()).toBe(false);
    expect(reg.size).toBe(0);
  });

  it("module-level singleton exists and starts unloaded", () => {
    expect(npcDefinitionsRegistry).toBeInstanceOf(NpcDefinitionsRegistry);
    npcDefinitionsRegistry._unloadForTests();
    expect(npcDefinitionsRegistry.isLoaded()).toBe(false);
  });
});
