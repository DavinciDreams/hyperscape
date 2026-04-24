import { describe, expect, it } from "vitest";
import {
  createPluginBrowserColumnSearch,
  type PluginBrowserColumnSearchDefinition,
} from "../PluginBrowserColumnSearch.js";

const COLUMNS: readonly PluginBrowserColumnSearchDefinition[] = [
  { id: "pluginId" },
  { id: "severity", defaultQuery: "error" },
  { id: "label" },
  { id: "reasons" },
];

describe("createPluginBrowserColumnSearch — initial state", () => {
  it("records every column and exposes size", () => {
    const s = createPluginBrowserColumnSearch(COLUMNS);
    expect(s.size()).toBe(4);
    for (const c of COLUMNS) expect(s.hasColumn(c.id)).toBe(true);
  });

  it("applies defaultQuery", () => {
    const s = createPluginBrowserColumnSearch(COLUMNS);
    expect(s.searchOf("severity")).toBe("error");
    expect(s.searchOf("pluginId")).toBe("");
  });

  it("searchOf unknown id returns ''", () => {
    const s = createPluginBrowserColumnSearch(COLUMNS);
    expect(s.searchOf("zzz")).toBe("");
  });

  it("hasActiveSearch is true for populated defaults only", () => {
    const s = createPluginBrowserColumnSearch(COLUMNS);
    expect(s.hasActiveSearch("severity")).toBe(true);
    expect(s.hasActiveSearch("pluginId")).toBe(false);
    expect(s.hasActiveSearch("zzz")).toBe(false);
  });

  it("trims whitespace-only defaultQuery to ''", () => {
    const s = createPluginBrowserColumnSearch([
      { id: "a", defaultQuery: "   " },
    ]);
    expect(s.searchOf("a")).toBe("");
    expect(s.hasActiveSearch("a")).toBe(false);
  });

  it("trims padded defaultQuery", () => {
    const s = createPluginBrowserColumnSearch([
      { id: "a", defaultQuery: "  foo  " },
    ]);
    expect(s.searchOf("a")).toBe("foo");
  });
});

describe("createPluginBrowserColumnSearch — setSearch", () => {
  it("sets a non-empty query", () => {
    const s = createPluginBrowserColumnSearch(COLUMNS);
    s.setSearch("pluginId", "com.acme.");
    expect(s.searchOf("pluginId")).toBe("com.acme.");
    expect(s.hasActiveSearch("pluginId")).toBe(true);
  });

  it("trims the query", () => {
    const s = createPluginBrowserColumnSearch(COLUMNS);
    s.setSearch("pluginId", "   com.acme.   ");
    expect(s.searchOf("pluginId")).toBe("com.acme.");
  });

  it("treats whitespace-only as cleared", () => {
    const s = createPluginBrowserColumnSearch(COLUMNS);
    s.setSearch("severity", "   ");
    expect(s.searchOf("severity")).toBe("");
    expect(s.hasActiveSearch("severity")).toBe(false);
  });

  it("silently ignores unknown ids", () => {
    const s = createPluginBrowserColumnSearch(COLUMNS);
    expect(() => s.setSearch("zzz", "foo")).not.toThrow();
    expect(s.hasColumn("zzz")).toBe(false);
  });

  it("silently ignores non-string values", () => {
    const s = createPluginBrowserColumnSearch(COLUMNS);
    const before = s.searchOf("severity");
    s.setSearch("severity", 42 as unknown as string);
    s.setSearch("severity", null as unknown as string);
    s.setSearch("severity", undefined as unknown as string);
    expect(s.searchOf("severity")).toBe(before);
  });
});

describe("createPluginBrowserColumnSearch — clear", () => {
  it("clearSearch removes a query", () => {
    const s = createPluginBrowserColumnSearch(COLUMNS);
    s.clearSearch("severity");
    expect(s.searchOf("severity")).toBe("");
  });

  it("clearSearch unknown id is a silent no-op", () => {
    const s = createPluginBrowserColumnSearch(COLUMNS);
    expect(() => s.clearSearch("zzz")).not.toThrow();
  });

  it("clearAll removes every query", () => {
    const s = createPluginBrowserColumnSearch(COLUMNS);
    s.setSearch("pluginId", "foo");
    s.setSearch("label", "bar");
    s.clearAll();
    expect(s.isActive()).toBe(false);
    expect(s.activeCount()).toBe(0);
    expect(s.searchOf("severity")).toBe("");
  });
});

describe("createPluginBrowserColumnSearch — activeColumns / activeCount", () => {
  it("activeColumns lists only non-empty in authored order", () => {
    const s = createPluginBrowserColumnSearch(COLUMNS);
    s.setSearch("reasons", "ping");
    s.setSearch("pluginId", "acme");
    // authored: pluginId, severity, label, reasons
    // severity has defaultQuery "error" — still active
    expect(s.activeColumns()).toEqual(["pluginId", "severity", "reasons"]);
  });

  it("activeCount matches activeColumns length", () => {
    const s = createPluginBrowserColumnSearch(COLUMNS);
    s.setSearch("reasons", "ping");
    expect(s.activeCount()).toBe(s.activeColumns().length);
  });

  it("isActive is true when at least one column has a query", () => {
    const s = createPluginBrowserColumnSearch(COLUMNS);
    expect(s.isActive()).toBe(true); // severity has default
    s.clearAll();
    expect(s.isActive()).toBe(false);
    s.setSearch("label", "foo");
    expect(s.isActive()).toBe(true);
  });
});

describe("createPluginBrowserColumnSearch — snapshot", () => {
  it("snapshot order matches authored order", () => {
    const s = createPluginBrowserColumnSearch(COLUMNS);
    expect(s.snapshot().map((e) => e.id)).toEqual([
      "pluginId",
      "severity",
      "label",
      "reasons",
    ]);
  });

  it("snapshot includes inactive columns", () => {
    const s = createPluginBrowserColumnSearch(COLUMNS);
    s.clearAll();
    const snap = s.snapshot();
    expect(snap.length).toBe(4);
    expect(snap.every((e) => e.isActive === false)).toBe(true);
  });

  it("isActive in snapshot tracks runtime state", () => {
    const s = createPluginBrowserColumnSearch(COLUMNS);
    s.clearAll();
    s.setSearch("label", "foo");
    const snap = s.snapshot().find((e) => e.id === "label")!;
    expect(snap.isActive).toBe(true);
    expect(snap.query).toBe("foo");
  });
});

describe("createPluginBrowserColumnSearch — dedup", () => {
  it("dedupes duplicate ids (first wins)", () => {
    const s = createPluginBrowserColumnSearch([
      { id: "a", defaultQuery: "foo" },
      { id: "b" },
      { id: "a", defaultQuery: "bar" },
    ]);
    expect(s.size()).toBe(2);
    expect(s.searchOf("a")).toBe("foo");
  });
});
