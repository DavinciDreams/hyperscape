/**
 * After the editor applies a `PluginRegistryDiff` and persists the
 * new registry to disk, the running `PluginHost` needs to be brought
 * in line with the new shape:
 *
 *   - newly-enabled plugins → load + enable
 *   - newly-disabled plugins → disable
 *   - version-bumped plugins still enabled → restart (disable, then
 *     reload the new manifest, then re-enable)
 *
 * This module computes that transition plan as a pure transform.
 * The editor (or a higher-level orchestrator) drives the actual
 * lifecycle calls using the plan as a script.
 *
 * Inputs:
 *   - `oldRegistry` — what was loaded before apply
 *   - `newRegistry` — the post-apply registry shape (the editor
 *     just persisted this to disk)
 *   - `runningPluginIds` — what `PluginHost` currently has in the
 *     enabled state (caller-owned snapshot)
 *
 * "Enabled" semantics: a plugin is considered enabled iff present
 * in the registry AND not explicitly turned off by an
 * `enabledByDefault: false` override. This mirrors the resolver
 * `resolvePluginEnabledByDefault` already used elsewhere in
 * `PluginRegistryBridge`.
 *
 * Pure transform. No I/O. Never throws.
 */

import type {
  PluginManifest,
  PluginRegistryManifest,
} from "@hyperforge/manifest-schema";

export interface PluginTransitionStart {
  readonly pluginId: string;
  readonly manifest: PluginManifest;
}

export interface PluginTransitionRestart {
  readonly pluginId: string;
  readonly previousManifest: PluginManifest;
  readonly nextManifest: PluginManifest;
  /**
   * `"version-changed"` — the version bumped (manifest swap)
   * `"manifest-changed"` — version is the same but other fields
   * drifted (entry path, dependencies, etc); reload to pick them
   * up. Editor surfaces this as "metadata-only refresh".
   */
  readonly reason: "version-changed" | "manifest-changed";
}

export interface PluginTransitionStop {
  readonly pluginId: string;
  /**
   * `"removed"` — plugin no longer in `newRegistry`
   * `"disabled"` — present but `enabledByDefault` became false
   */
  readonly reason: "removed" | "disabled";
}

export interface PluginRegistryTransitionPlan {
  readonly toStart: readonly PluginTransitionStart[];
  readonly toRestart: readonly PluginTransitionRestart[];
  readonly toStop: readonly PluginTransitionStop[];
  readonly noChange: readonly string[];
}

/**
 * Resolve the on/off state for a single plugin id given a registry.
 * Mirrors `resolvePluginEnabledByDefault` semantics:
 *   - registry override `false` → off
 *   - registry override `true`  → on
 *   - no override               → manifest's `enabledByDefault`
 *     (which itself defaults to `true`)
 */
function resolveEnabled(
  registry: PluginRegistryManifest,
  manifest: PluginManifest,
): boolean {
  const override = registry.enabledByDefault?.[manifest.id];
  if (override === false) return false;
  if (override === true) return true;
  return manifest.enabledByDefault ?? true;
}

function jsonEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function computePluginRegistryTransitionPlan(
  oldRegistry: PluginRegistryManifest,
  newRegistry: PluginRegistryManifest,
  runningPluginIds: ReadonlySet<string>,
): PluginRegistryTransitionPlan {
  const oldById = new Map(oldRegistry.plugins.map((p) => [p.id, p] as const));
  const newById = new Map(newRegistry.plugins.map((p) => [p.id, p] as const));

  const toStart: PluginTransitionStart[] = [];
  const toRestart: PluginTransitionRestart[] = [];
  const toStop: PluginTransitionStop[] = [];
  const noChange: string[] = [];

  // Pass 1: walk new registry — start / restart / no-change candidates
  for (const next of newRegistry.plugins) {
    const wasRunning = runningPluginIds.has(next.id);
    const willBeEnabled = resolveEnabled(newRegistry, next);
    const previous = oldById.get(next.id);

    if (!willBeEnabled) {
      // Plugin is in the registry but not desired to be running
      if (wasRunning) {
        toStop.push({ pluginId: next.id, reason: "disabled" });
      }
      // else: already off, no transition needed
      continue;
    }

    // willBeEnabled === true
    if (!wasRunning) {
      toStart.push({ pluginId: next.id, manifest: next });
      continue;
    }

    // wasRunning && willBeEnabled — possible restart
    if (previous && previous.version !== next.version) {
      toRestart.push({
        pluginId: next.id,
        previousManifest: previous,
        nextManifest: next,
        reason: "version-changed",
      });
      continue;
    }
    if (previous && !jsonEqual(previous, next)) {
      toRestart.push({
        pluginId: next.id,
        previousManifest: previous,
        nextManifest: next,
        reason: "manifest-changed",
      });
      continue;
    }
    noChange.push(next.id);
  }

  // Pass 2: walk old registry — find removed plugins that were running
  for (const prev of oldRegistry.plugins) {
    if (newById.has(prev.id)) continue; // covered by pass 1
    if (runningPluginIds.has(prev.id)) {
      toStop.push({ pluginId: prev.id, reason: "removed" });
    }
  }

  // Stable orderings
  toStart.sort((a, b) => a.pluginId.localeCompare(b.pluginId));
  toRestart.sort((a, b) => a.pluginId.localeCompare(b.pluginId));
  toStop.sort((a, b) => a.pluginId.localeCompare(b.pluginId));
  noChange.sort();

  return { toStart, toRestart, toStop, noChange };
}

/**
 * Quick check used by the editor to enable/disable the "Apply"
 * button. `true` if the plan would actually do work.
 */
export function isPluginRegistryTransitionPlanEmpty(
  plan: PluginRegistryTransitionPlan,
): boolean {
  return (
    plan.toStart.length === 0 &&
    plan.toRestart.length === 0 &&
    plan.toStop.length === 0
  );
}
