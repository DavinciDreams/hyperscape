/**
 * Per-plugin stability metrics derived from a `PluginLifecycleEvent`
 * stream. Powers the "Stability" subsection of the Plugin Details
 * pane and the per-plugin trend column in the Plugin Browser.
 *
 * Pure transform. Caller supplies the events (typically
 * `journal.forPlugin(id)` or `journal.all()`). Order-preserving.
 */

import type { PluginLifecycleEvent } from "./PluginLifecycleJournal.js";
import type { LifecyclePhase } from "./PluginLoader.js";

/**
 * Counters keyed by lifecycle phase. We pre-declare the four phases
 * so output shape is stable even when one bucket has no events.
 */
export interface PluginLifecyclePhaseCounts {
  readonly load: { readonly success: number; readonly failed: number };
  readonly enable: { readonly success: number; readonly failed: number };
  readonly disable: { readonly success: number; readonly failed: number };
}

export interface PluginLifecycleStats {
  readonly pluginId: string;
  readonly totalEvents: number;
  readonly successCount: number;
  readonly failedCount: number;
  /** `failedCount === 0 ? null : (successCount + failedCount > 0 ? success/(success+failed) : null)` */
  readonly successRate: number | null;
  readonly lastEventAt: number | null;
  readonly lastFailureAt: number | null;
  /** Number of consecutive failed events at the tail of the stream. */
  readonly consecutiveTrailingFailures: number;
  readonly phases: PluginLifecyclePhaseCounts;
}

/**
 * Build stats for a single plugin id. Filters the input stream to
 * matching events, then aggregates. Caller is free to pre-filter
 * (e.g. by time window) before passing in.
 */
export function buildPluginLifecycleStats(
  pluginId: string,
  events: readonly PluginLifecycleEvent[],
): PluginLifecycleStats {
  const phases = emptyPhaseCounts();
  let successCount = 0;
  let failedCount = 0;
  let totalEvents = 0;
  let lastEventAt: number | null = null;
  let lastFailureAt: number | null = null;

  for (const e of events) {
    if (e.pluginId !== pluginId) continue;
    totalEvents += 1;
    lastEventAt = lastEventAt === null ? e.at : Math.max(lastEventAt, e.at);
    if (e.outcome === "success") {
      successCount += 1;
      bumpPhase(phases, e.phase, "success");
    } else {
      failedCount += 1;
      bumpPhase(phases, e.phase, "failed");
      lastFailureAt =
        lastFailureAt === null ? e.at : Math.max(lastFailureAt, e.at);
    }
  }

  const consecutiveTrailingFailures = countTrailingFailures(events, pluginId);
  const denom = successCount + failedCount;
  const successRate = denom === 0 ? null : successCount / denom;

  return {
    pluginId,
    totalEvents,
    successCount,
    failedCount,
    successRate,
    lastEventAt,
    lastFailureAt,
    consecutiveTrailingFailures,
    phases,
  };
}

/**
 * Build stats for every distinct pluginId mentioned in the stream.
 * Insertion order follows first-mention order so callers get a
 * deterministic iteration.
 */
export function buildPluginLifecycleStatsByPlugin(
  events: readonly PluginLifecycleEvent[],
): ReadonlyMap<string, PluginLifecycleStats> {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const e of events) {
    if (!seen.has(e.pluginId)) {
      seen.add(e.pluginId);
      ids.push(e.pluginId);
    }
  }
  const out = new Map<string, PluginLifecycleStats>();
  for (const id of ids) {
    out.set(id, buildPluginLifecycleStats(id, events));
  }
  return out;
}

function emptyPhaseCounts(): PluginLifecyclePhaseCounts {
  return {
    load: { success: 0, failed: 0 },
    enable: { success: 0, failed: 0 },
    disable: { success: 0, failed: 0 },
  };
}

type WritablePhaseCounts = {
  -readonly [K in keyof PluginLifecyclePhaseCounts]: {
    -readonly [O in keyof PluginLifecyclePhaseCounts[K]]: number;
  };
};

function bumpPhase(
  phases: PluginLifecyclePhaseCounts,
  phase: LifecyclePhase,
  outcome: "success" | "failed",
): void {
  // Cast through writable mirror so we can increment the readonly
  // shape without exposing mutability to callers.
  (phases as WritablePhaseCounts)[phase][outcome] += 1;
}

function countTrailingFailures(
  events: readonly PluginLifecycleEvent[],
  pluginId: string,
): number {
  let count = 0;
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.pluginId !== pluginId) continue;
    if (e.outcome !== "failed") break;
    count += 1;
  }
  return count;
}
