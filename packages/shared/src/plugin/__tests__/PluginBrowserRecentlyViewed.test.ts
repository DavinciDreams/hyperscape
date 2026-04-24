import { describe, expect, it } from "vitest";
import {
  type PluginBrowserRecentlyViewedEntry,
  createPluginBrowserRecentlyViewed,
} from "../PluginBrowserRecentlyViewed.js";

describe("createPluginBrowserRecentlyViewed — defaults", () => {
  it("starts empty", () => {
    const r = createPluginBrowserRecentlyViewed();
    expect(r.size()).toBe(0);
    expect(r.recent()).toEqual([]);
    expect(r.recentIds()).toEqual([]);
    expect(r.mostRecent()).toBeUndefined();
  });

  it("default capacity is 20", () => {
    const r = createPluginBrowserRecentlyViewed();
    expect(r.capacity()).toBe(20);
  });

  it("honors explicit capacity", () => {
    const r = createPluginBrowserRecentlyViewed({ capacity: 5 });
    expect(r.capacity()).toBe(5);
  });

  it("capacity=0 disables storage", () => {
    const r = createPluginBrowserRecentlyViewed({ capacity: 0 });
    expect(r.capacity()).toBe(0);
    expect(r.record("a", 1)).toBe(false);
    expect(r.size()).toBe(0);
  });

  it("negative capacity falls back to default", () => {
    const r = createPluginBrowserRecentlyViewed({ capacity: -5 });
    expect(r.capacity()).toBe(20);
  });

  it("non-finite capacity falls back to default", () => {
    const r = createPluginBrowserRecentlyViewed({
      capacity: Number.POSITIVE_INFINITY,
    });
    expect(r.capacity()).toBe(20);
  });

  it("fractional capacity truncates", () => {
    const r = createPluginBrowserRecentlyViewed({ capacity: 7.9 });
    expect(r.capacity()).toBe(7);
  });
});

describe("createPluginBrowserRecentlyViewed — record", () => {
  it("records most-recent first", () => {
    const r = createPluginBrowserRecentlyViewed();
    r.record("a", 1);
    r.record("b", 2);
    r.record("c", 3);
    expect(r.recentIds()).toEqual(["c", "b", "a"]);
  });

  it("promotes existing id to head and bumps timestamp", () => {
    const r = createPluginBrowserRecentlyViewed();
    r.record("a", 1);
    r.record("b", 2);
    r.record("c", 3);
    r.record("a", 4);
    expect(r.recentIds()).toEqual(["a", "c", "b"]);
    expect(r.mostRecent()).toEqual({
      pluginId: "a",
      recordedAtMs: 4,
    });
  });

  it("evicts the oldest past capacity", () => {
    const r = createPluginBrowserRecentlyViewed({ capacity: 3 });
    r.record("a", 1);
    r.record("b", 2);
    r.record("c", 3);
    r.record("d", 4);
    expect(r.recentIds()).toEqual(["d", "c", "b"]);
    expect(r.has("a")).toBe(false);
  });

  it("returns true on record success", () => {
    const r = createPluginBrowserRecentlyViewed();
    expect(r.record("a", 1)).toBe(true);
  });

  it("returns false on empty id", () => {
    const r = createPluginBrowserRecentlyViewed();
    expect(r.record("", 1)).toBe(false);
  });

  it("returns false on non-finite nowMs", () => {
    const r = createPluginBrowserRecentlyViewed();
    expect(r.record("a", Number.NaN)).toBe(false);
    expect(r.record("a", Number.POSITIVE_INFINITY)).toBe(false);
  });

  it("returns false when capacity is 0", () => {
    const r = createPluginBrowserRecentlyViewed({ capacity: 0 });
    expect(r.record("a", 1)).toBe(false);
  });
});

