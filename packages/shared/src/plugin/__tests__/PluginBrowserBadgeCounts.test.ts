import { describe, expect, it } from "vitest";
import { createPluginBrowserBadgeCounts } from "../PluginBrowserBadgeCounts.js";

describe("createPluginBrowserBadgeCounts — defaults", () => {
  it("starts empty", () => {
    const b = createPluginBrowserBadgeCounts();
    expect(b.size()).toBe(0);
    expect(b.entries()).toEqual([]);
    expect(b.count("a", "warnings")).toBe(0);
    expect(b.totalFor("a")).toBe(0);
    expect(b.pluginsWithBadges()).toEqual([]);
    expect(b.keysFor("a")).toEqual([]);
  });
});

describe("createPluginBrowserBadgeCounts — increment", () => {
  it("adds to an empty counter", () => {
    const b = createPluginBrowserBadgeCounts();
    expect(b.increment("a", "info")).toBe(1);
    expect(b.increment("a", "info", 3)).toBe(4);
    expect(b.count("a", "info")).toBe(4);
  });

  it("rejects empty ids (returns 0, no-op)", () => {
    const b = createPluginBrowserBadgeCounts();
    expect(b.increment("", "info")).toBe(0);
    expect(b.increment("a", "")).toBe(0);
    expect(b.size()).toBe(0);
  });

  it("floors non-integer by", () => {
    const b = createPluginBrowserBadgeCounts();
    expect(b.increment("a", "info", 2.9)).toBe(2);
  });

  it("treats NaN/Infinity by as 0", () => {
    const b = createPluginBrowserBadgeCounts();
    b.increment("a", "info", 5);
    expect(b.increment("a", "info", Number.NaN)).toBe(5);
    expect(b.increment("a", "info", Number.POSITIVE_INFINITY)).toBe(5);
  });

  it("clamps at 0 on negative that would underflow", () => {
    const b = createPluginBrowserBadgeCounts();
    b.increment("a", "info", 3);
    expect(b.increment("a", "info", -10)).toBe(0);
    expect(b.count("a", "info")).toBe(0);
  });

  it("removes entry entirely when reaching 0", () => {
    const b = createPluginBrowserBadgeCounts();
    b.increment("a", "info", 3);
    b.increment("a", "info", -3);
    expect(b.pluginsWithBadges()).toEqual([]);
    expect(b.keysFor("a")).toEqual([]);
  });

  it("supports multiple keys on same plugin", () => {
    const b = createPluginBrowserBadgeCounts();
    b.increment("a", "info", 1);
    b.increment("a", "warnings", 5);
    expect(b.count("a", "info")).toBe(1);
    expect(b.count("a", "warnings")).toBe(5);
    expect(b.totalFor("a")).toBe(6);
    expect(b.keysFor("a")).toEqual(["info", "warnings"]);
  });
});

describe("createPluginBrowserBadgeCounts — set", () => {
  it("overwrites an existing counter", () => {
    const b = createPluginBrowserBadgeCounts();
    b.increment("a", "info", 5);
    expect(b.set("a", "info", 12)).toBe(true);
    expect(b.count("a", "info")).toBe(12);
  });

  it("set(0) removes the entry", () => {
    const b = createPluginBrowserBadgeCounts();
    b.increment("a", "info", 5);
    expect(b.set("a", "info", 0)).toBe(true);
    expect(b.count("a", "info")).toBe(0);
    expect(b.pluginsWithBadges()).toEqual([]);
  });

  it("set(-5) clamps to 0 and removes", () => {
    const b = createPluginBrowserBadgeCounts();
    b.increment("a", "info", 5);
    expect(b.set("a", "info", -5)).toBe(true);
    expect(b.count("a", "info")).toBe(0);
  });

  it("set to same value is a no-op (returns false)", () => {
    const b = createPluginBrowserBadgeCounts();
    b.increment("a", "info", 5);
    expect(b.set("a", "info", 5)).toBe(false);
  });

  it("set(0) on a missing counter is a no-op", () => {
    const b = createPluginBrowserBadgeCounts();
    expect(b.set("a", "info", 0)).toBe(false);
    expect(b.entries()).toEqual([]);
  });

  it("floors non-integer value", () => {
    const b = createPluginBrowserBadgeCounts();
    b.set("a", "info", 2.9);
    expect(b.count("a", "info")).toBe(2);
  });
});

describe("createPluginBrowserBadgeCounts — reset / resetAll / clear", () => {
  it("reset removes a single counter", () => {
    const b = createPluginBrowserBadgeCounts();
    b.increment("a", "info", 1);
    b.increment("a", "warnings", 2);
    expect(b.reset("a", "info")).toBe(true);
    expect(b.count("a", "info")).toBe(0);
    expect(b.count("a", "warnings")).toBe(2);
  });

  it("reset auto-drops plugin when last key goes away", () => {
    const b = createPluginBrowserBadgeCounts();
    b.increment("a", "info", 1);
    b.reset("a", "info");
    expect(b.pluginsWithBadges()).toEqual([]);
  });

  it("reset on unknown key returns false", () => {
    const b = createPluginBrowserBadgeCounts();
    expect(b.reset("a", "info")).toBe(false);
  });

  it("resetAll drops every key on plugin", () => {
    const b = createPluginBrowserBadgeCounts();
    b.increment("a", "info", 1);
    b.increment("a", "warnings", 2);
    expect(b.resetAll("a")).toBe(true);
    expect(b.pluginsWithBadges()).toEqual([]);
  });

  it("resetAll on unknown plugin returns false", () => {
    const b = createPluginBrowserBadgeCounts();
    expect(b.resetAll("nope")).toBe(false);
  });

  it("clear wipes everything", () => {
    const b = createPluginBrowserBadgeCounts();
    b.increment("a", "info", 1);
    b.increment("b", "warnings", 2);
    b.clear();
    expect(b.size()).toBe(0);
    expect(b.entries()).toEqual([]);
  });
});

describe("createPluginBrowserBadgeCounts — totals and listing", () => {
  it("totalFor sums across keys", () => {
    const b = createPluginBrowserBadgeCounts();
    b.increment("a", "info", 1);
    b.increment("a", "warnings", 2);
    b.increment("a", "errors", 3);
    expect(b.totalFor("a")).toBe(6);
  });

  it("pluginsWithBadges preserves insertion order", () => {
    const b = createPluginBrowserBadgeCounts();
    b.increment("b", "x", 1);
    b.increment("a", "x", 1);
    b.increment("c", "x", 1);
    expect(b.pluginsWithBadges()).toEqual(["b", "a", "c"]);
  });

  it("entries snapshots (pluginId, key, count) in insertion order", () => {
    const b = createPluginBrowserBadgeCounts();
    b.increment("a", "info", 1);
    b.increment("a", "warnings", 2);
    b.increment("b", "info", 3);
    expect(b.entries()).toEqual([
      { pluginId: "a", key: "info", count: 1 },
      { pluginId: "a", key: "warnings", count: 2 },
      { pluginId: "b", key: "info", count: 3 },
    ]);
  });
});
