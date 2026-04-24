import {
  PluginManifestSchema,
  PluginRegistryManifestSchema,
} from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import { PluginLifecycleJournal } from "../PluginLifecycleJournal.js";
import {
  type TransitionAdapter,
  executePluginRegistryTransition,
} from "../PluginRegistryTransitionExecutor.js";
import { orderPluginRegistryTransition } from "../PluginRegistryTransitionOrder.js";
import { computePluginRegistryTransitionPlan } from "../PluginRegistryTransitionPlan.js";
import { journalTransitionExecutionReport } from "../PluginRegistryTransitionJournal.js";

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

const NOOP_ADAPTER: TransitionAdapter = {
  stop: async () => {},
  restart: async () => {},
  start: async () => {},
};

describe("journalTransitionExecutionReport — phase mapping", () => {
  it("records load + enable for a successful start", async () => {
    const oldR = registry([]);
    const newR = registry([plugin("com.a")]);
    const plan = computePluginRegistryTransitionPlan(oldR, newR, new Set());
    const steps = orderPluginRegistryTransition(plan, oldR, newR);
    const report = await executePluginRegistryTransition(steps, NOOP_ADAPTER);
    const journal = new PluginLifecycleJournal();
    const recorded = journalTransitionExecutionReport(report, journal, 1000);
    expect(recorded).toBe(2);
    expect(journal.all().map((e) => `${e.phase}:${e.outcome}`)).toEqual([
      "load:success",
      "enable:success",
    ]);
  });

  it("records disable + load + enable for a successful restart", async () => {
    const oldR = registry([plugin("com.a", { version: "1.0.0" })]);
    const newR = registry([plugin("com.a", { version: "2.0.0" })]);
    const plan = computePluginRegistryTransitionPlan(
      oldR,
      newR,
      new Set(["com.a"]),
    );
    const steps = orderPluginRegistryTransition(plan, oldR, newR);
    const report = await executePluginRegistryTransition(steps, NOOP_ADAPTER);
    const journal = new PluginLifecycleJournal();
    journalTransitionExecutionReport(report, journal, 5000);
    expect(journal.all().map((e) => e.phase)).toEqual([
      "disable",
      "load",
      "enable",
    ]);
  });

  it("records disable for a successful stop", async () => {
    const oldR = registry([plugin("com.a")]);
    const newR = registry([]);
    const plan = computePluginRegistryTransitionPlan(
      oldR,
      newR,
      new Set(["com.a"]),
    );
    const steps = orderPluginRegistryTransition(plan, oldR, newR);
    const report = await executePluginRegistryTransition(steps, NOOP_ADAPTER);
    const journal = new PluginLifecycleJournal();
    journalTransitionExecutionReport(report, journal, 0);
    expect(journal.all()).toHaveLength(1);
    expect(journal.all()[0].phase).toBe("disable");
    expect(journal.all()[0].outcome).toBe("success");
  });
});

describe("journalTransitionExecutionReport — failure recording", () => {
  it("marks all phases of a failed step as failed with errorMessage", async () => {
    const oldR = registry([]);
    const newR = registry([plugin("com.a")]);
    const plan = computePluginRegistryTransitionPlan(oldR, newR, new Set());
    const steps = orderPluginRegistryTransition(plan, oldR, newR);
    const adapter: TransitionAdapter = {
      ...NOOP_ADAPTER,
      start: async () => {
        throw new Error("boom");
      },
    };
    const report = await executePluginRegistryTransition(steps, adapter);
    const journal = new PluginLifecycleJournal();
    journalTransitionExecutionReport(report, journal, 0);
    const events = journal.all();
    expect(events).toHaveLength(2);
    expect(events.every((e) => e.outcome === "failed")).toBe(true);
    expect(events.every((e) => e.errorMessage === "boom")).toBe(true);
  });
});

describe("journalTransitionExecutionReport — skipped suppression", () => {
  it("does NOT record skipped steps (stopOnError aborts)", async () => {
    const oldR = registry([plugin("com.a"), plugin("com.b")]);
    const newR = registry([]);
    const plan = computePluginRegistryTransitionPlan(
      oldR,
      newR,
      new Set(["com.a", "com.b"]),
    );
    const steps = orderPluginRegistryTransition(plan, oldR, newR);
    const adapter: TransitionAdapter = {
      ...NOOP_ADAPTER,
      stop: async (s) => {
        // First emitted stop fails (reverse-OLD: com.b first).
        if (s.pluginId === "com.b") throw new Error("nope");
      },
    };
    const report = await executePluginRegistryTransition(steps, adapter, {
      stopOnError: true,
    });
    expect(report.skippedCount).toBe(1);
    const journal = new PluginLifecycleJournal();
    const recorded = journalTransitionExecutionReport(report, journal, 0);
    // 1 failed step (recorded as 1 disable failed) + skip dropped
    expect(recorded).toBe(1);
    expect(journal.all()).toHaveLength(1);
    expect(journal.all()[0].pluginId).toBe("com.b");
    expect(journal.all()[0].outcome).toBe("failed");
  });
});

describe("journalTransitionExecutionReport — timestamp ordering", () => {
  it("spaces per-phase timestamps by 1 ms in intent order", async () => {
    const oldR = registry([plugin("com.a", { version: "1.0.0" })]);
    const newR = registry([plugin("com.a", { version: "2.0.0" })]);
    const plan = computePluginRegistryTransitionPlan(
      oldR,
      newR,
      new Set(["com.a"]),
    );
    const steps = orderPluginRegistryTransition(plan, oldR, newR);
    const report = await executePluginRegistryTransition(steps, NOOP_ADAPTER);
    const journal = new PluginLifecycleJournal();
    journalTransitionExecutionReport(report, journal, 1_000);
    const events = journal.all();
    expect(events.map((e) => e.at)).toEqual([1_000, 1_001, 1_002]);
  });
});

describe("journalTransitionExecutionReport — empty report", () => {
  it("records nothing for an empty report", async () => {
    const journal = new PluginLifecycleJournal();
    const report = await executePluginRegistryTransition([], NOOP_ADAPTER);
    const recorded = journalTransitionExecutionReport(report, journal, 0);
    expect(recorded).toBe(0);
    expect(journal.size).toBe(0);
  });
});
