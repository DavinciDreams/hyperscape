/**
 * End-to-end vertical-slice integration proof for the loot-tables
 * manifest pipeline.
 *
 * Mirror of xp-curves.integration.test.ts, the second slice proving
 * the file → provider → runtime-consumer chain replicates cleanly.
 *
 *   packages/server/world/assets/manifests/loot-tables.json
 *       ↓ lootTablesProvider.loadRaw(raw)            (edge Zod validation)
 *   lootTablesProvider (singleton)
 *       ↓ new LootTableRoller(provider.getManifest()) (consumer seed)
 *   LootTableRoller
 *       ↓ roller.roll(tableId, ctx)                  (consumer query)
 *   asserts: seeded RNG produces the exact drop set we expect
 *
 * Plus a companion slice for `mob-loot-table-mappings.json` proving the
 * mob-type → table-id record survives the same chain.
 *
 * This is the exact chain SystemLoader runs on server boot and that
 * PIEEditorSession.updateManifests runs on every editor save.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { lootTablesProvider } from "../LootTablesProvider";
import { mobLootTableMappingsProvider } from "../MobLootTableMappingsProvider";
import { LootTableRoller } from "../../loot/LootTableRoller";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOOT_TABLES_PATH = path.resolve(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "server",
  "world",
  "assets",
  "manifests",
  "loot-tables.json",
);
const MAPPINGS_PATH = path.resolve(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "server",
  "world",
  "assets",
  "manifests",
  "mob-loot-table-mappings.json",
);

/** Deterministic RNG so drop assertions are stable. */
function makeSeededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

async function readJson(filePath: string): Promise<unknown> {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw);
}

beforeEach(() => {
  lootTablesProvider.hotReload(null);
  mobLootTableMappingsProvider.hotReload(null);
});

afterEach(() => {
  lootTablesProvider.hotReload(null);
  mobLootTableMappingsProvider.hotReload(null);
});

describe("loot-tables.json vertical-slice integration", () => {
  it("file parses through LootTablesProvider.loadRaw (Zod edge validation)", async () => {
    const raw = await readJson(LOOT_TABLES_PATH);
    const parsed = lootTablesProvider.loadRaw(raw);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);
  });

  it("ships the canonical goblin_drops table chained to common_mob_drops", async () => {
    const raw = await readJson(LOOT_TABLES_PATH);
    lootTablesProvider.loadRaw(raw);
    const manifest = lootTablesProvider.getManifest();
    expect(manifest).not.toBeNull();
    const ids = manifest!.map((t) => t.id);
    expect(ids).toContain("common_mob_drops");
    expect(ids).toContain("goblin_drops");
  });

  it("boot path: file → provider → roller.roll() produces drops", async () => {
    const raw = await readJson(LOOT_TABLES_PATH);
    lootTablesProvider.loadRaw(raw);
    const manifest = lootTablesProvider.getManifest();
    expect(manifest).not.toBeNull();

    const roller = new LootTableRoller(manifest!);
    expect(roller.has("common_mob_drops")).toBe(true);
    expect(roller.has("goblin_drops")).toBe(true);

    const drops = roller.roll("goblin_drops", {
      rng: makeSeededRng(42),
      evaluateCondition: () => true,
    });
    // goblin_drops has rolls {min:2, max:3}, so 2 or 3 drops expected.
    expect(drops.length).toBeGreaterThanOrEqual(2);
    expect(drops.length).toBeLessThanOrEqual(3);
    // Every drop should be one of the items the manifest can produce.
    // (Sub-table chains to common_mob_drops, which can yield coin/bones.)
    const allowedItemIds = new Set(["goblin_mail", "coin", "bones"]);
    for (const drop of drops) {
      expect(allowedItemIds.has(drop.itemId)).toBe(true);
    }
  });

  it("unloaded path: provider.getManifest() returns null so consumers can fall back", () => {
    expect(lootTablesProvider.getManifest()).toBeNull();
  });

  it("PIE hot-reload replaces the table set; roller rebuilt from new manifest", async () => {
    const raw = await readJson(LOOT_TABLES_PATH);
    lootTablesProvider.loadRaw(raw);
    const before = new LootTableRoller(lootTablesProvider.getManifest()!);
    expect(before.has("goblin_drops")).toBe(true);

    // Editor saves an entirely different table set.
    lootTablesProvider.hotReload([
      {
        id: "dragon_drops",
        name: "Dragon Drops",
        description: "",
        rolls: { min: 1, max: 1 },
        entries: [
          {
            kind: "item",
            itemId: "dragon_bones",
            weight: 1,
            stack: { min: 1, max: 1 },
            condition: { kind: "always", params: {} },
          },
        ],
      },
    ]);

    const after = new LootTableRoller(lootTablesProvider.getManifest()!);
    expect(after.has("goblin_drops")).toBe(false);
    expect(after.has("dragon_drops")).toBe(true);

    const drops = after.roll("dragon_drops", {
      rng: makeSeededRng(1),
      evaluateCondition: () => true,
    });
    expect(drops.length).toBe(1);
    expect(drops[0]!.itemId).toBe("dragon_bones");
  });
});

describe("mob-loot-table-mappings.json vertical-slice integration", () => {
  it("file parses through MobLootTableMappingsProvider.loadRaw", async () => {
    const raw = await readJson(MAPPINGS_PATH);
    const parsed = mobLootTableMappingsProvider.loadRaw(raw);
    expect(typeof parsed).toBe("object");
  });

  it("ships the canonical goblin → goblin_drops mapping", async () => {
    const raw = await readJson(MAPPINGS_PATH);
    mobLootTableMappingsProvider.loadRaw(raw);
    const mappings = mobLootTableMappingsProvider.getManifest();
    expect(mappings).not.toBeNull();
    expect(mappings!.goblin).toBe("goblin_drops");
  });

  it("boot path: mapping resolves to a real table id in the loot roller", async () => {
    const tablesRaw = await readJson(LOOT_TABLES_PATH);
    lootTablesProvider.loadRaw(tablesRaw);
    const mappingsRaw = await readJson(MAPPINGS_PATH);
    mobLootTableMappingsProvider.loadRaw(mappingsRaw);

    const roller = new LootTableRoller(lootTablesProvider.getManifest()!);
    const mappings = mobLootTableMappingsProvider.getManifest()!;
    // The mapping must point at a table the roller actually has.
    for (const [mobType, tableId] of Object.entries(mappings)) {
      expect(roller.has(tableId)).toBe(true);
      // Smoke: rolling that table must not throw.
      const drops = roller.roll(tableId, {
        rng: makeSeededRng(mobType.length + 7),
        evaluateCondition: () => true,
      });
      expect(Array.isArray(drops)).toBe(true);
    }
  });
});
