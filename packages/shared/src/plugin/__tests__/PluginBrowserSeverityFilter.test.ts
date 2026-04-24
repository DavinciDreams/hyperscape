import { describe, expect, it } from "vitest";
import type { PluginBrowserRowSummary } from "../PluginBrowserRowSummary.js";
import {
  filterBrokenRows,
  filterNeedsAttentionRows,
  filterPluginBrowserRowsBySeverity,
} from "../PluginBrowserSeverityFilter.js";

function row(
  pluginId: string,
  severity: PluginBrowserRowSummary["severity"],
): PluginBrowserRowSummary {
  return {
    pluginId,
    severity,
    label: severity,
    reasons: [],
    health: null,
    stability: null,
  };
}

function rows(...args: Array<[string, PluginBrowserRowSummary["severity"]]>) {
  return new Map(args.map(([id, sev]) => [id, row(id, sev)]));
}

describe("filterPluginBrowserRowsBySeverity", () => {
  it("returns the same map reference when no filter applied", () => {
    const input = rows(["a", "ok"], ["b", "warning"]);
    const out = filterPluginBrowserRowsBySeverity(input, {});
    expect(out).toBe(input);
  });

  it("returns the same map reference when filter sets are empty", () => {
    const input = rows(["a", "ok"]);
    const out = filterPluginBrowserRowsBySeverity(input, {
      include: new Set(),
      exclude: new Set(),
    });
    expect(out).toBe(input);
  });

  it("includes only requested severities", () => {
    const input = rows(
      ["a", "ok"],
      ["b", "info"],
      ["c", "warning"],
      ["d", "error"],
    );
    const out = filterPluginBrowserRowsBySeverity(input, {
      include: new Set(["warning", "error"]),
    });
    expect(Array.from(out.keys())).toEqual(["c", "d"]);
  });

  it("excludes specified severities", () => {
    const input = rows(["a", "ok"], ["b", "warning"], ["c", "error"]);
    const out = filterPluginBrowserRowsBySeverity(input, {
      exclude: new Set(["ok"]),
    });
    expect(Array.from(out.keys())).toEqual(["b", "c"]);
  });

  it("applies exclude after include (intersection minus exclude)", () => {
    const input = rows(["a", "warning"], ["b", "error"], ["c", "ok"]);
    const out = filterPluginBrowserRowsBySeverity(input, {
      include: new Set(["warning", "error"]),
      exclude: new Set(["error"]),
    });
    expect(Array.from(out.keys())).toEqual(["a"]);
  });

  it("preserves source map insertion order", () => {
    const input = rows(
      ["c", "error"],
      ["a", "error"],
      ["b", "ok"],
      ["d", "error"],
    );
    const out = filterPluginBrowserRowsBySeverity(input, {
      include: new Set(["error"]),
    });
    expect(Array.from(out.keys())).toEqual(["c", "a", "d"]);
  });

  it("returns empty map when nothing matches", () => {
    const input = rows(["a", "ok"], ["b", "info"]);
    const out = filterPluginBrowserRowsBySeverity(input, {
      include: new Set(["error"]),
    });
    expect(out.size).toBe(0);
  });
});

describe("filterBrokenRows", () => {
  it("returns only error-severity rows", () => {
    const input = rows(["a", "ok"], ["b", "warning"], ["c", "error"]);
    const out = filterBrokenRows(input);
    expect(Array.from(out.keys())).toEqual(["c"]);
  });
});

describe("filterNeedsAttentionRows", () => {
  it("returns warning + error rows", () => {
    const input = rows(
      ["a", "ok"],
      ["b", "info"],
      ["c", "warning"],
      ["d", "error"],
    );
    const out = filterNeedsAttentionRows(input);
    expect(Array.from(out.keys())).toEqual(["c", "d"]);
  });
});
