/**
 * @hyperforge/gameplay-framework
 *
 * Stable public-API facade for Hyperforge plugin authors. This package is
 * deliberately small: it gives plugin authors a single import surface —
 * manifest schemas + plugin interface types — without dragging in the full
 * `@hyperforge/shared` engine package.
 *
 * Scope today (v0.1.0):
 *   - Re-exports plugin-related manifest types & schemas from
 *     `@hyperforge/manifest-schema` so plugin authors can validate their
 *     `plugin.json` files and obtain `PluginManifest` typings.
 *   - Declares the plugin lifecycle author surface (`HyperforgePlugin`,
 *     `PluginContextBase`, `PluginFactory`) as type-only re-declarations.
 *     These mirror the runtime types in `@hyperforge/shared`'s plugin
 *     substrate; keeping them local here means the author package has
 *     **zero runtime dependency** on shared.
 *
 * Scope for future commits (tracked in project_phase_i_plugin_architecture.md):
 *   - Re-export the runtime lifecycle (`PluginHost`, `PluginLoader`,
 *     `PluginCatalog`, `PluginContextScope`) once shared exposes a
 *     `./plugin` subpath export.
 *   - Semver-range resolution (`satisfiesPluginVersionRange`).
 *   - Dynamic module loader (import plugin factories from disk / URLs).
 *   - Optional sandbox hooks and telemetry bridge.
 */

// ────────────────────────────────────────────────────────────────────────
// Manifest re-exports — direct passthrough of the canonical types/schemas
// so plugin authors validate `plugin.json` against the same Zod schema
// the engine uses.
// ────────────────────────────────────────────────────────────────────────

export {
  PluginManifestSchema,
  type PluginManifest,
} from "@hyperforge/manifest-schema";

// ────────────────────────────────────────────────────────────────────────
// Plugin lifecycle author surface — local type-only re-declarations that
// mirror the runtime types in `@hyperforge/shared`'s plugin substrate.
//
// Why redeclare instead of re-export?
//   - Keeps this package runtime-free (zero dep on shared).
//   - Plugin source code typechecks against these interfaces; at
//     integration time the runtime loader in shared accepts anything
//     structurally compatible.
//   - When shared exposes a `./plugin` subpath export, we can swap
//     these for true re-exports without breaking author code.
// ────────────────────────────────────────────────────────────────────────

/**
 * Every host-managed context exposes its plugin id + scope. Authors
 * extend this interface with their own handles (world refs, registries,
 * widgets, etc.).
 *
 * The `scope` is a caller-controlled disposer registry — authors attach
 * cleanup callbacks during `onLoad`/`onEnable` and the host drains them
 * LIFO on disable.
 */
export interface PluginContextBase {
  readonly pluginId: string;
  readonly scope: PluginContextScopeHandle;
}

/**
 * Minimal handle for the per-plugin scope object. The runtime in
 * `@hyperforge/shared` provides the concrete implementation
 * (`PluginContextScope`); plugins only need `register` + `dispose` +
 * `reopen` at the type level.
 *
 * Disposers run LIFO. Errors from individual disposers are collected;
 * first non-undefined error is rethrown after the full drain.
 */
export interface PluginContextScopeHandle {
  readonly pluginId: string;
  register(disposer: () => void | Promise<void>): void;
  dispose(): Promise<void>;
  reopen(): void;
}

/**
 * A loaded plugin instance. All lifecycle hooks are optional so
 * data-only plugins (pure manifest contributions) don't need to
 * implement anything.
 *
 * Generic `TContext` lets hosts thread a typed per-plugin context
 * (world refs, registry handles, scope) into each hook. Default is
 * `void` — hooks receive no argument, matching plain no-context usage.
 */
export interface HyperforgePlugin<TContext = void> {
  onLoad?(ctx: TContext): void | Promise<void>;
  onEnable?(ctx: TContext): void | Promise<void>;
  onDisable?(ctx: TContext): void | Promise<void>;
}

/** Factory that produces a plugin instance when invoked. */
export type PluginFactory<TContext = void> = () => HyperforgePlugin<TContext>;

// ────────────────────────────────────────────────────────────────────────
// Dynamic module loader — resolves `manifest.entry` against an absolute
// `baseDir` and pulls a `PluginFactory` out of the entry module.
// ────────────────────────────────────────────────────────────────────────

export {
  loadPluginFromManifest,
  PluginFactoryResolutionError,
  PluginModuleImportError,
  type LoadedPluginModule,
  type LoadPluginOptions,
} from "./loader.js";

// ────────────────────────────────────────────────────────────────────────
// SemVer range resolver — host-side gate for plugin dependency checks.
// Supports exact, caret (`^`), tilde (`~`), comparators, wildcard (`*`),
// AND (space-separated), OR (`||`). Pre-release tags are stripped.
// ────────────────────────────────────────────────────────────────────────

