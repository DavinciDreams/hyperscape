/**
 * Tests for `startPluginSessionFromCatalog` — the one-call orchestrator
 * that composes catalog + resolver + lifecycle into a single boot pair.
 *
 * Coverage:
 *   - Empty dir → session with empty arrays, stop() is a no-op
 *   - Single valid plugin → records populated, stop unwinds cleanly
 *   - Two plugins with a dep edge → resolver orders correctly before start
 *   - Failed-package (e.g. schema-invalid plugin.json) surfaces on session.failedPackages
 *   - Unresolvable plugin (missing required dep) surfaces on session.unresolvable
 *   - contextFactory threads through to per-plugin ctx creation
 *   - stop() is inherited from stopPluginsInReverseOrder (best-effort)
 */

import { describe, expect, it } from "vitest";

import {
  PluginManifestSchema,
  startPluginSessionFromCatalog,
  type HyperforgePlugin,
  type PluginContextBase,
  type PluginFactory,
  type PluginManifest,
} from "../index.js";

// ────────────────────────────────────────────────────────────────────────
// Test plumbing — fully injected, no real filesystem.
// ────────────────────────────────────────────────────────────────────────

interface TestContext extends PluginContextBase {
  readonly state: { readonly active: Set<string> };
}

function mkManifest(
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
): PluginManifest {
  return PluginManifestSchema.parse({
    id,
    name: id,
    version: opts.version ?? "1.0.0",
    entry: "./dist/index.js",
    author: { name: "test" },
    hyperforgeApi: "0.1.0",
    dependencies: opts.dependencies ?? [],
    loadAfter: opts.loadAfter ?? [],
  });
}

/** Hermetic directory lister + exists-check + manifest loader + importer. */
function makeHermeticSeams(
  packages: Array<{
    dir: string;
    manifest: PluginManifest | "invalid";
    plugin?: HyperforgePlugin<TestContext>;
  }>,
) {
  const directoryLister = async () => packages.map((p) => p.dir);

  const manifestExistsCheck = async () => true;

  const manifestLoader = async (manifestPath: string) => {
    // Find which package's manifest this path refers to via last segment.
    const hit = packages.find((p) => manifestPath.includes(p.dir));
    if (!hit) {
      throw new Error(`unknown manifest path: ${manifestPath}`);
    }
    if (hit.manifest === "invalid") {
      // Return a JSON-valid but schema-invalid shape so the package loader
      // produces a PluginManifestValidationError.
      return { id: "not a valid reverse-domain id", version: "bad" };
    }
    return hit.manifest;
  };

  const importer = async (specifier: string) => {
    // Map the entry path back to a package via the directory name segment.
    const hit = packages.find((p) => specifier.includes(p.dir));
    if (!hit || !hit.plugin) {
      throw new Error(`unknown import specifier: ${specifier}`);
    }
    const factory: PluginFactory<TestContext> = () => hit.plugin!;
    return { default: factory };
  };

  return { directoryLister, manifestExistsCheck, manifestLoader, importer };
}

function mkContextFactory(state: { active: Set<string> }) {
  return ({
    pluginId,
    scope,
  }: {
    pluginId: string;
    scope: TestContext["scope"];
  }): TestContext => ({
    pluginId,
    scope,
    state,
  });
}

// ────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────

describe("startPluginSessionFromCatalog — empty dir", () => {
  it("returns a session with empty arrays and a no-op stop", async () => {
    const state = { active: new Set<string>() };
    const session = await startPluginSessionFromCatalog<TestContext>(
      "/fake/plugins",
      {
        directoryLister: async () => [] as string[],
        manifestExistsCheck: async () => true,
        contextFactory: mkContextFactory(state),
      },
    );
    expect(session.records).toEqual([]);
    expect(session.failedPackages).toEqual([]);
    expect(session.unresolvable).toEqual([]);
    await expect(session.stop()).resolves.toBeUndefined();
  });
});

describe("startPluginSessionFromCatalog — single plugin", () => {
  it("loads, orders, starts, and stop() unwinds it", async () => {
    const state = { active: new Set<string>() };
    const plugin: HyperforgePlugin<TestContext> = {
      async onEnable(ctx) {
        ctx.state.active.add(ctx.pluginId);
        ctx.scope.register(() => {
          ctx.state.active.delete(ctx.pluginId);
        });
      },
    };

    const seams = makeHermeticSeams([
      { dir: "com-example-a", manifest: mkManifest("com.example.a"), plugin },
    ]);

    const session = await startPluginSessionFromCatalog<TestContext>(
      "/fake/plugins",
      {
        ...seams,
        contextFactory: mkContextFactory(state),
      },
    );

    expect(session.records).toHaveLength(1);
    expect(session.records[0]!.manifest.id).toBe("com.example.a");
    expect(session.failedPackages).toEqual([]);
    expect(session.unresolvable).toEqual([]);
    expect([...state.active]).toEqual(["com.example.a"]);

    await session.stop();
    expect([...state.active]).toEqual([]);
  });
});

