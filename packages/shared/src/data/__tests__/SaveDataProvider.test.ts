/**
 * Tests for the SaveDataProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { saveDataProvider } from "../SaveDataProvider";

beforeEach(() => {
  saveDataProvider.unload();
});
afterEach(() => {
  saveDataProvider.unload();
});

const validManifest = [
  {
    id: "character.inventory",
    name: "Character Inventory",
    scope: "character" as const,
    version: 2,
    fields: [
      { name: "gold", kind: "int" as const },
      {
        name: "affiliation",
        kind: "enum" as const,
        enumValues: ["none", "guild", "raid"],
      },
    ],
    migrations: [
      {
        from: 1,
        to: 2,
        migrator: "inventory.addAffiliation",
      },
    ],
  },
  {
    id: "world.dayNight",
    name: "World Day/Night",
    scope: "world" as const,
    fields: [{ name: "currentHour", kind: "int" as const }],
    periodicSnapshot: true,
  },
];

describe("SaveDataProvider", () => {
  it("starts unloaded", () => {
    expect(saveDataProvider.isLoaded()).toBe(false);
    expect(saveDataProvider.getManifest()).toBeNull();
    expect(saveDataProvider.getSlices()).toEqual([]);
  });

  it("loadRaw() accepts a valid manifest and fills defaults", () => {
    const parsed = saveDataProvider.loadRaw(validManifest);
    expect(parsed.length).toBe(2);
    expect(parsed[1].version).toBe(1);
    expect(parsed[1].snapshotIntervalSec).toBe(60);
    expect(parsed[0].fields[0].required).toBe(true);
    expect(parsed[0].fields[0].immutable).toBe(false);
    expect(saveDataProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() accepts an empty array", () => {
    const parsed = saveDataProvider.loadRaw([]);
    expect(parsed).toEqual([]);
    expect(saveDataProvider.isLoaded()).toBe(true);
    expect(saveDataProvider.getSlices()).toEqual([]);
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = saveDataProvider.loadRaw(validManifest);
    saveDataProvider.unload();
    saveDataProvider.load(parsed);
    expect(saveDataProvider.isLoaded()).toBe(true);
    expect(saveDataProvider.getSlices().length).toBe(2);
  });

  it("loadRaw() rejects duplicate slice ids", () => {
    const bad = [
      {
        id: "dup",
        name: "A",
        scope: "character",
        fields: [{ name: "x", kind: "int" }],
      },
      {
        id: "dup",
        name: "B",
        scope: "world",
        fields: [{ name: "y", kind: "int" }],
      },
    ];
    expect(() => saveDataProvider.loadRaw(bad)).toThrow();
    expect(saveDataProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects duplicate field names within a slice", () => {
    const bad = [
      {
        id: "s",
        name: "S",
        scope: "character",
        fields: [
          { name: "gold", kind: "int" },
          { name: "gold", kind: "int" },
        ],
      },
    ];
    expect(() => saveDataProvider.loadRaw(bad)).toThrow();
    expect(saveDataProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects empty fields array", () => {
    const bad = [{ id: "s", name: "S", scope: "character", fields: [] }];
    expect(() => saveDataProvider.loadRaw(bad)).toThrow();
    expect(saveDataProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects enum field without enumValues", () => {
    const bad = [
      {
        id: "s",
        name: "S",
        scope: "character",
        fields: [{ name: "kindy", kind: "enum" }],
      },
    ];
    expect(() => saveDataProvider.loadRaw(bad)).toThrow();
    expect(saveDataProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects non-enum field with enumValues", () => {
    const bad = [
      {
        id: "s",
        name: "S",
        scope: "character",
        fields: [{ name: "gold", kind: "int", enumValues: ["a", "b"] }],
      },
    ];
    expect(() => saveDataProvider.loadRaw(bad)).toThrow();
    expect(saveDataProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects migrations that skip more than one version", () => {
    const bad = [
      {
        id: "s",
        name: "S",
        scope: "character",
        version: 3,
        fields: [{ name: "x", kind: "int" }],
        migrations: [{ from: 1, to: 3, migrator: "leap" }],
      },
    ];
    expect(() => saveDataProvider.loadRaw(bad)).toThrow();
    expect(saveDataProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects migrations whose `to` exceeds slice version", () => {
    const bad = [
      {
        id: "s",
        name: "S",
        scope: "character",
        version: 2,
        fields: [{ name: "x", kind: "int" }],
        migrations: [
          { from: 1, to: 2, migrator: "ok" },
          { from: 2, to: 3, migrator: "future" },
        ],
      },
    ];
    expect(() => saveDataProvider.loadRaw(bad)).toThrow();
    expect(saveDataProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects duplicate (from,to) migration pairs", () => {
    const bad = [
      {
        id: "s",
        name: "S",
        scope: "character",
        version: 2,
        fields: [{ name: "x", kind: "int" }],
        migrations: [
          { from: 1, to: 2, migrator: "a" },
          { from: 1, to: 2, migrator: "b" },
        ],
      },
    ];
    expect(() => saveDataProvider.loadRaw(bad)).toThrow();
    expect(saveDataProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects malformed slice id", () => {
    const bad = [
      {
        id: "Bad..Id",
        name: "B",
        scope: "character",
        fields: [{ name: "x", kind: "int" }],
      },
    ];
    expect(() => saveDataProvider.loadRaw(bad)).toThrow();
    expect(saveDataProvider.isLoaded()).toBe(false);
  });

  it("hotReload(manifest) replaces the current manifest", () => {
    saveDataProvider.loadRaw(validManifest);
    const replacement = saveDataProvider.loadRaw([
      {
        id: "only",
        name: "Only",
        scope: "account" as const,
        fields: [{ name: "x", kind: "int" as const }],
      },
    ]);
    saveDataProvider.hotReload(replacement);
    expect(saveDataProvider.getSlices().length).toBe(1);
    expect(saveDataProvider.getSlices()[0].id).toBe("only");
  });

  it("hotReload(null) clears", () => {
    saveDataProvider.loadRaw(validManifest);
    saveDataProvider.hotReload(null);
    expect(saveDataProvider.isLoaded()).toBe(false);
  });

  it("unload() resets", () => {
    saveDataProvider.loadRaw(validManifest);
    saveDataProvider.unload();
    expect(saveDataProvider.isLoaded()).toBe(false);
    expect(saveDataProvider.getSlices()).toEqual([]);
  });
});
