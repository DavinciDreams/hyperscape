import { describe, expect, it } from "vitest";
import { createPluginBrowserMutedPlugins } from "../PluginBrowserMutedPlugins.js";

describe("createPluginBrowserMutedPlugins — defaults", () => {
  it("starts empty", () => {
    const m = createPluginBrowserMutedPlugins();
    expect(m.size(100)).toBe(0);
    expect(m.mutedIds(100)).toEqual([]);
    expect(m.entries()).toEqual([]);
    expect(m.isMuted("a", 100)).toBe(false);
    expect(m.mutedUntilMs("a")).toBeUndefined();
  });
});

describe("createPluginBrowserMutedPlugins — mute (permanent)", () => {
  it("records a permanent mute", () => {
    const m = createPluginBrowserMutedPlugins();
    expect(m.mute("a")).toBe(true);
    expect(m.isMuted("a", 10)).toBe(true);
    expect(m.isMuted("a", Number.MAX_SAFE_INTEGER)).toBe(true);
    expect(m.mutedUntilMs("a")).toBeUndefined();
  });

  it("is idempotent on re-mute", () => {
    const m = createPluginBrowserMutedPlugins();
    m.mute("a");
    expect(m.mute("a")).toBe(false);
  });

  it("promotes a timed mute to permanent", () => {
    const m = createPluginBrowserMutedPlugins();
    m.muteUntil("a", 500);
    expect(m.mute("a")).toBe(true);
    expect(m.mutedUntilMs("a")).toBeUndefined();
  });

  it("rejects empty id", () => {
    const m = createPluginBrowserMutedPlugins();
    expect(m.mute("")).toBe(false);
    expect(m.entries()).toEqual([]);
  });
});

describe("createPluginBrowserMutedPlugins — muteUntil", () => {
  it("records a timed mute", () => {
    const m = createPluginBrowserMutedPlugins();
    expect(m.muteUntil("a", 500)).toBe(true);
    expect(m.isMuted("a", 400)).toBe(true);
    expect(m.isMuted("a", 500)).toBe(false);
    expect(m.isMuted("a", 600)).toBe(false);
    expect(m.mutedUntilMs("a")).toBe(500);
  });

  it("replaces an existing mute", () => {
    const m = createPluginBrowserMutedPlugins();
    m.muteUntil("a", 500);
    expect(m.muteUntil("a", 1000)).toBe(true);
    expect(m.mutedUntilMs("a")).toBe(1000);
  });

  it("is idempotent when re-muting to same expiry", () => {
    const m = createPluginBrowserMutedPlugins();
    m.muteUntil("a", 500);
    expect(m.muteUntil("a", 500)).toBe(false);
  });

  it("rejects non-finite expiry", () => {
    const m = createPluginBrowserMutedPlugins();
    expect(m.muteUntil("a", Number.NaN)).toBe(false);
    expect(m.muteUntil("a", Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe("createPluginBrowserMutedPlugins — muteFor", () => {
  it("computes absolute expiry from nowMs + durationMs", () => {
    const m = createPluginBrowserMutedPlugins();
    expect(m.muteFor("a", 100, 400)).toBe(true);
    expect(m.mutedUntilMs("a")).toBe(500);
    expect(m.isMuted("a", 499)).toBe(true);
    expect(m.isMuted("a", 500)).toBe(false);
  });

  it("rejects zero or negative duration", () => {
    const m = createPluginBrowserMutedPlugins();
    expect(m.muteFor("a", 100, 0)).toBe(false);
    expect(m.muteFor("a", 100, -1)).toBe(false);
  });

  it("rejects non-finite nowMs or durationMs", () => {
    const m = createPluginBrowserMutedPlugins();
    expect(m.muteFor("a", Number.NaN, 100)).toBe(false);
    expect(m.muteFor("a", 100, Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe("createPluginBrowserMutedPlugins — unmute", () => {
  it("removes a permanent mute", () => {
    const m = createPluginBrowserMutedPlugins();
    m.mute("a");
    expect(m.unmute("a")).toBe(true);
    expect(m.isMuted("a", 10)).toBe(false);
  });

  it("removes a timed mute", () => {
    const m = createPluginBrowserMutedPlugins();
    m.muteUntil("a", 500);
    expect(m.unmute("a")).toBe(true);
  });

  it("returns false on unknown id", () => {
    const m = createPluginBrowserMutedPlugins();
    expect(m.unmute("nope")).toBe(false);
  });
});

describe("createPluginBrowserMutedPlugins — pruneExpired", () => {
  it("removes only expired entries", () => {
    const m = createPluginBrowserMutedPlugins();
    m.muteUntil("a", 100);
    m.muteUntil("b", 500);
    m.mute("c");
    expect(m.pruneExpired(300)).toBe(1);
    expect(m.entries().map((e) => e.pluginId)).toEqual(["b", "c"]);
  });

  it("returns 0 when nothing is expired", () => {
    const m = createPluginBrowserMutedPlugins();
    m.muteUntil("a", 500);
    expect(m.pruneExpired(100)).toBe(0);
  });

  it("leaves permanent mutes intact at large nowMs", () => {
    const m = createPluginBrowserMutedPlugins();
    m.mute("a");
    expect(m.pruneExpired(Number.MAX_SAFE_INTEGER)).toBe(0);
    expect(m.isMuted("a", Number.MAX_SAFE_INTEGER)).toBe(true);
  });

  it("rejects non-finite nowMs", () => {
    const m = createPluginBrowserMutedPlugins();
    m.muteUntil("a", 100);
    expect(m.pruneExpired(Number.NaN)).toBe(0);
    expect(m.entries().length).toBe(1);
  });
});

describe("createPluginBrowserMutedPlugins — mutedIds / size", () => {
  it("lists active mutes at nowMs in insertion order", () => {
    const m = createPluginBrowserMutedPlugins();
    m.muteUntil("a", 100);
    m.mute("b");
    m.muteUntil("c", 500);
    expect(m.mutedIds(50)).toEqual(["a", "b", "c"]);
    expect(m.mutedIds(200)).toEqual(["b", "c"]);
    expect(m.mutedIds(600)).toEqual(["b"]);
    expect(m.size(200)).toBe(2);
  });

  it("returns [] / 0 on invalid nowMs", () => {
    const m = createPluginBrowserMutedPlugins();
    m.mute("a");
    expect(m.mutedIds(Number.NaN)).toEqual([]);
    expect(m.size(Number.NaN)).toBe(0);
  });
});

describe("createPluginBrowserMutedPlugins — clear + entries", () => {
  it("clear wipes all entries", () => {
    const m = createPluginBrowserMutedPlugins();
    m.mute("a");
    m.muteUntil("b", 500);
    m.clear();
    expect(m.entries()).toEqual([]);
  });

  it("entries reports expired entries too (until pruned)", () => {
    const m = createPluginBrowserMutedPlugins();
    m.muteUntil("a", 100);
    expect(m.entries()).toEqual([{ pluginId: "a", expiresAtMs: 100 }]);
  });
});
