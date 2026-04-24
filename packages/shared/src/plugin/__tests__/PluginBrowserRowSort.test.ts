import { describe, expect, it } from "vitest";
import type { PluginBrowserRowSummary } from "../PluginBrowserRowSummary.js";
import {
  sortPluginBrowserRowSummaries,
  sortPluginBrowserRowSummariesByWorstFirst,
} from "../PluginBrowserRowSort.js";

function row(
  pluginId: string,
  severity: PluginBrowserRowSummary["severity"],
  label: string = severity,
): PluginBrowserRowSummary {
  return {
    pluginId,
    severity,
    label,
    reasons: [],
    health: null,
    stability: null,
  };
}

describe("sortPluginBrowserRowSummaries — severity", () => {
  it("descending puts broken first, ok last", () => {
    const out = sortPluginBrowserRowSummaries(
      [
        row("a", "ok"),
        row("b", "warning"),
        row("c", "error"),
        row("d", "info"),
      ],
      { key: "severity", direction: "desc" },
    );
    expect(out.map((r) => r.pluginId)).toEqual(["c", "b", "d", "a"]);
  });

  it("ascending puts ok first, broken last", () => {
    const out = sortPluginBrowserRowSummaries(
      [row("a", "error"), row("b", "ok"), row("c", "warning")],
      { key: "severity", direction: "asc" },
    );
    expect(out.map((r) => r.pluginId)).toEqual(["b", "c", "a"]);
  });

  it("preserves source order on ties", () => {
    const out = sortPluginBrowserRowSummaries(
      [row("c", "error"), row("a", "error"), row("b", "error")],
      { key: "severity", direction: "desc" },
    );
    expect(out.map((r) => r.pluginId)).toEqual(["c", "a", "b"]);
  });
});

describe("sortPluginBrowserRowSummaries — pluginId", () => {
  it("sorts ascending by id locale order", () => {
    const out = sortPluginBrowserRowSummaries(
      [row("c.x", "ok"), row("a.x", "ok"), row("b.x", "ok")],
      { key: "pluginId", direction: "asc" },
    );
    expect(out.map((r) => r.pluginId)).toEqual(["a.x", "b.x", "c.x"]);
  });

  it("sorts descending by id locale order", () => {
    const out = sortPluginBrowserRowSummaries(
      [row("a.x", "ok"), row("c.x", "ok"), row("b.x", "ok")],
      { key: "pluginId", direction: "desc" },
    );
    expect(out.map((r) => r.pluginId)).toEqual(["c.x", "b.x", "a.x"]);
  });
});

describe("sortPluginBrowserRowSummaries — label", () => {
  it("sorts by label string", () => {
    const out = sortPluginBrowserRowSummaries(
      [
        row("a", "ok", "broken"),
        row("b", "ok", "stable"),
        row("c", "ok", "flaky"),
      ],
      { key: "label", direction: "asc" },
    );
    expect(out.map((r) => r.label)).toEqual(["broken", "flaky", "stable"]);
  });
});

describe("sortPluginBrowserRowSummaries — purity", () => {
  it("does not mutate the input array", () => {
    const input = [row("c", "error"), row("a", "ok"), row("b", "warning")];
    const before = input.map((r) => r.pluginId);
    sortPluginBrowserRowSummaries(input, {
      key: "severity",
      direction: "desc",
    });
    expect(input.map((r) => r.pluginId)).toEqual(before);
  });
});

describe("sortPluginBrowserRowSummariesByWorstFirst", () => {
  it("matches severity-desc shape", () => {
    const rows = [row("a", "ok"), row("b", "warning"), row("c", "error")];
    const worstFirst = sortPluginBrowserRowSummariesByWorstFirst(rows);
    const explicit = sortPluginBrowserRowSummaries(rows, {
      key: "severity",
      direction: "desc",
    });
    expect(worstFirst.map((r) => r.pluginId)).toEqual(
      explicit.map((r) => r.pluginId),
    );
  });
});
