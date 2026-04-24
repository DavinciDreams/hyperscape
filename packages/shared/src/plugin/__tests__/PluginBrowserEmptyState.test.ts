import { describe, expect, it } from "vitest";
import {
  computePluginBrowserEmptyState,
  type PluginBrowserEmptyState,
} from "../PluginBrowserEmptyState.js";
import {
  buildPluginBrowserListViewModel,
  type PluginBrowserListViewModel,
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

function stateFromRows(
  rows: readonly PluginBrowserRowSummary[],
): PluginBrowserState {
  const base = initialPluginBrowserState();
  const snapshot = new Map<string, PluginBrowserRowSummary>();
  for (const r of rows) snapshot.set(r.pluginId, r);
  return { ...base, currentSnapshot: snapshot };
}

describe("computePluginBrowserEmptyState — non-empty list", () => {
  it("returns null when the view model has entries", () => {
    const st = stateFromRows([row("a"), row("b")]);
    const vm = buildPluginBrowserListViewModel(st);
    expect(computePluginBrowserEmptyState(vm)).toBeNull();
  });
});

describe("computePluginBrowserEmptyState — snapshotEmpty", () => {
  it("returns snapshotEmpty for a fresh install (no plugins at all)", () => {
    const vm = buildPluginBrowserListViewModel(initialPluginBrowserState());
    const state = computePluginBrowserEmptyState(vm);
    expect(state).not.toBeNull();
    expect(state!.kind).toBe("snapshotEmpty");
    expect(state!.hasSearchQuery).toBe(false);
    expect(state!.hasSeverityFilter).toBe(false);
    expect(state!.searchQuery).toBe("");
  });

  it("snapshotEmpty is terminal — ignores filter/query state", () => {
    const vm = buildPluginBrowserListViewModel(initialPluginBrowserState(), {
      searchQuery: "foo",
    });
    const state = computePluginBrowserEmptyState(vm, {
      include: new Set(["error"]),
    });
    expect(state!.kind).toBe("snapshotEmpty");
  });
});

describe("computePluginBrowserEmptyState — searchOnly", () => {
  it("returns searchOnly when query filters out everything and no severity filter", () => {
    const st = stateFromRows([row("alpha"), row("bravo")]);
    const vm = buildPluginBrowserListViewModel(st, {
      searchQuery: "zzz-no-match",
    });
    const state = computePluginBrowserEmptyState(vm);
    expect(state!.kind).toBe("searchOnly");
    expect(state!.hasSearchQuery).toBe(true);
    expect(state!.hasSeverityFilter).toBe(false);
    expect(state!.searchQuery).toBe("zzz-no-match");
  });
});

describe("computePluginBrowserEmptyState — severityOnly", () => {
  it("returns severityOnly when filter removes all and no query", () => {
    const st = stateFromRows([row("a", "ok"), row("b", "ok")]);
    const vm = buildPluginBrowserListViewModel(st, {
      severityFilter: { include: new Set(["error"]) },
    });
    const state = computePluginBrowserEmptyState(vm, {
      include: new Set(["error"]),
    });
    expect(state!.kind).toBe("severityOnly");
    expect(state!.hasSearchQuery).toBe(false);
    expect(state!.hasSeverityFilter).toBe(true);
    expect(state!.searchQuery).toBe("");
  });

  it("returns severityOnly when only `exclude` narrows and removes all", () => {
    const st = stateFromRows([row("a", "ok"), row("b", "ok")]);
    const vm = buildPluginBrowserListViewModel(st, {
      severityFilter: { exclude: new Set(["ok"]) },
    });
    const state = computePluginBrowserEmptyState(vm, {
      exclude: new Set(["ok"]),
    });
    expect(state!.kind).toBe("severityOnly");
    expect(state!.hasSeverityFilter).toBe(true);
  });
});

describe("computePluginBrowserEmptyState — searchAndSeverity", () => {
  it("returns searchAndSeverity when both axes are active", () => {
    const st = stateFromRows([row("alpha", "ok"), row("bravo", "error")]);
    const vm = buildPluginBrowserListViewModel(st, {
      searchQuery: "alpha",
      severityFilter: { include: new Set(["error"]) },
    });
    const state = computePluginBrowserEmptyState(vm, {
      include: new Set(["error"]),
    });
    expect(state!.kind).toBe("searchAndSeverity");
    expect(state!.hasSearchQuery).toBe(true);
    expect(state!.hasSeverityFilter).toBe(true);
    expect(state!.searchQuery).toBe("alpha");
  });
});

describe("computePluginBrowserEmptyState — filter detection", () => {
  it("treats undefined filter as inactive", () => {
    const st = stateFromRows([row("alpha")]);
    const vm = buildPluginBrowserListViewModel(st, {
      searchQuery: "no-match",
    });
    const state = computePluginBrowserEmptyState(vm, undefined);
    expect(state!.hasSeverityFilter).toBe(false);
    expect(state!.kind).toBe("searchOnly");
  });

  it("treats `{}` filter as inactive", () => {
    const st = stateFromRows([row("alpha")]);
    const vm = buildPluginBrowserListViewModel(st, {
      searchQuery: "no-match",
    });
    const state = computePluginBrowserEmptyState(vm, {});
    expect(state!.hasSeverityFilter).toBe(false);
    expect(state!.kind).toBe("searchOnly");
  });

  it("treats empty include/exclude sets as inactive", () => {
    const st = stateFromRows([row("alpha")]);
    const vm = buildPluginBrowserListViewModel(st, {
      searchQuery: "no-match",
    });
    const state = computePluginBrowserEmptyState(vm, {
      include: new Set<PluginRowSummarySeverity>(),
      exclude: new Set<PluginRowSummarySeverity>(),
    });
    expect(state!.hasSeverityFilter).toBe(false);
    expect(state!.kind).toBe("searchOnly");
  });
});

describe("computePluginBrowserEmptyState — determinism", () => {
  it("produces identical output for identical input", () => {
    const st = stateFromRows([row("alpha", "ok")]);
    const vm = buildPluginBrowserListViewModel(st, {
      searchQuery: "zz",
      severityFilter: { include: new Set(["error"]) },
    });
    const a = computePluginBrowserEmptyState(vm, {
      include: new Set(["error"]),
    });
    const b = computePluginBrowserEmptyState(vm, {
      include: new Set(["error"]),
    });
    expect(a).toEqual(b);
  });
});

describe("computePluginBrowserEmptyState — type narrowing", () => {
  it("exposes enough fields for exhaustive switch rendering", () => {
    const st = stateFromRows([row("alpha")]);
    const vm = buildPluginBrowserListViewModel(st, {
      searchQuery: "zzz",
    });
    const s: PluginBrowserEmptyState = computePluginBrowserEmptyState(vm)!;
    // Dummy rendering — compile-time check that the discriminated
    // union covers every case.
    const msg = (() => {
      switch (s.kind) {
        case "snapshotEmpty":
          return "none";
        case "searchOnly":
          return `q:${s.searchQuery}`;
        case "severityOnly":
          return "sev";
        case "searchAndSeverity":
          return `q+sev:${s.searchQuery}`;
      }
    })();
    expect(msg).toBe("q:zzz");
  });
});
