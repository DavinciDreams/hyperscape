/**
 * Tests for the plugin load-order resolver.
 *
 * Coverage:
 *   - No deps → input order preserved
 *   - Hard dep → dep comes before dependent
 *   - loadAfter → soft ordering honored when the target is present
 *   - loadAfter missing target → no constraint, not a failure
 *   - Missing required dep → `unresolvable` with missing-dependency
 *   - Version mismatch → `unresolvable` with dependency-version-mismatch
 *   - Optional dep missing → still orderable (no failure)
 *   - Optional dep version mismatch → still orderable (no failure)
 *   - Cycle → all members `unresolvable` with cycleMemberIds listing
 *   - Diamond dep → single emit of the shared base
 *   - Stable order: equally-unconstrained plugins emit in input order
 *   - Duplicate ids → first wins, second silently dropped
 */

import { describe, expect, it } from "vitest";

import {
  PluginManifestSchema,
  resolvePluginLoadOrder,
  type LoadedPluginModule,
  type PluginManifest,
} from "../index.js";

/** Build a LoadedPluginModule with just the manifest fields that matter to the resolver. */
function mkModule(
  id: string,
  opts: {
    version?: string;
    dependencies?: Array<{
      id: string;
      versionRange: string;
      optional?: boolean;
    }>;
    loadAfter?: string[];
  } = {},
): LoadedPluginModule {
  const manifest: PluginManifest = PluginManifestSchema.parse({
    id,
    name: id,
    version: opts.version ?? "1.0.0",
    entry: "./dist/index.js",
    author: { name: "test" },
    hyperforgeApi: "0.1.0",
    dependencies: opts.dependencies ?? [],
    loadAfter: opts.loadAfter ?? [],
  });
  return {
    manifest,
    factory: () => ({}),
  };
}

describe("resolvePluginLoadOrder — no constraints", () => {
  it("preserves input order for independent plugins", () => {
    const modules = [
      mkModule("com.example.a"),
      mkModule("com.example.b"),
      mkModule("com.example.c"),
    ];
    const { ordered, unresolvable } = resolvePluginLoadOrder(modules);
    expect(unresolvable).toHaveLength(0);
    expect(ordered.map((m) => m.manifest.id)).toEqual([
      "com.example.a",
      "com.example.b",
      "com.example.c",
    ]);
  });
});

describe("resolvePluginLoadOrder — hard dependencies", () => {
  it("places dep before dependent", () => {
    const modules = [
      mkModule("com.example.dependent", {
        dependencies: [{ id: "com.example.base", versionRange: "^1.0.0" }],
      }),
      mkModule("com.example.base"),
    ];
    const { ordered, unresolvable } = resolvePluginLoadOrder(modules);
    expect(unresolvable).toHaveLength(0);
    const order = ordered.map((m) => m.manifest.id);
    expect(order.indexOf("com.example.base")).toBeLessThan(
      order.indexOf("com.example.dependent"),
    );
  });

  it("reports missing-dependency for a required dep that isn't in the input", () => {
    const modules = [
      mkModule("com.example.orphan", {
        dependencies: [{ id: "com.example.absent", versionRange: "^1.0.0" }],
      }),
    ];
    const { ordered, unresolvable } = resolvePluginLoadOrder(modules);
    expect(ordered).toHaveLength(0);
    expect(unresolvable).toHaveLength(1);
    const reason = unresolvable[0]!.reason;
    expect(reason.kind).toBe("missing-dependency");
    if (reason.kind === "missing-dependency") {
      expect(reason.dependencyId).toBe("com.example.absent");
    }
  });

  it("reports dependency-version-mismatch when version fails the range", () => {
    const modules = [
      mkModule("com.example.base", { version: "0.9.0" }),
      mkModule("com.example.dependent", {
        dependencies: [{ id: "com.example.base", versionRange: "^1.0.0" }],
      }),
    ];
    const { ordered, unresolvable } = resolvePluginLoadOrder(modules);
    // `base` itself orders fine; `dependent` is unresolvable.
    expect(ordered.map((m) => m.manifest.id)).toEqual(["com.example.base"]);
    expect(unresolvable).toHaveLength(1);
    const reason = unresolvable[0]!.reason;
    expect(reason.kind).toBe("dependency-version-mismatch");
    if (reason.kind === "dependency-version-mismatch") {
      expect(reason.dependencyId).toBe("com.example.base");
      expect(reason.required).toBe("^1.0.0");
      expect(reason.available).toBe("0.9.0");
    }
  });
});

describe("resolvePluginLoadOrder — optional dependencies", () => {
  it("does not fail when an optional dep is missing", () => {
    const modules = [
      mkModule("com.example.standalone", {
        dependencies: [
          {
            id: "com.example.optional-missing",
            versionRange: "^1.0.0",
            optional: true,
          },
        ],
      }),
    ];
    const { ordered, unresolvable } = resolvePluginLoadOrder(modules);
    expect(unresolvable).toHaveLength(0);
    expect(ordered.map((m) => m.manifest.id)).toEqual([
      "com.example.standalone",
    ]);
  });

  it("does not fail when an optional dep's version mismatches", () => {
    const modules = [
      mkModule("com.example.oldbase", { version: "0.9.0" }),
      mkModule("com.example.optional-consumer", {
        dependencies: [
          {
            id: "com.example.oldbase",
            versionRange: "^1.0.0",
            optional: true,
          },
        ],
      }),
    ];
    const { ordered, unresolvable } = resolvePluginLoadOrder(modules);
    expect(unresolvable).toHaveLength(0);
    expect(ordered.map((m) => m.manifest.id).sort()).toEqual([
      "com.example.oldbase",
      "com.example.optional-consumer",
    ]);
  });
});

