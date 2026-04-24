/**
 * Activity-feed helpers for `PluginLifecycleJournal`.
 *
 * The journal is append-only with oldest-first retrieval. Editor
 * panels (Plugin Browser right-pane, dev-console status bar)
 * typically want most-recent-first slices: the last N events for
 * one plugin, the last N events globally, and aggregate counts
 * over a window. This module provides those views as pure-logic
 * reducers over an event stream, so they stay deterministic in
 * tests and cheap to recompute on every frame.
 *
 * The source is always a `PluginLifecycleEvent[]` (or the journal's
 * `all()` snapshot) — callers can pre-filter (e.g. to a time
 * window) and pass the filtered array in.
 */

import type {
  PluginLifecycleEvent,
  PluginLifecycleOutcome,
} from "./PluginLifecycleJournal.js";
import type { LifecyclePhase } from "./PluginLoader.js";

export interface ActivitySummary {
  readonly total: number;
  readonly successes: number;
  readonly failures: number;
  readonly byPhase: Readonly<Record<LifecyclePhase, number>>;
  readonly byOutcome: Readonly<Record<PluginLifecycleOutcome, number>>;
}

/**
 * Group events by plugin, most-recent-first within each bucket.
 *
 * `limit` caps the per-plugin slice; omit for no cap. The returned
 * Map iterates in first-seen order (insertion order of each
 * plugin's earliest event in the input).
 */
export function buildActivityFeedByPlugin(
  events: readonly PluginLifecycleEvent[],
  limit?: number,
): Map<string, PluginLifecycleEvent[]> {
  validateLimit(limit);
  const out = new Map<string, PluginLifecycleEvent[]>();
  for (const ev of events) {
    const bucket = out.get(ev.pluginId);
    if (bucket) {
      bucket.push(ev);
    } else {
      out.set(ev.pluginId, [ev]);
    }
  }
  for (const [id, bucket] of out) {
    bucket.reverse();
    if (limit !== undefined && bucket.length > limit) {
      out.set(id, bucket.slice(0, limit));
    }
  }
  return out;
}

/**
 * Global most-recent-first feed across every plugin. `limit` caps
 * the returned slice; omit for the full reverse-order stream.
 */
export function buildRecentActivityFeed(
  events: readonly PluginLifecycleEvent[],
  limit?: number,
): PluginLifecycleEvent[] {
  validateLimit(limit);
  const reversed = [...events].reverse();
  return limit !== undefined ? reversed.slice(0, limit) : reversed;
}

/**
 * Aggregate counts over the input slice. Useful for status bars
 * showing "N successes, M failures since boot" or a per-window
 * summary when the caller pre-filters by timestamp.
 */
export function summarizeActivity(
  events: readonly PluginLifecycleEvent[],
): ActivitySummary {
  const byPhase: Record<LifecyclePhase, number> = {
    load: 0,
    enable: 0,
    disable: 0,
  };
  const byOutcome: Record<PluginLifecycleOutcome, number> = {
    success: 0,
    failed: 0,
  };
  let successes = 0;
  let failures = 0;
  for (const ev of events) {
    byPhase[ev.phase]++;
    byOutcome[ev.outcome]++;
    if (ev.outcome === "success") successes++;
    else failures++;
  }
  return {
    total: events.length,
    successes,
    failures,
    byPhase,
    byOutcome,
  };
}

function validateLimit(limit: number | undefined): void {
  if (limit === undefined) return;
  if (!Number.isInteger(limit) || limit < 0) {
    throw new RangeError(
      `activity-feed limit must be a non-negative integer (got ${String(limit)})`,
    );
  }
}
