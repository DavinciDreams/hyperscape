import { describe, expect, it } from "vitest";
import { createPluginBrowserTelemetryOptIn } from "../PluginBrowserTelemetryOptIn.js";

describe("createPluginBrowserTelemetryOptIn — defaults", () => {
  it("starts empty with no decisions", () => {
    const t = createPluginBrowserTelemetryOptIn();
    expect(t.all()).toEqual([]);
    expect(t.get("crashReports")).toBe("undecided");
    expect(t.getEntry("crashReports")).toBeUndefined();
    expect(t.anyOptedIn()).toBe(false);
    expect(t.allDecided([])).toBe(true);
    expect(t.allDecided(["crashReports"])).toBe(false);
    expect(t.listPending(["crashReports"])).toEqual(["crashReports"]);
  });
});

describe("createPluginBrowserTelemetryOptIn — setDecision", () => {
  it("stores a new optedIn decision", () => {
    const t = createPluginBrowserTelemetryOptIn();
    expect(t.setDecision("crashReports", "optedIn", 1000)).toBe(true);
    expect(t.get("crashReports")).toBe("optedIn");
    expect(t.getEntry("crashReports")).toEqual({
      category: "crashReports",
      decision: "optedIn",
      decidedAtMs: 1000,
    });
  });

  it("stores a new optedOut decision", () => {
    const t = createPluginBrowserTelemetryOptIn();
    expect(t.setDecision("usageMetrics", "optedOut", 500)).toBe(true);
    expect(t.get("usageMetrics")).toBe("optedOut");
  });

  it("updates an existing decision with new timestamp", () => {
    const t = createPluginBrowserTelemetryOptIn();
    t.setDecision("crashReports", "optedIn", 1000);
    expect(t.setDecision("crashReports", "optedOut", 2000)).toBe(true);
    expect(t.get("crashReports")).toBe("optedOut");
    expect(t.getEntry("crashReports")?.decidedAtMs).toBe(2000);
  });

  it("is idempotent on same decision + same timestamp", () => {
    const t = createPluginBrowserTelemetryOptIn();
    t.setDecision("crashReports", "optedIn", 1000);
    expect(t.setDecision("crashReports", "optedIn", 1000)).toBe(false);
  });

  it("updates timestamp when same decision + different timestamp", () => {
    const t = createPluginBrowserTelemetryOptIn();
    t.setDecision("crashReports", "optedIn", 1000);
    expect(t.setDecision("crashReports", "optedIn", 2000)).toBe(true);
    expect(t.getEntry("crashReports")?.decidedAtMs).toBe(2000);
  });

  it("undecided removes an existing entry", () => {
    const t = createPluginBrowserTelemetryOptIn();
    t.setDecision("crashReports", "optedIn", 1000);
    expect(t.setDecision("crashReports", "undecided", 2000)).toBe(true);
    expect(t.get("crashReports")).toBe("undecided");
    expect(t.getEntry("crashReports")).toBeUndefined();
  });

  it("undecided on unset category returns false (no-op)", () => {
    const t = createPluginBrowserTelemetryOptIn();
    expect(t.setDecision("crashReports", "undecided", 1000)).toBe(false);
  });

  it("rejects empty category / invalid decision / non-finite time", () => {
    const t = createPluginBrowserTelemetryOptIn();
    expect(t.setDecision("", "optedIn", 1)).toBe(false);
    expect(
      t.setDecision("crashReports", "bogus" as unknown as "optedIn", 1),
    ).toBe(false);
    expect(t.setDecision("crashReports", "optedIn", Number.NaN)).toBe(false);
    expect(
      t.setDecision("crashReports", "optedIn", Number.POSITIVE_INFINITY),
    ).toBe(false);
  });
});

describe("createPluginBrowserTelemetryOptIn — get / getEntry", () => {
  it("returns undecided for empty category", () => {
    const t = createPluginBrowserTelemetryOptIn();
    expect(t.get("")).toBe("undecided");
    expect(t.getEntry("")).toBeUndefined();
  });
});

