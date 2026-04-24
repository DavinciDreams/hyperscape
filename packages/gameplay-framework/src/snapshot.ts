/**
 * Session snapshot — JSON-friendly POJO serializer for a live
 * {@link PluginSession}.
 *
 * Hosts rendering Plugin Browser UI, shipping session state over IPC,
 * dumping a session for a bug report, or diffing two session states in
 * tests all need a stable, shape-frozen read-only view of what's
 * running / what failed / what couldn't be resolved.
 *
 * Without this helper, every caller walks `session.records` +
 * `session.failedPackages` + `session.unresolvable` and hand-projects
 * each field, including the `UnresolvableReason` discriminated union.
 * That projection is easy to get wrong (forget a kind, lose the
 * version-mismatch detail, forget to stringify the Error). This
 * module does it once.
 *
 * Shape is deliberately narrow:
 *   - Manifest fields: id, name, version, description, tags,
 *     hyperforgeApi, enabledByDefault — the ones a Plugin Browser row
 *     actually renders. Full manifest remains available via the
 *     live session if a host needs more.
 *   - Dependencies + loadAfter: id + version-range + optional flag.
 *     Enough to render a dependency graph cell without pulling the
 *     resolver or walking the live records.
 *   - Contributions: string-array counts so Plugin Browser can show
 *     "N systems, M widgets" badges.
 *   - Unresolvable reasons: serialize the discriminated-union into a
 *     typed `SerializedUnresolvableReason` matching the runtime
 *     `UnresolvableReason` kind-for-kind.
 *   - Failures: stringified `errorName` + `errorMessage` (Error
 *     objects don't serialize; readers never need the raw stack in
 *     snapshot form).
 *
 * Pure data — no mutation, no I/O, no dep on the rest of the package
 * beyond the types it already exports.
 */

import type { PluginManifest } from "@hyperforge/manifest-schema";

import type { CatalogLoadFailure, PluginCatalogResult } from "./catalog.js";
import type { PluginInstanceRecord } from "./lifecycle.js";
import type { LoadedPluginModule } from "./loader.js";
import type {
  PluginLoadOrder,
  UnresolvablePlugin,
  UnresolvableReason,
} from "./resolver.js";
import type { PluginSession } from "./session.js";
import type { PluginContextBase } from "./index.js";

/** Plugin manifest fields a Plugin Browser row typically renders. */
export interface SnapshotManifestSummary {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly hyperforgeApi: string;
  readonly enabledByDefault: boolean;
  readonly tags: ReadonlyArray<string>;
}

/** Dependency edge projection. */
export interface SnapshotDependency {
  readonly id: string;
  readonly versionRange: string;
  readonly optional: boolean;
}

/** Contribution-count summary — matches the manifest's `contributions` buckets. */
export interface SnapshotContributionCounts {
  readonly systems: number;
  readonly entities: number;
  readonly widgets: number;
  readonly manifestSchemas: number;
  readonly paletteCategories: number;
  readonly toolbarTools: number;
  readonly commands: number;
}

/** A plugin that started successfully. */
export interface SnapshotRunningPlugin {
  readonly manifest: SnapshotManifestSummary;
  readonly dependencies: ReadonlyArray<SnapshotDependency>;
  readonly loadAfter: ReadonlyArray<string>;
  readonly contributions: SnapshotContributionCounts;
}

/**
 * Serialized version of {@link UnresolvableReason} — kind-for-kind
 * mirror; identical today but typed separately so callers pin snapshot
 * consumers to the snapshot surface, not the live resolver types.
 */
export type SerializedUnresolvableReason =
  | {
      readonly kind: "missing-dependency";
      readonly dependencyId: string;
    }
  | {
      readonly kind: "dependency-version-mismatch";
      readonly dependencyId: string;
      readonly required: string;
      readonly available: string;
    }
  | {
      readonly kind: "cycle";
      readonly cycleMemberIds: ReadonlyArray<string>;
    };

/** A plugin that loaded but couldn't be ordered. */
export interface SnapshotUnresolvablePlugin {
  readonly manifest: SnapshotManifestSummary;
  readonly reason: SerializedUnresolvableReason;
}

