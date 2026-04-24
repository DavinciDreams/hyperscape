import { describe, expect, it } from "vitest";
import { createPluginBrowserDiagnostics } from "../PluginBrowserDiagnostics.js";

describe("createPluginBrowserDiagnostics — defaults", () => {
  it("starts empty", () => {
    const d = createPluginBrowserDiagnostics();
    expect(d.all()).toEqual([]);
    expect(d.count()).toBe(0);
    expect(d.hasErrors()).toBe(false);
  });
});

describe("createPluginBrowserDiagnostics — add", () => {
  it("appends an entry with monotonic id", () => {
    const d = createPluginBrowserDiagnostics();
    const e1 = d.add("p", "warning", "CODE_A", "msg", 100);
    const e2 = d.add("p", "error", "CODE_B", "msg", 200);
    expect(e1?.id).toBe(1);
    expect(e2?.id).toBe(2);
    expect(e1?.severity).toBe("warning");
    expect(e2?.severity).toBe("error");
  });

  it("rejects empty id / code / message", () => {
    const d = createPluginBrowserDiagnostics();
    expect(d.add("", "info", "C", "M", 0)).toBeUndefined();
    expect(d.add("p", "info", "", "M", 0)).toBeUndefined();
    expect(d.add("p", "info", "C", "", 0)).toBeUndefined();
    expect(d.count()).toBe(0);
  });

  it("rejects unknown severity / non-finite timestamp", () => {
    const d = createPluginBrowserDiagnostics();
    expect(
      d.add("p", "bogus" as unknown as "info", "C", "M", 0),
    ).toBeUndefined();
    expect(d.add("p", "info", "C", "M", Number.NaN)).toBeUndefined();
    expect(
      d.add("p", "info", "C", "M", Number.POSITIVE_INFINITY),
    ).toBeUndefined();
    expect(d.count()).toBe(0);
  });

  it("evicts oldest entry for this plugin when capacity exceeded", () => {
    const d = createPluginBrowserDiagnostics(3);
    d.add("p", "info", "C1", "msg1", 1);
    d.add("p", "info", "C2", "msg2", 2);
    d.add("p", "info", "C3", "msg3", 3);
    d.add("p", "info", "C4", "msg4", 4);
    const codes = d.byPlugin("p").map((e) => e.code);
    expect(codes).toEqual(["C2", "C3", "C4"]);
  });

  it("per-plugin capacity is independent", () => {
    const d = createPluginBrowserDiagnostics(2);
    d.add("a", "info", "A1", "msg", 1);
    d.add("a", "info", "A2", "msg", 2);
    d.add("a", "info", "A3", "msg", 3); // evicts A1
    d.add("b", "info", "B1", "msg", 4);
    d.add("b", "info", "B2", "msg", 5);
    expect(d.byPlugin("a").map((e) => e.code)).toEqual(["A2", "A3"]);
    expect(d.byPlugin("b").map((e) => e.code)).toEqual(["B1", "B2"]);
  });

  it("falls back to default capacity on invalid constructor arg", () => {
    // Negative, zero, NaN, Infinity → DEFAULT (50). Add 50 and they all stay.
    const d = createPluginBrowserDiagnostics(-1);
    for (let i = 0; i < 50; i++) {
      d.add("p", "info", `C${i}`, "msg", i);
    }
    expect(d.count()).toBe(50);
  });
});

describe("createPluginBrowserDiagnostics — byPlugin / bySeverity", () => {
  it("filters by pluginId preserving insertion order", () => {
    const d = createPluginBrowserDiagnostics();
    d.add("a", "info", "A", "m", 1);
    d.add("b", "info", "B", "m", 2);
    d.add("a", "warning", "A2", "m", 3);
    expect(d.byPlugin("a").map((e) => e.code)).toEqual(["A", "A2"]);
    expect(d.byPlugin("b").map((e) => e.code)).toEqual(["B"]);
  });

  it("filters by severity preserving insertion order", () => {
    const d = createPluginBrowserDiagnostics();
    d.add("p", "info", "I", "m", 1);
    d.add("p", "warning", "W", "m", 2);
    d.add("p", "error", "E", "m", 3);
    d.add("p", "error", "E2", "m", 4);
    expect(d.bySeverity("error").map((e) => e.code)).toEqual(["E", "E2"]);
    expect(d.bySeverity("warning").map((e) => e.code)).toEqual(["W"]);
  });

  it("empty id / unknown severity → []", () => {
    const d = createPluginBrowserDiagnostics();
    d.add("p", "info", "I", "m", 1);
    expect(d.byPlugin("")).toEqual([]);
    expect(d.bySeverity("bogus" as unknown as "info")).toEqual([]);
  });
});

describe("createPluginBrowserDiagnostics — dismiss", () => {
  it("removes a single entry by id", () => {
    const d = createPluginBrowserDiagnostics();
    const e = d.add("p", "info", "C", "m", 0)!;
    expect(d.dismiss(e.id)).toBe(true);
    expect(d.count()).toBe(0);
  });

  it("unknown id / non-finite → false", () => {
    const d = createPluginBrowserDiagnostics();
    expect(d.dismiss(999)).toBe(false);
    expect(d.dismiss(Number.NaN)).toBe(false);
  });
});

describe("createPluginBrowserDiagnostics — dismissPlugin", () => {
  it("removes all entries for one plugin", () => {
    const d = createPluginBrowserDiagnostics();
    d.add("a", "info", "A1", "m", 1);
    d.add("b", "info", "B1", "m", 2);
    d.add("a", "warning", "A2", "m", 3);
    expect(d.dismissPlugin("a")).toBe(2);
    expect(d.byPlugin("a")).toEqual([]);
    expect(d.byPlugin("b")).toHaveLength(1);
  });

  it("empty id / unknown plugin → 0", () => {
    const d = createPluginBrowserDiagnostics();
    d.add("p", "info", "C", "m", 0);
    expect(d.dismissPlugin("")).toBe(0);
    expect(d.dismissPlugin("nope")).toBe(0);
    expect(d.count()).toBe(1);
  });
});

describe("createPluginBrowserDiagnostics — counts + hasErrors", () => {
  it("count / countBySeverity / hasErrors", () => {
    const d = createPluginBrowserDiagnostics();
    d.add("p", "info", "I", "m", 1);
    d.add("p", "warning", "W", "m", 2);
    d.add("p", "error", "E", "m", 3);
    expect(d.count()).toBe(3);
    expect(d.countBySeverity("info")).toBe(1);
    expect(d.countBySeverity("warning")).toBe(1);
    expect(d.countBySeverity("error")).toBe(1);
    expect(d.hasErrors()).toBe(true);
  });

  it("hasErrors = false without any 'error' entry", () => {
    const d = createPluginBrowserDiagnostics();
    d.add("p", "info", "I", "m", 1);
    d.add("p", "warning", "W", "m", 2);
    expect(d.hasErrors()).toBe(false);
  });
});

describe("createPluginBrowserDiagnostics — reset", () => {
  it("wipes everything", () => {
    const d = createPluginBrowserDiagnostics();
    d.add("p", "info", "C", "m", 0);
    d.reset();
    expect(d.count()).toBe(0);
    expect(d.all()).toEqual([]);
  });
});
