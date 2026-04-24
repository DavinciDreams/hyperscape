import { describe, expect, it } from "vitest";
import {
  createPluginBrowserActionRecorder,
  pluginBrowserActionsFromRecords,
  replayPluginBrowserActions,
  DEFAULT_MAX_ACTION_RECORDS,
} from "../PluginBrowserActionRecorder.js";
import { createPluginBrowserStore } from "../PluginBrowserStore.js";
import {
  initialPluginBrowserState,
  type PluginBrowserAction,
} from "../PluginBrowserReducer.js";
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

describe("createPluginBrowserActionRecorder", () => {
  it("starts empty", () => {
    const rec = createPluginBrowserActionRecorder();
    expect(rec.size).toBe(0);
    expect(rec.snapshot()).toEqual([]);
  });

  it("records each dispatched action", () => {
    const rec = createPluginBrowserActionRecorder({ now: () => 1000 });
    rec.record({ type: "selectPlugin", pluginId: "a" });
    rec.record({ type: "markAllSeen" });
    expect(rec.size).toBe(2);
    expect(rec.snapshot()).toEqual([
      {
        action: { type: "selectPlugin", pluginId: "a" },
        recordedAt: 1000,
      },
      { action: { type: "markAllSeen" }, recordedAt: 1000 },
    ]);
  });

  it("honors an explicit `now` override on record()", () => {
    const rec = createPluginBrowserActionRecorder({ now: () => 1000 });
    rec.record({ type: "clearSelection" }, 5000);
    expect(rec.snapshot()[0].recordedAt).toBe(5000);
  });

  it("uses Date.now() when no clock is provided", () => {
    const rec = createPluginBrowserActionRecorder();
    const before = Date.now();
    rec.record({ type: "clearSelection" });
    const after = Date.now();
    const ts = rec.snapshot()[0].recordedAt;
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it("ring-buffers when maxRecords is exceeded, dropping oldest", () => {
    const rec = createPluginBrowserActionRecorder({ maxRecords: 3 });
    rec.record({ type: "selectPlugin", pluginId: "a" });
    rec.record({ type: "selectPlugin", pluginId: "b" });
    rec.record({ type: "selectPlugin", pluginId: "c" });
    rec.record({ type: "selectPlugin", pluginId: "d" });
    expect(rec.size).toBe(3);
    const ids = rec.snapshot().map((r) => {
      if (r.action.type === "selectPlugin") return r.action.pluginId;
      return null;
    });
    expect(ids).toEqual(["b", "c", "d"]);
  });

  it("clamps maxRecords to at least 1", () => {
    const rec = createPluginBrowserActionRecorder({ maxRecords: 0 });
    rec.record({ type: "selectPlugin", pluginId: "a" });
    rec.record({ type: "selectPlugin", pluginId: "b" });
    expect(rec.size).toBe(1);
    const a = rec.snapshot()[0].action;
    expect(a.type === "selectPlugin" && a.pluginId === "b").toBe(true);
  });

  it("defaults maxRecords to DEFAULT_MAX_ACTION_RECORDS", () => {
    const rec = createPluginBrowserActionRecorder();
    for (let i = 0; i < DEFAULT_MAX_ACTION_RECORDS + 10; i += 1) {
      rec.record({ type: "selectPlugin", pluginId: String(i) });
    }
    expect(rec.size).toBe(DEFAULT_MAX_ACTION_RECORDS);
  });

  it("reset() clears the buffer", () => {
    const rec = createPluginBrowserActionRecorder();
    rec.record({ type: "selectPlugin", pluginId: "a" });
    rec.reset();
    expect(rec.size).toBe(0);
    expect(rec.snapshot()).toEqual([]);
  });

  it("snapshot() returns a copy — mutating it does not affect the recorder", () => {
    const rec = createPluginBrowserActionRecorder();
    rec.record({ type: "selectPlugin", pluginId: "a" });
    const snap = rec.snapshot() as unknown as unknown[];
    snap.length = 0;
    expect(rec.size).toBe(1);
  });
});

describe("replayPluginBrowserActions", () => {
  it("folds actions through the reducer from the provided initial state", () => {
    const initial = initialPluginBrowserState();
    const actions: PluginBrowserAction[] = [
      {
        type: "snapshotRefreshed",
        snapshot: snap(row("a", "error")),
        now: 1000,
      },
      { type: "selectPlugin", pluginId: "a" },
    ];
    const final = replayPluginBrowserActions(initial, actions);
    expect(final.selectedPluginId).toBe("a");
    expect(final.currentSnapshot.size).toBe(1);
  });

  it("returns the initial state for an empty action sequence", () => {
    const initial = initialPluginBrowserState();
    expect(replayPluginBrowserActions(initial, [])).toBe(initial);
  });

  it("reproduces the terminal state of a live store", () => {
    // Drive a real store with a sequence of dispatches while a
    // recorder captures the action list; then replay the captured
    // actions over a fresh initial state and assert structural
    // equivalence with the live store's terminal state.
    const store = createPluginBrowserStore();
    const rec = createPluginBrowserActionRecorder();

    const dispatch = (a: PluginBrowserAction) => {
      rec.record(a);
      store.dispatch(a);
    };

    dispatch({
      type: "snapshotRefreshed",
      snapshot: snap(row("a", "error"), row("b", "warning")),
      now: 1000,
    });
    dispatch({ type: "selectPlugin", pluginId: "a" });
    dispatch({ type: "markAllSeen" });
    dispatch({
      type: "snapshotRefreshed",
      snapshot: snap(row("a", "ok")),
      now: 2000,
    });

    const live = store.getState();
    const replayed = replayPluginBrowserActions(
      initialPluginBrowserState(),
      pluginBrowserActionsFromRecords(rec.snapshot()),
    );

    expect(replayed.selectedPluginId).toBe(live.selectedPluginId);
    expect(replayed.currentSnapshot.size).toBe(live.currentSnapshot.size);
    expect(replayed.changelog.entries.length).toBe(
      live.changelog.entries.length,
    );
    expect(replayed.cursor.lastSeenTimestamp).toBe(
      live.cursor.lastSeenTimestamp,
    );
  });

  it("can replay a prefix (time-travel to an intermediate state)", () => {
    const actions: PluginBrowserAction[] = [
      { type: "selectPlugin", pluginId: "a" },
      { type: "selectPlugin", pluginId: "b" },
      { type: "selectPlugin", pluginId: "c" },
    ];
    const atStep1 = replayPluginBrowserActions(
      initialPluginBrowserState(),
      actions.slice(0, 1),
    );
    const atStep2 = replayPluginBrowserActions(
      initialPluginBrowserState(),
      actions.slice(0, 2),
    );
    expect(atStep1.selectedPluginId).toBe("a");
    expect(atStep2.selectedPluginId).toBe("b");
  });
});

describe("pluginBrowserActionsFromRecords", () => {
  it("extracts just the actions, preserving order", () => {
    const rec = createPluginBrowserActionRecorder({ now: () => 0 });
    rec.record({ type: "selectPlugin", pluginId: "a" });
    rec.record({ type: "markAllSeen" });
    rec.record({ type: "clearSelection" });
    const actions = pluginBrowserActionsFromRecords(rec.snapshot());
    expect(actions).toEqual([
      { type: "selectPlugin", pluginId: "a" },
      { type: "markAllSeen" },
      { type: "clearSelection" },
    ]);
  });

  it("handles an empty list", () => {
    expect(pluginBrowserActionsFromRecords([])).toEqual([]);
  });
});
