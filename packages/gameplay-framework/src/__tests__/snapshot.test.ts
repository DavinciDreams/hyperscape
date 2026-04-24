/**
 * Tests for `snapshotSession` / `snapshotLoadedModules` — JSON-friendly
 * projection of a `PluginSession` into a stable wire shape.
 *
 * Coverage:
 *   - Empty session → empty arrays + zeroed summary
 *   - Running plugin → manifest summary + dependencies + contribution counts
 *   - Optional-default on dependency `optional` field
 *   - Failed package → Error name + message serialized (no raw Error)
 *   - Unresolvable plugin → reason kind-for-kind serialized (all 3 kinds)
 *   - `snapshotLoadedModules` for bare module arrays
 *   - Snapshot result is structurally JSON-round-trippable
 */

import { describe, expect, it } from "vitest";

import {
  PluginManifestSchema,
  classifyPluginStatus,
  diffSessionSnapshots,
  findFailedPackage,
  formatSnapshotJson,
  findRunningPlugin,
  findUnresolvablePlugin,
  snapshotCatalogResolution,
  snapshotLoadedModules,
  snapshotSession,
  type CatalogLoadFailure,
  type LoadedPluginModule,
  type PluginCatalogResult,
  type PluginContextBase,
  type PluginFactory,
  type PluginInstanceRecord,
  type PluginLoadOrder,
  type PluginManifest,
  type PluginSession,
  type SessionSnapshot,
  type UnresolvablePlugin,
} from "../index.js";

interface Ctx extends PluginContextBase {
  readonly tag: string;
}

function mkManifest(
  id: string,
  overrides: Partial<{
    version: string;
    description: string;
    dependencies: Array<{
      id: string;
      versionRange: string;
      optional?: boolean;
    }>;
    loadAfter: string[];
    tags: string[];
    contributions: Partial<{
      systems: string[];
      entities: string[];
      widgets: string[];
      manifestSchemas: string[];
      paletteCategories: string[];
      toolbarTools: string[];
      commands: string[];
    }>;
  }> = {},
): PluginManifest {
  return PluginManifestSchema.parse({
    id,
    name: id,
    version: overrides.version ?? "1.0.0",
    entry: "./dist/index.js",
    author: { name: "test" },
    hyperforgeApi: "0.1.0",
    description: overrides.description ?? "a test plugin",
    dependencies: overrides.dependencies ?? [],
    loadAfter: overrides.loadAfter ?? [],
    tags: overrides.tags ?? [],
    contributions: overrides.contributions ?? {},
  });
}

function mkRecord(
  id: string,
  manifest?: PluginManifest,
): PluginInstanceRecord<Ctx> {
  const m = manifest ?? mkManifest(id);
  const scope = {
    pluginId: m.id,
    register: () => undefined,
    dispose: async () => undefined,
    reopen: () => undefined,
  };
  const plugin = {};
  const ctx: Ctx = { pluginId: m.id, scope, tag: "test" };
  return { manifest: m, plugin, ctx, scope };
}

function mkModule(manifest: PluginManifest): LoadedPluginModule<Ctx> {
  const factory: PluginFactory<Ctx> = () => ({});
  return { manifest, factory };
}

function mkSession(
  records: Array<PluginInstanceRecord<Ctx>>,
  failedPackages: CatalogLoadFailure[] = [],
  unresolvable: Array<UnresolvablePlugin<Ctx>> = [],
): PluginSession<Ctx> {
  return {
    records,
    failedPackages,
    unresolvable,
    async stop() {},
  };
}

