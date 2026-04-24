/**
 * Pure scroll-position memory for the Plugin Browser list
 * pane. Remembers `scrollTop` per named "view key" (e.g. a
 * filter tab, a severity preset, a pinned search) so that
 * navigating away and back restores the user's position.
 *
 * Pure state. Caller-owned instance (not a singleton). Never
 * throws.
 *
 * Design notes:
 * - View keys are opaque strings owned by the consumer.
 * - Values are stored as integers (floored, clamped to ≥0).
 * - An optional `capacity` imposes a simple LRU eviction when
 *   the map grows past the limit — keeps persisted state from
 *   ballooning as users create ad-hoc filter combinations.
 * - Non-finite `scrollTop` inputs (NaN, Infinity) and empty
 *   view keys are silent no-ops.
 */

export interface PluginBrowserScrollEntry {
  readonly viewKey: string;
  readonly scrollTop: number;
}

export interface PluginBrowserScrollMemoryOptions {
  /**
   * Maximum number of remembered view keys. When exceeded,
   * the least-recently-written entry is evicted. Defaults to
   * `64`. Set to `0` to disable memory entirely (all writes
   * are silent no-ops).
   */
  readonly capacity?: number;
}

export interface PluginBrowserScrollMemory {
  /** Number of remembered view keys. */
  size(): number;
  /** True when `viewKey` has a remembered position. */
  has(viewKey: string): boolean;
  /**
   * Remembered position for `viewKey`, or `0` when unknown.
   */
  get(viewKey: string): number;
  /**
   * Record a position for `viewKey`. Value is floored and
   * clamped to ≥0. Empty keys + non-finite values are silent
   * no-ops.
   */
  remember(viewKey: string, scrollTop: number): void;
  /** Forget one entry. Unknown keys are silent no-ops. */
  forget(viewKey: string): void;
  /** Forget every entry. */
  forgetAll(): void;
  /** Entries in least-recently-written → most-recent order. */
  snapshot(): readonly PluginBrowserScrollEntry[];
  /** Effective capacity (read-only; set at creation). */
  capacity(): number;
}

const DEFAULT_CAPACITY = 64;

/**
 * Create a caller-owned scroll memory. Pass `capacity: 0` to
 * disable memory entirely (useful for ephemeral views where
 * you only want the API but no storage).
 */
export function createPluginBrowserScrollMemory(
  options: PluginBrowserScrollMemoryOptions = {},
): PluginBrowserScrollMemory {
  const rawCap = options.capacity;
  const capacity =
    typeof rawCap === "number" && Number.isFinite(rawCap)
      ? Math.max(0, Math.floor(rawCap))
      : DEFAULT_CAPACITY;

  // Insertion-ordered Map doubles as our LRU: on write,
  // delete + re-set to move to tail.
  const byKey = new Map<string, number>();

  return {
    size(): number {
      return byKey.size;
    },
    capacity(): number {
      return capacity;
    },
    has(viewKey: string): boolean {
      if (typeof viewKey !== "string" || viewKey.length === 0) {
        return false;
      }
      return byKey.has(viewKey);
    },
    get(viewKey: string): number {
      if (typeof viewKey !== "string" || viewKey.length === 0) {
        return 0;
      }
      return byKey.get(viewKey) ?? 0;
    },
    remember(viewKey: string, scrollTop: number): void {
      if (typeof viewKey !== "string" || viewKey.length === 0) {
        return;
      }
      if (!Number.isFinite(scrollTop)) return;
      if (capacity === 0) return;
      const v = Math.max(0, Math.floor(scrollTop));
      // Move-to-tail for LRU ordering.
      if (byKey.has(viewKey)) byKey.delete(viewKey);
      byKey.set(viewKey, v);
      // Evict oldest.
      while (byKey.size > capacity) {
        const oldest = byKey.keys().next().value as string | undefined;
        if (oldest === undefined) break;
        byKey.delete(oldest);
      }
    },
    forget(viewKey: string): void {
      if (typeof viewKey !== "string" || viewKey.length === 0) {
        return;
      }
      byKey.delete(viewKey);
    },
    forgetAll(): void {
      byKey.clear();
    },
    snapshot(): readonly PluginBrowserScrollEntry[] {
      const out: PluginBrowserScrollEntry[] = [];
      for (const [viewKey, scrollTop] of byKey) {
        out.push({ viewKey, scrollTop });
      }
      return out;
    },
  };
}
