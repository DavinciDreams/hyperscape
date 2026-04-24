import {
  PluginManifestSchema,
  PluginRegistryManifestSchema,
} from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import { computePluginRegistryTransitionPlan } from "../PluginRegistryTransitionPlan.js";
import { orderPluginRegistryTransition } from "../PluginRegistryTransitionOrder.js";
import {
  type TransitionAdapter,
  type TransitionStepResult,
  executePluginRegistryTransition,
  formatTransitionExecutionReport,
  manifestForStep,
} from "../PluginRegistryTransitionExecutor.js";

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

interface RecordingAdapter extends TransitionAdapter {
  readonly calls: string[];
}

function makeAdapter(
  failOn: ReadonlySet<string> = new Set(),
): RecordingAdapter {
  const calls: string[] = [];
  return {
    calls,
    async stop(step) {
      calls.push(`stop:${step.pluginId}`);
      if (failOn.has(`stop:${step.pluginId}`)) {
        throw new Error(`stop ${step.pluginId} blew up`);
      }
    },
    async restart(step) {
      calls.push(`restart:${step.pluginId}`);
      if (failOn.has(`restart:${step.pluginId}`)) {
        throw new Error(`restart ${step.pluginId} blew up`);
      }
    },
    async start(step) {
      calls.push(`start:${step.pluginId}`);
      if (failOn.has(`start:${step.pluginId}`)) {
        throw new Error(`start ${step.pluginId} blew up`);
      }
    },
  };
}

describe("executePluginRegistryTransition — happy path", () => {
  it("dispatches each step to the adapter in order", async () => {
    const oldR = registry([plugin("com.removed")]);
    const newR = registry([plugin("com.added")]);
    const plan = computePluginRegistryTransitionPlan(
      oldR,
      newR,
      new Set(["com.removed"]),
    );
    const steps = orderPluginRegistryTransition(plan, oldR, newR);
    const adapter = makeAdapter();
    const report = await executePluginRegistryTransition(steps, adapter);
    expect(adapter.calls).toEqual(["stop:com.removed", "start:com.added"]);
    expect(report.success).toBe(true);
    expect(report.okCount).toBe(2);
    expect(report.failedCount).toBe(0);
    expect(report.skippedCount).toBe(0);
  });

  it("returns empty report for empty steps", async () => {
    const adapter = makeAdapter();
    const report = await executePluginRegistryTransition([], adapter);
    expect(report.results).toEqual([]);
    expect(report.success).toBe(true);
    expect(adapter.calls).toEqual([]);
  });

  it("records durationMs from injected clock", async () => {
    const oldR = registry([]);
    const newR = registry([plugin("com.a")]);
    const plan = computePluginRegistryTransitionPlan(oldR, newR, new Set());
    const steps = orderPluginRegistryTransition(plan, oldR, newR);
    let t = 1000;
    const tickClock = () => {
      const v = t;
      t += 17;
      return v;
    };
    const report = await executePluginRegistryTransition(steps, makeAdapter(), {
      now: tickClock,
    });
    expect(report.results[0].durationMs).toBe(17);
  });
});

describe("executePluginRegistryTransition — best-effort default", () => {
  it("continues past a failure and records each result", async () => {
    const oldR = registry([plugin("com.removed-a"), plugin("com.removed-b")]);
    const newR = registry([]);
    const plan = computePluginRegistryTransitionPlan(
      oldR,
      newR,
      new Set(["com.removed-a", "com.removed-b"]),
    );
    const steps = orderPluginRegistryTransition(plan, oldR, newR);
    const adapter = makeAdapter(new Set(["stop:com.removed-a"]));
    const report = await executePluginRegistryTransition(steps, adapter);
    // Both adapter calls happened (best-effort). Stops emit in
    // reverse OLD load order — siblings sort id-asc → reverse is
    // [removed-b, removed-a].
    expect(adapter.calls).toEqual(["stop:com.removed-b", "stop:com.removed-a"]);
    expect(report.success).toBe(false);
    expect(report.okCount).toBe(1);
    expect(report.failedCount).toBe(1);
    expect(report.skippedCount).toBe(0);
    const failed = report.results.find((r) => r.status === "failed")!;
    expect(failed.step.pluginId).toBe("com.removed-a");
    expect(failed.error?.message).toContain("blew up");
  });
});

