import { describe, expect, it } from "vitest";
import { createPluginBrowserScrollMemory } from "../PluginBrowserScrollMemory.js";

describe("createPluginBrowserScrollMemory — initial state", () => {
  it("starts empty", () => {
    const m = createPluginBrowserScrollMemory();
    expect(m.size()).toBe(0);
    expect(m.snapshot()).toEqual([]);
  });

  it("get() returns 0 for unknown key", () => {
    const m = createPluginBrowserScrollMemory();
    expect(m.get("nope")).toBe(0);
  });

  it("has() is false for unknown key", () => {
    const m = createPluginBrowserScrollMemory();
    expect(m.has("nope")).toBe(false);
  });

  it("uses default capacity when not specified", () => {
    const m = createPluginBrowserScrollMemory();
    expect(m.capacity()).toBe(64);
  });

  it("honors a custom capacity", () => {
    const m = createPluginBrowserScrollMemory({ capacity: 3 });
    expect(m.capacity()).toBe(3);
  });
});

describe("createPluginBrowserScrollMemory — remember/get", () => {
  it("records and retrieves a position", () => {
    const m = createPluginBrowserScrollMemory();
    m.remember("errors", 420);
    expect(m.get("errors")).toBe(420);
    expect(m.has("errors")).toBe(true);
  });

  it("floors fractional scrollTop", () => {
    const m = createPluginBrowserScrollMemory();
    m.remember("errors", 420.9);
    expect(m.get("errors")).toBe(420);
  });

  it("clamps negative scrollTop to 0", () => {
    const m = createPluginBrowserScrollMemory();
    m.remember("errors", -50);
    expect(m.get("errors")).toBe(0);
  });

  it("silently ignores NaN + Infinity", () => {
    const m = createPluginBrowserScrollMemory();
    m.remember("errors", 100);
    m.remember("errors", Number.NaN);
    m.remember("errors", Number.POSITIVE_INFINITY);
    m.remember("errors", Number.NEGATIVE_INFINITY);
    expect(m.get("errors")).toBe(100);
  });

  it("silently ignores empty view keys", () => {
    const m = createPluginBrowserScrollMemory();
    m.remember("", 100);
    expect(m.size()).toBe(0);
  });

  it("silently ignores non-string keys", () => {
    const m = createPluginBrowserScrollMemory();
    m.remember(42 as unknown as string, 100);
    m.remember(null as unknown as string, 100);
    expect(m.size()).toBe(0);
  });

  it("overwrites the value for an existing key", () => {
    const m = createPluginBrowserScrollMemory();
    m.remember("errors", 100);
    m.remember("errors", 200);
    expect(m.get("errors")).toBe(200);
    expect(m.size()).toBe(1);
  });
});

describe("createPluginBrowserScrollMemory — forget", () => {
  it("forgets one entry", () => {
    const m = createPluginBrowserScrollMemory();
    m.remember("a", 10);
    m.remember("b", 20);
    m.forget("a");
    expect(m.has("a")).toBe(false);
    expect(m.has("b")).toBe(true);
  });

  it("forget unknown key is a no-op", () => {
    const m = createPluginBrowserScrollMemory();
    m.remember("a", 10);
    expect(() => m.forget("zzz")).not.toThrow();
    expect(m.size()).toBe(1);
  });

  it("forgetAll clears everything", () => {
    const m = createPluginBrowserScrollMemory();
    m.remember("a", 10);
    m.remember("b", 20);
    m.forgetAll();
    expect(m.size()).toBe(0);
    expect(m.snapshot()).toEqual([]);
  });
});

describe("createPluginBrowserScrollMemory — LRU eviction", () => {
  it("evicts the oldest entry past capacity", () => {
    const m = createPluginBrowserScrollMemory({ capacity: 2 });
    m.remember("a", 10);
    m.remember("b", 20);
    m.remember("c", 30);
    expect(m.has("a")).toBe(false);
    expect(m.has("b")).toBe(true);
    expect(m.has("c")).toBe(true);
  });

  it("writing to an existing key moves it to MRU", () => {
    const m = createPluginBrowserScrollMemory({ capacity: 2 });
    m.remember("a", 10);
    m.remember("b", 20);
    m.remember("a", 15); // refresh a → move to tail
    m.remember("c", 30); // should evict b, not a
    expect(m.has("a")).toBe(true);
    expect(m.has("b")).toBe(false);
    expect(m.has("c")).toBe(true);
  });

  it("capacity=0 disables memory entirely", () => {
    const m = createPluginBrowserScrollMemory({ capacity: 0 });
    m.remember("a", 10);
    expect(m.size()).toBe(0);
    expect(m.get("a")).toBe(0);
  });

  it("non-finite capacity falls back to default", () => {
    const m = createPluginBrowserScrollMemory({
      capacity: Number.NaN,
    });
    expect(m.capacity()).toBe(64);
  });

  it("negative capacity is clamped to 0 (memory disabled)", () => {
    const m = createPluginBrowserScrollMemory({
      capacity: -5,
    });
    m.remember("a", 10);
    expect(m.size()).toBe(0);
  });
});

describe("createPluginBrowserScrollMemory — snapshot order", () => {
  it("snapshot is LRU → MRU", () => {
    const m = createPluginBrowserScrollMemory();
    m.remember("a", 10);
    m.remember("b", 20);
    m.remember("c", 30);
    expect(m.snapshot().map((e) => e.viewKey)).toEqual(["a", "b", "c"]);
  });

  it("snapshot reflects move-to-tail on overwrite", () => {
    const m = createPluginBrowserScrollMemory();
    m.remember("a", 10);
    m.remember("b", 20);
    m.remember("a", 15);
    expect(m.snapshot().map((e) => e.viewKey)).toEqual(["b", "a"]);
  });
});
