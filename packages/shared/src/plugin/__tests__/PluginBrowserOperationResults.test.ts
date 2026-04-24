import { describe, expect, it } from "vitest";
import { createPluginBrowserOperationResults } from "../PluginBrowserOperationResults.js";

describe("createPluginBrowserOperationResults — defaults", () => {
  it("starts empty", () => {
    const r = createPluginBrowserOperationResults();
    expect(r.size()).toBe(0);
    expect(r.entries()).toEqual([]);
    expect(r.has("a", "install")).toBe(false);
    expect(r.get("a", "install")).toBeUndefined();
    expect(r.latestFor("a")).toBeUndefined();
    expect(r.operationsFor("a")).toEqual([]);
  });
});

describe("createPluginBrowserOperationResults — recordSuccess", () => {
  it("stores a success outcome", () => {
    const r = createPluginBrowserOperationResults();
    expect(r.recordSuccess("a", "install", 100)).toBe(true);
    expect(r.get("a", "install")).toEqual({
      kind: "success",
      atMs: 100,
    });
    expect(r.has("a", "install")).toBe(true);
    expect(r.size()).toBe(1);
  });

  it("replaces an existing outcome on re-record", () => {
    const r = createPluginBrowserOperationResults();
    r.recordSuccess("a", "install", 100);
    r.recordFailure("a", "install", "boom", 200);
    expect(r.get("a", "install")).toEqual({
      kind: "failure",
      atMs: 200,
      reason: "boom",
    });
    expect(r.size()).toBe(1);
  });

  it("rejects empty pluginId", () => {
    const r = createPluginBrowserOperationResults();
    expect(r.recordSuccess("", "install", 10)).toBe(false);
    expect(r.size()).toBe(0);
  });

  it("rejects empty operation", () => {
    const r = createPluginBrowserOperationResults();
    expect(r.recordSuccess("a", "", 10)).toBe(false);
  });

  it("rejects non-finite atMs", () => {
    const r = createPluginBrowserOperationResults();
    expect(r.recordSuccess("a", "install", Number.NaN)).toBe(false);
    expect(r.recordSuccess("a", "install", Number.POSITIVE_INFINITY)).toBe(
      false,
    );
  });
});

describe("createPluginBrowserOperationResults — recordFailure", () => {
  it("stores a failure with reason", () => {
    const r = createPluginBrowserOperationResults();
    expect(r.recordFailure("a", "install", "timeout", 50)).toBe(true);
    expect(r.get("a", "install")).toEqual({
      kind: "failure",
      atMs: 50,
      reason: "timeout",
    });
  });

  it("tolerates empty reason string", () => {
    const r = createPluginBrowserOperationResults();
    expect(r.recordFailure("a", "install", "", 50)).toBe(true);
    expect(r.get("a", "install")).toEqual({
      kind: "failure",
      atMs: 50,
      reason: "",
    });
  });

  it("rejects non-string reason", () => {
    const r = createPluginBrowserOperationResults();
    expect(r.recordFailure("a", "install", null as unknown as string, 50)).toBe(
      false,
    );
    expect(r.size()).toBe(0);
  });
});

describe("createPluginBrowserOperationResults — latestFor", () => {
  it("returns the outcome with the highest atMs", () => {
    const r = createPluginBrowserOperationResults();
    r.recordSuccess("a", "install", 100);
    r.recordFailure("a", "enable", "busy", 200);
    r.recordSuccess("a", "reload", 50);
    expect(r.latestFor("a")).toEqual({
      kind: "failure",
      atMs: 200,
      reason: "busy",
    });
  });

  it("returns undefined for unknown plugin", () => {
    const r = createPluginBrowserOperationResults();
    expect(r.latestFor("nope")).toBeUndefined();
  });

  it("ties broken by insertion order (most recent wins)", () => {
    const r = createPluginBrowserOperationResults();
    r.recordSuccess("a", "install", 100);
    r.recordFailure("a", "enable", "x", 100);
    const latest = r.latestFor("a");
    expect(latest?.kind).toBe("failure");
  });
});

describe("createPluginBrowserOperationResults — operationsFor", () => {
  it("returns operations in insertion order", () => {
    const r = createPluginBrowserOperationResults();
    r.recordSuccess("a", "install", 1);
    r.recordSuccess("a", "enable", 2);
    r.recordFailure("a", "reload", "x", 3);
    expect(r.operationsFor("a")).toEqual(["install", "enable", "reload"]);
  });

  it("reorders when re-recording (tail)", () => {
    const r = createPluginBrowserOperationResults();
    r.recordSuccess("a", "install", 1);
    r.recordSuccess("a", "enable", 2);
    r.recordSuccess("a", "install", 3); // re-record
    expect(r.operationsFor("a")).toEqual(["enable", "install"]);
  });
});

describe("createPluginBrowserOperationResults — forget", () => {
  it("drops a single entry", () => {
    const r = createPluginBrowserOperationResults();
    r.recordSuccess("a", "install", 10);
    r.recordSuccess("a", "enable", 20);
    expect(r.forget("a", "install")).toBe(true);
    expect(r.has("a", "install")).toBe(false);
    expect(r.has("a", "enable")).toBe(true);
    expect(r.size()).toBe(1);
  });

  it("auto-cleans plugin when last op is forgotten", () => {
    const r = createPluginBrowserOperationResults();
    r.recordSuccess("a", "install", 10);
    r.forget("a", "install");
    expect(r.operationsFor("a")).toEqual([]);
  });

  it("returns false for unknown entry", () => {
    const r = createPluginBrowserOperationResults();
    expect(r.forget("a", "install")).toBe(false);
  });
});

describe("createPluginBrowserOperationResults — forgetAll + clear", () => {
  it("forgetAll drops every op for a plugin", () => {
    const r = createPluginBrowserOperationResults();
    r.recordSuccess("a", "install", 1);
    r.recordSuccess("a", "enable", 2);
    expect(r.forgetAll("a")).toBe(true);
    expect(r.operationsFor("a")).toEqual([]);
  });

  it("forgetAll returns false on unknown plugin", () => {
    const r = createPluginBrowserOperationResults();
    expect(r.forgetAll("nope")).toBe(false);
  });

  it("clear wipes every entry", () => {
    const r = createPluginBrowserOperationResults();
    r.recordSuccess("a", "install", 1);
    r.recordSuccess("b", "enable", 2);
    r.clear();
    expect(r.size()).toBe(0);
    expect(r.entries()).toEqual([]);
  });
});

describe("createPluginBrowserOperationResults — entries", () => {
  it("returns entries in insertion order across plugins", () => {
    const r = createPluginBrowserOperationResults();
    r.recordSuccess("a", "install", 1);
    r.recordFailure("b", "enable", "x", 2);
    r.recordSuccess("a", "reload", 3);
    expect(r.entries()).toEqual([
      {
        pluginId: "a",
        operation: "install",
        outcome: { kind: "success", atMs: 1 },
      },
      {
        pluginId: "a",
        operation: "reload",
        outcome: { kind: "success", atMs: 3 },
      },
      {
        pluginId: "b",
        operation: "enable",
        outcome: { kind: "failure", atMs: 2, reason: "x" },
      },
    ]);
  });
});