describe("executePluginRegistryTransition — stopOnError", () => {
  it("aborts after the first failure and marks remaining steps skipped", async () => {
    const oldR = registry([plugin("com.removed-a"), plugin("com.removed-b")]);
    const newR = registry([plugin("com.added")]);
    const plan = computePluginRegistryTransitionPlan(
      oldR,
      newR,
      new Set(["com.removed-a", "com.removed-b"]),
    );
    const steps = orderPluginRegistryTransition(plan, oldR, newR);
    // Stops sort reverse-OLD load order → [removed-b, removed-a].
    // Fail on the FIRST emitted stop so the rest skip.
    const adapter = makeAdapter(new Set(["stop:com.removed-b"]));
    const report = await executePluginRegistryTransition(steps, adapter, {
      stopOnError: true,
    });
    // Only the first stop dispatched.
    expect(adapter.calls).toEqual(["stop:com.removed-b"]);
    expect(report.failedCount).toBe(1);
    expect(report.skippedCount).toBe(2);
    expect(report.okCount).toBe(0);
    const skipped = report.results.filter(
      (r): r is TransitionStepResult => r.status === "skipped",
    );
    expect(skipped.map((r) => r.step.pluginId)).toEqual([
      "com.removed-a",
      "com.added",
    ]);
    expect(skipped.every((r) => r.error === null)).toBe(true);
    expect(skipped.every((r) => r.durationMs === 0)).toBe(true);
  });
});

describe("executePluginRegistryTransition — non-Error throws", () => {
  it("wraps string throws in Error so error.message is always a string", async () => {
    const oldR = registry([plugin("com.a")]);
    const newR = registry([]);
    const plan = computePluginRegistryTransitionPlan(
      oldR,
      newR,
      new Set(["com.a"]),
    );
    const steps = orderPluginRegistryTransition(plan, oldR, newR);
    const adapter: TransitionAdapter = {
      stop: async () => {
        throw "nope"; // eslint-disable-line @typescript-eslint/no-throw-literal
      },
      restart: async () => {},
      start: async () => {},
    };
    const report = await executePluginRegistryTransition(steps, adapter);
    expect(report.results[0].status).toBe("failed");
    expect(report.results[0].error).toBeInstanceOf(Error);
    expect(report.results[0].error?.message).toBe("nope");
  });
});

describe("formatTransitionExecutionReport", () => {
  it("renders ok/failed/skipped lines with status glyphs", async () => {
    const oldR = registry([plugin("com.a"), plugin("com.b")]);
    const newR = registry([]);
    const plan = computePluginRegistryTransitionPlan(
      oldR,
      newR,
      new Set(["com.a", "com.b"]),
    );
    const steps = orderPluginRegistryTransition(plan, oldR, newR);
    let t = 0;
    const tick = () => {
      const v = t;
      t += 5;
      return v;
    };
    const report = await executePluginRegistryTransition(
      steps,
      makeAdapter(new Set(["stop:com.b"])),
      { now: tick, stopOnError: false },
    );
    const lines = formatTransitionExecutionReport(report);
    expect(lines).toHaveLength(2);
    expect(lines.some((l) => /^\[ok\] stop com\..* \(\d+ms\)$/.test(l))).toBe(
      true,
    );
    expect(lines.some((l) => l.startsWith("[FAIL]"))).toBe(true);
  });

  it("renders skipped status for stopOnError aborts", async () => {
    const oldR = registry([plugin("com.a"), plugin("com.b")]);
    const newR = registry([]);
    const plan = computePluginRegistryTransitionPlan(
      oldR,
      newR,
      new Set(["com.a", "com.b"]),
    );
    const steps = orderPluginRegistryTransition(plan, oldR, newR);
    const adapter = makeAdapter(new Set(["stop:com.b"]));
    const report = await executePluginRegistryTransition(steps, adapter, {
      stopOnError: true,
    });
    const lines = formatTransitionExecutionReport(report);
    expect(lines.some((l) => l.includes("[skip]"))).toBe(true);
    expect(lines.some((l) => l.includes("(skipped after prior failure)"))).toBe(
      true,
    );
  });
});

describe("manifestForStep", () => {
  it("returns the manifest for start", async () => {
    const oldR = registry([]);
    const newR = registry([plugin("com.a", { version: "3.0.0" })]);
    const plan = computePluginRegistryTransitionPlan(oldR, newR, new Set());
    const steps = orderPluginRegistryTransition(plan, oldR, newR);
    expect(manifestForStep(steps[0])?.version).toBe("3.0.0");
  });

  it("returns nextManifest for restart", async () => {
    const oldR = registry([plugin("com.a", { version: "1.0.0" })]);
    const newR = registry([plugin("com.a", { version: "2.0.0" })]);
    const plan = computePluginRegistryTransitionPlan(
      oldR,
      newR,
      new Set(["com.a"]),
    );
    const steps = orderPluginRegistryTransition(plan, oldR, newR);
    expect(manifestForStep(steps[0])?.version).toBe("2.0.0");
  });

  it("returns null for stop", async () => {
    const oldR = registry([plugin("com.a")]);
    const newR = registry([]);
    const plan = computePluginRegistryTransitionPlan(
      oldR,
      newR,
      new Set(["com.a"]),
    );
    const steps = orderPluginRegistryTransition(plan, oldR, newR);
    expect(manifestForStep(steps[0])).toBeNull();
  });
});