describe("resolvePluginLoadOrder — loadAfter", () => {
  it("honors loadAfter when the target is present", () => {
    const modules = [
      mkModule("com.example.late", { loadAfter: ["com.example.early"] }),
      mkModule("com.example.early"),
    ];
    const { ordered, unresolvable } = resolvePluginLoadOrder(modules);
    expect(unresolvable).toHaveLength(0);
    const order = ordered.map((m) => m.manifest.id);
    expect(order.indexOf("com.example.early")).toBeLessThan(
      order.indexOf("com.example.late"),
    );
  });

  it("silently ignores loadAfter when target is missing (not a failure)", () => {
    const modules = [
      mkModule("com.example.flexible", {
        loadAfter: ["com.example.not-present"],
      }),
    ];
    const { ordered, unresolvable } = resolvePluginLoadOrder(modules);
    expect(unresolvable).toHaveLength(0);
    expect(ordered.map((m) => m.manifest.id)).toEqual(["com.example.flexible"]);
  });
});

describe("resolvePluginLoadOrder — cycles", () => {
  it("reports all members of a 2-cycle as unresolvable with cycleMemberIds", () => {
    const modules = [
      mkModule("com.example.a", {
        dependencies: [{ id: "com.example.b", versionRange: "^1.0.0" }],
      }),
      mkModule("com.example.b", {
        dependencies: [{ id: "com.example.a", versionRange: "^1.0.0" }],
      }),
    ];
    const { ordered, unresolvable } = resolvePluginLoadOrder(modules);
    expect(ordered).toHaveLength(0);
    expect(unresolvable).toHaveLength(2);
    for (const entry of unresolvable) {
      expect(entry.reason.kind).toBe("cycle");
      if (entry.reason.kind === "cycle") {
        expect([...entry.reason.cycleMemberIds].sort()).toEqual([
          "com.example.a",
          "com.example.b",
        ]);
      }
    }
  });

  it("reports all members of a 3-cycle", () => {
    const modules = [
      mkModule("com.example.a", {
        dependencies: [{ id: "com.example.b", versionRange: "^1.0.0" }],
      }),
      mkModule("com.example.b", {
        dependencies: [{ id: "com.example.c", versionRange: "^1.0.0" }],
      }),
      mkModule("com.example.c", {
        dependencies: [{ id: "com.example.a", versionRange: "^1.0.0" }],
      }),
    ];
    const { ordered, unresolvable } = resolvePluginLoadOrder(modules);
    expect(ordered).toHaveLength(0);
    expect(unresolvable).toHaveLength(3);
    for (const entry of unresolvable) {
      expect(entry.reason.kind).toBe("cycle");
    }
  });
});

describe("resolvePluginLoadOrder — diamond + stability", () => {
  it("handles diamond dependency — base emitted exactly once, before all dependents", () => {
    const modules = [
      mkModule("com.example.left", {
        dependencies: [{ id: "com.example.base", versionRange: "^1.0.0" }],
      }),
      mkModule("com.example.base"),
      mkModule("com.example.right", {
        dependencies: [{ id: "com.example.base", versionRange: "^1.0.0" }],
      }),
      mkModule("com.example.top", {
        dependencies: [
          { id: "com.example.left", versionRange: "^1.0.0" },
          { id: "com.example.right", versionRange: "^1.0.0" },
        ],
      }),
    ];
    const { ordered, unresolvable } = resolvePluginLoadOrder(modules);
    expect(unresolvable).toHaveLength(0);
    const order = ordered.map((m) => m.manifest.id);
    // All 4 emit exactly once.
    expect(new Set(order).size).toBe(4);
    // Base before everyone.
    expect(order.indexOf("com.example.base")).toBe(0);
    // top last.
    expect(order.indexOf("com.example.top")).toBe(3);
  });

  it("preserves input order among plugins with no constraining edges", () => {
    const modules = [
      mkModule("com.example.z"),
      mkModule("com.example.a"),
      mkModule("com.example.m"),
    ];
    const { ordered } = resolvePluginLoadOrder(modules);
    expect(ordered.map((m) => m.manifest.id)).toEqual([
      "com.example.z",
      "com.example.a",
      "com.example.m",
    ]);
  });
});

describe("resolvePluginLoadOrder — duplicate ids", () => {
  it("keeps first occurrence when the same id appears twice", () => {
    const first = mkModule("com.example.dup", { version: "1.0.0" });
    const second = mkModule("com.example.dup", { version: "2.0.0" });
    const { ordered, unresolvable } = resolvePluginLoadOrder([first, second]);
    expect(unresolvable).toHaveLength(0);
    expect(ordered).toHaveLength(1);
    expect(ordered[0]!.manifest.version).toBe("1.0.0");
  });
});