describe("startPluginSessionFromCatalog — dep ordering", () => {
  it("resolves dep graph so base starts before dependent", async () => {
    const state = { active: new Set<string>() };
    const trace: string[] = [];

    const mkPlugin = (id: string): HyperforgePlugin<TestContext> => ({
      async onEnable(ctx) {
        trace.push(ctx.pluginId);
        ctx.state.active.add(ctx.pluginId);
      },
    });

    const seams = makeHermeticSeams([
      // Input order is dependent-first — resolver must swap them.
      {
        dir: "com-example-dependent",
        manifest: mkManifest("com.example.dependent", {
          dependencies: [{ id: "com.example.base", versionRange: "^1.0.0" }],
        }),
        plugin: mkPlugin("dependent"),
      },
      {
        dir: "com-example-base",
        manifest: mkManifest("com.example.base"),
        plugin: mkPlugin("base"),
      },
    ]);

    const session = await startPluginSessionFromCatalog<TestContext>(
      "/fake/plugins",
      { ...seams, contextFactory: mkContextFactory(state) },
    );

    expect(session.records).toHaveLength(2);
    expect(trace).toEqual(["com.example.base", "com.example.dependent"]);
    await session.stop();
  });
});

describe("startPluginSessionFromCatalog — failure propagation", () => {
  it("surfaces schema-invalid packages on failedPackages (not records)", async () => {
    const state = { active: new Set<string>() };
    const goodPlugin: HyperforgePlugin<TestContext> = {};

    const seams = makeHermeticSeams([
      {
        dir: "com-example-valid",
        manifest: mkManifest("com.example.valid"),
        plugin: goodPlugin,
      },
      { dir: "com-example-broken", manifest: "invalid" },
    ]);

    const session = await startPluginSessionFromCatalog<TestContext>(
      "/fake/plugins",
      { ...seams, contextFactory: mkContextFactory(state) },
    );

    expect(session.records).toHaveLength(1);
    expect(session.records[0]!.manifest.id).toBe("com.example.valid");
    expect(session.failedPackages).toHaveLength(1);
    expect(session.failedPackages[0]!.baseDir).toContain("com-example-broken");
    expect(session.unresolvable).toEqual([]);

    await session.stop();
  });

  it("surfaces missing-dependency plugins on unresolvable (not records)", async () => {
    const state = { active: new Set<string>() };
    const orphan: HyperforgePlugin<TestContext> = {};

    const seams = makeHermeticSeams([
      {
        dir: "com-example-orphan",
        manifest: mkManifest("com.example.orphan", {
          dependencies: [
            { id: "com.example.missing-dep", versionRange: "^1.0.0" },
          ],
        }),
        plugin: orphan,
      },
    ]);

    const session = await startPluginSessionFromCatalog<TestContext>(
      "/fake/plugins",
      { ...seams, contextFactory: mkContextFactory(state) },
    );

    expect(session.records).toEqual([]);
    expect(session.failedPackages).toEqual([]);
    expect(session.unresolvable).toHaveLength(1);
    expect(session.unresolvable[0]!.module.manifest.id).toBe(
      "com.example.orphan",
    );
    expect(session.unresolvable[0]!.reason.kind).toBe("missing-dependency");

    await session.stop(); // no records → no-op
  });
});

