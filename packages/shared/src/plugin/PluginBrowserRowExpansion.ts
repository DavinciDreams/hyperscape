/**
 * Pure row-expansion state for the Plugin Browser list pane.
 * Tracks which rows are in the "expanded" position so the UI
 * can render inline sub-rows (dependency trees, contribution
 * lists, nested changelog entries).
 *
 * Pure state. Caller-owned instance (not a singleton). Never
 * throws.
 *
 * Design notes:
 * - Row ids are opaque strings owned by the consumer.
 * - `defaultExpanded` controls the baseline: when `false`
 *   (the default) only explicitly-expanded ids render open;
 *   when `true` every row is open unless explicitly collapsed.
 * - State for a row id is retained even when the underlying
 *   row disappears (e.g. from filtering) — so the user's
 *   expansion choice survives a filter change. Use
 *   {@link PluginBrowserRowExpansion.prune} to drop stale
 *   entries when you know the canonical row set.
 */

export interface PluginBrowserRowExpansionOptions {
  /**
   * Initial set of expanded row ids. Duplicates are silently
   * deduped; empty strings are ignored.
   */
  readonly initiallyExpanded?: readonly string[];
  /**
   * Baseline expansion for rows with no recorded state.
   * Defaults to `false` (rows start collapsed).
   */
  readonly defaultExpanded?: boolean;
}

export interface PluginBrowserRowExpansion {
  /** Count of rows with *explicit* state (either direction). */
  size(): number;
  /** Current default-expanded baseline (read-only). */
  defaultExpanded(): boolean;
  /** True when `rowId` renders open. */
  isExpanded(rowId: string): boolean;
  /** Explicitly expand a row. Empty ids are silent no-ops. */
  expand(rowId: string): void;
  /** Explicitly collapse a row. Empty ids are silent no-ops. */
  collapse(rowId: string): void;
  /** Flip the current expansion of a row. */
  toggle(rowId: string): void;
  /** Explicitly expand each id. */
  expandAll(rowIds: readonly string[]): void;
  /** Explicitly collapse each id. */
  collapseAll(rowIds: readonly string[]): void;
  /**
   * Drop any explicit state for ids NOT in `knownIds`.
   * Silent no-op when `knownIds` is empty.
   */
  prune(knownIds: readonly string[]): void;
  /** Drop every explicit state entry. */
  reset(): void;
  /**
   * Ids that the state map marks as expanded, in insertion
   * order. (Does NOT synthesize ids from the
   * `defaultExpanded = true` baseline — only returns entries
   * the map actually has.)
   */
  explicitlyExpandedIds(): readonly string[];
  /**
   * Ids that the state map marks as collapsed, in insertion
   * order.
   */
  explicitlyCollapsedIds(): readonly string[];
}

/**
 * Create a caller-owned row-expansion manager.
 */
export function createPluginBrowserRowExpansion(
  options: PluginBrowserRowExpansionOptions = {},
): PluginBrowserRowExpansion {
  const baseline = options.defaultExpanded === true ? true : false;

  // true = explicitly expanded, false = explicitly collapsed.
  const state = new Map<string, boolean>();

  if (options.initiallyExpanded) {
    for (const id of options.initiallyExpanded) {
      if (typeof id !== "string" || id.length === 0) continue;
      // Only keep the FIRST occurrence of a duplicate id —
      // matches our existing dedupe-first-wins pattern across
      // the plugin state modules.
      if (!state.has(id)) state.set(id, true);
    }
  }

  function collectWhere(want: boolean): readonly string[] {
    const out: string[] = [];
    for (const [id, v] of state) {
      if (v === want) out.push(id);
    }
    return out;
  }

  return {
    size(): number {
      return state.size;
    },
    defaultExpanded(): boolean {
      return baseline;
    },
    isExpanded(rowId: string): boolean {
      if (typeof rowId !== "string" || rowId.length === 0) {
        return baseline;
      }
      const v = state.get(rowId);
      return v === undefined ? baseline : v;
    },
    expand(rowId: string): void {
      if (typeof rowId !== "string" || rowId.length === 0) {
        return;
      }
      state.set(rowId, true);
    },
    collapse(rowId: string): void {
      if (typeof rowId !== "string" || rowId.length === 0) {
        return;
      }
      state.set(rowId, false);
    },
    toggle(rowId: string): void {
      if (typeof rowId !== "string" || rowId.length === 0) {
        return;
      }
      const current = state.get(rowId) ?? baseline;
      state.set(rowId, !current);
    },
    expandAll(rowIds: readonly string[]): void {
      for (const id of rowIds) {
        if (typeof id !== "string" || id.length === 0) continue;
        state.set(id, true);
      }
    },
    collapseAll(rowIds: readonly string[]): void {
      for (const id of rowIds) {
        if (typeof id !== "string" || id.length === 0) continue;
        state.set(id, false);
      }
    },
    prune(knownIds: readonly string[]): void {
      if (knownIds.length === 0) return;
      const known = new Set<string>(
        knownIds.filter(
          (id): id is string => typeof id === "string" && id.length > 0,
        ),
      );
      for (const id of [...state.keys()]) {
        if (!known.has(id)) state.delete(id);
      }
    },
    reset(): void {
      state.clear();
    },
    explicitlyExpandedIds(): readonly string[] {
      return collectWhere(true);
    },
    explicitlyCollapsedIds(): readonly string[] {
      return collectWhere(false);
    },
  };
}
