/**
 * Pure "recently viewed" plugin-id memory for the Plugin
 * Browser sidebar. Drives the "Recent" section + the
 * command-palette "recent plugins" suggestion group.
 *
 * Complements but is distinct from:
 * - {@link PluginBrowserSearchHistory} — remembers recent *queries*.
 * - {@link PluginBrowserScrollMemory}  — remembers scroll per *view*.
 * - {@link PluginBrowserFavorites}     — unordered star set.
 *
 * Semantics:
 * - LRU by record time (most-recent first).
 * - Re-recording an existing id promotes it to the head and
 *   bumps its timestamp.
 * - Default capacity 20. `capacity: 0` disables storage (every
 *   record becomes a no-op); negative / non-finite → default.
 *
 * Pure state. Caller-owned instance (not a singleton). Never
 * throws. Unknown / empty ids are silent no-ops.
 */

const DEFAULT_CAPACITY = 20;

export interface PluginBrowserRecentlyViewedEntry {
  readonly pluginId: string;
  /** `Date.now()`-style ms. Caller-supplied for deterministic tests. */
  readonly recordedAtMs: number;
}

export interface PluginBrowserRecentlyViewedOptions {
  /**
   * Maximum entries to retain. Default 20. `0` disables
   * storage; negative / non-finite → default.
   */
  readonly capacity?: number;
  /**
   * Seed entries. Duplicates silently deduped (last wins);
   * empty ids dropped; capped to capacity from the tail.
   */
  readonly initialEntries?: readonly PluginBrowserRecentlyViewedEntry[];
}

export interface PluginBrowserRecentlyViewed {
  /** Effective capacity (after clamp). */
  capacity(): number;
  /** Number of retained entries. */
  size(): number;
  /** True when `pluginId` is in the history. */
  has(pluginId: string): boolean;
  /**
   * Record a view. Promotes to head; evicts the oldest on
   * overflow. Returns `true` when anything changed (always
   * false when capacity is 0 or the id is invalid).
   */
  record(pluginId: string, nowMs: number): boolean;
  /**
   * Drop `pluginId` from the history. Returns `true` when a
   * change occurred.
   */
  drop(pluginId: string): boolean;
  /** Drop every entry. */
  clear(): void;
  /**
   * Most-recent-first snapshot (head = most recent).
   */
  recent(): readonly PluginBrowserRecentlyViewedEntry[];
  /** Plugin ids in most-recent-first order. */
  recentIds(): readonly string[];
  /** Most-recent entry, or `undefined` when empty. */
  mostRecent(): PluginBrowserRecentlyViewedEntry | undefined;
}

function clampCapacity(raw: number | undefined): number {
  if (raw === undefined) return DEFAULT_CAPACITY;
  if (!Number.isFinite(raw)) return DEFAULT_CAPACITY;
  const k = Math.trunc(raw);
  if (k < 0) return DEFAULT_CAPACITY;
  return k;
}

/**
 * Create a caller-owned recently-viewed memory.
 */
export function createPluginBrowserRecentlyViewed(
  options: PluginBrowserRecentlyViewedOptions = {},
): PluginBrowserRecentlyViewed {
  const cap = clampCapacity(options.capacity);
  // Map preserves insertion order. We keep OLDEST at head,
  // NEWEST at tail; snapshots reverse for most-recent-first.
  const map = new Map<string, number>();

  function evictOldest(): void {
    while (map.size > cap) {
      const oldest = map.keys().next();
      if (oldest.done) break;
      map.delete(oldest.value);
    }
  }

  if (cap > 0 && options.initialEntries) {
    for (const entry of options.initialEntries) {
      if (
        !entry ||
        typeof entry.pluginId !== "string" ||
        entry.pluginId.length === 0 ||
        typeof entry.recordedAtMs !== "number" ||
        !Number.isFinite(entry.recordedAtMs)
      ) {
        continue;
      }
      // Last-wins dedup: delete then re-insert.
      if (map.has(entry.pluginId)) map.delete(entry.pluginId);
      map.set(entry.pluginId, entry.recordedAtMs);
    }
    evictOldest();
  }

  return {
    capacity(): number {
      return cap;
    },
    size(): number {
      return map.size;
    },
    has(pluginId: string): boolean {
      if (typeof pluginId !== "string" || pluginId.length === 0) {
        return false;
      }
      return map.has(pluginId);
    },
    record(pluginId: string, nowMs: number): boolean {
      if (cap === 0) return false;
      if (typeof pluginId !== "string" || pluginId.length === 0) {
        return false;
      }
      if (typeof nowMs !== "number" || !Number.isFinite(nowMs)) {
        return false;
      }
      // Promote-to-tail.
      if (map.has(pluginId)) map.delete(pluginId);
      map.set(pluginId, nowMs);
      evictOldest();
      return true;
    },
    drop(pluginId: string): boolean {
      if (typeof pluginId !== "string" || pluginId.length === 0) {
        return false;
      }
      return map.delete(pluginId);
    },
    clear(): void {
      map.clear();
    },
    recent(): readonly PluginBrowserRecentlyViewedEntry[] {
      const out: PluginBrowserRecentlyViewedEntry[] = [];
      for (const [pluginId, recordedAtMs] of map) {
        out.push({ pluginId, recordedAtMs });
      }
      // Map holds oldest→newest; reverse for most-recent-first.
      out.reverse();
      return out;
    },
    recentIds(): readonly string[] {
      const out: string[] = [];
      for (const id of map.keys()) out.push(id);
      out.reverse();
      return out;
    },
    mostRecent(): PluginBrowserRecentlyViewedEntry | undefined {
      let last: PluginBrowserRecentlyViewedEntry | undefined;
      for (const [pluginId, recordedAtMs] of map) {
        last = { pluginId, recordedAtMs };
      }
      return last;
    },
  };
}
