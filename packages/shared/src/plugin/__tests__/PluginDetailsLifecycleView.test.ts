import { describe, expect, it } from "vitest";
import { buildPluginDetailsLifecycleView } from "../PluginDetailsLifecycleView.js";
import type { PluginLifecycleEvent } from "../PluginLifecycleJournal.js";
import type { LifecyclePhase } from "../PluginLoader.js";

function ev(
  pluginId: string,
  phase: LifecyclePhase,
  outcome: "success" | "failed",
  at: number,
): PluginLifecycleEvent {
  return { pluginId, phase, outcome, at };
}

const NOW = 1_000_000_000;
const HOUR = 60 * 60 * 1000;

describe("buildPluginDetailsLifecycleView", () => {
  it("returns all four sub-projections under the same pluginId", () => {
    const view = buildPluginDetailsLifecycleView(
      "com.x",
      [
        ev("com.x", "load", "success", NOW - 4 * HOUR),
        ev("com.x", "enable", "success", NOW - 3 * HOUR),
        ev("com.x", "enable", "failed", NOW - 2 * HOUR),
      ],
      { failureWindow: { now: NOW } },
    );
    expect(view.pluginId).toBe("com.x");
    expect(view.stats.pluginId).toBe("com.x");
    expect(view.stability.pluginId).toBe("com.x");
    expect(view.timeline.pluginId).toBe("com.x");
    expect(view.failureWindow.pluginId).toBe("com.x");
  });

  it("derives stats accurately", () => {
    const view = buildPluginDetailsLifecycleView(
      "com.x",
      [
        ev("com.x", "load", "success", 1),
        ev("com.x", "enable", "failed", 2),
        ev("com.x", "enable", "success", 3),
      ],
      { failureWindow: { now: NOW } },
    );
    expect(view.stats.totalEvents).toBe(3);
    expect(view.stats.successCount).toBe(2);
    expect(view.stats.failedCount).toBe(1);
  });

  it("uses stability classifier defaults — flaky on low success rate", () => {
    // 7 successes + 3 failures, but ending with a success so trailing
    // failures < 3 (broken takes precedence otherwise).
    const events: PluginLifecycleEvent[] = [
      ev("com.x", "load", "success", 1),
      ev("com.x", "enable", "failed", 2),
      ev("com.x", "load", "success", 3),
      ev("com.x", "enable", "failed", 4),
      ev("com.x", "load", "success", 5),
      ev("com.x", "enable", "failed", 6),
      ev("com.x", "load", "success", 7),
      ev("com.x", "load", "success", 8),
      ev("com.x", "load", "success", 9),
      ev("com.x", "load", "success", 10),
    ];
    const view = buildPluginDetailsLifecycleView("com.x", events, {
      failureWindow: { now: NOW },
    });
    expect(view.stats.failedCount).toBe(3);
    expect(view.stats.successCount).toBe(7);
    expect(view.stability.rating).toBe("flaky");
  });

  it("forwards stability options", () => {
    const events: PluginLifecycleEvent[] = [
      ev("com.x", "load", "failed", 1),
      ev("com.x", "load", "failed", 2),
    ];
    const view = buildPluginDetailsLifecycleView("com.x", events, {
      stability: { brokenAfterTrailingFailures: 2 },
      failureWindow: { now: NOW },
    });
    expect(view.stability.rating).toBe("broken");
  });

  it("forwards timeline maxEntries cap", () => {
    const events: PluginLifecycleEvent[] = [];
    for (let i = 0; i < 10; i++) events.push(ev("com.x", "load", "success", i));
    const view = buildPluginDetailsLifecycleView("com.x", events, {
      timeline: { maxEntries: 3 },
      failureWindow: { now: NOW },
    });
    expect(view.timeline.entries).toHaveLength(3);
    expect(view.timeline.truncated).toBe(true);
  });

  it("forwards failureWindow now + windowMs", () => {
    const view = buildPluginDetailsLifecycleView(
      "com.x",
      [
        ev("com.x", "load", "failed", NOW - 30 * 60 * 1000), // 30min ago
        ev("com.x", "enable", "failed", NOW - 90 * 60 * 1000), // 90min ago
      ],
      { failureWindow: { now: NOW, windowMs: HOUR } },
    );
    expect(view.failureWindow.failureCount).toBe(1);
    expect(view.failureWindow.windowMs).toBe(HOUR);
  });

  it("returns coherent view on empty event stream", () => {
    const view = buildPluginDetailsLifecycleView("com.x", [], {
      failureWindow: { now: NOW },
    });
    expect(view.stats.totalEvents).toBe(0);
    expect(view.stability.rating).toBe("unknown");
    expect(view.timeline.entries).toEqual([]);
    expect(view.failureWindow.failureCount).toBe(0);
  });

  it("ignores events for other plugins across all four projections", () => {
    const view = buildPluginDetailsLifecycleView(
      "com.x",
      [ev("com.y", "load", "success", 1), ev("com.y", "enable", "failed", 2)],
      { failureWindow: { now: NOW } },
    );
    expect(view.stats.totalEvents).toBe(0);
    expect(view.timeline.entries).toEqual([]);
    expect(view.failureWindow.failureCount).toBe(0);
  });
});
