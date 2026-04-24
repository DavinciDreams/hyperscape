import { describe, expect, it } from "vitest";
import { createPluginBrowserRetryQueue } from "../PluginBrowserRetryQueue.js";

describe("createPluginBrowserRetryQueue — defaults", () => {
  it("starts empty", () => {
    const q = createPluginBrowserRetryQueue();
    expect(q.size()).toBe(0);
    expect(q.entries()).toEqual([]);
    expect(q.has("a", "install")).toBe(false);
    expect(q.get("a", "install")).toBeUndefined();
    expect(q.attempts("a", "install")).toBe(0);
    expect(q.isReady("a", "install", 100)).toBe(false);
  });
});

describe("createPluginBrowserRetryQueue — scheduleFirst", () => {
  it("enqueues with attempts=1", () => {
    const q = createPluginBrowserRetryQueue();
    expect(q.scheduleFirst("a", "install", 500)).toBe(true);
    expect(q.has("a", "install")).toBe(true);
    expect(q.attempts("a", "install")).toBe(1);
    expect(q.get("a", "install")).toEqual({
      pluginId: "a",
      operation: "install",
      attempts: 1,
      nextAttemptAtMs: 500,
    });
  });

  it("rejects duplicate enqueue", () => {
    const q = createPluginBrowserRetryQueue();
    q.scheduleFirst("a", "install", 500);
    expect(q.scheduleFirst("a", "install", 700)).toBe(false);
    expect(q.get("a", "install")?.nextAttemptAtMs).toBe(500);
  });

  it("rejects empty ids", () => {
    const q = createPluginBrowserRetryQueue();
    expect(q.scheduleFirst("", "install", 500)).toBe(false);
    expect(q.scheduleFirst("a", "", 500)).toBe(false);
  });

  it("rejects non-finite timestamp", () => {
    const q = createPluginBrowserRetryQueue();
    expect(q.scheduleFirst("a", "install", Number.NaN)).toBe(false);
    expect(q.scheduleFirst("a", "install", Number.POSITIVE_INFINITY)).toBe(
      false,
    );
  });
});

describe("createPluginBrowserRetryQueue — scheduleNext", () => {
  it("bumps attempts and updates nextAttemptAtMs", () => {
    const q = createPluginBrowserRetryQueue();
    q.scheduleFirst("a", "install", 500);
    expect(q.scheduleNext("a", "install", 1500)).toBe(true);
    expect(q.attempts("a", "install")).toBe(2);
    expect(q.get("a", "install")?.nextAttemptAtMs).toBe(1500);
    expect(q.scheduleNext("a", "install", 3000)).toBe(true);
    expect(q.attempts("a", "install")).toBe(3);
  });

  it("rejects when entry doesn't exist", () => {
    const q = createPluginBrowserRetryQueue();
    expect(q.scheduleNext("a", "install", 500)).toBe(false);
  });

  it("rejects invalid input", () => {
    const q = createPluginBrowserRetryQueue();
    q.scheduleFirst("a", "install", 500);
    expect(q.scheduleNext("a", "install", Number.NaN)).toBe(false);
  });
});

describe("createPluginBrowserRetryQueue — isReady", () => {
  it("true when nowMs >= nextAttemptAtMs", () => {
    const q = createPluginBrowserRetryQueue();
    q.scheduleFirst("a", "install", 500);
    expect(q.isReady("a", "install", 499)).toBe(false);
    expect(q.isReady("a", "install", 500)).toBe(true);
    expect(q.isReady("a", "install", 501)).toBe(true);
  });

  it("false when entry missing", () => {
    const q = createPluginBrowserRetryQueue();
    expect(q.isReady("nope", "install", 500)).toBe(false);
  });

  it("false on invalid nowMs", () => {
    const q = createPluginBrowserRetryQueue();
    q.scheduleFirst("a", "install", 500);
    expect(q.isReady("a", "install", Number.NaN)).toBe(false);
  });
});

describe("createPluginBrowserRetryQueue — dequeue", () => {
  it("removes a single entry", () => {
    const q = createPluginBrowserRetryQueue();
    q.scheduleFirst("a", "install", 500);
    expect(q.dequeue("a", "install")).toBe(true);
    expect(q.has("a", "install")).toBe(false);
  });

  it("returns false on unknown entry", () => {
    const q = createPluginBrowserRetryQueue();
    expect(q.dequeue("a", "install")).toBe(false);
  });
});

describe("createPluginBrowserRetryQueue — dequeueAll", () => {
  it("removes all entries for a plugin", () => {
    const q = createPluginBrowserRetryQueue();
    q.scheduleFirst("a", "install", 500);
    q.scheduleFirst("a", "enable", 600);
    q.scheduleFirst("b", "install", 700);
    expect(q.dequeueAll("a")).toBe(true);
    expect(q.size()).toBe(1);
    expect(q.has("b", "install")).toBe(true);
  });

  it("returns false when plugin has nothing queued", () => {
    const q = createPluginBrowserRetryQueue();
    expect(q.dequeueAll("nope")).toBe(false);
  });
});

describe("createPluginBrowserRetryQueue — readyEntries", () => {
  it("filters and orders by nextAttemptAtMs ascending", () => {
    const q = createPluginBrowserRetryQueue();
    q.scheduleFirst("a", "install", 500);
    q.scheduleFirst("b", "install", 100);
    q.scheduleFirst("c", "install", 2000);
    q.scheduleFirst("d", "install", 300);
    const ready = q.readyEntries(600);
    expect(ready.map((e) => e.pluginId)).toEqual(["b", "d", "a"]);
  });

  it("breaks ties by insertion order", () => {
    const q = createPluginBrowserRetryQueue();
    q.scheduleFirst("a", "install", 100);
    q.scheduleFirst("b", "install", 100);
    q.scheduleFirst("c", "install", 100);
    const ready = q.readyEntries(200);
    expect(ready.map((e) => e.pluginId)).toEqual(["a", "b", "c"]);
  });

  it("returns empty on invalid nowMs", () => {
    const q = createPluginBrowserRetryQueue();
    q.scheduleFirst("a", "install", 500);
    expect(q.readyEntries(Number.NaN)).toEqual([]);
  });

  it("returns empty when nothing ready", () => {
    const q = createPluginBrowserRetryQueue();
    q.scheduleFirst("a", "install", 5000);
    expect(q.readyEntries(100)).toEqual([]);
  });
});

describe("createPluginBrowserRetryQueue — clear + size + entries", () => {
  it("size + entries track state", () => {
    const q = createPluginBrowserRetryQueue();
    q.scheduleFirst("a", "install", 500);
    q.scheduleFirst("b", "enable", 600);
    expect(q.size()).toBe(2);
    expect(q.entries().map((e) => e.pluginId)).toEqual(["a", "b"]);
  });

  it("clear wipes every entry", () => {
    const q = createPluginBrowserRetryQueue();
    q.scheduleFirst("a", "install", 500);
    q.scheduleFirst("b", "enable", 600);
    q.clear();
    expect(q.size()).toBe(0);
    expect(q.entries()).toEqual([]);
  });
});
