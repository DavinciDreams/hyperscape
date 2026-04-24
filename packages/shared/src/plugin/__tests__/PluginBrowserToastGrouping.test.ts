import { describe, expect, it } from "vitest";
import type { PluginRowSummarySeverity } from "../PluginBrowserRowSummary.js";
import type {
  PluginBrowserToastIntent,
  PluginBrowserToastKind,
} from "../PluginBrowserToastRouter.js";
import { groupPluginBrowserToastIntents } from "../PluginBrowserToastGrouping.js";

function mkIntent(
  pluginId: string,
  kind: PluginBrowserToastKind,
  severity: PluginRowSummarySeverity,
): PluginBrowserToastIntent {
  return {
    id: `${kind}:${pluginId}`,
    kind,
    severity,
    pluginId,
    previous: null,
    current: null,
  };
}

describe("groupPluginBrowserToastIntents — basics", () => {
  it("returns [] when input is empty", () => {
    expect(groupPluginBrowserToastIntents([])).toEqual([]);
  });

  it("one intent per plugin becomes one group with no additionals", () => {
    const groups = groupPluginBrowserToastIntents([
      mkIntent("a", "regressed", "error"),
      mkIntent("b", "added", "info"),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].pluginId).toBe("a");
    expect(groups[0].additional).toEqual([]);
    expect(groups[0].severity).toBe("error");
  });
});

describe("groupPluginBrowserToastIntents — collapsing", () => {
  it("collapses multiple intents for the same plugin into one group", () => {
    const groups = groupPluginBrowserToastIntents([
      mkIntent("a", "regressed", "error"),
      mkIntent("a", "label-changed", "error"),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].primary.kind).toBe("regressed");
    expect(groups[0].additional).toHaveLength(1);
    expect(groups[0].additional[0].kind).toBe("label-changed");
  });

  it("preserves first-occurrence order as primary", () => {
    // Even if the input weren't priority-sorted, the router contract is
    // that primary == first seen in the input slice.
    const groups = groupPluginBrowserToastIntents([
      mkIntent("a", "label-changed", "warning"),
      mkIntent("a", "regressed", "error"),
    ]);
    expect(groups[0].primary.kind).toBe("label-changed");
    expect(groups[0].additional[0].kind).toBe("regressed");
  });

  it("preserves additional intents in input order", () => {
    const groups = groupPluginBrowserToastIntents([
      mkIntent("a", "regressed", "error"),
      mkIntent("a", "label-changed", "error"),
      mkIntent("a", "recovered", "warning"),
    ]);
    expect(groups[0].additional.map((i) => i.kind)).toEqual([
      "label-changed",
      "recovered",
    ]);
  });
});

describe("groupPluginBrowserToastIntents — group ordering", () => {
  it("group order follows first-occurrence order of pluginId", () => {
    const groups = groupPluginBrowserToastIntents([
      mkIntent("zeta", "regressed", "error"),
      mkIntent("alpha", "added", "info"),
      mkIntent("zeta", "label-changed", "error"),
    ]);
    expect(groups.map((g) => g.pluginId)).toEqual(["zeta", "alpha"]);
  });
});

describe("groupPluginBrowserToastIntents — severity", () => {
  it("group severity reflects worst severity across members", () => {
    const groups = groupPluginBrowserToastIntents([
      mkIntent("a", "label-changed", "info"),
      mkIntent("a", "regressed", "error"),
      mkIntent("a", "recovered", "warning"),
    ]);
    expect(groups[0].severity).toBe("error");
  });

  it("severity ranks ok<info<warning<error", () => {
    const groups = groupPluginBrowserToastIntents([
      mkIntent("a", "recovered", "ok"),
      mkIntent("a", "label-changed", "info"),
    ]);
    expect(groups[0].severity).toBe("info");
  });
});
