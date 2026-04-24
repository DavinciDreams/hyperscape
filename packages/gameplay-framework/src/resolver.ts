/**
 * Plugin load-order resolver.
 *
 * Given a set of loaded plugin modules (typically the `loaded[]`
 * output of `loadPluginCatalog`), produces:
 *   - A topologically-sorted load order honoring each plugin's
 *     `dependencies[]` and `loadAfter[]` constraints
 *   - A parallel `unresolvable[]` list of plugins that can't be loaded
 *     (missing required dep, dep version mismatch, or cycle member)
 *
 * Pure logic — no I/O. Algorithm is a DFS-based topological sort with
 * post-order emit and cycle detection via gray/black coloring, so the
 * full set of cycle members is captured (not just the back-edge).
 *
 * Semantics of the two manifest constraint fields:
 *   - `dependencies[]` = hard require. If `optional === false` (the
 *     default), the plugin is unresolvable when the dep is missing or
 *     its version fails the dep's `versionRange`.
 *   - `loadAfter[]` = soft ordering only. If the named plugin exists
 *     in the catalog, it must come before this plugin in the output
 *     order. If it doesn't exist, no constraint is applied (not a
 *     failure).
 *
 * Ordering guarantees:
 *   - Deps come before dependents.
 *   - Within the constraints, plugins emit in the input-array order
 *     (stable sort — Plugin Browser sort-by-dirname is preserved when
 *     no dependency edge overrides it).
 */

import type { PluginManifest } from "@hyperforge/manifest-schema";

import type { LoadedPluginModule } from "./loader.js";
import { satisfiesPluginVersionRange } from "./semver.js";

/** Why a plugin couldn't be placed in the load order. */
export type UnresolvableReason =
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

/** A plugin that couldn't be placed in the load order, paired with its reason. */
export interface UnresolvablePlugin<TContext = unknown> {
  readonly module: LoadedPluginModule<TContext>;
  readonly reason: UnresolvableReason;
}

/** Aggregate result of `resolvePluginLoadOrder`. */
export interface PluginLoadOrder<TContext = unknown> {
  readonly ordered: ReadonlyArray<LoadedPluginModule<TContext>>;
  readonly unresolvable: ReadonlyArray<UnresolvablePlugin<TContext>>;
}

/**
 * Produce a valid load order for a set of plugins.
 *
 * The input is the list of successfully-loaded plugin modules (from
 * `loadPluginCatalog().loaded`). Duplicate plugin ids within the input
 * are not expected (the catalog already has them keyed by baseDir),
 * but if present, the second occurrence is dropped with no error —
 * the first wins. Callers who need dup detection should do it at
 * catalog-assembly time.
 */
export function resolvePluginLoadOrder<TContext = unknown>(
  loaded: ReadonlyArray<LoadedPluginModule<TContext>>,
): PluginLoadOrder<TContext> {
  // Step 1 — index by id, preserve first occurrence for dup handling.
  const byId = new Map<string, LoadedPluginModule<TContext>>();
  for (const module of loaded) {
    if (!byId.has(module.manifest.id)) {
      byId.set(module.manifest.id, module);
    }
  }

  // Step 2 — precompute dep failures that don't require a graph walk.
  // Missing-required-dep and version-mismatch disqualify the plugin
  // directly. `loadAfter` never disqualifies; it only influences order.
  const unresolvable = new Map<string, UnresolvablePlugin<TContext>>();
  for (const [id, module] of byId) {
    const reason = firstHardDepFailure(module.manifest, byId);
    if (reason) {
      unresolvable.set(id, { module, reason });
    }
  }

  // Step 3 — build the edge set for ordering. Edges point from
  // prerequisite → dependent (so prerequisites are visited first).
  // Only consider plugins that weren't already disqualified above,
  // since a disqualified plugin can't influence ordering of others.
  const orderable: Array<LoadedPluginModule<TContext>> = [];
  for (const module of byId.values()) {
    if (!unresolvable.has(module.manifest.id)) orderable.push(module);
  }

  const edges = buildEdges(orderable, byId, unresolvable);

  // Step 4 — DFS topological sort with cycle detection. Any plugin
  // caught in a cycle moves from `orderable` into `unresolvable` with
  // a cycle reason listing all members.
  const { ordered, cycleMembers } = topoSort(orderable, edges);

  for (const [id, members] of cycleMembers) {
    const module = byId.get(id);
    if (!module) continue;
    unresolvable.set(id, {
      module,
      reason: { kind: "cycle", cycleMemberIds: members },
    });
  }

  return {
    ordered,
    unresolvable: [...unresolvable.values()],
  };
}

// ────────────────────────────────────────────────────────────────────────
// Internals
// ────────────────────────────────────────────────────────────────────────

/**
 * Walk a plugin's `dependencies[]` and return the first hard failure.
 * Optional deps that are missing/mismatched never fail here.
 */
