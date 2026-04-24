/**
 * Pure keyboard focus navigation over an ordered plugin-id list.
 *
 * Drives the Plugin Browser editor panel's arrow-key / PageUp /
 * PageDown / Home / End keyboard UX without touching the DOM.
 *
 * Rules:
 *  - Empty list -> always returns `null`.
 *  - `current` not in list -> `next` / `prev` land on the first id
 *    (i.e. pretend focus was just before the list). `pageUp` /
 *    `pageDown` land on first / last respectively. `home` -> first,
 *    `end` -> last. `first` / `last` behave the same way.
 *  - Wrap-around is opt-in via `wrap: true`. When off, `next` at the
 *    last row and `prev` at the first row return the same id (no-op).
 *  - `pageSize` clamps to >= 1 (defaults to 10).
 *
 * Pure transform. Never throws. Never mutates input.
 */

export type PluginBrowserFocusCommand =
  | "first"
  | "last"
  | "home"
  | "end"
  | "next"
  | "prev"
  | "pageDown"
  | "pageUp";

export interface PluginBrowserFocusNavigatorOptions {
  /** Step size for pageDown / pageUp. Clamped to >= 1. Default 10. */
  readonly pageSize?: number;
  /** When true, next/prev at the edges wrap. Default false. */
  readonly wrap?: boolean;
}

const DEFAULT_PAGE_SIZE = 10;

/**
 * Compute the next focused plugin id after applying `command` to
 * the ordered list `pluginIds` starting from `current` focus.
 *
 * Returns `null` iff the list is empty.
 */
export function nextFocusedPluginId(
  pluginIds: readonly string[],
  current: string | null,
  command: PluginBrowserFocusCommand,
  options: PluginBrowserFocusNavigatorOptions = {},
): string | null {
  const n = pluginIds.length;
  if (n === 0) return null;

  const pageSize = Math.max(
    1,
    Math.floor(options.pageSize ?? DEFAULT_PAGE_SIZE),
  );
  const wrap = options.wrap === true;

  const currentIndex = current === null ? -1 : pluginIds.indexOf(current);

  switch (command) {
    case "first":
    case "home":
      return pluginIds[0];

    case "last":
    case "end":
      return pluginIds[n - 1];

    case "next": {
      if (currentIndex < 0) return pluginIds[0];
      if (currentIndex >= n - 1) return wrap ? pluginIds[0] : pluginIds[n - 1];
      return pluginIds[currentIndex + 1];
    }

    case "prev": {
      if (currentIndex < 0) return pluginIds[0];
      if (currentIndex <= 0) return wrap ? pluginIds[n - 1] : pluginIds[0];
      return pluginIds[currentIndex - 1];
    }

    case "pageDown": {
      if (currentIndex < 0) return pluginIds[0];
      const target = currentIndex + pageSize;
      return pluginIds[target >= n ? n - 1 : target];
    }

    case "pageUp": {
      if (currentIndex < 0) return pluginIds[0];
      const target = currentIndex - pageSize;
      return pluginIds[target < 0 ? 0 : target];
    }
  }
}
