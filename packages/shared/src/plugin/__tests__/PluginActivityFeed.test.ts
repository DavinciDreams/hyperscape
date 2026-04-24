import { describe, expect, it } from "vitest";
import {
  buildActivityFeedByPlugin,
  buildRecentActivityFeed,
  summarizeActivity,
} from "../PluginActivityFeed.js";
import type { PluginLifecycleEvent } from "../PluginLifecycleJournal.js";

function ev(
  pluginId: string,
  phase: "load" | "enable" | "disable",
  outcome: "success" | "failed",
  at: number,
): PluginLifecycleEvent {
  return { at, pluginId, phase, outcome };
}

describe("buildActivityFeedByPlugin", () => {
  it("groups events per plugin, most-recent-first", () => {
    const events: PluginLifecycleEvent[] = [
      ev("com.a", "load", "success", 1),
      ev("com.b", "load", "success", 2),
      ev("com.a", "enable", "success", 3),
      ev("com.b", "enable", "failed", 4),
    ];
    const feed = buildActivityFeedByPlugin(events);
    expect(feed.get("com.a")!.map((e) => e.at)).toEqual([3, 1]);
    expect(feed.get("com.b")!.map((e) => e.at)).toEqual([4, 2]);
  });

  it("applies per-plugin limit", () => {
    const events: PluginLifecycleEvent[] = [
      ev("com.a", "load", "success", 1),
      ev("com.a", "enable", "success", 2),
      ev("com.a", "disable", "success", 3),
      ev("com.a", "enable", "success", 4),
    ];
    const feed = buildActivityFeedByPlugin(events, 2);
    expect(feed.get("com.a")!.map((e) => e.at)).toEqual([4, 3]);
  });

  it("returns empty map on empty input", () => {
    expect(buildActivityFeedByPlugin([]).size).toBe(0);
  });

  it("rejects negative limit", () => {
    expect(() => buildActivityFeedByPlugin([], -1)).toThrow(RangeError);
  });

  it("rejects non-integer limit", () => {
    expect(() => buildActivityFeedByPlugin([], 1.5)).toThrow(RangeError);
  });

  it("limit=0 returns empty per-plugin slices", () => {
    const events: PluginLifecycleEvent[] = [ev("com.a", "load", "success", 1)];
    const feed = buildActivityFeedByPlugin(events, 0);
    expect(feed.get("com.a")).toEqual([]);
  });
});

describe("buildRecentActivityFeed", () => {
  it("returns global events most-recent-first", () => {
    const events: PluginLifecycleEvent[] = [
      ev("com.a", "load", "success", 1),
      ev("com.b", "enable", "success", 2),
      ev("com.a", "enable", "success", 3),
    ];
    const feed = buildRecentActivityFeed(events);
    expect(feed.map((e) => e.at)).toEqual([3, 2, 1]);
  });

  it("caps at limit", () => {
    const events: PluginLifecycleEvent[] = [
      ev("com.a", "load", "success", 1),
      ev("com.b", "enable", "success", 2),
      ev("com.a", "enable", "success", 3),
    ];
    expect(buildRecentActivityFeed(events, 2).map((e) => e.at)).toEqual([3, 2]);
  });

  it("returns empty on empty input", () => {
    expect(buildRecentActivityFeed([])).toEqual([]);
  });
});

describe("summarizeActivity", () => {
  it("aggregates counts by phase + outcome", () => {
    const events: PluginLifecycleEvent[] = [
      ev("com.a", "load", "success", 1),
      ev("com.a", "enable", "success", 2),
      ev("com.b", "enable", "failed", 3),
      ev("com.a", "disable", "success", 4),
    ];
    const summary = summarizeActivity(events);
    expect(summary.total).toBe(4);
    expect(summary.successes).toBe(3);
    expect(summary.failures).toBe(1);
    expect(summary.byPhase).toEqual({ load: 1, enable: 2, disable: 1 });
    expect(summary.byOutcome).toEqual({ success: 3, failed: 1 });
  });

  it("returns zeros on empty input", () => {
    expect(summarizeActivity([])).toEqual({
      total: 0,
      successes: 0,
      failures: 0,
      byPhase: { load: 0, enable: 0, disable: 0 },
      byOutcome: { success: 0, failed: 0 },
    });
  });
});
