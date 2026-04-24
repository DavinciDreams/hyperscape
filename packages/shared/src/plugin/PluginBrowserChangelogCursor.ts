/**
 * Persistent "last seen" pointer into a
 * {@link PluginBrowserChangelogState} so the Plugin Browser can
 * surface an **unread** badge and a "new changes since your last
 * visit" banner.
 *
 * State is caller-owned and serializable (single nullable number),
 * matching the suppression-state pattern from
 * {@link PluginBrowserToastSuppression}.
 *
 * Pure transform. Never throws.
 */

import type {
  PluginBrowserChangelogEntry,
  PluginBrowserChangelogState,
} from "./PluginBrowserChangelog.js";
import type { PluginRowSummarySeverity } from "./PluginBrowserRowSummary.js";

export interface PluginBrowserChangelogCursorState {
  /**
   * Timestamp of the newest entry the user has already seen.
   * `null` means the cursor has never advanced — every entry in
   * the changelog counts as unread.
   */
  readonly lastSeenTimestamp: number | null;
}

export function emptyPluginBrowserChangelogCursor(): PluginBrowserChangelogCursorState {
  return { lastSeenTimestamp: null };
}

export interface PluginBrowserChangelogUnreadReport {
  readonly unreadCount: number;
  readonly unreadEntries: readonly PluginBrowserChangelogEntry[];
  /** Worst severity across unread entries, or null if none. */
  readonly worstSeverity: PluginRowSummarySeverity | null;
}

const SEVERITY_RANK: Readonly<Record<PluginRowSummarySeverity, number>> = {
  ok: 0,
  info: 1,
  warning: 2,
  error: 3,
};

function worseSeverity(
  a: PluginRowSummarySeverity,
  b: PluginRowSummarySeverity,
): PluginRowSummarySeverity {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}

/**
 * Compute the set of entries newer than the cursor's last-seen
 * timestamp. Entries exactly at the cursor's timestamp are
 * considered **already seen** (strict `>` comparison).
 */
export function unreadPluginBrowserChangelog(
  state: PluginBrowserChangelogState,
  cursor: PluginBrowserChangelogCursorState,
): PluginBrowserChangelogUnreadReport {
  const last = cursor.lastSeenTimestamp;
  const unreadEntries: PluginBrowserChangelogEntry[] = [];
  let worst: PluginRowSummarySeverity | null = null;

  for (const e of state.entries) {
    if (last !== null && e.timestamp <= last) continue;
    unreadEntries.push(e);
    worst =
      worst === null
        ? e.intent.severity
        : worseSeverity(worst, e.intent.severity);
  }

  return {
    unreadCount: unreadEntries.length,
    unreadEntries,
    worstSeverity: worst,
  };
}

/**
 * Advance the cursor to the newest timestamp currently in the
 * changelog. Idempotent: if the cursor already leads the changelog
 * or the changelog is empty, returns the same state reference.
 */
export function markPluginBrowserChangelogSeen(
  state: PluginBrowserChangelogState,
  cursor: PluginBrowserChangelogCursorState,
): PluginBrowserChangelogCursorState {
  if (state.entries.length === 0) return cursor;
  let newest = state.entries[0].timestamp;
  for (let i = 1; i < state.entries.length; i += 1) {
    const ts = state.entries[i].timestamp;
    if (ts > newest) newest = ts;
  }
  if (cursor.lastSeenTimestamp !== null && cursor.lastSeenTimestamp >= newest) {
    return cursor;
  }
  return { lastSeenTimestamp: newest };
}

/**
 * Explicitly place the cursor at a specific timestamp. Useful when
 * hydrating from storage or rewinding to show an older window as
 * "new" (QA/debug only; production should prefer
 * {@link markPluginBrowserChangelogSeen}).
 */
export function setPluginBrowserChangelogCursor(
  timestamp: number | null,
): PluginBrowserChangelogCursorState {
  return { lastSeenTimestamp: timestamp };
}
