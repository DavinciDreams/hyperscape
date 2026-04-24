import {
  PluginManifestSchema,
  PluginRegistryManifestSchema,
} from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import { diffPluginRegistries } from "../PluginManifestDiff.js";
import {
  countPluginRegistryDiffRows,
  summarizePluginRegistryDiff,
} from "../PluginRegistryDiffSummary.js";

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

describe("summarizePluginRegistryDiff — per-bucket rows", () => {
  it("emits an `added` row with version-aware summary", () => {
    const current = registry([]);
    const next = registry([plugin("com.a", { version: "1.2.3" })]);
    const diff = diffPluginRegistries(current, next);
    const rows = summarizePluginRegistryDiff(current, next, diff);
    expect(rows).toEqual([
      {
        kind: "added",
        pluginId: "com.a",
        displayName: "com.a",
        summary: "install at v1.2.3",
        severity: "safe",
      },
    ]);
  });

  it("emits a `removed` row sourced from `current`", () => {
    const current = registry([
      plugin("com.gone", { name: "Gone", version: "0.9.0" }),
    ]);
    const next = registry([]);
    const diff = diffPluginRegistries(current, next);
    const rows = summarizePluginRegistryDiff(current, next, diff);
    expect(rows[0]).toEqual({
      kind: "removed",
      pluginId: "com.gone",
      displayName: "Gone",
      summary: "uninstall (was v0.9.0)",
      severity: "breaking",
    });
  });

  it("emits a `versionChanged` row with v→v summary", () => {
    const current = registry([plugin("com.a", { version: "1.0.0" })]);
    const next = registry([plugin("com.a", { version: "2.0.0" })]);
    const diff = diffPluginRegistries(current, next);
    const rows = summarizePluginRegistryDiff(current, next, diff);
    expect(rows[0]).toEqual({
      kind: "versionChanged",
      pluginId: "com.a",
      displayName: "com.a",
      summary: "v1.0.0 → v2.0.0",
      severity: "breaking",
    });
  });

  it("emits a `metadataChanged` row listing changed fields", () => {
    const current = registry([plugin("com.a", { description: "old" })]);
    const next = registry([plugin("com.a", { description: "new" })]);
    const diff = diffPluginRegistries(current, next);
    const rows = summarizePluginRegistryDiff(current, next, diff);
    expect(rows[0]).toEqual({
      kind: "metadataChanged",
      pluginId: "com.a",
      displayName: "com.a",
      summary: "metadata drift: description",
      severity: "safe",
    });
  });

  it("emits enabledByDefault rows for add/remove/flip", () => {
    const current = registry(
      [plugin("com.a"), plugin("com.b"), plugin("com.c")],
      { "com.b": false, "com.c": true },
    );
    const next = registry([plugin("com.a"), plugin("com.b"), plugin("com.c")], {
      "com.a": true,
      "com.c": false,
    });
    const diff = diffPluginRegistries(current, next);
    const rows = summarizePluginRegistryDiff(current, next, diff);
    const overrideRows = rows.filter(
      (r) => r.kind === "enabledByDefaultChanged",
    );
    expect(overrideRows).toEqual([
      {
        kind: "enabledByDefaultChanged",
        pluginId: "com.a",
        displayName: "com.a",
        summary: "override: no override → enabled",
        severity: "safe",
      },
      {
        kind: "enabledByDefaultChanged",
        pluginId: "com.b",
        displayName: "com.b",
        summary: "override: disabled → no override",
        severity: "safe",
      },
      {
        kind: "enabledByDefaultChanged",
        pluginId: "com.c",
        displayName: "com.c",
        summary: "override: enabled → disabled",
        severity: "safe",
      },
    ]);
  });
});

describe("summarizePluginRegistryDiff — display name fallback", () => {
  it("uses plugin.name when present", () => {
    const current = registry([]);
    const next = registry([plugin("com.a", { name: "Alpha" })]);
    const diff = diffPluginRegistries(current, next);
    const rows = summarizePluginRegistryDiff(current, next, diff);
    expect(rows[0].displayName).toBe("Alpha");
  });

  it("falls back to id when name is the same as id", () => {
    const current = registry([]);
    const next = registry([plugin("com.solo")]);
    const diff = diffPluginRegistries(current, next);
    const rows = summarizePluginRegistryDiff(current, next, diff);
    expect(rows[0].displayName).toBe("com.solo");
  });

  it("uses `current` name for removed rows when `next` has none", () => {
    const current = registry([plugin("com.gone", { name: "Gone" })]);
    const next = registry([]);
    const diff = diffPluginRegistries(current, next);
    const rows = summarizePluginRegistryDiff(current, next, diff);
    expect(rows[0].displayName).toBe("Gone");
  });
});

describe("summarizePluginRegistryDiff — ordering", () => {
  it("sorts breaking rows ahead of safe rows, then id-asc", () => {
    const current = registry([
      plugin("com.zebra", { version: "1.0.0" }),
      plugin("com.alpha", { version: "1.0.0" }),
      plugin("com.will-go"),
    ]);
    const next = registry([
      plugin("com.zebra", { version: "1.0.0" }), // unchanged
      plugin("com.alpha", { version: "2.0.0" }), // versionChanged (breaking)
      plugin("com.added"), // added (safe)
    ]);
    const diff = diffPluginRegistries(current, next);
    const rows = summarizePluginRegistryDiff(current, next, diff);
    expect(rows.map((r) => `${r.severity}:${r.pluginId}`)).toEqual([
      "breaking:com.alpha",
      "breaking:com.will-go",
      "safe:com.added",
    ]);
  });
});

describe("summarizePluginRegistryDiff — combined", () => {
  it("captures every bucket in one summary", () => {
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
    const rows = summarizePluginRegistryDiff(current, next, diff);
    expect(rows.map((r) => `${r.kind}:${r.pluginId}`)).toEqual([
      "removed:com.removed",
      "versionChanged:com.versioned",
      "added:com.added",
      "metadataChanged:com.metadata",
      "enabledByDefaultChanged:com.untouched",
    ]);
  });

  it("returns empty array for empty diff", () => {
    const current = registry([plugin("com.a")]);
    const diff = diffPluginRegistries(current, current);
    expect(summarizePluginRegistryDiff(current, current, diff)).toEqual([]);
  });
});

describe("countPluginRegistryDiffRows", () => {
  it("counts total + per-severity + per-kind", () => {
    const current = registry([
      plugin("com.removed"),
      plugin("com.versioned", { version: "1.0.0" }),
      plugin("com.metadata", { description: "old" }),
    ]);
    const next = registry([
      plugin("com.added"),
      plugin("com.versioned", { version: "2.0.0" }),
      plugin("com.metadata", { description: "new" }),
    ]);
    const diff = diffPluginRegistries(current, next);
    const rows = summarizePluginRegistryDiff(current, next, diff);
    const counts = countPluginRegistryDiffRows(rows);
    expect(counts).toEqual({
      total: 4,
      breaking: 2, // removed + versionChanged
      safe: 2, // added + metadataChanged
      byKind: {
        added: 1,
        removed: 1,
        versionChanged: 1,
        metadataChanged: 1,
        enabledByDefaultChanged: 0,
      },
    });
  });

  it("returns zero counts for empty rows", () => {
    expect(countPluginRegistryDiffRows([])).toEqual({
      total: 0,
      breaking: 0,
      safe: 0,
      byKind: {
        added: 0,
        removed: 0,
        versionChanged: 0,
        metadataChanged: 0,
        enabledByDefaultChanged: 0,
      },
    });
  });
});
