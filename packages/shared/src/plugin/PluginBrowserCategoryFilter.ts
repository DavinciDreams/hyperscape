/**
 * Pure multi-select category filter for the Plugin Browser
 * with AND/OR match-mode toggle. The caller supplies each
 * plugin's category set at query time; this module only
 * stores the selected categories + the match mode and
 * exposes a `matches(pluginCategories)` predicate.
 *
 * Semantics:
 *   - Empty selection → `matches` returns `true` for every
 *     plugin (no filter active).
 *   - `mode === "any"` (OR) → plugin matches if it has
 *     *any* selected category.
 *   - `mode === "all"` (AND) → plugin matches only if it
 *     has *every* selected category.
 *
 * Distinct from:
 *   - `PluginBrowserTagFilter` — tag-based filtering
 *     (tags are freeform strings attached to plugins).
 *   - `PluginBrowserSearch` — free-text search ranking.
 *
 * Pure state, caller-owned, never throws. Invalid input
 * silently no-op'd.
 */

export type PluginBrowserCategoryMatchMode = "any" | "all";

export interface PluginBrowserCategoryFilter {
  /** Add a category to the selection. Returns false if already present or empty. */
  add(categoryId: string): boolean;
  /** Remove a category from the selection. Returns false if absent or empty. */
  remove(categoryId: string): boolean;
  /**
   * Toggle a category. Returns true when now selected,
   * false when now deselected or invalid.
   */
  toggle(categoryId: string): boolean;
  /** Replace the entire selection. Empty strings / dupes silently dropped. */
  setAll(categoryIds: readonly string[]): void;
  /** Current selection, insertion order. */
  selected(): readonly string[];
  /** True iff `categoryId` is selected. */
  isSelected(categoryId: string): boolean;
  /** Number of selected categories. */
  count(): number;
  /** Current match mode. */
  mode(): PluginBrowserCategoryMatchMode;
  /** Set match mode. Returns false when unchanged / invalid. */
  setMode(mode: PluginBrowserCategoryMatchMode): boolean;
  /**
   * Predicate — does a plugin with `pluginCategories` match
   * the current filter? Empty selection = no filter = `true`.
   */
  matches(pluginCategories: readonly string[]): boolean;
  /** Clear selection (mode preserved). */
  clear(): void;
}

const VALID_MODES: readonly PluginBrowserCategoryMatchMode[] = ["any", "all"];

function isValidId(s: unknown): s is string {
  return typeof s === "string" && s.length > 0;
}

function isValidMode(m: unknown): m is PluginBrowserCategoryMatchMode {
  return (
    typeof m === "string" && (VALID_MODES as readonly string[]).includes(m)
  );
}

/**
 * Create a caller-owned category filter. Default mode is
 * `"any"` (OR).
 */
export function createPluginBrowserCategoryFilter(
  initialMode: PluginBrowserCategoryMatchMode = "any",
): PluginBrowserCategoryFilter {
  const selected: string[] = [];
  let mode: PluginBrowserCategoryMatchMode = isValidMode(initialMode)
    ? initialMode
    : "any";

  function indexOf(id: string): number {
    for (let i = 0; i < selected.length; i++) {
      if (selected[i] === id) return i;
    }
    return -1;
  }

  return {
    add(categoryId: string): boolean {
      if (!isValidId(categoryId)) return false;
      if (indexOf(categoryId) >= 0) return false;
      selected.push(categoryId);
      return true;
    },
    remove(categoryId: string): boolean {
      if (!isValidId(categoryId)) return false;
      const idx = indexOf(categoryId);
      if (idx < 0) return false;
      selected.splice(idx, 1);
      return true;
    },
    toggle(categoryId: string): boolean {
      if (!isValidId(categoryId)) return false;
      const idx = indexOf(categoryId);
      if (idx < 0) {
        selected.push(categoryId);
        return true;
      }
      selected.splice(idx, 1);
      return false;
    },
    setAll(categoryIds: readonly string[]): void {
      if (!Array.isArray(categoryIds)) return;
      selected.length = 0;
      const seen = new Set<string>();
      for (const id of categoryIds) {
        if (!isValidId(id)) continue;
        if (seen.has(id)) continue;
        seen.add(id);
        selected.push(id);
      }
    },
    selected(): readonly string[] {
      return selected.slice();
    },
    isSelected(categoryId: string): boolean {
      if (!isValidId(categoryId)) return false;
      return indexOf(categoryId) >= 0;
    },
    count(): number {
      return selected.length;
    },
    mode(): PluginBrowserCategoryMatchMode {
      return mode;
    },
    setMode(newMode: PluginBrowserCategoryMatchMode): boolean {
      if (!isValidMode(newMode)) return false;
      if (mode === newMode) return false;
      mode = newMode;
      return true;
    },
    matches(pluginCategories: readonly string[]): boolean {
      if (selected.length === 0) return true;
      if (!Array.isArray(pluginCategories)) return false;
      const pcSet = new Set<string>();
      for (const c of pluginCategories) {
        if (isValidId(c)) pcSet.add(c);
      }
      if (mode === "any") {
        for (const s of selected) if (pcSet.has(s)) return true;
        return false;
      }
      for (const s of selected) if (!pcSet.has(s)) return false;
      return true;
    },
    clear(): void {
      selected.length = 0;
    },
  };
}
