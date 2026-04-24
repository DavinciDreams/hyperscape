import { describe, expect, it } from "vitest";
import type { PluginContributionDivergence } from "../PluginContributionDivergence.js";
import type { PluginHealthIssue } from "../PluginHostHealthCheck.js";
import type { PluginLifecycleEvent } from "../PluginLifecycleJournal.js";
import { formatPluginRegistryHealthDigest } from "../PluginRegistryHealthDigestFormat.js";
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

describe("formatPluginRegistryHealthDigest — clean case", () => {
  it("renders a single headline line when nothing is wrong", () => {
    const text = formatPluginRegistryHealthDigest(digest());
    expect(text).toBe("plugin health: ok — healthy");
  });
});

describe("formatPluginRegistryHealthDigest — section composition", () => {
  it("renders host-issue section with optional message tail", () => {
    const issues: PluginHealthIssue[] = [
      {
        kind: "missing-factory",
        pluginId: "com.bad",
        message: "no factory",
      },
      { kind: "orphan-factory", pluginId: "com.orphan", message: "" },
    ];
    const text = formatPluginRegistryHealthDigest(
      digest({
        severity: "error",
        counts: {
          hostIssueCount: 2,
          divergencePluginCount: 0,
          recentFailureCount: 0,
        },
        headline: "2 host issues",
        hostIssues: issues,
      }),
    );
    expect(text).toContain("plugin health: error — 2 host issues");
    expect(text).toContain("host issues (2):");
    expect(text).toContain("- com.bad: missing-factory — no factory");
    expect(text).toContain("- com.orphan: orphan-factory");
    expect(text).not.toContain("orphan-factory —"); // no trailing dash on empty msg
  });

  it("renders divergent-plugins section with per-entry indent", () => {
    const divergences = new Map<
      string,
      readonly PluginContributionDivergence[]
    >();
    divergences.set("com.div", [
      { kind: "widgets", advertised: 2, live: 1, delta: -1 },
      { kind: "commands", advertised: 0, live: 3, delta: 3 },
    ]);
    const text = formatPluginRegistryHealthDigest(
      digest({
        severity: "warning",
        counts: {
          hostIssueCount: 0,
          divergencePluginCount: 1,
          recentFailureCount: 0,
        },
        headline: "1 divergent plugin",
        divergences,
      }),
    );
    expect(text).toContain("divergent plugins (1):");
    expect(text).toContain("- com.div:");
    expect(text).toContain("      widgets: advertised 2, live 1 (delta -1)");
    expect(text).toContain("      commands: advertised 0, live 3 (delta +3)");
  });

  it("renders recent-failures section", () => {
    const events: PluginLifecycleEvent[] = [
      {
        at: 1,
        pluginId: "com.x",
        phase: "load",
        outcome: "failed",
        errorMessage: "boom",
      },
      {
        at: 2,
        pluginId: "com.y",
        phase: "enable",
        outcome: "failed",
        errorMessage: "",
      },
    ];
    const text = formatPluginRegistryHealthDigest(
      digest({
        severity: "error",
        counts: {
          hostIssueCount: 0,
          divergencePluginCount: 0,
          recentFailureCount: 2,
        },
        headline: "2 recent failures",
        recentFailures: events,
      }),
    );
    expect(text).toContain("recent failures (2):");
    expect(text).toContain("- com.x load: boom");
    expect(text).toContain("- com.y enable");
    expect(text).not.toContain("com.y enable:"); // no trailing colon when no msg
  });

  it("omits empty sections entirely", () => {
    const text = formatPluginRegistryHealthDigest(
      digest({
        severity: "error",
        counts: {
          hostIssueCount: 1,
          divergencePluginCount: 0,
          recentFailureCount: 0,
        },
        headline: "1 host issue",
        hostIssues: [
          { kind: "missing-factory", pluginId: "com.x", message: "" },
        ],
      }),
    );
    expect(text).toContain("host issues (1):");
    expect(text).not.toContain("divergent plugins");
    expect(text).not.toContain("recent failures");
  });
});

describe("formatPluginRegistryHealthDigest — display name resolution", () => {
  it("appends resolved display name in parens when distinct from id", () => {
    const text = formatPluginRegistryHealthDigest(
      digest({
        severity: "error",
        counts: {
          hostIssueCount: 1,
          divergencePluginCount: 0,
          recentFailureCount: 0,
        },
        headline: "1 host issue",
        hostIssues: [
          { kind: "missing-factory", pluginId: "com.x", message: "no" },
        ],
      }),
      { resolveDisplayName: (id) => (id === "com.x" ? "X Plugin" : undefined) },
    );
    expect(text).toContain("- com.x (X Plugin): missing-factory — no");
  });

  it("omits parens when resolver returns undefined", () => {
    const text = formatPluginRegistryHealthDigest(
      digest({
        severity: "error",
        counts: {
          hostIssueCount: 1,
          divergencePluginCount: 0,
          recentFailureCount: 0,
        },
        headline: "1 host issue",
        hostIssues: [
          { kind: "missing-factory", pluginId: "com.x", message: "" },
        ],
      }),
      { resolveDisplayName: () => undefined },
    );
    expect(text).toContain("- com.x: missing-factory");
    expect(text).not.toContain("(undefined)");
  });

  it("omits parens when resolved name equals id", () => {
    const text = formatPluginRegistryHealthDigest(
      digest({
        severity: "error",
        counts: {
          hostIssueCount: 1,
          divergencePluginCount: 0,
          recentFailureCount: 0,
        },
        headline: "1 host issue",
        hostIssues: [
          { kind: "missing-factory", pluginId: "com.x", message: "" },
        ],
      }),
      { resolveDisplayName: (id) => id },
    );
    expect(text).toContain("- com.x: missing-factory");
    expect(text).not.toContain("(com.x)");
  });
});
