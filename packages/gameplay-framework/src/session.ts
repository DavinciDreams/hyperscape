/**
 * One-call plugin session — composes every substrate in
 * `@hyperforge/gameplay-framework` into a single async boot + graceful
 * shutdown pair.
 *
 * Hosts that want a lightweight "load everything from this directory,
 * start it, hand me a stop handle" API call `startPluginSessionFromCatalog`
 * and later `session.stop()`. The `records` / `failedPackages` /
 * `unresolvable` arrays expose the raw sub-results so a Plugin Browser can
 * render diagnostics without re-running the pipeline.
 *
 * This is a deliberate thin shell — one pipeline, no state beyond what the
 * underlying functions already produce. Callers that want hot-reload, live
 * re-resolution, or partial shutdown should use the discrete functions
 * directly.
 */

import {
  loadPluginCatalog,
  type CatalogLoadFailure,
  type LoadPluginCatalogOptions,
} from "./catalog.js";

import {
  startPluginsInOrder,
  stopPluginsInReverseOrder,
  type PluginContextFactory,
  type PluginInstanceRecord,
} from "./lifecycle.js";

import { resolvePluginLoadOrder, type UnresolvablePlugin } from "./resolver.js";

import type { LoadedPluginModule } from "./loader.js";

import type { PluginContextBase, PluginManifest } from "./index.js";

import type { UnresolvableReason } from "./resolver.js";

/**
 * Optional progress-reporting hook for a plugin session. Every callback is
 * optional; undefined methods are skipped. Callbacks are fire-and-forget —
 * exceptions thrown inside them are swallowed so a broken observer can
 * never break the lifecycle. Hosts should keep observer logic cheap and
 * side-effect-light (timers, metrics counters, log lines).
 *
 * Use cases:
 *   - Plugin Browser live transitions (package-by-package progress).
 *   - Metrics sinks (count loads / failures / unresolvables).
 *   - Log lines around lifecycle transitions.
 */
export interface PluginSessionObserver<TContext extends PluginContextBase> {
  /** A plugin package loaded + validated successfully (before resolve). */
  onPackageLoaded?(manifest: PluginManifest): void;
  /** A plugin package failed to load (plugin.json missing, schema reject, import threw, ...). */
  onPackageFailed?(baseDir: string, error: unknown): void;
  /** A loaded plugin couldn't be placed in the load order (missing dep / version mismatch / cycle). */
  onUnresolvable?(manifest: PluginManifest, reason: UnresolvableReason): void;
  /** `onLoad` + `onEnable` both completed for this plugin. */
  onPluginStarted?(record: PluginInstanceRecord<TContext>): void;
  /**
   * `session.stop()` finished unwinding this plugin (onDisable + scope drain
   * both ran, though either may have thrown — observe the aggregate error
   * from the `stop()` promise if you need it).
   */
  onPluginStopped?(record: PluginInstanceRecord<TContext>): void;
}

/**
 * Invoke a possibly-undefined observer callback. Swallows all thrown
 * exceptions — observers MUST NOT be able to break the lifecycle.
 *
 * No return value; observers are progress reports, not gates.
 */
function safeInvoke<TArgs extends readonly unknown[]>(
  fn: ((...args: TArgs) => void) | undefined,
  ...args: TArgs
): void {
  if (!fn) return;
  try {
    fn(...args);
  } catch {
    // Intentionally swallowed — observer errors cannot disrupt the pipeline.
  }
}

/**
 * Compose multiple observers into one.
 *
 * Hosts frequently want to stack several orthogonal observers onto a single
 * session (a Plugin Browser UI binder + a metrics counter + a log line
 * sink). Without this helper each caller writes the same fan-out
 * boilerplate: one wrapper with every hook, each hook iterating an array.
 *
 * Semantics:
 *   - Per-hook dispatch: each of the 5 observer hooks on the returned
 *     observer iterates the input `observers` in given order and calls
 *     that same hook on every observer that defines it.
 *   - Missing hooks on an individual observer are skipped (no error).
 *   - Each inner call is wrapped by `safeInvoke`, so one observer
 *     throwing does NOT prevent later observers from being notified.
 *   - An empty input array returns an observer with all hooks present
 *     but no-op — safe to always pass through even when the host has
 *     no observers configured.
 *
 * The returned object always has every optional hook present; hosts
 * iterating observer keys see a consistent shape.
 */
