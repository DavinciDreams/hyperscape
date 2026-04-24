import {
  PluginManifestSchema,
  PluginRegistryManifestSchema,
} from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import {
  DryRunTransitionAdapter,
  failedPluginIds,
  summarizeDryRunCalls,
} from "../PluginRegistryDryRunAdapter.js";
import { executePluginRegistryTransition } from "../PluginRegistryTransitionExecutor.js";
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

describe("DryRunTransitionAdapter — recording", () => {
  it("records each step kind with its manifest", async () => {
    const oldR = registry([
      plugin("com.removed"),
      plugin("com.versioned", { version: "1.0.0" }),
    ]);
    const newR = registry([
      plugin("com.versioned", { version: "2.0.0" }),
      plugin("com.added"),
    ]);
    const plan = computePluginRegistryTransitionPlan(
      oldR,
      newR,
      new Set(["com.removed", "com.versioned"]),
    );
    const steps = orderPluginRegistryTransition(plan, oldR, newR);
    const adapter = new DryRunTransitionAdapter();
    const report = await executePluginRegistryTransition(steps, adapter);

    expect(report.success).toBe(true);
    expect(adapter.callCount).toBe(3);
    expect(adapter.recorded.map((c) => `${c.kind}:${c.pluginId}`)).toEqual([
      "stop:com.removed",
      "restart:com.versioned",
      "start:com.added",
    ]);
    // start manifest carries the new manifest.
    const startCall = adapter.recorded.find((c) => c.kind === "start")!;
    expect(startCall.manifest?.id).toBe("com.added");
    // restart records the *next* manifest (post-apply version).
    const restartCall = adapter.recorded.find((c) => c.kind === "restart")!;
    expect(restartCall.manifest?.version).toBe("2.0.0");
    // stop manifest is null.
    const stopCall = adapter.recorded.find((c) => c.kind === "stop")!;
    expect(stopCall.manifest).toBeNull();
  });

  it("captures reason on stop and restart", async () => {
    const oldR = registry([
      plugin("com.disabled-flip"),
      plugin("com.bumped", { version: "1.0.0" }),
    ]);
    const newR = registry(
      [plugin("com.disabled-flip"), plugin("com.bumped", { version: "2.0.0" })],
      { "com.disabled-flip": false } as never,
    );
    // ^ second arg via cast: PluginRegistryManifestSchema accepts
    // enabledByDefault, but `registry()` helper doesn't expose it.
    // Use the schema directly so the type stays clean.
    const newRWithOverride = PluginRegistryManifestSchema.parse({
      plugins: [
        plugin("com.disabled-flip"),
        plugin("com.bumped", { version: "2.0.0" }),
      ],
      enabledByDefault: { "com.disabled-flip": false },
    });
    const plan = computePluginRegistryTransitionPlan(
      oldR,
      newRWithOverride,
      new Set(["com.disabled-flip", "com.bumped"]),
    );
    const steps = orderPluginRegistryTransition(plan, oldR, newRWithOverride);
    const adapter = new DryRunTransitionAdapter();
    await executePluginRegistryTransition(steps, adapter);
    const stop = adapter.recorded.find((c) => c.kind === "stop")!;
    expect(stop.reason).toBe("disabled");
    const restart = adapter.recorded.find((c) => c.kind === "restart")!;
    expect(restart.reason).toBe("version-changed");
    // Suppress unused-var eslint if it surfaces:
    void newR;
  });
});

describe("DryRunTransitionAdapter — seeded failures", () => {
  it("throws on call so the executor records failed", async () => {
    const oldR = registry([]);
    const newR = registry([plugin("com.a"), plugin("com.b")]);
    const plan = computePluginRegistryTransitionPlan(oldR, newR, new Set());
    const steps = orderPluginRegistryTransition(plan, oldR, newR);
    const adapter = new DryRunTransitionAdapter({
      seededFailures: new Map([["com.b", new Error("simulated load fail")]]),
    });
    const report = await executePluginRegistryTransition(steps, adapter);
    expect(report.failedCount).toBe(1);
    expect(report.okCount).toBe(1);
    expect(failedPluginIds(report.results)).toEqual(["com.b"]);
    // Adapter still recorded the call (the failure happens after
    // record).
    expect(adapter.recorded.map((c) => c.pluginId)).toEqual(["com.a", "com.b"]);
  });
});

describe("summarizeDryRunCalls", () => {
  it("counts each kind", () => {
    const adapter = new DryRunTransitionAdapter();
    const oldR = registry([
      plugin("com.removed-a"),
      plugin("com.bumped", { version: "1.0.0" }),
    ]);
    const newR = registry([
      plugin("com.bumped", { version: "2.0.0" }),
      plugin("com.added-a"),
      plugin("com.added-b"),
    ]);
    const plan = computePluginRegistryTransitionPlan(
      oldR,
      newR,
      new Set(["com.removed-a", "com.bumped"]),
    );
    const steps = orderPluginRegistryTransition(plan, oldR, newR);
    return executePluginRegistryTransition(steps, adapter).then(() => {
      expect(summarizeDryRunCalls(adapter.recorded)).toBe(
        "1 stop, 1 restart, 2 start (4 total)",
      );
    });
  });

  it("emits all-zero summary for empty calls", () => {
    expect(summarizeDryRunCalls([])).toBe(
      "0 stop, 0 restart, 0 start (0 total)",
    );
  });
});

describe("failedPluginIds", () => {
  it("returns empty for all-ok report", async () => {
    const oldR = registry([]);
    const newR = registry([plugin("com.a")]);
    const plan = computePluginRegistryTransitionPlan(oldR, newR, new Set());
    const steps = orderPluginRegistryTransition(plan, oldR, newR);
    const report = await executePluginRegistryTransition(
      steps,
      new DryRunTransitionAdapter(),
    );
    expect(failedPluginIds(report.results)).toEqual([]);
  });
});
