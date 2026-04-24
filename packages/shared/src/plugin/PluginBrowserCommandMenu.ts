/**
 * Pure projection that lists the user-invokable commands available
 * in the current Plugin Browser state, each with an English label,
 * a keyboard-shortcut hint (matching
 * {@link pluginBrowserActionForKey}), and the `PluginBrowserAction`
 * to dispatch when the command is invoked.
 *
 * Drives the "Command Menu" button in the React panel: on click,
 * render the list of entries, wire each to
 * `dispatch(entry.action)`. Also usable for an omnibar-style
 * fuzzy-search palette — the `category` field bucketizes entries
 * for grouped rendering.
 *
 * Pure transforms. Never throw.
 */

import type {
  PluginBrowserAction,
  PluginBrowserState,
} from "./PluginBrowserReducer.js";

export type PluginBrowserCommandCategory =
  | "selection"
  | "navigation"
  | "changelog";

export interface PluginBrowserCommandEntry {
  /** Stable id for list virtualization / telemetry. */
  readonly id: string;
  readonly category: PluginBrowserCommandCategory;
  /** English fallback label. */
  readonly label: string;
  /**
   * Short description of what the command does, suitable for a
   * secondary line in the menu row.
   */
  readonly description: string;
  /**
   * Human-readable shortcut hint, e.g. "Esc", "m", "Ctrl+C".
   * Matches the bindings in
   * {@link pluginBrowserActionForKey}. `null` when the command is
   * mouse-/menu-only.
   */
  readonly shortcut: string | null;
  /** Is the command currently available? */
  readonly enabled: boolean;
  /** Action to dispatch when invoked. */
  readonly action: PluginBrowserAction;
}

export interface BuildPluginBrowserCommandMenuOptions {
  /**
   * Report disabled commands too, so the menu row can be rendered
   * greyed-out. When `false` (default), disabled commands are
   * filtered out entirely.
   */
  readonly includeDisabled?: boolean;
}

/**
 * Build the command menu for the given state. Entries appear in
 * a stable order: selection-category commands first, then
 * navigation, then changelog. Disabled commands are omitted by
 * default; pass `includeDisabled: true` to get them greyed-out
 * in the menu.
 */
export function buildPluginBrowserCommandMenu(
  state: PluginBrowserState,
  options: BuildPluginBrowserCommandMenuOptions = {},
): readonly PluginBrowserCommandEntry[] {
  const includeDisabled = options.includeDisabled === true;
  const hasSelection = state.selectedPluginId !== null;
  const hasChangelog = state.changelog.entries.length > 0;
  const hasUnread = computeHasUnread(state);

  const out: PluginBrowserCommandEntry[] = [];

  out.push({
    id: "selection/clear",
    category: "selection",
    label: "Close details pane",
    description: "Dismiss the currently-selected plugin.",
    shortcut: "Esc",
    enabled: hasSelection,
    action: { type: "clearSelection" },
  });

  out.push({
    id: "changelog/mark-all-seen",
    category: "changelog",
    label: "Mark changelog as read",
    description: "Advance the unread cursor to the latest entry.",
    shortcut: "m",
    enabled: hasUnread,
    action: { type: "markAllSeen" },
  });

  out.push({
    id: "changelog/clear",
    category: "changelog",
    label: "Clear changelog history",
    description: "Discard all recorded intents and reset the cursor.",
    shortcut: "Ctrl+C",
    enabled: hasChangelog,
    action: { type: "clearChangelog" },
  });

  return includeDisabled ? out : out.filter((e) => e.enabled);
}

function computeHasUnread(state: PluginBrowserState): boolean {
  const last = state.cursor.lastSeenTimestamp;
  if (state.changelog.entries.length === 0) return false;
  if (last === null) return true;
  for (const e of state.changelog.entries) {
    if (e.timestamp > last) return true;
  }
  return false;
}

/**
 * Convenience: case-insensitive substring filter over the command
 * menu. Matches against label + description. Returns entries in
 * the same order {@link buildPluginBrowserCommandMenu} produced —
 * ranking by relevance is left to the caller.
 */
export function filterPluginBrowserCommandMenu(
  entries: readonly PluginBrowserCommandEntry[],
  query: string,
): readonly PluginBrowserCommandEntry[] {
  const q = query.trim().toLowerCase();
  if (q === "") return entries;
  return entries.filter((e) => {
    const haystack = `${e.label} ${e.description}`.toLowerCase();
    return haystack.includes(q);
  });
}
