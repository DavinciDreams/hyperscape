/**
 * Apply a `PluginRegistryDiff` to a registry by composing the
 * `PluginRegistryMutations` primitives.
 *
 * Closes the loop between `diffPluginRegistries` (compute what's
 * different) and the editor's confirm-then-apply flow. Caller
 * sequence:
 *
 *   1. `diff = diffPluginRegistries(current, next)`
 *   2. show user the diff, let them check/uncheck individual
 *      buckets (`PluginRegistryDiffSelection` is the toggle shape)
 *   3. `applyPluginRegistryDiff(current, next, diff, selection?)`
 *
 * The `next` snapshot must accompany `diff` because:
 *   - `added` carries the manifest of the new plugin (we already
 *     have it)
 *   - `versionChanged` carries only the version strings — we need
 *     `next` to find the full replacement manifest
 *   - `metadataChanged` likewise
 *   - `enabledByDefaultChanged` carries the new override value
 *
 * Selection model: each diff bucket can be skipped wholesale OR
 * filtered by id-set. Default = apply everything. The editor's
 * confirm dialog lets users uncheck individual rows.
 *
 * Pure logic. Returns a new `PluginRegistryManifest`. Never
 * mutates inputs. Failures throw the same errors the underlying
 * mutation primitives throw — the editor surfaces them as
 * "couldn't apply X".
 */

import type { PluginRegistryManifest } from "@hyperforge/manifest-schema";
import type { PluginRegistryDiff } from "./PluginManifestDiff.js";
import {
  addPluginToRegistry,
  clearPluginEnabledOverride,
  removePluginFromRegistry,
  replacePluginInRegistry,
  setPluginEnabledOverride,
} from "./PluginRegistryMutations.js";

/**
 * Per-bucket selection. `undefined` means "apply all in this
 * bucket" (the default). A `Set` of plugin ids restricts to just
 * those entries. An empty `Set` skips the bucket entirely.
 *
 * Note `metadataChanged` is intentionally absent — it represents
 * authored-metadata drift at the same version, which the editor
 * surfaces as informational rows. Applying it uses the same
 * `replacePluginInRegistry` path as `versionChanged` already does
 * if both buckets carry the same id (they don't; the diff is
 * mutually exclusive). To opt INTO replacing on metadata-only
 * drift, include the id in `versionChanged` selection.
 */
export interface PluginRegistryDiffSelection {
  readonly added?: ReadonlySet<string>;
  readonly removed?: ReadonlySet<string>;
  readonly versionChanged?: ReadonlySet<string>;
  readonly metadataChanged?: ReadonlySet<string>;
  readonly enabledByDefaultChanged?: ReadonlySet<string>;
}

function shouldApply(
  selection: ReadonlySet<string> | undefined,
  id: string,
): boolean {
  if (selection === undefined) return true;
  return selection.has(id);
}

/**
 * Apply (selected portions of) the diff to `current`, pulling
 * replacement manifests from `next`.
 *
 * Order of application:
 *   1. removed   — drop plugins first, frees up id collisions
 *   2. added     — install new plugins
 *   3. versionChanged + metadataChanged — replace in place
 *   4. enabledByDefaultChanged — last, so override entries
 *      reference plugins that exist in the new shape
 *
 * Each step is independent — failure mid-stream throws and the
 * caller gets a partially-applied registry. The editor's
 * convention is to bail out of the dialog and offer "Retry" /
 * "Cancel" rather than trying to roll back.
 */
export function applyPluginRegistryDiff(
  current: PluginRegistryManifest,
  next: PluginRegistryManifest,
  diff: PluginRegistryDiff,
  selection: PluginRegistryDiffSelection = {},
): PluginRegistryManifest {
  const nextPluginById = new Map(next.plugins.map((p) => [p.id, p] as const));
  let working: PluginRegistryManifest = current;

  // 1. Removed
  for (const removed of diff.removed) {
    if (!shouldApply(selection.removed, removed.id)) continue;
    working = removePluginFromRegistry(working, removed.id);
  }

  // 2. Added
  for (const added of diff.added) {
    if (!shouldApply(selection.added, added.id)) continue;
    working = addPluginToRegistry(working, added);
  }

  // 3. Replaced (version + metadata buckets are mutually exclusive
  //    by `diffPluginRegistries` design)
  for (const change of diff.versionChanged) {
    if (!shouldApply(selection.versionChanged, change.pluginId)) continue;
    const replacement = nextPluginById.get(change.pluginId);
    if (!replacement) {
      throw new Error(
        `versionChanged entry for "${change.pluginId}" has no manifest in 'next'`,
      );
    }
    working = replacePluginInRegistry(working, replacement);
  }
  for (const change of diff.metadataChanged) {
    if (!shouldApply(selection.metadataChanged, change.pluginId)) continue;
    const replacement = nextPluginById.get(change.pluginId);
    if (!replacement) {
      throw new Error(
        `metadataChanged entry for "${change.pluginId}" has no manifest in 'next'`,
      );
    }
    working = replacePluginInRegistry(working, replacement);
  }

  // 4. Enabled-by-default overrides
  for (const change of diff.enabledByDefaultChanged) {
    if (!shouldApply(selection.enabledByDefaultChanged, change.pluginId)) {
      continue;
    }
    if (change.next === null) {
      working = clearPluginEnabledOverride(working, change.pluginId);
    } else {
      working = setPluginEnabledOverride(working, change.pluginId, change.next);
    }
  }

  return working;
}
