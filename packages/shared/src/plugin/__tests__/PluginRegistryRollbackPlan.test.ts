import {
  PluginManifestSchema,
  PluginRegistryManifestSchema,
} from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import { DryRunTransitionAdapter } from "../PluginRegistryDryRunAdapter.js";
import {
  computePluginRegistryRollbackPlan,
  isRollbackPlanEmpty,
  rollbackStepCount,
} from "../PluginRegistryRollbackPlan.js";
import { executePluginRegistryTransition } from "../PluginRegistryTransitionExecutor.js";
import type { TransitionStepResult } from "../PluginRegistryTransitionExecutor.js";
import type { TransitionStep } from "../PluginRegistryTransitionOrder.js";
import { orderPluginRegistryTransition } from "../PluginRegistryTransitionOrder.js";
import { computePluginRegistryTransitionPlan } from "../PluginRegistryTransitionPlan.js";

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

function ok(step: TransitionStep): TransitionStepResult {
  return { step, status: "ok", error: null, durationMs: 1 };
}

function failed(step: TransitionStep): TransitionStepResult {
  return { step, status: "failed", error: new Error("x"), durationMs: 1 };
}

function skipped(step: TransitionStep): TransitionStepResult {
  return { step, status: "skipped", error: null, durationMs: 0 };
}

describe("computePluginRegistryRollbackPlan — basic inverse", () => {
  it("inverts a start into a stop with reason 'removed'", () => {
    const oldR = registry([]);
    const newR = registry([plugin("com.added")]);
    const startStep: TransitionStep = {
      kind: "start",
      pluginId: "com.added",
      manifest: plugin("com.added"),
    };
    const plan = computePluginRegistryRollbackPlan([ok(startStep)], oldR, newR);
    expect(plan.steps).toHaveLength(1);
    const inverse = plan.steps[0];
    expect(inverse.kind).toBe("stop");
    expect(inverse.pluginId).toBe("com.added");
    if (inverse.kind === "stop") {
      expect(inverse.reason).toBe("removed");
    }
  });

  it("inverts a stop into a start with the old manifest", () => {
    const oldR = registry([plugin("com.gone", { name: "Was Here" })]);
    const newR = registry([]);
    const stopStep: TransitionStep = {
      kind: "stop",
      pluginId: "com.gone",
      reason: "removed",
    };
    const plan = computePluginRegistryRollbackPlan([ok(stopStep)], oldR, newR);
    expect(plan.steps).toHaveLength(1);
    const inverse = plan.steps[0];
    expect(inverse.kind).toBe("start");
    if (inverse.kind === "start") {
      expect(inverse.manifest.id).toBe("com.gone");
      expect(inverse.manifest.name).toBe("Was Here");
    }
  });

  it("inverts a restart by swapping previous and next manifests", () => {
    const prev = plugin("com.versioned", { version: "1.0.0" });
    const next = plugin("com.versioned", { version: "2.0.0" });
    const oldR = registry([prev]);
    const newR = registry([next]);
    const restartStep: TransitionStep = {
      kind: "restart",
      pluginId: "com.versioned",
      previousManifest: prev,
      nextManifest: next,
      reason: "version-changed",
    };
    const plan = computePluginRegistryRollbackPlan(
      [ok(restartStep)],
      oldR,
      newR,
    );
    expect(plan.steps).toHaveLength(1);
    const inverse = plan.steps[0];
    expect(inverse.kind).toBe("restart");
    if (inverse.kind === "restart") {
      expect(inverse.previousManifest.version).toBe("2.0.0");
      expect(inverse.nextManifest.version).toBe("1.0.0");
      expect(inverse.reason).toBe("version-changed");
    }
  });

  it("classifies metadata-only restart inverse as 'manifest-changed'", () => {
    const prev = plugin("com.tweaked", { version: "1.0.0", name: "Old" });
    const next = plugin("com.tweaked", { version: "1.0.0", name: "New" });
    const oldR = registry([prev]);
    const newR = registry([next]);
    const restartStep: TransitionStep = {
      kind: "restart",
      pluginId: "com.tweaked",
      previousManifest: prev,
      nextManifest: next,
      reason: "manifest-changed",
    };
    const plan = computePluginRegistryRollbackPlan(
      [ok(restartStep)],
      oldR,
      newR,
    );
    const inverse = plan.steps[0];
    if (inverse.kind === "restart") {
      expect(inverse.reason).toBe("manifest-changed");
    } else {
      throw new Error("expected restart inverse");
    }
  });
});

