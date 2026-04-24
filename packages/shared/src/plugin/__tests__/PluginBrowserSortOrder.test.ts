import { describe, expect, it } from "vitest";
import type { PluginBrowserRow } from "../PluginBrowserSnapshot.js";
import {
  buildPluginBrowserComparator,
  sortPluginBrowserRows,
} from "../PluginBrowserSortOrder.js";
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

describe("sortPluginBrowserRows — string columns", () => {
  it("sorts by id asc", () => {
    const rows = [
      row({ id: "com.c" }),
      row({ id: "com.a" }),
      row({ id: "com.b" }),
    ];
    const result = sortPluginBrowserRows(rows, {
      column: "id",
      direction: "asc",
    });
    expect(result.map((r) => r.id)).toEqual(["com.a", "com.b", "com.c"]);
  });

  it("sorts by name desc", () => {
    const rows = [
      row({ id: "com.a", name: "Alpha" }),
      row({ id: "com.b", name: "Charlie" }),
      row({ id: "com.c", name: "Bravo" }),
    ];
    const result = sortPluginBrowserRows(rows, {
      column: "name",
      direction: "desc",
    });
    expect(result.map((r) => r.name)).toEqual(["Charlie", "Bravo", "Alpha"]);
  });

  it("sorts case-insensitively", () => {
    const rows = [
      row({ id: "com.a", author: "bob" }),
      row({ id: "com.b", author: "Alice" }),
      row({ id: "com.c", author: "charlie" }),
    ];
    const result = sortPluginBrowserRows(rows, {
      column: "author",
      direction: "asc",
    });
    expect(result.map((r) => r.author)).toEqual(["Alice", "bob", "charlie"]);
  });
});

describe("sortPluginBrowserRows — state severity", () => {
  it("sorts by state with failed first on asc", () => {
    const states: PluginLifecycleState[] = [
      "registered",
      "loaded",
      "disabled",
      "enabled",
      "failed",
    ];
    const rows = states.map((s, i) => row({ id: `com.p${i}`, state: s }));
    const result = sortPluginBrowserRows(rows, {
      column: "state",
      direction: "asc",
    });
    expect(result.map((r) => r.state)).toEqual([
      "failed",
      "enabled",
      "disabled",
      "loaded",
      "registered",
    ]);
  });

  it("reverses state order on desc", () => {
    const rows = [
      row({ id: "com.a", state: "failed" }),
      row({ id: "com.b", state: "enabled" }),
      row({ id: "com.c", state: "registered" }),
    ];
    const result = sortPluginBrowserRows(rows, {
      column: "state",
      direction: "desc",
    });
    expect(result.map((r) => r.state)).toEqual([
      "registered",
      "enabled",
      "failed",
    ]);
  });
});

describe("sortPluginBrowserRows — numeric columns", () => {
  it("sorts by dependencyCount asc", () => {
    const rows = [
      row({ id: "com.a", dependencyIds: ["x", "y", "z"] }),
      row({ id: "com.b", dependencyIds: [] }),
      row({ id: "com.c", dependencyIds: ["x"] }),
    ];
    const result = sortPluginBrowserRows(rows, {
      column: "dependencyCount",
      direction: "asc",
    });
    expect(result.map((r) => r.id)).toEqual(["com.b", "com.c", "com.a"]);
  });

  it("sorts by contributionCount sum", () => {
    const rows = [
      row({
        id: "com.heavy",
        contributions: {
          systems: 3,
          entities: 2,
          widgets: 1,
          manifestSchemas: 0,
          paletteCategories: 0,
          toolbarTools: 0,
          commands: 0,
        },
      }),
      row({
        id: "com.light",
        contributions: {
          systems: 1,
          entities: 0,
          widgets: 0,
          manifestSchemas: 0,
          paletteCategories: 0,
          toolbarTools: 0,
          commands: 0,
        },
      }),
    ];
    const result = sortPluginBrowserRows(rows, {
      column: "contributionCount",
      direction: "desc",
    });
    expect(result.map((r) => r.id)).toEqual(["com.heavy", "com.light"]);
  });

  it("sorts by healthIssueCount asc", () => {
    const rows = [
      row({
        id: "com.a",
        healthIssues: [
          { kind: "missing-factory", pluginId: "com.a" },
          { kind: "missing-factory", pluginId: "com.a" },
        ],
      }),
      row({ id: "com.b" }),
    ];
    const result = sortPluginBrowserRows(rows, {
      column: "healthIssueCount",
      direction: "asc",
    });
    expect(result.map((r) => r.id)).toEqual(["com.b", "com.a"]);
  });
});

describe("sortPluginBrowserRows — boolean columns", () => {
  it("sorts by enabledByDefault — true first on asc", () => {
    const rows = [
      row({ id: "com.off", enabledByDefault: false }),
      row({ id: "com.on", enabledByDefault: true }),
    ];
    const result = sortPluginBrowserRows(rows, {
      column: "enabledByDefault",
      direction: "asc",
    });
    expect(result.map((r) => r.id)).toEqual(["com.on", "com.off"]);
  });
});

describe("sortPluginBrowserRows — nullable columns", () => {
  it("errorMessage: non-null rows come first on asc", () => {
    const rows = [
      row({ id: "com.ok", errorMessage: null }),
      row({ id: "com.broken", errorMessage: "boom" }),
      row({ id: "com.also-ok", errorMessage: null }),
    ];
    const result = sortPluginBrowserRows(rows, {
      column: "errorMessage",
      direction: "asc",
    });
    expect(result[0].id).toBe("com.broken");
  });

  it("errorMessage desc: null rows come first", () => {
    const rows = [
      row({ id: "com.broken", errorMessage: "boom" }),
      row({ id: "com.ok", errorMessage: null }),
    ];
    const result = sortPluginBrowserRows(rows, {
      column: "errorMessage",
      direction: "desc",
    });
    expect(result[0].id).toBe("com.ok");
  });
});

describe("sortPluginBrowserRows — tie-break", () => {
  it("ties fall back to id asc regardless of direction", () => {
    const rows = [
      row({ id: "com.z", state: "enabled" }),
      row({ id: "com.a", state: "enabled" }),
      row({ id: "com.m", state: "enabled" }),
    ];
    const asc = sortPluginBrowserRows(rows, {
      column: "state",
      direction: "asc",
    });
    expect(asc.map((r) => r.id)).toEqual(["com.a", "com.m", "com.z"]);
    const desc = sortPluginBrowserRows(rows, {
      column: "state",
      direction: "desc",
    });
    // All ties on state → tie-break on id asc
    expect(desc.map((r) => r.id)).toEqual(["com.a", "com.m", "com.z"]);
  });

  it("does not mutate input array", () => {
    const rows = [row({ id: "com.b" }), row({ id: "com.a" })];
    const snapshot = rows.map((r) => r.id);
    sortPluginBrowserRows(rows, { column: "id", direction: "asc" });
    expect(rows.map((r) => r.id)).toEqual(snapshot);
  });
});

describe("buildPluginBrowserComparator", () => {
  it("returns a comparator usable directly with Array.prototype.sort", () => {
    const cmp = buildPluginBrowserComparator({
      column: "id",
      direction: "asc",
    });
    const rows = [row({ id: "com.b" }), row({ id: "com.a" })];
    rows.sort(cmp);
    expect(rows.map((r) => r.id)).toEqual(["com.a", "com.b"]);
  });
});