export {
  satisfiesPluginVersionRange,
  InvalidVersionError,
  InvalidVersionRangeError,
} from "./semver.js";

// ────────────────────────────────────────────────────────────────────────
// One-call plugin package loader — reads plugin.json, validates,
// optionally gates on host API range, delegates to loadPluginFromManifest.
// ────────────────────────────────────────────────────────────────────────

export {
  loadPluginPackage,
  PluginManifestReadError,
  PluginManifestValidationError,
  PluginApiIncompatibleError,
  type LoadPluginPackageOptions,
} from "./package.js";

// ────────────────────────────────────────────────────────────────────────
// Plugin catalog — iterate a directory of plugin packages, load each,
// aggregate { loaded, failed }. Never throws on per-package failure.
// ────────────────────────────────────────────────────────────────────────

export {
  loadPluginCatalog,
  PluginCatalogReadError,
  type LoadPluginCatalogOptions,
  type PluginCatalogResult,
  type CatalogLoadFailure,
} from "./catalog.js";

// ────────────────────────────────────────────────────────────────────────
// Load-order resolver — topo-sorts plugins honoring `dependencies[]` +
// `loadAfter[]`, separates cycles / missing deps / version mismatches
// into an `unresolvable[]` aggregate. Pure logic, no I/O.
// ────────────────────────────────────────────────────────────────────────

export {
  resolvePluginLoadOrder,
  type PluginLoadOrder,
  type UnresolvablePlugin,
  type UnresolvableReason,
} from "./resolver.js";

// ────────────────────────────────────────────────────────────────────────
// PluginContextScope factory — canonical LIFO disposer registry
// implementing PluginContextScopeHandle. Removes the last reason a
// lightweight host would need to reach into @hyperforge/shared.
// ────────────────────────────────────────────────────────────────────────

export {
  createPluginContextScope,
  PluginScopeDrainError,
  PluginScopeUseAfterDisposeError,
} from "./scope.js";

// ────────────────────────────────────────────────────────────────────────
// Plugin lifecycle driver — composes scope + loader + resolver output to
// run `onLoad` → `onEnable` in topo order and unwind in reverse.
// ────────────────────────────────────────────────────────────────────────

export {
  startPluginsInOrder,
  stopPluginsInReverseOrder,
  PluginLifecycleStopError,
  type PluginInstanceRecord,
  type PluginContextFactory,
} from "./lifecycle.js";

// ────────────────────────────────────────────────────────────────────────
// One-call plugin session — composes catalog + resolver + lifecycle into
// a single async boot + graceful shutdown pair.
// ────────────────────────────────────────────────────────────────────────

export {
  startPluginSessionFromCatalog,
  startPluginSessionFromModules,
  composeObservers,
  type PluginSession,
  type PluginSessionOptions,
  type PluginSessionFromModulesOptions,
  type PluginSessionObserver,
} from "./session.js";

// ────────────────────────────────────────────────────────────────────────
// Manifest validator — read + schema-check `plugin.json` WITHOUT
// loading the entry module. Basis for CI checks, editor pre-save
// gates, and a future `hyperforge-plugin validate` CLI binary.
// ────────────────────────────────────────────────────────────────────────

export {
  validatePluginDirectory,
  validatePluginManifestJson,
  type ValidationResult,
  type ValidatePluginOptions,
  type ManifestValidationResult,
  type ValidateManifestOptions,
} from "./validate.js";

// ────────────────────────────────────────────────────────────────────────
// Session snapshot — JSON-friendly projection of a live PluginSession
// for Plugin Browser UI / IPC / debugging dumps.
// ────────────────────────────────────────────────────────────────────────

export {
  snapshotSession,
  snapshotLoadedModules,
  snapshotCatalogResolution,
  findRunningPlugin,
  findUnresolvablePlugin,
  findFailedPackage,
  classifyPluginStatus,
  diffSessionSnapshots,
  formatSnapshotJson,
  aggregateContributions,
  computeContributionOrigins,
  type AggregatedContributions,
  type ContributionOrigins,
  type FormatSnapshotJsonOptions,
  type SessionSnapshot,
  type SnapshotRunningPlugin,
  type SnapshotUnresolvablePlugin,
  type SnapshotFailedPackage,
  type SnapshotManifestSummary,
  type SnapshotDependency,
  type SnapshotContributionCounts,
  type SerializedUnresolvableReason,
  type SessionSnapshotDiff,
  type BucketDiff,
  type SnapshotReclassification,
} from "./snapshot.js";

// ────────────────────────────────────────────────────────────────────────
// Snapshot diagnostics — pure formatters for session errors, fix hints,
// and human-readable session reports.
// ────────────────────────────────────────────────────────────────────────

export {
  formatUnresolvableReason,
  fixHintForReason,
  formatUnresolvable,
  formatFailedPackage,
  formatSnapshotErrors,
  formatSnapshotHuman,
  type SnapshotDiagnostics,
} from "./diagnostics.js";
