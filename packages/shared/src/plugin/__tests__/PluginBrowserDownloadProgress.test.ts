import { describe, expect, it } from "vitest";
import { createPluginBrowserDownloadProgress } from "../PluginBrowserDownloadProgress.js";

describe("createPluginBrowserDownloadProgress — defaults", () => {
  it("starts empty", () => {
    const p = createPluginBrowserDownloadProgress();
    expect(p.getProgress("a")).toBeUndefined();
    expect(p.isActive("a")).toBe(false);
    expect(p.percentage("a")).toBeUndefined();
    expect(p.activeCount()).toBe(0);
    expect(p.pluginsTracked()).toEqual([]);
    expect(p.entries()).toEqual([]);
  });
});

describe("createPluginBrowserDownloadProgress — start", () => {
  it("records a new active entry", () => {
    const p = createPluginBrowserDownloadProgress();
    expect(p.start("a", 1000)).toBe(true);
    expect(p.isActive("a")).toBe(true);
    expect(p.getProgress("a")).toEqual({
      pluginId: "a",
      status: "active",
      doneBytes: 0,
      totalBytes: 1000,
    });
    expect(p.activeCount()).toBe(1);
  });

  it("refuses to start when active entry exists", () => {
    const p = createPluginBrowserDownloadProgress();
    p.start("a", 1000);
    expect(p.start("a", 2000)).toBe(false);
    expect(p.getProgress("a")?.totalBytes).toBe(1000);
  });

  it("replaces terminal entries", () => {
    const p = createPluginBrowserDownloadProgress();
    p.start("a", 1000);
    p.complete("a");
    expect(p.start("a", 2000)).toBe(true);
    expect(p.getProgress("a")).toEqual({
      pluginId: "a",
      status: "active",
      doneBytes: 0,
      totalBytes: 2000,
    });
  });

  it("rejects invalid input", () => {
    const p = createPluginBrowserDownloadProgress();
    expect(p.start("", 1000)).toBe(false);
    expect(p.start("a", 0)).toBe(false);
    expect(p.start("a", -10)).toBe(false);
    expect(p.start("a", Number.NaN)).toBe(false);
    expect(p.start("a", Number.POSITIVE_INFINITY)).toBe(false);
    expect(p.activeCount()).toBe(0);
  });
});

describe("createPluginBrowserDownloadProgress — update", () => {
  it("updates doneBytes on active entry", () => {
    const p = createPluginBrowserDownloadProgress();
    p.start("a", 1000);
    expect(p.update("a", 500)).toBe(true);
    expect(p.getProgress("a")?.doneBytes).toBe(500);
  });

  it("is idempotent when value unchanged", () => {
    const p = createPluginBrowserDownloadProgress();
    p.start("a", 1000);
    p.update("a", 500);
    expect(p.update("a", 500)).toBe(false);
  });

  it("clamps to [0, totalBytes]", () => {
    const p = createPluginBrowserDownloadProgress();
    p.start("a", 1000);
    p.update("a", -50);
    expect(p.getProgress("a")?.doneBytes).toBe(0);
    p.update("a", 5000);
    expect(p.getProgress("a")?.doneBytes).toBe(1000);
  });

  it("rejects non-finite", () => {
    const p = createPluginBrowserDownloadProgress();
    p.start("a", 1000);
    p.update("a", 500);
    p.update("a", Number.NaN);
    expect(p.getProgress("a")?.doneBytes).toBe(0);
  });

  it("no-op on missing / terminal entry", () => {
    const p = createPluginBrowserDownloadProgress();
    expect(p.update("a", 10)).toBe(false);
    p.start("a", 1000);
    p.complete("a");
    expect(p.update("a", 500)).toBe(false);
    expect(p.getProgress("a")?.doneBytes).toBe(1000);
  });

  it("rejects empty id", () => {
    const p = createPluginBrowserDownloadProgress();
    expect(p.update("", 50)).toBe(false);
  });
});

describe("createPluginBrowserDownloadProgress — complete", () => {
  it("marks entry completed, sets doneBytes := totalBytes", () => {
    const p = createPluginBrowserDownloadProgress();
    p.start("a", 1000);
    p.update("a", 300);
    const result = p.complete("a");
    expect(result).toEqual({
      pluginId: "a",
      status: "completed",
      doneBytes: 1000,
      totalBytes: 1000,
    });
    expect(p.isActive("a")).toBe(false);
    expect(p.activeCount()).toBe(0);
  });

  it("returns undefined when not active", () => {
    const p = createPluginBrowserDownloadProgress();
    expect(p.complete("a")).toBeUndefined();
    p.start("a", 100);
    p.fail("a", "boom");
    expect(p.complete("a")).toBeUndefined();
  });
});

