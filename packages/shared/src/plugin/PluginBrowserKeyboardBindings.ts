/**
 * Pure transform that maps keyboard events (in a DOM-free shape) to
 * {@link PluginBrowserAction} values. Lets the React Plugin Browser
 * panel handle keyboard shortcuts without forking action-dispatch
 * logic into the view layer and without coupling this module to
 * the DOM.
 *
 * Contract: take a normalized key event + the current state + the
 * currently-visible row list, and either return an action to
 * dispatch or `null` when no binding matches.
 *
 * Pure transforms. Never throw.
 */

import type {
  PluginBrowserAction,
  PluginBrowserState,
} from "./PluginBrowserReducer.js";
import type { PluginBrowserRowSummary } from "./PluginBrowserRowSummary.js";

/**
 * DOM-free shape of the subset of a `KeyboardEvent` we need.
 * React components can construct one of these from their synthetic
 * event without importing the DOM type.
 */
export interface PluginBrowserKeyboardEvent {
  readonly key: string;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  readonly shiftKey?: boolean;
  readonly altKey?: boolean;
}

export interface PluginBrowserKeyboardBindingsContext {
  /**
   * The rows currently rendered in the table, in display order.
   * Used to resolve "next row" / "previous row" relative to
   * `state.selectedPluginId`. When empty, arrow-key nav is a no-op.
   */
  readonly visibleRows: readonly PluginBrowserRowSummary[];
}

/**
 * Map a keyboard event to a Plugin Browser action. Returns `null`
 * when the event is not bound.
 *
 * Bindings:
 * - `Escape` → `clearSelection` when a row is selected
 * - `ArrowDown` / `j` → select the row below the current selection
 *   (wraps to first row when nothing selected or selection stale)
 * - `ArrowUp` / `k` → select the row above (wraps to last row)
 * - `Home` → select the first visible row
 * - `End` → select the last visible row
 * - `m` → `markAllSeen`
 * - `c` with Ctrl/Meta → `clearChangelog`
 *
 * Events with `altKey` active or whose non-modifier `key` is an
 * unknown binding return `null`.
 */
export function pluginBrowserActionForKey(
  event: PluginBrowserKeyboardEvent,
  state: PluginBrowserState,
  context: PluginBrowserKeyboardBindingsContext,
): PluginBrowserAction | null {
  if (event.altKey) return null;

  const ctrlOrMeta = Boolean(event.ctrlKey || event.metaKey);

  if (event.key === "Escape" && !ctrlOrMeta && !event.shiftKey) {
    return state.selectedPluginId === null ? null : { type: "clearSelection" };
  }

  if (event.key === "m" && !ctrlOrMeta && !event.shiftKey) {
    return { type: "markAllSeen" };
  }

  if (event.key === "c" && ctrlOrMeta && !event.shiftKey) {
    return { type: "clearChangelog" };
  }

  if (
    (event.key === "ArrowDown" || event.key === "j") &&
    !ctrlOrMeta &&
    !event.shiftKey
  ) {
    const next = neighborRow(state, context.visibleRows, "next");
    return next ? { type: "selectPlugin", pluginId: next.pluginId } : null;
  }

  if (
    (event.key === "ArrowUp" || event.key === "k") &&
    !ctrlOrMeta &&
    !event.shiftKey
  ) {
    const prev = neighborRow(state, context.visibleRows, "prev");
    return prev ? { type: "selectPlugin", pluginId: prev.pluginId } : null;
  }

  if (event.key === "Home" && !ctrlOrMeta && !event.shiftKey) {
    const first = context.visibleRows[0];
    return first ? { type: "selectPlugin", pluginId: first.pluginId } : null;
  }

  if (event.key === "End" && !ctrlOrMeta && !event.shiftKey) {
    const last = context.visibleRows[context.visibleRows.length - 1];
    return last ? { type: "selectPlugin", pluginId: last.pluginId } : null;
  }

  return null;
}

function neighborRow(
  state: PluginBrowserState,
  visibleRows: readonly PluginBrowserRowSummary[],
  direction: "next" | "prev",
): PluginBrowserRowSummary | null {
  if (visibleRows.length === 0) return null;

  // When nothing is selected (or selection is stale), step into the
  // appropriate end of the list.
  const selectedIndex =
    state.selectedPluginId === null
      ? -1
      : visibleRows.findIndex((r) => r.pluginId === state.selectedPluginId);

  if (selectedIndex === -1) {
    return direction === "next"
      ? visibleRows[0]
      : visibleRows[visibleRows.length - 1];
  }

  if (direction === "next") {
    const nextIndex = (selectedIndex + 1) % visibleRows.length;
    return visibleRows[nextIndex];
  }
  const prevIndex =
    (selectedIndex - 1 + visibleRows.length) % visibleRows.length;
  return visibleRows[prevIndex];
}
