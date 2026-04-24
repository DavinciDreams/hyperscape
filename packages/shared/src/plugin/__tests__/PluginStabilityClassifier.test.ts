import { describe, expect, it } from "vitest";
import type { PluginLifecycleStats } from "../PluginLifecycleStats.js";
import { classifyPluginStability } from "../PluginStabilityClassifier.js";

function stats(
  parts: Partial<PluginLifecycleStats> = {},
): PluginLifecycleStats {
  return {
    pluginId: "com.x",
    totalEvents: 0,
    successCount: 0,
    failedCount: 0,
    successRate: null,
    lastEventAt: null,
    lastFailureAt: null,
    consecutiveTrailingFailures: 0,
    phases: {
      load: { success: 0, failed: 0 },
      enable: { success: 0, failed: 0 },
      disable: { success: 0, failed: 0 },
    },
    ...parts,
  };
}

describe("classifyPluginStability — unknown", () => {
  it("returns unknown when no events were recorded", () => {
    const badge = classifyPluginStability(stats());
    expect(badge.rating).toBe("unknown");
    expect(badge.reason).toBe("no recorded events");
  });

  it("returns unknown when below minimumEventsForRating", () => {
    const badge = classifyPluginStability(
      stats({ totalEvents: 2, successCount: 2, successRate: 1 }),
    );
    expect(badge.rating).toBe("unknown");
    expect(badge.reason).toBe("only 2 events");
  });
});

describe("classifyPluginStability — broken", () => {
  it("flags broken when trailing failures >= threshold", () => {
    const badge = classifyPluginStability(
      stats({
        totalEvents: 5,
        failedCount: 3,
        successCount: 2,
        successRate: 0.4,
        consecutiveTrailingFailures: 3,
      }),
    );
    expect(badge.rating).toBe("broken");
    expect(badge.reason).toBe("3 consecutive failures");
  });

  it("respects custom brokenAfterTrailingFailures", () => {
    const badge = classifyPluginStability(
      stats({
        totalEvents: 5,
        failedCount: 2,
        successCount: 3,
        successRate: 0.6,
        consecutiveTrailingFailures: 2,
      }),
      { brokenAfterTrailingFailures: 2 },
    );
    expect(badge.rating).toBe("broken");
  });

  it("broken takes precedence over insufficient totalEvents", () => {
    // 3 trailing failures with totalEvents=3 still triggers broken
    // before the minEvents=3 fallback escapes to unknown.
    const badge = classifyPluginStability(
      stats({
        totalEvents: 3,
        failedCount: 3,
        successCount: 0,
        successRate: 0,
        consecutiveTrailingFailures: 3,
      }),
    );
    expect(badge.rating).toBe("broken");
  });
});

describe("classifyPluginStability — flaky", () => {
  it("flags flaky when successRate < flakyBelow and there is a failure", () => {
    const badge = classifyPluginStability(
      stats({
        totalEvents: 10,
        successCount: 7,
        failedCount: 3,
        successRate: 0.7,
        consecutiveTrailingFailures: 0,
      }),
    );
    expect(badge.rating).toBe("flaky");
    expect(badge.reason).toBe("success rate 70%");
  });

  it("does not flag flaky when there are zero failures even if rate < threshold", () => {
    // Hypothetical: rate < threshold with zero failures shouldn't
    // happen in practice, but the guard is explicit.
    const badge = classifyPluginStability(
      stats({
        totalEvents: 5,
        successCount: 5,
        failedCount: 0,
        successRate: 0.5, // pathological caller-supplied rate
        consecutiveTrailingFailures: 0,
      }),
    );
    expect(badge.rating).toBe("stable");
  });
});

describe("classifyPluginStability — stable", () => {
  it("flags stable when successRate >= threshold", () => {
    const badge = classifyPluginStability(
      stats({
        totalEvents: 10,
        successCount: 9,
        failedCount: 1,
        successRate: 0.9,
        consecutiveTrailingFailures: 0,
      }),
    );
    expect(badge.rating).toBe("stable");
    expect(badge.reason).toBe("all-clean");
  });

  it("flags stable when zero failures and totalEvents >= minimum", () => {
    const badge = classifyPluginStability(
      stats({
        totalEvents: 4,
        successCount: 4,
        failedCount: 0,
        successRate: 1,
        consecutiveTrailingFailures: 0,
      }),
    );
    expect(badge.rating).toBe("stable");
  });
});
