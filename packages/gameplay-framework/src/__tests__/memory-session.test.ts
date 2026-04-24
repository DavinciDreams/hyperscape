/**
 * Tests for `startPluginSessionFromModules` — the filesystem-free
 * companion to `startPluginSessionFromCatalog`.
 *
 * The in-memory path skips catalog + package loading, so coverage
 * focuses on the surface that remains: resolver + lifecycle + observer
 * sequencing, and the invariant `failedPackages === []` (no package
 * layer exists to fail).
 *
 * Coverage:
 *   - Empty modules → empty session, stop() no-op
 *   - Single module → ctx factory invoked, onLoad+onEnable run, stop
 *     unwinds
 *   - Dep edge → resolver orders correctly
 *   - Missing required dep → entry lands on `unresolvable[]` (not on
 *     failedPackages)
 *   - Observer fires onPackageLoaded / onUnresolvable / onPluginStarted
 *     / onPluginStopped (no onPackageFailed — the path can't produce one)
 */

import { describe, expect, it } from "vitest";

import {
  PluginManifestSchema,
  startPluginSessionFromModules,
  type HyperforgePlugin,
  type LoadedPluginModule,
  type PluginContextBase,
  type PluginFactory,
  type PluginManifest,
  type PluginSessionObserver,
} from "../index.js";

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

/**
 * Build a `LoadedPluginModule` whose factory tracks lifecycle calls
 * into the shared `state.active` set on the ctx. Onload is a no-op;
 * onEnable adds the plugin id; onDisable removes it. This mirrors the
 * existing hermetic plugin in `session.test.ts` so cross-test
 * assertions look the same.
 */
function mkModule(
  id: string,
  opts?: Parameters<typeof mkManifest>[1],
): LoadedPluginModule<TestContext> {
  const factory: PluginFactory<
    TestContext
  > = (): HyperforgePlugin<TestContext> => ({
    async onEnable(ctx) {
      ctx.state.active.add(ctx.pluginId);
    },
    async onDisable(ctx) {
      ctx.state.active.delete(ctx.pluginId);
    },
  });
  return { manifest: mkManifest(id, opts), factory };
}

function mkContextFactory(state: { active: Set<string> }) {
  return ({
    pluginId,
    scope,
  }: {
    pluginId: string;
    scope: PluginContextBase["scope"];
  }): TestContext => ({
    pluginId,
    scope,
    state,
  });
}

describe("startPluginSessionFromModules", () => {
  it("empty modules yields empty session with no-op stop()", async () => {
    const state = { active: new Set<string>() };
    const session = await startPluginSessionFromModules<TestContext>([], {
      contextFactory: mkContextFactory(state),
    });

    expect(session.records).toEqual([]);
    expect(session.failedPackages).toEqual([]);
    expect(session.unresolvable).toEqual([]);

    await session.stop(); // does not throw
    expect(state.active.size).toBe(0);
  });

  it("boots a single module end-to-end and unwinds on stop()", async () => {
    const state = { active: new Set<string>() };
    const session = await startPluginSessionFromModules<TestContext>(
      [mkModule("com.hyperforge.alpha")],
      { contextFactory: mkContextFactory(state) },
    );

    expect(session.records).toHaveLength(1);
    expect(session.records[0]!.manifest.id).toBe("com.hyperforge.alpha");
    expect(state.active.has("com.hyperforge.alpha")).toBe(true);

    await session.stop();
    expect(state.active.has("com.hyperforge.alpha")).toBe(false);
  });

  it("resolves dependency order before start", async () => {
    const state = { active: new Set<string>() };
    // Input order: beta depends on alpha, but we pass beta FIRST so we
    // can be sure the resolver is actually running (not the input
    // ordering).
    const session = await startPluginSessionFromModules<TestContext>(
      [
        mkModule("com.hyperforge.beta", {
          dependencies: [
            { id: "com.hyperforge.alpha", versionRange: "^1.0.0" },
          ],
        }),
        mkModule("com.hyperforge.alpha"),
      ],
      { contextFactory: mkContextFactory(state) },
    );

    expect(session.records.map((r) => r.manifest.id)).toEqual([
      "com.hyperforge.alpha",
      "com.hyperforge.beta",
    ]);

    await session.stop();
  });

  it("surfaces missing-dep plugins on unresolvable[], not failedPackages", async () => {
    const state = { active: new Set<string>() };
    const session = await startPluginSessionFromModules<TestContext>(
      [
        mkModule("com.hyperforge.beta", {
          dependencies: [
            { id: "com.hyperforge.missing", versionRange: "^1.0.0" },
          ],
        }),
      ],
      { contextFactory: mkContextFactory(state) },
    );

    expect(session.records).toEqual([]);
    expect(session.failedPackages).toEqual([]);
    expect(session.unresolvable).toHaveLength(1);
    expect(session.unresolvable[0]!.module.manifest.id).toBe(
      "com.hyperforge.beta",
    );

    await session.stop();
  });

  it("observer fires in the correct order, with no onPackageFailed", async () => {
    const state = { active: new Set<string>() };
    const events: string[] = [];
    const observer: PluginSessionObserver<TestContext> = {
      onPackageLoaded: (m) => events.push(`loaded:${m.id}`),
      onPackageFailed: (dir) => events.push(`pkgFailed:${dir}`),
      onUnresolvable: (m, reason) =>
        events.push(`unres:${m.id}:${reason.kind}`),
      onPluginStarted: (r) => events.push(`started:${r.manifest.id}`),
      onPluginStopped: (r) => events.push(`stopped:${r.manifest.id}`),
    };

    const session = await startPluginSessionFromModules<TestContext>(
      [
        mkModule("com.hyperforge.alpha"),
        mkModule("com.hyperforge.orphan", {
          dependencies: [
            { id: "com.hyperforge.missing", versionRange: "^1.0.0" },
          ],
        }),
      ],
      { contextFactory: mkContextFactory(state), observer },
    );

    await session.stop();

    expect(events).toEqual([
      "loaded:com.hyperforge.alpha",
      "loaded:com.hyperforge.orphan",
      "unres:com.hyperforge.orphan:missing-dependency",
      "started:com.hyperforge.alpha",
      "stopped:com.hyperforge.alpha",
    ]);
  });
});