/** A plugin package that failed to load (never reached the resolver). */
export interface SnapshotFailedPackage {
  readonly baseDir: string;
  readonly errorName: string;
  readonly errorMessage: string;
}

/** Top-level snapshot shape. JSON-friendly — no Errors, no functions, no Maps. */
export interface SessionSnapshot {
  readonly running: ReadonlyArray<SnapshotRunningPlugin>;
  readonly unresolvable: ReadonlyArray<SnapshotUnresolvablePlugin>;
  readonly failedPackages: ReadonlyArray<SnapshotFailedPackage>;
  readonly summary: {
    readonly runningCount: number;
    readonly unresolvableCount: number;
    readonly failedCount: number;
  };
}

// ────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────

/**
 * Project a live {@link PluginSession} into a JSON-friendly snapshot.
 *
 * Generic is constrained to `PluginContextBase` to match the session
 * type — the snapshot itself is context-agnostic (it never reads the
 * per-plugin `ctx`, only the manifest).
 */
export function snapshotSession<TContext extends PluginContextBase>(
  session: PluginSession<TContext>,
): SessionSnapshot {
  const running = session.records.map(recordToRunning);
  const unresolvable = session.unresolvable.map(unresolvableToSnapshot);
  const failedPackages = session.failedPackages.map(failureToSnapshot);
  return {
    running,
    unresolvable,
    failedPackages,
    summary: {
      runningCount: running.length,
      unresolvableCount: unresolvable.length,
      failedCount: failedPackages.length,
    },
  };
}

/**
 * Project a bare `LoadedPluginModule[]` into the same row shape used
 * for `running`. Useful for `lint` / `list` / `show` CLI contexts that
 * have modules but haven't started a session.
 */
export function snapshotLoadedModules<TContext>(
  modules: ReadonlyArray<LoadedPluginModule<TContext>>,
): ReadonlyArray<SnapshotRunningPlugin> {
  return modules.map((m) => manifestToRunning(m.manifest));
}

/**
 * Build a full {@link SessionSnapshot} from a catalog-load result +
 * resolver output — without ever starting a live session.
 *
 * This is the pure-inspection path a CLI `snapshot` subcommand, a CI
 * dashboard, or an editor's "what would load?" preview needs. It
 * reuses the same internal projectors as {@link snapshotSession} so
 * the wire shape is bit-for-bit identical.
 *
 * Contract:
 *   - `catalog.loaded` → input to the resolver (caller-owned).
 *   - `catalog.failed` → projected into `failedPackages[]`.
 *   - `resolution.ordered` → projected into `running[]` in topo order.
 *   - `resolution.unresolvable` → projected into `unresolvable[]`.
 *   - The caller is responsible for passing the *output of
 *     `resolvePluginLoadOrder(catalog.loaded)`* (not some other input).
 *     Running rows come from `resolution.ordered`; the catalog's
 *     `loaded` array is only used for its `failed` sibling bucket.
 */
export function snapshotCatalogResolution<TContext>(
  catalog: PluginCatalogResult<TContext>,
  resolution: PluginLoadOrder<TContext>,
): SessionSnapshot {
  const running = resolution.ordered.map((m) => manifestToRunning(m.manifest));
  const unresolvable = resolution.unresolvable.map(unresolvableToSnapshot);
  const failedPackages = catalog.failed.map(failureToSnapshot);
  return {
    running,
    unresolvable,
    failedPackages,
    summary: {
      runningCount: running.length,
      unresolvableCount: unresolvable.length,
      failedCount: failedPackages.length,
    },
  };
}

/**
 * Find the `SnapshotRunningPlugin` row for `pluginId` in `snapshot.running`,
 * or `undefined` if the plugin isn't running in this snapshot. Trivial
 * `.find()` wrapper — centralized so id-based lookups don't multiply
 * across editors, IPC bridges, and telemetry pipelines.
 */
export function findRunningPlugin(
  snapshot: SessionSnapshot,
  pluginId: string,
): SnapshotRunningPlugin | undefined {
  return snapshot.running.find((r) => r.manifest.id === pluginId);
}

