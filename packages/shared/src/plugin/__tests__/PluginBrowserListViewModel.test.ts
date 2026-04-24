import { describe, expect, it } from "vitest";
import {
  buildPluginBrowserListViewModel,
  type PluginBrowserListEntry,
} from "../PluginBrowserListViewModel.js";
import {
  initialPluginBrowserState,
  type PluginBrowserState,
} from "../PluginBrowserReducer.js";
import type {
  PluginBrowserRowSummary,
  PluginRowSummarySeverity,
} from "../PluginBrowserRowSummary.js";

function row(
  pluginId: string,
  severity: PluginRowSummarySeverity = "ok",
  label = severity,
  reasons: readonly string[] = [],
): PluginBrowserRowSummary {
  return {
    pluginId,
    severity,
    label,
    reasons,
    health: null,
    stability: null,
  };
}

function stateFromRows(
  rows: readonly PluginBrowserRowSummary[],
  selectedPluginId: string | null = null,
): PluginBrowserState {
  const base = initialPluginBrowserState();
  const snapshot = new Map<string, PluginBrowserRowSummary>();
  for (const r of rows) snapshot.set(r.pluginId, r);
  return { ...base, currentSnapshot: snapshot, selectedPluginId };
}

function ids(entries: readonly PluginBrowserListEntry[]): string[] {
  return entries.map((e) => e.row.pluginId);
}

describe("buildPluginBrowserListViewModel — empty", () => {
  it("returns empty entries and zero counts for an empty snapshot", () => {
    const vm = buildPluginBrowserListViewModel(initialPluginBrowserState());
    expect(vm.entries).toEqual([]);
    expect(vm.totalCount).toBe(0);
    expect(vm.visibleCount).toBe(0);
    expect(vm.hasSearchQuery).toBe(false);
    expect(vm.searchQuery).toBe("");
  });
});

describe("buildPluginBrowserListViewModel — pass-through", () => {
  it("preserves snapshot insertion order when no filter/search/sort", () => {
    const st = stateFromRows([row("c.one"), row("a.two"), row("b.three")]);
    const vm = buildPluginBrowserListViewModel(st);
    expect(ids(vm.entries)).toEqual(["c.one", "a.two", "b.three"]);
    expect(vm.totalCount).toBe(3);
    expect(vm.visibleCount).toBe(3);
  });

  it("every entry has score 0 when no query is in effect", () => {
    const st = stateFromRows([row("a"), row("b")]);
    const vm = buildPluginBrowserListViewModel(st);
    expect(vm.entries.every((e) => e.score === 0)).toBe(true);
  });
});

describe("buildPluginBrowserListViewModel — severity filter", () => {
  it("drops rows whose severity isn't in `include`", () => {
    const st = stateFromRows([
      row("a", "ok"),
      row("b", "warning"),
      row("c", "error"),
    ]);
    const vm = buildPluginBrowserListViewModel(st, {
      severityFilter: { include: new Set(["error"]) },
    });
    expect(ids(vm.entries)).toEqual(["c"]);
    expect(vm.totalCount).toBe(3);
    expect(vm.visibleCount).toBe(1);
  });

  it("drops rows whose severity is in `exclude`", () => {
    const st = stateFromRows([
      row("a", "ok"),
      row("b", "warning"),
      row("c", "error"),
    ]);
    const vm = buildPluginBrowserListViewModel(st, {
      severityFilter: { exclude: new Set(["ok"]) },
    });
    expect(ids(vm.entries)).toEqual(["b", "c"]);
  });

  it("returns empty entries when filter removes everything", () => {
    const st = stateFromRows([row("a", "ok"), row("b", "ok")]);
    const vm = buildPluginBrowserListViewModel(st, {
      severityFilter: { include: new Set(["error"]) },
    });
    expect(vm.entries).toEqual([]);
    expect(vm.totalCount).toBe(2);
    expect(vm.visibleCount).toBe(0);
  });
});

describe("buildPluginBrowserListViewModel — search query", () => {
  it("ranks exact id matches above substring matches", () => {
    const st = stateFromRows([row("com.foo.bar"), row("com.foo"), row("zzz")]);
    const vm = buildPluginBrowserListViewModel(st, {
      searchQuery: "com.foo",
    });
    // "com.foo" — exact = 100
    // "com.foo.bar" — starts-with = 75
    // "zzz" — no match (dropped)
    expect(ids(vm.entries)).toEqual(["com.foo", "com.foo.bar"]);
  });

  it("drops zero-score rows", () => {
    const st = stateFromRows([row("match.me"), row("other")]);
    const vm = buildPluginBrowserListViewModel(st, {
      searchQuery: "match",
    });
    expect(ids(vm.entries)).toEqual(["match.me"]);
    expect(vm.visibleCount).toBe(1);
  });

  it("populates per-entry scores", () => {
    const st = stateFromRows([row("com.alpha"), row("alpha")]);
    const vm = buildPluginBrowserListViewModel(st, {
      searchQuery: "alpha",
    });
    const alphaEntry = vm.entries.find((e) => e.row.pluginId === "alpha")!;
    const comAlphaEntry = vm.entries.find(
      (e) => e.row.pluginId === "com.alpha",
    )!;
    expect(alphaEntry.score).toBeGreaterThan(comAlphaEntry.score);
  });

  it("sets hasSearchQuery and normalizes whitespace", () => {
    const st = stateFromRows([row("a"), row("b")]);
    const vm = buildPluginBrowserListViewModel(st, {
      searchQuery: "  a  ",
    });
    expect(vm.hasSearchQuery).toBe(true);
    expect(vm.searchQuery).toBe("a");
  });

  it("treats pure whitespace as no query", () => {
    const st = stateFromRows([row("a"), row("b")]);
    const vm = buildPluginBrowserListViewModel(st, {
      searchQuery: "   ",
    });
    expect(vm.hasSearchQuery).toBe(false);
    expect(vm.searchQuery).toBe("");
    expect(ids(vm.entries)).toEqual(["a", "b"]);
  });
});

