import { describe, expect, it } from "vitest";
import type { PluginContributionDivergence } from "../PluginContributionDivergence.js";
import type {
  PluginHealthIssue,
  PluginHostHealthReport,
} from "../PluginHostHealthCheck.js";
import type { PluginLifecycleEvent } from "../PluginLifecycleJournal.js";
import { buildPluginRegistryHealthDigest } from "../PluginRegistryHealthDigest.js";

function healthyHostHealth(): PluginHostHealthReport {
  return { healthy: true, issues: [] };
}

function unhealthyHostHealth(
  issues: readonly PluginHealthIssue[],
): PluginHostHealthReport {
  return { healthy: issues.length === 0, issues };
}

const T_NOW = 1_700_000_000_000;

describe("buildPluginRegistryHealthDigest — severity classification", () => {
  it("returns ok severity for clean inputs", () => {
    const digest = buildPluginRegistryHealthDigest({
      hostHealth: healthyHostHealth(),
      events: [],
      now: T_NOW,
    });
    expect(digest.severity).toBe("ok");
    expect(digest.headline).toBe("healthy");
    expect(digest.counts).toEqual({
      hostIssueCount: 0,
      divergencePluginCount: 0,
      recentFailureCount: 0,
    });
  });

  it("returns warning severity when only divergences are present", () => {
    const divergences = new Map<
      string,
      readonly PluginContributionDivergence[]
    >();
    divergences.set("com.foo", [
      { kind: "widgets", advertised: 2, live: 1, delta: -1 },
    ]);
    const digest = buildPluginRegistryHealthDigest({
      hostHealth: healthyHostHealth(),
      contributionDivergencesByPlugin: divergences,
      events: [],
      now: T_NOW,
    });
    expect(digest.severity).toBe("warning");
    expect(digest.headline).toBe("1 divergent plugin");
  });

  it("returns error severity when any host issue is present", () => {
    const digest = buildPluginRegistryHealthDigest({
      hostHealth: unhealthyHostHealth([
        {
          kind: "missing-factory",
          pluginId: "com.bad",
          message: "no factory",
        },
      ]),
      events: [],
      now: T_NOW,
    });
    expect(digest.severity).toBe("error");
    expect(digest.headline).toBe("1 host issue");
  });

  it("returns error severity when only recent failures are present", () => {
    const events: readonly PluginLifecycleEvent[] = [
      {
        at: T_NOW - 1_000,
        pluginId: "com.x",
        phase: "load",
        outcome: "failed",
        errorMessage: "boom",
      },
    ];
    const digest = buildPluginRegistryHealthDigest({
      hostHealth: healthyHostHealth(),
      events,
      now: T_NOW,
    });
    expect(digest.severity).toBe("error");
    expect(digest.headline).toBe("1 recent failure");
  });
});

describe("buildPluginRegistryHealthDigest — divergence filtering", () => {
  it("drops plugins whose entries are all zero-delta", () => {
    const divergences = new Map<
      string,
      readonly PluginContributionDivergence[]
    >();
    divergences.set("com.matching", [
      { kind: "widgets", advertised: 1, live: 1, delta: 0 },
      { kind: "commands", advertised: 2, live: 2, delta: 0 },
    ]);
    divergences.set("com.divergent", [
      { kind: "widgets", advertised: 2, live: 1, delta: -1 },
    ]);
    const digest = buildPluginRegistryHealthDigest({
      hostHealth: healthyHostHealth(),
      contributionDivergencesByPlugin: divergences,
      events: [],
      now: T_NOW,
    });
    expect(digest.divergences.size).toBe(1);
    expect(digest.divergences.has("com.divergent")).toBe(true);
    expect(digest.divergences.has("com.matching")).toBe(false);
    expect(digest.counts.divergencePluginCount).toBe(1);
  });

  it("keeps only entries with nonzero delta within a divergent plugin", () => {
    const divergences = new Map<
      string,
      readonly PluginContributionDivergence[]
    >();
    divergences.set("com.mixed", [
      { kind: "widgets", advertised: 1, live: 1, delta: 0 },
      { kind: "commands", advertised: 0, live: 2, delta: 2 },
    ]);
    const digest = buildPluginRegistryHealthDigest({
      hostHealth: healthyHostHealth(),
      contributionDivergencesByPlugin: divergences,
      events: [],
      now: T_NOW,
    });
    const entries = digest.divergences.get("com.mixed");
    expect(entries).toHaveLength(1);
    expect(entries?.[0].kind).toBe("commands");
  });
});