export function composeObservers<TContext extends PluginContextBase>(
  ...observers: ReadonlyArray<PluginSessionObserver<TContext>>
): PluginSessionObserver<TContext> {
  return {
    onPackageLoaded(manifest) {
      for (const o of observers) safeInvoke(o.onPackageLoaded, manifest);
    },
    onPackageFailed(baseDir, error) {
      for (const o of observers) safeInvoke(o.onPackageFailed, baseDir, error);
    },
    onUnresolvable(manifest, reason) {
      for (const o of observers) safeInvoke(o.onUnresolvable, manifest, reason);
    },
    onPluginStarted(record) {
      for (const o of observers) safeInvoke(o.onPluginStarted, record);
    },
    onPluginStopped(record) {
      for (const o of observers) safeInvoke(o.onPluginStopped, record);
    },
  };
}

/**
 * Snapshot + shutdown handle for a running plugin session.
 *
 * - `records`: plugins that successfully started. Reverse-topo iteration
 *   on `stop()` unwinds them.
 * - `failedPackages`: plugins whose packages couldn't even be loaded
 *   (plugin.json missing / invalid / entry import failed / hostApi
 *   incompatible). Render in Plugin Browser. These never entered the
 *   resolver.
 * - `unresolvable`: plugins that loaded but the resolver couldn't order
 *   (missing required dep / dep version mismatch / cycle member).
 *   Render in Plugin Browser. These never entered the lifecycle driver.
 */
export interface PluginSession<TContext extends PluginContextBase> {
  readonly records: ReadonlyArray<PluginInstanceRecord<TContext>>;
  readonly failedPackages: ReadonlyArray<CatalogLoadFailure>;
  readonly unresolvable: ReadonlyArray<UnresolvablePlugin<TContext>>;
  /**
   * Unwind the session. Calls `stopPluginsInReverseOrder(records)`.
   * Inherits lifecycle-driver error semantics: scope drain always fires,
   * collected errors wrap in `PluginLifecycleStopError` on 2+ failures.
   */
  stop(): Promise<void>;
}

/**
 * Options for `startPluginSessionFromCatalog`. Extends the catalog loader's
 * options (which themselves extend the package loader's options) so hosts
 * configure `hostApiRange` / `manifestFilename` / `factoryExport` / test
 * seams once and they thread through the whole pipeline. Adds
 * `contextFactory` for the lifecycle step.
 */
export interface PluginSessionOptions<
  TContext extends PluginContextBase,
> extends LoadPluginCatalogOptions {
  contextFactory: PluginContextFactory<TContext>;
  /**
   * Optional progress observer. Hosts plugging into Plugin Browser UI /
   * metrics / logs implement this to watch lifecycle transitions. Every
   * method is optional and fire-and-forget (throws are swallowed).
   */
  observer?: PluginSessionObserver<TContext>;
}

/**
 * Run the canonical plugin boot pipeline end-to-end:
 *   1. `loadPluginCatalog(pluginsDir, opts)` → { loaded, failed }
 *   2. `resolvePluginLoadOrder(loaded)`       → { ordered, unresolvable }
 *   3. `startPluginsInOrder(ordered, ctxFactory)` → records
 *
 * Returns a {@link PluginSession} with a `stop()` handle that unwinds the
 * `records`. `failedPackages` and `unresolvable` are propagated to the
 * session for diagnostics — they are NOT treated as errors (individual
 * plugin failures shouldn't block the whole session).
 */
export async function startPluginSessionFromCatalog<
  TContext extends PluginContextBase,
>(
  pluginsDir: string,
  opts: PluginSessionOptions<TContext>,
): Promise<PluginSession<TContext>> {
  // Catalog-only options (drop contextFactory + observer before forwarding).
  const { contextFactory, observer, ...catalogOpts } = opts;

  const { loaded, failed: failedPackages } = await loadPluginCatalog<TContext>(
    pluginsDir,
    catalogOpts,
  );

  // Emit package-level progress before ordering.
  for (const mod of loaded) {
    safeInvoke(observer?.onPackageLoaded, mod.manifest);
  }
  for (const failure of failedPackages) {
    safeInvoke(observer?.onPackageFailed, failure.baseDir, failure.error);
  }

  const { ordered, unresolvable } = resolvePluginLoadOrder<TContext>(loaded);

  for (const entry of unresolvable) {
    safeInvoke(observer?.onUnresolvable, entry.module.manifest, entry.reason);
  }

  const records = await startPluginsInOrder<TContext>(ordered, contextFactory);

  // Each record reached running state — emit after the full start walk so
  // observers see completion, not partial progress.
  for (const record of records) {
    safeInvoke(observer?.onPluginStarted, record);
  }

  return {
    records,
    failedPackages,
    unresolvable,
    async stop() {
      // Capture records eagerly so observer notifications reflect the set
      // of plugins that were alive when stop started. stopPluginsInReverse
      // Order may throw; observer fires regardless (finally).
      try {
        await stopPluginsInReverseOrder(records);
      } finally {
        // Reverse order matches the tear-down walk.
        for (let i = records.length - 1; i >= 0; i--) {
          safeInvoke(observer?.onPluginStopped, records[i]!);
        }
      }
    },
  };
}

