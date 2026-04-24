import { describe, expect, it } from "vitest";
import type { PluginBrowserRowSummary } from "../PluginBrowserRowSummary.js";
import { diffPluginBrowserSnapshots } from "../PluginBrowserSnapshotDiff.js";
import { buildPluginBrowserToastIntents } from "../PluginBrowserToastRouter.js";

function row(
  pluginId: string,
  severity: PluginBrowserRowSummary["severity"],
  label: string = severity,
): PluginBrowserRowSummary {
  return {
    pluginId,
    severity,
    label,
    reasons: [],
    health: null,
    stability: null,
  };
}

function snap(...entries: Array<PluginBrowserRowSummary>) {
  return new Map(entries.map((r) => [r.pluginId, r]));
}

describe("buildPluginBrowserToastIntents — classification", () => {
  it("classifies strictly-worse transitions as regressed", () => {
    const d = diffPluginBrowserSnapshots(
      snap(row("com.x", "ok")),
      snap(row("com.x", "error")),
    );
    const [intent] = buildPluginBrowserToastIntents(d);
    expect(intent.kind).toBe("regressed");
    expect(intent.id).toBe("regressed:com.x");
    expect(intent.severity).toBe("error");
  });

  it("classifies strictly-better transitions as recovered", () => {
    const d = diffPluginBrowserSnapshots(
      snap(row("com.x", "error")),
      snap(row("com.x", "ok")),
    );
    const [intent] = buildPluginBrowserToastIntents(d);
    expect(intent.kind).toBe("recovered");
    expect(intent.severity).toBe("ok");
  });

  it("emits added intent with current severity", () => {
    const d = diffPluginBrowserSnapshots(
      new Map(),
      snap(row("com.x", "warning")),
    );
    const [intent] = buildPluginBrowserToastIntents(d);
    expect(intent.kind).toBe("added");
    expect(intent.severity).toBe("warning");
    expect(intent.previous).toBeNull();
  });

  it("emits removed intent with previous severity", () => {
    const d = diffPluginBrowserSnapshots(
      snap(row("com.x", "error")),
      new Map(),
    );
    const [intent] = buildPluginBrowserToastIntents(d);
    expect(intent.kind).toBe("removed");
    expect(intent.severity).toBe("error");
    expect(intent.current).toBeNull();
  });

  it("emits label-changed intent when only the label shifted", () => {
    const d = diffPluginBrowserSnapshots(
      snap(row("com.x", "warning", "flaky")),
      snap(row("com.x", "warning", "degraded")),
    );
    const [intent] = buildPluginBrowserToastIntents(d);
    expect(intent.kind).toBe("label-changed");
    expect(intent.severity).toBe("warning");
  });
});

describe("buildPluginBrowserToastIntents — empty cases", () => {
  it("returns [] when diff is empty", () => {
    const d = diffPluginBrowserSnapshots(new Map(), new Map());
    expect(buildPluginBrowserToastIntents(d)).toEqual([]);
  });

  it("returns [] when only unchanged rows are present", () => {
    const d = diffPluginBrowserSnapshots(
      snap(row("com.x", "ok")),
      snap(row("com.x", "ok")),
    );
    expect(buildPluginBrowserToastIntents(d)).toEqual([]);
  });
});

describe("buildPluginBrowserToastIntents — ordering", () => {
  it("orders by kind priority: regressed → removed → added → recovered → label-changed", () => {
    const prev = snap(
      row("a", "ok"), // will regress
      row("b", "error"), // will recover
      row("c", "warning"), // will be removed
      row("d", "ok", "stable"), // label changes only
    );
    const cur = snap(
      row("a", "error"), // regressed
      row("b", "ok"), // recovered
      row("d", "ok", "fresh"), // label-changed
      row("e", "warning"), // added
    );
    const d = diffPluginBrowserSnapshots(prev, cur);
    const kinds = buildPluginBrowserToastIntents(d).map((i) => i.kind);
    expect(kinds).toEqual([
      "regressed",
      "removed",
      "added",
      "recovered",
      "label-changed",
    ]);
  });

  it("orders by severity desc within the same kind", () => {
    // Two regressions; error-severity regression should come first.
    const prev = snap(row("a", "ok"), row("b", "ok"));
    const cur = snap(row("a", "warning"), row("b", "error"));
    const d = diffPluginBrowserSnapshots(prev, cur);
    const ids = buildPluginBrowserToastIntents(d).map((i) => i.pluginId);
    expect(ids).toEqual(["b", "a"]);
  });

  it("tie-breaks by pluginId ascending", () => {
    const prev = new Map();
    // Two added with the same severity.
    const cur = snap(row("zeta", "warning"), row("alpha", "warning"));
    const d = diffPluginBrowserSnapshots(prev, cur);
    const ids = buildPluginBrowserToastIntents(d).map((i) => i.pluginId);
    expect(ids).toEqual(["alpha", "zeta"]);
  });
});

describe("buildPluginBrowserToastIntents — ids", () => {
  it("produces stable, dedupe-friendly ids", () => {
    const d = diffPluginBrowserSnapshots(
      snap(row("com.x", "ok"), row("com.y", "warning")),
      snap(row("com.x", "error"), row("com.z", "ok")),
    );
    const ids = buildPluginBrowserToastIntents(d).map((i) => i.id);
    // com.x: regressed, com.y: removed, com.z: added.
    expect(ids).toContain("regressed:com.x");
    expect(ids).toContain("removed:com.y");
    expect(ids).toContain("added:com.z");
  });
});
