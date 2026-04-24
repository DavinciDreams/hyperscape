/**
 * `PluginRegistryTransitionPlan` says *what* needs to happen
 * (start / restart / stop). It does not say *in what order*.
 * Order matters because plugins have hard dependencies — a
 * dependent must be disabled before its dependency, and a
 * dependency must be enabled before its dependent.
 *
 * This module is the pure-logic step between the plan and the
 * orchestrator. Given:
 *
 *   - the transition plan (what to do)
 *   - the OLD registry (so we can reverse-order removals against
 *     the world the host currently knows about)
 *   - the NEW registry (so we can forward-order starts/restarts
 *     against the world the host is about to inhabit)
 *
 * we emit a flat `TransitionStep[]` ordered for safe execution:
 *
 *   1. STOPS first, in REVERSE OLD load order
 *      (drop dependents before their dependencies)
 *   2. RESTARTS next, in NEW load order
 *      (each restart is conceptually disable + re-enable; doing
 *      them in dep order means a restarted dependency is back up
 *      before its dependent is re-touched)
 *   3. STARTS last, in NEW load order
 *      (a new plugin's deps must already be running)
 *
 * Within each bucket, ordering is deterministic. The plan's
 * id-asc tiebreak is preserved by `PluginCatalog.loadOrder()`'s
 * own stable topological sort.
 *
 * A future executor consumes `TransitionStep[]` and walks it,
 * calling `host.disablePlugin` / `host.reloadPlugin` / register +
 * load + enable as appropriate. This module never calls into the
 * host — pure transform, no I/O, never throws.
 */

import type {
  PluginManifest,
  PluginRegistryManifest,
} from "@hyperforge/manifest-schema";
import { PluginCatalog } from "./PluginCatalog.js";
import type {
  PluginRegistryTransitionPlan,
  PluginTransitionRestart,
  PluginTransitionStop,
} from "./PluginRegistryTransitionPlan.js";

export type TransitionStepKind = "stop" | "restart" | "start";

export interface TransitionStepStop {
  readonly kind: "stop";
  readonly pluginId: string;
  readonly reason: PluginTransitionStop["reason"];
}

export interface TransitionStepRestart {
  readonly kind: "restart";
  readonly pluginId: string;
  readonly previousManifest: PluginManifest;
  readonly nextManifest: PluginManifest;
  readonly reason: PluginTransitionRestart["reason"];
}

export interface TransitionStepStart {
  readonly kind: "start";
  readonly pluginId: string;
  readonly manifest: PluginManifest;
}

export type TransitionStep =
  | TransitionStepStop
  | TransitionStepRestart
  | TransitionStepStart;

export interface PluginRegistryTransitionOrderOptions {
  /**
   * If true, throw `PluginDependencyCycleError` instead of
   * silently falling back to id-asc when either registry has a
   * dependency cycle. Default: false (best-effort ordering).
   */
  readonly throwOnCycle?: boolean;
}

/**
 * Compute the execution-ordered step sequence for a transition
 * plan. Caller passes the plan plus the two registries that
 * produced it (so we can build the old + new dependency graphs
 * for ordering).
 *
 * Pure transform. Never throws unless `throwOnCycle: true`.
 */
export function orderPluginRegistryTransition(
  plan: PluginRegistryTransitionPlan,
  oldRegistry: PluginRegistryManifest,
  newRegistry: PluginRegistryManifest,
  options: PluginRegistryTransitionOrderOptions = {},
): readonly TransitionStep[] {
  const oldOrder = safeLoadOrder(oldRegistry, options.throwOnCycle === true);
  const newOrder = safeLoadOrder(newRegistry, options.throwOnCycle === true);

  const oldRank = idRank(oldOrder);
  const newRank = idRank(newOrder);

  // STOP bucket: order by REVERSE OLD load order (dependents drop
  // before their deps). Plugins not in oldRank (shouldn't happen
  // for a well-formed plan, but be defensive) get bumped to the
  // end via Infinity so they don't poison ordering.
  const stops = [...plan.toStop]
    .map((s) => ({
      step: {
        kind: "stop",
        pluginId: s.pluginId,
        reason: s.reason,
      } as TransitionStepStop,
      rank: oldRank.get(s.pluginId) ?? Number.POSITIVE_INFINITY,
    }))
    .sort(
      (a, b) =>
        b.rank - a.rank || a.step.pluginId.localeCompare(b.step.pluginId),
    )
    .map((e) => e.step);

  // RESTART bucket: order by NEW load order (dep first, dependent
  // last). A restarted dependency is up before a restarted
  // dependent re-enables.
  const restarts = [...plan.toRestart]
    .map((r) => ({
      step: {
        kind: "restart",
        pluginId: r.pluginId,
        previousManifest: r.previousManifest,
        nextManifest: r.nextManifest,
        reason: r.reason,
      } as TransitionStepRestart,
      rank: newRank.get(r.pluginId) ?? Number.POSITIVE_INFINITY,
    }))
    .sort(
      (a, b) =>
        a.rank - b.rank || a.step.pluginId.localeCompare(b.step.pluginId),
    )
    .map((e) => e.step);

  // START bucket: NEW load order (dep first).
  const starts = [...plan.toStart]
    .map((s) => ({
      step: {
        kind: "start",
        pluginId: s.pluginId,
        manifest: s.manifest,
      } as TransitionStepStart,
      rank: newRank.get(s.pluginId) ?? Number.POSITIVE_INFINITY,
    }))
    .sort(
      (a, b) =>
        a.rank - b.rank || a.step.pluginId.localeCompare(b.step.pluginId),
    )
    .map((e) => e.step);

  return [...stops, ...restarts, ...starts];
}

/**
 * Build a `PluginCatalog` from a registry and ask for its
 * `loadOrder()`. If the catalog throws (cycle, malformed deps)
 * and the caller didn't ask for strict-throw, fall back to the
 * registry's natural id-sort order so the caller still gets a
 * usable sequence (the executor will surface its own errors when
 * it actually tries to load a cyclic plugin).
 */
function safeLoadOrder(
  registry: PluginRegistryManifest,
  throwOnCycle: boolean,
): readonly PluginManifest[] {
  try {
    const catalog = new PluginCatalog(registry.plugins);
    return catalog.loadOrder();
  } catch (e) {
    if (throwOnCycle) throw e;
    // Best-effort fallback: stable id-sort so ordering at least
    // exists. The plan still gets executed; cyclic plugins will
    // fail later in the loader and surface their own errors.
    return [...registry.plugins].sort((a, b) => a.id.localeCompare(b.id));
  }
}

function idRank(order: readonly PluginManifest[]): Map<string, number> {
  const map = new Map<string, number>();
  for (let i = 0; i < order.length; i++) {
    map.set(order[i].id, i);
  }
  return map;
}