describe("computePluginRegistryRollbackPlan — skip semantics", () => {
  it("skips failed steps and records reason 'step-failed'", () => {
    const oldR = registry([]);
    const newR = registry([plugin("com.bad")]);
    const startStep: TransitionStep = {
      kind: "start",
      pluginId: "com.bad",
      manifest: plugin("com.bad"),
    };
    const plan = computePluginRegistryRollbackPlan(
      [failed(startStep)],
      oldR,
      newR,
    );
    expect(plan.steps).toHaveLength(0);
    expect(plan.skipped).toEqual([
      { pluginId: "com.bad", originalKind: "start", reason: "step-failed" },
    ]);
  });

  it("skips skipped steps and records reason 'step-skipped'", () => {
    const oldR = registry([]);
    const newR = registry([plugin("com.idle")]);
    const startStep: TransitionStep = {
      kind: "start",
      pluginId: "com.idle",
      manifest: plugin("com.idle"),
    };
    const plan = computePluginRegistryRollbackPlan(
      [skipped(startStep)],
      oldR,
      newR,
    );
    expect(plan.steps).toHaveLength(0);
    expect(plan.skipped[0]).toEqual({
      pluginId: "com.idle",
      originalKind: "start",
      reason: "step-skipped",
    });
  });

  it("skips stop steps whose pluginId is missing from oldRegistry", () => {
    const oldR = registry([]);
    const newR = registry([]);
    const stopStep: TransitionStep = {
      kind: "stop",
      pluginId: "com.ghost",
      reason: "removed",
    };
    const plan = computePluginRegistryRollbackPlan([ok(stopStep)], oldR, newR);
    expect(plan.steps).toHaveLength(0);
    expect(plan.skipped).toEqual([
      {
        pluginId: "com.ghost",
        originalKind: "stop",
        reason: "old-manifest-missing",
      },
    ]);
  });
});

describe("computePluginRegistryRollbackPlan — ordering", () => {
  it("orders inverse stops in reverse-NEW dependency order", () => {
    // newRegistry: com.lib (no deps), com.app (depends on com.lib)
    // Original transition started both. Inverse stops should
    // tear down com.app before com.lib.
    const newR = registry([
      plugin("com.lib"),
      plugin("com.app", {
        dependencies: [{ id: "com.lib", versionRange: "^1.0.0" }],
      }),
    ]);
    const oldR = registry([]);
    const startLib: TransitionStep = {
      kind: "start",
      pluginId: "com.lib",
      manifest: plugin("com.lib"),
    };
    const startApp: TransitionStep = {
      kind: "start",
      pluginId: "com.app",
      manifest: plugin("com.app", {
        dependencies: [{ id: "com.lib", versionRange: "^1.0.0" }],
      }),
    };
    const plan = computePluginRegistryRollbackPlan(
      [ok(startLib), ok(startApp)],
      oldR,
      newR,
    );
    expect(plan.steps.map((s) => s.pluginId)).toEqual(["com.app", "com.lib"]);
  });

  it("orders inverse starts in OLD dependency order", () => {
    // oldRegistry: com.lib (no deps), com.app (depends on com.lib)
    // Original transition stopped both. Inverse starts should
    // bring com.lib up before com.app.
    const oldR = registry([
      plugin("com.lib"),
      plugin("com.app", {
        dependencies: [{ id: "com.lib", versionRange: "^1.0.0" }],
      }),
    ]);
    const newR = registry([]);
    const stopLib: TransitionStep = {
      kind: "stop",
      pluginId: "com.lib",
      reason: "removed",
    };
    const stopApp: TransitionStep = {
      kind: "stop",
      pluginId: "com.app",
      reason: "removed",
    };
    const plan = computePluginRegistryRollbackPlan(
      [ok(stopLib), ok(stopApp)],
      oldR,
      newR,
    );
    expect(plan.steps.map((s) => s.pluginId)).toEqual(["com.lib", "com.app"]);
  });
});

