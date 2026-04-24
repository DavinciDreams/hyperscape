/**
 * Chain-enable helpers — the mirror of `computeDisableImpact` +
 * `disablePluginSubset`.
 *
 * `PluginLoader.enablePlugin` enforces that every hard dependency
 * is already `enabled`; it will not auto-pull-in deps. For editor
 * UX, that's the wrong default — when the user toggles one plugin
 * on, the system should offer to (and then do) enable its missing
 * deps automatically.
 *
 * This module provides:
 *   - `computeEnableImpact`  → what the user is about to opt into
 *   - `enablePluginChain`    → apply it in dependency-safe order
 *
 * Both are scoped to one target plugin at a time. Multi-target
 * chain-enable is the Plugin Browser's "select rows → enable" use
 * case — `enablePluginSubset` already handles that correctly as
 * long as the subset is self-contained; combine it with
 * `computeEnableImpact` per target to expand the selection before
 * dispatch.
 */

import type { PluginCatalog } from "./PluginCatalog.js";
import type { PluginContextBase, PluginHost } from "./PluginHost.js";
import type { PluginLifecycleState } from "./PluginLoader.js";
import { transitiveDependenciesOf } from "./PluginDependencyGraph.js";

/** One ancestor (or the target) that would transition to `enabled`. */
export interface EnableImpactEntry {
  readonly pluginId: string;
  readonly currentState: PluginLifecycleState;
  /**
   * `true` if this entry is the user-requested target, `false` if
   * it's a hard dependency being pulled in implicitly.
   */
  readonly isTarget: boolean;
}

/**
 * When the user clicks "enable" on `id`, which plugins would the
 * host transition as part of that operation? Returns one entry per
 * plugin whose state is NOT `enabled` in the subgraph rooted at
 * `id` (the target plus its transitive hard-dep closure).
 *
 * Order: hard deps first (forward topo via `transitiveDependenciesOf`
 * reversed), target last. Matches the order the host would apply.
 *
 * Plugins in the dep closure that are ALREADY `enabled` are
 * excluded — no transition needed. Plugins in `failed` state are
 * included (and the chain will throw on them, so the editor can
 * surface a warning ahead of dispatch).
 */
export function computeEnableImpact<TContext extends PluginContextBase>(
  catalog: PluginCatalog,
  host: PluginHost<TContext>,
  id: string,
): EnableImpactEntry[] {
  if (!catalog.has(id)) return [];
  const recordsById = new Map(
    host.records.map((r) => [r.manifest.id, r] as const),
  );
  const targetRec = recordsById.get(id);
  const targetState: PluginLifecycleState = targetRec?.state ?? "registered";

  // Forward closure: `transitiveDependenciesOf` gives deps but with
  // BFS closest-first; we need dep-roots-first for apply order.
  const forwardDeps = transitiveDependenciesOf(catalog, id);
  // Reverse the BFS order so the deepest dependency comes first —
  // matches PluginCatalog.loadOrder()'s forward topology within the
  // subgraph. We further filter to "not already enabled" and tag
  // the target explicitly.
  const out: EnableImpactEntry[] = [];
  for (let i = forwardDeps.length - 1; i >= 0; i--) {
    const depId = forwardDeps[i];
    const state = recordsById.get(depId)?.state ?? "registered";
    if (state === "enabled") continue;
    out.push({ pluginId: depId, currentState: state, isTarget: false });
  }
  if (targetState !== "enabled") {
    out.push({ pluginId: id, currentState: targetState, isTarget: true });
  }
  return out;
}

export type ChainEnableItemResult =
  | {
      readonly kind: "applied";
      readonly pluginId: string;
      readonly isTarget: boolean;
    }
  | {
      readonly kind: "skipped";
      readonly pluginId: string;
      readonly isTarget: boolean;
      readonly reason: string;
    }
  | {
      readonly kind: "failed";
      readonly pluginId: string;
      readonly isTarget: boolean;
      readonly error: Error;
    };

export interface ChainEnableResult {
  readonly targetId: string;
  readonly items: readonly ChainEnableItemResult[];
}

/**
 * Enable `pluginId` and every not-yet-enabled transitive hard dep
 * in dependency-safe forward order. If any dep fails the whole
 * chain short-circuits (remaining entries come back as `skipped`
 * with `reason:"chain-aborted"`) so the target is never left half-
 * wired.
 *
 * Re-fetches impact at call time so callers don't have to pass a
 * pre-computed array — stale impact (another tab already enabled
 * a dep) would turn into spurious noops anyway.
 */
export async function enablePluginChain<TContext extends PluginContextBase>(
  host: PluginHost<TContext>,
  pluginId: string,
): Promise<ChainEnableResult> {
  const impact = computeEnableImpact(host.catalog, host, pluginId);
  const items: ChainEnableItemResult[] = [];
  let aborted = false;
  for (const entry of impact) {
    if (aborted) {
      items.push({
        kind: "skipped",
        pluginId: entry.pluginId,
        isTarget: entry.isTarget,
        reason: "chain-aborted",
      });
      continue;
    }
    try {
      await host.enablePlugin(entry.pluginId);
      items.push({
        kind: "applied",
        pluginId: entry.pluginId,
        isTarget: entry.isTarget,
      });
    } catch (e) {
      items.push({
        kind: "failed",
        pluginId: entry.pluginId,
        isTarget: entry.isTarget,
        error: e instanceof Error ? e : new Error(String(e)),
      });
      // Any failure aborts — continuing risks enabling a plugin
      // whose ancestor dep just failed.
      aborted = true;
    }
  }
  return { targetId: pluginId, items };
}
