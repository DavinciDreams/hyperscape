import {
  PluginManifestSchema,
  PluginRegistryManifestSchema,
} from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import {
  isPreviewApplySafe,
  previewPluginRegistryApply,
} from "../PluginRegistryApplyPreview.js";

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

describe("previewPluginRegistryApply — happy path", () => {
  it("returns plan, ordered steps, recorded calls, report, view, rollback", async () => {
    const oldR = registry([
      plugin("com.removed", { name: "Removed Plugin" }),
      plugin("com.versioned", { version: "1.0.0", name: "V1" }),
    ]);
    const newR = registry([
      plugin("com.versioned", { version: "2.0.0", name: "V2" }),
      plugin("com.added", { name: "Added Plugin" }),
    ]);
    const running = new Set(["com.removed", "com.versioned"]);

    const preview = await previewPluginRegistryApply(oldR, newR, running);

    expect(preview.plan.toStop.map((s) => s.pluginId)).toEqual(["com.removed"]);
    expect(preview.plan.toRestart.map((s) => s.pluginId)).toEqual([
      "com.versioned",
    ]);
    expect(preview.plan.toStart.map((s) => s.pluginId)).toEqual(["com.added"]);

    expect(preview.orderedSteps).toHaveLength(3);
    expect(preview.orderedSteps.map((s) => `${s.kind}:${s.pluginId}`)).toEqual([
      "stop:com.removed",
      "restart:com.versioned",
      "start:com.added",
    ]);

    expect(preview.recordedCalls.map((c) => c.pluginId)).toEqual([
      "com.removed",
      "com.versioned",
      "com.added",
    ]);

    expect(preview.report.success).toBe(true);
    expect(preview.report.okCount).toBe(3);

    expect(preview.view.summary.headline).toBe("3 ok");
    // Default registryForRowNames=oldRegistry → stop row uses old name.
    const removedRow = preview.view.rows.find(
      (r) => r.pluginId === "com.removed",
    );
    expect(removedRow?.displayName).toBe("Removed Plugin");

    expect(preview.rollback.steps).toHaveLength(3);
    expect(preview.rollback.skipped).toHaveLength(0);

    expect(preview.outcome.outcome).toBe("all-ok");
    expect(preview.outcome.recommendRollback).toBe(false);
    expect(preview.outcome.headline).toBe("applied 3 steps");
  });

  it("isPreviewApplySafe returns true when no failures", async () => {
    const oldR = registry([]);
    const newR = registry([plugin("com.a")]);
    const preview = await previewPluginRegistryApply(oldR, newR, new Set());
    expect(isPreviewApplySafe(preview)).toBe(true);
  });
});

describe("previewPluginRegistryApply — failure modeling", () => {
  it("propagates seededFailures into the report and view badges", async () => {
    const oldR = registry([]);
    const newR = registry([plugin("com.good"), plugin("com.bad")]);
    const preview = await previewPluginRegistryApply(oldR, newR, new Set(), {
      seededFailures: new Map([["com.bad", new Error("entry not found")]]),
    });
    expect(preview.report.success).toBe(false);
    expect(preview.report.failedCount).toBe(1);
    expect(preview.report.okCount).toBe(1);

    const badRow = preview.view.rows.find((r) => r.pluginId === "com.bad");
    expect(badRow?.badge).toBe("failed");
    expect(badRow?.tooltip).toBe("entry not found");

    expect(preview.view.summary.headline).toBe("1 ok, 1 failed");
    expect(isPreviewApplySafe(preview)).toBe(false);

    // Rollback drops the failed step (step-failed) and inverts only the ok one.
    expect(preview.rollback.steps).toHaveLength(1);
    expect(preview.rollback.skipped).toEqual([
      {
        pluginId: "com.bad",
        originalKind: "start",
        reason: "step-failed",
      },
    ]);

    expect(preview.outcome.outcome).toBe("partial-success");
    expect(preview.outcome.recommendRollback).toBe(true);
    expect(preview.outcome.failedPluginIds).toEqual(["com.bad"]);
  });

  it("honors stopOnError by skipping later steps", async () => {
    const oldR = registry([]);
    const newR = registry([plugin("com.a"), plugin("com.b"), plugin("com.c")]);
    const preview = await previewPluginRegistryApply(oldR, newR, new Set(), {
      seededFailures: new Map([["com.a", new Error("nope")]]),
      stopOnError: true,
    });
    expect(preview.report.failedCount).toBe(1);
    expect(preview.report.skippedCount).toBe(2);
    expect(preview.report.okCount).toBe(0);
    expect(preview.outcome.outcome).toBe("all-failed");
    expect(preview.outcome.recommendRollback).toBe(false);
  });
});

describe("previewPluginRegistryApply — empty preview", () => {
  it("emits an empty plan + 'no transitions' headline when nothing changed", async () => {
    const same = registry([plugin("com.unchanged")]);
    const preview = await previewPluginRegistryApply(
      same,
      same,
      new Set(["com.unchanged"]),
    );
    expect(preview.orderedSteps).toHaveLength(0);
    expect(preview.recordedCalls).toHaveLength(0);
    expect(preview.report.success).toBe(true);
    expect(preview.view.summary.headline).toBe("no transitions");
    expect(preview.rollback.steps).toHaveLength(0);
    expect(preview.outcome.outcome).toBe("no-op");
    expect(preview.outcome.headline).toBe("no changes applied");
  });
});

describe("previewPluginRegistryApply — name resolution override", () => {
  it("uses provided registryForRowNames for stop-row display names", async () => {
    const oldR = registry([plugin("com.gone", { name: "Old Name" })]);
    const newR = registry([]);
    const overrideReg = registry([
      plugin("com.gone", { name: "Override Name" }),
    ]);
    const preview = await previewPluginRegistryApply(
      oldR,
      newR,
      new Set(["com.gone"]),
      { registryForRowNames: overrideReg },
    );
    expect(preview.view.rows[0].displayName).toBe("Override Name");
  });
});
