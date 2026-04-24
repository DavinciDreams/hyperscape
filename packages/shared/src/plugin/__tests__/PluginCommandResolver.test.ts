import { describe, expect, it } from "vitest";
import type { PluginBrowserRow } from "../PluginBrowserSnapshot.js";
import type { DisableImpactEntry } from "../PluginDependencyGraph.js";
import { resolvePluginCommand } from "../PluginCommandResolver.js";

function mkRow(partial: Partial<PluginBrowserRow>): PluginBrowserRow {
  return {
    id: "com.example",
    name: "Example",
    version: "1.0.0",
    description: "",
    author: "Acme",
    license: "MIT",
    state: "registered",
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
    ...partial,
  } as PluginBrowserRow;
}

const ROWS: readonly PluginBrowserRow[] = [
  mkRow({ id: "com.a", name: "A", state: "enabled" }),
  mkRow({ id: "com.b", name: "B", state: "disabled" }),
  mkRow({ id: "com.c", name: "C", state: "failed" }),
];

describe("resolvePluginCommand — list", () => {
  it("returns scored rows for bare list", () => {
    const out = resolvePluginCommand({ kind: "list" }, { rows: ROWS });
    expect(out.kind).toBe("list");
    if (out.kind !== "list") throw new Error();
    expect(out.rows.map((r) => r.row.id).sort()).toEqual([
      "com.a",
      "com.b",
      "com.c",
    ]);
  });

  it("applies state filter", () => {
    const out = resolvePluginCommand(
      { kind: "list", state: "enabled" },
      { rows: ROWS },
    );
    if (out.kind !== "list") throw new Error();
    expect(out.rows.map((r) => r.row.id)).toEqual(["com.a"]);
  });

  it("applies text filter", () => {
    const out = resolvePluginCommand(
      { kind: "list", filter: "com.a" },
      { rows: ROWS },
    );
    if (out.kind !== "list") throw new Error();
    expect(out.rows.map((r) => r.row.id)).toEqual(["com.a"]);
  });
});

describe("resolvePluginCommand — info", () => {
  it("returns the row when found", () => {
    const out = resolvePluginCommand(
      { kind: "info", pluginId: "com.a" },
      { rows: ROWS },
    );
    expect(out.kind).toBe("info");
    if (out.kind !== "info") throw new Error();
    expect(out.row.id).toBe("com.a");
  });

  it("returns unknown-plugin-id when not found", () => {
    const out = resolvePluginCommand(
      { kind: "info", pluginId: "com.missing" },
      { rows: ROWS },
    );
    expect(out).toEqual({ kind: "unknown-plugin-id", pluginId: "com.missing" });
  });
});

describe("resolvePluginCommand — enable", () => {
  it("returns pending-enable with noop=false for non-enabled row", () => {
    const out = resolvePluginCommand(
      { kind: "enable", pluginId: "com.b" },
      { rows: ROWS },
    );
    expect(out).toEqual({
      kind: "pending-enable",
      pluginId: "com.b",
      currentState: "disabled",
      noop: false,
    });
  });

  it("marks noop=true when already enabled", () => {
    const out = resolvePluginCommand(
      { kind: "enable", pluginId: "com.a" },
      { rows: ROWS },
    );
    if (out.kind !== "pending-enable") throw new Error();
    expect(out.noop).toBe(true);
  });

  it("returns unknown-plugin-id for missing row", () => {
    const out = resolvePluginCommand(
      { kind: "enable", pluginId: "com.missing" },
      { rows: ROWS },
    );
    expect(out.kind).toBe("unknown-plugin-id");
  });
});

describe("resolvePluginCommand — disable", () => {
  it("returns pending-disable with force carried through", () => {
    const out = resolvePluginCommand(
      { kind: "disable", pluginId: "com.a", force: true },
      { rows: ROWS },
    );
    if (out.kind !== "pending-disable") throw new Error();
    expect(out.force).toBe(true);
    expect(out.noop).toBe(false);
    expect(out.impact).toEqual([]);
  });

  it("returns impact when computeDisableImpact is provided", () => {
    const impact: DisableImpactEntry[] = [
      {
        pluginId: "com.dependent",
        via: ["com.a"],
        currentState: "enabled",
      },
    ];
    const out = resolvePluginCommand(
      { kind: "disable", pluginId: "com.a", force: false },
      {
        rows: ROWS,
        computeDisableImpact: (id) => (id === "com.a" ? impact : []),
      },
    );
    if (out.kind !== "pending-disable") throw new Error();
    expect(out.impact).toBe(impact);
  });

  it("marks noop=true when already off (disabled state)", () => {
    const out = resolvePluginCommand(
      { kind: "disable", pluginId: "com.b", force: false },
      { rows: ROWS },
    );
    if (out.kind !== "pending-disable") throw new Error();
    expect(out.noop).toBe(true);
  });

  it("marks noop=true when state is failed", () => {
    const out = resolvePluginCommand(
      { kind: "disable", pluginId: "com.c", force: false },
      { rows: ROWS },
    );
    if (out.kind !== "pending-disable") throw new Error();
    expect(out.noop).toBe(true);
  });
});

describe("resolvePluginCommand — reload", () => {
  it("returns pending-reload with currentState", () => {
    const out = resolvePluginCommand(
      { kind: "reload", pluginId: "com.a" },
      { rows: ROWS },
    );
    expect(out).toEqual({
      kind: "pending-reload",
      pluginId: "com.a",
      currentState: "enabled",
    });
  });

  it("returns unknown-plugin-id for missing row", () => {
    const out = resolvePluginCommand(
      { kind: "reload", pluginId: "com.missing" },
      { rows: ROWS },
    );
    expect(out.kind).toBe("unknown-plugin-id");
  });
});