/**
 * Find the `SnapshotUnresolvablePlugin` row for `pluginId` in
 * `snapshot.unresolvable`, or `undefined` if the plugin wasn't
 * marked unresolvable in this snapshot.
 */
export function findUnresolvablePlugin(
  snapshot: SessionSnapshot,
  pluginId: string,
): SnapshotUnresolvablePlugin | undefined {
  return snapshot.unresolvable.find((u) => u.manifest.id === pluginId);
}

/**
 * Find the `SnapshotFailedPackage` row for `baseDir` in
 * `snapshot.failedPackages`. Failed packages are indexed by `baseDir`
 * (not plugin id) because the failure happens before the manifest is
 * parsed — there's no id to key on.
 */
export function findFailedPackage(
  snapshot: SessionSnapshot,
  baseDir: string,
): SnapshotFailedPackage | undefined {
  return snapshot.failedPackages.find((f) => f.baseDir === baseDir);
}

/**
 * Aggregate bucket classification for a plugin id. Useful for editor
 * rows that need "is this plugin OK / broken / missing?" in a single
 * switch. Returns `"unknown"` if no bucket carries the id (the id
 * might correspond to a failed package, but failed packages aren't
 * id-keyed — use {@link findFailedPackage} for baseDir lookups).
 */
export function classifyPluginStatus(
  snapshot: SessionSnapshot,
  pluginId: string,
): "running" | "unresolvable" | "unknown" {
  if (findRunningPlugin(snapshot, pluginId) !== undefined) return "running";
  if (findUnresolvablePlugin(snapshot, pluginId) !== undefined)
    return "unresolvable";
  return "unknown";
}

// ────────────────────────────────────────────────────────────────────────
// Internal projectors
// ────────────────────────────────────────────────────────────────────────

function recordToRunning<TContext extends PluginContextBase>(
  record: PluginInstanceRecord<TContext>,
): SnapshotRunningPlugin {
  return manifestToRunning(record.manifest);
}

function unresolvableToSnapshot<TContext>(
  entry: UnresolvablePlugin<TContext>,
): SnapshotUnresolvablePlugin {
  return {
    manifest: manifestToSummary(entry.module.manifest),
    reason: serializeReason(entry.reason),
  };
}

function failureToSnapshot(failure: CatalogLoadFailure): SnapshotFailedPackage {
  const err = failure.error;
  const errorName = err instanceof Error ? err.name : "Error";
  const errorMessage = err instanceof Error ? err.message : String(err);
  return { baseDir: failure.baseDir, errorName, errorMessage };
}

function manifestToRunning(manifest: PluginManifest): SnapshotRunningPlugin {
  return {
    manifest: manifestToSummary(manifest),
    dependencies: manifest.dependencies.map((d) => ({
      id: d.id,
      versionRange: d.versionRange,
      optional: d.optional ?? false,
    })),
    loadAfter: [...manifest.loadAfter],
    contributions: {
      systems: manifest.contributions.systems.length,
      entities: manifest.contributions.entities.length,
      widgets: manifest.contributions.widgets.length,
      manifestSchemas: manifest.contributions.manifestSchemas.length,
      paletteCategories: manifest.contributions.paletteCategories.length,
      toolbarTools: manifest.contributions.toolbarTools.length,
      commands: manifest.contributions.commands.length,
    },
  };
}

function manifestToSummary(manifest: PluginManifest): SnapshotManifestSummary {
  return {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    description: manifest.description,
    hyperforgeApi: manifest.hyperforgeApi,
    enabledByDefault: manifest.enabledByDefault,
    tags: [...manifest.tags],
  };
}

function serializeReason(
  reason: UnresolvableReason,
): SerializedUnresolvableReason {
  switch (reason.kind) {
    case "missing-dependency":
      return {
        kind: "missing-dependency",
        dependencyId: reason.dependencyId,
      };
    case "dependency-version-mismatch":
      return {
        kind: "dependency-version-mismatch",
        dependencyId: reason.dependencyId,
        required: reason.required,
        available: reason.available,
      };
    case "cycle":
      return {
        kind: "cycle",
        cycleMemberIds: [...reason.cycleMemberIds],
      };
  }
}