describe("snapshotSession", () => {
  it("empty session: empty arrays + zero summary", () => {
    const snap = snapshotSession<Ctx>(mkSession([]));
    expect(snap.running).toEqual([]);
    expect(snap.failedPackages).toEqual([]);
    expect(snap.unresolvable).toEqual([]);
    expect(snap.summary).toEqual({
      runningCount: 0,
      unresolvableCount: 0,
      failedCount: 0,
    });
  });

  it("running plugin: manifest summary + dependencies + contribution counts", () => {
    const manifest = mkManifest("com.test.alpha", {
      version: "2.3.4",
      description: "alpha plugin",
      dependencies: [
        { id: "com.test.beta", versionRange: "^1.0.0" },
        { id: "com.test.gamma", versionRange: "~2.0.0", optional: true },
      ],
      loadAfter: ["com.test.delta"],
      tags: ["combat", "rpg"],
      contributions: {
        systems: ["s1", "s2"],
        widgets: ["w1"],
      },
    });
    const snap = snapshotSession<Ctx>(
      mkSession([mkRecord("com.test.alpha", manifest)]),
    );

    expect(snap.summary.runningCount).toBe(1);
    const row = snap.running[0]!;

    expect(row.manifest).toEqual({
      id: "com.test.alpha",
      name: "com.test.alpha",
      version: "2.3.4",
      description: "alpha plugin",
      hyperforgeApi: "0.1.0",
      enabledByDefault: true,
      tags: ["combat", "rpg"],
    });

    expect(row.dependencies).toEqual([
      { id: "com.test.beta", versionRange: "^1.0.0", optional: false },
      { id: "com.test.gamma", versionRange: "~2.0.0", optional: true },
    ]);

    expect(row.loadAfter).toEqual(["com.test.delta"]);

    expect(row.contributions).toEqual({
      systems: 2,
      entities: 0,
      widgets: 1,
      manifestSchemas: 0,
      paletteCategories: 0,
      toolbarTools: 0,
      commands: 0,
    });
  });

  it("failed package: Error gets name + message serialized", () => {
    const err = new TypeError("plugin.json missing");
    const snap = snapshotSession<Ctx>(
      mkSession([], [{ baseDir: "/fake/broken", error: err }]),
    );
    expect(snap.summary.failedCount).toBe(1);
    expect(snap.failedPackages[0]).toEqual({
      baseDir: "/fake/broken",
      errorName: "TypeError",
      errorMessage: "plugin.json missing",
    });
  });

  it("failed package: non-Error error stringifies cleanly", () => {
    const snap = snapshotSession<Ctx>(
      mkSession([], [{ baseDir: "/fake/weird", error: "raw string error" }]),
    );
    expect(snap.failedPackages[0]).toEqual({
      baseDir: "/fake/weird",
      errorName: "Error",
      errorMessage: "raw string error",
    });
  });

  it("unresolvable: missing-dependency reason serialized", () => {
    const manifest = mkManifest("com.test.alpha");
    const entry: UnresolvablePlugin<Ctx> = {
      module: mkModule(manifest),
      reason: { kind: "missing-dependency", dependencyId: "com.test.missing" },
    };
    const snap = snapshotSession<Ctx>(mkSession([], [], [entry]));
    expect(snap.summary.unresolvableCount).toBe(1);
    expect(snap.unresolvable[0]!.reason).toEqual({
      kind: "missing-dependency",
      dependencyId: "com.test.missing",
    });
    expect(snap.unresolvable[0]!.manifest.id).toBe("com.test.alpha");
  });

  it("unresolvable: dependency-version-mismatch reason serialized", () => {
    const manifest = mkManifest("com.test.alpha");
    const entry: UnresolvablePlugin<Ctx> = {
      module: mkModule(manifest),
      reason: {
        kind: "dependency-version-mismatch",
        dependencyId: "com.test.beta",
        required: "^2.0.0",
        available: "1.0.0",
      },
    };
    const snap = snapshotSession<Ctx>(mkSession([], [], [entry]));
    expect(snap.unresolvable[0]!.reason).toEqual({
      kind: "dependency-version-mismatch",
      dependencyId: "com.test.beta",
      required: "^2.0.0",
      available: "1.0.0",
    });
  });

  it("unresolvable: cycle reason serialized with member ids", () => {
    const manifest = mkManifest("com.test.alpha");
    const entry: UnresolvablePlugin<Ctx> = {
      module: mkModule(manifest),
      reason: {
        kind: "cycle",
        cycleMemberIds: ["com.test.alpha", "com.test.beta"],
      },
    };
    const snap = snapshotSession<Ctx>(mkSession([], [], [entry]));
    expect(snap.unresolvable[0]!.reason).toEqual({
      kind: "cycle",
      cycleMemberIds: ["com.test.alpha", "com.test.beta"],
    });
  });

  it("result is JSON round-trippable (no Errors, functions, Maps leak)", () => {
    const err = new Error("boom");
    const manifest = mkManifest("com.test.alpha", {
      dependencies: [{ id: "com.test.beta", versionRange: "^1.0.0" }],
    });
    const snap = snapshotSession<Ctx>(
      mkSession(
        [mkRecord("com.test.alpha", manifest)],
        [{ baseDir: "/fake/broken", error: err }],
        [
          {
            module: mkModule(mkManifest("com.test.gamma")),
            reason: { kind: "missing-dependency", dependencyId: "com.test.x" },
          },
        ],
      ),
    );
    const roundtripped = JSON.parse(JSON.stringify(snap));
    expect(roundtripped).toEqual(snap);
  });
});

