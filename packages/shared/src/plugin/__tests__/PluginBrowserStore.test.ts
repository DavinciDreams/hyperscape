import { describe, expect, it, vi } from "vitest";
import { createPluginBrowserStore } from "../PluginBrowserStore.js";
import { initialPluginBrowserState } from "../PluginBrowserReducer.js";
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

describe("createPluginBrowserStore — construction", () => {
  it("seeds from initialPluginBrowserState by default", () => {
    const store = createPluginBrowserStore();
    expect(store.getState().currentSnapshot.size).toBe(0);
    expect(store.getState().selectedPluginId).toBeNull();
  });

  it("honors a custom initialState seed", () => {
    const seeded = {
      ...initialPluginBrowserState(),
      selectedPluginId: "com.a",
    };
    const store = createPluginBrowserStore({ initialState: seeded });
    expect(store.getState().selectedPluginId).toBe("com.a");
  });

  it("independent instances do not share state", () => {
    const a = createPluginBrowserStore();
    const b = createPluginBrowserStore();
    a.dispatch({ type: "selectPlugin", pluginId: "x" });
    expect(a.getState().selectedPluginId).toBe("x");
    expect(b.getState().selectedPluginId).toBeNull();
  });
});

describe("dispatch + notify", () => {
  it("notifies subscribers on state change", () => {
    const store = createPluginBrowserStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.dispatch({ type: "selectPlugin", pluginId: "a" });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(store.getState());
  });

  it("skips notification when reducer is a no-op (same reference)", () => {
    const store = createPluginBrowserStore();
    const listener = vi.fn();
    store.subscribe(listener);
    // markAllSeen on empty changelog returns same reference.
    store.dispatch({ type: "markAllSeen" });
    expect(listener).not.toHaveBeenCalled();
  });

  it("skips notification for idempotent clearSelection", () => {
    const store = createPluginBrowserStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.dispatch({ type: "clearSelection" });
    expect(listener).not.toHaveBeenCalled();
  });

  it("notifies every subscriber on state change", () => {
    const store = createPluginBrowserStore();
    const a = vi.fn();
    const b = vi.fn();
    store.subscribe(a);
    store.subscribe(b);
    store.dispatch({ type: "selectPlugin", pluginId: "x" });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });
});

describe("unsubscribe", () => {
  it("removes the listener", () => {
    const store = createPluginBrowserStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();
    store.dispatch({ type: "selectPlugin", pluginId: "x" });
    expect(listener).not.toHaveBeenCalled();
  });

  it("is safe to call multiple times", () => {
    const store = createPluginBrowserStore();
    const unsubscribe = store.subscribe(() => {});
    unsubscribe();
    expect(() => unsubscribe()).not.toThrow();
  });
});

describe("listener error isolation", () => {
  it("continues invoking later listeners when an earlier one throws", () => {
    const store = createPluginBrowserStore();
    const thrower = vi.fn(() => {
      throw new Error("boom");
    });
    const other = vi.fn();
    store.subscribe(thrower);
    store.subscribe(other);
    store.dispatch({ type: "selectPlugin", pluginId: "x" });
    expect(thrower).toHaveBeenCalled();
    expect(other).toHaveBeenCalled();
  });

  it("surfaces the first swallowed error to onListenerError when provided", () => {
    const onListenerError = vi.fn();
    const store = createPluginBrowserStore({ onListenerError });
    const err = new Error("bad");
    store.subscribe(() => {
      throw err;
    });
    store.dispatch({ type: "selectPlugin", pluginId: "x" });
    expect(onListenerError).toHaveBeenCalledTimes(1);
    expect(onListenerError).toHaveBeenCalledWith(err);
  });

  it("does not call onListenerError when no listener threw", () => {
    const onListenerError = vi.fn();
    const store = createPluginBrowserStore({ onListenerError });
    store.subscribe(() => {});
    store.dispatch({ type: "selectPlugin", pluginId: "x" });
    expect(onListenerError).not.toHaveBeenCalled();
  });
});

describe("end-to-end flow", () => {
  it("snapshotRefreshed moves state forward and notifies", () => {
    const store = createPluginBrowserStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.dispatch({
      type: "snapshotRefreshed",
      snapshot: snap(row("a", "error")),
      now: 1000,
    });
    expect(store.getState().currentSnapshot.size).toBe(1);
    expect(store.getState().changelog.entries.length).toBeGreaterThan(0);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
