import { describe, expect, it } from "vitest";
import { buildPluginBrowserHealthBadges } from "../PluginBrowserHealthBadges.js";
import type { PluginContributionDivergence } from "../PluginContributionDivergence.js";
import type { PluginHealthIssue } from "../PluginHostHealthCheck.js";
import type { PluginLifecycleEvent } from "../PluginLifecycleJournal.js";
import type { PluginRegistryHealthDigest } from "../PluginRegistryHealthDigest.js";

function digest(
  parts: Partial<PluginRegistryHealthDigest> = {},
): PluginRegistryHealthDigest {
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
    ...parts,
  };
}

describe("buildPluginBrowserHealthBadges — severity per plugin", () => {
  it("returns ok with empty reasons for plugins with no signal", () => {
    const badges = buildPluginBrowserHealthBadges(digest(), ["com.a", "com.b"]);
    expect(badges.size).toBe(2);
    const a = badges.get("com.a")!;
    expect(a.severity).toBe("ok");
    expect(a.reasons).toEqual([]);
    expect(a.counts).toEqual({
      hostIssueCount: 0,
      divergentContributionCount: 0,
      recentFailureCount: 0,
    });
  });

  it("escalates a row to error on any host issue", () => {
    const issues: PluginHealthIssue[] = [
      { kind: "missing-factory", pluginId: "com.bad", message: "no factory" },
    ];
    const badges = buildPluginBrowserHealthBadges(
      digest({ hostIssues: issues }),
      ["com.bad"],
    );
    const row = badges.get("com.bad")!;
    expect(row.severity).toBe("error");
    expect(row.counts.hostIssueCount).toBe(1);
    expect(row.reasons).toContain("missing factory");
  });

  it("escalates a row to error on any recent failure", () => {
    const events: PluginLifecycleEvent[] = [
      {
        at: 1,
        pluginId: "com.x",
        phase: "load",
        outcome: "failed",
        errorMessage: "boom",
      },
    ];
    const badges = buildPluginBrowserHealthBadges(
      digest({ recentFailures: events }),
      ["com.x"],
    );
    const row = badges.get("com.x")!;
    expect(row.severity).toBe("error");
    expect(row.reasons).toContain("recent failure (load)");
  });

  it("warns when the only signal is a divergence", () => {
    const divergences = new Map<
      string,
      readonly PluginContributionDivergence[]
    >();
    divergences.set("com.div", [
      { kind: "widgets", advertised: 2, live: 1, delta: -1 },
    ]);
    const badges = buildPluginBrowserHealthBadges(digest({ divergences }), [
      "com.div",
    ]);
    const row = badges.get("com.div")!;
    expect(row.severity).toBe("warning");
    expect(row.reasons).toEqual(["widgets: -1"]);
    expect(row.counts.divergentContributionCount).toBe(1);
  });
});

describe("buildPluginBrowserHealthBadges — reason composition", () => {
  it("emits one reason per host issue and per divergence entry", () => {
    const hostIssues: PluginHealthIssue[] = [
      { kind: "missing-factory", pluginId: "com.x", message: "" },
      { kind: "version-mismatch", pluginId: "com.x", message: "" },
    ];
    const divergences = new Map<
      string,
      readonly PluginContributionDivergence[]
    >();
    divergences.set("com.x", [
      { kind: "widgets", advertised: 1, live: 0, delta: -1 },
      { kind: "commands", advertised: 0, live: 2, delta: 2 },
    ]);
    const badges = buildPluginBrowserHealthBadges(
      digest({ hostIssues, divergences }),
      ["com.x"],
    );
    const row = badges.get("com.x")!;
    expect(row.reasons).toEqual([
      "missing factory",
      "version mismatch",
      "widgets: -1",
      "commands: +2",
    ]);
    expect(row.severity).toBe("error");
  });

  it("collapses multiple recent failures into a single count fragment", () => {
    const events: PluginLifecycleEvent[] = [
      {
        at: 1,
        pluginId: "com.x",
        phase: "load",
        outcome: "failed",
        errorMessage: "a",
      },
      {
        at: 2,
        pluginId: "com.x",
        phase: "enable",
        outcome: "failed",
        errorMessage: "b",
      },
      {
        at: 3,
        pluginId: "com.x",
        phase: "load",
        outcome: "failed",
        errorMessage: "c",
      },
    ];
    const badges = buildPluginBrowserHealthBadges(
      digest({ recentFailures: events }),
      ["com.x"],
    );
    expect(badges.get("com.x")!.reasons).toEqual(["3 recent failures"]);
  });

  it("falls through unknown host-issue kinds verbatim", () => {
    const hostIssues: PluginHealthIssue[] = [
      {
        kind: "future-kind" as PluginHealthIssue["kind"],
        pluginId: "com.x",
        message: "",
      },
    ];
    const badges = buildPluginBrowserHealthBadges(digest({ hostIssues }), [
      "com.x",
    ]);
    expect(badges.get("com.x")!.reasons).toContain("future-kind");
  });
});

describe("buildPluginBrowserHealthBadges — id list discipline", () => {
  it("only emits rows for ids passed in, even if digest has more", () => {
    const divergences = new Map<
      string,
      readonly PluginContributionDivergence[]
    >();
    divergences.set("com.absent", [
      { kind: "widgets", advertised: 1, live: 0, delta: -1 },
    ]);
    const badges = buildPluginBrowserHealthBadges(digest({ divergences }), [
      "com.present",
    ]);
    expect(badges.size).toBe(1);
    expect(badges.has("com.present")).toBe(true);
    expect(badges.has("com.absent")).toBe(false);
  });

  it("preserves order of pluginIds via Map insertion order", () => {
    const badges = buildPluginBrowserHealthBadges(digest(), [
      "com.b",
      "com.a",
      "com.c",
    ]);
    expect(Array.from(badges.keys())).toEqual(["com.b", "com.a", "com.c"]);
  });
});
