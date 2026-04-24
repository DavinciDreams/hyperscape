import { describe, expect, it } from "vitest";
import {
  initialPluginBrowserState,
  pluginBrowserReducer,
} from "../PluginBrowserReducer.js";
import type { PluginBrowserRowSummary } from "../PluginBrowserRowSummary.js";

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

describe("initialPluginBrowserState", () => {
  it("is empty across all fields", () => {
    const s = initialPluginBrowserState();
    expect(s.currentSnapshot.size).toBe(0);
    expect(s.displays).toEqual([]);
    expect(s.overflow).toBeNull();
    expect(s.changelog.entries).toEqual([]);
    expect(s.cursor.lastSeenTimestamp).toBeNull();
    expect(s.selectedPluginId).toBeNull();
  });
});

describe("snapshotRefreshed — basic", () => {
  it("installs the snapshot", () => {
    const s1 = pluginBrowserReducer(initialPluginBrowserState(), {
      type: "snapshotRefreshed",
      snapshot: snap(row("com.a", "ok")),
      now: 1000,
    });
    expect(s1.currentSnapshot.size).toBe(1);
    expect(s1.currentSnapshot.get("com.a")?.severity).toBe("ok");
  });

  it("appends intents to the changelog on severity regression", () => {
    let s = initialPluginBrowserState();
    s = pluginBrowserReducer(s, {
      type: "snapshotRefreshed",
      snapshot: snap(row("com.a", "ok")),
      now: 1000,
    });
    // First refresh from empty → {a} adds one "added" intent.
    expect(s.changelog.entries).toHaveLength(1);
    expect(s.changelog.entries[0].intent.kind).toBe("added");

    s = pluginBrowserReducer(s, {
      type: "snapshotRefreshed",
      snapshot: snap(row("com.a", "error")),
      now: 2000,
    });
    // Second refresh adds one "regressed" on top.
    expect(s.changelog.entries).toHaveLength(2);
    expect(s.changelog.entries[1].intent.kind).toBe("regressed");
    expect(s.changelog.entries[1].timestamp).toBe(2000);
  });

  it("surfaces displays and overflow on a single refresh", () => {
    const s = pluginBrowserReducer(initialPluginBrowserState(), {
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
    expect(s.displays).toHaveLength(2);
    expect(s.overflow).not.toBeNull();
  });

  it("threads suppression forward — second identical refresh yields no displays", () => {
    let s = initialPluginBrowserState();
    s = pluginBrowserReducer(s, {
      type: "snapshotRefreshed",
      snapshot: snap(row("com.a", "ok")),
      now: 1000,
    });
    s = pluginBrowserReducer(s, {
      type: "snapshotRefreshed",
      snapshot: snap(row("com.a", "error")),
      now: 2000,
    });
    const first = s.displays;
    expect(first).toHaveLength(1);
    // Repeat same refresh → suppression silences it.
    s = pluginBrowserReducer(s, {
      type: "snapshotRefreshed",
      snapshot: snap(row("com.a", "error")),
      now: 3000,
    });
    expect(s.displays).toEqual([]);
  });

  it("records added and removed entries in the changelog", () => {
    let s = initialPluginBrowserState();
    s = pluginBrowserReducer(s, {
      type: "snapshotRefreshed",
      snapshot: snap(row("a", "ok")),
      now: 1000,
    });
    // First refresh: one "added" for a.
    s = pluginBrowserReducer(s, {
      type: "snapshotRefreshed",
      snapshot: snap(row("b", "ok")),
      now: 2000,
    });
    // Second refresh: a removed, b added → total 3 entries.
    const kinds = s.changelog.entries.map((e) => e.intent.kind);
    expect(kinds.sort()).toEqual(["added", "added", "removed"]);
  });
});

describe("markAllSeen", () => {
  it("advances cursor to newest entry", () => {
    let s = initialPluginBrowserState();
    s = pluginBrowserReducer(s, {
      type: "snapshotRefreshed",
      snapshot: snap(row("a", "error")),
      now: 1000,
    });
    expect(s.cursor.lastSeenTimestamp).toBeNull();
    s = pluginBrowserReducer(s, { type: "markAllSeen" });
    expect(s.cursor.lastSeenTimestamp).toBe(1000);
  });

  it("returns same state reference when already seen", () => {
    const s = initialPluginBrowserState();
    const next = pluginBrowserReducer(s, { type: "markAllSeen" });
    expect(next).toBe(s);
  });
});

describe("selectPlugin / clearSelection", () => {
  it("selects a plugin", () => {
    const s = pluginBrowserReducer(initialPluginBrowserState(), {
      type: "selectPlugin",
      pluginId: "com.a",
    });
    expect(s.selectedPluginId).toBe("com.a");
  });

  it("is idempotent when same plugin re-selected", () => {
    const s1 = pluginBrowserReducer(initialPluginBrowserState(), {
      type: "selectPlugin",
      pluginId: "com.a",
    });
    const s2 = pluginBrowserReducer(s1, {
      type: "selectPlugin",
      pluginId: "com.a",
    });
    expect(s2).toBe(s1);
  });

  it("clears selection", () => {
    let s = pluginBrowserReducer(initialPluginBrowserState(), {
      type: "selectPlugin",
      pluginId: "com.a",
    });
    s = pluginBrowserReducer(s, { type: "clearSelection" });
    expect(s.selectedPluginId).toBeNull();
  });

  it("clearSelection is idempotent when nothing selected", () => {
    const s = initialPluginBrowserState();
    const next = pluginBrowserReducer(s, { type: "clearSelection" });
    expect(next).toBe(s);
  });
});

describe("clearChangelog", () => {
  it("resets changelog and cursor", () => {
    let s = initialPluginBrowserState();
    s = pluginBrowserReducer(s, {
      type: "snapshotRefreshed",
      snapshot: snap(row("a", "ok")),
      now: 1000,
    });
    s = pluginBrowserReducer(s, {
      type: "snapshotRefreshed",
      snapshot: snap(row("a", "error")),
      now: 2000,
    });
    s = pluginBrowserReducer(s, { type: "markAllSeen" });
    expect(s.changelog.entries.length).toBeGreaterThan(0);

    s = pluginBrowserReducer(s, { type: "clearChangelog" });
    expect(s.changelog.entries).toEqual([]);
    expect(s.cursor.lastSeenTimestamp).toBeNull();
  });

  it("preserves maxEntries after clearing", () => {
    let s = initialPluginBrowserState();
    // force a non-default cap through snapshotRefresh (default still applies here)
    // just verify default cap is preserved
    const originalCap = s.changelog.maxEntries;
    s = pluginBrowserReducer(s, {
      type: "snapshotRefreshed",
      snapshot: snap(row("a", "error")),
      now: 100,
    });
    s = pluginBrowserReducer(s, { type: "clearChangelog" });
    expect(s.changelog.maxEntries).toBe(originalCap);
  });

  it("is idempotent on already-empty changelog", () => {
    const s = initialPluginBrowserState();
    const next = pluginBrowserReducer(s, { type: "clearChangelog" });
    expect(next).toBe(s);
  });
});
