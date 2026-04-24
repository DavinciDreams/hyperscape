import {
  PluginManifestSchema,
  PluginRegistryManifestSchema,
} from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import {
  computePluginRegistryTransitionPlan,
  isPluginRegistryTransitionPlanEmpty,
} from "../PluginRegistryTransitionPlan.js";

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

function registry(
  plugins: ReturnType<typeof plugin>[],
  enabledByDefault: Record<string, boolean> = {},
) {
  return PluginRegistryManifestSchema.parse({ plugins, enabledByDefault });
}

const NONE_RUNNING = new Set<string>();

describe("computePluginRegistryTransitionPlan — adds", () => {
  it("plans `toStart` for newly-installed enabled plugin", () => {
    const oldR = registry([]);
    const newR = registry([plugin("com.a")]);
    const plan = computePluginRegistryTransitionPlan(oldR, newR, NONE_RUNNING);
    expect(plan.toStart.map((s) => s.pluginId)).toEqual(["com.a"]);
    expect(plan.toRestart).toEqual([]);
    expect(plan.toStop).toEqual([]);
  });

  it("does NOT plan toStart for newly-installed plugin disabled by override", () => {
    const oldR = registry([]);
    const newR = registry([plugin("com.a")], { "com.a": false });
    const plan = computePluginRegistryTransitionPlan(oldR, newR, NONE_RUNNING);
    expect(plan.toStart).toEqual([]);
    expect(plan.toStop).toEqual([]);
    expect(plan.noChange).toEqual([]);
  });

  it("does NOT plan toStart for newly-installed plugin with manifest enabledByDefault: false", () => {
    const oldR = registry([]);
    const newR = registry([plugin("com.a", { enabledByDefault: false })]);
    const plan = computePluginRegistryTransitionPlan(oldR, newR, NONE_RUNNING);
    expect(plan.toStart).toEqual([]);
  });

  it("DOES plan toStart when registry override re-enables a default-off plugin", () => {
    const oldR = registry([]);
    const newR = registry([plugin("com.a", { enabledByDefault: false })], {
      "com.a": true,
    });
    const plan = computePluginRegistryTransitionPlan(oldR, newR, NONE_RUNNING);
    expect(plan.toStart.map((s) => s.pluginId)).toEqual(["com.a"]);
  });
});

describe("computePluginRegistryTransitionPlan — removes", () => {
  it("plans `toStop` (reason: removed) for uninstalled running plugin", () => {
    const oldR = registry([plugin("com.a"), plugin("com.b")]);
    const newR = registry([plugin("com.a")]);
    const running = new Set(["com.a", "com.b"]);
    const plan = computePluginRegistryTransitionPlan(oldR, newR, running);
    expect(plan.toStop).toEqual([{ pluginId: "com.b", reason: "removed" }]);
  });

  it("does NOT plan toStop for uninstalled plugin that wasn't running", () => {
    const oldR = registry([plugin("com.a"), plugin("com.b")]);
    const newR = registry([plugin("com.a")]);
    const running = new Set(["com.a"]);
    const plan = computePluginRegistryTransitionPlan(oldR, newR, running);
    expect(plan.toStop).toEqual([]);
  });
});

describe("computePluginRegistryTransitionPlan — disables (override flips off)", () => {
  it("plans `toStop` (reason: disabled) when override flips a running plugin off", () => {
    const oldR = registry([plugin("com.a")]);
    const newR = registry([plugin("com.a")], { "com.a": false });
    const running = new Set(["com.a"]);
    const plan = computePluginRegistryTransitionPlan(oldR, newR, running);
    expect(plan.toStop).toEqual([{ pluginId: "com.a", reason: "disabled" }]);
  });

  it("does NOT plan toStop when an already-off plugin is removed", () => {
    const oldR = registry([plugin("com.a")], { "com.a": false });
    const newR = registry([]);
    const plan = computePluginRegistryTransitionPlan(oldR, newR, NONE_RUNNING);
    expect(plan.toStop).toEqual([]);
  });
});

