/**
 * Plugin registry diff.
 *
 * Compares two `PluginRegistryManifest` snapshots — typically the
 * project's currently-installed registry vs a proposed replacement
 * (marketplace export, sibling-workspace import, an "update all"
 * resolution from a community feed) — and emits a structured diff
 * the editor can render as a confirmation dialog before applying.
 *
 * Diff dimensions:
 *   - `added`        — plugins present in `next` but not in `current`
 *   - `removed`      — plugins present in `current` but not in `next`
 *   - `versionChanged` — plugin id present in both, with a different
 *                        manifest `version` string
 *   - `metadataChanged` — plugin id + version unchanged but other
 *                         author-facing fields drifted (description,
 *                         tags, license, etc.)
 *   - `enabledByDefaultChanged` — overrides flipped or added/removed
 *
 * Pure logic. Does not check semver compatibility, does not look at
 * installed-on-disk files. Just the manifest delta.
 *
 * Why not also classify `versionChanged` as upgrade vs downgrade?
 * Because that requires a SemVer parse + comparator, and the diff
 * surface here is intentionally manifest-only — the editor can run
 * `satisfiesPluginVersionRange` on the result if it needs that
 * detail for rendering.
 */

import type {
  PluginManifest,
  PluginRegistryManifest,
} from "@hyperforge/manifest-schema";

export interface PluginVersionChange {
  readonly pluginId: string;
  readonly previousVersion: string;
  readonly nextVersion: string;
}

export interface PluginMetadataChange {
  readonly pluginId: string;
  readonly version: string;
  /** Field names that drifted. */
  readonly changedFields: readonly string[];
}

export interface EnabledByDefaultChange {
  readonly pluginId: string;
  /** `null` when the plugin had no override entry. */
  readonly previous: boolean | null;
  /** `null` when the entry is being removed in the next snapshot. */
  readonly next: boolean | null;
}

export interface PluginRegistryDiff {
  readonly added: readonly PluginManifest[];
  readonly removed: readonly PluginManifest[];
  readonly versionChanged: readonly PluginVersionChange[];
  readonly metadataChanged: readonly PluginMetadataChange[];
  readonly enabledByDefaultChanged: readonly EnabledByDefaultChange[];
}

/**
 * Compute the diff. Caller-provided `current` and `next` are NOT
 * mutated. Result arrays are sorted by plugin id ascending so the
 * confirmation dialog renders a stable order.
 */
export function diffPluginRegistries(
  current: PluginRegistryManifest,
  next: PluginRegistryManifest,
): PluginRegistryDiff {
  const currentById = new Map(current.plugins.map((p) => [p.id, p] as const));
  const nextById = new Map(next.plugins.map((p) => [p.id, p] as const));

  const added: PluginManifest[] = [];
  const removed: PluginManifest[] = [];
  const versionChanged: PluginVersionChange[] = [];
  const metadataChanged: PluginMetadataChange[] = [];

  for (const [id, nextPlugin] of nextById) {
    const currentPlugin = currentById.get(id);
    if (!currentPlugin) {
      added.push(nextPlugin);
      continue;
    }
    if (currentPlugin.version !== nextPlugin.version) {
      versionChanged.push({
        pluginId: id,
        previousVersion: currentPlugin.version,
        nextVersion: nextPlugin.version,
      });
      continue;
    }
    const drifted = compareMetadata(currentPlugin, nextPlugin);
    if (drifted.length > 0) {
      metadataChanged.push({
        pluginId: id,
        version: nextPlugin.version,
        changedFields: drifted,
      });
    }
  }

  for (const [id, currentPlugin] of currentById) {
    if (!nextById.has(id)) removed.push(currentPlugin);
  }

  const enabledByDefaultChanged = diffEnabledOverrides(
    current.enabledByDefault,
    next.enabledByDefault,
  );

  added.sort(byId);
  removed.sort(byId);
  versionChanged.sort(byPluginId);
  metadataChanged.sort(byPluginId);

  return {
    added,
    removed,
    versionChanged,
    metadataChanged,
    enabledByDefaultChanged,
  };
}

function byId(a: { id: string }, b: { id: string }): number {
  return a.id.localeCompare(b.id);
}
function byPluginId(a: { pluginId: string }, b: { pluginId: string }): number {
  return a.pluginId.localeCompare(b.pluginId);
}

/**
 * Author-facing top-level fields whose drift counts as "metadata
 * changed". `id`, `version`, `dependencies`, `loadAfter`,
 * `hyperforgeApi`, `entry`, and `contributions` are intentionally
 * excluded:
 *   - `id`/`version` drive added/removed/versionChanged buckets
 *   - the rest only change with version bumps in practice; if they
 *     drift without a version bump, that's a publishing bug the
 *     diff shouldn't try to summarize cleanly. Editor can render a
 *     deeper inspector for those cases.
 *
 * Currently checked (depth-1 JSON equality):
 *   - `name`, `description`, `license`, `homepage`,
 *     `repository`, `tags`, `author`, `enabledByDefault` (authored
 *     default; per-install override is in `enabledByDefaultChanged`)
 */
function compareMetadata(a: PluginManifest, b: PluginManifest): string[] {
  const fields: (keyof PluginManifest)[] = [
    "name",
    "description",
    "license",
    "homepage",
    "repository",
    "tags",
    "author",
    "enabledByDefault",
  ];
  const out: string[] = [];
  for (const f of fields) {
    if (!jsonEqual(a[f], b[f])) out.push(String(f));
  }
  return out;
}

function jsonEqual(a: unknown, b: unknown): boolean {
  // Fast path for primitives + reference equality.
  if (a === b) return true;
  if (a === undefined || b === undefined) return a === b;
  // Stable deep-compare via JSON. Adequate because manifest fields
  // contain no functions, undefined, or cyclic refs by construction.
  return JSON.stringify(a) === JSON.stringify(b);
}

function diffEnabledOverrides(
  current: Record<string, boolean>,
  next: Record<string, boolean>,
): EnabledByDefaultChange[] {
  const ids = new Set([...Object.keys(current), ...Object.keys(next)]);
  const out: EnabledByDefaultChange[] = [];
  for (const id of ids) {
    const prev = id in current ? current[id] : null;
    const nxt = id in next ? next[id] : null;
    if (prev === nxt) continue;
    out.push({ pluginId: id, previous: prev, next: nxt });
  }
  out.sort(byPluginId);
  return out;
}

/**
 * `true` when the diff has no changes at all — convenience for
 * deciding whether to even prompt the user.
 */
export function isPluginRegistryDiffEmpty(diff: PluginRegistryDiff): boolean {
  return (
    diff.added.length === 0 &&
    diff.removed.length === 0 &&
    diff.versionChanged.length === 0 &&
    diff.metadataChanged.length === 0 &&
    diff.enabledByDefaultChanged.length === 0
  );
}
