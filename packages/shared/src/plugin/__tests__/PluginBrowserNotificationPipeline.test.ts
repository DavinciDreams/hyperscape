import { describe, expect, it } from "vitest";
import type { PluginBrowserRowSummary } from "../PluginBrowserRowSummary.js";
import { runPluginBrowserNotificationPipeline } from "../PluginBrowserNotificationPipeline.js";

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

describe("runPluginBrowserNotificationPipeline — empty/default state", () => {
  it("emits everything on first refresh when no prior state given", () => {
    const r = runPluginBrowserNotificationPipeline({
      previousSnapshot: new Map(),
      currentSnapshot: snap(row("com.x", "error")),
      now: 1000,
    });
    expect(r.emitted.map((i) => i.id)).toEqual(["added:com.x"]);
    expect(r.suppressed).toEqual([]);
    expect(r.nextSuppressionState.shown.get("added:com.x")).toBe(1000);
  });

  it("returns empty buckets on equal/equal snapshots", () => {
    const r = runPluginBrowserNotificationPipeline({
      previousSnapshot: snap(row("com.x", "ok")),
      currentSnapshot: snap(row("com.x", "ok")),
      now: 1000,
    });
    expect(r.emitted).toEqual([]);
    expect(r.intents).toEqual([]);
    expect(r.diff.unchanged).toHaveLength(1);
  });
});

describe("runPluginBrowserNotificationPipeline — threaded state", () => {
  it("suppresses a repeated regression until cooldown elapses", () => {
    const first = runPluginBrowserNotificationPipeline({
      previousSnapshot: snap(row("com.x", "ok")),
      currentSnapshot: snap(row("com.x", "error")),
      now: 1000,
    });
    expect(first.emitted.map((i) => i.id)).toEqual(["regressed:com.x"]);

    // Refresh again — com.x still broken. Without cooldown, stays suppressed.
    const second = runPluginBrowserNotificationPipeline({
      previousSnapshot: snap(row("com.x", "ok")),
      currentSnapshot: snap(row("com.x", "error")),
      now: 2000,
      previousSuppressionState: first.nextSuppressionState,
    });
    expect(second.emitted).toEqual([]);
    expect(second.suppressed.map((i) => i.id)).toEqual(["regressed:com.x"]);

    // After cooldown elapses it fires again.
    const third = runPluginBrowserNotificationPipeline({
      previousSnapshot: snap(row("com.x", "ok")),
      currentSnapshot: snap(row("com.x", "error")),
      now: 7000,
      previousSuppressionState: second.nextSuppressionState,
      cooldownMs: 5000,
    });
    expect(third.emitted.map((i) => i.id)).toEqual(["regressed:com.x"]);
  });

  it("threads nextState through successive refreshes correctly", () => {
    const first = runPluginBrowserNotificationPipeline({
      previousSnapshot: new Map(),
      currentSnapshot: snap(row("a", "warning")),
      now: 1000,
    });
    const second = runPluginBrowserNotificationPipeline({
      previousSnapshot: snap(row("a", "warning")),
      currentSnapshot: snap(row("a", "warning"), row("b", "error")),
      now: 2000,
      previousSuppressionState: first.nextSuppressionState,
    });
    // Only the newly-added `b` should fire.
    expect(second.emitted.map((i) => i.id)).toEqual(["added:b"]);
    // Prior state for `a` preserved.
    expect(second.nextSuppressionState.shown.get("added:a")).toBe(1000);
    expect(second.nextSuppressionState.shown.get("added:b")).toBe(2000);
  });
});

describe("runPluginBrowserNotificationPipeline — exposes full chain", () => {
  it("returns diff + intents + emitted + suppressed for UI composition", () => {
    const r = runPluginBrowserNotificationPipeline({
      previousSnapshot: snap(row("a", "ok"), row("b", "warning")),
      currentSnapshot: snap(row("a", "error"), row("c", "ok")),
      now: 1000,
    });
    expect(r.diff.severityChanged).toHaveLength(1);
    expect(r.diff.removed).toHaveLength(1);
    expect(r.diff.added).toHaveLength(1);
    // intents = pre-suppression projection; first refresh → equal to emitted.
    expect(r.intents.map((i) => i.id).sort()).toEqual(
      r.emitted.map((i) => i.id).sort(),
    );
    const kinds = r.emitted.map((i) => i.kind);
    expect(kinds).toContain("regressed");
    expect(kinds).toContain("removed");
    expect(kinds).toContain("added");
  });
});
