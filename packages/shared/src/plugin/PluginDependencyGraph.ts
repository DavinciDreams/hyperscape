/**
 * Plugin dependency-graph traversal helpers.
 *
 * Pure-logic queries over a `PluginCatalog`. The catalog owns a
 * forward edge set (a plugin's declared `dependencies[]` → dep id);
 * these helpers derive the reverse set + transitive closures on
 * demand so the catalog doesn't have to maintain two indexes.
 *
 * Directed here at editor UX:
 *   - "what depends on this?" → reverse walk for the disable-impact
 *     confirmation dialog
 *   - "what does this pull in?" → forward walk for the enable-impact
 *     confirmation dialog
 *
 * Graph traversal is iterative (explicit stack/queue) to stay safe on
 * pathological graphs and to let us short-circuit cleanly. Self-deps
 * are treated as cycles by the catalog at schema time, so we don't
 * guard for them here — but we still use a visited-set so any
 * residual cycle doesn't spin.
 *
 * Optional deps are ignored: they are "nice-to-have" load-order hints
 * and do not create a hard chain that breaks on disable.
 */

import type { PluginCatalog } from "./PluginCatalog.js";
import type { PluginContextBase, PluginHost } from "./PluginHost.js";

/**
 * Plugins that declare `id` as a HARD dependency (optional deps
 * excluded). Order matches `catalog.ids` (stable and deterministic).
 * Returns `[]` when `id` has no direct dependents OR when `id` is
 * not in the catalog (callers that care about the distinction should
 * check `catalog.has(id)` themselves).
 */
export function directDependentsOf(
  catalog: PluginCatalog,
  id: string,
): string[] {
  const out: string[] = [];
  for (const other of catalog.ids) {
    if (other === id) continue;
    const manifest = catalog.get(other);
    for (const dep of manifest.dependencies) {
      if (dep.optional) continue;
      if (dep.id === id) {
        out.push(other);
        break;
      }
    }
  }
  return out;
}

/**
 * Transitive hard-dependents of `id` — BFS over the reverse edge set,
 * excluding `id` itself. Order is BFS-visit order (closest rings
 * first); within a ring, order matches `catalog.ids`. Never throws
 * on cycles (visited-set guards).
 */
export function transitiveDependentsOf(
  catalog: PluginCatalog,
  id: string,
): string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  const queue: string[] = [id];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const d of directDependentsOf(catalog, cur)) {
      if (seen.has(d)) continue;
      seen.add(d);
      order.push(d);
      queue.push(d);
    }
  }
  return order;
}

/**
 * Transitive hard-dependencies of `id` — BFS over the forward edge
 * set, excluding `id` itself. Optional deps excluded. Never throws
 * on cycles. Missing (unresolved) dep ids are skipped — the health
 * check surfaces those separately as `missing-hard-dependency`.
 */
export function transitiveDependenciesOf(
  catalog: PluginCatalog,
  id: string,
): string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  const queue: string[] = [id];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (!catalog.has(cur)) continue;
    for (const depId of catalog.hardDependencyIds(cur)) {
      if (seen.has(depId)) continue;
      seen.add(depId);
      // Skip unresolved dep ids — health check surfaces those
      // separately as `missing-hard-dependency`.
      if (!catalog.has(depId)) continue;
      order.push(depId);
      queue.push(depId);
    }
  }
  return order;
}

/** Detail for a single row in `computeDisableImpact`'s result. */
export interface DisableImpactEntry {
  /** The plugin that would be left with an unresolved hard dep. */
  readonly pluginId: string;
  /**
   * The subset of `pluginId`'s transitive hard-dep chain that
   * includes the plugin being disabled. Always non-empty.
   */
  readonly via: readonly string[];
  /** Current lifecycle state at the time of the query. */
  readonly currentState:
    | "registered"
    | "loaded"
    | "enabled"
    | "disabled"
    | "failed";
}

/**
 * When the user clicks "disable" on `id`, which currently-enabled
 * plugins would be left in a broken state? Returns one entry per
 * downstream plugin that (a) has `id` somewhere in its transitive
 * hard-dep chain AND (b) is currently in the `enabled` state (or
 * `loaded`, which is one transition away).
 *
 * Plugins in `disabled`/`failed`/`registered` are skipped — they
 * already aren't running, so disabling `id` does not regress them.
 *
 * Intended consumption site: Plugin Browser's disable-confirmation
 * modal, which shows a "these N plugins will be stopped" panel.
 */
export function computeDisableImpact<TContext extends PluginContextBase>(
  catalog: PluginCatalog,
  host: PluginHost<TContext>,
  id: string,
): DisableImpactEntry[] {
  const dependents = transitiveDependentsOf(catalog, id);
  if (dependents.length === 0) return [];
  const recordsById = new Map(
    host.records.map((r) => [r.manifest.id, r] as const),
  );
  const out: DisableImpactEntry[] = [];
  for (const depId of dependents) {
    const record = recordsById.get(depId);
    const state = record?.state ?? "registered";
    if (state !== "enabled" && state !== "loaded") continue;
    // Find one concrete path from depId back to id, for the UI's
    // "via" breadcrumb. Uses BFS so we get the shortest.
    const via = shortestPathToAncestor(catalog, depId, id);
    out.push({ pluginId: depId, via, currentState: state });
  }
  return out;
}

/**
 * Shortest forward chain from `from` to `to` following hard deps.
 * Returns `[from, ..., to]`, or `[from]` if `from === to`, or `[]`
 * if no path exists (shouldn't happen when called from
 * `computeDisableImpact` because `transitiveDependentsOf` already
 * proved reachability).
 */
function shortestPathToAncestor(
  catalog: PluginCatalog,
  from: string,
  to: string,
): string[] {
  if (from === to) return [from];
  const parent = new Map<string, string>();
  parent.set(from, "");
  const queue: string[] = [from];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (!catalog.has(cur)) continue;
    for (const depId of catalog.hardDependencyIds(cur)) {
      if (parent.has(depId)) continue;
      parent.set(depId, cur);
      if (depId === to) {
        const path: string[] = [];
        let c: string | undefined = depId;
        while (c && c !== "") {
          path.push(c);
          c = parent.get(c);
        }
        return path.reverse();
      }
      queue.push(depId);
    }
  }
  return [];
}