describe("startPluginSessionFromCatalog — observer hook", () => {
  it("fires onPackageLoaded + onPluginStarted for a successful plugin", async () => {
    const state = { active: new Set<string>() };
    const plugin: HyperforgePlugin<TestContext> = {};
    const seams = makeHermeticSeams([
      { dir: "com-example-a", manifest: mkManifest("com.example.a"), plugin },
    ]);

    const events: string[] = [];
    const session = await startPluginSessionFromCatalog<TestContext>(
      "/fake/plugins",
      {
        ...seams,
        contextFactory: mkContextFactory(state),
        observer: {
          onPackageLoaded(manifest) {
            events.push(`loaded:${manifest.id}`);
          },
          onPluginStarted(record) {
            events.push(`started:${record.manifest.id}`);
          },
          onPluginStopped(record) {
            events.push(`stopped:${record.manifest.id}`);
          },
        },
      },
    );

    expect(events).toEqual(["loaded:com.example.a", "started:com.example.a"]);

    await session.stop();
    expect(events).toEqual([
      "loaded:com.example.a",
      "started:com.example.a",
      "stopped:com.example.a",
    ]);
  });

  it("fires onPackageFailed for schema-invalid packages", async () => {
    const state = { active: new Set<string>() };
    const seams = makeHermeticSeams([
      { dir: "com-example-broken", manifest: "invalid" },
    ]);

    const failures: string[] = [];
    await startPluginSessionFromCatalog<TestContext>("/fake/plugins", {
      ...seams,
      contextFactory: mkContextFactory(state),
      observer: {
        onPackageFailed(baseDir) {
          failures.push(baseDir);
        },
      },
    });

    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("com-example-broken");
  });

  it("fires onUnresolvable with the typed reason", async () => {
    const state = { active: new Set<string>() };
    const orphan: HyperforgePlugin<TestContext> = {};
    const seams = makeHermeticSeams([
      {
        dir: "com-example-orphan",
        manifest: mkManifest("com.example.orphan", {
          dependencies: [{ id: "com.example.missing", versionRange: "^1.0.0" }],
        }),
        plugin: orphan,
      },
    ]);

    const calls: Array<{ id: string; kind: string }> = [];
    await startPluginSessionFromCatalog<TestContext>("/fake/plugins", {
      ...seams,
      contextFactory: mkContextFactory(state),
      observer: {
        onUnresolvable(manifest, reason) {
          calls.push({ id: manifest.id, kind: reason.kind });
        },
      },
    });

    expect(calls).toEqual([
      { id: "com.example.orphan", kind: "missing-dependency" },
    ]);
  });

  it("swallows observer exceptions — broken observer cannot break the lifecycle", async () => {
    const state = { active: new Set<string>() };
    const plugin: HyperforgePlugin<TestContext> = {};
    const seams = makeHermeticSeams([
      { dir: "com-example-a", manifest: mkManifest("com.example.a"), plugin },
    ]);

    // Every callback throws — session should still complete normally.
    const session = await startPluginSessionFromCatalog<TestContext>(
      "/fake/plugins",
      {
        ...seams,
        contextFactory: mkContextFactory(state),
        observer: {
          onPackageLoaded() {
            throw new Error("boom-loaded");
          },
          onPluginStarted() {
            throw new Error("boom-started");
          },
          onPluginStopped() {
            throw new Error("boom-stopped");
          },
        },
      },
    );
    expect(session.records).toHaveLength(1);
    await expect(session.stop()).resolves.toBeUndefined();
  });

  it("observer is optional — omitting it works normally", async () => {
    const state = { active: new Set<string>() };
    const plugin: HyperforgePlugin<TestContext> = {};
    const seams = makeHermeticSeams([
      { dir: "com-example-a", manifest: mkManifest("com.example.a"), plugin },
    ]);

    const session = await startPluginSessionFromCatalog<TestContext>(
      "/fake/plugins",
      { ...seams, contextFactory: mkContextFactory(state) },
    );
    expect(session.records).toHaveLength(1);
    await session.stop();
  });
});

describe("startPluginSessionFromCatalog — contextFactory threading", () => {
  it("delivers per-plugin pluginId + scope to the factory", async () => {
    const state = { active: new Set<string>() };
    const captured: Array<{ pluginId: string; hasScope: boolean }> = [];
    const plugin: HyperforgePlugin<TestContext> = {};

    const seams = makeHermeticSeams([
      { dir: "com-example-a", manifest: mkManifest("com.example.a"), plugin },
      { dir: "com-example-b", manifest: mkManifest("com.example.b"), plugin },
    ]);

    await startPluginSessionFromCatalog<TestContext>("/fake/plugins", {
      ...seams,
      contextFactory({ pluginId, scope }) {
        captured.push({
          pluginId,
          hasScope: typeof scope.dispose === "function",
        });
        return { pluginId, scope, state };
      },
    });

    expect(captured).toHaveLength(2);
    const ids = captured.map((c) => c.pluginId).sort();
    expect(ids).toEqual(["com.example.a", "com.example.b"]);
    expect(captured.every((c) => c.hasScope)).toBe(true);
  });
});
