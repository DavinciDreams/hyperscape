/**
 * LootSystem authored-loot-tables integration.
 *
 * Verifies the Phase B3 hot-reload pathway from
 * `PIEEditorSession.updateManifests({ lootTables, mobLootTableMappings })`
 * through `LootSystem.setAuthoredLootTables` + `setMobLootTableMappings`
 * to the authored `LootTableRoller`. The assertions cover the
 * authority model (authored wins over legacy), mapping resolution,
 * and the clear-back-to-legacy escape hatch.
 *
 * These are unit tests against the public API; `handleMobDeath` is
 * not exercised here because it depends on `GroundItemSystem` +
 * event bus subscribers — those are covered by the broader
 * integration suite.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

import type { LootTablesManifest } from "@hyperforge/manifest-schema";

import { LootSystem } from "../LootSystem";
import type { World } from "../../../../types/index";

function makeWorld(): World {
  const systems = new Map<string, unknown>();
  return {
    isServer: true,
    entities: new Map(),
    currentTick: 0,
    getSystem: vi.fn((name: string) => systems.get(name)),
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  } as unknown as World;
}

const authoredManifest: LootTablesManifest = [
  {
    id: "bandit_drops",
    rolls: { min: 1, max: 1 },
    entries: [
      {
        kind: "item",
        weight: 1,
        itemId: "coins",
        stack: { min: 10, max: 10 },
      },
    ],
  },
  {
    id: "rare_drops",
    rolls: { min: 2, max: 2 },
    entries: [
      {
        kind: "item",
        weight: 1,
        itemId: "rune_scimitar",
        stack: { min: 1, max: 1 },
      },
    ],
  },
];

describe("LootSystem authored loot tables", () => {
  let loot: LootSystem;

  beforeEach(() => {
    loot = new LootSystem(makeWorld());
  });

  it("falls back to legacy service when no authored mapping exists", () => {
    const drops = loot.rollLootFor("nonexistent_mob_type_xyz");
    // Legacy LootTableService returns [] for unknown mob types.
    expect(drops).toEqual([]);
  });

  it("rolls authored tables when a mapping is set and table is present", () => {
    loot.setAuthoredLootTables(authoredManifest);
    loot.setMobLootTable("bandit", "bandit_drops");

    const drops = loot.rollLootFor("bandit");
    expect(drops).toEqual([{ itemId: "coins", quantity: 10 }]);
  });

  it("honors the rolls count on the authored table", () => {
    loot.setAuthoredLootTables(authoredManifest);
    loot.setMobLootTable("boss", "rare_drops");

    const drops = loot.rollLootFor("boss");
    expect(drops).toHaveLength(2); // rolls.min === rolls.max === 2
    for (const d of drops)
      expect(d).toEqual({
        itemId: "rune_scimitar",
        quantity: 1,
      });
  });

  it("setMobLootTableMappings replaces the prior map in one call", () => {
    loot.setAuthoredLootTables(authoredManifest);
    loot.setMobLootTable("synthetic_mob_alpha_xyz", "bandit_drops");
    loot.setMobLootTable("synthetic_mob_beta_xyz", "bandit_drops");

    loot.setMobLootTableMappings({ synthetic_boss_xyz: "rare_drops" });

    // Prior mappings were cleared — these mob ids have no legacy entry, so the
    // fallback returns an empty array.
    expect(loot.rollLootFor("synthetic_mob_alpha_xyz")).toEqual([]);
    expect(loot.rollLootFor("synthetic_mob_beta_xyz")).toEqual([]);
    // New mapping is in effect.
    expect(loot.rollLootFor("synthetic_boss_xyz")).toHaveLength(2);
  });

  it("resetMobLootTableMappings clears mappings without unloading authored tables", () => {
    loot.setAuthoredLootTables(authoredManifest);
    loot.setMobLootTable("synthetic_mob_alpha_xyz", "bandit_drops");
    expect(loot.rollLootFor("synthetic_mob_alpha_xyz")).toHaveLength(1);

    loot.resetMobLootTableMappings();
    // Mob id has no legacy entry so fallback is [].
    expect(loot.rollLootFor("synthetic_mob_alpha_xyz")).toEqual([]);

    // Re-binding uses the same loaded manifest.
    loot.setMobLootTable("synthetic_mob_alpha_xyz", "bandit_drops");
    expect(loot.rollLootFor("synthetic_mob_alpha_xyz")).toHaveLength(1);
  });

  it("setAuthoredLootTables(null) drops the authored roller entirely", () => {
    loot.setAuthoredLootTables(authoredManifest);
    loot.setMobLootTable("synthetic_mob_alpha_xyz", "bandit_drops");
    expect(loot.rollLootFor("synthetic_mob_alpha_xyz")).toHaveLength(1);

    loot.setAuthoredLootTables(null);
    // Mapping is still present but the roller can no longer resolve it.
    // Falls through to the legacy service, which returns [] for this
    // synthetic mob id (no legacy entry).
    expect(loot.rollLootFor("synthetic_mob_alpha_xyz")).toEqual([]);
  });

  it("re-loading a fresh manifest updates drops for the same mapping", () => {
    loot.setAuthoredLootTables(authoredManifest);
    loot.setMobLootTable("bandit", "bandit_drops");
    expect(loot.rollLootFor("bandit")[0]).toEqual({
      itemId: "coins",
      quantity: 10,
    });

    // Hot-reload: same table id, different item + stack.
    loot.setAuthoredLootTables([
      {
        id: "bandit_drops",
        rolls: { min: 1, max: 1 },
        entries: [
          {
            kind: "item",
            weight: 1,
            itemId: "bronze_dagger",
            stack: { min: 1, max: 1 },
          },
        ],
      },
    ]);
    expect(loot.rollLootFor("bandit")[0]).toEqual({
      itemId: "bronze_dagger",
      quantity: 1,
    });
  });

  it("unmapped mob types always fall through to legacy even with authored tables loaded", () => {
    loot.setAuthoredLootTables(authoredManifest);
    loot.setMobLootTable("bandit", "bandit_drops");

    // "goblin" has no mapping → legacy service.
    expect(loot.rollLootFor("goblin_with_no_legacy_entry_xyz")).toEqual([]);
  });

  it("keeps authored tables stable across multiple mapping updates", () => {
    loot.setAuthoredLootTables(authoredManifest);

    loot.setMobLootTable("a", "bandit_drops");
    loot.setMobLootTable("b", "rare_drops");
    loot.setMobLootTable("c", "bandit_drops");

    expect(loot.rollLootFor("a")).toHaveLength(1);
    expect(loot.rollLootFor("b")).toHaveLength(2);
    expect(loot.rollLootFor("c")).toHaveLength(1);
  });
});
