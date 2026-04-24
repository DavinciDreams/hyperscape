/**
 * Composite projection that builds the **details-pane view model**
 * for the currently-selected plugin: the row, the recent per-plugin
 * changelog entries, and how many of those are still unread.
 *
 * This module exists so the React details pane has a single,
 * pure-logic call site — no scattered state reads, no ad-hoc
 * filters. Upstream, it composes primitives from:
 *  - `PluginBrowserSelectors` (row lookup + stale detection)
 *  - `PluginBrowserChangelog` (per-plugin filter)
 *  - `PluginBrowserChangelogView` (unread predicate via cursor)
 *
 * Pure transforms / helpers. Never throw.
 */

import type { PluginBrowserState } from "./PluginBrowserReducer.js";
import type { PluginBrowserRowSummary } from "./PluginBrowserRowSummary.js";
import type { PluginBrowserChangelogEntry } from "./PluginBrowserChangelog.js";
import { filterPluginBrowserChangelog } from "./PluginBrowserChangelog.js";

/** Render-ready shape for the details pane. */
export interface PluginBrowserDetailsViewModel {
  /** True when a plugin is currently selected. */
  readonly isOpen: boolean;
  /** Selected plugin id, or null when no selection. */
  readonly pluginId: string | null;
  /** The row for that plugin, or null when stale / no selection. */
  readonly row: PluginBrowserRowSummary | null;
  /**
   * True when `pluginId` is set but the row no longer exists in the
   * current snapshot — the plugin was removed while the pane was
   * open. Consumers should render a "plugin removed" state.
   */
  readonly isStale: boolean;
  /**
   * Most-recent changelog entries for this plugin, newest-first.
   * Empty array when no plugin is selected.
   */
  readonly recentChangelog: readonly PluginBrowserChangelogEntry[];
  /**
   * How many entries in `recentChangelog` are still unread against
   * the current cursor. Zero when no plugin is selected.
   */
  readonly unreadCount: number;
}

export interface BuildPluginBrowserDetailsViewModelOptions {
  /**
   * Maximum number of per-plugin changelog entries to include.
   * Default: 20. Oldest entries dropped; newest kept.
   */
  readonly recentLimit?: number;
}

/** Default cap on per-plugin changelog entries in the details pane. */
export const DEFAULT_DETAILS_CHANGELOG_LIMIT = 20;

/**
 * Build the details-pane view model. Returns the closed/empty
 * shape when no plugin is selected — callers can use
 * `viewModel.isOpen` as the single branch.
 */
export function buildPluginBrowserDetailsViewModel(
  state: PluginBrowserState,
  options: BuildPluginBrowserDetailsViewModelOptions = {},
): PluginBrowserDetailsViewModel {
  const pluginId = state.selectedPluginId;
  if (pluginId === null) {
    return {
      isOpen: false,
      pluginId: null,
      row: null,
      isStale: false,
      recentChangelog: EMPTY,
      unreadCount: 0,
    };
  }

  const row = state.currentSnapshot.get(pluginId) ?? null;
  const isStale = row === null;

  const limit = Math.max(
    0,
    options.recentLimit ?? DEFAULT_DETAILS_CHANGELOG_LIMIT,
  );

  // filterPluginBrowserChangelog preserves insertion order (oldest
  // first). We want newest-first, so reverse after slicing.
  const filtered = filterPluginBrowserChangelog(state.changelog, { pluginId });
  const newestFirst = filtered.slice().reverse();
  const recentChangelog = limit === 0 ? EMPTY : newestFirst.slice(0, limit);

  const cursor = state.cursor.lastSeenTimestamp;
  let unreadCount = 0;
  if (cursor === null) {
    unreadCount = recentChangelog.length;
  } else {
    for (const e of recentChangelog) {
      if (e.timestamp > cursor) unreadCount += 1;
    }
  }

  return {
    isOpen: true,
    pluginId,
    row,
    isStale,
    recentChangelog,
    unreadCount,
  };
}

const EMPTY: readonly PluginBrowserChangelogEntry[] = Object.freeze([]);
