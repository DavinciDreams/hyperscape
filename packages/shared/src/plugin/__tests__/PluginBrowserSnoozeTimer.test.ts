import { describe, expect, it } from "vitest";
import { createPluginBrowserSnoozeTimer } from "../PluginBrowserSnoozeTimer.js";

describe("createPluginBrowserSnoozeTimer — defaults", () => {
  it("starts empty", () => {
    const s = createPluginBrowserSnoozeTimer();
    expect(s.all(0)).toEqual([]);
    expect(s.count(0)).toBe(0);
    expect(s.isSnoozed("p", 0)).toBe(false);
    expect(s.remaining("p", 0)).toBe(0);
    expect(s.snoozedUntil("p")).toBeUndefined();
  });
});

describe("createPluginBrowserSnoozeTimer — snooze", () => {
  it("registers a snooze and reports remaining", () => {
    const s = createPluginBrowserSnoozeTimer();
    expect(s.snooze("p", 2000, 1000)).toBe(true);
    expect(s.isSnoozed("p", 1000)).toBe(true);
    expect(s.remaining("p", 1000)).toBe(1000);
    expect(s.remaining("p", 1500)).toBe(500);
    expect(s.snoozedUntil("p")).toBe(2000);
  });

  it("replaces prior snooze", () => {
    const s = createPluginBrowserSnoozeTimer();
    s.snooze("p", 2000, 1000);
    s.snooze("p", 5000, 1500);
    expect(s.snoozedUntil("p")).toBe(5000);
  });

  it("rejects empty id / non-finite time / past expiry", () => {
    const s = createPluginBrowserSnoozeTimer();
    expect(s.snooze("", 2000, 1000)).toBe(false);
    expect(s.snooze("p", Number.NaN, 1000)).toBe(false);
    expect(s.snooze("p", 2000, Number.POSITIVE_INFINITY)).toBe(false);
    expect(s.snooze("p", 1000, 1000)).toBe(false); // equal is not strictly-after
    expect(s.snooze("p", 500, 1000)).toBe(false); // past
    expect(s.count(1000)).toBe(0);
  });

  it("preserves insertion order across distinct plugins", () => {
    const s = createPluginBrowserSnoozeTimer();
    s.snooze("a", 2000, 0);
    s.snooze("b", 2000, 0);
    s.snooze("c", 2000, 0);
    expect(s.all(1000).map((e) => e.pluginId)).toEqual(["a", "b", "c"]);
  });
});

describe("createPluginBrowserSnoozeTimer — isSnoozed / remaining", () => {
  it("returns false / 0 once expired", () => {
    const s = createPluginBrowserSnoozeTimer();
    s.snooze("p", 1000, 0);
    expect(s.isSnoozed("p", 1000)).toBe(false);
    expect(s.isSnoozed("p", 5000)).toBe(false);
    expect(s.remaining("p", 2000)).toBe(0);
  });

  it("unknown plugin returns false / 0", () => {
    const s = createPluginBrowserSnoozeTimer();
    expect(s.isSnoozed("nope", 0)).toBe(false);
    expect(s.remaining("nope", 0)).toBe(0);
  });

  it("snoozedUntil returns raw expiry even after it passes", () => {
    const s = createPluginBrowserSnoozeTimer();
    s.snooze("p", 1000, 0);
    expect(s.snoozedUntil("p")).toBe(1000);
  });
});

describe("createPluginBrowserSnoozeTimer — unsnooze", () => {
  it("removes an active entry", () => {
    const s = createPluginBrowserSnoozeTimer();
    s.snooze("p", 2000, 1000);
    expect(s.unsnooze("p")).toBe(true);
    expect(s.isSnoozed("p", 1500)).toBe(false);
  });

  it("unknown returns false", () => {
    const s = createPluginBrowserSnoozeTimer();
    expect(s.unsnooze("nope")).toBe(false);
  });
});

describe("createPluginBrowserSnoozeTimer — clearExpired", () => {
  it("removes only entries at-or-before nowMs", () => {
    const s = createPluginBrowserSnoozeTimer();
    s.snooze("a", 1000, 0);
    s.snooze("b", 2000, 0);
    expect(s.clearExpired(1500)).toBe(1);
    expect(s.isSnoozed("a", 1500)).toBe(false);
    expect(s.isSnoozed("b", 1500)).toBe(true);
  });

  it("treats exact-now as expired (inclusive)", () => {
    const s = createPluginBrowserSnoozeTimer();
    s.snooze("a", 1000, 0);
    expect(s.clearExpired(1000)).toBe(1);
  });

  it("non-finite nowMs is a no-op", () => {
    const s = createPluginBrowserSnoozeTimer();
    s.snooze("a", 1000, 0);
    expect(s.clearExpired(Number.NaN)).toBe(0);
  });
});

describe("createPluginBrowserSnoozeTimer — all / count", () => {
  it("filter out expired entries", () => {
    const s = createPluginBrowserSnoozeTimer();
    s.snooze("a", 1000, 0);
    s.snooze("b", 3000, 0);
    expect(s.all(1500).map((e) => e.pluginId)).toEqual(["b"]);
    expect(s.count(1500)).toBe(1);
  });

  it("return empty / 0 for non-finite nowMs", () => {
    const s = createPluginBrowserSnoozeTimer();
    s.snooze("a", 1000, 0);
    expect(s.all(Number.NaN)).toEqual([]);
    expect(s.count(Number.NaN)).toBe(0);
  });
});

describe("createPluginBrowserSnoozeTimer — reset", () => {
  it("wipes everything including non-expired", () => {
    const s = createPluginBrowserSnoozeTimer();
    s.snooze("a", 1000, 0);
    s.snooze("b", 2000, 0);
    s.reset();
    expect(s.count(0)).toBe(0);
    expect(s.all(0)).toEqual([]);
  });
});