function firstHardDepFailure<TContext>(
  manifest: PluginManifest,
  byId: Map<string, LoadedPluginModule<TContext>>,
): UnresolvableReason | undefined {
  for (const dep of manifest.dependencies) {
    const providerModule = byId.get(dep.id);
    if (!providerModule) {
      if (dep.optional) continue;
      return { kind: "missing-dependency", dependencyId: dep.id };
    }
    const available = providerModule.manifest.version;
    if (!satisfiesPluginVersionRange(available, dep.versionRange)) {
      if (dep.optional) continue;
      return {
        kind: "dependency-version-mismatch",
        dependencyId: dep.id,
        required: dep.versionRange,
        available,
      };
    }
  }
  return undefined;
}

/**
 * Build a map `pluginId → Set<prerequisiteId>` containing both
 * dependency and `loadAfter` edges. Edges targeting already-
 * disqualified plugins are dropped — an unresolvable plugin can't
 * gate ordering of anyone else.
 */
function buildEdges<TContext>(
  orderable: ReadonlyArray<LoadedPluginModule<TContext>>,
  byId: Map<string, LoadedPluginModule<TContext>>,
  unresolvable: ReadonlyMap<string, UnresolvablePlugin<TContext>>,
): Map<string, Set<string>> {
  const edges = new Map<string, Set<string>>();
  for (const module of orderable) {
    const deps = new Set<string>();
    for (const dep of module.manifest.dependencies) {
      if (byId.has(dep.id) && !unresolvable.has(dep.id)) {
        deps.add(dep.id);
      }
    }
    for (const afterId of module.manifest.loadAfter) {
      if (byId.has(afterId) && !unresolvable.has(afterId)) {
        deps.add(afterId);
      }
    }
    edges.set(module.manifest.id, deps);
  }
  return edges;
}

/**
 * DFS-based topological sort with cycle detection.
 *
 * Coloring:
 *   - white = unvisited
 *   - gray  = on the current DFS stack (revisit = cycle)
 *   - black = fully processed, emitted to `ordered`
 *
 * When a back-edge is encountered, the full cycle is extracted from
 * the current DFS stack so the caller can report every member — not
 * just the node that closed the loop.
 */
function topoSort<TContext>(
  orderable: ReadonlyArray<LoadedPluginModule<TContext>>,
  edges: ReadonlyMap<string, ReadonlySet<string>>,
): {
  ordered: Array<LoadedPluginModule<TContext>>;
  cycleMembers: Map<string, ReadonlyArray<string>>;
} {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, 0 | 1 | 2>();
  for (const m of orderable) color.set(m.manifest.id, WHITE);

  const ordered: Array<LoadedPluginModule<TContext>> = [];
  const cycleMembers = new Map<string, ReadonlyArray<string>>();
  const byId = new Map<string, LoadedPluginModule<TContext>>();
  for (const m of orderable) byId.set(m.manifest.id, m);

  // Explicit stack — avoids JS stack blowup on deep dep chains and
  // lets us report the gray-stack slice as the cycle membership.
  interface Frame {
    readonly id: string;
    readonly prereqs: IterableIterator<string>;
  }

  function visit(startId: string): void {
    if (color.get(startId) !== WHITE) return;
    const stack: Frame[] = [
      {
        id: startId,
        prereqs: edges.get(startId)?.values() ?? [][Symbol.iterator](),
      },
    ];
    color.set(startId, GRAY);

    while (stack.length > 0) {
      const top = stack[stack.length - 1]!;
      const next = top.prereqs.next();
      if (next.done) {
        color.set(top.id, BLACK);
        const module = byId.get(top.id);
        if (module) ordered.push(module);
        stack.pop();
        continue;
      }
      const prereqId = next.value;
      const prereqColor = color.get(prereqId);
      if (prereqColor === undefined) continue; // not orderable — shouldn't happen
      if (prereqColor === BLACK) continue;
      if (prereqColor === GRAY) {
        // Back-edge — extract cycle members from the gray stack slice.
        const cycleStartIdx = stack.findIndex((f) => f.id === prereqId);
        const cycle = stack.slice(cycleStartIdx).map((f) => f.id);
        for (const memberId of cycle) {
          cycleMembers.set(memberId, cycle);
        }
        // Pop back to *before* the cycle start so outer visits can
        // continue processing the rest of the graph. Mark the cycle
        // members BLACK so they aren't revisited (they'll be moved to
        // the unresolvable list by the caller).
        while (stack.length > cycleStartIdx) {
          const frame = stack.pop()!;
          color.set(frame.id, BLACK);
        }
        continue;
      }
      // WHITE prereq — descend.
      color.set(prereqId, GRAY);
      stack.push({
        id: prereqId,
        prereqs: edges.get(prereqId)?.values() ?? [][Symbol.iterator](),
      });
    }
  }

  // Start DFS from each node in original input order so the final
  // emit order is stable — among plugins with no constraining edges,
  // the input order wins.
  for (const module of orderable) {
    visit(module.manifest.id);
  }

  // Filter cycle members out of `ordered` — they were pushed BLACK as
  // part of the "pop back to cycleStartIdx" logic but shouldn't count
  // as part of the valid load order.
  const filtered = ordered.filter((m) => !cycleMembers.has(m.manifest.id));

  return { ordered: filtered, cycleMembers };
}