describe("createPluginBrowserDownloadProgress — fail", () => {
  it("marks entry failed with reason", () => {
    const p = createPluginBrowserDownloadProgress();
    p.start("a", 1000);
    p.update("a", 300);
    const result = p.fail("a", "network timeout");
    expect(result).toEqual({
      pluginId: "a",
      status: "failed",
      doneBytes: 300,
      totalBytes: 1000,
      reason: "network timeout",
    });
  });

  it("rejects empty reason", () => {
    const p = createPluginBrowserDownloadProgress();
    p.start("a", 1000);
    expect(p.fail("a", "")).toBeUndefined();
    expect(p.isActive("a")).toBe(true);
  });

  it("returns undefined when not active", () => {
    const p = createPluginBrowserDownloadProgress();
    expect(p.fail("a", "x")).toBeUndefined();
  });
});

describe("createPluginBrowserDownloadProgress — cancel", () => {
  it("marks entry canceled, preserves doneBytes", () => {
    const p = createPluginBrowserDownloadProgress();
    p.start("a", 1000);
    p.update("a", 700);
    const result = p.cancel("a");
    expect(result).toEqual({
      pluginId: "a",
      status: "canceled",
      doneBytes: 700,
      totalBytes: 1000,
    });
  });

  it("returns undefined when not active", () => {
    const p = createPluginBrowserDownloadProgress();
    expect(p.cancel("a")).toBeUndefined();
  });
});

describe("createPluginBrowserDownloadProgress — percentage", () => {
  it("computes done/total", () => {
    const p = createPluginBrowserDownloadProgress();
    p.start("a", 1000);
    p.update("a", 250);
    expect(p.percentage("a")).toBeCloseTo(0.25);
  });

  it("unknown plugin returns undefined", () => {
    const p = createPluginBrowserDownloadProgress();
    expect(p.percentage("a")).toBeUndefined();
  });

  it("empty id returns undefined", () => {
    const p = createPluginBrowserDownloadProgress();
    expect(p.percentage("")).toBeUndefined();
  });
});

describe("createPluginBrowserDownloadProgress — remove + clear", () => {
  it("refuses to remove while active", () => {
    const p = createPluginBrowserDownloadProgress();
    p.start("a", 100);
    expect(p.remove("a")).toBe(false);
    expect(p.getProgress("a")?.status).toBe("active");
  });

  it("removes terminal entries", () => {
    const p = createPluginBrowserDownloadProgress();
    p.start("a", 100);
    p.complete("a");
    expect(p.remove("a")).toBe(true);
    expect(p.getProgress("a")).toBeUndefined();
  });

  it("clear wipes everything including active", () => {
    const p = createPluginBrowserDownloadProgress();
    p.start("a", 100);
    p.start("b", 100);
    p.complete("b");
    p.clear();
    expect(p.pluginsTracked()).toEqual([]);
  });

  it("returns false on unknown / empty id", () => {
    const p = createPluginBrowserDownloadProgress();
    expect(p.remove("a")).toBe(false);
    expect(p.remove("")).toBe(false);
  });
});

describe("createPluginBrowserDownloadProgress — projection", () => {
  it("entries snapshots every record", () => {
    const p = createPluginBrowserDownloadProgress();
    p.start("a", 1000);
    p.update("a", 100);
    p.start("b", 500);
    p.complete("b");
    expect(p.entries()).toEqual([
      { pluginId: "a", status: "active", doneBytes: 100, totalBytes: 1000 },
      { pluginId: "b", status: "completed", doneBytes: 500, totalBytes: 500 },
    ]);
  });

  it("pluginsTracked preserves insertion order", () => {
    const p = createPluginBrowserDownloadProgress();
    p.start("c", 100);
    p.start("a", 100);
    p.start("b", 100);
    expect(p.pluginsTracked()).toEqual(["c", "a", "b"]);
  });

  it("activeCount distinguishes active from terminal", () => {
    const p = createPluginBrowserDownloadProgress();
    p.start("a", 100);
    p.start("b", 100);
    p.complete("b");
    p.start("c", 100);
    p.cancel("c");
    expect(p.activeCount()).toBe(1);
  });
});