describe("snapshotLoadedModules", () => {
  it("projects bare modules into the running row shape", () => {
    const modules = [
      mkModule(
        mkManifest("com.test.a", { contributions: { systems: ["s1"] } }),
      ),
      mkModule(mkManifest("com.test.b")),
    ];
    const rows = snapshotLoadedModules(modules);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.manifest.id).toBe("com.test.a");
    expect(rows[0]!.contributions.systems).toBe(1);
    expect(rows[1]!.manifest.id).toBe("com.test.b");
    expect(rows[1]!.contributions.systems).toBe(0);
  });

  it("empty input → empty output", () => {
    expect(snapshotLoadedModules([])).toEqual([]);
  });
});

describe("snapshotCatalogResolution", () => {
  it("empty catalog + empty resolution → fully zeroed snapshot", () => {
    const catalog: PluginCatalogResult<Ctx> = { loaded: [], failed: [] };
    const resolution: PluginLoadOrder<Ctx> = { ordered: [], unresolvable: [] };
    const snap = snapshotCatalogResolution(catalog, resolution);
    expect(snap.running).toEqual([]);
    expect(snap.unresolvable).toEqual([]);
    expect(snap.failedPackages).toEqual([]);
    expect(snap.summary).toEqual({
      runningCount: 0,
      unresolvableCount: 0,
      failedCount: 0,
    });
  });

  it("ordered modules populate running[] in resolver order", () => {
    const modA = mkModule(
      mkManifest("com.test.a", { contributions: { systems: ["s1"] } }),
    );
    const modB = mkModule(mkManifest("com.test.b"));
    const catalog: PluginCatalogResult<Ctx> = {
      loaded: [modA, modB],
      failed: [],
    };
    // Resolver returns opposite order — snapshot should honor it.
    const resolution: PluginLoadOrder<Ctx> = {
      ordered: [modB, modA],
      unresolvable: [],
    };
    const snap = snapshotCatalogResolution(catalog, resolution);
    expect(snap.summary.runningCount).toBe(2);
    expect(snap.running.map((r) => r.manifest.id)).toEqual([
      "com.test.b",
      "com.test.a",
    ]);
    // Contribution count projected correctly
    expect(snap.running[1]!.contributions.systems).toBe(1);
  });

  it("catalog.failed → failedPackages[] with serialized Error", () => {
    const err = new TypeError("plugin.json missing");
    const catalog: PluginCatalogResult<Ctx> = {
      loaded: [],
      failed: [{ baseDir: "/fake/broken", error: err }],
    };
    const resolution: PluginLoadOrder<Ctx> = { ordered: [], unresolvable: [] };
    const snap = snapshotCatalogResolution(catalog, resolution);
    expect(snap.summary.failedCount).toBe(1);
    expect(snap.failedPackages[0]).toEqual({
      baseDir: "/fake/broken",
      errorName: "TypeError",
      errorMessage: "plugin.json missing",
    });
  });

  it("unresolvable projects all 3 reason kinds kind-for-kind", () => {
    const modMissing = mkModule(mkManifest("com.test.missing"));
    const modMismatch = mkModule(mkManifest("com.test.mismatch"));
    const modCycle = mkModule(mkManifest("com.test.cycle"));
    const resolution: PluginLoadOrder<Ctx> = {
      ordered: [],
      unresolvable: [
        {
          module: modMissing,
          reason: { kind: "missing-dependency", dependencyId: "com.test.x" },
        },
        {
          module: modMismatch,
          reason: {
            kind: "dependency-version-mismatch",
            dependencyId: "com.test.y",
            required: "^2.0.0",
            available: "1.0.0",
          },
        },
        {
          module: modCycle,
          reason: {
            kind: "cycle",
            cycleMemberIds: ["com.test.cycle", "com.test.z"],
          },
        },
      ],
    };
    const catalog: PluginCatalogResult<Ctx> = { loaded: [], failed: [] };
    const snap = snapshotCatalogResolution(catalog, resolution);
    expect(snap.summary.unresolvableCount).toBe(3);
    expect(snap.unresolvable[0]!.reason).toEqual({
      kind: "missing-dependency",
      dependencyId: "com.test.x",
    });
    expect(snap.unresolvable[1]!.reason).toEqual({
      kind: "dependency-version-mismatch",
      dependencyId: "com.test.y",
      required: "^2.0.0",
      available: "1.0.0",
    });
    expect(snap.unresolvable[2]!.reason).toEqual({
      kind: "cycle",
      cycleMemberIds: ["com.test.cycle", "com.test.z"],
    });
  });

  it("combined: running + failed + unresolvable all populated", () => {
    const modOk = mkModule(mkManifest("com.test.ok"));
    const modUnres = mkModule(mkManifest("com.test.unres"));
    const catalog: PluginCatalogResult<Ctx> = {
      loaded: [modOk, modUnres],
      failed: [{ baseDir: "/fake/bad", error: new Error("boom") }],
    };
    const resolution: PluginLoadOrder<Ctx> = {
      ordered: [modOk],
      unresolvable: [
        {
          module: modUnres,
          reason: { kind: "missing-dependency", dependencyId: "com.test.gone" },
        },
      ],
    };
    const snap = snapshotCatalogResolution(catalog, resolution);
    expect(snap.summary).toEqual({
      runningCount: 1,
      unresolvableCount: 1,
      failedCount: 1,
    });
    expect(snap.running[0]!.manifest.id).toBe("com.test.ok");
    expect(snap.unresolvable[0]!.manifest.id).toBe("com.test.unres");
    expect(snap.failedPackages[0]!.errorMessage).toBe("boom");
  });

  it("result is JSON-round-trippable", () => {
    const mod = mkModule(mkManifest("com.test.a"));
    const catalog: PluginCatalogResult<Ctx> = { loaded: [mod], failed: [] };
    const resolution: PluginLoadOrder<Ctx> = {
      ordered: [mod],
      unresolvable: [],
    };
    const snap = snapshotCatalogResolution(catalog, resolution);
    const round = JSON.parse(JSON.stringify(snap));
    expect(round).toEqual(snap);
  });
});

