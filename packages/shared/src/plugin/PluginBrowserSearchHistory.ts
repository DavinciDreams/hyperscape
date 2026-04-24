/**
 * Pure search-history memory for the Plugin Browser search
 * box. Powers the "recent searches" dropdown: on each submit
 * the query is recorded, duplicates refresh to the top, and
 * the list is capped to a caller-chosen capacity.
 *
 * Pure state. Caller-owned instance (not a singleton). Never
 * throws.
 *
 * Invariants:
 * - Queries are trimmed on the way in. Whitespace-only queries
 *   are silent no-ops (nothing useful to record).
 * - Case sensitivity is configurable — default is
 *   case-insensitive dedup (match dropdowns that treat
 *   "Error" and "error" as the same entry) but the ORIGINAL
 *   casing of the most-recent write is preserved.
 * - Capacity 0 disables history entirely.
 */

export interface PluginBrowserSearchHistoryOptions {
  /**
   * Maximum number of remembered queries. Defaults to `20`.
   * Set to `0` to disable history entirely. Non-finite or
   * negative values fall back to the default.
   */
  readonly capacity?: number;
  /**
   * Initial history, most-recent first. Duplicates are
   * silently deduped. Empty / whitespace-only entries are
   * dropped. Entries beyond `capacity` are truncated.
   */
  readonly initialEntries?: readonly string[];
  /**
   * When `true`, dedup is case-sensitive. Defaults to
   * `false` (case-insensitive dedup).
   */
  readonly caseSensitive?: boolean;
}

export interface PluginBrowserSearchHistory {
  /** Number of remembered queries. */
  size(): number;
  /** Configured capacity (read-only; set at creation). */
  capacity(): number;
  /** Whether dedup is case-sensitive. */
  caseSensitive(): boolean;
  /**
   * Record a search query. Trimmed on input;
   * whitespace-only queries are silent no-ops. Duplicates
   * move to the head (most-recent position) with the new
   * casing preserved. Eviction from the tail honors the
   * configured capacity.
   */
  record(query: string): void;
  /**
   * Remove one query. Matching respects
   * {@link caseSensitive}. Unknown queries are silent no-ops.
   */
  remove(query: string): void;
  /** Drop every remembered query. */
  clear(): void;
  /**
   * Remembered queries, most-recent first. Returns the
   * *stored* strings (preserving original casing).
   */
  entries(): readonly string[];
  /**
   * True when `query` matches a remembered entry under the
   * active case-sensitivity rule. Empty / non-string queries
   * return false.
   */
  has(query: string): boolean;
}

const DEFAULT_CAPACITY = 20;

function normalize(s: string, caseSensitive: boolean): string {
  const t = s.trim();
  return caseSensitive ? t : t.toLowerCase();
}

/**
 * Create a caller-owned search-history manager. Pass
 * `capacity: 0` to disable history storage entirely while
 * keeping the API surface intact.
 */
export function createPluginBrowserSearchHistory(
  options: PluginBrowserSearchHistoryOptions = {},
): PluginBrowserSearchHistory {
  const rawCap = options.capacity;
  const capacity =
    typeof rawCap === "number" && Number.isFinite(rawCap)
      ? Math.max(0, Math.floor(rawCap))
      : DEFAULT_CAPACITY;
  const caseSensitive = options.caseSensitive === true;

  // entries[0] = most-recent.
  const entries: string[] = [];
  // dedup key → index-in-entries (kept in sync on every
  // mutation).
  const index = new Map<string, number>();

  function rebuildIndex(): void {
    index.clear();
    for (let i = 0; i < entries.length; i += 1) {
      index.set(normalize(entries[i], caseSensitive), i);
    }
  }

  if (options.initialEntries && capacity > 0) {
    for (const raw of options.initialEntries) {
      if (typeof raw !== "string") continue;
      const trimmed = raw.trim();
      if (trimmed.length === 0) continue;
      const key = caseSensitive ? trimmed : trimmed.toLowerCase();
      if (index.has(key)) continue; // first-wins dedup
      entries.push(trimmed);
      index.set(key, entries.length - 1);
      if (entries.length >= capacity) break;
    }
  }

  return {
    size(): number {
      return entries.length;
    },
    capacity(): number {
      return capacity;
    },
    caseSensitive(): boolean {
      return caseSensitive;
    },
    record(query: string): void {
      if (typeof query !== "string") return;
      const trimmed = query.trim();
      if (trimmed.length === 0) return;
      if (capacity === 0) return;

      const key = caseSensitive ? trimmed : trimmed.toLowerCase();
      // Remove existing occurrence.
      if (index.has(key)) {
        const existing = index.get(key)!;
        entries.splice(existing, 1);
      }
      // Insert at head.
      entries.unshift(trimmed);
      // Evict tail.
      while (entries.length > capacity) entries.pop();
      rebuildIndex();
    },
    remove(query: string): void {
      if (typeof query !== "string") return;
      const trimmed = query.trim();
      if (trimmed.length === 0) return;
      const key = caseSensitive ? trimmed : trimmed.toLowerCase();
      const i = index.get(key);
      if (i === undefined) return;
      entries.splice(i, 1);
      rebuildIndex();
    },
    clear(): void {
      entries.length = 0;
      index.clear();
    },
    entries(): readonly string[] {
      return entries.slice();
    },
    has(query: string): boolean {
      if (typeof query !== "string") return false;
      const trimmed = query.trim();
      if (trimmed.length === 0) return false;
      const key = caseSensitive ? trimmed : trimmed.toLowerCase();
      return index.has(key);
    },
  };
}
