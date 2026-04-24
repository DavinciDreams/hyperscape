import {
  PluginManifestSchema,
  PluginRegistryManifestSchema,
} from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import {
  diffPluginRegistries,
  isPluginRegistryDiffEmpty,
} from "../PluginManifestDiff.js";

function plugin(id: string, overrides: Record<string, unknown> = {}) {
  return PluginManifestSchema.parse({
    id,
    name: id,
    version: "1.0.0",
    entry: "./dist/index.js",
    author: { name: "Author" },
    hyperforgeApi: "1.0.0",
    ...overrides,
  });
}

function registry(
  plugins: ReturnType<typeof plugin>[],
  enabledByDefault: Record<string, boolean> = {},
) {
  return PluginRegistryManifestSchema.parse({ plugins, enabledByDefault });
}

describe("diffPluginRegistries — added / removed", () => {
  it("identifies added plugins", () => {
    const current = registry([plugin("com.a")]);
    const next = registry([plugin("com.a"), plugin("com.b")]);
    const diff = diffPluginRegistries(current, next);
    expect(diff.added.map((p) => p.id)).toEqual(["com.b"]);
    expect(diff.removed).toEqual([]);
  });

  it("identifies removed plugins", () => {
    const current = registry([plugin("com.a"), plugin("com.b")]);
    const next = registry([plugin("com.a")]);
    const diff = diffPluginRegistries(current, next);
    expect(diff.removed.map((p) => p.id)).toEqual(["com.b"]);
    expect(diff.added).toEqual([]);
  });

  it("sorts added/removed by id ascending", () => {
    const current = registry([]);
    const next = registry([
      plugin("com.zebra"),
      plugin("com.alpha"),
      plugin("com.mango"),
    ]);
    const diff = diffPluginRegistries(current, next);
    expect(diff.added.map((p) => p.id)).toEqual([
      "com.alpha",
      "com.mango",
      "com.zebra",
    ]);
  });
});

describe("diffPluginRegistries — version change", () => {
  it("identifies version-changed plugins", () => {
    const current = registry([plugin("com.a", { version: "1.0.0" })]);
    const next = registry([plugin("com.a", { version: "2.0.0" })]);
    const diff = diffPluginRegistries(current, next);
    expect(diff.versionChanged).toEqual([
      {
        pluginId: "com.a",
        previousVersion: "1.0.0",
        nextVersion: "2.0.0",
      },
    ]);
    expect(diff.metadataChanged).toEqual([]);
  });

  it("does NOT flag metadata changes when version also changed", () => {
    const current = registry([
      plugin("com.a", { version: "1.0.0", description: "old" }),
    ]);
    const next = registry([
      plugin("com.a", { version: "2.0.0", description: "new" }),
    ]);
    const diff = diffPluginRegistries(current, next);
    expect(diff.versionChanged).toHaveLength(1);
    expect(diff.metadataChanged).toEqual([]);
  });
});

describe("diffPluginRegistries — metadata change", () => {
  it("flags description change at same version", () => {
    const current = registry([plugin("com.a", { description: "old" })]);
    const next = registry([plugin("com.a", { description: "new" })]);
    const diff = diffPluginRegistries(current, next);
    expect(diff.metadataChanged).toEqual([
      {
        pluginId: "com.a",
        version: "1.0.0",
        changedFields: ["description"],
      },
    ]);
  });

  it("flags multiple fields when several drift", () => {
    const current = registry([
      plugin("com.a", {
        description: "old",
        license: "MIT",
        tags: ["a"],
      }),
    ]);
    const next = registry([
      plugin("com.a", {
        description: "new",
        license: "Apache-2.0",
        tags: ["a", "b"],
      }),
    ]);
    const diff = diffPluginRegistries(current, next);
    expect(diff.metadataChanged).toHaveLength(1);
    expect(diff.metadataChanged[0].changedFields.sort()).toEqual([
      "description",
      "license",
      "tags",
    ]);
  });

  it("does not flag when manifest is identical", () => {
    const current = registry([plugin("com.a")]);
    const next = registry([plugin("com.a")]);
    const diff = diffPluginRegistries(current, next);
    expect(diff.metadataChanged).toEqual([]);
  });

  it("flags author drift", () => {
    const current = registry([plugin("com.a", { author: { name: "Alice" } })]);
    const next = registry([plugin("com.a", { author: { name: "Bob" } })]);
    const diff = diffPluginRegistries(current, next);
    expect(diff.metadataChanged[0].changedFields).toContain("author");
  });

  it("flags enabledByDefault authored-default change", () => {
    const current = registry([plugin("com.a", { enabledByDefault: true })]);
    const next = registry([plugin("com.a", { enabledByDefault: false })]);
    const diff = diffPluginRegistries(current, next);
    expect(diff.metadataChanged[0].changedFields).toContain("enabledByDefault");
  });
});

