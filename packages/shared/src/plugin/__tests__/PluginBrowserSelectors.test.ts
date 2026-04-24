import { describe, expect, it } from "vitest";
import {
  initialPluginBrowserState,
  pluginBrowserReducer,
} from "../PluginBrowserReducer.js";
import type { PluginBrowserRowSummary } from "../PluginBrowserRowSummary.js";
import {
  selectChangelogSummary,
  selectChangelogView,
  selectHasStaleSelection,
  selectHasUnreadChangelog,
  selectRowArray,
  selectRowById,
  selectSelectedRow,
  selectSeverityCounts,
  selectToastSurfaceCount,
  selectUnreadChangelog,
  selectUnreadWorstSeverity,
  selectVisibleRows,
} from "../PluginBrowserSelectors.js";

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

function snap(...entries: Array<PluginBrowserRowSummary>) {
  return new Map(entries.map((r) => [r.pluginId, r]));
}

function stateAfter(...actions: Parameters<typeof pluginBrowserReducer>[1][]) {
  let s = initialPluginBrowserState();
  for (const a of actions) s = pluginBrowserReducer(s, a);
  return s;
}

describe("selectRowArray / selectRowById", () => {
  it("returns empty array for empty snapshot", () => {
    expect(selectRowArray(initialPluginBrowserState())).toEqual([]);
  });

  it("preserves Map insertion order", () => {
    const s = stateAfter({
      type: "snapshotRefreshed",
      snapshot: snap(row("a", "ok"), row("b", "warning"), row("c", "error")),
      now: 1000,
    });
    expect(selectRowArray(s).map((r) => r.pluginId)).toEqual(["a", "b", "c"]);
  });

  it("selectRowById returns null for unknown ids", () => {
    const s = initialPluginBrowserState();
    expect(selectRowById(s, "nope")).toBeNull();
  });

  it("selectRowById returns the row for known ids", () => {
    const s = stateAfter({
      type: "snapshotRefreshed",
      snapshot: snap(row("a", "warning")),
      now: 1000,
    });
    expect(selectRowById(s, "a")?.severity).toBe("warning");
  });
});

describe("selectSelectedRow / selectHasStaleSelection", () => {
  it("returns null when no selection is active", () => {
    const s = stateAfter({
      type: "snapshotRefreshed",
      snapshot: snap(row("a", "ok")),
      now: 1000,
    });
    expect(selectSelectedRow(s)).toBeNull();
    expect(selectHasStaleSelection(s)).toBe(false);
  });

  it("returns the selected row when present in snapshot", () => {
    const s = stateAfter(
      {
        type: "snapshotRefreshed",
        snapshot: snap(row("a", "warning")),
        now: 1000,
      },
      { type: "selectPlugin", pluginId: "a" },
    );
    expect(selectSelectedRow(s)?.pluginId).toBe("a");
    expect(selectHasStaleSelection(s)).toBe(false);
  });

  it("returns null and flags stale selection when id no longer exists", () => {
    const s = stateAfter(
      {
        type: "snapshotRefreshed",
        snapshot: snap(row("a", "ok")),
        now: 1000,
      },
      { type: "selectPlugin", pluginId: "a" },
      {
        type: "snapshotRefreshed",
        snapshot: snap(row("b", "ok")),
        now: 2000,
      },
    );
    expect(selectSelectedRow(s)).toBeNull();
    expect(selectHasStaleSelection(s)).toBe(true);
  });
});

describe("selectSeverityCounts", () => {
  it("returns all zeros for empty snapshot", () => {
    expect(selectSeverityCounts(initialPluginBrowserState())).toEqual({
      ok: 0,
      info: 0,
      warning: 0,
      error: 0,
      total: 0,
    });
  });

  it("counts each severity independently", () => {
    const s = stateAfter({
      type: "snapshotRefreshed",
      snapshot: snap(
        row("a", "ok"),
        row("b", "ok"),
        row("c", "info"),
        row("d", "warning"),
        row("e", "error"),
        row("f", "error"),
      ),
      now: 1000,
    });
    expect(selectSeverityCounts(s)).toEqual({
      ok: 2,
      info: 1,
      warning: 1,
      error: 2,
      total: 6,
    });
  });
});

