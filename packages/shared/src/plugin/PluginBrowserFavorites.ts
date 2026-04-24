/**
 * Pure "starred"-plugin state for the Plugin Browser. Drives
 * the star icon column + the "Favorites" saved filter.
 *
 * Distinct from {@link PluginBrowserPinnedRows}:
 * - Favorites are an **unordered set** (membership only).
 * - Pinned rows are an **ordered list** that renders at the
 *   top of the grid.
 * - A plugin can be *favorite-only*, *pinned-only*, both, or
 *   neither.
 *
 * Pure state. Caller-owned instance (not a singleton). Never
 * throws. Unknown / empty ids are silent no-ops.
 */

export interface PluginBrowserFavoritesOptions {
  /**
   * Initial favorite ids. Duplicates silently deduped;
   * empty strings dropped.
   */
  readonly initialFavorites?: readonly string[];
}

export interface PluginBrowserFavorites {
  /** Number of starred plugins. */
  size(): number;
  /** True when `pluginId` is starred. */
  isFavorite(pluginId: string): boolean;
  /**
   * Star a plugin. Returns `true` when a change occurred
   * (`false` when it was already starred or invalid).
   */
  add(pluginId: string): boolean;
  /**
   * Unstar a plugin. Returns `true` when a change occurred.
   */
  remove(pluginId: string): boolean;
  /** Flip the current favorite state. */
  toggle(pluginId: string): void;
  /** Unstar every plugin. */
  clear(): void;
  /**
   * Favorite ids in insertion order. (Insertion order is
   * stable per `add()`; re-adding an existing id does NOT
   * move it.)
   */
  favoriteIds(): readonly string[];
}

/**
 * Create a caller-owned favorites manager.
 */
export function createPluginBrowserFavorites(
  options: PluginBrowserFavoritesOptions = {},
): PluginBrowserFavorites {
  // Set preserves insertion order.
  const set = new Set<string>();

  if (options.initialFavorites) {
    for (const id of options.initialFavorites) {
      if (typeof id !== "string" || id.length === 0) continue;
      set.add(id); // Set.add dedupes silently
    }
  }

  function addImpl(pluginId: string): boolean {
    if (typeof pluginId !== "string" || pluginId.length === 0) {
      return false;
    }
    if (set.has(pluginId)) return false;
    set.add(pluginId);
    return true;
  }

  function removeImpl(pluginId: string): boolean {
    if (typeof pluginId !== "string" || pluginId.length === 0) {
      return false;
    }
    return set.delete(pluginId);
  }

  return {
    size(): number {
      return set.size;
    },
    isFavorite(pluginId: string): boolean {
      if (typeof pluginId !== "string" || pluginId.length === 0) {
        return false;
      }
      return set.has(pluginId);
    },
    add(pluginId: string): boolean {
      return addImpl(pluginId);
    },
    remove(pluginId: string): boolean {
      return removeImpl(pluginId);
    },
    toggle(pluginId: string): void {
      if (typeof pluginId !== "string" || pluginId.length === 0) {
        return;
      }
      if (set.has(pluginId)) removeImpl(pluginId);
      else addImpl(pluginId);
    },
    clear(): void {
      set.clear();
    },
    favoriteIds(): readonly string[] {
      return [...set];
    },
  };
}