describe("buildPluginRegistryHealthDigest — recent failure window", () => {
  it("filters events to outcome=failed within the window", () => {
    const events: readonly PluginLifecycleEvent[] = [
      // outside window
      {
        at: T_NOW - 25 * 60 * 60 * 1000,
        pluginId: "com.old",
        phase: "load",
        outcome: "failed",
        errorMessage: "stale",
      },
      // inside window, success → excluded
      {
        at: T_NOW - 100,
        pluginId: "com.ok",
        phase: "enable",
        outcome: "success",
      },
      // inside window, failed → included
      {
        at: T_NOW - 50,
        pluginId: "com.fresh",
        phase: "load",
        outcome: "failed",
        errorMessage: "fresh",
      },
    ];
    const digest = buildPluginRegistryHealthDigest({
      hostHealth: healthyHostHealth(),
      events,
      now: T_NOW,
    });
    expect(digest.recentFailures.map((e) => e.pluginId)).toEqual(["com.fresh"]);
  });

  it("sorts recent failures oldest-first", () => {
    const events: readonly PluginLifecycleEvent[] = [
      {
        at: T_NOW - 100,
        pluginId: "com.b",
        phase: "load",
        outcome: "failed",
        errorMessage: "x",
      },
      {
        at: T_NOW - 200,
        pluginId: "com.a",
        phase: "load",
        outcome: "failed",
        errorMessage: "y",
      },
      {
        at: T_NOW - 50,
        pluginId: "com.c",
        phase: "load",
        outcome: "failed",
        errorMessage: "z",
      },
    ];
    const digest = buildPluginRegistryHealthDigest({
      hostHealth: healthyHostHealth(),
      events,
      now: T_NOW,
    });
    expect(digest.recentFailures.map((e) => e.pluginId)).toEqual([
      "com.a",
      "com.b",
      "com.c",
    ]);
  });

  it("respects custom recentFailureWindowMs", () => {
    const events: readonly PluginLifecycleEvent[] = [
      {
        at: T_NOW - 5_000,
        pluginId: "com.recent",
        phase: "load",
        outcome: "failed",
        errorMessage: "x",
      },
      {
        at: T_NOW - 60_000,
        pluginId: "com.older",
        phase: "load",
        outcome: "failed",
        errorMessage: "y",
      },
    ];
    const digest = buildPluginRegistryHealthDigest({
      hostHealth: healthyHostHealth(),
      events,
      now: T_NOW,
      recentFailureWindowMs: 10_000,
    });
    expect(digest.recentFailures.map((e) => e.pluginId)).toEqual([
      "com.recent",
    ]);
  });
});

describe("buildPluginRegistryHealthDigest — headline composition", () => {
  it("joins all populated counts with commas", () => {
    const divergences = new Map<
      string,
      readonly PluginContributionDivergence[]
    >();
    divergences.set("com.div", [
      { kind: "widgets", advertised: 1, live: 0, delta: -1 },
    ]);
    const digest = buildPluginRegistryHealthDigest({
      hostHealth: unhealthyHostHealth([
        { kind: "missing-factory", pluginId: "com.x", message: "" },
        { kind: "missing-factory", pluginId: "com.y", message: "" },
      ]),
      contributionDivergencesByPlugin: divergences,
      events: [
        {
          at: T_NOW - 100,
          pluginId: "com.z",
          phase: "load",
          outcome: "failed",
          errorMessage: "x",
        },
      ],
      now: T_NOW,
    });
    expect(digest.headline).toBe(
      "2 host issues, 1 divergent plugin, 1 recent failure",
    );
    expect(digest.severity).toBe("error");
  });

  it("pluralizes per-count independently", () => {
    const events: readonly PluginLifecycleEvent[] = [
      {
        at: T_NOW - 10,
        pluginId: "com.a",
        phase: "load",
        outcome: "failed",
        errorMessage: "x",
      },
      {
        at: T_NOW - 20,
        pluginId: "com.b",
        phase: "load",
        outcome: "failed",
        errorMessage: "y",
      },
    ];
    const digest = buildPluginRegistryHealthDigest({
      hostHealth: unhealthyHostHealth([
        { kind: "missing-factory", pluginId: "com.x", message: "" },
      ]),
      events,
      now: T_NOW,
    });
    expect(digest.headline).toBe("1 host issue, 2 recent failures");
  });
});