describe("createPluginBrowserTelemetryOptIn — all", () => {
  it("returns insertion order", () => {
    const t = createPluginBrowserTelemetryOptIn();
    t.setDecision("a", "optedIn", 1);
    t.setDecision("b", "optedOut", 2);
    t.setDecision("c", "optedIn", 3);
    expect(t.all().map((e) => e.category)).toEqual(["a", "b", "c"]);
  });

  it("removed entries do not appear", () => {
    const t = createPluginBrowserTelemetryOptIn();
    t.setDecision("a", "optedIn", 1);
    t.setDecision("b", "optedOut", 2);
    t.setDecision("a", "undecided", 3);
    expect(t.all().map((e) => e.category)).toEqual(["b"]);
  });

  it("snapshot isolation", () => {
    const t = createPluginBrowserTelemetryOptIn();
    t.setDecision("a", "optedIn", 1);
    const snap = t.all() as unknown as unknown[];
    snap.length = 0;
    expect(t.all()).toHaveLength(1);
  });
});

describe("createPluginBrowserTelemetryOptIn — allDecided", () => {
  it("true when all required categories have non-undecided decisions", () => {
    const t = createPluginBrowserTelemetryOptIn();
    t.setDecision("a", "optedIn", 1);
    t.setDecision("b", "optedOut", 2);
    expect(t.allDecided(["a", "b"])).toBe(true);
  });

  it("false when any required category is unset", () => {
    const t = createPluginBrowserTelemetryOptIn();
    t.setDecision("a", "optedIn", 1);
    expect(t.allDecided(["a", "b"])).toBe(false);
  });

  it("true on empty required list", () => {
    const t = createPluginBrowserTelemetryOptIn();
    expect(t.allDecided([])).toBe(true);
  });

  it("ignores empty-string categories in required", () => {
    const t = createPluginBrowserTelemetryOptIn();
    t.setDecision("a", "optedIn", 1);
    expect(t.allDecided(["a", ""])).toBe(true);
  });
});

describe("createPluginBrowserTelemetryOptIn — anyOptedIn", () => {
  it("true when at least one category is optedIn", () => {
    const t = createPluginBrowserTelemetryOptIn();
    t.setDecision("a", "optedOut", 1);
    t.setDecision("b", "optedIn", 2);
    expect(t.anyOptedIn()).toBe(true);
  });

  it("false when none are optedIn", () => {
    const t = createPluginBrowserTelemetryOptIn();
    t.setDecision("a", "optedOut", 1);
    expect(t.anyOptedIn()).toBe(false);
  });
});

describe("createPluginBrowserTelemetryOptIn — listPending", () => {
  it("returns unset categories in insertion order of required", () => {
    const t = createPluginBrowserTelemetryOptIn();
    t.setDecision("b", "optedIn", 1);
    expect(t.listPending(["a", "b", "c"])).toEqual(["a", "c"]);
  });

  it("dedupes repeated categories", () => {
    const t = createPluginBrowserTelemetryOptIn();
    expect(t.listPending(["a", "a", "a"])).toEqual(["a"]);
  });

  it("returns empty when all decided", () => {
    const t = createPluginBrowserTelemetryOptIn();
    t.setDecision("a", "optedIn", 1);
    t.setDecision("b", "optedOut", 2);
    expect(t.listPending(["a", "b"])).toEqual([]);
  });

  it("ignores empty-string entries", () => {
    const t = createPluginBrowserTelemetryOptIn();
    expect(t.listPending(["", "a", ""])).toEqual(["a"]);
  });
});

describe("createPluginBrowserTelemetryOptIn — clear / clearAll", () => {
  it("clear removes a specific category", () => {
    const t = createPluginBrowserTelemetryOptIn();
    t.setDecision("a", "optedIn", 1);
    t.setDecision("b", "optedOut", 2);
    expect(t.clear("a")).toBe(true);
    expect(t.all().map((e) => e.category)).toEqual(["b"]);
  });

  it("clear returns false on unset / empty category", () => {
    const t = createPluginBrowserTelemetryOptIn();
    expect(t.clear("a")).toBe(false);
    expect(t.clear("")).toBe(false);
  });

  it("clearAll wipes every entry", () => {
    const t = createPluginBrowserTelemetryOptIn();
    t.setDecision("a", "optedIn", 1);
    t.setDecision("b", "optedOut", 2);
    t.clearAll();
    expect(t.all()).toEqual([]);
  });

  it("clearAll safe on empty ledger", () => {
    const t = createPluginBrowserTelemetryOptIn();
    expect(() => t.clearAll()).not.toThrow();
  });
});
