import {
  LootTablesManifestSchema,
  type DropCondition,
  type LootTablesManifest,
} from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import {
  LootTableRecursionError,
  LootTableRoller,
  UnknownLootTableError,
  type DroppedItem,
  type RollContext,
} from "../LootTableRoller.js";

/**
 * Deterministic PRNG — seeded xorshift32. Tests lock in roll outcomes
 * so the roller's bugs can't hide behind Math.random noise.
 */
function seededRng(seed: number): () => number {
  let state = seed | 0;
  if (state === 0) state = 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    // Convert to [0, 1).
    return ((state >>> 0) % 1_000_000) / 1_000_000;
  };
}

/**
 * Queue-backed RNG for targeted per-call control. Each `rng()` call
 * dequeues the next value; throws if the queue is drained so tests
 * can't accidentally fall into undefined behavior.
 */
function queuedRng(values: number[]): () => number {
  let i = 0;
  return () => {
    if (i >= values.length) {
      throw new Error(`rng queue exhausted after ${i} calls`);
    }
    return values[i++]!;
  };
}

function alwaysTrueCondition(_c: DropCondition): boolean {
  return true;
}

describe("LootTableRoller — registry basics", () => {
  it("empty roller: size 0, has/get return falsy", () => {
    const roller = new LootTableRoller();
    expect(roller.size).toBe(0);
    expect(roller.tableIds).toEqual([]);
    expect(roller.has("mob-common")).toBe(false);
    expect(roller.get("mob-common")).toBeUndefined();
  });

  it("constructor accepts a pre-validated manifest", () => {
    const raw: LootTablesManifest = LootTablesManifestSchema.parse([
      {
        id: "t1",
        name: "T1",
        entries: [{ kind: "item", itemId: "coin", weight: 1 }],
      },
    ]);
    const roller = new LootTableRoller(raw);
    expect(roller.size).toBe(1);
    expect(roller.has("t1")).toBe(true);
  });

  it("load() replaces contents (not merge)", () => {
    const roller = new LootTableRoller(
      LootTablesManifestSchema.parse([
        {
          id: "a",
          name: "A",
          entries: [{ kind: "item", itemId: "x", weight: 1 }],
        },
      ]),
    );
    roller.load(
      LootTablesManifestSchema.parse([
        {
          id: "b",
          name: "B",
          entries: [{ kind: "item", itemId: "y", weight: 1 }],
        },
      ]),
    );
    expect(roller.has("a")).toBe(false);
    expect(roller.has("b")).toBe(true);
  });

  it("loadFromJson validates via Zod", () => {
    const roller = new LootTableRoller();
    roller.loadFromJson([
      {
        id: "t",
        name: "T",
        entries: [{ kind: "item", itemId: "x", weight: 1 }],
      },
    ]);
    expect(roller.size).toBe(1);
  });

  it("loadFromJson throws on malformed input and leaves registry empty", () => {
    const roller = new LootTableRoller();
    expect(() => roller.loadFromJson([{ id: "bad" }])).toThrow();
    expect(roller.size).toBe(0);
  });
});

