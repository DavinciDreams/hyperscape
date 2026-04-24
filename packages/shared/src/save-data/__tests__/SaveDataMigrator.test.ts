import {
  SaveDataManifestSchema,
  SaveSliceSchema,
} from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import {
  FutureSaveVersionError,
  NoMigrationPathError,
  SaveDataMigrator,
  SaveDataRegistry,
  UnknownMigratorError,
  UnknownSaveSliceError,
  applyFieldDefaults,
  collectMissingFields,
} from "../SaveDataMigrator.js";

function slice() {
  return SaveSliceSchema.parse({
    id: "banking",
    name: "Banking",
    scope: "character",
    version: 3,
    fields: [
      { name: "gold", kind: "uint", defaultValue: 0 },
      { name: "tabs", kind: "json", defaultValue: null },
      { name: "goldPouch", kind: "uint", required: false, defaultValue: 0 },
    ],
    migrations: [
      { from: 1, to: 2, migrator: "banking.addTabs" },
      { from: 2, to: 3, migrator: "banking.renameCoinsToGold" },
    ],
  });
}

function manifest() {
  return SaveDataManifestSchema.parse([
    slice(),
    SaveSliceSchema.parse({
      id: "cosmetics",
      name: "Cosmetics",
      scope: "account",
      version: 1,
      fields: [{ name: "unlocks", kind: "json", defaultValue: null }],
    }),
  ]);
}

describe("SaveDataRegistry", () => {
  it("indexes slices by id", () => {
    const reg = new SaveDataRegistry(manifest());
    expect(reg.size).toBe(2);
    expect(reg.has("banking")).toBe(true);
  });

  it("get throws UnknownSaveSliceError on miss", () => {
    const reg = new SaveDataRegistry(manifest());
    expect(() => reg.get("ghost")).toThrow(UnknownSaveSliceError);
  });

  it("loadFromJson validates before loading", () => {
    const reg = new SaveDataRegistry();
    reg.loadFromJson([
      {
        id: "minimal",
        name: "Minimal",
        scope: "character",
        fields: [{ name: "x", kind: "int" }],
      },
    ]);
    expect(reg.size).toBe(1);
  });

  it("load replaces prior state", () => {
    const reg = new SaveDataRegistry(manifest());
    reg.load(
      SaveDataManifestSchema.parse([
        {
          id: "only",
          name: "Only",
          scope: "world",
          fields: [{ name: "flag", kind: "bool" }],
        },
      ]),
    );
    expect(reg.size).toBe(1);
    expect(reg.has("banking")).toBe(false);
  });
});

