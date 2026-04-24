import { describe, expect, it } from "vitest";
import type { PluginLifecycleEvent } from "../PluginLifecycleJournal.js";
import {
  buildPluginLifecycleStats,
  buildPluginLifecycleStatsByPlugin,
} from "../PluginLifecycleStats.js";

function ev(
  pluginId: string,
  phase: "load" | "enable" | "disable",
  outcome: "success" | "failed",
  at: number,
  errorMessage?: string,
): PluginLifecycleEvent {
  return outcome === "failed"
    ? { pluginId, phase, outcome, at, errorMessage: errorMessage ?? "boom" }
    : { pluginId, phase, outcome, at };
}

describe("buildPluginLifecycleStats — empty / no-match", () => {
  it("returns zeroed stats when no events match the pluginId", () => {
    const stats = buildPluginLifecycleStats("com.x", [
      ev("com.y", "load", "success", 1),
    ]);
    expect(stats.totalEvents).toBe(0);
    expect(stats.successCount).toBe(0);
    expect(stats.failedCount).toBe(0);
    expect(stats.successRate).toBeNull();
    expect(stats.lastEventAt).toBeNull();
    expect(stats.lastFailureAt).toBeNull();
    expect(stats.consecutiveTrailingFailures).toBe(0);
    expect(stats.phases).toEqual({
      load: { success: 0, failed: 0 },
      enable: { success: 0, failed: 0 },
      disable: { success: 0, failed: 0 },
    });
  });

  it("returns zeroed stats for an empty event stream", () => {
    const stats = buildPluginLifecycleStats("com.x", []);
    expect(stats.totalEvents).toBe(0);
    expect(stats.successRate).toBeNull();
  });
});

describe("buildPluginLifecycleStats — counts", () => {
  it("partitions success vs failed across phases", () => {
    const stats = buildPluginLifecycleStats("com.x", [
      ev("com.x", "load", "success", 1),
      ev("com.x", "enable", "success", 2),
      ev("com.x", "enable", "failed", 3),
      ev("com.x", "disable", "success", 4),
    ]);
    expect(stats.totalEvents).toBe(4);
    expect(stats.successCount).toBe(3);
    expect(stats.failedCount).toBe(1);
    expect(stats.phases.load).toEqual({ success: 1, failed: 0 });
    expect(stats.phases.enable).toEqual({ success: 1, failed: 1 });
    expect(stats.phases.disable).toEqual({ success: 1, failed: 0 });
  });

  it("computes successRate as success / (success + failed)", () => {
    const stats = buildPluginLifecycleStats("com.x", [
      ev("com.x", "load", "success", 1),
      ev("com.x", "load", "failed", 2),
      ev("com.x", "load", "failed", 3),
      ev("com.x", "load", "success", 4),
    ]);
    expect(stats.successRate).toBe(0.5);
  });

  it("ignores other plugins' events", () => {
    const stats = buildPluginLifecycleStats("com.x", [
      ev("com.x", "load", "success", 1),
      ev("com.y", "load", "failed", 2),
      ev("com.y", "enable", "success", 3),
    ]);
    expect(stats.totalEvents).toBe(1);
    expect(stats.successCount).toBe(1);
    expect(stats.failedCount).toBe(0);
  });
});

describe("buildPluginLifecycleStats — timestamps", () => {
  it("tracks lastEventAt across all matching events", () => {
    const stats = buildPluginLifecycleStats("com.x", [
      ev("com.x", "load", "success", 100),
      ev("com.x", "enable", "success", 50),
      ev("com.x", "disable", "failed", 200),
    ]);
    expect(stats.lastEventAt).toBe(200);
    expect(stats.lastFailureAt).toBe(200);
  });

  it("tracks lastFailureAt independently of lastEventAt", () => {
    const stats = buildPluginLifecycleStats("com.x", [
      ev("com.x", "load", "failed", 100),
      ev("com.x", "load", "success", 200),
    ]);
    expect(stats.lastEventAt).toBe(200);
    expect(stats.lastFailureAt).toBe(100);
  });

  it("leaves lastFailureAt null when no failures occurred", () => {
    const stats = buildPluginLifecycleStats("com.x", [
      ev("com.x", "load", "success", 1),
    ]);
    expect(stats.lastFailureAt).toBeNull();
    expect(stats.lastEventAt).toBe(1);
  });
});

describe("buildPluginLifecycleStats — consecutiveTrailingFailures", () => {
  it("counts the run of failed events at the tail", () => {
    const stats = buildPluginLifecycleStats("com.x", [
      ev("com.x", "load", "success", 1),
      ev("com.x", "enable", "failed", 2),
      ev("com.x", "load", "failed", 3),
    ]);
    expect(stats.consecutiveTrailingFailures).toBe(2);
  });

  it("returns 0 when the last matching event is a success", () => {
    const stats = buildPluginLifecycleStats("com.x", [
      ev("com.x", "load", "failed", 1),
      ev("com.x", "load", "success", 2),
    ]);
    expect(stats.consecutiveTrailingFailures).toBe(0);
  });

  it("skips other plugins' events when walking the tail", () => {
    const stats = buildPluginLifecycleStats("com.x", [
      ev("com.x", "load", "failed", 1),
      ev("com.y", "load", "success", 2),
      ev("com.x", "load", "failed", 3),
      ev("com.y", "enable", "success", 4),
    ]);
    expect(stats.consecutiveTrailingFailures).toBe(2);
  });
});

describe("buildPluginLifecycleStatsByPlugin", () => {
  it("emits an entry per distinct pluginId in first-mention order", () => {
    const map = buildPluginLifecycleStatsByPlugin([
      ev("com.b", "load", "success", 1),
      ev("com.a", "load", "failed", 2),
      ev("com.b", "enable", "success", 3),
    ]);
    expect(Array.from(map.keys())).toEqual(["com.b", "com.a"]);
    const a = map.get("com.a")!;
    expect(a.totalEvents).toBe(1);
    expect(a.failedCount).toBe(1);
    const b = map.get("com.b")!;
    expect(b.totalEvents).toBe(2);
    expect(b.successCount).toBe(2);
  });

  it("returns an empty map for an empty stream", () => {
    const map = buildPluginLifecycleStatsByPlugin([]);
    expect(map.size).toBe(0);
  });
});
