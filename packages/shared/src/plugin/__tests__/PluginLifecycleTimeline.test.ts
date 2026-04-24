import { describe, expect, it } from "vitest";
import type { PluginLifecycleEvent } from "../PluginLifecycleJournal.js";
import { buildPluginLifecycleTimeline } from "../PluginLifecycleTimeline.js";
import type { LifecyclePhase } from "../PluginLoader.js";

function ev(
  pluginId: string,
  phase: LifecyclePhase,
  outcome: "success" | "failed",
  at: number,
): PluginLifecycleEvent {
  return { pluginId, phase, outcome, at };
}

describe("buildPluginLifecycleTimeline — empty", () => {
  it("returns empty entries + null firstAt/lastAt when no events", () => {
    const t = buildPluginLifecycleTimeline("com.x", []);
    expect(t.entries).toEqual([]);
    expect(t.sparkline).toBe("");
    expect(t.firstAt).toBeNull();
    expect(t.lastAt).toBeNull();
    expect(t.truncated).toBe(false);
  });

  it("returns empty entries when no events match pluginId", () => {
    const t = buildPluginLifecycleTimeline("com.x", [
      ev("com.y", "load", "success", 1),
    ]);
    expect(t.entries).toEqual([]);
    expect(t.truncated).toBe(false);
  });
});

describe("buildPluginLifecycleTimeline — basic projection", () => {
  it("preserves chronological order (oldest first)", () => {
    const t = buildPluginLifecycleTimeline("com.x", [
      ev("com.x", "load", "success", 1),
      ev("com.x", "enable", "failed", 2),
      ev("com.x", "enable", "success", 3),
    ]);
    expect(t.entries.map((e) => e.at)).toEqual([1, 2, 3]);
  });

  it("emits · for success and x for failure", () => {
    const t = buildPluginLifecycleTimeline("com.x", [
      ev("com.x", "load", "success", 1),
      ev("com.x", "enable", "failed", 2),
      ev("com.x", "enable", "success", 3),
    ]);
    expect(t.sparkline).toBe("·x·");
    expect(t.entries.map((e) => e.glyph)).toEqual(["·", "x", "·"]);
  });

  it("ignores events for other plugins", () => {
    const t = buildPluginLifecycleTimeline("com.x", [
      ev("com.y", "load", "success", 1),
      ev("com.x", "load", "success", 2),
      ev("com.z", "load", "failed", 3),
      ev("com.x", "enable", "failed", 4),
    ]);
    expect(t.entries.map((e) => e.at)).toEqual([2, 4]);
    expect(t.sparkline).toBe("·x");
  });

  it("reports firstAt and lastAt from kept entries", () => {
    const t = buildPluginLifecycleTimeline("com.x", [
      ev("com.x", "load", "success", 100),
      ev("com.x", "enable", "success", 200),
      ev("com.x", "disable", "success", 300),
    ]);
    expect(t.firstAt).toBe(100);
    expect(t.lastAt).toBe(300);
  });
});

describe("buildPluginLifecycleTimeline — truncation", () => {
  it("keeps only the last N matching events when over the limit", () => {
    const events: PluginLifecycleEvent[] = [];
    for (let i = 0; i < 30; i++) {
      events.push(ev("com.x", "load", "success", i));
    }
    const t = buildPluginLifecycleTimeline("com.x", events, { maxEntries: 5 });
    expect(t.entries).toHaveLength(5);
    expect(t.entries.map((e) => e.at)).toEqual([25, 26, 27, 28, 29]);
    expect(t.truncated).toBe(true);
  });

  it("truncated=false when total <= maxEntries", () => {
    const t = buildPluginLifecycleTimeline(
      "com.x",
      [ev("com.x", "load", "success", 1), ev("com.x", "enable", "success", 2)],
      { maxEntries: 5 },
    );
    expect(t.truncated).toBe(false);
  });

  it("default maxEntries is 20", () => {
    const events: PluginLifecycleEvent[] = [];
    for (let i = 0; i < 50; i++) {
      events.push(ev("com.x", "load", "success", i));
    }
    const t = buildPluginLifecycleTimeline("com.x", events);
    expect(t.entries).toHaveLength(20);
    expect(t.truncated).toBe(true);
  });

  it("clamps maxEntries to at least 1", () => {
    const t = buildPluginLifecycleTimeline(
      "com.x",
      [ev("com.x", "load", "success", 1), ev("com.x", "enable", "success", 2)],
      { maxEntries: 0 },
    );
    expect(t.entries).toHaveLength(1);
    expect(t.entries[0].at).toBe(2);
    expect(t.truncated).toBe(true);
  });
});