describe("diffPluginRegistries — enabledByDefault override changes", () => {
  it("flags override added", () => {
    const current = registry([plugin("com.a")]);
    const next = registry([plugin("com.a")], { "com.a": false });
    const diff = diffPluginRegistries(current, next);
    expect(diff.enabledByDefaultChanged).toEqual([
      { pluginId: "com.a", previous: null, next: false },
    ]);
  });

  it("flags override removed", () => {
    const current = registry([plugin("com.a")], { "com.a": false });
    const next = registry([plugin("com.a")]);
    const diff = diffPluginRegistries(current, next);
    expect(diff.enabledByDefaultChanged).toEqual([
      { pluginId: "com.a", previous: false, next: null },
    ]);
  });

  it("flags override flipped", () => {
    const current = registry([plugin("com.a")], { "com.a": true });
    const next = registry([plugin("com.a")], { "com.a": false });
    const diff = diffPluginRegistries(current, next);
    expect(diff.enabledByDefaultChanged).toEqual([
      { pluginId: "com.a", previous: true, next: false },
    ]);
  });

  it("does not flag when override unchanged", () => {
    const current = registry([plugin("com.a")], { "com.a": true });
    const next = registry([plugin("com.a")], { "com.a": true });
    const diff = diffPluginRegistries(current, next);
    expect(diff.enabledByDefaultChanged).toEqual([]);
  });

  it("sorts override changes by plugin id", () => {
    const current = registry([
      plugin("com.alpha"),
      plugin("com.beta"),
      plugin("com.zeta"),
    ]);
    const next = registry(
      [plugin("com.alpha"), plugin("com.beta"), plugin("com.zeta")],
      { "com.zeta": true, "com.alpha": false, "com.beta": true },
    );
    const diff = diffPluginRegistries(current, next);
    expect(diff.enabledByDefaultChanged.map((e) => e.pluginId)).toEqual([
      "com.alpha",
      "com.beta",
      "com.zeta",
    ]);
  });
});

describe("isPluginRegistryDiffEmpty", () => {
  it("returns true when all dimensions empty", () => {
    const same = registry([plugin("com.a")]);
    expect(isPluginRegistryDiffEmpty(diffPluginRegistries(same, same))).toBe(
      true,
    );
  });

  it("returns false when any dimension has changes", () => {
    const current = registry([plugin("com.a")]);
    const next = registry([plugin("com.a"), plugin("com.b")]);
    expect(isPluginRegistryDiffEmpty(diffPluginRegistries(current, next))).toBe(
      false,
    );
  });
});

describe("diffPluginRegistries — combined", () => {
  it("captures added + removed + versionChanged + metadataChanged in one diff", () => {
    const current = registry(
      [
        plugin("com.removed"),
        plugin("com.versioned", { version: "1.0.0" }),
        plugin("com.metadata", { description: "old" }),
        plugin("com.untouched"),
      ],
      { "com.untouched": false },
    );
    const next = registry(
      [
        plugin("com.added"),
        plugin("com.versioned", { version: "2.0.0" }),
        plugin("com.metadata", { description: "new" }),
        plugin("com.untouched"),
      ],
      { "com.untouched": true },
    );
    const diff = diffPluginRegistries(current, next);
    expect(diff.added.map((p) => p.id)).toEqual(["com.added"]);
    expect(diff.removed.map((p) => p.id)).toEqual(["com.removed"]);
    expect(diff.versionChanged.map((v) => v.pluginId)).toEqual([
      "com.versioned",
    ]);
    expect(diff.metadataChanged.map((m) => m.pluginId)).toEqual([
      "com.metadata",
    ]);
    expect(diff.enabledByDefaultChanged.map((e) => e.pluginId)).toEqual([
      "com.untouched",
    ]);
  });
});
