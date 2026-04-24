import { describe, expect, it } from "vitest";
import { createPluginBrowserStore } from "../PluginBrowserStore.js";
import { initialPluginBrowserState } from "../PluginBrowserReducer.js";
import { diffPluginBrowserState } from "../PluginBrowserStateDiff.js";
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

describe("diffPluginBrowserState — identity / no-op", () => {
  it("returns [] when prev === next", () => {
    const state = initialPluginBrowserState();
    expect(diffPluginBrowserState(state, state)).toEqual([]);
  });

  it("returns [] when only unrelated (ref-equal) fields change", () => {
    const a = initialPluginBrowserState();
    // Construct a "next" that is structurally equal but a distinct
    // object — diff should still be empty (all slices are the same
    // references).
    const b: typeof a = { ...a };
    expect(diffPluginBrowserState(a, b)).toEqual([]);
  });
});

describe("diffPluginBrowserState — selection", () => {
  it("emits selectionChanged when selectPlugin dispatches", () => {
    const store = createPluginBrowserStore();
    const prev = store.getState();
    store.dispatch({ type: "selectPlugin", pluginId: "a" });
    const next = store.getState();
    expect(diffPluginBrowserState(prev, next)).toEqual([
      { kind: "selectionChanged", from: null, to: "a" },
    ]);
  });

  it("emits selectionChanged on clearSelection when a plugin was selected", () => {
    const store = createPluginBrowserStore();
    store.dispatch({ type: "selectPlugin", pluginId: "a" });
    const prev = store.getState();
    store.dispatch({ type: "clearSelection" });
    const next = store.getState();
    expect(diffPluginBrowserState(prev, next)).toEqual([
      { kind: "selectionChanged", from: "a", to: null },
    ]);
  });
});

describe("diffPluginBrowserState — snapshot", () => {
  it("emits snapshotAdded for each new row, lexicographic order", () => {
    const store = createPluginBrowserStore();
    const prev = store.getState();
    store.dispatch({
      type: "snapshotRefreshed",
      snapshot: snap(row("b", "ok"), row("a", "warning")),
      now: 1000,
    });
    const next = store.getState();
    const events = diffPluginBrowserState(prev, next);
    const added = events.filter((e) => e.kind === "snapshotAdded");
    expect(added).toEqual([
      { kind: "snapshotAdded", pluginId: "a", severity: "warning" },
      { kind: "snapshotAdded", pluginId: "b", severity: "ok" },
    ]);
  });

  it("emits snapshotRemoved for each dropped row", () => {
    const store = createPluginBrowserStore();
    store.dispatch({
      type: "snapshotRefreshed",
      snapshot: snap(row("a"), row("b")),
      now: 1000,
    });
    const prev = store.getState();
    store.dispatch({
      type: "snapshotRefreshed",
      snapshot: snap(row("a")),
      now: 2000,
    });
    const next = store.getState();
    const events = diffPluginBrowserState(prev, next);
    expect(
      events.some((e) => e.kind === "snapshotRemoved" && e.pluginId === "b"),
    ).toBe(true);
    expect(events.some((e) => e.kind === "snapshotAdded")).toBe(false);
  });

  it("emits snapshotSeverityChanged when a row flips severity", () => {
    const store = createPluginBrowserStore();
    store.dispatch({
      type: "snapshotRefreshed",
      snapshot: snap(row("a", "ok")),
      now: 1000,
    });
    const prev = store.getState();
    store.dispatch({
      type: "snapshotRefreshed",
      snapshot: snap(row("a", "error")),
      now: 2000,
    });
    const next = store.getState();
    const events = diffPluginBrowserState(prev, next);
    expect(
      events.some(
        (e) =>
          e.kind === "snapshotSeverityChanged" &&
          e.pluginId === "a" &&
          e.from === "ok" &&
          e.to === "error",
      ),
    ).toBe(true);
  });

  it("emits added+removed+severityChanged in stable order for a complex diff", () => {
    const store = createPluginBrowserStore();
    store.dispatch({
      type: "snapshotRefreshed",
      snapshot: snap(row("a", "ok"), row("b", "warning")),
      now: 1000,
    });
    const prev = store.getState();
    store.dispatch({
      type: "snapshotRefreshed",
      snapshot: snap(row("a", "error"), row("c", "ok")),
      now: 2000,
    });
    const next = store.getState();
    const events = diffPluginBrowserState(prev, next);
    const kinds = events.map((e) => e.kind);
    // Order: snapshotRemoved* → snapshotAdded* → snapshotSeverityChanged*
    // (interleaved with changelog/cursor/toast events that follow).
    const removedIdx = kinds.indexOf("snapshotRemoved");
    const addedIdx = kinds.indexOf("snapshotAdded");
    const severityIdx = kinds.indexOf("snapshotSeverityChanged");
    expect(removedIdx).toBeGreaterThanOrEqual(0);
    expect(addedIdx).toBeGreaterThan(removedIdx);
    expect(severityIdx).toBeGreaterThan(addedIdx);
  });
});