describe("snapshot selectors", () => {
  function buildSnapshot() {
    const modRunning = mkModule(mkManifest("com.test.running"));
    const modUnres = mkModule(mkManifest("com.test.unres"));
    return snapshotCatalogResolution(
      {
        loaded: [modRunning, modUnres],
        failed: [{ baseDir: "/fake/broken", error: new TypeError("boom") }],
      },
      {
        ordered: [modRunning],
        unresolvable: [
          {
            module: modUnres,
            reason: {
              kind: "missing-dependency",
              dependencyId: "com.test.gone",
            },
          },
        ],
      },
    );
  }

  it("findRunningPlugin returns the row when id is running", () => {
    const snap = buildSnapshot();
    const row = findRunningPlugin(snap, "com.test.running");
    expect(row).toBeDefined();
    expect(row!.manifest.id).toBe("com.test.running");
  });

  it("findRunningPlugin returns undefined when id isn't running", () => {
    const snap = buildSnapshot();
    expect(findRunningPlugin(snap, "com.test.unres")).toBeUndefined();
    expect(findRunningPlugin(snap, "com.test.ghost")).toBeUndefined();
  });

  it("findUnresolvablePlugin returns the row when id is unresolvable", () => {
    const snap = buildSnapshot();
    const row = findUnresolvablePlugin(snap, "com.test.unres");
    expect(row).toBeDefined();
    expect(row!.manifest.id).toBe("com.test.unres");
    expect(row!.reason.kind).toBe("missing-dependency");
  });

  it("findUnresolvablePlugin returns undefined when id isn't unresolvable", () => {
    const snap = buildSnapshot();
    expect(findUnresolvablePlugin(snap, "com.test.running")).toBeUndefined();
    expect(findUnresolvablePlugin(snap, "com.test.ghost")).toBeUndefined();
  });

  it("findFailedPackage returns the row when baseDir matches", () => {
    const snap = buildSnapshot();
    const row = findFailedPackage(snap, "/fake/broken");
    expect(row).toBeDefined();
    expect(row!.errorName).toBe("TypeError");
    expect(row!.errorMessage).toBe("boom");
  });

  it("findFailedPackage returns undefined on baseDir miss", () => {
    const snap = buildSnapshot();
    expect(findFailedPackage(snap, "/fake/other")).toBeUndefined();
  });

  it("classifyPluginStatus returns 'running' for running ids", () => {
    const snap = buildSnapshot();
    expect(classifyPluginStatus(snap, "com.test.running")).toBe("running");
  });

  it("classifyPluginStatus returns 'unresolvable' for unresolvable ids", () => {
    const snap = buildSnapshot();
    expect(classifyPluginStatus(snap, "com.test.unres")).toBe("unresolvable");
  });

  it("classifyPluginStatus returns 'unknown' for unknown ids", () => {
    const snap = buildSnapshot();
    expect(classifyPluginStatus(snap, "com.test.ghost")).toBe("unknown");
  });

  it("running-first precedence: id present in both buckets resolves as running", () => {
    // Pathological: same id appears in running and unresolvable. classifyPluginStatus
    // should prefer running (matches the semantic that "running wins"; the session
    // would never produce this state but the selector is defensive).
    const mod = mkModule(mkManifest("com.test.x"));
    const weirdSnap = snapshotCatalogResolution<Ctx>(
      { loaded: [mod], failed: [] },
      {
        ordered: [mod],
        unresolvable: [
          {
            module: mod,
            reason: { kind: "cycle", cycleMemberIds: ["com.test.x"] },
          },
        ],
      },
    );
    expect(classifyPluginStatus(weirdSnap, "com.test.x")).toBe("running");
  });
});

