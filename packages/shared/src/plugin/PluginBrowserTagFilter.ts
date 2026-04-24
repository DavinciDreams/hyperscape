/**
 * Pure tag-membership filter for the Plugin Browser. Separate
 * from both full-text search ({@link PluginBrowserSearchIndex})
 * and severity filters ({@link PluginBrowserSeverityFilter}):
 * this one narrows rows by *authored tags*.
 *
 * Two orthogonal sets:
 * - `requireTags` — a row passes only when it has **all** of these.
 * - `excludeTags` — a row fails when it has **any** of these.
 *
 * The same tag cannot appear in both sets at once. Adding a tag
 * to one set implicitly removes it from the other.
 *
 * Pure state. Caller-owned instance (not a singleton). Never
 * throws. Unknown / empty tag strings are silent no-ops. Tag
 * comparison is case-sensitive.
 */

export interface PluginBrowserTagFilterOptions {
  readonly initialRequireTags?: readonly string[];
  readonly initialExcludeTags?: readonly string[];
}

export interface PluginBrowserTagFilterSnapshot {
  readonly requireTags: readonly string[];
  readonly excludeTags: readonly string[];
}

export interface PluginBrowserTagFilter {
  /** True when no require/exclude tags are set. */
  isEmpty(): boolean;
  /** Tags currently in the require set (insertion order). */
  requireTags(): readonly string[];
  /** Tags currently in the exclude set (insertion order). */
  excludeTags(): readonly string[];
  /** Snapshot of both sets. */
  snapshot(): PluginBrowserTagFilterSnapshot;
  /**
   * Add `tag` to the require set (removing it from exclude
   * first if present). Returns true when a change occurred.
   */
  requireTag(tag: string): boolean;
  /**
   * Add `tag` to the exclude set (removing it from require
   * first if present). Returns true when a change occurred.
   */
  excludeTag(tag: string): boolean;
  /**
   * Remove `tag` from both sets. Returns true when a change
   * occurred.
   */
  unsetTag(tag: string): boolean;
  /**
   * Flip `tag` through the three states:
   *   neutral → require → exclude → neutral.
   */
  cycleTag(tag: string): void;
  /** Clear both sets. */
  clear(): void;
  /** Classification of `tag`. */
  stateOf(tag: string): "require" | "exclude" | "neutral";
  /**
   * True when a row with the given tag bag satisfies the
   * current filter. `rowTags` is treated as an unordered set
   * (duplicates inside it are collapsed). An empty filter
   * always matches.
   */
  matches(rowTags: readonly string[]): boolean;
}

/**
 * Create a caller-owned tag-filter state machine.
 */
export function createPluginBrowserTagFilter(
  options: PluginBrowserTagFilterOptions = {},
): PluginBrowserTagFilter {
  const require = new Set<string>();
  const exclude = new Set<string>();

  if (options.initialRequireTags) {
    for (const t of options.initialRequireTags) {
      if (typeof t !== "string" || t.length === 0) continue;
      require.add(t);
    }
  }
  if (options.initialExcludeTags) {
    for (const t of options.initialExcludeTags) {
      if (typeof t !== "string" || t.length === 0) continue;
      // Exclude wins over require when a seed collides: drop
      // it from require and place into exclude.
      require.delete(t);
      exclude.add(t);
    }
  }

  function requireImpl(tag: string): boolean {
    if (typeof tag !== "string" || tag.length === 0) return false;
    const wasInExclude = exclude.delete(tag);
    const wasInRequire = require.has(tag);
    if (wasInRequire && !wasInExclude) return false;
    require.add(tag);
    return true;
  }

  function excludeImpl(tag: string): boolean {
    if (typeof tag !== "string" || tag.length === 0) return false;
    const wasInRequire = require.delete(tag);
    const wasInExclude = exclude.has(tag);
    if (wasInExclude && !wasInRequire) return false;
    exclude.add(tag);
    return true;
  }

  function unsetImpl(tag: string): boolean {
    if (typeof tag !== "string" || tag.length === 0) return false;
    const a = require.delete(tag);
    const b = exclude.delete(tag);
    return a || b;
  }

  return {
    isEmpty(): boolean {
      return require.size === 0 && exclude.size === 0;
    },
    requireTags(): readonly string[] {
      return [...require];
    },
    excludeTags(): readonly string[] {
      return [...exclude];
    },
    snapshot(): PluginBrowserTagFilterSnapshot {
      return {
        requireTags: [...require],
        excludeTags: [...exclude],
      };
    },
    requireTag(tag: string): boolean {
      return requireImpl(tag);
    },
    excludeTag(tag: string): boolean {
      return excludeImpl(tag);
    },
    unsetTag(tag: string): boolean {
      return unsetImpl(tag);
    },
    cycleTag(tag: string): void {
      if (typeof tag !== "string" || tag.length === 0) return;
      if (require.has(tag)) {
        require.delete(tag);
        exclude.add(tag);
        return;
      }
      if (exclude.has(tag)) {
        exclude.delete(tag);
        return;
      }
      require.add(tag);
    },
    clear(): void {
      require.clear();
      exclude.clear();
    },
    stateOf(tag: string): "require" | "exclude" | "neutral" {
      if (typeof tag !== "string" || tag.length === 0) {
        return "neutral";
      }
      if (require.has(tag)) return "require";
      if (exclude.has(tag)) return "exclude";
      return "neutral";
    },
    matches(rowTags: readonly string[]): boolean {
      if (require.size === 0 && exclude.size === 0) return true;
      const bag = new Set<string>();
      for (const t of rowTags) {
        if (typeof t === "string" && t.length > 0) bag.add(t);
      }
      for (const r of require) {
        if (!bag.has(r)) return false;
      }
      for (const e of exclude) {
        if (bag.has(e)) return false;
      }
      return true;
    },
  };
}