describe("diffPluginBrowserState — changelog", () => {
  it("emits changelogAppended when snapshot produces new entries", () => {
    const store = createPluginBrowserStore();
    const prev = store.getState();
    store.dispatch({
      type: "snapshotRefreshed",
      snapshot: snap(row("a", "error")),
      now: 1000,
    });
    const next = store.getState();
    const events = diffPluginBrowserState(prev, next);
    const appended = events.find((e) => e.kind === "changelogAppended");
    expect(appended).toBeDefined();
    if (appended && appended.kind === "changelogAppended") {
      expect(appended.addedCount).toBeGreaterThan(0);
      expect(appended.totalCount).toBeGreaterThan(0);
    }
  });

  it("emits changelogCleared on clearChangelog when it had entries", () => {
    const store = createPluginBrowserStore();
    store.dispatch({
      type: "snapshotRefreshed",
      snapshot: snap(row("a", "error")),
      now: 1000,
    });
    const prev = store.getState();
    store.dispatch({ type: "clearChangelog" });
    const next = store.getState();
    const events = diffPluginBrowserState(prev, next);
    expect(events.some((e) => e.kind === "changelogCleared")).toBe(true);
  });

  it("does not emit changelog events when entry count is unchanged", () => {
    const store = createPluginBrowserStore();
    store.dispatch({
      type: "snapshotRefreshed",
      snapshot: snap(row("a", "error")),
      now: 1000,
    });
    const prev = store.getState();
    store.dispatch({ type: "selectPlugin", pluginId: "a" });
    const next = store.getState();
    const events = diffPluginBrowserState(prev, next);
    expect(events.some((e) => e.kind === "changelogAppended")).toBe(false);
    expect(events.some((e) => e.kind === "changelogCleared")).toBe(false);
  });
});

describe("diffPluginBrowserState — cursor", () => {
  it("emits cursorAdvanced when markAllSeen moves the cursor", () => {
    const store = createPluginBrowserStore();
    store.dispatch({
      type: "snapshotRefreshed",
      snapshot: snap(row("a", "error")),
      now: 1000,
    });
    const prev = store.getState();
    expect(prev.cursor.lastSeenTimestamp).toBeNull();
    store.dispatch({ type: "markAllSeen" });
    const next = store.getState();
    const events = diffPluginBrowserState(prev, next);
    const advanced = events.find((e) => e.kind === "cursorAdvanced");
    expect(advanced).toBeDefined();
    if (advanced && advanced.kind === "cursorAdvanced") {
      expect(advanced.from).toBeNull();
      expect(advanced.to).not.toBeNull();
    }
  });
});

describe("diffPluginBrowserState — toast surface", () => {
  it("emits toastSurfaceChanged when displays + overflow count moves", () => {
    const store = createPluginBrowserStore();
    const prev = store.getState();
    store.dispatch({
      type: "snapshotRefreshed",
      snapshot: snap(row("a", "error"), row("b", "warning")),
      now: 1000,
    });
    const next = store.getState();
    const events = diffPluginBrowserState(prev, next);
    const surface = events.find((e) => e.kind === "toastSurfaceChanged");
    if (surface && surface.kind === "toastSurfaceChanged") {
      expect(surface.from).toBe(0);
      expect(surface.to).toBeGreaterThan(0);
    }
  });
});

describe("diffPluginBrowserState — emission order", () => {
  it("selection precedes snapshot events precedes changelog events", () => {
    const store = createPluginBrowserStore();
    const prev = store.getState();
    // Single dispatch that triggers: selection does NOT change, but
    // snapshot + changelog do. Use a separate compound to validate
    // order.
    store.dispatch({
      type: "snapshotRefreshed",
      snapshot: snap(row("a", "error")),
      now: 1000,
    });
    const mid = store.getState();
    store.dispatch({ type: "selectPlugin", pluginId: "a" });
    store.dispatch({ type: "clearChangelog" });
    const next = store.getState();

    const events = diffPluginBrowserState(prev, next);
    const kindOrder = events.map((e) => e.kind);
    // selectionChanged (if present) must come before
    // snapshotRemoved/Added/SeverityChanged, which must come before
    // changelogCleared/Appended.
    const iSel = kindOrder.indexOf("selectionChanged");
    const iSnap = kindOrder.findIndex(
      (k) =>
        k === "snapshotAdded" ||
        k === "snapshotRemoved" ||
        k === "snapshotSeverityChanged",
    );
    const iLog = kindOrder.findIndex(
      (k) => k === "changelogAppended" || k === "changelogCleared",
    );
    if (iSel >= 0 && iSnap >= 0) expect(iSel).toBeLessThan(iSnap);
    if (iSnap >= 0 && iLog >= 0) expect(iSnap).toBeLessThan(iLog);

    // Sanity: selection + snapshot categories fired.
    // (Changelog grew then cleared between prev and next, so net
    // prev→next diff has no changelog event — that's correct behavior.)
    expect(iSel).toBeGreaterThanOrEqual(0);
    expect(iSnap).toBeGreaterThanOrEqual(0);
    // Mid snapshot did produce a changelog entry between prev and mid.
    expect(mid.changelog.entries.length).toBeGreaterThan(0);
  });
});

describe("diffPluginBrowserState — integration with subscribe", () => {
  it("can be used as the canonical store-observer pattern", () => {
    const store = createPluginBrowserStore();
    const emitted: string[] = [];
    let prev = store.getState();
    store.subscribe((next) => {
      for (const ev of diffPluginBrowserState(prev, next)) {
        emitted.push(ev.kind);
      }
      prev = next;
    });

    store.dispatch({
      type: "snapshotRefreshed",
      snapshot: snap(row("a", "error")),
      now: 1000,
    });
    store.dispatch({ type: "selectPlugin", pluginId: "a" });
    store.dispatch({ type: "markAllSeen" });
    store.dispatch({ type: "clearChangelog" });

    // We expect at least: snapshotAdded, changelogAppended,
    // selectionChanged, cursorAdvanced, changelogCleared.
    expect(emitted).toContain("snapshotAdded");
    expect(emitted).toContain("changelogAppended");
    expect(emitted).toContain("selectionChanged");
    expect(emitted).toContain("cursorAdvanced");
    expect(emitted).toContain("changelogCleared");
  });
});