// ════════════════════════════════════════════════════════════════════════
// diffSessionSnapshots — pure projector over two SessionSnapshots
// ════════════════════════════════════════════════════════════════════════

/**
 * Per-bucket diff. `added` and `removed` are full rows from `next` and
 * `prev` respectively. `changed` is paired (prev, next) for ids that
 * appear in both snapshots but whose row content differs structurally.
 */
export interface BucketDiff<T> {
  readonly added: ReadonlyArray<T>;
  readonly removed: ReadonlyArray<T>;
  readonly changed: ReadonlyArray<{ readonly prev: T; readonly next: T }>;
}

/**
 * Cross-bucket id move between {@link SnapshotRunningPlugin} and
 * {@link SnapshotUnresolvablePlugin}. These two buckets share an id
 * keyspace (manifest.id), so the same id appearing in different
 * buckets across snapshots is a reclassification. Failed packages
 * are excluded — they're keyed by baseDir, not id, and may have no
 * parsed manifest at all.
 *
 * Reclassifications are emitted IN ADDITION to the per-bucket
 * `added`/`removed` rows — each diff is independently valid. The
 * `reclassified` array is a convenience layer for editors / log
 * formatters that want a single "this plugin moved" signal.
 */
export interface SnapshotReclassification {
  readonly id: string;
  readonly prev: "running" | "unresolvable";
  readonly next: "running" | "unresolvable";
}

/**
 * Result of {@link diffSessionSnapshots}. JSON-friendly — same wire
 * shape contract as {@link SessionSnapshot}.
 */
export interface SessionSnapshotDiff {
  readonly running: BucketDiff<SnapshotRunningPlugin>;
  readonly unresolvable: BucketDiff<SnapshotUnresolvablePlugin>;
  readonly failedPackages: BucketDiff<SnapshotFailedPackage>;
  readonly reclassified: ReadonlyArray<SnapshotReclassification>;
  readonly summary: {
    readonly runningDelta: number;
    readonly unresolvableDelta: number;
    readonly failedDelta: number;
  };
}

/**
 * Compute a structural diff between two {@link SessionSnapshot}s.
 *
 * Pure function — no I/O, no mutation of inputs. Output is deterministic
 * for any given (prev, next) pair: row order within `added`/`removed`/
 * `changed` follows the order rows appear in their respective source
 * snapshots, so diff JSON is stable for golden-file tests.
 *
 * Bucket semantics:
 *   - `running` / `unresolvable` are id-keyed (manifest.id).
 *   - `failedPackages` is baseDir-keyed (no manifest available).
 *   - `reclassified` reports cross-bucket id moves between `running`
 *     and `unresolvable` only (failed packages excluded — different
 *     keyspace).
 *
 * "Changed" within a bucket means structural inequality of the row
 * (deep value comparison of all fields). A row that only swapped
 * unrelated fields (e.g. tags reorder) will still be detected as
 * changed — snapshots are JSON-friendly so deep-equality is exact.
 */
export function diffSessionSnapshots(
  prev: SessionSnapshot,
  next: SessionSnapshot,
): SessionSnapshotDiff {
  const running = diffById(prev.running, next.running, (r) => r.manifest.id);
  const unresolvable = diffById(
    prev.unresolvable,
    next.unresolvable,
    (u) => u.manifest.id,
  );
  const failedPackages = diffById(
    prev.failedPackages,
    next.failedPackages,
    (f) => f.baseDir,
  );

  // Cross-bucket reclassifications: id present in BOTH snapshots but
  // in DIFFERENT id-keyed buckets. Iterate `next` so emit order
  // matches the new snapshot's ordering — useful for "what changed
  // since last tick" UI lists.
  const prevRunning = new Set(prev.running.map((r) => r.manifest.id));
  const prevUnresolvable = new Set(prev.unresolvable.map((u) => u.manifest.id));
  const reclassified: SnapshotReclassification[] = [];
  for (const r of next.running) {
    if (prevUnresolvable.has(r.manifest.id)) {
      reclassified.push({
        id: r.manifest.id,
        prev: "unresolvable",
        next: "running",
      });
    }
  }
  for (const u of next.unresolvable) {
    if (prevRunning.has(u.manifest.id)) {
      reclassified.push({
        id: u.manifest.id,
        prev: "running",
        next: "unresolvable",
      });
    }
  }

  return {
    running,
    unresolvable,
    failedPackages,
    reclassified,
    summary: {
      runningDelta: next.running.length - prev.running.length,
      unresolvableDelta: next.unresolvable.length - prev.unresolvable.length,
      failedDelta: next.failedPackages.length - prev.failedPackages.length,
    },
  };
}

