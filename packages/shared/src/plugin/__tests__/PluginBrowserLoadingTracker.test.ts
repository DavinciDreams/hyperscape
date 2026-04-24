import { describe, expect, it } from "vitest";
import { createPluginBrowserLoadingTracker } from "../PluginBrowserLoadingTracker.js";

describe("createPluginBrowserLoadingTracker — defaults", () => {
  it("starts idle", () => {
    const t = createPluginBrowserLoadingTracker();
    expect(t.busyCount()).toBe(0);
    expect(t.busyPluginIds()).toEqual([]);
    expect(t.entries()).toEqual([]);
  });

  it("isBusy + has return false for unknown input", () => {
    const t = createPluginBrowserLoadingTracker();
    expect(t.isBusy("x")).toBe(false);
    expect(t.has("x", "install")).toBe(false);
  });

  it("operationsFor returns empty for unknown id", () => {
    const t = createPluginBrowserLoadingTracker();
    expect(t.operationsFor("x")).toEqual([]);
  });
});

describe("createPluginBrowserLoadingTracker — start", () => {
  it("marks a plugin busy on first op", () => {
    const t = createPluginBrowserLoadingTracker();
    expect(t.start("a", "install")).toBe(true);
    expect(t.isBusy("a")).toBe(true);
    expect(t.has("a", "install")).toBe(true);
    expect(t.operationsFor("a")).toEqual(["install"]);
  });

  it("adds multiple operations (insertion order)", () => {
    const t = createPluginBrowserLoadingTracker();
    t.start("a", "install");
    t.start("a", "enable");
    t.start("a", "reload");
    expect(t.operationsFor("a")).toEqual(["install", "enable", "reload"]);
  });

  it("returns false when operation already in flight", () => {
    const t = createPluginBrowserLoadingTracker();
    t.start("a", "install");
    expect(t.start("a", "install")).toBe(false);
    expect(t.operationsFor("a")).toEqual(["install"]);
  });

  it("returns false on empty pluginId", () => {
    const t = createPluginBrowserLoadingTracker();
    expect(t.start("", "install")).toBe(false);
    expect(t.busyCount()).toBe(0);
  });

  it("returns false on empty operation", () => {
    const t = createPluginBrowserLoadingTracker();
    expect(t.start("a", "")).toBe(false);
    expect(t.busyCount()).toBe(0);
  });
});

describe("createPluginBrowserLoadingTracker — finish", () => {
  it("removes a specific operation", () => {
    const t = createPluginBrowserLoadingTracker();
    t.start("a", "install");
    t.start("a", "enable");
    expect(t.finish("a", "install")).toBe(true);
    expect(t.has("a", "install")).toBe(false);
    expect(t.has("a", "enable")).toBe(true);
    expect(t.isBusy("a")).toBe(true);
  });

  it("auto-drops plugin when its last op finishes", () => {
    const t = createPluginBrowserLoadingTracker();
    t.start("a", "install");
    t.finish("a", "install");
    expect(t.isBusy("a")).toBe(false);
    expect(t.busyCount()).toBe(0);
  });

  it("returns false on unknown pluginId", () => {
    const t = createPluginBrowserLoadingTracker();
    expect(t.finish("nope", "install")).toBe(false);
  });

  it("returns false on op that wasn't in flight", () => {
    const t = createPluginBrowserLoadingTracker();
    t.start("a", "install");
    expect(t.finish("a", "enable")).toBe(false);
  });

  it("returns false on empty ids", () => {
    const t = createPluginBrowserLoadingTracker();
    expect(t.finish("", "install")).toBe(false);
    expect(t.finish("a", "")).toBe(false);
  });
});

describe("createPluginBrowserLoadingTracker — finishAll", () => {
  it("drops every op for a plugin", () => {
    const t = createPluginBrowserLoadingTracker();
    t.start("a", "install");
    t.start("a", "enable");
    expect(t.finishAll("a")).toBe(true);
    expect(t.isBusy("a")).toBe(false);
    expect(t.busyCount()).toBe(0);
  });

  it("returns false when plugin wasn't busy", () => {
    const t = createPluginBrowserLoadingTracker();
    expect(t.finishAll("nope")).toBe(false);
  });

  it("returns false on empty pluginId", () => {
    const t = createPluginBrowserLoadingTracker();
    expect(t.finishAll("")).toBe(false);
  });
});

describe("createPluginBrowserLoadingTracker — busy fan-out", () => {
  it("tracks multiple busy plugins", () => {
    const t = createPluginBrowserLoadingTracker();
    t.start("a", "install");
    t.start("b", "enable");
    t.start("c", "reload");
    expect(t.busyCount()).toBe(3);
    expect(t.busyPluginIds()).toEqual(["a", "b", "c"]);
  });

  it("insertion order survives per-plugin op churn", () => {
    const t = createPluginBrowserLoadingTracker();
    t.start("a", "install");
    t.start("b", "install");
    t.finish("a", "install");
    t.start("a", "enable"); // re-inserts 'a' at the end
    expect(t.busyPluginIds()).toEqual(["b", "a"]);
  });
});

describe("createPluginBrowserLoadingTracker — clear", () => {
  it("drops every in-flight op", () => {
    const t = createPluginBrowserLoadingTracker();
    t.start("a", "install");
    t.start("b", "enable");
    t.clear();
    expect(t.busyCount()).toBe(0);
    expect(t.entries()).toEqual([]);
  });
});

describe("createPluginBrowserLoadingTracker — entries snapshot", () => {
  it("snapshots plugin+operations pairs", () => {
    const t = createPluginBrowserLoadingTracker();
    t.start("a", "install");
    t.start("a", "enable");
    t.start("b", "reload");
    expect(t.entries()).toEqual([
      { pluginId: "a", operations: ["install", "enable"] },
      { pluginId: "b", operations: ["reload"] },
    ]);
  });

  it("entries are independent arrays", () => {
    const t = createPluginBrowserLoadingTracker();
    t.start("a", "install");
    const snap = t.entries();
    (snap[0]!.operations as string[]).push("mutation");
    expect(t.operationsFor("a")).toEqual(["install"]);
  });
});
