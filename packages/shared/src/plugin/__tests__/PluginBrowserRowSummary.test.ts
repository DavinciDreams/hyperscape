import { describe, expect, it } from "vitest";
import type { PluginRowHealthBadge } from "../PluginBrowserHealthBadges.js";
import {
  type SummarizePluginBrowserRowsInput,
  summarizePluginBrowserRows,
} from "../PluginBrowserRowSummary.js";
import type { PluginStabilityBadge } from "../PluginStabilityClassifier.js";

function health(
  pluginId: string,
  severity: PluginRowHealthBadge["severity"],
  reasons: string[] = [],
): PluginRowHealthBadge {
  return {
    pluginId,
    severity,
    reasons,
    counts: {
      hostIssueCount: 0,
      divergentContributionCount: 0,
      recentFailureCount: 0,
    },
  };
}

function stab(
  pluginId: string,
  rating: PluginStabilityBadge["rating"],
  reason: string,
): PluginStabilityBadge {
  return { pluginId, rating, reason };
}

function build(
  pluginIds: string[],
  healthList: PluginRowHealthBadge[],
  stabList: PluginStabilityBadge[],
): SummarizePluginBrowserRowsInput {
  return {
    pluginIds,
    healthBadges: new Map(healthList.map((b) => [b.pluginId, b])),
    stabilityBadges: new Map(stabList.map((b) => [b.pluginId, b])),
  };
}

describe("summarizePluginBrowserRows — severity rules", () => {
  it("ok when health and stability are both clean", () => {
    const out = summarizePluginBrowserRows(
      build(
        ["com.x"],
        [health("com.x", "ok")],
        [stab("com.x", "stable", "all-clean")],
      ),
    );
    const row = out.get("com.x");
    expect(row?.severity).toBe("ok");
    expect(row?.label).toBe("stable");
    expect(row?.reasons).toEqual([]);
  });

  it("error when health says error, regardless of stability", () => {
    const out = summarizePluginBrowserRows(
      build(
        ["com.x"],
        [health("com.x", "error", ["host: missing-factory"])],
        [stab("com.x", "stable", "all-clean")],
      ),
    );
    const row = out.get("com.x");
    expect(row?.severity).toBe("error");
    expect(row?.label).toBe("error");
    expect(row?.reasons).toContain("host: missing-factory");
  });

  it("error when stability is broken even if health is clean", () => {
    const out = summarizePluginBrowserRows(
      build(
        ["com.x"],
        [health("com.x", "ok")],
        [stab("com.x", "broken", "3 consecutive failures")],
      ),
    );
    const row = out.get("com.x");
    expect(row?.severity).toBe("error");
    expect(row?.label).toBe("broken");
    expect(row?.reasons).toEqual(["3 consecutive failures"]);
  });

  it("warning when health is warning and stability is stable", () => {
    const out = summarizePluginBrowserRows(
      build(
        ["com.x"],
        [health("com.x", "warning", ["divergence: ui +1"])],
        [stab("com.x", "stable", "all-clean")],
      ),
    );
    const row = out.get("com.x");
    expect(row?.severity).toBe("warning");
    expect(row?.label).toBe("warning");
  });

  it("warning when stability is flaky and health is clean", () => {
    const out = summarizePluginBrowserRows(
      build(
        ["com.x"],
        [health("com.x", "ok")],
        [stab("com.x", "flaky", "success rate 70%")],
      ),
    );
    const row = out.get("com.x");
    expect(row?.severity).toBe("warning");
    expect(row?.label).toBe("flaky");
    expect(row?.reasons).toEqual(["success rate 70%"]);
  });

  it("info when stability is unknown and health is clean", () => {
    const out = summarizePluginBrowserRows(
      build(
        ["com.x"],
        [health("com.x", "ok")],
        [stab("com.x", "unknown", "only 1 events")],
      ),
    );
    const row = out.get("com.x");
    expect(row?.severity).toBe("info");
    expect(row?.label).toBe("unrated");
    // unknown is not surfaced as a reason — it's just lack of data
    expect(row?.reasons).toEqual(["only 1 events"]);
  });
});

describe("summarizePluginBrowserRows — missing inputs", () => {
  it("ok when neither badge is present (no data, treat as ok)", () => {
    const out = summarizePluginBrowserRows(build(["com.x"], [], []));
    const row = out.get("com.x");
    expect(row?.severity).toBe("ok");
    expect(row?.label).toBe("ok");
    expect(row?.health).toBeNull();
    expect(row?.stability).toBeNull();
  });

  it("preserves pluginIds insertion order", () => {
    const out = summarizePluginBrowserRows(build(["b", "a", "c"], [], []));
    expect(Array.from(out.keys())).toEqual(["b", "a", "c"]);
  });
});

describe("summarizePluginBrowserRows — reason merging", () => {
  it("dedupes overlapping reasons across health and stability", () => {
    const out = summarizePluginBrowserRows(
      build(
        ["com.x"],
        [health("com.x", "warning", ["overlap reason"])],
        [stab("com.x", "flaky", "overlap reason")],
      ),
    );
    const row = out.get("com.x");
    expect(row?.reasons).toEqual(["overlap reason"]);
  });

  it("emits health reasons before stability reasons", () => {
    const out = summarizePluginBrowserRows(
      build(
        ["com.x"],
        [health("com.x", "error", ["host first", "second"])],
        [stab("com.x", "broken", "stability last")],
      ),
    );
    const row = out.get("com.x");
    expect(row?.reasons).toEqual(["host first", "second", "stability last"]);
  });
});