/**
 * Generic id-keyed bucket diff. Iterates `next` first so `added` and
 * `changed` rows preserve next's ordering; `removed` preserves prev's
 * ordering. Both make for stable JSON diffs.
 */
function diffById<T>(
  prev: ReadonlyArray<T>,
  next: ReadonlyArray<T>,
  keyOf: (row: T) => string,
): BucketDiff<T> {
  const prevByKey = new Map<string, T>();
  for (const row of prev) {
    prevByKey.set(keyOf(row), row);
  }
  const nextKeys = new Set<string>();

  const added: T[] = [];
  const changed: { prev: T; next: T }[] = [];
  for (const row of next) {
    const key = keyOf(row);
    nextKeys.add(key);
    const prevRow = prevByKey.get(key);
    if (prevRow === undefined) {
      added.push(row);
      continue;
    }
    if (!deepEqual(prevRow, row)) {
      changed.push({ prev: prevRow, next: row });
    }
  }

  const removed: T[] = [];
  for (const row of prev) {
    if (!nextKeys.has(keyOf(row))) {
      removed.push(row);
    }
  }

  return { added, removed, changed };
}

// ════════════════════════════════════════════════════════════════════════
// formatSnapshotJson — deterministic JSON serializer
// ════════════════════════════════════════════════════════════════════════

/**
 * Serialize any JSON-friendly snapshot-shaped value to a string with
 * deterministic key ordering, suitable for golden-file tests, content-
 * addressed caching, and stable diffs across Node versions / runs.
 *
 * Object keys are emitted in sorted order at every nesting level.
 * Array order is preserved (arrays are positional in our snapshots).
 * `null`, booleans, numbers, and strings serialize via standard JSON
 * rules. Anything non-JSON-friendly (Map / Set / Date / function /
 * Error / undefined / symbol / bigint / circular ref) is rejected
 * synchronously so authors learn at the boundary, not later when a
 * golden-file diff mysteriously flutters.
 *
 * Default indent is 2 spaces (matching `JSON.stringify(value, null, 2)`
 * for human-readable output). Pass `indent: 0` for compact single-line
 * output suitable for IPC / log lines.
 *
 * Common usage:
 *   - `formatSnapshotJson(snapshot)` — pretty for golden files / debug
 *   - `formatSnapshotJson(diff, { indent: 0 })` — compact for logs
 */
export function formatSnapshotJson(
  value: unknown,
  options: FormatSnapshotJsonOptions = {},
): string {
  const indent = options.indent ?? 2;
  return serialize(value, indent, 0, new WeakSet<object>());
}

/** Options for {@link formatSnapshotJson}. */
export interface FormatSnapshotJsonOptions {
  /** Indent width in spaces. Default 2. Pass 0 for compact output. */
  readonly indent?: number;
}

