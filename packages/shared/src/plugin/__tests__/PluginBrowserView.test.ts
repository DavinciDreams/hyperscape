import { describe, expect, it } from "vitest";
import type { PluginBrowserRow } from "../PluginBrowserSnapshot.js";
import { buildPluginBrowserView } from "../PluginBrowserView.js";
import type { PluginLifecycleState } from "../PluginLoader.js";

function row(overrides: Partial<PluginBrowserRow> = {}): PluginBrowserRow {
  return {
    id: "com.example.plugin",
    name: "Example",
    version: "1.0.0",
    description: "",
    author: "Alice",
    license: "MIT",
    state: "enabled" as PluginLifecycleState,
    enabledByDefault: true,
    hasFactory: true,
    dependencyIds: [],
    tags: [],
    contributions: {
      systems: 0,
      entities: 0,
      widgets: 0,
      manifestSchemas: 0,
      paletteCategories: 0,
      toolbarTools: 0,
      commands: 0,
    },
    errorMessage: null,
    healthIssues: [],
    ...overrides,
  };
}

describe("buildPluginBrowserView — flat mode", () => {
  it("returns flat scored rows by default", () => {
    const rows = [row({ id: "com.a" }), row({ id: "com.b" })];
    const view = buildPluginBrowserView(rows);
    expect(view.kind).toBe("flat");
    if (view.kind !== "flat") throw new Error();
    expect(view.rows.map((s) => s.row.id)).toEqual(["com.a", "com.b"]);
  });

  it("applies filters before returning", () => {
    const rows = [
      row({ id: "com.a", state: "enabled" }),
      row({ id: "com.b", state: "failed" }),
    ];
    const view = buildPluginBrowserView(rows, {
      filters: { states: ["failed"] },
    });
    if (view.kind !== "flat") throw new Error();
    expect(view.rows.map((s) => s.row.id)).toEqual(["com.b"]);
  });

  it("orders by relevance score when query is non-empty", () => {
    const rows = [
      row({ id: "com.low-match", description: "mentions terrain" }),
      row({ id: "terrain", name: "Terrain" }),
    ];
    const view = buildPluginBrowserView(rows, {
      filters: { query: "terrain" },
    });
    if (view.kind !== "flat") throw new Error();
    expect(view.rows[0].row.id).toBe("terrain");
  });

  it("honors column-sort override even when query is set", () => {
    const rows = [
      row({ id: "com.a", name: "Zebra", description: "terrain" }),
      row({ id: "com.b", name: "Aardvark", description: "terrain" }),
    ];
    const view = buildPluginBrowserView(rows, {
      filters: { query: "terrain" },
      sort: { column: "name", direction: "asc" },
    });
    if (view.kind !== "flat") throw new Error();
    expect(view.rows.map((s) => s.row.name)).toEqual(["Aardvark", "Zebra"]);
  });

  it("preserves score + matchedField after sort override", () => {
    const rows = [
      row({ id: "terrain" }),
      row({ id: "com.other", description: "contains terrain word" }),
    ];
    const view = buildPluginBrowserView(rows, {
      filters: { query: "terrain" },
      sort: { column: "id", direction: "asc" },
    });
    if (view.kind !== "flat") throw new Error();
    const terrainRow = view.rows.find((s) => s.row.id === "terrain");
    expect(terrainRow?.matchedField).toBe("id");
    expect(terrainRow?.score).toBeGreaterThan(0);
  });
});

