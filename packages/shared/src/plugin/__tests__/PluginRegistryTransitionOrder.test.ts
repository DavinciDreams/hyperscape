import {
  PluginManifestSchema,
  PluginRegistryManifestSchema,
} from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import { computePluginRegistryTransitionPlan } from "../PluginRegistryTransitionPlan.js";
import {
  type TransitionStep,
  orderPluginRegistryTransition,
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

function ids(steps: readonly TransitionStep[]): string[] {
  return steps.map((s) => `${s.kind}:${s.pluginId}`);
}

describe("orderPluginRegistryTransition — bucket order", () => {
  it("emits stops, then restarts, then starts", () => {
    const oldR = registry([
      plugin("com.a"),
      plugin("com.b", { version: "1.0.0" }),
      plugin("com.removed"),
    ]);
    const newR = registry([
      plugin("com.a"),
      plugin("com.b", { version: "2.0.0" }),
      plugin("com.added"),
    ]);
    const plan = computePluginRegistryTransitionPlan(
      oldR,
      newR,
      new Set(["com.a", "com.b", "com.removed"]),
    );
    const order = orderPluginRegistryTransition(plan, oldR, newR);
    expect(ids(order)).toEqual([
      "stop:com.removed",
      "restart:com.b",
      "start:com.added",
    ]);
  });
});

describe("orderPluginRegistryTransition — stops in reverse OLD load order", () => {
  it("disables dependents before their dependencies", () => {
    // OLD: com.dep is loaded first, com.user depends on it.
    const oldR = registry([
      plugin("com.dep"),
      plugin("com.user", {
        dependencies: [{ id: "com.dep", versionRange: "^1.0.0" }],
      }),
    ]);
    // NEW: both removed.
    const newR = registry([]);
    const plan = computePluginRegistryTransitionPlan(
      oldR,
      newR,
      new Set(["com.dep", "com.user"]),
    );
    const order = orderPluginRegistryTransition(plan, oldR, newR);
    // stop user FIRST (it depends on dep), then dep
    expect(ids(order)).toEqual(["stop:com.user", "stop:com.dep"]);
  });
});

describe("orderPluginRegistryTransition — starts in NEW load order", () => {
  it("enables dependencies before their dependents", () => {
    // NEW: com.user depends on com.dep, both new.
    const oldR = registry([]);
    const newR = registry([
      plugin("com.user", {
        dependencies: [{ id: "com.dep", versionRange: "^1.0.0" }],
      }),
      plugin("com.dep"),
    ]);
    const plan = computePluginRegistryTransitionPlan(oldR, newR, new Set());
    const order = orderPluginRegistryTransition(plan, oldR, newR);
    expect(ids(order)).toEqual(["start:com.dep", "start:com.user"]);
  });
});

describe("orderPluginRegistryTransition — restarts in NEW load order", () => {
  it("restarts dependencies before dependents", () => {
    const oldR = registry([
      plugin("com.dep", { version: "1.0.0" }),
      plugin("com.user", {
        version: "1.0.0",
        dependencies: [{ id: "com.dep", versionRange: "^1.0.0" }],
      }),
    ]);
    const newR = registry([
      plugin("com.dep", { version: "2.0.0" }),
      plugin("com.user", {
        version: "2.0.0",
        dependencies: [{ id: "com.dep", versionRange: "^1.0.0" }],
      }),
    ]);
    const plan = computePluginRegistryTransitionPlan(
      oldR,
      newR,
      new Set(["com.dep", "com.user"]),
    );
    const order = orderPluginRegistryTransition(plan, oldR, newR);
    expect(ids(order)).toEqual(["restart:com.dep", "restart:com.user"]);
  });
});

describe("orderPluginRegistryTransition — combined dependency-aware plan", () => {
  it("interleaves stops + restarts + starts respecting dep order in each bucket", () => {
    // OLD: removed-tail depends on removed-root; user depends on dep.
    const oldR = registry([
      plugin("com.removed-root"),
      plugin("com.removed-tail", {
        dependencies: [{ id: "com.removed-root", versionRange: "^1.0.0" }],
      }),
      plugin("com.dep", { version: "1.0.0" }),
      plugin("com.user", {
        version: "1.0.0",
        dependencies: [{ id: "com.dep", versionRange: "^1.0.0" }],
      }),
    ]);
    // NEW: drop both removed plugins, restart dep+user, add new chain
    // (added-root + added-tail).
    const newR = registry([
      plugin("com.dep", { version: "2.0.0" }),
      plugin("com.user", {
        version: "2.0.0",
        dependencies: [{ id: "com.dep", versionRange: "^1.0.0" }],
      }),
      plugin("com.added-tail", {
        dependencies: [{ id: "com.added-root", versionRange: "^1.0.0" }],
      }),
      plugin("com.added-root"),
    ]);
    const plan = computePluginRegistryTransitionPlan(
      oldR,
      newR,
      new Set(["com.removed-root", "com.removed-tail", "com.dep", "com.user"]),
    );
    const order = orderPluginRegistryTransition(plan, oldR, newR);
    expect(ids(order)).toEqual([
      // stops: tail before root (reverse OLD order)
      "stop:com.removed-tail",
      "stop:com.removed-root",
      // restarts: dep before user (NEW order)
      "restart:com.dep",
      "restart:com.user",
      // starts: root before tail (NEW order)
      "start:com.added-root",
      "start:com.added-tail",
    ]);
  });
});

describe("orderPluginRegistryTransition — empty plans", () => {
  it("returns empty array for fully-empty plan", () => {
    const oldR = registry([]);
    const newR = registry([]);
    const plan = computePluginRegistryTransitionPlan(oldR, newR, new Set());
    expect(orderPluginRegistryTransition(plan, oldR, newR)).toEqual([]);
  });

  it("ignores noChange entries (they aren't steps)", () => {
    const oldR = registry([plugin("com.a")]);
    const newR = registry([plugin("com.a")]);
    const plan = computePluginRegistryTransitionPlan(
      oldR,
      newR,
      new Set(["com.a"]),
    );
    expect(plan.noChange).toEqual(["com.a"]);
    expect(orderPluginRegistryTransition(plan, oldR, newR)).toEqual([]);
  });
});

describe("orderPluginRegistryTransition — id-asc tiebreak", () => {
  it("sorts ties by pluginId asc within each bucket", () => {
    // No deps among any of these — pure id-asc tiebreak.
    const oldR = registry([plugin("com.zalpha"), plugin("com.aalpha")]);
    const newR = registry([]);
    const plan = computePluginRegistryTransitionPlan(
      oldR,
      newR,
      new Set(["com.aalpha", "com.zalpha"]),
    );
    const order = orderPluginRegistryTransition(plan, oldR, newR);
    // Siblings (no deps) load in id-asc order [aalpha, zalpha];
    // reverse-OLD load order is [zalpha, aalpha].
    expect(ids(order)).toEqual(["stop:com.zalpha", "stop:com.aalpha"]);
  });
});

describe("orderPluginRegistryTransition — cycle handling", () => {
  it("falls back to id-sort when registry has a cycle (default)", () => {
    // Build a registry where com.a depends on com.b and com.b on com.a.
    const cyclic = registry([
      plugin("com.a", {
        dependencies: [{ id: "com.b", versionRange: "^1.0.0" }],
      }),
      plugin("com.b", {
        dependencies: [{ id: "com.a", versionRange: "^1.0.0" }],
      }),
    ]);
    const empty = registry([]);
    const plan = computePluginRegistryTransitionPlan(
      cyclic,
      empty,
      new Set(["com.a", "com.b"]),
    );
    // Default: should not throw — falls back to id-sort.
    const order = orderPluginRegistryTransition(plan, cyclic, empty);
    // We only care that we got 2 stops and didn't throw.
    expect(order.length).toBe(2);
    expect(order.every((s) => s.kind === "stop")).toBe(true);
  });

  it("throws when throwOnCycle: true and the registry has a cycle", () => {
    const cyclic = registry([
      plugin("com.a", {
        dependencies: [{ id: "com.b", versionRange: "^1.0.0" }],
      }),
      plugin("com.b", {
        dependencies: [{ id: "com.a", versionRange: "^1.0.0" }],
      }),
    ]);
    const empty = registry([]);
    const plan = computePluginRegistryTransitionPlan(
      cyclic,
      empty,
      new Set(["com.a", "com.b"]),
    );
    expect(() =>
      orderPluginRegistryTransition(plan, cyclic, empty, {
        throwOnCycle: true,
      }),
    ).toThrow();
  });
});