describe("selectVisibleRows", () => {
  it("defaults to worst-first sort when no options given", () => {
    const s = stateAfter({
      type: "snapshotRefreshed",
      snapshot: snap(row("a", "ok"), row("b", "error"), row("c", "warning")),
      now: 1000,
    });
    const rows = selectVisibleRows(s);
    expect(rows.map((r) => r.pluginId)).toEqual(["b", "c", "a"]);
  });

  it("applies severity filter before sort", () => {
    const s = stateAfter({
      type: "snapshotRefreshed",
      snapshot: snap(
        row("a", "ok"),
        row("b", "error"),
        row("c", "warning"),
        row("d", "ok"),
      ),
      now: 1000,
    });
    const rows = selectVisibleRows(s, {
      severityFilter: { include: new Set(["warning", "error"]) },
    });
    expect(rows.map((r) => r.pluginId)).toEqual(["b", "c"]);
  });

  it("honors an explicit sort order over worst-first default", () => {
    const s = stateAfter({
      type: "snapshotRefreshed",
      snapshot: snap(row("zebra", "ok"), row("apple", "error")),
      now: 1000,
    });
    const rows = selectVisibleRows(s, {
      sort: { key: "pluginId", direction: "asc" },
    });
    expect(rows.map((r) => r.pluginId)).toEqual(["apple", "zebra"]);
  });
});

describe("selectUnreadChangelog / selectHasUnreadChangelog / selectUnreadWorstSeverity", () => {
  it("initially reports no unread", () => {
    const s = initialPluginBrowserState();
    expect(selectUnreadChangelog(s).unreadCount).toBe(0);
    expect(selectHasUnreadChangelog(s)).toBe(false);
    expect(selectUnreadWorstSeverity(s)).toBeNull();
  });

  it("tracks unread entries after a snapshot refresh", () => {
    const s = stateAfter({
      type: "snapshotRefreshed",
      snapshot: snap(row("a", "error")),
      now: 1000,
    });
    expect(selectHasUnreadChangelog(s)).toBe(true);
    expect(selectUnreadWorstSeverity(s)).toBe("error");
  });

  it("clears after markAllSeen", () => {
    const s = stateAfter(
      {
        type: "snapshotRefreshed",
        snapshot: snap(row("a", "error")),
        now: 1000,
      },
      { type: "markAllSeen" },
    );
    expect(selectHasUnreadChangelog(s)).toBe(false);
    expect(selectUnreadWorstSeverity(s)).toBeNull();
  });
});

describe("selectChangelogSummary / selectChangelogView", () => {
  it("summary reflects changelog accumulation", () => {
    const s = stateAfter(
      {
        type: "snapshotRefreshed",
        snapshot: snap(row("a", "ok")),
        now: 1000,
      },
      {
        type: "snapshotRefreshed",
        snapshot: snap(row("a", "error")),
        now: 2000,
      },
    );
    const summary = selectChangelogSummary(s);
    expect(summary.total).toBe(2);
    expect(summary.byKind.added).toBe(1);
    expect(summary.byKind.regressed).toBe(1);
  });

  it("changelog view groups by timestamp, newest-first by default", () => {
    const s = stateAfter(
      {
        type: "snapshotRefreshed",
        snapshot: snap(row("a", "ok")),
        now: 1000,
      },
      {
        type: "snapshotRefreshed",
        snapshot: snap(row("a", "error")),
        now: 2000,
      },
    );
    const view = selectChangelogView(s);
    expect(view.groups.length).toBeGreaterThan(0);
    // Newest-first means t=2000 before t=1000.
    expect(view.groups[0].timestamp).toBe(2000);
  });

  it("changelog view honors newestFirst=false", () => {
    const s = stateAfter(
      {
        type: "snapshotRefreshed",
        snapshot: snap(row("a", "ok")),
        now: 1000,
      },
      {
        type: "snapshotRefreshed",
        snapshot: snap(row("a", "error")),
        now: 2000,
      },
    );
    const view = selectChangelogView(s, { newestFirst: false });
    expect(view.groups[0].timestamp).toBe(1000);
  });
});

describe("selectToastSurfaceCount", () => {
  it("is zero in the empty initial state", () => {
    expect(selectToastSurfaceCount(initialPluginBrowserState())).toBe(0);
  });

  it("counts displays plus overflow hidden entries", () => {
    const s = stateAfter({
      type: "snapshotRefreshed",
      snapshot: snap(
        row("a", "error"),
        row("b", "warning"),
        row("c", "info"),
        row("d", "ok"),
      ),
      now: 1000,
      maxVisible: 2,
    });
    // 2 displays visible + overflow covers the rest of the intents.
    const total = selectToastSurfaceCount(s);
    expect(total).toBeGreaterThan(0);
    expect(total).toBeGreaterThanOrEqual(s.displays.length);
  });
});
