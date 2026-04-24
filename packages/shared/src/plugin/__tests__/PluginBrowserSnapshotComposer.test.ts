import { describe, expect, it } from "vitest";
import { composePluginBrowserSnapshot } from "../PluginBrowserSnapshotComposer.js";
import type { PluginLifecycleEvent } from "../PluginLifecycleJournal.js";
import type { LifecyclePhase } from "../PluginLoader.js";
import type { PluginRegistryHealthDigest } from "../PluginRegistryHealthDigest.js";

function ev(
  pluginId: string,
  phase: LifecyclePhase,
  outcome: "success" | "failed",
  at: number,
): PluginLifecycleEvent {
  return { pluginId, phase, outcome, at };
}

function emptyDigest(): PluginRegistryHealthDigest {
  return {
    severity: "ok",
    counts: {
      hostIssueCount: 0,
      divergencePluginCount: 0,
      recentFailureCount: 0,
    },
    headline: "healthy",
    hostIssues: [],
    divergences: new Map(),
    recentFailures: [],
  };
}

describe("composePluginBrowserSnapshot", () => {
  it("produces empty header + visibleRows when no plugins", () => {
    const out = composePluginBrowserSnapshot({
      pluginIds: [],
      healthDigest: emptyDigest(),
      lifecycleEvents: [],
    });
    expect(out.visibleRows).toEqual([]);
    expect(out.header.headline).toBe("0 plugins");
    expect(out.header.worstSeverity).toBe("ok");
  });

  it("produces a row per plugin id", () => {
    const out = composePluginBrowserSnapshot({
      pluginIds: ["com.x", "com.y"],
      healthDigest: emptyDigest(),
      lifecycleEvents: [],
    });
    expect(out.rowSummaries.size).toBe(2);
    expect(out.healthBadges.size).toBe(2);
    expect(out.stabilityBadges.size).toBe(2);
  });

  it("classifies stability per plugin from journal events", () => {
    const events: PluginLifecycleEvent[] = [
      ev("com.x", "load", "failed", 1),
      ev("com.x", "enable", "failed", 2),
      ev("com.x", "enable", "failed", 3),
    ];
    const out = composePluginBrowserSnapshot({
      pluginIds: ["com.x", "com.y"],
      healthDigest: emptyDigest(),
      lifecycleEvents: events,
    });
    expect(out.stabilityBadges.get("com.x")?.rating).toBe("broken");
    expect(out.stabilityBadges.get("com.y")?.rating).toBe("unknown");
  });

  it("escalates row severity to error when stability is broken", () => {
    const out = composePluginBrowserSnapshot({
      pluginIds: ["com.x"],
      healthDigest: emptyDigest(),
      lifecycleEvents: [
        ev("com.x", "load", "failed", 1),
        ev("com.x", "load", "failed", 2),
        ev("com.x", "load", "failed", 3),
      ],
    });
    expect(out.rowSummaries.get("com.x")?.severity).toBe("error");
    expect(out.header.counts.error).toBe(1);
  });

  it("applies severity filter to visibleRows but not rowSummaries", () => {
    const out = composePluginBrowserSnapshot(
      {
        pluginIds: ["com.x", "com.y"],
        healthDigest: emptyDigest(),
        lifecycleEvents: [
          ev("com.x", "load", "failed", 1),
          ev("com.x", "load", "failed", 2),
          ev("com.x", "load", "failed", 3),
        ],
      },
      { filter: { include: new Set(["error"]) } },
    );
    expect(out.rowSummaries.size).toBe(2);
    expect(out.visibleRows).toHaveLength(1);
    expect(out.visibleRows[0].pluginId).toBe("com.x");
  });

  it("applies sort to visibleRows", () => {
    const events: PluginLifecycleEvent[] = [
      ev("com.x", "load", "failed", 1),
      ev("com.x", "load", "failed", 2),
      ev("com.x", "load", "failed", 3),
    ];
    const out = composePluginBrowserSnapshot(
      {
        pluginIds: ["com.y", "com.x", "com.z"],
        healthDigest: emptyDigest(),
        lifecycleEvents: events,
      },
      { sort: { key: "severity", direction: "desc" } },
    );
    // com.x is broken (error), others are unknown (info) — error first.
    expect(out.visibleRows.map((r) => r.pluginId)).toEqual([
      "com.x",
      "com.y",
      "com.z",
    ]);
  });

  it("forwards stability options", () => {
    const out = composePluginBrowserSnapshot(
      {
        pluginIds: ["com.x"],
        healthDigest: emptyDigest(),
        lifecycleEvents: [
          ev("com.x", "load", "failed", 1),
          ev("com.x", "load", "failed", 2),
        ],
      },
      { stability: { brokenAfterTrailingFailures: 2 } },
    );
    expect(out.stabilityBadges.get("com.x")?.rating).toBe("broken");
  });

  it("header counts reflect unfiltered totals (not visibleRows)", () => {
    const out = composePluginBrowserSnapshot(
      {
        pluginIds: ["com.x", "com.y"],
        healthDigest: emptyDigest(),
        lifecycleEvents: [
          ev("com.x", "load", "failed", 1),
          ev("com.x", "load", "failed", 2),
          ev("com.x", "load", "failed", 3),
        ],
      },
      { filter: { include: new Set(["ok"]) } },
    );
    expect(out.visibleRows).toHaveLength(0);
    // Header still reports 1 error (com.x) + 1 info (com.y unknown).
    expect(out.header.counts.error).toBe(1);
    expect(out.header.counts.info).toBe(1);
  });
});