function serialize(
  value: unknown,
  indent: number,
  depth: number,
  seen: WeakSet<object>,
): string {
  if (value === null) return "null";
  if (typeof value === "boolean" || typeof value === "number") {
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new Error(
        `formatSnapshotJson: non-finite number (${String(value)}) is not JSON-representable`,
      );
    }
    return JSON.stringify(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (
    typeof value === "undefined" ||
    typeof value === "function" ||
    typeof value === "symbol" ||
    typeof value === "bigint"
  ) {
    throw new Error(
      `formatSnapshotJson: ${typeof value} is not JSON-representable`,
    );
  }
  if (typeof value !== "object") {
    throw new Error(`formatSnapshotJson: unsupported value type`);
  }
  // Reject typed objects that JSON.stringify would silently mangle.
  if (
    value instanceof Map ||
    value instanceof Set ||
    value instanceof Date ||
    value instanceof Error ||
    value instanceof RegExp
  ) {
    throw new Error(
      `formatSnapshotJson: ${value.constructor.name} is not JSON-friendly — convert to a plain object/array first`,
    );
  }
  if (seen.has(value as object)) {
    throw new Error("formatSnapshotJson: circular reference detected");
  }
  seen.add(value as object);
  try {
    if (Array.isArray(value)) {
      if (value.length === 0) return "[]";
      if (indent === 0) {
        const parts = value.map((v) => serialize(v, 0, depth + 1, seen));
        return `[${parts.join(",")}]`;
      }
      const pad = " ".repeat(indent * (depth + 1));
      const close = " ".repeat(indent * depth);
      const parts = value.map(
        (v) => `${pad}${serialize(v, indent, depth + 1, seen)}`,
      );
      return `[\n${parts.join(",\n")}\n${close}]`;
    }
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    if (keys.length === 0) return "{}";
    if (indent === 0) {
      const parts = keys.map(
        (k) => `${JSON.stringify(k)}:${serialize(obj[k], 0, depth + 1, seen)}`,
      );
      return `{${parts.join(",")}}`;
    }
    const pad = " ".repeat(indent * (depth + 1));
    const close = " ".repeat(indent * depth);
    const parts = keys.map(
      (k) =>
        `${pad}${JSON.stringify(k)}: ${serialize(obj[k], indent, depth + 1, seen)}`,
    );
    return `{\n${parts.join(",\n")}\n${close}}`;
  } finally {
    seen.delete(value as object);
  }
}

/**
 * Structural equality for JSON-friendly values. SessionSnapshot is
 * declared JSON-friendly (no Maps/Sets/Dates/functions/Errors), so
 * this covers every field shape we project. Object key order is
 * normalized via `Object.keys().sort()` so two equivalent objects
 * with different insertion order compare equal.
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  if (Array.isArray(b)) return false;
  const aKeys = Object.keys(a as Record<string, unknown>).sort();
  const bKeys = Object.keys(b as Record<string, unknown>).sort();
  if (aKeys.length !== bKeys.length) return false;
  for (let i = 0; i < aKeys.length; i++) {
    if (aKeys[i] !== bKeys[i]) return false;
  }
  for (const key of aKeys) {
    if (
      !deepEqual(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key],
      )
    ) {
      return false;
    }
  }
  return true;
}

// ════════════════════════════════════════════════════════════════════════
// aggregateContributions — Phase I3 host-bootstrap helper
// ════════════════════════════════════════════════════════════════════════

/**
 * Aggregated contribution-id buckets across one or more plugins.
 * Each bucket is a deduplicated array of declared ids.
 *
 * Editor / host bootstrap reads this to know what to register on
 * plugin enable: walk `result.systems` to know which system ids
 * each loaded plugin module is expected to expose; walk `result.widgets`
 * to know which widget ids the editor's render path should resolve;
 * etc.
 *
 * Phase I3 of PLAN_WORLD_STUDIO_AAA_COMPLETION.md (Editor plugin API).
 * Pure read — does NOT instantiate or fetch the actual contribution
 * objects (those live on the runtime plugin module, not the manifest).
 */
export interface AggregatedContributions {
  readonly systems: ReadonlyArray<string>;
  readonly entities: ReadonlyArray<string>;
  readonly widgets: ReadonlyArray<string>;
  readonly manifestSchemas: ReadonlyArray<string>;
  readonly paletteCategories: ReadonlyArray<string>;
  readonly toolbarTools: ReadonlyArray<string>;
  readonly commands: ReadonlyArray<string>;
}

/**
 * Per-bucket origin map: contribution id → array of plugin ids that
 * declared it. Useful for editor "who provides X?" lookups and for
 * conflict diagnostics ("widget Y is contributed by 3 plugins").
 */
export interface ContributionOrigins {
  readonly systems: ReadonlyMap<string, ReadonlyArray<string>>;
  readonly entities: ReadonlyMap<string, ReadonlyArray<string>>;
  readonly widgets: ReadonlyMap<string, ReadonlyArray<string>>;
  readonly manifestSchemas: ReadonlyMap<string, ReadonlyArray<string>>;
  readonly paletteCategories: ReadonlyMap<string, ReadonlyArray<string>>;
  readonly toolbarTools: ReadonlyMap<string, ReadonlyArray<string>>;
  readonly commands: ReadonlyMap<string, ReadonlyArray<string>>;
}

const CONTRIBUTION_BUCKETS = [
  "systems",
  "entities",
  "widgets",
  "manifestSchemas",
  "paletteCategories",
  "toolbarTools",
  "commands",
] as const satisfies ReadonlyArray<keyof AggregatedContributions>;

/**
 * Aggregate contribution ids across a set of loaded plugin modules.
 *
 * Contract:
 *   - Iteration order follows the input order; first-seen wins
 *     (deduplication preserves stable wire shape for golden-file
 *     tests).
 *   - Empty input → all buckets empty (NOT undefined).
 *   - Plugin manifests with empty buckets are no-ops; `.optional()`
 *     fields default to [] per the schema, so this never reads
 *     `undefined`.
 *
 * Use cases:
 *   - Editor bootstrap: walk all enabled plugins → register UI
 *   - Plugin Browser: show "this plugin contributes 3 widgets"
 *   - Conflict diagnostics: pair with {@link computeContributionOrigins}
 */
export function aggregateContributions<TContext>(
  modules: ReadonlyArray<LoadedPluginModule<TContext>>,
): AggregatedContributions {
  const seen: Record<keyof AggregatedContributions, Set<string>> = {
    systems: new Set(),
    entities: new Set(),
    widgets: new Set(),
    manifestSchemas: new Set(),
    paletteCategories: new Set(),
    toolbarTools: new Set(),
    commands: new Set(),
  };
  const out: Record<keyof AggregatedContributions, string[]> = {
    systems: [],
    entities: [],
    widgets: [],
    manifestSchemas: [],
    paletteCategories: [],
    toolbarTools: [],
    commands: [],
  };
  for (const m of modules) {
    for (const bucket of CONTRIBUTION_BUCKETS) {
      const ids = m.manifest.contributions[bucket];
      for (const id of ids) {
        if (!seen[bucket].has(id)) {
          seen[bucket].add(id);
          out[bucket].push(id);
        }
      }
    }
  }
  return out;
}

/**
 * Compute the per-bucket "contribution id → declaring plugin ids" map.
 *
 * Plugins MAY contribute the same id (e.g., two plugins providing
 * the same widget for hot-swap or A/B testing). The host needs to
 * know who claims what — this surfaces it.
 *
 * Each map's value is a deduplicated array of plugin ids that
 * declared the contribution, in input iteration order. Singleton
 * arrays are common; multi-entry arrays signal a conflict the
 * editor / host should flag.
 */
export function computeContributionOrigins<TContext>(
  modules: ReadonlyArray<LoadedPluginModule<TContext>>,
): ContributionOrigins {
  const buckets: Record<
    keyof AggregatedContributions,
    Map<string, string[]>
  > = {
    systems: new Map(),
    entities: new Map(),
    widgets: new Map(),
    manifestSchemas: new Map(),
    paletteCategories: new Map(),
    toolbarTools: new Map(),
    commands: new Map(),
  };
  for (const m of modules) {
    for (const bucket of CONTRIBUTION_BUCKETS) {
      const ids = m.manifest.contributions[bucket];
      for (const id of ids) {
        const existing = buckets[bucket].get(id);
        if (existing === undefined) {
          buckets[bucket].set(id, [m.manifest.id]);
        } else if (!existing.includes(m.manifest.id)) {
          existing.push(m.manifest.id);
        }
      }
    }
  }
  return buckets as unknown as ContributionOrigins;
}
