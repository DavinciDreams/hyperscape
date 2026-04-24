import { describe, expect, it } from "vitest";
import {
  DEFAULT_DETAILS_CHANGELOG_LIMIT,
  buildPluginBrowserDetailsViewModel,
} from "../PluginBrowserDetailsViewModel.js";
import { createPluginBrowserStore } from "../PluginBrowserStore.js";
import type { PluginBrowserRowSummary } from "../PluginBrowserRowSummary.js";

function row(
  pluginId: string,
  severity: PluginBrowserRowSummary["severity"] = "ok",
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

function snap(...entries: Array<PluginBrowserRowSummary>) {
  return new Map(entries.map((r) => [r.pluginId, r]));
}

describe("buildPluginBrowserDetailsViewModel — no selection", () => {
  it("returns a closed view model", () => {
    const store = createPluginBrowserStore();
    const vm = buildPluginBrowserDetailsViewModel(store.getState());
    expect(vm.isOpen).toBe(false);
    expect(vm.pluginId).toBeNull();
    expect(vm.row).toBeNull();
    expect(vm.isStale).toBe(false);
    expect(vm.recentChangelog).toEqual([]);
    expect(vm.unreadCount).toBe(0);
  });
});

describe("buildPluginBrowserDetailsViewModel — fresh selection", () => {
  it("returns the selected row and empty changelog", () => {
    const store = createPluginBrowserStore();
    store.dispatch({
      type: "snapshotRefreshed",
      snapshot: snap(row("a"), row("b")),
      now: 1000,
    });
    store.dispatch({ type: "selectPlugin", pluginId: "a" });
    const vm = buildPluginBrowserDetailsViewModel(store.getState());
    expect(vm.isOpen).toBe(true);
    expect(vm.pluginId).toBe("a");
    expect(vm.row?.pluginId).toBe("a");
    expect(vm.isStale).toBe(false);
  });
});

describe("buildPluginBrowserDetailsViewModel — stale selection", () => {
  it("returns isStale=true when selected plugin was removed", () => {
    const store = createPluginBrowserStore();
    store.dispatch({
      type: "snapshotRefreshed",
      snapshot: snap(row("a"), row("b")),
      now: 1000,
    });
    store.dispatch({ type: "selectPlugin", pluginId: "a" });
    // Snapshot drops "a"
    store.dispatch({
      type: "snapshotRefreshed",
      snapshot: snap(row("b")),
      now: 2000,
    });
    const vm = buildPluginBrowserDetailsViewModel(store.getState());
    expect(vm.isOpen).toBe(true);
    expect(vm.pluginId).toBe("a");
    expect(vm.row).toBeNull();
    expect(vm.isStale).toBe(true);
  });
});

describe("buildPluginBrowserDetailsViewModel — changelog filtering", () => {
  it("returns only entries for the selected plugin, newest-first", () => {
    const store = createPluginBrowserStore();
    // First refresh creates entries for a and b (two severities).
    store.dispatch({
      type: "snapshotRefreshed",
      snapshot: snap(row("a", "error"), row("b", "warning")),
      now: 1000,
    });
    // Second refresh changes a's severity (should add another entry
    // for a).
    store.dispatch({
      type: "snapshotRefreshed",
      snapshot: snap(row("a", "ok"), row("b", "warning")),
      now: 2000,
    });
    store.dispatch({ type: "selectPlugin", pluginId: "a" });
    const vm = buildPluginBrowserDetailsViewModel(store.getState());
    expect(vm.recentChangelog.length).toBeGreaterThanOrEqual(1);
    for (const e of vm.recentChangelog) {
      expect(e.intent.pluginId).toBe("a");
    }
    // Newest-first: timestamps monotonically decreasing.
    const timestamps = vm.recentChangelog.map((e) => e.timestamp);
    const sorted = [...timestamps].sort((x, y) => y - x);
    expect(timestamps).toEqual(sorted);
  });
});

describe("buildPluginBrowserDetailsViewModel — recentLimit option", () => {
  it("caps the number of entries", () => {
    const store = createPluginBrowserStore();
    // Accumulate multiple snapshot refreshes that each flip a's
    // severity to produce distinct changelog entries.
    store.dispatch({
      type: "snapshotRefreshed",
      snapshot: snap(row("a", "ok")),
      now: 1000,
    });
    for (let t = 2; t <= 10; t += 1) {
      const sev: PluginBrowserRowSummary["severity"] =
        t % 2 === 0 ? "error" : "ok";
      store.dispatch({
        type: "snapshotRefreshed",
        snapshot: snap(row("a", sev)),
        now: t * 1000,
      });
    }
    store.dispatch({ type: "selectPlugin", pluginId: "a" });
    const vm = buildPluginBrowserDetailsViewModel(store.getState(), {
      recentLimit: 3,
    });
    expect(vm.recentChangelog.length).toBeLessThanOrEqual(3);
  });

  it("a limit of 0 returns an empty list", () => {
    const store = createPluginBrowserStore();
    store.dispatch({
      type: "snapshotRefreshed",
      snapshot: snap(row("a", "error")),
      now: 1000,
    });
    store.dispatch({ type: "selectPlugin", pluginId: "a" });
    const vm = buildPluginBrowserDetailsViewModel(store.getState(), {
      recentLimit: 0,
    });
    expect(vm.recentChangelog).toEqual([]);
    expect(vm.unreadCount).toBe(0);
  });

  it("defaults to DEFAULT_DETAILS_CHANGELOG_LIMIT", () => {
    const store = createPluginBrowserStore();
    for (let t = 1; t <= DEFAULT_DETAILS_CHANGELOG_LIMIT + 5; t += 1) {
      const sev: PluginBrowserRowSummary["severity"] =
        t % 2 === 0 ? "error" : "ok";
      store.dispatch({
        type: "snapshotRefreshed",
        snapshot: snap(row("a", sev)),
        now: t * 1000,
      });
    }
    store.dispatch({ type: "selectPlugin", pluginId: "a" });
    const vm = buildPluginBrowserDetailsViewModel(store.getState());
    expect(vm.recentChangelog.length).toBeLessThanOrEqual(
      DEFAULT_DETAILS_CHANGELOG_LIMIT,
    );
  });

  it("clamps negative recentLimit to 0", () => {
    const store = createPluginBrowserStore();
    store.dispatch({
      type: "snapshotRefreshed",
      snapshot: snap(row("a", "error")),
      now: 1000,
    });
    store.dispatch({ type: "selectPlugin", pluginId: "a" });
    const vm = buildPluginBrowserDetailsViewModel(store.getState(), {
      recentLimit: -3,
    });
    expect(vm.recentChangelog).toEqual([]);
  });
});

describe("buildPluginBrowserDetailsViewModel — unreadCount", () => {
  it("is equal to recentChangelog length when cursor is null", () => {
    const store = createPluginBrowserStore();
    store.dispatch({
      type: "snapshotRefreshed",
      snapshot: snap(row("a", "error")),
      now: 1000,
    });
    store.dispatch({ type: "selectPlugin", pluginId: "a" });
    const vm = buildPluginBrowserDetailsViewModel(store.getState());
    expect(vm.unreadCount).toBe(vm.recentChangelog.length);
    expect(vm.unreadCount).toBeGreaterThan(0);
  });

  it("drops to 0 after markAllSeen", () => {
    const store = createPluginBrowserStore();
    store.dispatch({
      type: "snapshotRefreshed",
      snapshot: snap(row("a", "error")),
      now: 1000,
    });
    store.dispatch({ type: "selectPlugin", pluginId: "a" });
    store.dispatch({ type: "markAllSeen" });
    const vm = buildPluginBrowserDetailsViewModel(store.getState());
    expect(vm.unreadCount).toBe(0);
  });

  it("counts only entries newer than the cursor", () => {
    const store = createPluginBrowserStore();
    store.dispatch({
      type: "snapshotRefreshed",
      snapshot: snap(row("a", "error")),
      now: 1000,
    });
    // Acknowledge first entry.
    store.dispatch({ type: "markAllSeen" });
    // New entry for a.
    store.dispatch({
      type: "snapshotRefreshed",
      snapshot: snap(row("a", "ok")),
      now: 2000,
    });
    store.dispatch({ type: "selectPlugin", pluginId: "a" });
    const vm = buildPluginBrowserDetailsViewModel(store.getState());
    expect(vm.unreadCount).toBeGreaterThan(0);
    expect(vm.unreadCount).toBeLessThan(vm.recentChangelog.length + 1);
  });
});

describe("buildPluginBrowserDetailsViewModel — isolation", () => {
  it("other plugins' changelog entries never leak in", () => {
    const store = createPluginBrowserStore();
    store.dispatch({
      type: "snapshotRefreshed",
      snapshot: snap(row("a", "error"), row("b", "error")),
      now: 1000,
    });
    store.dispatch({ type: "selectPlugin", pluginId: "a" });
    const vm = buildPluginBrowserDetailsViewModel(store.getState());
    for (const e of vm.recentChangelog) {
      expect(e.intent.pluginId).toBe("a");
    }
  });
});