// ────────────────────────────────────────────────────────────────────────
// In-memory session — the filesystem-free companion to
// `startPluginSessionFromCatalog`.
//
// Plugin authors unit-testing their own plugins don't want to write a
// `plugin.json` + `dist/` to a tmpdir and stub a `directoryLister` /
// `importer` / `manifestLoader` just to assert `onLoad`/`onEnable`/
// `onDisable` get called. They already HAVE their factory + manifest
// in TypeScript — feed them straight in.
//
// Semantics match `startPluginSessionFromCatalog` exactly:
//   - Resolver runs (honors `dependencies` + `loadAfter` + catches
//     cycles / missing deps / version mismatches in `unresolvable[]`)
//   - Lifecycle driver runs (topo start, reverse-topo stop, scope
//     drain always fires on stop)
//   - Observer fires with the same hooks (minus onPackageFailed —
//     there IS no package-load step in this path)
//
// `failedPackages` is always `[]`: by the time a caller hands us a
// `LoadedPluginModule[]` there's no package-load layer to fail.
// ────────────────────────────────────────────────────────────────────────

/**
 * Options for `startPluginSessionFromModules`. Mirrors
 * {@link PluginSessionOptions} minus the catalog-I/O fields
 * (`directoryLister` / `manifestExistsCheck` / `hostApiRange` /
 * `manifestFilename` / `factoryExport` / `importer` / `manifestLoader`)
 * — none of those apply when the caller supplies modules directly.
 */
export interface PluginSessionFromModulesOptions<
  TContext extends PluginContextBase,
> {
  contextFactory: PluginContextFactory<TContext>;
  /** Progress observer — same shape as the catalog session's observer. */
  observer?: PluginSessionObserver<TContext>;
}

/**
 * Run the plugin boot pipeline against an explicit list of in-memory
 * modules. Skips catalog + package loading entirely; goes straight to
 * resolver → lifecycle.
 *
 * Intended use cases:
 *   - Unit tests for individual plugins (feed in one module, assert
 *     `onEnable` ran).
 *   - Embedded hosts that already know their plugin set at compile
 *     time (built-in plugins compiled into the binary).
 *   - Hot-reload paths where the host has already re-imported modules
 *     and wants to restart the session with the new set.
 */
export async function startPluginSessionFromModules<
  TContext extends PluginContextBase,
>(
  modules: ReadonlyArray<LoadedPluginModule<TContext>>,
  opts: PluginSessionFromModulesOptions<TContext>,
): Promise<PluginSession<TContext>> {
  const { contextFactory, observer } = opts;

  // Emit loaded-package progress up front so observer sequencing
  // matches the catalog session (loaded → unresolvable → started →
  // stopped). No `onPackageFailed` analogue — by definition the caller
  // passed us modules that already loaded.
  for (const mod of modules) {
    safeInvoke(observer?.onPackageLoaded, mod.manifest);
  }

  const { ordered, unresolvable } = resolvePluginLoadOrder<TContext>(modules);

  for (const entry of unresolvable) {
    safeInvoke(observer?.onUnresolvable, entry.module.manifest, entry.reason);
  }

  const records = await startPluginsInOrder<TContext>(ordered, contextFactory);

  for (const record of records) {
    safeInvoke(observer?.onPluginStarted, record);
  }

  return {
    records,
    failedPackages: [],
    unresolvable,
    async stop() {
      try {
        await stopPluginsInReverseOrder(records);
      } finally {
        for (let i = records.length - 1; i >= 0; i--) {
          safeInvoke(observer?.onPluginStopped, records[i]!);
        }
      }
    },
  };
}
