import {
  PluginManifestSchema,
  PluginRegistryManifestSchema,
} from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import { DryRunTransitionAdapter } from "../PluginRegistryDryRunAdapter.js";
import { executePluginRegistryTransition } from "../PluginRegistryTransitionExecutor.js";
import { orderPluginRegistryTransition } from "../PluginRegistryTransitionOrder.js";
import { computePluginRegistryTransitionPlan } from "../PluginRegistryTransitionPlan.js";
import {
  buildTransitionReportView,
  type TransitionReportView,
} from "../PluginRegistryTransitionReportView.js";
import type {
  TransitionExecutionReport,
  TransitionStepResult,
} from "../PluginRegistryTransitionExecutor.js";
import type {
  TransitionStepStart,
  TransitionStepStop,
} from "../PluginRegistryTransitionOrder.js";

function plugin(id: string, overrides: Record<string, unknown> = {}) {
  return PluginManifestSchema.parse({
    id,
    name: id,
    version: "1.0.0",
    entry: "./dist/index.js",
    author: { name: "Author" },
    hyperforgeApi: "1.0.0",
    ...overrides,
  });
}

function registry(plugins: ReturnType<typeof plugin>[]) {
  return PluginRegistryManifestSchema.parse({ plugins });
}

function startStep(pluginId: string, name?: string): TransitionStepStart {
  return {
    kind: "start",
    pluginId,
    manifest: plugin(pluginId, name ? { name } : {}),
  };
}

function stopStep(pluginId: string): TransitionStepStop {
  return {
    kind: "stop",
    pluginId,
    reason: "removed",
  };
}

function okResult(
  step: TransitionStepStart | TransitionStepStop,
  durationMs: number,
): TransitionStepResult {
  return { step, status: "ok", error: null, durationMs };
}

function failedResult(
  step: TransitionStepStart | TransitionStepStop,
  message: string,
  durationMs: number,
): TransitionStepResult {
  return {
    step,
    status: "failed",
    error: new Error(message),
    durationMs,
  };
}

function skippedResult(
  step: TransitionStepStart | TransitionStepStop,
): TransitionStepResult {
  return { step, status: "skipped", error: null, durationMs: 0 };
}

function reportFromResults(
  results: TransitionStepResult[],
): TransitionExecutionReport {
  let ok = 0;
  let failed = 0;
  let skipped = 0;
  for (const r of results) {
    if (r.status === "ok") ok++;
    else if (r.status === "failed") failed++;
    else skipped++;
  }
  return {
    results,
    okCount: ok,
    failedCount: failed,
    skippedCount: skipped,
    success: failed === 0,
  };
}

describe("buildTransitionReportView — display name resolution", () => {
  it("prefers step.manifest.name on start steps", () => {
    const report = reportFromResults([
      okResult(startStep("com.fancy", "Fancy Plugin"), 5),
    ]);
    const view = buildTransitionReportView(report);
    expect(view.rows[0].displayName).toBe("Fancy Plugin");
  });

  it("prefers nextManifest.name on restart steps", () => {
    const result: TransitionStepResult = {
      step: {
        kind: "restart",
        pluginId: "com.versioned",
        previousManifest: plugin("com.versioned", { name: "Old Name" }),
        nextManifest: plugin("com.versioned", { name: "New Name" }),
        reason: "version-changed",
      },
      status: "ok",
      error: null,
      durationMs: 8,
    };
    const view = buildTransitionReportView(reportFromResults([result]));
    expect(view.rows[0].displayName).toBe("New Name");
  });

  it("falls back to registry lookup for stop steps", () => {
    const reg = registry([plugin("com.gone", { name: "Was Here" })]);
    const view = buildTransitionReportView(
      reportFromResults([okResult(stopStep("com.gone"), 1)]),
      reg,
    );
    expect(view.rows[0].displayName).toBe("Was Here");
  });

  it("falls back to pluginId when no manifest and no registry entry", () => {
    const view = buildTransitionReportView(
      reportFromResults([okResult(stopStep("com.unknown"), 1)]),
    );
    expect(view.rows[0].displayName).toBe("com.unknown");
  });
});

describe("buildTransitionReportView — badge mapping", () => {
  it("maps ok/failed/skipped to matching badge", () => {
    const start = startStep("com.a");
    const view = buildTransitionReportView(
      reportFromResults([
        okResult(start, 1),
        failedResult(startStep("com.b"), "boom", 2),
        skippedResult(startStep("com.c")),
      ]),
    );
    expect(view.rows.map((r) => r.badge)).toEqual(["ok", "failed", "skipped"]);
  });
});

