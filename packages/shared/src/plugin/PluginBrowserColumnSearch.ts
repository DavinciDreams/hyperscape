/**
 * Pure per-column search-input state for the Plugin Browser
 * list pane. Each declared column can carry a text search
 * query that the consumer applies as a column-scoped filter
 * (separate from the global search covered by
 * {@link PluginBrowserSearchIndex}).
 *
 * Use case: spreadsheet-style "filter-per-column" where the
 * severity column has its own `error` filter input, the
 * pluginId column has a `com.acme.*` prefix input, etc.
 *
 * Pure state. Caller-owned instance (not a singleton). Never
 * throws.
 *
 * Invariants:
 * - Queries are always trimmed on the way in. A whitespace-
 *   only query is treated as "cleared".
 * - Unknown column ids are silent no-ops (persisted state
 *   survives column-set evolution).
 * - Declared column order is preserved across all listing
 *   methods.
 * - Duplicate ids at creation are silently deduped (first
 *   wins).
 */

export interface PluginBrowserColumnSearchDefinition {
  readonly id: string;
  /** Initial query. Defaults to `""` (inactive). */
  readonly defaultQuery?: string;
}

export interface PluginBrowserColumnSearchSnapshot {
  readonly id: string;
  readonly query: string;
  readonly isActive: boolean;
}

export interface PluginBrowserColumnSearch {
  /** Count of columns ever declared. */
  size(): number;
  /** True when the column `id` exists. */
  hasColumn(id: string): boolean;
  /** Current query for a column, or `""` for unknown id. */
  searchOf(id: string): string;
  /** True when the column has a non-empty trimmed query. */
  hasActiveSearch(id: string): boolean;
  /**
   * Set a user-typed query. The value is trimmed; a
   * whitespace-only string clears the column. Unknown ids are
   * silent no-ops.
   */
  setSearch(id: string, query: string): void;
  /** Clear one column. Unknown ids are silent no-ops. */
  clearSearch(id: string): void;
  /** Clear every column. */
  clearAll(): void;
  /**
   * Column ids with a non-empty query, in authored order.
   */
  activeColumns(): readonly string[];
  /** Count of columns with a non-empty query. */
  activeCount(): number;
  /** True iff at least one column has a non-empty query. */
  isActive(): boolean;
  /**
   * Snapshot per column (authored order). Includes both
   * active and inactive columns.
   */
  snapshot(): readonly PluginBrowserColumnSearchSnapshot[];
}

/**
 * Create a caller-owned column-search manager from an
 * authored column list. Authored order is preserved in
 * {@link PluginBrowserColumnSearch.activeColumns} and
 * {@link PluginBrowserColumnSearch.snapshot}.
 */
export function createPluginBrowserColumnSearch(
  columns: readonly PluginBrowserColumnSearchDefinition[],
): PluginBrowserColumnSearch {
  interface Entry {
    readonly id: string;
    query: string;
  }

  const byId = new Map<string, Entry>();
  const order: string[] = [];

  for (const c of columns) {
    if (byId.has(c.id)) continue; // dedupe — first wins
    const raw = typeof c.defaultQuery === "string" ? c.defaultQuery : "";
    byId.set(c.id, { id: c.id, query: raw.trim() });
    order.push(c.id);
  }

  return {
    size(): number {
      return order.length;
    },
    hasColumn(id: string): boolean {
      return byId.has(id);
    },
    searchOf(id: string): string {
      return byId.get(id)?.query ?? "";
    },
    hasActiveSearch(id: string): boolean {
      const e = byId.get(id);
      return !!e && e.query.length > 0;
    },
    setSearch(id: string, query: string): void {
      const e = byId.get(id);
      if (!e) return;
      if (typeof query !== "string") return;
      e.query = query.trim();
    },
    clearSearch(id: string): void {
      const e = byId.get(id);
      if (!e) return;
      e.query = "";
    },
    clearAll(): void {
      for (const id of order) {
        byId.get(id)!.query = "";
      }
    },
    activeColumns(): readonly string[] {
      const out: string[] = [];
      for (const id of order) {
        if (byId.get(id)!.query.length > 0) out.push(id);
      }
      return out;
    },
    activeCount(): number {
      let n = 0;
      for (const id of order) {
        if (byId.get(id)!.query.length > 0) n += 1;
      }
      return n;
    },
    isActive(): boolean {
      for (const id of order) {
        if (byId.get(id)!.query.length > 0) return true;
      }
      return false;
    },
    snapshot(): readonly PluginBrowserColumnSearchSnapshot[] {
      return order.map((id) => {
        const e = byId.get(id)!;
        return {
          id: e.id,
          query: e.query,
          isActive: e.query.length > 0,
        };
      });
    },
  };
}
