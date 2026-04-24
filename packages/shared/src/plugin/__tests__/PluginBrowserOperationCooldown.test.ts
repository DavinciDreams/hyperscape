import { describe, expect, it } from "vitest";
import { createPluginBrowserOperationCooldown } from "../PluginBrowserOperationCooldown.js";

describe("createPluginBrowserOperationCooldown — defaults", () => {
  it("starts empty", () => {
    const c = createPluginBrowserOperationCooldown();
    expect(c.all(0)).toEqual([]);
    expect(c.activeCount(0)).toBe(0);
    expect(c.remaining("p", "install", 0)).toBe(0);
    expect(c.isActive("p", "install", 0)).toBe(false);
  });
});

describe("createPluginBrowserOperationCooldown — start", () => {
  it("registers a cooldown and computes remaining", () => {
    const c = createPluginBrowserOperationCooldown();
    expect(c.start("p", "install", 1000, 0)).toBe(true);
    expect(c.isActive("p", "install", 0)).toBe(true);
    expect(c.remaining("p", "install", 0)).toBe(1000);
    expect(c.remaining("p", "install", 500)).toBe(500);
  });

  it("replaces prior cooldown on same (plugin, action)", () => {
    const c = createPluginBrowserOperationCooldown();
    c.start("p", "install", 1000, 0);
    c.start("p", "install", 2000, 100);
    expect(c.remaining("p", "install", 100)).toBe(2000);
  });

  it("keeps different actions independent", () => {
    const c = createPluginBrowserOperationCooldown();
    c.start("p", "install", 1000, 0);
    c.start("p", "remove", 500, 0);
    expect(c.isActive("p", "install", 0)).toBe(true);
    expect(c.isActive("p", "remove", 0)).toBe(true);
    expect(c.activeCount(0)).toBe(2);
  });

  it("rejects empty ids / non-positive duration / non-finite now", () => {
    const c = createPluginBrowserOperationCooldown();
    expect(c.start("", "install", 1000, 0)).toBe(false);
    expect(c.start("p", "", 1000, 0)).toBe(false);
    expect(c.start("p", "install", 0, 0)).toBe(false);
    expect(c.start("p", "install", -5, 0)).toBe(false);
    expect(c.start("p", "install", 1000, Number.NaN)).toBe(false);
    expect(c.start("p", "install", 1000, Number.POSITIVE_INFINITY)).toBe(false);
    expect(c.activeCount(0)).toBe(0);
  });
});

describe("createPluginBrowserOperationCooldown — remaining / isActive", () => {
  it("returns 0 / false once expired", () => {
    const c = createPluginBrowserOperationCooldown();
    c.start("p", "install", 1000, 0);
    expect(c.remaining("p", "install", 1000)).toBe(0);
    expect(c.isActive("p", "install", 1000)).toBe(false);
    expect(c.remaining("p", "install", 2000)).toBe(0);
  });

  it("unknown (plugin, action) returns 0 / false", () => {
    const c = createPluginBrowserOperationCooldown();
    expect(c.remaining("nope", "install", 0)).toBe(0);
    expect(c.isActive("nope", "install", 0)).toBe(false);
  });
});

describe("createPluginBrowserOperationCooldown — clear / clearPlugin", () => {
  it("clear removes a single entry", () => {
    const c = createPluginBrowserOperationCooldown();
    c.start("p", "install", 1000, 0);
    expect(c.clear("p", "install")).toBe(true);
    expect(c.isActive("p", "install", 0)).toBe(false);
  });

  it("clear returns false on unknown", () => {
    const c = createPluginBrowserOperationCooldown();
    expect(c.clear("nope", "install")).toBe(false);
  });

  it("clearPlugin removes every action for that plugin", () => {
    const c = createPluginBrowserOperationCooldown();
    c.start("a", "install", 1000, 0);
    c.start("a", "remove", 1000, 0);
    c.start("b", "install", 1000, 0);
    expect(c.clearPlugin("a")).toBe(2);
    expect(c.activeCount(0)).toBe(1);
    expect(c.isActive("b", "install", 0)).toBe(true);
  });
});

describe("createPluginBrowserOperationCooldown — clearExpired", () => {
  it("removes only entries whose expiry has passed", () => {
    const c = createPluginBrowserOperationCooldown();
    c.start("a", "install", 1000, 0); // expiresAt 1000
    c.start("b", "install", 2000, 0); // expiresAt 2000
    expect(c.clearExpired(1500)).toBe(1);
    expect(c.isActive("a", "install", 1500)).toBe(false);
    expect(c.isActive("b", "install", 1500)).toBe(true);
  });

  it("treats exact-now as expired (inclusive)", () => {
    const c = createPluginBrowserOperationCooldown();
    c.start("a", "install", 1000, 0);
    expect(c.clearExpired(1000)).toBe(1);
  });
});

describe("createPluginBrowserOperationCooldown — all / activeCount", () => {
  it("filters out expired entries", () => {
    const c = createPluginBrowserOperationCooldown();
    c.start("a", "install", 1000, 0);
    c.start("b", "install", 3000, 0);
    expect(c.all(1500).map((e) => e.pluginId)).toEqual(["b"]);
    expect(c.activeCount(1500)).toBe(1);
  });

  it("preserves insertion order among active entries", () => {
    const c = createPluginBrowserOperationCooldown();
    c.start("a", "install", 1000, 0);
    c.start("b", "install", 1000, 0);
    c.start("c", "install", 1000, 0);
    expect(c.all(500).map((e) => e.pluginId)).toEqual(["a", "b", "c"]);
  });
});

describe("createPluginBrowserOperationCooldown — reset", () => {
  it("wipes everything including non-expired entries", () => {
    const c = createPluginBrowserOperationCooldown();
    c.start("a", "install", 1000, 0);
    c.start("b", "install", 1000, 0);
    c.reset();
    expect(c.activeCount(0)).toBe(0);
    expect(c.all(0)).toEqual([]);
  });
});

describe("createPluginBrowserOperationCooldown — empty-id guards", () => {
  it("query methods reject empty ids", () => {
    const c = createPluginBrowserOperationCooldown();
    c.start("p", "install", 1000, 0);
    expect(c.remaining("", "install", 0)).toBe(0);
    expect(c.remaining("p", "", 0)).toBe(0);
    expect(c.isActive("", "install", 0)).toBe(false);
    expect(c.clear("", "install")).toBe(false);
    expect(c.clearPlugin("")).toBe(0);
  });
});
