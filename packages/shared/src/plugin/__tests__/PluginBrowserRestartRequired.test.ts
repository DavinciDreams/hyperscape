import { describe, expect, it } from "vitest";
import { createPluginBrowserRestartRequired } from "../PluginBrowserRestartRequired.js";

describe("createPluginBrowserRestartRequired — defaults", () => {
  it("starts empty", () => {
    const r = createPluginBrowserRestartRequired();
    expect(r.all()).toEqual([]);
    expect(r.oldestFirst()).toEqual([]);
    expect(r.count()).toBe(0);
    expect(r.get("p")).toBeUndefined();
    expect(r.isScheduled("p")).toBe(false);
  });
});

describe("createPluginBrowserRestartRequired — schedule", () => {
  it("records a new entry", () => {
    const r = createPluginBrowserRestartRequired();
    expect(r.schedule("p", "updated", 1000)).toBe(true);
    expect(r.get("p")).toEqual({
      pluginId: "p",
      reason: "updated",
      scheduledAtMs: 1000,
    });
  });

  it("omits undefined reason", () => {
    const r = createPluginBrowserRestartRequired();
    r.schedule("p", undefined, 1000);
    expect(r.get("p")).toEqual({
      pluginId: "p",
      scheduledAtMs: 1000,
    });
  });

  it("normalizes empty-string reason to undefined", () => {
    const r = createPluginBrowserRestartRequired();
    r.schedule("p", "", 1000);
    expect(r.get("p")?.reason).toBeUndefined();
  });

  it("replaces prior entry — new reason + timestamp win", () => {
    const r = createPluginBrowserRestartRequired();
    r.schedule("p", "updated", 1000);
    r.schedule("p", "permissions", 2000);
    expect(r.get("p")).toEqual({
      pluginId: "p",
      reason: "permissions",
      scheduledAtMs: 2000,
    });
    expect(r.count()).toBe(1);
  });

  it("rejects empty id / non-finite time", () => {
    const r = createPluginBrowserRestartRequired();
    expect(r.schedule("", "x", 1000)).toBe(false);
    expect(r.schedule("p", "x", Number.NaN)).toBe(false);
    expect(r.schedule("p", "x", Number.POSITIVE_INFINITY)).toBe(false);
    expect(r.count()).toBe(0);
  });

  it("preserves insertion order across distinct plugins", () => {
    const r = createPluginBrowserRestartRequired();
    r.schedule("a", undefined, 100);
    r.schedule("b", undefined, 50);
    r.schedule("c", undefined, 75);
    expect(r.all().map((e) => e.pluginId)).toEqual(["a", "b", "c"]);
  });
});

describe("createPluginBrowserRestartRequired — cancel", () => {
  it("removes an entry", () => {
    const r = createPluginBrowserRestartRequired();
    r.schedule("p", undefined, 1000);
    expect(r.cancel("p")).toBe(true);
    expect(r.isScheduled("p")).toBe(false);
  });

  it("unknown returns false", () => {
    const r = createPluginBrowserRestartRequired();
    expect(r.cancel("nope")).toBe(false);
  });

  it("rejects empty id", () => {
    const r = createPluginBrowserRestartRequired();
    r.schedule("p", undefined, 1000);
    expect(r.cancel("")).toBe(false);
    expect(r.isScheduled("p")).toBe(true);
  });
});

describe("createPluginBrowserRestartRequired — oldestFirst", () => {
  it("sorts by scheduledAtMs ascending", () => {
    const r = createPluginBrowserRestartRequired();
    r.schedule("a", undefined, 300);
    r.schedule("b", undefined, 100);
    r.schedule("c", undefined, 200);
    expect(r.oldestFirst().map((e) => e.pluginId)).toEqual(["b", "c", "a"]);
  });

  it("breaks ties by insertion order", () => {
    const r = createPluginBrowserRestartRequired();
    r.schedule("a", undefined, 100);
    r.schedule("b", undefined, 100);
    r.schedule("c", undefined, 100);
    expect(r.oldestFirst().map((e) => e.pluginId)).toEqual(["a", "b", "c"]);
  });
});

describe("createPluginBrowserRestartRequired — clearAll", () => {
  it("wipes everything", () => {
    const r = createPluginBrowserRestartRequired();
    r.schedule("a", undefined, 100);
    r.schedule("b", undefined, 200);
    r.clearAll();
    expect(r.count()).toBe(0);
    expect(r.all()).toEqual([]);
  });
});

describe("createPluginBrowserRestartRequired — empty-id guards", () => {
  it("query methods reject empty ids", () => {
    const r = createPluginBrowserRestartRequired();
    r.schedule("p", undefined, 100);
    expect(r.get("")).toBeUndefined();
    expect(r.isScheduled("")).toBe(false);
  });
});