describe("computePluginRegistryRollbackPlan — helpers", () => {
  it("rollbackStepCount returns the number of inverse steps", () => {
    const oldR = registry([plugin("com.a")]);
    const newR = registry([]);
    const plan = computePluginRegistryRollbackPlan(
      [ok({ kind: "stop", pluginId: "com.a", reason: "removed" })],
      oldR,
      newR,
    );
    expect(rollbackStepCount(plan)).toBe(1);
  });

  it("isRollbackPlanEmpty returns true when nothing is undoable", () => {
    const oldR = registry([]);
    const newR = registry([]);
    const empty = computePluginRegistryRollbackPlan([], oldR, newR);
    expect(isRollbackPlanEmpty(empty)).toBe(true);

    const allFailed = computePluginRegistryRollbackPlan(
      [
        failed({
          kind: "start",
          pluginId: "com.bad",
          manifest: plugin("com.bad"),
        }),
      ],
      oldR,
      registry([plugin("com.bad")]),
    );
    expect(isRollbackPlanEmpty(allFailed)).toBe(true);
  });
});

describe("computePluginRegistryRollbackPlan — end-to-end roundtrip", () => {
  it("rolling back a successful transition produces inverse-equivalent steps", async () => {
    const oldR = registry([
      plugin("com.removed"),
      plugin("com.versioned", { version: "1.0.0" }),
    ]);
    const newR = registry([
      plugin("com.versioned", { version: "2.0.0" }),
      plugin("com.added"),
    ]);
    const fwdPlan = computePluginRegistryTransitionPlan(
      oldR,
      newR,
      new Set(["com.removed", "com.versioned"]),
    );
    const fwdSteps = orderPluginRegistryTransition(fwdPlan, oldR, newR);
    const adapter = new DryRunTransitionAdapter();
    const report = await executePluginRegistryTransition(fwdSteps, adapter);
    expect(report.success).toBe(true);

    const rollback = computePluginRegistryRollbackPlan(
      report.results,
      oldR,
      newR,
    );

    // Three original steps, all ok → three inverse steps.
    expect(rollback.steps).toHaveLength(3);
    expect(rollback.skipped).toHaveLength(0);

    const byKind = new Map(
      rollback.steps.map((s) => [s.pluginId, s.kind] as const),
    );
    expect(byKind.get("com.added")).toBe("stop");
    expect(byKind.get("com.versioned")).toBe("restart");
    expect(byKind.get("com.removed")).toBe("start");
  });

  it("partial-failure transition produces partial rollback with skip records", async () => {
    const oldR = registry([]);
    const newR = registry([plugin("com.a"), plugin("com.b"), plugin("com.c")]);
    const fwdPlan = computePluginRegistryTransitionPlan(oldR, newR, new Set());
    const fwdSteps = orderPluginRegistryTransition(fwdPlan, oldR, newR);
    const adapter = new DryRunTransitionAdapter({
      seededFailures: new Map([["com.b", new Error("entry missing")]]),
    });
    const report = await executePluginRegistryTransition(fwdSteps, adapter);

    const rollback = computePluginRegistryRollbackPlan(
      report.results,
      oldR,
      newR,
    );
    // com.a + com.c succeeded → 2 inverse stops; com.b failed → 1 skip.
    expect(rollback.steps).toHaveLength(2);
    expect(rollback.skipped).toEqual([
      {
        pluginId: "com.b",
        originalKind: "start",
        reason: "step-failed",
      },
    ]);
    expect(new Set(rollback.steps.map((s) => s.pluginId))).toEqual(
      new Set(["com.a", "com.c"]),
    );
  });
});
