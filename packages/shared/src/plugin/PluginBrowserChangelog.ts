/**
 * Persistent ring-buffer history of
 * {@link PluginBrowserToastIntent}s across many refreshes.
 *
 * Distinct from the toast surface: toasts are transient and show
 * only the latest delta, whereas the changelog accumulates every
 * refresh's intents and feeds the "Recent Changes" timeline in the
 * Plugin Browser details pane.
 *
 * Pure transform. Never throws.
 */

import type { PluginRowSummarySeverity } from "./PluginBrowserRowSummary.js";
import type {
  PluginBrowserToastIntent,
  PluginBrowserToastKind,
} from "./PluginBrowserToastRouter.js";

export interface PluginBrowserChangelogEntry {
  /** Unique across all entries, `${timestamp}:${indexWithinRefresh}`. */
  readonly id: string;
  /** Refresh-time this intent was recorded at. */
  readonly timestamp: number;
  readonly intent: PluginBrowserToastIntent;
}

export interface PluginBrowserChangelogState {
  readonly entries: readonly PluginBrowserChangelogEntry[];
  /** Ring-buffer capacity. Oldest entries dropped when exceeded. */
  readonly maxEntries: number;
}

export const DEFAULT_MAX_CHANGELOG_ENTRIES = 200;

export function emptyPluginBrowserChangelog(
  maxEntries: number = DEFAULT_MAX_CHANGELOG_ENTRIES,
): PluginBrowserChangelogState {
  const cap = Math.max(1, maxEntries | 0);
  return { entries: [], maxEntries: cap };
}

export interface AppendPluginBrowserChangelogOptions {
  readonly intents: readonly PluginBrowserToastIntent[];
  readonly now: number;
}

export function appendPluginBrowserChangelog(
  state: PluginBrowserChangelogState,
  options: AppendPluginBrowserChangelogOptions,
): PluginBrowserChangelogState {
  if (options.intents.length === 0) return state;
  const newEntries: PluginBrowserChangelogEntry[] = options.intents.map(
    (intent, index) => ({
      id: `${options.now}:${index}`,
      timestamp: options.now,
      intent,
    }),
  );
  const combined = state.entries.concat(newEntries);
  const overflow = combined.length - state.maxEntries;
  const entries = overflow > 0 ? combined.slice(overflow) : combined;
  return { entries, maxEntries: state.maxEntries };
}

export interface PluginBrowserChangelogFilter {
  readonly pluginId?: string;
  readonly kinds?: readonly PluginBrowserToastKind[];
  readonly severities?: readonly PluginRowSummarySeverity[];
  /** Inclusive lower bound on timestamp. */
  readonly sinceMs?: number;
}

export function filterPluginBrowserChangelog(
  state: PluginBrowserChangelogState,
  filter: PluginBrowserChangelogFilter,
): readonly PluginBrowserChangelogEntry[] {
  const kindSet = filter.kinds ? new Set(filter.kinds) : null;
  const sevSet = filter.severities ? new Set(filter.severities) : null;
  return state.entries.filter((e) => {
    if (filter.pluginId && e.intent.pluginId !== filter.pluginId) {
      return false;
    }
    if (kindSet && !kindSet.has(e.intent.kind)) return false;
    if (sevSet && !sevSet.has(e.intent.severity)) return false;
    if (filter.sinceMs !== undefined && e.timestamp < filter.sinceMs) {
      return false;
    }
    return true;
  });
}

/**
 * Convenience: drop entries strictly older than `now - retainMs`.
 * Complements `maxEntries`-based ring-buffer trimming with a
 * time-based pruner for long-running editor sessions that go idle.
 */
export function prunePluginBrowserChangelog(
  state: PluginBrowserChangelogState,
  options: { readonly now: number; readonly retainMs: number },
): PluginBrowserChangelogState {
  const cutoff = options.now - options.retainMs;
  const entries = state.entries.filter((e) => e.timestamp >= cutoff);
  if (entries.length === state.entries.length) return state;
  return { entries, maxEntries: state.maxEntries };
}
