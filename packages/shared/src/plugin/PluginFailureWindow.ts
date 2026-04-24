/**
 * Per-plugin failure-window projection. Counts failed lifecycle events
 * inside a rolling time window (default last 24h relative to a
 * caller-supplied `now` wallclock). Powers the Plugin Details pane's
 * "recent failures" line and the row-level "X recent failures" badge
 * when the failure rate spikes.
 *
 * Pure transform. Never throws.
 */

import type {
  PluginLifecycleEvent,
  PluginLifecycleOutcome,
} from "./PluginLifecycleJournal.js";
import type { LifecyclePhase } from "./PluginLoader.js";

export interface PluginFailureWindowEntry {
  readonly at: number;
  readonly phase: LifecyclePhase;
  readonly outcome: PluginLifecycleOutcome; // always "failed" but kept for symmetry
}

export interface PluginFailureWindow {
  readonly pluginId: string;
  /** Inclusive lower bound of the window (`now - windowMs`). */
  readonly windowStart: number;
  /** Upper bound of the window (`now`). */
  readonly windowEnd: number;
  readonly windowMs: number;
  readonly failureCount: number;
  /** Per-phase failure counts inside the window. */
  readonly perPhase: Readonly<Record<LifecyclePhase, number>>;
  readonly entries: readonly PluginFailureWindowEntry[]; // oldest-first
}

export interface BuildPluginFailureWindowOptions {
  /** Window length in ms. Default: 24h (86_400_000). */
  readonly windowMs?: number;
  /** Wallclock anchor; defaults to `Date.now()`. */
  readonly now?: number;
}

const DEFAULT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h

export function buildPluginFailureWindow(
  pluginId: string,
  events: readonly PluginLifecycleEvent[],
  options: BuildPluginFailureWindowOptions = {},
): PluginFailureWindow {
  const windowMs = Math.max(1, options.windowMs ?? DEFAULT_WINDOW_MS);
  const now = options.now ?? Date.now();
  const windowStart = now - windowMs;

  const perPhase: Record<LifecyclePhase, number> = {
    load: 0,
    enable: 0,
    disable: 0,
  };
  const entries: PluginFailureWindowEntry[] = [];

  for (const e of events) {
    if (e.pluginId !== pluginId) continue;
    if (e.outcome !== "failed") continue;
    if (e.at < windowStart || e.at > now) continue;
    perPhase[e.phase] += 1;
    entries.push({ at: e.at, phase: e.phase, outcome: e.outcome });
  }

  // Sort oldest-first — events may arrive out of order (the journal
  // is a fixed-capacity ring buffer with no monotonic-time guarantee).
  entries.sort((a, b) => a.at - b.at);

  return {
    pluginId,
    windowStart,
    windowEnd: now,
    windowMs,
    failureCount: entries.length,
    perPhase,
    entries,
  };
}
