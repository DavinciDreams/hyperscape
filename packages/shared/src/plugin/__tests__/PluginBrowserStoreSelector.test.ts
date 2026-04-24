import { describe, expect, it, vi } from "vitest";
import { createPluginBrowserStore } from "../PluginBrowserStore.js";
import {
  referenceEquals,
  shallowEquals,
  subscribePluginBrowserStoreSlice,
} from "../PluginBrowserStoreSelector.js";
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

describe("subscribePluginBrowserStoreSlice — reference equality (default)", () => {
  it("fires the listener when the selected slice identity changes", () => {
    const store = createPluginBrowserStore();
    const listener = vi.fn();
    subscribePluginBrowserStoreSlice(
      store,
      (s) => s.selectedPluginId,
      listener,
    );
    store.dispatch({ type: "selectPlugin", pluginId: "a" });
    expect(listener).toHaveBeenCalledWith("a");
  });

  it("skips listener when the slice is reference-equal to previous", () => {
    const store = createPluginBrowserStore();
    const listener = vi.fn();
    subscribePluginBrowserStoreSlice(
      store,
      (s) => s.selectedPluginId,
      listener,
    );
    store.dispatch({ type: "selectPlugin", pluginId: "a" });
    listener.mockClear();
    // snapshotRefreshed changes other slices but not selectedPluginId.
    store.dispatch({
      type: "snapshotRefreshed",
      snapshot: snap(row("a")),
      now: 1000,
    });
    expect(listener).not.toHaveBeenCalled();
  });

  it("does not fire for the initial value on subscription", () => {
    const store = createPluginBrowserStore();
    const listener = vi.fn();
    subscribePluginBrowserStoreSlice(
      store,
      (s) => s.selectedPluginId,
      listener,
    );
    expect(listener).not.toHaveBeenCalled();
  });

  it("fires once even across multiple no-op dispatches", () => {
    const store = createPluginBrowserStore();
    const listener = vi.fn();
    subscribePluginBrowserStoreSlice(
      store,
      (s) => s.selectedPluginId,
      listener,
    );
    store.dispatch({ type: "selectPlugin", pluginId: "a" });
    store.dispatch({ type: "selectPlugin", pluginId: "a" });
    store.dispatch({ type: "selectPlugin", pluginId: "a" });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("fires again when slice transitions back to a different value", () => {
    const store = createPluginBrowserStore();
    const listener = vi.fn();
    subscribePluginBrowserStoreSlice(
      store,
      (s) => s.selectedPluginId,
      listener,
    );
    store.dispatch({ type: "selectPlugin", pluginId: "a" });
    store.dispatch({ type: "selectPlugin", pluginId: "b" });
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenNthCalledWith(1, "a");
    expect(listener).toHaveBeenNthCalledWith(2, "b");
  });

  it("returns a working unsubscribe", () => {
    const store = createPluginBrowserStore();
    const listener = vi.fn();
    const unsubscribe = subscribePluginBrowserStoreSlice(
      store,
      (s) => s.selectedPluginId,
      listener,
    );
    unsubscribe();
    store.dispatch({ type: "selectPlugin", pluginId: "a" });
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("subscribePluginBrowserStoreSlice — custom equality", () => {
  it("uses shallowEquals to skip allocator-churn selectors", () => {
    const store = createPluginBrowserStore();
    const listener = vi.fn();
    subscribePluginBrowserStoreSlice(
      store,
      (s) => ({
        selected: s.selectedPluginId,
        snapshotSize: s.currentSnapshot.size,
      }),
      listener,
      { equals: shallowEquals },
    );
    // clearSelection from null is a no-op — store skips notify entirely.
    // Trigger a real state change that doesn't alter the slice fields.
    // markAllSeen on non-empty changelog changes cursor but not our slice.
    store.dispatch({
      type: "snapshotRefreshed",
      snapshot: snap(row("a")),
      now: 1000,
    });
    // Now slice.snapshotSize changed from 0 → 1; listener fires once.
    expect(listener).toHaveBeenCalledTimes(1);
    listener.mockClear();
    // markAllSeen changes cursor, slice is unchanged, shallowEquals skips.
    store.dispatch({ type: "markAllSeen" });
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("referenceEquals", () => {
  it("is true for same reference", () => {
    const a = { x: 1 };
    expect(referenceEquals(a, a)).toBe(true);
  });

  it("is false for deep-equal but distinct objects", () => {
    expect(referenceEquals({ x: 1 }, { x: 1 })).toBe(false);
  });

  it("is true for identical primitives", () => {
    expect(referenceEquals(42, 42)).toBe(true);
    expect(referenceEquals("x", "x")).toBe(true);
    expect(referenceEquals(null, null)).toBe(true);
  });
});

describe("shallowEquals — plain objects", () => {
  it("is true for identical references", () => {
    const a = { x: 1 };
    expect(shallowEquals(a, a)).toBe(true);
  });

  it("is true for same-shape objects with reference-equal values", () => {
    expect(shallowEquals({ a: 1, b: "x" }, { a: 1, b: "x" })).toBe(true);
  });

  it("is false when a value differs", () => {
    expect(shallowEquals({ a: 1 }, { a: 2 })).toBe(false);
  });

  it("is false when key sets differ", () => {
    expect(shallowEquals({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });

  it("is false when an object is null", () => {
    expect(shallowEquals(null, { a: 1 })).toBe(false);
    expect(shallowEquals({ a: 1 }, null)).toBe(false);
  });

  it("is true when both are null", () => {
    expect(shallowEquals(null, null)).toBe(true);
  });
});

describe("shallowEquals — arrays", () => {
  it("is true for same-length reference-equal element arrays", () => {
    expect(shallowEquals([1, 2, 3], [1, 2, 3])).toBe(true);
  });

  it("is false when lengths differ", () => {
    expect(shallowEquals([1, 2], [1, 2, 3])).toBe(false);
  });

  it("is false when element references differ", () => {
    expect(shallowEquals([{ a: 1 }], [{ a: 1 }])).toBe(false);
  });

  it("is false when only one operand is an array", () => {
    expect(shallowEquals([1], { 0: 1, length: 1 })).toBe(false);
  });
});