describe("buildPluginBrowserView — grouped mode", () => {
  it("groups by state with flatRows aligned to score order", () => {
    const rows = [
      row({ id: "com.a", state: "enabled" }),
      row({ id: "com.b", state: "failed" }),
      row({ id: "com.c", state: "enabled" }),
    ];
    const view = buildPluginBrowserView(rows, { groupMode: "state" });
    expect(view.kind).toBe("grouped");
    if (view.kind !== "grouped") throw new Error();
    expect(view.mode).toBe("state");
    expect(view.groups.map((g) => g.key).sort()).toEqual(["enabled", "failed"]);
    expect(view.flatRows).toHaveLength(3);
  });

  it("groups by author", () => {
    const rows = [
      row({ id: "com.a", author: "Alice" }),
      row({ id: "com.b", author: "Bob" }),
      row({ id: "com.c", author: "Alice" }),
    ];
    const view = buildPluginBrowserView(rows, { groupMode: "author" });
    if (view.kind !== "grouped") throw new Error();
    const alice = view.groups.find((g) => g.key === "Alice");
    const bob = view.groups.find((g) => g.key === "Bob");
    expect(alice?.rows.length).toBe(2);
    expect(bob?.rows.length).toBe(1);
  });

  it("groups by tag (rows with multiple tags appear in multiple buckets)", () => {
    const rows = [
      row({ id: "com.a", tags: ["terrain", "procgen"] }),
      row({ id: "com.b", tags: ["terrain"] }),
    ];
    const view = buildPluginBrowserView(rows, { groupMode: "tag" });
    if (view.kind !== "grouped") throw new Error();
    const terrain = view.groups.find((g) => g.key === "terrain");
    const procgen = view.groups.find((g) => g.key === "procgen");
    expect(terrain?.rows.map((r) => r.id)).toContain("com.a");
    expect(terrain?.rows.map((r) => r.id)).toContain("com.b");
    expect(procgen?.rows.map((r) => r.id)).toEqual(["com.a"]);
  });

  it("preserves sort-order within each group", () => {
    const rows = [
      row({ id: "com.z", author: "Alice" }),
      row({ id: "com.a", author: "Alice" }),
      row({ id: "com.m", author: "Alice" }),
    ];
    const view = buildPluginBrowserView(rows, {
      groupMode: "author",
      sort: { column: "id", direction: "desc" },
    });
    if (view.kind !== "grouped") throw new Error();
    const alice = view.groups.find((g) => g.key === "Alice");
    // desc id order: z, m, a
    expect(alice?.rows.map((r) => r.id)).toEqual(["com.z", "com.m", "com.a"]);
  });

  it("includeEmptyStateGroups passes through to state grouping", () => {
    const rows = [row({ id: "com.a", state: "enabled" })];
    const view = buildPluginBrowserView(rows, {
      groupMode: "state",
      includeEmptyStateGroups: true,
    });
    if (view.kind !== "grouped") throw new Error();
    // All 5 canonical states should be present
    expect(view.groups.length).toBe(5);
  });

  it("filters apply before grouping", () => {
    const rows = [
      row({ id: "com.a", state: "enabled" }),
      row({ id: "com.b", state: "failed" }),
    ];
    const view = buildPluginBrowserView(rows, {
      filters: { states: ["enabled"] },
      groupMode: "state",
    });
    if (view.kind !== "grouped") throw new Error();
    expect(view.groups.length).toBe(1);
    expect(view.groups[0].key).toBe("enabled");
  });
});

describe("buildPluginBrowserView — edge cases", () => {
  it("empty input yields empty flat view", () => {
    const view = buildPluginBrowserView([]);
    if (view.kind !== "flat") throw new Error();
    expect(view.rows).toEqual([]);
  });

  it("empty input yields empty grouped view", () => {
    const view = buildPluginBrowserView([], { groupMode: "author" });
    if (view.kind !== "grouped") throw new Error();
    expect(view.groups).toEqual([]);
    expect(view.flatRows).toEqual([]);
  });

  it("query filters everything out → empty flat", () => {
    const rows = [row({ id: "com.a" })];
    const view = buildPluginBrowserView(rows, {
      filters: { query: "nope-not-matching" },
    });
    if (view.kind !== "flat") throw new Error();
    expect(view.rows).toEqual([]);
  });
});
