import { describe, expect, it } from "vitest";
import { createPluginBrowserSearchHistory } from "../PluginBrowserSearchHistory.js";

describe("createPluginBrowserSearchHistory — defaults", () => {
  it("starts empty", () => {
    const h = createPluginBrowserSearchHistory();
    expect(h.size()).toBe(0);
    expect(h.entries()).toEqual([]);
  });

  it("uses default capacity 20", () => {
    const h = createPluginBrowserSearchHistory();
    expect(h.capacity()).toBe(20);
  });

  it("is case-insensitive by default", () => {
    const h = createPluginBrowserSearchHistory();
    expect(h.caseSensitive()).toBe(false);
  });

  it("honors custom capacity", () => {
    const h = createPluginBrowserSearchHistory({ capacity: 5 });
    expect(h.capacity()).toBe(5);
  });

  it("clamps negative capacity to 0", () => {
    const h = createPluginBrowserSearchHistory({ capacity: -3 });
    expect(h.capacity()).toBe(0);
  });

  it("non-finite capacity falls back to default", () => {
    const h = createPluginBrowserSearchHistory({
      capacity: Number.NaN,
    });
    expect(h.capacity()).toBe(20);
  });
});

describe("createPluginBrowserSearchHistory — record", () => {
  it("adds a new query at head", () => {
    const h = createPluginBrowserSearchHistory();
    h.record("foo");
    expect(h.entries()).toEqual(["foo"]);
    expect(h.has("foo")).toBe(true);
  });

  it("most-recent first order", () => {
    const h = createPluginBrowserSearchHistory();
    h.record("a");
    h.record("b");
    h.record("c");
    expect(h.entries()).toEqual(["c", "b", "a"]);
  });

  it("trims whitespace", () => {
    const h = createPluginBrowserSearchHistory();
    h.record("  foo  ");
    expect(h.entries()).toEqual(["foo"]);
  });

  it("silently ignores whitespace-only queries", () => {
    const h = createPluginBrowserSearchHistory();
    h.record("");
    h.record("   ");
    expect(h.size()).toBe(0);
  });

  it("silently ignores non-string inputs", () => {
    const h = createPluginBrowserSearchHistory();
    h.record(42 as unknown as string);
    h.record(null as unknown as string);
    expect(h.size()).toBe(0);
  });
});

describe("createPluginBrowserSearchHistory — dedup", () => {
  it("moves existing query to head (case-insensitive)", () => {
    const h = createPluginBrowserSearchHistory();
    h.record("a");
    h.record("b");
    h.record("a");
    expect(h.entries()).toEqual(["a", "b"]);
  });

  it("preserves new casing on re-record", () => {
    const h = createPluginBrowserSearchHistory();
    h.record("Error");
    h.record("error");
    expect(h.entries()).toEqual(["error"]);
  });

  it("case-sensitive dedup keeps distinct casings separate", () => {
    const h = createPluginBrowserSearchHistory({
      caseSensitive: true,
    });
    h.record("Error");
    h.record("error");
    expect(h.entries()).toEqual(["error", "Error"]);
  });
});

describe("createPluginBrowserSearchHistory — capacity eviction", () => {
  it("evicts the oldest entry past capacity", () => {
    const h = createPluginBrowserSearchHistory({ capacity: 3 });
    h.record("a");
    h.record("b");
    h.record("c");
    h.record("d");
    expect(h.entries()).toEqual(["d", "c", "b"]);
    expect(h.has("a")).toBe(false);
  });

  it("capacity=0 disables storage", () => {
    const h = createPluginBrowserSearchHistory({ capacity: 0 });
    h.record("a");
    expect(h.size()).toBe(0);
  });
});

describe("createPluginBrowserSearchHistory — remove / clear", () => {
  it("remove drops a specific entry", () => {
    const h = createPluginBrowserSearchHistory();
    h.record("a");
    h.record("b");
    h.remove("a");
    expect(h.entries()).toEqual(["b"]);
  });

  it("remove is case-insensitive by default", () => {
    const h = createPluginBrowserSearchHistory();
    h.record("Error");
    h.remove("ERROR");
    expect(h.has("error")).toBe(false);
  });

  it("remove unknown entry is a no-op", () => {
    const h = createPluginBrowserSearchHistory();
    h.record("a");
    expect(() => h.remove("zzz")).not.toThrow();
    expect(h.size()).toBe(1);
  });

  it("clear drops everything", () => {
    const h = createPluginBrowserSearchHistory();
    h.record("a");
    h.record("b");
    h.clear();
    expect(h.size()).toBe(0);
    expect(h.entries()).toEqual([]);
  });
});

describe("createPluginBrowserSearchHistory — initialEntries", () => {
  it("seeds from initialEntries", () => {
    const h = createPluginBrowserSearchHistory({
      initialEntries: ["a", "b", "c"],
    });
    expect(h.entries()).toEqual(["a", "b", "c"]);
  });

  it("dedupes initialEntries first-wins", () => {
    const h = createPluginBrowserSearchHistory({
      initialEntries: ["a", "A", "b", "a"],
    });
    expect(h.entries()).toEqual(["a", "b"]);
  });

  it("drops empty entries", () => {
    const h = createPluginBrowserSearchHistory({
      initialEntries: ["", "  ", "a"],
    });
    expect(h.entries()).toEqual(["a"]);
  });

  it("respects capacity on seed", () => {
    const h = createPluginBrowserSearchHistory({
      capacity: 2,
      initialEntries: ["a", "b", "c", "d"],
    });
    expect(h.entries()).toEqual(["a", "b"]);
  });
});

describe("createPluginBrowserSearchHistory — has", () => {
  it("empty / non-string queries return false", () => {
    const h = createPluginBrowserSearchHistory();
    h.record("a");
    expect(h.has("")).toBe(false);
    expect(h.has("   ")).toBe(false);
    expect(h.has(null as unknown as string)).toBe(false);
  });
});
