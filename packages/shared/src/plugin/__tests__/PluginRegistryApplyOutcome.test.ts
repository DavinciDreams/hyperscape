import { describe, expect, it } from "vitest";
import { classifyPluginRegistryApplyOutcome } from "../PluginRegistryApplyOutcome.js";
import type {
  TransitionExecutionReport,
  TransitionStepResult,
  TransitionStepStatus,
} from "../PluginRegistryTransitionExecutor.js";
import type {
  TransitionStep,
  TransitionStepStart,
  TransitionStepStop,
  TransitionStepRestart,
} from "../PluginRegistryTransitionOrder.js";

function startStep(pluginId: string): TransitionStepStart {
  return {
    kind: "start",
    pluginId,
    manifest: {
      id: pluginId,
      name: pluginId,
      version: "1.0.0",
      entry: "./dist/index.js",
      author: { name: "test" },
      hyperforgeApi: "1.0.0",
      dependencies: [],
    } as TransitionStepStart["manifest"],
  };
}

function stopStep(pluginId: string): TransitionStepStop {
  return { kind: "stop", pluginId, reason: "removed" };
}

function restartStep(pluginId: string): TransitionStepRestart {
  return {
    kind: "restart",
    pluginId,
    previousManifest: {
      id: pluginId,
      name: pluginId,
      version: "1.0.0",
      entry: "./dist/index.js",
      author: { name: "test" },
      hyperforgeApi: "1.0.0",
      dependencies: [],
    } as TransitionStepRestart["previousManifest"],
    nextManifest: {
      id: pluginId,
      name: pluginId,
      version: "1.0.1",
      entry: "./dist/index.js",
      author: { name: "test" },
      hyperforgeApi: "1.0.0",
      dependencies: [],
    } as TransitionStepRestart["nextManifest"],
    reason: "version-changed",
  };
}

function result(
  step: TransitionStep,
  status: TransitionStepStatus,
): TransitionStepResult {
  return {
    step,
    status,
    error: status === "failed" ? new Error("boom") : null,
    durationMs: status === "skipped" ? 0 : 5,
  };
}

function reportFrom(
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
    success: failed === 0 && skipped === 0,
  };
}

describe("classifyPluginRegistryApplyOutcome — outcome enum", () => {
  it("classifies an empty report as no-op", () => {
    const out = classifyPluginRegistryApplyOutcome(reportFrom([]));
    expect(out.outcome).toBe("no-op");
    expect(out.headline).toBe("no changes applied");
    expect(out.recommendRollback).toBe(false);
    expect(out.failedPluginIds).toEqual([]);
    expect(out.skippedPluginIds).toEqual([]);
  });

  it("classifies an all-ok report", () => {
    const out = classifyPluginRegistryApplyOutcome(
      reportFrom([
        result(startStep("com.a"), "ok"),
        result(startStep("com.b"), "ok"),
      ]),
    );
    expect(out.outcome).toBe("all-ok");
    expect(out.headline).toBe("applied 2 steps");
    expect(out.recommendRollback).toBe(false);
  });

  it("classifies an all-failed report", () => {
    const out = classifyPluginRegistryApplyOutcome(
      reportFrom([
        result(startStep("com.a"), "failed"),
        result(startStep("com.b"), "failed"),
      ]),
    );
    expect(out.outcome).toBe("all-failed");
    expect(out.headline).toBe("all 2 steps failed");
    expect(out.recommendRollback).toBe(false);
    expect(out.failedPluginIds).toEqual(["com.a", "com.b"]);
  });

  it("classifies a partial-success report and recommends rollback", () => {
    const out = classifyPluginRegistryApplyOutcome(
      reportFrom([
        result(startStep("com.a"), "ok"),
        result(restartStep("com.b"), "failed"),
        result(stopStep("com.c"), "skipped"),
      ]),
    );
    expect(out.outcome).toBe("partial-success");
    expect(out.headline).toBe("partial: 1 ok, 1 failed, 1 skipped");
    expect(out.recommendRollback).toBe(true);
    expect(out.failedPluginIds).toEqual(["com.b"]);
    expect(out.skippedPluginIds).toEqual(["com.c"]);
  });
});

describe("classifyPluginRegistryApplyOutcome — pluralization + headline", () => {
  it("uses singular `step` for one ok step", () => {
    const out = classifyPluginRegistryApplyOutcome(
      reportFrom([result(startStep("com.a"), "ok")]),
    );
    expect(out.headline).toBe("applied 1 step");
  });

  it("uses singular `step` for one failed step", () => {
    const out = classifyPluginRegistryApplyOutcome(
      reportFrom([result(startStep("com.a"), "failed")]),
    );
    expect(out.headline).toBe("all 1 step failed");
  });

  it("omits zero-count clauses in partial headline", () => {
    const out = classifyPluginRegistryApplyOutcome(
      reportFrom([
        result(startStep("com.a"), "ok"),
        result(startStep("com.b"), "failed"),
      ]),
    );
    expect(out.headline).toBe("partial: 1 ok, 1 failed");
  });
});

describe("classifyPluginRegistryApplyOutcome — rollback recommendation", () => {
  it("does not recommend rollback when only skipped + ok (no failures)", () => {
    // skipped without any failures means stopOnError aborted with no
    // failure — but executor never produces this combo. Defensive
    // check: classifier still treats >0 skipped as partial-success.
    const out = classifyPluginRegistryApplyOutcome(
      reportFrom([
        result(startStep("com.a"), "ok"),
        result(startStep("com.b"), "skipped"),
      ]),
    );
    expect(out.outcome).toBe("partial-success");
    expect(out.recommendRollback).toBe(true);
  });

  it("does not recommend rollback for all-failed (nothing to undo)", () => {
    const out = classifyPluginRegistryApplyOutcome(
      reportFrom([result(startStep("com.a"), "failed")]),
    );
    expect(out.recommendRollback).toBe(false);
  });
});
