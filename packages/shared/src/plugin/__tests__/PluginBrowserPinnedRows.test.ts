import { describe, expect, it } from "vitest";
import { createPluginBrowserPinnedRows } from "../PluginBrowserPinnedRows.js";

describe("createPluginBrowserPinnedRows — defaults", () => {
  it("starts empty", () => {
    const p = createPluginBrowserPinnedRows();
    expect(p.size()).toBe(0);
    expect(p.pinnedIds()).toEqual([]);
  });

  it("default capacity is unlimited", () => {
    const p = createPluginBrowserPinnedRows();
    expect(p.capacity()).toBe(Number.POSITIVE_INFINITY);
  });

  it("honors a finite capacity", () => {
    const p = createPluginBrowserPinnedRows({ capacity: 5 });
    expect(p.capacity()).toBe(5);
  });

  it("negative / NaN capacity falls back to unlimited", () => {
    expect(createPluginBrowserPinnedRows({ capacity: -2 }).capacity()).toBe(
      Number.POSITIVE_INFINITY,
    );
    expect(
      createPluginBrowserPinnedRows({
        capacity: Number.NaN,
      }).capacity(),
    ).toBe(Number.POSITIVE_INFINITY);
  });

  it("capacity=0 disables pinning", () => {
    const p = createPluginBrowserPinnedRows({ capacity: 0 });
    expect(p.pin("a")).toBe(false);
    expect(p.size()).toBe(0);
  });

  it("seeds from initialPinned", () => {
    const p = createPluginBrowserPinnedRows({
      initialPinned: ["a", "b"],
    });
    expect(p.pinnedIds()).toEqual(["a", "b"]);
  });

  it("dedupes initialPinned first-wins and drops empties", () => {
    const p = createPluginBrowserPinnedRows({
      initialPinned: ["a", "", "a", "b"],
    });
    expect(p.pinnedIds()).toEqual(["a", "b"]);
  });

  it("respects capacity on seed", () => {
    const p = createPluginBrowserPinnedRows({
      capacity: 2,
      initialPinned: ["a", "b", "c"],
    });
    expect(p.pinnedIds()).toEqual(["a", "b"]);
  });
});

describe("createPluginBrowserPinnedRows — pin/unpin", () => {
  it("pin adds a new row and returns true", () => {
    const p = createPluginBrowserPinnedRows();
    expect(p.pin("a")).toBe(true);
    expect(p.isPinned("a")).toBe(true);
  });

  it("pin is a no-op when already pinned", () => {
    const p = createPluginBrowserPinnedRows();
    p.pin("a");
    expect(p.pin("a")).toBe(false);
    expect(p.pinnedIds()).toEqual(["a"]);
  });

  it("unpin removes a row and returns true", () => {
    const p = createPluginBrowserPinnedRows();
    p.pin("a");
    expect(p.unpin("a")).toBe(true);
    expect(p.isPinned("a")).toBe(false);
  });

  it("unpin returns false when not pinned", () => {
    const p = createPluginBrowserPinnedRows();
    expect(p.unpin("zzz")).toBe(false);
  });

  it("togglePin flips current state", () => {
    const p = createPluginBrowserPinnedRows();
    p.togglePin("a");
    expect(p.isPinned("a")).toBe(true);
    p.togglePin("a");
    expect(p.isPinned("a")).toBe(false);
  });

  it("silently ignores empty / non-string ids", () => {
    const p = createPluginBrowserPinnedRows();
    expect(p.pin("")).toBe(false);
    expect(p.pin(null as unknown as string)).toBe(false);
    p.togglePin("");
    expect(p.size()).toBe(0);
  });
});

describe("createPluginBrowserPinnedRows — order + reorder", () => {
  it("pin order is insertion order", () => {
    const p = createPluginBrowserPinnedRows();
    p.pin("c");
    p.pin("a");
    p.pin("b");
    expect(p.pinnedIds()).toEqual(["c", "a", "b"]);
  });

  it("reorder moves a row to newIndex", () => {
    const p = createPluginBrowserPinnedRows({
      initialPinned: ["a", "b", "c", "d"],
    });
    p.reorder("d", 0);
    expect(p.pinnedIds()).toEqual(["d", "a", "b", "c"]);
  });

  it("reorder clamps newIndex to [0, size-1]", () => {
    const p = createPluginBrowserPinnedRows({
      initialPinned: ["a", "b", "c"],
    });
    p.reorder("a", 99);
    expect(p.pinnedIds()).toEqual(["b", "c", "a"]);
    p.reorder("a", -5);
    expect(p.pinnedIds()).toEqual(["a", "b", "c"]);
  });

  it("reorder is a no-op for unknown / unpinned id", () => {
    const p = createPluginBrowserPinnedRows({
      initialPinned: ["a"],
    });
    p.reorder("zzz", 0);
    expect(p.pinnedIds()).toEqual(["a"]);
  });

  it("reorder ignores non-finite indexes", () => {
    const p = createPluginBrowserPinnedRows({
      initialPinned: ["a", "b"],
    });
    p.reorder("a", Number.NaN);
    p.reorder("a", Number.POSITIVE_INFINITY);
    expect(p.pinnedIds()).toEqual(["a", "b"]);
  });
});

describe("createPluginBrowserPinnedRows — capacity eviction", () => {
  it("evicts oldest pin when at capacity", () => {
    const p = createPluginBrowserPinnedRows({ capacity: 2 });
    p.pin("a");
    p.pin("b");
    p.pin("c");
    expect(p.pinnedIds()).toEqual(["b", "c"]);
  });

  it("re-pinning existing row does NOT count toward eviction", () => {
    const p = createPluginBrowserPinnedRows({ capacity: 2 });
    p.pin("a");
    p.pin("b");
    p.pin("b"); // no-op
    p.pin("c");
    expect(p.pinnedIds()).toEqual(["b", "c"]);
  });
});

describe("createPluginBrowserPinnedRows — unpinAll", () => {
  it("clears everything", () => {
    const p = createPluginBrowserPinnedRows({
      initialPinned: ["a", "b", "c"],
    });
    p.unpinAll();
    expect(p.size()).toBe(0);
    expect(p.pinnedIds()).toEqual([]);
  });
});