describe("SaveDataMigrator — migrate", () => {
  it("no-op when row version equals slice version", () => {
    const reg = new SaveDataRegistry(manifest());
    const m = new SaveDataMigrator(reg);
    const out = m.migrate("banking", { version: 3, data: { gold: 500 } });
    expect(out).toEqual({ version: 3, data: { gold: 500 } });
  });

  it("returns a new object (does not mutate input)", () => {
    const reg = new SaveDataRegistry(manifest());
    const m = new SaveDataMigrator(reg);
    const input = { version: 3, data: { gold: 100 } };
    const out = m.migrate("banking", input);
    expect(out).not.toBe(input);
    expect(out.data).not.toBe(input.data);
  });

  it("applies a single-step migration", () => {
    const reg = new SaveDataRegistry(manifest());
    const m = new SaveDataMigrator(reg);
    m.register("banking.addTabs", (d) => ({ ...d, tabs: [] }));
    m.register("banking.renameCoinsToGold", (d) => {
      const { coins, ...rest } = d as { coins?: number };
      return { ...rest, gold: coins ?? 0 };
    });
    // Start at v2, should run the one remaining step
    const out = m.migrate("banking", {
      version: 2,
      data: { coins: 42, tabs: [] },
    });
    expect(out.version).toBe(3);
    expect(out.data.gold).toBe(42);
    expect(out.data.tabs).toEqual([]);
    expect((out.data as Record<string, unknown>).coins).toBeUndefined();
  });

  it("composes the full migration chain from v1", () => {
    const reg = new SaveDataRegistry(manifest());
    const m = new SaveDataMigrator(reg);
    m.register("banking.addTabs", (d) => ({ ...d, tabs: [] }));
    m.register("banking.renameCoinsToGold", (d) => {
      const { coins, ...rest } = d as { coins?: number };
      return { ...rest, gold: coins ?? 0 };
    });
    const out = m.migrate("banking", { version: 1, data: { coins: 999 } });
    expect(out.version).toBe(3);
    expect(out.data).toEqual({ gold: 999, tabs: [] });
  });

  it("throws UnknownMigratorError when a step's function isn't registered", () => {
    const reg = new SaveDataRegistry(manifest());
    const m = new SaveDataMigrator(reg);
    m.register("banking.addTabs", (d) => ({ ...d, tabs: [] }));
    // renameCoinsToGold is not registered
    expect(() =>
      m.migrate("banking", { version: 1, data: { coins: 10 } }),
    ).toThrow(UnknownMigratorError);
  });

  it("throws NoMigrationPathError when a step is missing from the manifest", () => {
    // Build a slice with a gap: v1 and v3 migrations, but no v2→v3 step
    // — schema requires every migration to step by exactly 1, but the
    // chain can still be incomplete between from=1 and version=4.
    const gapSlice = SaveSliceSchema.parse({
      id: "gap",
      name: "Gap",
      scope: "world",
      version: 4,
      fields: [{ name: "x", kind: "int" }],
      migrations: [
        { from: 1, to: 2, migrator: "fn1" },
        { from: 3, to: 4, migrator: "fn2" },
      ],
    });
    const reg = new SaveDataRegistry(SaveDataManifestSchema.parse([gapSlice]));
    const m = new SaveDataMigrator(reg);
    m.register("fn1", (d) => d);
    m.register("fn2", (d) => d);
    expect(() => m.migrate("gap", { version: 1, data: {} })).toThrow(
      NoMigrationPathError,
    );
  });

  it("throws FutureSaveVersionError when row ahead of current schema", () => {
    const reg = new SaveDataRegistry(manifest());
    const m = new SaveDataMigrator(reg);
    expect(() =>
      m.migrate("banking", { version: 5, data: { gold: 1 } }),
    ).toThrow(FutureSaveVersionError);
  });

  it("throws UnknownSaveSliceError on unknown slice id", () => {
    const reg = new SaveDataRegistry(manifest());
    const m = new SaveDataMigrator(reg);
    expect(() => m.migrate("ghost", { version: 1, data: {} })).toThrow(
      UnknownSaveSliceError,
    );
  });

  it("rejects non-integer or negative row versions", () => {
    const reg = new SaveDataRegistry(manifest());
    const m = new SaveDataMigrator(reg);
    expect(() => m.migrate("banking", { version: -1, data: {} })).toThrow(
      TypeError,
    );
    expect(() => m.migrate("banking", { version: 1.5, data: {} })).toThrow(
      TypeError,
    );
  });

  it("register/unregister/isRegistered manage the registry", () => {
    const m = new SaveDataMigrator();
    expect(m.isRegistered("x")).toBe(false);
    m.register("x", (d) => d);
    expect(m.isRegistered("x")).toBe(true);
    m.unregister("x");
    expect(m.isRegistered("x")).toBe(false);
  });

  it("re-register overwrites the previous function", () => {
    const reg = new SaveDataRegistry(manifest());
    const m = new SaveDataMigrator(reg);
    m.register("banking.addTabs", () => ({ legacy: true, tabs: [] }));
    m.register("banking.addTabs", () => ({ updated: true, tabs: ["default"] }));
    m.register("banking.renameCoinsToGold", (d) => ({ ...d, gold: 0 }));
    const out = m.migrate("banking", { version: 1, data: {} });
    expect(out.data.updated).toBe(true);
    expect(out.data.legacy).toBeUndefined();
  });
});

describe("applyFieldDefaults + collectMissingFields", () => {
  it("fills defaults for missing fields", () => {
    const out = applyFieldDefaults(slice(), { gold: 100 });
    expect(out).toEqual({ gold: 100, tabs: null, goldPouch: 0 });
  });

  it("leaves populated fields untouched", () => {
    const out = applyFieldDefaults(slice(), { gold: 5, tabs: [1, 2, 3] });
    expect(out.tabs).toEqual([1, 2, 3]);
  });

  it("leaves fields with no default untouched when missing", () => {
    const s = SaveSliceSchema.parse({
      id: "nodef",
      name: "NoDefault",
      scope: "character",
      fields: [{ name: "mustSet", kind: "string", required: true }],
    });
    const out = applyFieldDefaults(s, {});
    expect(out.mustSet).toBeUndefined();
  });

  it("collectMissingFields flags required-no-default gaps", () => {
    const s = SaveSliceSchema.parse({
      id: "flag",
      name: "Flag",
      scope: "character",
      fields: [
        { name: "id", kind: "string", required: true },
        { name: "level", kind: "uint", required: true, defaultValue: 1 },
        { name: "note", kind: "string", required: false },
      ],
    });
    const missing = collectMissingFields(s, {});
    expect(missing.map((f) => f.name)).toEqual(["id"]);
  });
});

describe("SaveDataMigrator — integration", () => {
  it("real-world: banking slice migrates v1→v3 end-to-end", () => {
    const reg = new SaveDataRegistry(manifest());
    const m = new SaveDataMigrator(reg);
    // Plugin registers its migrators at startup
    m.register("banking.addTabs", (d) => ({
      ...d,
      tabs: [{ id: "main", slots: [] }],
    }));
    m.register("banking.renameCoinsToGold", (d) => {
      const { coins, ...rest } = d as { coins?: number };
      return { ...rest, gold: coins ?? 0 };
    });
    // Old save row from the early days
    const legacy = { version: 1, data: { coins: 2500 } };
    // Migrate to current
    const migrated = m.migrate("banking", legacy);
    // Apply field defaults for anything still missing
    const normalized = applyFieldDefaults(reg.get("banking"), migrated.data);
    expect(migrated.version).toBe(3);
    expect(normalized).toEqual({
      gold: 2500,
      tabs: [{ id: "main", slots: [] }],
      goldPouch: 0,
    });
  });
});