// ────────────────────────────────────────────────────────────────────────
// diffSessionSnapshots — pure projector over two SessionSnapshots
// ────────────────────────────────────────────────────────────────────────

describe("diffSessionSnapshots", () => {
  function snapWithRunning(
    ...mods: LoadedPluginModule<Ctx>[]
  ): SessionSnapshot {
    return snapshotCatalogResolution<Ctx>(
      { loaded: mods, failed: [] },
      { ordered: mods, unresolvable: [] },
    );
  }

  it("identity (same snapshot reference) → fully empty diff", () => {
    const mod = mkModule(mkManifest("com.test.a"));
    const snap = snapWithRunning(mod);
    const diff = diffSessionSnapshots(snap, snap);
    expect(diff.running.added).toEqual([]);
    expect(diff.running.removed).toEqual([]);
    expect(diff.running.changed).toEqual([]);
    expect(diff.unresolvable.added).toEqual([]);
    expect(diff.failedPackages.added).toEqual([]);
    expect(diff.reclassified).toEqual([]);
    expect(diff.summary).toEqual({
      runningDelta: 0,
      unresolvableDelta: 0,
      failedDelta: 0,
    });
  });

  it("two structurally identical snapshots → fully empty diff", () => {
    const mkA = () => mkModule(mkManifest("com.test.a", { tags: ["x"] }));
    const prev = snapWithRunning(mkA());
    const next = snapWithRunning(mkA());
    const diff = diffSessionSnapshots(prev, next);
    expect(diff.running.added).toEqual([]);
    expect(diff.running.removed).toEqual([]);
    expect(diff.running.changed).toEqual([]);
  });

  it("pure additions (empty prev) → all rows in added", () => {
    const prev = snapWithRunning();
    const next = snapWithRunning(
      mkModule(mkManifest("com.test.a")),
      mkModule(mkManifest("com.test.b")),
    );
    const diff = diffSessionSnapshots(prev, next);
    expect(diff.running.added.map((r) => r.manifest.id)).toEqual([
      "com.test.a",
      "com.test.b",
    ]);
    expect(diff.running.removed).toEqual([]);
    expect(diff.running.changed).toEqual([]);
    expect(diff.summary.runningDelta).toBe(2);
  });

  it("pure removals (empty next) → all rows in removed", () => {
    const prev = snapWithRunning(
      mkModule(mkManifest("com.test.a")),
      mkModule(mkManifest("com.test.b")),
    );
    const next = snapWithRunning();
    const diff = diffSessionSnapshots(prev, next);
    expect(diff.running.added).toEqual([]);
    expect(diff.running.removed.map((r) => r.manifest.id)).toEqual([
      "com.test.a",
      "com.test.b",
    ]);
    expect(diff.summary.runningDelta).toBe(-2);
  });

  it("version bump on a running plugin → changed (not added/removed)", () => {
    const prev = snapWithRunning(
      mkModule(mkManifest("com.test.a", { version: "1.0.0" })),
    );
    const next = snapWithRunning(
      mkModule(mkManifest("com.test.a", { version: "1.1.0" })),
    );
    const diff = diffSessionSnapshots(prev, next);
    expect(diff.running.added).toEqual([]);
    expect(diff.running.removed).toEqual([]);
    expect(diff.running.changed).toHaveLength(1);
    expect(diff.running.changed[0]!.prev.manifest.version).toBe("1.0.0");
    expect(diff.running.changed[0]!.next.manifest.version).toBe("1.1.0");
    expect(diff.summary.runningDelta).toBe(0);
  });

  it("contribution-count change on a running plugin → changed", () => {
    const prev = snapWithRunning(
      mkModule(
        mkManifest("com.test.a", { contributions: { systems: ["s1"] } }),
      ),
    );
    const next = snapWithRunning(
      mkModule(
        mkManifest("com.test.a", {
          contributions: { systems: ["s1", "s2"] },
        }),
      ),
    );
    const diff = diffSessionSnapshots(prev, next);
    expect(diff.running.changed).toHaveLength(1);
    expect(diff.running.changed[0]!.prev.contributions.systems).toBe(1);
    expect(diff.running.changed[0]!.next.contributions.systems).toBe(2);
  });

  it("mixed adds/removes/changes in one diff", () => {
    const prev = snapWithRunning(
      mkModule(mkManifest("com.test.a", { version: "1.0.0" })),
      mkModule(mkManifest("com.test.b")),
      mkModule(mkManifest("com.test.removed")),
    );
    const next = snapWithRunning(
      mkModule(mkManifest("com.test.a", { version: "2.0.0" })),
      mkModule(mkManifest("com.test.b")),
      mkModule(mkManifest("com.test.added")),
    );
    const diff = diffSessionSnapshots(prev, next);
    expect(diff.running.added.map((r) => r.manifest.id)).toEqual([
      "com.test.added",
    ]);
    expect(diff.running.removed.map((r) => r.manifest.id)).toEqual([
      "com.test.removed",
    ]);
    expect(diff.running.changed).toHaveLength(1);
    expect(diff.running.changed[0]!.prev.manifest.id).toBe("com.test.a");
    expect(diff.summary.runningDelta).toBe(0);
  });

  it("running → unresolvable: appears in running.removed AND unresolvable.added AND reclassified", () => {
    const mod = mkModule(mkManifest("com.test.a"));
    const prev = snapWithRunning(mod);
    const next = snapshotCatalogResolution<Ctx>(
      { loaded: [mod], failed: [] },
      {
        ordered: [],
        unresolvable: [
          {
            module: mod,
            reason: { kind: "missing-dependency", dependencyId: "com.test.x" },
          },
        ],
      },
    );

    const diff = diffSessionSnapshots(prev, next);
    expect(diff.running.removed.map((r) => r.manifest.id)).toEqual([
      "com.test.a",
    ]);
    expect(diff.unresolvable.added.map((u) => u.manifest.id)).toEqual([
      "com.test.a",
    ]);
    expect(diff.reclassified).toEqual([
      { id: "com.test.a", prev: "running", next: "unresolvable" },
    ]);
    expect(diff.summary).toEqual({
      runningDelta: -1,
      unresolvableDelta: 1,
      failedDelta: 0,
    });
  });

  it("unresolvable → running: reclassified emitted in the other direction", () => {
    const mod = mkModule(mkManifest("com.test.a"));
    const prev = snapshotCatalogResolution<Ctx>(
      { loaded: [mod], failed: [] },
      {
        ordered: [],
        unresolvable: [
          {
            module: mod,
            reason: { kind: "cycle", cycleMemberIds: ["com.test.a"] },
          },
        ],
      },
    );
    const next = snapWithRunning(mod);

    const diff = diffSessionSnapshots(prev, next);
    expect(diff.running.added.map((r) => r.manifest.id)).toEqual([
      "com.test.a",
    ]);
    expect(diff.unresolvable.removed.map((u) => u.manifest.id)).toEqual([
      "com.test.a",
    ]);
    expect(diff.reclassified).toEqual([
      { id: "com.test.a", prev: "unresolvable", next: "running" },
    ]);
  });

  it("failed packages diff by baseDir, NOT by id (no manifest available)", () => {
    const errA = new Error("A failed");
    const errB = new Error("B failed");
    const failureA: CatalogLoadFailure = {
      baseDir: "/plugins/a",
      error: errA,
    };
    const failureB: CatalogLoadFailure = {
      baseDir: "/plugins/b",
      error: errB,
    };

    const prev = snapshotCatalogResolution<Ctx>(
      { loaded: [], failed: [failureA] },
      { ordered: [], unresolvable: [] },
    );
    const next = snapshotCatalogResolution<Ctx>(
      { loaded: [], failed: [failureB] },
      { ordered: [], unresolvable: [] },
    );

    const diff = diffSessionSnapshots(prev, next);
    expect(diff.failedPackages.added.map((f) => f.baseDir)).toEqual([
      "/plugins/b",
    ]);
    expect(diff.failedPackages.removed.map((f) => f.baseDir)).toEqual([
      "/plugins/a",
    ]);
    expect(diff.failedPackages.changed).toEqual([]);
    expect(diff.reclassified).toEqual([]);
  });

  it("failed package error message change → changed (same baseDir)", () => {
    const prev = snapshotCatalogResolution<Ctx>(
      {
        loaded: [],
        failed: [{ baseDir: "/plugins/a", error: new Error("boom v1") }],
      },
      { ordered: [], unresolvable: [] },
    );
    const next = snapshotCatalogResolution<Ctx>(
      {
        loaded: [],
        failed: [{ baseDir: "/plugins/a", error: new Error("boom v2") }],
      },
      { ordered: [], unresolvable: [] },
    );
    const diff = diffSessionSnapshots(prev, next);
    expect(diff.failedPackages.added).toEqual([]);
    expect(diff.failedPackages.removed).toEqual([]);
    expect(diff.failedPackages.changed).toHaveLength(1);
    expect(diff.failedPackages.changed[0]!.prev.errorMessage).toBe("boom v1");
    expect(diff.failedPackages.changed[0]!.next.errorMessage).toBe("boom v2");
  });

  it("two empty snapshots → fully empty diff", () => {
    const empty = snapWithRunning();
    const diff = diffSessionSnapshots(empty, empty);
    expect(diff.running).toEqual({ added: [], removed: [], changed: [] });
    expect(diff.unresolvable).toEqual({ added: [], removed: [], changed: [] });
    expect(diff.failedPackages).toEqual({
      added: [],
      removed: [],
      changed: [],
    });
    expect(diff.reclassified).toEqual([]);
    expect(diff.summary).toEqual({
      runningDelta: 0,
      unresolvableDelta: 0,
      failedDelta: 0,
    });
  });

  it("preserves next-snapshot ordering in added/changed; prev ordering in removed", () => {
    const prev = snapWithRunning(
      mkModule(mkManifest("com.test.x")),
      mkModule(mkManifest("com.test.y")),
    );
    const next = snapWithRunning(
      mkModule(mkManifest("com.test.b")),
      mkModule(mkManifest("com.test.a")),
    );
    const diff = diffSessionSnapshots(prev, next);
    expect(diff.running.added.map((r) => r.manifest.id)).toEqual([
      "com.test.b",
      "com.test.a",
    ]);
    expect(diff.running.removed.map((r) => r.manifest.id)).toEqual([
      "com.test.x",
      "com.test.y",
    ]);
  });

  it("does not mutate either input snapshot", () => {
    const prev = snapWithRunning(mkModule(mkManifest("com.test.a")));
    const next = snapWithRunning(mkModule(mkManifest("com.test.b")));
    const prevJson = JSON.stringify(prev);
    const nextJson = JSON.stringify(next);
    diffSessionSnapshots(prev, next);
    expect(JSON.stringify(prev)).toBe(prevJson);
    expect(JSON.stringify(next)).toBe(nextJson);
  });
});

