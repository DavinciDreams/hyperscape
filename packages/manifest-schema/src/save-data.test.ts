/**
 * Faithfulness + defensiveness tests for `SaveDataManifestSchema`.
 */

import { describe, expect, it } from "vitest";

import { SaveDataManifestSchema, type SaveDataManifest } from "./save-data.js";

const reference: SaveDataManifest = [
  {
    id: "character.core",
    name: "Character Core",
    description: "Position, HP, skills, inventory references",
    scope: "character",
    version: 2,
    fields: [
      {
        name: "position",
        kind: "vec3",
        required: true,
        description: "world position",
      },
      { name: "hp", kind: "int", required: true, defaultValue: 100 },
      { name: "maxHp", kind: "int", required: true, defaultValue: 100 },
      {
        name: "combatStyle",
        kind: "enum",
        enumValues: ["attack", "strength", "defense"],
        required: true,
        defaultValue: "attack",
      },
    ],
    migrations: [
      {
        from: 1,
        to: 2,
        migrator: "character.core.addMaxHp",
        description: "split HP into current+max",
      },
    ],
    periodicSnapshot: true,
    snapshotIntervalSec: 60,
  },
  {
    id: "banking.slots",
    name: "Bank Slots",
    description: "Bank inventory — large bytes blob per character",
    scope: "character",
    version: 1,
    fields: [
      { name: "slots", kind: "bytes", required: true },
      { name: "tabOrder", kind: "json", required: false },
    ],
    migrations: [],
    periodicSnapshot: false,
    snapshotIntervalSec: 60,
  },
  {
    id: "account.cosmetics",
    name: "Cosmetics",
    description: "Account-wide unlocked cosmetics",
    scope: "account",
    version: 1,
    fields: [
      { name: "ownedIds", kind: "json", required: true, defaultValue: "[]" },
      { name: "equippedId", kind: "string", required: false },
    ],
    migrations: [],
    periodicSnapshot: false,
    snapshotIntervalSec: 60,
  },
];

describe("SaveDataManifestSchema", () => {
  it("parses the reference manifest cleanly", () => {
    const result = SaveDataManifestSchema.safeParse(reference);
    if (!result.success) {
      throw new Error(
        `Reference manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("applies defaults on a minimal slice", () => {
    const parsed = SaveDataManifestSchema.parse([
      {
        id: "x",
        name: "X",
        scope: "character",
        fields: [{ name: "a", kind: "int" }],
      },
    ]);
    const s = parsed[0];
    expect(s.version).toBe(1);
    expect(s.migrations).toEqual([]);
    expect(s.periodicSnapshot).toBe(false);
    expect(s.snapshotIntervalSec).toBe(60);
    expect(s.fields[0].required).toBe(true);
    expect(s.fields[0].immutable).toBe(false);
  });

  it("rejects empty fields array", () => {
    const bad = [{ id: "x", name: "X", scope: "character", fields: [] }];
    expect(SaveDataManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects non-camelCase field name", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        scope: "character",
        fields: [{ name: "Position", kind: "vec3" }],
      },
    ];
    expect(SaveDataManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate field names within a slice", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        scope: "character",
        fields: [
          { name: "hp", kind: "int" },
          { name: "hp", kind: "int" },
        ],
      },
    ];
    expect(SaveDataManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown field kind", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        scope: "character",
        fields: [{ name: "weird", kind: "tachyon" }],
      },
    ];
    expect(SaveDataManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown scope", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        scope: "galactic",
        fields: [{ name: "a", kind: "int" }],
      },
    ];
    expect(SaveDataManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("requires enumValues for enum field", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        scope: "character",
        fields: [{ name: "state", kind: "enum" }],
      },
    ];
    expect(SaveDataManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects enumValues on non-enum field", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        scope: "character",
        fields: [{ name: "x", kind: "int", enumValues: ["a"] }],
      },
    ];
    expect(SaveDataManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects migration that skips versions", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        scope: "character",
        version: 3,
        fields: [{ name: "a", kind: "int" }],
        migrations: [{ from: 1, to: 3, migrator: "x" }],
      },
    ];
    expect(SaveDataManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects migration that produces a version > slice version", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        scope: "character",
        version: 1,
        fields: [{ name: "a", kind: "int" }],
        migrations: [{ from: 1, to: 2, migrator: "x" }],
      },
    ];
    expect(SaveDataManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate migration (from,to) pairs", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        scope: "character",
        version: 3,
        fields: [{ name: "a", kind: "int" }],
        migrations: [
          { from: 1, to: 2, migrator: "a" },
          { from: 1, to: 2, migrator: "b" },
        ],
      },
    ];
    expect(SaveDataManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate slice ids", () => {
    const bad = [reference[0], { ...reference[0] }];
    expect(SaveDataManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects empty migrator name", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        scope: "character",
        version: 2,
        fields: [{ name: "a", kind: "int" }],
        migrations: [{ from: 1, to: 2, migrator: "" }],
      },
    ];
    expect(SaveDataManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects version < 1", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        scope: "character",
        version: 0,
        fields: [{ name: "a", kind: "int" }],
      },
    ];
    expect(SaveDataManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects snapshotIntervalSec below 5", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        scope: "character",
        fields: [{ name: "a", kind: "int" }],
        snapshotIntervalSec: 1,
      },
    ];
    expect(SaveDataManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects invalid slice id format", () => {
    const bad = [
      {
        id: "Character Core",
        name: "X",
        scope: "character",
        fields: [{ name: "a", kind: "int" }],
      },
    ];
    expect(SaveDataManifestSchema.safeParse(bad).success).toBe(false);
  });
});
