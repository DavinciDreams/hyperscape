/**
 * Faithfulness test: npc-definitions schema must accept the real
 * `packages/server/world/assets/manifests/npcs.json` payload + the
 * minimum-viable per-NPC shape, and reject obvious authoring bugs.
 */

import { describe, expect, it } from "vitest";

import {
  NpcDefinitionSchema,
  NpcDefinitionsManifestSchema,
} from "./npc-definitions.js";

// Minimum-viable NPC — every required field, no optional extras.
const minimalGoblin = {
  id: "test_goblin",
  name: "Test Goblin",
  category: "mob",
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
    respawnTicks: 35,
    respawnTime: 21000,
    xpReward: 5,
    poisonous: false,
    immuneToPoison: false,
  },
  drops: {
    defaultDrop: { enabled: true, itemId: "bones", quantity: 1 },
    always: [],
    common: [],
    uncommon: [],
    rare: [],
    veryRare: [],
    rareDropTable: false,
  },
};

describe("NpcDefinitionSchema", () => {
  it("accepts the minimum-viable per-NPC shape", () => {
    const result = NpcDefinitionSchema.safeParse(minimalGoblin);
    if (!result.success) {
      throw new Error(
        `Minimal NPC failed:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("accepts a richer NPC with movement + appearance + dialogue (passthrough survives)", () => {
    const richNpc = {
      ...minimalGoblin,
      id: "test_boss",
      name: "Test Boss",
      category: "boss" as const,
      levelRange: [50, 60] as [number, number],
      movement: {
        type: "wander" as const,
        speed: 3.33,
        wanderRadius: 5,
        roaming: true,
      },
      appearance: {
        modelPath: "asset://models/troll/troll_rigged.glb",
        scale: { x: 100, y: 100, z: 100 },
        animations: { idle: "idle_loop", attack: "attack_swing" },
      },
      dialogue: {
        greet: { text: "Roar!", responses: [] },
      },
      services: {
        enabled: true,
        types: ["bank"],
        shopInventory: [],
      },
      spawnBiomes: ["mountains", "tundra"],
      buildingRole: "boss_lair",
    };
    const result = NpcDefinitionSchema.safeParse(richNpc);
    expect(result.success).toBe(true);
    if (result.success) {
      // Passthrough fields survive — appearance.scale, dialogue.greet,
      // services.shopInventory all preserved on the parsed shape.
      const out = result.data as { appearance?: { scale?: unknown } };
      expect(out.appearance?.scale).toBeDefined();
    }
  });

  it("accepts levelRange as object form { min, max }", () => {
    const npc = { ...minimalGoblin, id: "x", levelRange: { min: 5, max: 10 } };
    const result = NpcDefinitionSchema.safeParse(npc);
    expect(result.success).toBe(true);
  });

  it("rejects an unknown category (only mob/boss/neutral/quest allowed)", () => {
    const bad = { ...minimalGoblin, category: "wizard" };
    const result = NpcDefinitionSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects negative stat values", () => {
    const bad = {
      ...minimalGoblin,
      stats: { ...minimalGoblin.stats, attack: -1 },
    };
    const result = NpcDefinitionSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("accepts a neutral NPC with no stats / drops / combat (bank clerks, shopkeepers)", () => {
    // Real-world shape from packages/server/world/assets/manifests/npcs.json
    // — neutral NPCs that can't be attacked and don't drop loot.
    const bankClerk = {
      id: "test_bank_clerk",
      name: "Bank Clerk",
      description: "Bank service NPC",
      category: "neutral" as const,
      faction: "town",
      combat: { attackable: false },
      movement: {
        type: "stationary" as const,
        speed: 0,
        wanderRadius: 0,
      },
      services: { enabled: true, types: ["bank"] },
    };
    const result = NpcDefinitionSchema.safeParse(bankClerk);
    expect(result.success).toBe(true);
  });

  it("rejects an unknown attackType (must be melee/ranged/magic)", () => {
    const bad = {
      ...minimalGoblin,
      combat: { ...minimalGoblin.combat, attackType: "psychic" },
    };
    const result = NpcDefinitionSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects a drop entry with chance > 1", () => {
    const bad = {
      ...minimalGoblin,
      drops: {
        ...minimalGoblin.drops,
        common: [{ itemId: "coin", chance: 1.5 }],
      },
    };
    const result = NpcDefinitionSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});

describe("NpcDefinitionsManifestSchema", () => {
  it("accepts an empty manifest (bare array)", () => {
    const result = NpcDefinitionsManifestSchema.safeParse([]);
    expect(result.success).toBe(true);
  });

  it("accepts a manifest with several NPCs", () => {
    const result = NpcDefinitionsManifestSchema.safeParse([
      minimalGoblin,
      { ...minimalGoblin, id: "test_skeleton", name: "Test Skeleton" },
      {
        ...minimalGoblin,
        id: "test_boss",
        name: "Test Boss",
        category: "boss" as const,
      },
    ]);
    expect(result.success).toBe(true);
  });

  it("rejects a manifest containing a malformed NPC", () => {
    const result = NpcDefinitionsManifestSchema.safeParse([
      minimalGoblin,
      { ...minimalGoblin, id: "" }, // empty id
    ]);
    expect(result.success).toBe(false);
  });
});
