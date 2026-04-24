/**
 * Faithfulness + defensiveness tests for `LootTablesManifestSchema`.
 */

import { describe, expect, it } from "vitest";

import {
  LootTablesManifestSchema,
  type LootTablesManifest,
} from "./loot-tables.js";

const reference: LootTablesManifest = [
  {
    id: "common_mob_drops",
    name: "Common Mob Drops",
    description: "Base drop pool shared across weak humanoids.",
    rolls: { min: 1, max: 1 },
    entries: [
      {
        kind: "item",
        itemId: "coin",
        weight: 100,
        stack: { min: 1, max: 15 },
        condition: { kind: "always", params: {} },
      },
      {
        kind: "item",
        itemId: "bones",
        weight: 60,
        stack: { min: 1, max: 1 },
        condition: { kind: "always", params: {} },
      },
      { kind: "nothing", weight: 20 },
    ],
  },
  {
    id: "goblin_drops",
    name: "Goblin Drops",
    description: "Specific goblin drops + chained common pool.",
    rolls: { min: 2, max: 3 },
    entries: [
      {
        kind: "item",
        itemId: "goblin_mail",
        weight: 5,
        stack: { min: 1, max: 1 },
        condition: { kind: "always", params: {} },
      },
      {
        kind: "table",
        tableId: "common_mob_drops",
        weight: 95,
        condition: { kind: "always", params: {} },
      },
    ],
  },
];

describe("LootTablesManifestSchema", () => {
  it("parses the reference manifest cleanly", () => {
    const result = LootTablesManifestSchema.safeParse(reference);
    if (!result.success) {
      throw new Error(
        `Reference manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("applies defaults on a minimal entry", () => {
    const parsed = LootTablesManifestSchema.parse([
      {
        id: "t",
        name: "T",
        entries: [{ kind: "item", itemId: "coin", weight: 1 }],
      },
    ]);
    expect(parsed[0].rolls).toEqual({ min: 1, max: 1 });
    if (parsed[0].entries[0].kind === "item") {
      expect(parsed[0].entries[0].stack).toEqual({ min: 1, max: 1 });
      expect(parsed[0].entries[0].condition.kind).toBe("always");
    } else {
      throw new Error("expected item entry");
    }
  });

  it("rejects zero-weight entries", () => {
    const bad = [
      {
        id: "t",
        name: "T",
        entries: [{ kind: "item", itemId: "x", weight: 0 }],
      },
    ];
    expect(LootTablesManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects empty entries array", () => {
    const bad = [{ id: "t", name: "T", entries: [] }];
    expect(LootTablesManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects stack range with min > max", () => {
    const bad = [
      {
        id: "t",
        name: "T",
        entries: [
          {
            kind: "item",
            itemId: "x",
            weight: 1,
            stack: { min: 10, max: 5 },
          },
        ],
      },
    ];
    expect(LootTablesManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects rolls range with min > max", () => {
    const bad = [
      {
        id: "t",
        name: "T",
        rolls: { min: 5, max: 1 },
        entries: [{ kind: "item", itemId: "x", weight: 1 }],
      },
    ];
    expect(LootTablesManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects stack max=0", () => {
    const bad = [
      {
        id: "t",
        name: "T",
        entries: [
          {
            kind: "item",
            itemId: "x",
            weight: 1,
            stack: { min: 0, max: 0 },
          },
        ],
      },
    ];
    expect(LootTablesManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects self-rolling table entry", () => {
    const bad = [
      {
        id: "t",
        name: "T",
        entries: [{ kind: "table", tableId: "t", weight: 1 }],
      },
    ];
    expect(LootTablesManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects table entry referencing unknown tableId", () => {
    const bad = [
      {
        id: "t",
        name: "T",
        entries: [{ kind: "table", tableId: "nope", weight: 1 }],
      },
    ];
    expect(LootTablesManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown entry kind", () => {
    const bad = [
      {
        id: "t",
        name: "T",
        entries: [{ kind: "wish", weight: 1 }],
      },
    ];
    expect(LootTablesManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate loot table ids", () => {
    const bad = [reference[0], { ...reference[0] }];
    expect(LootTablesManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown drop-condition kind", () => {
    const bad = [
      {
        id: "t",
        name: "T",
        entries: [
          {
            kind: "item",
            itemId: "x",
            weight: 1,
            condition: { kind: "when-moon-full" },
          },
        ],
      },
    ];
    expect(LootTablesManifestSchema.safeParse(bad).success).toBe(false);
  });
});