// ────────────────────────────────────────────────────────────────────────
// formatSnapshotJson — deterministic JSON serializer
// ────────────────────────────────────────────────────────────────────────

describe("formatSnapshotJson", () => {
  it("serializes primitives exactly like JSON.stringify", () => {
    expect(formatSnapshotJson(null)).toBe("null");
    expect(formatSnapshotJson(true)).toBe("true");
    expect(formatSnapshotJson(false)).toBe("false");
    expect(formatSnapshotJson(0)).toBe("0");
    expect(formatSnapshotJson(42)).toBe("42");
    expect(formatSnapshotJson(-1.5)).toBe("-1.5");
    expect(formatSnapshotJson("hi")).toBe('"hi"');
    expect(formatSnapshotJson('with "quote"')).toBe('"with \\"quote\\""');
  });

  it("emits empty containers compactly regardless of indent", () => {
    expect(formatSnapshotJson([])).toBe("[]");
    expect(formatSnapshotJson({})).toBe("{}");
    expect(formatSnapshotJson([], { indent: 0 })).toBe("[]");
    expect(formatSnapshotJson({}, { indent: 0 })).toBe("{}");
  });

  it("default indent is 2 spaces with newlines", () => {
    const out = formatSnapshotJson({ a: 1, b: [2, 3] });
    expect(out).toBe(
      ["{", '  "a": 1,', '  "b": [', "    2,", "    3", "  ]", "}"].join("\n"),
    );
  });

  it("indent: 0 emits compact single-line output", () => {
    const out = formatSnapshotJson({ a: 1, b: [2, 3] }, { indent: 0 });
    expect(out).toBe('{"a":1,"b":[2,3]}');
  });

  it("sorts object keys deterministically (insertion order ignored)", () => {
    const a = formatSnapshotJson({ b: 1, a: 2, c: 3 }, { indent: 0 });
    const b = formatSnapshotJson({ c: 3, a: 2, b: 1 }, { indent: 0 });
    expect(a).toBe(b);
    expect(a).toBe('{"a":2,"b":1,"c":3}');
  });

  it("sorts keys at every nesting level", () => {
    const out = formatSnapshotJson(
      { z: { y: 1, x: 2 }, a: { c: 3, b: 4 } },
      { indent: 0 },
    );
    expect(out).toBe('{"a":{"b":4,"c":3},"z":{"x":2,"y":1}}');
  });

  it("preserves array order (arrays are positional)", () => {
    const out = formatSnapshotJson([3, 1, 2], { indent: 0 });
    expect(out).toBe("[3,1,2]");
  });

  it("round-trips: JSON.parse(format(value)) deep-equals the original", () => {
    const value = {
      summary: { runningCount: 2, failedCount: 0, unresolvableCount: 1 },
      running: [
        { id: "b", tags: ["x", "y"] },
        { id: "a", tags: [] },
      ],
      flags: { enabled: true, retries: 3 },
    };
    const text = formatSnapshotJson(value);
    expect(JSON.parse(text)).toEqual(value);
  });

  it("produces byte-stable output for a populated snapshot", () => {
    const snap = snapshotCatalogResolution<Ctx>(
      {
        loaded: [
          mkModule(mkManifest("com.test.b", { tags: ["beta"] })),
          mkModule(mkManifest("com.test.a", { tags: [] })),
        ],
        failed: [],
      },
      {
        ordered: [
          mkModule(mkManifest("com.test.b", { tags: ["beta"] })),
          mkModule(mkManifest("com.test.a", { tags: [] })),
        ],
        unresolvable: [],
      },
    );
    // Identical inputs → identical output, byte for byte.
    expect(formatSnapshotJson(snap)).toBe(formatSnapshotJson(snap));
    // Run twice via parse → format round-trip; output should be stable.
    const text1 = formatSnapshotJson(snap, { indent: 0 });
    const text2 = formatSnapshotJson(JSON.parse(text1), { indent: 0 });
    expect(text2).toBe(text1);
  });

  it("rejects non-finite numbers", () => {
    expect(() => formatSnapshotJson(NaN)).toThrow(/non-finite/);
    expect(() => formatSnapshotJson(Infinity)).toThrow(/non-finite/);
    expect(() => formatSnapshotJson(-Infinity)).toThrow(/non-finite/);
  });

  it("rejects undefined / function / symbol / bigint", () => {
    expect(() => formatSnapshotJson(undefined)).toThrow(
      /not JSON-representable/,
    );
    expect(() => formatSnapshotJson(() => 0)).toThrow(/not JSON-representable/);
    expect(() => formatSnapshotJson(Symbol("x"))).toThrow(
      /not JSON-representable/,
    );
    expect(() => formatSnapshotJson(BigInt(1))).toThrow(
      /not JSON-representable/,
    );
  });

  it("rejects Map / Set / Date / Error / RegExp by name (no silent mangling)", () => {
    expect(() => formatSnapshotJson(new Map())).toThrow(
      /Map is not JSON-friendly/,
    );
    expect(() => formatSnapshotJson(new Set())).toThrow(
      /Set is not JSON-friendly/,
    );
    expect(() => formatSnapshotJson(new Date())).toThrow(
      /Date is not JSON-friendly/,
    );
    expect(() => formatSnapshotJson(new Error("x"))).toThrow(
      /Error is not JSON-friendly/,
    );
    expect(() => formatSnapshotJson(/abc/)).toThrow(
      /RegExp is not JSON-friendly/,
    );
  });

  it("rejects circular references with a helpful error", () => {
    const cyclic: Record<string, unknown> = { a: 1 };
    cyclic.self = cyclic;
    expect(() => formatSnapshotJson(cyclic)).toThrow(/circular reference/);
  });

  it("formats a SessionSnapshotDiff cleanly (composition with diffSessionSnapshots)", () => {
    const prev = snapshotCatalogResolution<Ctx>(
      { loaded: [mkModule(mkManifest("com.test.a"))], failed: [] },
      {
        ordered: [mkModule(mkManifest("com.test.a"))],
        unresolvable: [],
      },
    );
    const next = snapshotCatalogResolution<Ctx>(
      {
        loaded: [
          mkModule(mkManifest("com.test.a")),
          mkModule(mkManifest("com.test.b")),
        ],
        failed: [],
      },
      {
        ordered: [
          mkModule(mkManifest("com.test.a")),
          mkModule(mkManifest("com.test.b")),
        ],
        unresolvable: [],
      },
    );
    const diff = diffSessionSnapshots(prev, next);
    const text = formatSnapshotJson(diff, { indent: 0 });
    // Round-trip parses cleanly + reflects the add.
    const parsed = JSON.parse(text) as {
      running: { added: { manifest: { id: string } }[] };
    };
    expect(parsed.running.added).toHaveLength(1);
    expect(parsed.running.added[0]!.manifest.id).toBe("com.test.b");
  });
});