describe("LootTableRoller — rolling", () => {
  it("roll() throws UnknownLootTableError for missing id", () => {
    const roller = new LootTableRoller();
    const ctx: RollContext = {
      rng: () => 0,
      evaluateCondition: alwaysTrueCondition,
    };
    let caught: unknown;
    try {
      roller.roll("ghost", ctx);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(UnknownLootTableError);
    expect((caught as UnknownLootTableError).tableId).toBe("ghost");
    expect((caught as UnknownLootTableError).availableIds).toEqual([]);
  });

  it("single-entry item table drops that item with stack=1", () => {
    const roller = new LootTableRoller(
      LootTablesManifestSchema.parse([
        {
          id: "t",
          name: "T",
          entries: [{ kind: "item", itemId: "coin", weight: 1 }],
        },
      ]),
    );
    const drops = roller.roll("t", {
      rng: seededRng(123),
      evaluateCondition: alwaysTrueCondition,
    });
    expect(drops).toEqual<DroppedItem[]>([{ itemId: "coin", quantity: 1 }]);
  });

  it("nothing-entry produces no drop", () => {
    const roller = new LootTableRoller(
      LootTablesManifestSchema.parse([
        {
          id: "t",
          name: "T",
          entries: [{ kind: "nothing", weight: 1 }],
        },
      ]),
    );
    const drops = roller.roll("t", {
      rng: seededRng(99),
      evaluateCondition: alwaysTrueCondition,
    });
    expect(drops).toEqual([]);
  });

  it("weighted entries: heavier weight gets picked more often", () => {
    const roller = new LootTableRoller(
      LootTablesManifestSchema.parse([
        {
          id: "t",
          name: "T",
          rolls: { min: 1, max: 1 },
          entries: [
            { kind: "item", itemId: "common", weight: 99 },
            { kind: "item", itemId: "rare", weight: 1 },
          ],
        },
      ]),
    );
    // Two independent rolls: total weight 100. rng=0.5 → r=50, common (99) captures.
    // rng=0.995 → r=99.5, skip common (99→0.5 remaining), rare captures.
    const commonDrops = roller.roll("t", {
      rng: queuedRng([0.5]),
      evaluateCondition: alwaysTrueCondition,
    });
    expect(commonDrops).toEqual([{ itemId: "common", quantity: 1 }]);

    const rareDrops = roller.roll("t", {
      rng: queuedRng([0.995]),
      evaluateCondition: alwaysTrueCondition,
    });
    expect(rareDrops).toEqual([{ itemId: "rare", quantity: 1 }]);
  });

  it("stack range resolves via rng in [min, max]", () => {
    const roller = new LootTableRoller(
      LootTablesManifestSchema.parse([
        {
          id: "t",
          name: "T",
          entries: [
            {
              kind: "item",
              itemId: "gold",
              weight: 1,
              stack: { min: 10, max: 20 },
            },
          ],
        },
      ]),
    );
    // rng sequence: [weight-pick, stack-pick]. stack: floor(0 * 11)+10 = 10.
    const low = roller.roll("t", {
      rng: queuedRng([0, 0]),
      evaluateCondition: alwaysTrueCondition,
    });
    expect(low).toEqual([{ itemId: "gold", quantity: 10 }]);

    // stack: floor(0.99 * 11)+10 = floor(10.89)+10 = 20.
    const high = roller.roll("t", {
      rng: queuedRng([0, 0.99]),
      evaluateCondition: alwaysTrueCondition,
    });
    expect(high).toEqual([{ itemId: "gold", quantity: 20 }]);
  });

  it("rolls.min/max produces multiple drops", () => {
    const roller = new LootTableRoller(
      LootTablesManifestSchema.parse([
        {
          id: "t",
          name: "T",
          rolls: { min: 3, max: 3 },
          entries: [{ kind: "item", itemId: "x", weight: 1 }],
        },
      ]),
    );
    const drops = roller.roll("t", {
      rng: seededRng(7),
      evaluateCondition: alwaysTrueCondition,
    });
    expect(drops).toHaveLength(3);
    expect(drops.every((d) => d.itemId === "x")).toBe(true);
  });

  it("condition false filters the entry out of that roll", () => {
    const roller = new LootTableRoller(
      LootTablesManifestSchema.parse([
        {
          id: "t",
          name: "T",
          entries: [
            {
              kind: "item",
              itemId: "quest-only",
              weight: 1,
              condition: { kind: "quest-active", params: { questId: "q1" } },
            },
            { kind: "item", itemId: "fallback", weight: 1 },
          ],
        },
      ]),
    );
    // Reject quest-active entries.
    const drops = roller.roll("t", {
      rng: queuedRng([0, 0]),
      evaluateCondition: (c) => c.kind !== "quest-active",
    });
    expect(drops).toEqual([{ itemId: "fallback", quantity: 1 }]);
  });

  it("all conditions false → roll produces nothing (skipped)", () => {
    const roller = new LootTableRoller(
      LootTablesManifestSchema.parse([
        {
          id: "t",
          name: "T",
          entries: [
            {
              kind: "item",
              itemId: "x",
              weight: 1,
              condition: { kind: "quest-active", params: { questId: "q1" } },
            },
          ],
        },
      ]),
    );
    const drops = roller.roll("t", {
      rng: queuedRng([0]),
      evaluateCondition: () => false,
    });
    expect(drops).toEqual([]);
  });

  it("subtable roll inlines drops in place", () => {
    const roller = new LootTableRoller(
      LootTablesManifestSchema.parse([
        {
          id: "common",
          name: "Common",
          entries: [{ kind: "item", itemId: "coin", weight: 1 }],
        },
        {
          id: "mob",
          name: "Mob",
          rolls: { min: 1, max: 1 },
          entries: [{ kind: "table", tableId: "common", weight: 1 }],
        },
      ]),
    );
    const drops = roller.roll("mob", {
      rng: queuedRng([0, 0]),
      evaluateCondition: alwaysTrueCondition,
    });
    expect(drops).toEqual([{ itemId: "coin", quantity: 1 }]);
  });

  it("multi-hop cycle (A → B → A) hits recursion limit", () => {
    // Bypass manifest-level cross-ref validation by calling load()
    // with a hand-built structure — simulates a live-edit where the
    // author introduced a cycle at runtime. (The outer
    // LootTablesManifestSchema.parse would reject this.)
    const aTable = {
      id: "a",
      name: "A",
      description: "",
      rolls: { min: 1, max: 1 },
      entries: [
        {
          kind: "table" as const,
          tableId: "b",
          weight: 1,
          condition: {
            kind: "always" as const,
            params: {} as Record<string, string | number | boolean>,
          },
        },
      ],
    };
    const bTable = {
      id: "b",
      name: "B",
      description: "",
      rolls: { min: 1, max: 1 },
      entries: [
        {
          kind: "table" as const,
          tableId: "a",
          weight: 1,
          condition: {
            kind: "always" as const,
            params: {} as Record<string, string | number | boolean>,
          },
        },
      ],
    };
    const roller = new LootTableRoller(undefined, { maxRecursionDepth: 4 });
    roller.load([aTable, bTable] as LootTablesManifest);
    let caught: unknown;
    try {
      roller.roll("a", {
        rng: () => 0,
        evaluateCondition: alwaysTrueCondition,
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(LootTableRecursionError);
    const path = (caught as LootTableRecursionError).path;
    expect(path[0]).toBe("a");
    expect(path.length).toBeGreaterThan(4);
  });
});
