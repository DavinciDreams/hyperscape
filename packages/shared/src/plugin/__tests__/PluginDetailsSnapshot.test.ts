import { describe, expect, it } from "vitest";
import type { PluginBrowserRow } from "../PluginBrowserSnapshot.js";
import type { PluginLifecycleEvent } from "../PluginLifecycleJournal.js";
import type { DisableImpactEntry } from "../PluginDependencyGraph.js";
import { buildPluginDetailsSnapshot } from "../PluginDetailsSnapshot.js";

function mkRow(partial: Partial<PluginBrowserRow>): PluginBrowserRow {
  return {
    id: "com.example",
    name: "Example",
    version: "1.0.0",
    description: "",
    author: "Acme",
    license: "MIT",
    state: "enabled",
    enabledByDefault: true,
    hasFactory: true,
    dependencyIds: [],
    tags: [],
    contributions: {
      systems: 0,
      entities: 0,
      widgets: 0,
      manifestSchemas: 0,
      paletteCategories: 0,
      toolbarTools: 0,
      commands: 0,
    },
    errorMessage: null,
    healthIssues: [],
    ...partial,
  } as PluginBrowserRow;
}

describe("buildPluginDetailsSnapshot", () => {
  it("passes through the base browser row", () => {
    const row = mkRow({ id: "com.a", name: "A" });
    const snap = buildPluginDetailsSnapshot({
      row,
      liveContributions: {},
      advertisedContributions: {},
      recentEvents: [],
      disableImpact: [],
    });
    expect(snap.row).toBe(row);
  });

  it("computes divergence + hasDivergence=false when counts match", () => {
    const snap = buildPluginDetailsSnapshot({
      row: mkRow({}),
      liveContributions: { palette: 2, toolbarTool: 1 },
      advertisedContributions: { palette: 2, toolbarTool: 1 },
      recentEvents: [],
      disableImpact: [],
    });
    expect(snap.divergence).toEqual([]);
    expect(snap.hasDivergence).toBe(false);
  });

  it("computes divergence + hasDivergence=true when counts mismatch", () => {
    const snap = buildPluginDetailsSnapshot({
      row: mkRow({}),
      liveContributions: { palette: 1 },
      advertisedContributions: { palette: 3 },
      recentEvents: [],
      disableImpact: [],
    });
    expect(snap.divergence).toEqual([
      { kind: "palette", advertised: 3, live: 1, delta: -2 },
    ]);
    expect(snap.hasDivergence).toBe(true);
  });

  it("surfaces health-issue count and error message", () => {
    const row = mkRow({
      errorMessage: "boom",
      healthIssues: [
        {
          pluginId: "com.example",
          kind: "missing-factory",
          severity: "error",
          message: "no factory",
        },
        {
          pluginId: "com.example",
          kind: "missing-hard-dependency",
          severity: "error",
          message: "missing dep",
        },
      ],
    });
    const snap = buildPluginDetailsSnapshot({
      row,
      liveContributions: {},
      advertisedContributions: {},
      recentEvents: [],
      disableImpact: [],
    });
    expect(snap.errorMessage).toBe("boom");
    expect(snap.healthIssueCount).toBe(2);
  });

  it("passes recent events through unchanged", () => {
    const events: PluginLifecycleEvent[] = [
      { at: 1, pluginId: "com.example", phase: "load", outcome: "success" },
      { at: 2, pluginId: "com.example", phase: "enable", outcome: "success" },
    ];
    const snap = buildPluginDetailsSnapshot({
      row: mkRow({}),
      liveContributions: {},
      advertisedContributions: {},
      recentEvents: events,
      disableImpact: [],
    });
    expect(snap.recentEvents).toBe(events);
  });

  it("reports disableImpact count", () => {
    const impact: DisableImpactEntry[] = [
      {
        pluginId: "com.dependent.a",
        via: ["com.example"],
        currentState: "enabled",
      },
      {
        pluginId: "com.dependent.b",
        via: ["com.example", "com.dependent.a"],
        currentState: "loaded",
      },
    ];
    const snap = buildPluginDetailsSnapshot({
      row: mkRow({}),
      liveContributions: {},
      advertisedContributions: {},
      recentEvents: [],
      disableImpact: impact,
    });
    expect(snap.disableImpactCount).toBe(2);
    expect(snap.disableImpact).toBe(impact);
  });
});