describe("buildPluginBrowserListViewModel — sort", () => {
  it("applies `sortOrder` when no search query is active", () => {
    const st = stateFromRows([
      row("a", "ok"),
      row("b", "error"),
      row("c", "warning"),
    ]);
    const vm = buildPluginBrowserListViewModel(st, {
      sortOrder: { key: "severity", direction: "desc" },
    });
    // desc = error → warning → ok
    expect(ids(vm.entries)).toEqual(["b", "c", "a"]);
  });

  it("sort order is ignored when a search query is active", () => {
    const st = stateFromRows([
      row("com.alpha", "ok"),
      row("com.bravo", "error"),
    ]);
    const vm = buildPluginBrowserListViewModel(st, {
      searchQuery: "com.bravo",
      sortOrder: { key: "severity", direction: "asc" },
    });
    // bravo is the exact-id match and ranks #1 despite asc severity.
    expect(ids(vm.entries)[0]).toBe("com.bravo");
  });

  it("sorts by pluginId ascending", () => {
    const st = stateFromRows([row("c"), row("a"), row("b")]);
    const vm = buildPluginBrowserListViewModel(st, {
      sortOrder: { key: "pluginId", direction: "asc" },
    });
    expect(ids(vm.entries)).toEqual(["a", "b", "c"]);
  });
});

describe("buildPluginBrowserListViewModel — filter + search compose", () => {
  it("applies severity filter before search", () => {
    const st = stateFromRows([
      row("alpha.keep", "error"),
      row("alpha.drop", "ok"),
    ]);
    const vm = buildPluginBrowserListViewModel(st, {
      searchQuery: "alpha",
      severityFilter: { include: new Set(["error"]) },
    });
    expect(ids(vm.entries)).toEqual(["alpha.keep"]);
  });
});

describe("buildPluginBrowserListViewModel — selection overlay", () => {
  it("flags the selected plugin id", () => {
    const st = stateFromRows([row("a"), row("b"), row("c")], "b");
    const vm = buildPluginBrowserListViewModel(st);
    const selected = vm.entries.filter((e) => e.isSelected);
    expect(selected).toHaveLength(1);
    expect(selected[0].row.pluginId).toBe("b");
  });

  it("no entry is selected when selectedPluginId is null", () => {
    const st = stateFromRows([row("a"), row("b")], null);
    const vm = buildPluginBrowserListViewModel(st);
    expect(vm.entries.every((e) => !e.isSelected)).toBe(true);
  });

  it("selection survives severity filtering when selected row passes", () => {
    const st = stateFromRows([row("a", "ok"), row("b", "error")], "b");
    const vm = buildPluginBrowserListViewModel(st, {
      severityFilter: { include: new Set(["error"]) },
    });
    expect(ids(vm.entries)).toEqual(["b"]);
    expect(vm.entries[0].isSelected).toBe(true);
  });

  it("selected row dropped by filter simply doesn't appear; no crash", () => {
    const st = stateFromRows([row("a", "ok"), row("b", "error")], "a");
    const vm = buildPluginBrowserListViewModel(st, {
      severityFilter: { include: new Set(["error"]) },
    });
    expect(ids(vm.entries)).toEqual(["b"]);
    expect(vm.entries[0].isSelected).toBe(false);
  });

  it("selection survives search filtering when selected row passes", () => {
    const st = stateFromRows([row("match"), row("other")], "match");
    const vm = buildPluginBrowserListViewModel(st, {
      searchQuery: "match",
    });
    expect(vm.entries[0].isSelected).toBe(true);
  });
});

describe("buildPluginBrowserListViewModel — determinism", () => {
  it("produces identical output for identical input", () => {
    const st = stateFromRows([
      row("a", "ok"),
      row("b", "warning"),
      row("c", "error"),
    ]);
    const a = buildPluginBrowserListViewModel(st, {
      sortOrder: { key: "severity", direction: "desc" },
    });
    const b = buildPluginBrowserListViewModel(st, {
      sortOrder: { key: "severity", direction: "desc" },
    });
    expect(ids(a.entries)).toEqual(ids(b.entries));
  });

  it("does not mutate the input state snapshot", () => {
    const rows = [row("b"), row("a")];
    const st = stateFromRows(rows);
    const snapshotOrderBefore = Array.from(st.currentSnapshot.keys());
    buildPluginBrowserListViewModel(st, {
      sortOrder: { key: "pluginId", direction: "asc" },
    });
    const snapshotOrderAfter = Array.from(st.currentSnapshot.keys());
    expect(snapshotOrderAfter).toEqual(snapshotOrderBefore);
  });
});

describe("buildPluginBrowserListViewModel — visibleCount invariant", () => {
  it("visibleCount always equals entries.length", () => {
    const st = stateFromRows([
      row("a", "ok"),
      row("b", "error"),
      row("c", "warning"),
    ]);
    const cases = [
      {},
      { searchQuery: "a" },
      {
        severityFilter: {
          include: new Set<PluginRowSummarySeverity>(["error"]),
        },
      },
      { sortOrder: { key: "pluginId" as const, direction: "asc" as const } },
    ];
    for (const opts of cases) {
      const vm = buildPluginBrowserListViewModel(st, opts);
      expect(vm.visibleCount).toBe(vm.entries.length);
    }
  });
});