describe("createPluginBrowserRecentlyViewed — initialEntries", () => {
  it("seeds in given order", () => {
    const r = createPluginBrowserRecentlyViewed({
      initialEntries: [
        { pluginId: "a", recordedAtMs: 1 },
        { pluginId: "b", recordedAtMs: 2 },
        { pluginId: "c", recordedAtMs: 3 },
      ],
    });
    expect(r.recentIds()).toEqual(["c", "b", "a"]);
  });

  it("last-wins dedup promotes the later entry", () => {
    const r = createPluginBrowserRecentlyViewed({
      initialEntries: [
        { pluginId: "a", recordedAtMs: 1 },
        { pluginId: "b", recordedAtMs: 2 },
        { pluginId: "a", recordedAtMs: 3 },
      ],
    });
    expect(r.recentIds()).toEqual(["a", "b"]);
    expect(r.mostRecent()).toEqual({
      pluginId: "a",
      recordedAtMs: 3,
    });
  });

  it("drops invalid seed entries", () => {
    const r = createPluginBrowserRecentlyViewed({
      initialEntries: [
        { pluginId: "", recordedAtMs: 1 },
        { pluginId: "a", recordedAtMs: Number.NaN },
        { pluginId: "b", recordedAtMs: 2 },
      ],
    });
    expect(r.size()).toBe(1);
    expect(r.recentIds()).toEqual(["b"]);
  });

  it("caps seed to capacity (keeps the tail)", () => {
    const r = createPluginBrowserRecentlyViewed({
      capacity: 2,
      initialEntries: [
        { pluginId: "a", recordedAtMs: 1 },
        { pluginId: "b", recordedAtMs: 2 },
        { pluginId: "c", recordedAtMs: 3 },
      ],
    });
    expect(r.size()).toBe(2);
    expect(r.recentIds()).toEqual(["c", "b"]);
  });

  it("ignores seed when capacity is 0", () => {
    const r = createPluginBrowserRecentlyViewed({
      capacity: 0,
      initialEntries: [{ pluginId: "a", recordedAtMs: 1 }],
    });
    expect(r.size()).toBe(0);
  });
});

describe("createPluginBrowserRecentlyViewed — drop / has / clear", () => {
  it("drops an existing id", () => {
    const r = createPluginBrowserRecentlyViewed();
    r.record("a", 1);
    r.record("b", 2);
    expect(r.drop("a")).toBe(true);
    expect(r.has("a")).toBe(false);
    expect(r.recentIds()).toEqual(["b"]);
  });

  it("drop returns false on unknown id", () => {
    const r = createPluginBrowserRecentlyViewed();
    expect(r.drop("never-recorded")).toBe(false);
  });

  it("drop returns false on empty id", () => {
    const r = createPluginBrowserRecentlyViewed();
    r.record("a", 1);
    expect(r.drop("")).toBe(false);
    expect(r.size()).toBe(1);
  });

  it("has returns false on empty id", () => {
    const r = createPluginBrowserRecentlyViewed();
    r.record("a", 1);
    expect(r.has("")).toBe(false);
  });

  it("clear empties the memory", () => {
    const r = createPluginBrowserRecentlyViewed();
    r.record("a", 1);
    r.record("b", 2);
    r.clear();
    expect(r.size()).toBe(0);
    expect(r.recent()).toEqual([]);
  });
});

describe("createPluginBrowserRecentlyViewed — snapshot isolation", () => {
  it("recent() returns a fresh array", () => {
    const r = createPluginBrowserRecentlyViewed();
    r.record("a", 1);
    r.record("b", 2);
    const snap = r.recent() as PluginBrowserRecentlyViewedEntry[];
    snap.length = 0;
    expect(r.size()).toBe(2);
  });

  it("recentIds() returns a fresh array", () => {
    const r = createPluginBrowserRecentlyViewed();
    r.record("a", 1);
    const ids = r.recentIds() as string[];
    ids.push("zzz");
    expect(r.recentIds()).toEqual(["a"]);
  });
});