describe("buildTransitionReportView — duration formatting", () => {
  it("formats sub-second durations as 'Xms' (rounded)", () => {
    const view = buildTransitionReportView(
      reportFromResults([
        okResult(startStep("com.a"), 0),
        okResult(startStep("com.b"), 17),
        okResult(startStep("com.c"), 999.4),
      ]),
    );
    expect(view.rows.map((r) => r.durationText)).toEqual([
      "0ms",
      "17ms",
      "999ms",
    ]);
  });

  it("formats 1000ms..9999ms as 'X.Xs'", () => {
    const view = buildTransitionReportView(
      reportFromResults([
        okResult(startStep("com.a"), 1000),
        okResult(startStep("com.b"), 1234),
        okResult(startStep("com.c"), 9999),
      ]),
    );
    expect(view.rows.map((r) => r.durationText)).toEqual([
      "1.0s",
      "1.2s",
      "10.0s",
    ]);
  });

  it("formats >=10000ms as 'Xs' (rounded seconds)", () => {
    const view = buildTransitionReportView(
      reportFromResults([
        okResult(startStep("com.a"), 10_000),
        okResult(startStep("com.b"), 12_499),
        okResult(startStep("com.c"), 12_500),
      ]),
    );
    expect(view.rows.map((r) => r.durationText)).toEqual(["10s", "12s", "13s"]);
  });

  it("returns '0ms' for negative or non-finite durations", () => {
    const view = buildTransitionReportView(
      reportFromResults([
        okResult(startStep("com.a"), -1),
        okResult(startStep("com.b"), Number.NaN),
        okResult(startStep("com.c"), Number.POSITIVE_INFINITY),
      ]),
    );
    expect(view.rows.map((r) => r.durationText)).toEqual(["0ms", "0ms", "0ms"]);
  });
});

describe("buildTransitionReportView — tooltip", () => {
  it("populates tooltip with error message for failed rows", () => {
    const view = buildTransitionReportView(
      reportFromResults([failedResult(startStep("com.bad"), "load fail", 3)]),
    );
    expect(view.rows[0].tooltip).toBe("load fail");
  });

  it("returns empty tooltip for ok and skipped rows", () => {
    const view = buildTransitionReportView(
      reportFromResults([
        okResult(startStep("com.a"), 1),
        skippedResult(startStep("com.b")),
      ]),
    );
    expect(view.rows[0].tooltip).toBe("");
    expect(view.rows[1].tooltip).toBe("");
  });
});

describe("buildTransitionReportView — summary headline", () => {
  it("composes 'N ok, N failed, N skipped' joined by commas", () => {
    const view = buildTransitionReportView(
      reportFromResults([
        okResult(startStep("com.a"), 1),
        okResult(startStep("com.b"), 1),
        failedResult(startStep("com.c"), "x", 1),
        skippedResult(startStep("com.d")),
      ]),
    );
    expect(view.summary.headline).toBe("2 ok, 1 failed, 1 skipped");
  });

  it("omits zero counts from headline", () => {
    const view = buildTransitionReportView(
      reportFromResults([
        okResult(startStep("com.a"), 1),
        okResult(startStep("com.b"), 1),
      ]),
    );
    expect(view.summary.headline).toBe("2 ok");
  });

  it("emits 'no transitions' for empty report", () => {
    const view = buildTransitionReportView(reportFromResults([]));
    expect(view.summary.headline).toBe("no transitions");
    expect(view.summary.total).toBe(0);
  });

  it("propagates exact counts from the report", () => {
    const view = buildTransitionReportView(
      reportFromResults([
        okResult(startStep("com.a"), 1),
        failedResult(startStep("com.b"), "x", 1),
        failedResult(startStep("com.c"), "y", 1),
        skippedResult(startStep("com.d")),
      ]),
    );
    expect(view.summary.total).toBe(4);
    expect(view.summary.okCount).toBe(1);
    expect(view.summary.failedCount).toBe(2);
    expect(view.summary.skippedCount).toBe(1);
  });
});

describe("buildTransitionReportView — end-to-end with executor", () => {
  it("renders the rows for a full diff→order→execute pipeline", async () => {
    const oldR = registry([
      plugin("com.removed", { name: "Removed Plugin" }),
      plugin("com.versioned", { version: "1.0.0", name: "Versioned" }),
    ]);
    const newR = registry([
      plugin("com.versioned", { version: "2.0.0", name: "Versioned v2" }),
      plugin("com.added", { name: "Added Plugin" }),
    ]);
    const plan = computePluginRegistryTransitionPlan(
      oldR,
      newR,
      new Set(["com.removed", "com.versioned"]),
    );
    const steps = orderPluginRegistryTransition(plan, oldR, newR);
    const adapter = new DryRunTransitionAdapter({
      seededFailures: new Map([["com.added", new Error("entry not found")]]),
    });
    const report = await executePluginRegistryTransition(steps, adapter);
    const view: TransitionReportView = buildTransitionReportView(report, oldR);

    expect(view.rows).toHaveLength(3);
    const byPluginId = new Map(view.rows.map((r) => [r.pluginId, r]));
    expect(byPluginId.get("com.removed")?.displayName).toBe("Removed Plugin");
    expect(byPluginId.get("com.removed")?.stepKind).toBe("stop");
    expect(byPluginId.get("com.versioned")?.displayName).toBe("Versioned v2");
    expect(byPluginId.get("com.versioned")?.stepKind).toBe("restart");
    expect(byPluginId.get("com.added")?.displayName).toBe("Added Plugin");
    expect(byPluginId.get("com.added")?.badge).toBe("failed");
    expect(byPluginId.get("com.added")?.tooltip).toBe("entry not found");

    expect(view.summary.headline).toBe("2 ok, 1 failed");
    expect(view.summary.total).toBe(3);
  });
});
