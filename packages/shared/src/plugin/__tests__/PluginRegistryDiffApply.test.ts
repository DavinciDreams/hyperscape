import {
  PluginManifestSchema,
  PluginRegistryManifestSchema,
} from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import { diffPluginRegistries } from "../PluginManifestDiff.js";
import { applyPluginRegistryDiff } from "../PluginRegistryDiffApply.js";

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

describe("applyPluginRegistryDiff — full apply (default selection)", () => {
  it("applies added → registry contains new plugin", () => {
    const current = registry([plugin("com.a")]);
    const next = registry([plugin("com.a"), plugin("com.b")]);
    const diff = diffPluginRegistries(current, next);
    const result = applyPluginRegistryDiff(current, next, diff);
    expect(result.plugins.map((p) => p.id).sort()).toEqual(["com.a", "com.b"]);
  });

  it("applies removed → registry drops plugin", () => {
    const current = registry([plugin("com.a"), plugin("com.b")]);
    const next = registry([plugin("com.a")]);
    const diff = diffPluginRegistries(current, next);
    const result = applyPluginRegistryDiff(current, next, diff);
    expect(result.plugins.map((p) => p.id)).toEqual(["com.a"]);
  });

  it("applies versionChanged → manifest replaced in place", () => {
    const current = registry([plugin("com.a", { version: "1.0.0" })]);
    const next = registry([plugin("com.a", { version: "2.0.0" })]);
    const diff = diffPluginRegistries(current, next);
    const result = applyPluginRegistryDiff(current, next, diff);
    expect(result.plugins[0].version).toBe("2.0.0");
  });

  it("applies metadataChanged → description updated", () => {
    const current = registry([plugin("com.a", { description: "old" })]);
    const next = registry([plugin("com.a", { description: "new" })]);
    const diff = diffPluginRegistries(current, next);
    const result = applyPluginRegistryDiff(current, next, diff);
    expect(result.plugins[0].description).toBe("new");
  });

  it("applies enabledByDefault add → override entry created", () => {
    const current = registry([plugin("com.a")]);
    const next = registry([plugin("com.a")], { "com.a": false });
    const diff = diffPluginRegistries(current, next);
    const result = applyPluginRegistryDiff(current, next, diff);
    expect(result.enabledByDefault).toEqual({ "com.a": false });
  });

  it("applies enabledByDefault remove → override cleared", () => {
    const current = registry([plugin("com.a")], { "com.a": false });
    const next = registry([plugin("com.a")]);
    const diff = diffPluginRegistries(current, next);
    const result = applyPluginRegistryDiff(current, next, diff);
    expect(result.enabledByDefault).toEqual({});
  });

  it("applies enabledByDefault flip", () => {
    const current = registry([plugin("com.a")], { "com.a": false });
    const next = registry([plugin("com.a")], { "com.a": true });
    const diff = diffPluginRegistries(current, next);
    const result = applyPluginRegistryDiff(current, next, diff);
    expect(result.enabledByDefault).toEqual({ "com.a": true });
  });

  it("applies a combined diff in one call", () => {
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
    const result = applyPluginRegistryDiff(current, next, diff);

    const ids = result.plugins.map((p) => p.id).sort();
    expect(ids).toEqual([
      "com.added",
      "com.metadata",
      "com.untouched",
      "com.versioned",
    ]);
    expect(result.plugins.find((p) => p.id === "com.versioned")?.version).toBe(
      "2.0.0",
    );
    expect(
      result.plugins.find((p) => p.id === "com.metadata")?.description,
    ).toBe("new");
    expect(result.enabledByDefault).toEqual({ "com.untouched": true });
  });

  it("idempotent: applying empty diff returns unchanged registry shape", () => {
    const current = registry([plugin("com.a")]);
    const diff = diffPluginRegistries(current, current);
    const result = applyPluginRegistryDiff(current, current, diff);
    expect(result.plugins.map((p) => p.id)).toEqual(["com.a"]);
    expect(result.enabledByDefault).toEqual({});
  });

  it("does not mutate input registry", () => {
    const current = registry([plugin("com.a")]);
    const next = registry([plugin("com.a"), plugin("com.b")]);
    const snapshot = JSON.stringify(current);
    const diff = diffPluginRegistries(current, next);
    applyPluginRegistryDiff(current, next, diff);
    expect(JSON.stringify(current)).toBe(snapshot);
  });
});

describe("applyPluginRegistryDiff — selection filtering", () => {
  it("skips bucket with empty Set", () => {
    const current = registry([plugin("com.a")]);
    const next = registry([plugin("com.a"), plugin("com.b")]);
    const diff = diffPluginRegistries(current, next);
    const result = applyPluginRegistryDiff(current, next, diff, {
      added: new Set<string>(),
    });
    expect(result.plugins.map((p) => p.id)).toEqual(["com.a"]);
  });

  it("includes only ids listed in the selection Set", () => {
    const current = registry([plugin("com.a")]);
    const next = registry([plugin("com.a"), plugin("com.b"), plugin("com.c")]);
    const diff = diffPluginRegistries(current, next);
    const result = applyPluginRegistryDiff(current, next, diff, {
      added: new Set(["com.b"]),
    });
    expect(result.plugins.map((p) => p.id).sort()).toEqual(["com.a", "com.b"]);
  });

  it("partial selection across buckets", () => {
    const current = registry(
      [
        plugin("com.x", { version: "1.0.0" }),
        plugin("com.y", { version: "1.0.0" }),
      ],
      { "com.x": false },
    );
    const next = registry(
      [
        plugin("com.x", { version: "2.0.0" }),
        plugin("com.y", { version: "2.0.0" }),
      ],
      { "com.x": true },
    );
    const diff = diffPluginRegistries(current, next);
    // Only apply version change for com.x and skip the override flip
    const result = applyPluginRegistryDiff(current, next, diff, {
      versionChanged: new Set(["com.x"]),
      enabledByDefaultChanged: new Set<string>(),
    });
    expect(result.plugins.find((p) => p.id === "com.x")?.version).toBe("2.0.0");
    expect(result.plugins.find((p) => p.id === "com.y")?.version).toBe("1.0.0");
    expect(result.enabledByDefault).toEqual({ "com.x": false });
  });
});

describe("applyPluginRegistryDiff — failure modes", () => {
  it("throws when versionChanged refers to plugin missing from next", () => {
    const current = registry([plugin("com.a", { version: "1.0.0" })]);
    const next = registry([plugin("com.a", { version: "2.0.0" })]);
    const diff = diffPluginRegistries(current, next);
    // Hand-craft a `next` that drops the plugin to break the lookup
    const brokenNext = { plugins: [], enabledByDefault: {} };
    expect(() => applyPluginRegistryDiff(current, brokenNext, diff)).toThrow(
      /has no manifest in 'next'/,
    );
  });
});

describe("applyPluginRegistryDiff — order of operations", () => {
  it("removes before adds (allows id-collision swap in single diff)", () => {
    // Same id in current as plugin "com.x" v1.0.0
    // and in next as plugin "com.x" v2.0.0 — actually that's
    // versionChanged. Real swap: current has com.old, next has
    // com.new. Just verify removed doesn't leave dangling refs.
    const current = registry([plugin("com.old")], { "com.old": false });
    const next = registry([plugin("com.new")]);
    const diff = diffPluginRegistries(current, next);
    const result = applyPluginRegistryDiff(current, next, diff);
    expect(result.plugins.map((p) => p.id)).toEqual(["com.new"]);
    // Override scrubbed when com.old was removed
    expect(result.enabledByDefault).toEqual({});
  });
});
