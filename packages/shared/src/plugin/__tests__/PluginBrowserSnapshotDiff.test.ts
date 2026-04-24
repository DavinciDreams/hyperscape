import { describe, expect, it } from "vitest";
import type { PluginBrowserRowSummary } from "../PluginBrowserRowSummary.js";
import {
  diffPluginBrowserSnapshots,
  isPluginBrowserSnapshotDiffEmpty,
  severityRegressions,
} from "../PluginBrowserSnapshotDiff.js";

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

describe("diffPluginBrowserSnapshots — empty", () => {
  it("returns all empty buckets on empty/empty", () => {
    const d = diffPluginBrowserSnapshots(new Map(), new Map());
    expect(d.added).toEqual([]);
    expect(d.removed).toEqual([]);
    expect(d.severityChanged).toEqual([]);
    expect(d.labelChanged).toEqual([]);
    expect(d.unchanged).toEqual([]);
    expect(isPluginBrowserSnapshotDiffEmpty(d)).toBe(true);
  });
});

describe("diffPluginBrowserSnapshots — add/remove", () => {
  it("detects newly added plugin rows", () => {
    const d = diffPluginBrowserSnapshots(new Map(), snap(row("com.x", "ok")));
    expect(d.added).toHaveLength(1);
    expect(d.added[0].pluginId).toBe("com.x");
    expect(d.added[0].severityTransition).toEqual({ from: null, to: "ok" });
    expect(d.added[0].previous).toBeNull();
  });

  it("detects removed plugin rows", () => {
    const d = diffPluginBrowserSnapshots(
      snap(row("com.x", "warning")),
      new Map(),
    );
    expect(d.removed).toHaveLength(1);
    expect(d.removed[0].severityTransition).toEqual({
      from: "warning",
      to: null,
    });
    expect(d.removed[0].current).toBeNull();
  });
});

describe("diffPluginBrowserSnapshots — severity changes", () => {
  it("detects severity transition", () => {
    const d = diffPluginBrowserSnapshots(
      snap(row("com.x", "ok")),
      snap(row("com.x", "error")),
    );
    expect(d.severityChanged).toHaveLength(1);
    expect(d.severityChanged[0].severityTransition).toEqual({
      from: "ok",
      to: "error",
    });
    // severity-changed takes precedence over label-changed
    expect(d.labelChanged).toEqual([]);
  });

  it("does not report label-changed when severity also changed", () => {
    const d = diffPluginBrowserSnapshots(
      snap(row("com.x", "ok", "stable")),
      snap(row("com.x", "error", "broken")),
    );
    expect(d.severityChanged).toHaveLength(1);
    expect(d.labelChanged).toEqual([]);
  });
});

describe("diffPluginBrowserSnapshots — label changes", () => {
  it("detects label transition when severity stayed the same", () => {
    const d = diffPluginBrowserSnapshots(
      snap(row("com.x", "warning", "flaky")),
      snap(row("com.x", "warning", "warning")),
    );
    expect(d.labelChanged).toHaveLength(1);
    expect(d.labelChanged[0].previous?.label).toBe("flaky");
    expect(d.labelChanged[0].current?.label).toBe("warning");
    expect(d.labelChanged[0].severityTransition).toBeNull();
  });
});

describe("diffPluginBrowserSnapshots — unchanged", () => {
  it("buckets rows that are structurally identical", () => {
    const d = diffPluginBrowserSnapshots(
      snap(row("com.x", "ok", "stable")),
      snap(row("com.x", "ok", "stable")),
    );
    expect(d.unchanged).toHaveLength(1);
    expect(isPluginBrowserSnapshotDiffEmpty(d)).toBe(true);
  });
});

describe("isPluginBrowserSnapshotDiffEmpty", () => {
  it("is false when a severity changed", () => {
    const d = diffPluginBrowserSnapshots(
      snap(row("com.x", "ok")),
      snap(row("com.x", "error")),
    );
    expect(isPluginBrowserSnapshotDiffEmpty(d)).toBe(false);
  });
});

describe("severityRegressions", () => {
  it("includes strictly-worse transitions only", () => {
    const prev = snap(
      row("a", "ok"),
      row("b", "warning"),
      row("c", "error"),
      row("d", "ok"),
    );
    const cur = snap(
      row("a", "error"), // ok→error → regression
      row("b", "ok"), // warning→ok → recovery (exclude)
      row("c", "warning"), // error→warning → recovery (exclude)
      row("d", "warning"), // ok→warning → regression
    );
    const d = diffPluginBrowserSnapshots(prev, cur);
    const regressions = severityRegressions(d);
    const ids = regressions.map((r) => r.pluginId).sort();
    expect(ids).toEqual(["a", "d"]);
  });

  it("ignores add/remove even when severity transition fields look populated", () => {
    const d = diffPluginBrowserSnapshots(
      new Map(),
      snap(row("com.x", "error")),
    );
    // added row has severityTransition { from: null, to: "error" } but
    // it's not in severityChanged bucket, so regressions is empty.
    expect(severityRegressions(d)).toEqual([]);
  });
});