describe("computePluginRegistryTransitionPlan — restarts", () => {
  it("plans `toRestart` (version-changed) when version bumps and plugin is running", () => {
    const oldR = registry([plugin("com.a", { version: "1.0.0" })]);
    const newR = registry([plugin("com.a", { version: "2.0.0" })]);
    const plan = computePluginRegistryTransitionPlan(
      oldR,
      newR,
      new Set(["com.a"]),
    );
    expect(plan.toRestart).toHaveLength(1);
    expect(plan.toRestart[0]).toMatchObject({
      pluginId: "com.a",
      reason: "version-changed",
    });
    expect(plan.toRestart[0].previousManifest.version).toBe("1.0.0");
    expect(plan.toRestart[0].nextManifest.version).toBe("2.0.0");
  });

  it("plans `toRestart` (manifest-changed) when other fields drift but version is same", () => {
    const oldR = registry([plugin("com.a", { description: "old" })]);
    const newR = registry([plugin("com.a", { description: "new" })]);
    const plan = computePluginRegistryTransitionPlan(
      oldR,
      newR,
      new Set(["com.a"]),
    );
    expect(plan.toRestart).toEqual([
      expect.objectContaining({
        pluginId: "com.a",
        reason: "manifest-changed",
      }),
    ]);
  });

  it("does NOT plan toRestart when the plugin isn't currently running", () => {
    const oldR = registry([plugin("com.a", { version: "1.0.0" })]);
    const newR = registry([plugin("com.a", { version: "2.0.0" })]);
    const plan = computePluginRegistryTransitionPlan(oldR, newR, NONE_RUNNING);
    expect(plan.toRestart).toEqual([]);
    expect(plan.toStart).toEqual([
      expect.objectContaining({ pluginId: "com.a" }),
    ]);
  });
});

describe("computePluginRegistryTransitionPlan — noChange", () => {
  it("captures running plugins with identical manifests in noChange", () => {
    const oldR = registry([plugin("com.a"), plugin("com.b")]);
    const newR = registry([plugin("com.a"), plugin("com.b")]);
    const plan = computePluginRegistryTransitionPlan(
      oldR,
      newR,
      new Set(["com.a", "com.b"]),
    );
    expect(plan.noChange).toEqual(["com.a", "com.b"]);
    expect(plan.toStart).toEqual([]);
    expect(plan.toStop).toEqual([]);
    expect(plan.toRestart).toEqual([]);
  });

  it("does NOT include not-running plugins in noChange", () => {
    const oldR = registry([plugin("com.a")], { "com.a": false });
    const newR = registry([plugin("com.a")], { "com.a": false });
    const plan = computePluginRegistryTransitionPlan(oldR, newR, NONE_RUNNING);
    expect(plan.noChange).toEqual([]);
  });
});

describe("computePluginRegistryTransitionPlan — combined", () => {
  it("captures start + restart + stop + noChange in one plan", () => {
    const oldR = registry([
      plugin("com.removed"),
      plugin("com.versioned", { version: "1.0.0" }),
      plugin("com.untouched"),
      plugin("com.to-be-disabled"),
    ]);
    const newR = registry(
      [
        plugin("com.added"),
        plugin("com.versioned", { version: "2.0.0" }),
        plugin("com.untouched"),
        plugin("com.to-be-disabled"),
      ],
      { "com.to-be-disabled": false },
    );
    const running = new Set([
      "com.removed",
      "com.versioned",
      "com.untouched",
      "com.to-be-disabled",
    ]);
    const plan = computePluginRegistryTransitionPlan(oldR, newR, running);

    expect(plan.toStart.map((s) => s.pluginId)).toEqual(["com.added"]);
    expect(plan.toRestart.map((r) => r.pluginId)).toEqual(["com.versioned"]);
    expect(plan.toStop).toEqual([
      { pluginId: "com.removed", reason: "removed" },
      { pluginId: "com.to-be-disabled", reason: "disabled" },
    ]);
    expect(plan.noChange).toEqual(["com.untouched"]);
  });
});

describe("isPluginRegistryTransitionPlanEmpty", () => {
  it("returns true when no transitions", () => {
    const plan = computePluginRegistryTransitionPlan(
      registry([]),
      registry([]),
      NONE_RUNNING,
    );
    expect(isPluginRegistryTransitionPlanEmpty(plan)).toBe(true);
  });

  it("returns false when any transition exists", () => {
    const plan = computePluginRegistryTransitionPlan(
      registry([]),
      registry([plugin("com.a")]),
      NONE_RUNNING,
    );
    expect(isPluginRegistryTransitionPlanEmpty(plan)).toBe(false);
  });

  it("returns true when only noChange entries are present", () => {
    const plan = computePluginRegistryTransitionPlan(
      registry([plugin("com.a")]),
      registry([plugin("com.a")]),
      new Set(["com.a"]),
    );
    expect(isPluginRegistryTransitionPlanEmpty(plan)).toBe(true);
  });
});
