/**
 * Pure per-plugin rating-distribution cache for the Plugin
 * Browser. Stores the 5-bucket histogram (`1..5` stars)
 * published by the marketplace for each plugin plus a
 * derived `average` and `total`. Re-setting a plugin's
 * distribution replaces all five buckets atomically.
 *
 * This is a *read-side* cache — the caller fetches from the
 * marketplace and stores here; nothing in this module
 * performs I/O.
 *
 * Distinct from:
 *   - `PluginBrowserReviewDraft` — single-author review
 *     composer.
 *   - `PluginBrowserReviewList` — list-of-review content.
 *
 * Pure state, caller-owned, never throws. Invalid input
 * silently no-op'd.
 */

export interface PluginBrowserRatingBuckets {
  readonly star1: number;
  readonly star2: number;
  readonly star3: number;
  readonly star4: number;
  readonly star5: number;
}

export interface PluginBrowserRatingDistributionEntry {
  readonly pluginId: string;
  readonly buckets: PluginBrowserRatingBuckets;
  readonly total: number;
  readonly average: number;
}

export interface PluginBrowserRatingDistribution {
  /**
   * Set (or replace) the histogram for `pluginId`. All
   * bucket counts must be non-negative finite integers.
   * Returns false on empty pluginId or any invalid bucket.
   * Idempotent on identical buckets (returns false).
   */
  set(pluginId: string, buckets: PluginBrowserRatingBuckets): boolean;
  /** Entry for `pluginId`, or undefined. */
  get(pluginId: string): PluginBrowserRatingDistributionEntry | undefined;
  /** True iff `pluginId` is cached. */
  has(pluginId: string): boolean;
  /** All cached entries, insertion order. */
  all(): readonly PluginBrowserRatingDistributionEntry[];
  /**
   * Plugin ids sorted by average rating descending, ties
   * broken by total descending, then insertion order.
   * Excludes entries with `total === 0` (treated as unrated).
   */
  rankByAverage(): readonly string[];
  /** Cache count. */
  size(): number;
  /** Remove a plugin's entry. */
  remove(pluginId: string): boolean;
  /** Wipe every entry. */
  clear(): void;
}

function isValidId(s: unknown): s is string {
  return typeof s === "string" && s.length > 0;
}

function isValidCount(n: unknown): n is number {
  return (
    typeof n === "number" && Number.isFinite(n) && Number.isInteger(n) && n >= 0
  );
}

function isValidBuckets(b: unknown): b is PluginBrowserRatingBuckets {
  if (typeof b !== "object" || b === null) return false;
  const o = b as PluginBrowserRatingBuckets;
  return (
    isValidCount(o.star1) &&
    isValidCount(o.star2) &&
    isValidCount(o.star3) &&
    isValidCount(o.star4) &&
    isValidCount(o.star5)
  );
}

function bucketsEqual(
  a: PluginBrowserRatingBuckets,
  b: PluginBrowserRatingBuckets,
): boolean {
  return (
    a.star1 === b.star1 &&
    a.star2 === b.star2 &&
    a.star3 === b.star3 &&
    a.star4 === b.star4 &&
    a.star5 === b.star5
  );
}

function computeEntry(
  pluginId: string,
  buckets: PluginBrowserRatingBuckets,
): PluginBrowserRatingDistributionEntry {
  const total =
    buckets.star1 +
    buckets.star2 +
    buckets.star3 +
    buckets.star4 +
    buckets.star5;
  const average =
    total === 0
      ? 0
      : (buckets.star1 * 1 +
          buckets.star2 * 2 +
          buckets.star3 * 3 +
          buckets.star4 * 4 +
          buckets.star5 * 5) /
        total;
  return { pluginId, buckets, total, average };
}

/**
 * Create a caller-owned rating-distribution cache.
 */
export function createPluginBrowserRatingDistribution(): PluginBrowserRatingDistribution {
  const entries: PluginBrowserRatingDistributionEntry[] = [];

  function findIndex(pluginId: string): number {
    for (let i = 0; i < entries.length; i++) {
      if (entries[i].pluginId === pluginId) return i;
    }
    return -1;
  }

  return {
    set(pluginId: string, buckets: PluginBrowserRatingBuckets): boolean {
      if (!isValidId(pluginId)) return false;
      if (!isValidBuckets(buckets)) return false;
      const idx = findIndex(pluginId);
      if (idx >= 0) {
        const prev = entries[idx];
        if (bucketsEqual(prev.buckets, buckets)) return false;
        entries[idx] = computeEntry(pluginId, {
          star1: buckets.star1,
          star2: buckets.star2,
          star3: buckets.star3,
          star4: buckets.star4,
          star5: buckets.star5,
        });
        return true;
      }
      entries.push(
        computeEntry(pluginId, {
          star1: buckets.star1,
          star2: buckets.star2,
          star3: buckets.star3,
          star4: buckets.star4,
          star5: buckets.star5,
        }),
      );
      return true;
    },
    get(pluginId: string): PluginBrowserRatingDistributionEntry | undefined {
      if (!isValidId(pluginId)) return undefined;
      const idx = findIndex(pluginId);
      return idx < 0 ? undefined : entries[idx];
    },
    has(pluginId: string): boolean {
      if (!isValidId(pluginId)) return false;
      return findIndex(pluginId) >= 0;
    },
    all(): readonly PluginBrowserRatingDistributionEntry[] {
      return entries.slice();
    },
    rankByAverage(): readonly string[] {
      const decorated: Array<{
        pluginId: string;
        average: number;
        total: number;
        order: number;
      }> = [];
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        if (e.total === 0) continue;
        decorated.push({
          pluginId: e.pluginId,
          average: e.average,
          total: e.total,
          order: i,
        });
      }
      decorated.sort((a, b) => {
        if (a.average !== b.average) return b.average - a.average;
        if (a.total !== b.total) return b.total - a.total;
        return a.order - b.order;
      });
      return decorated.map((d) => d.pluginId);
    },
    size(): number {
      return entries.length;
    },
    remove(pluginId: string): boolean {
      if (!isValidId(pluginId)) return false;
      const idx = findIndex(pluginId);
      if (idx < 0) return false;
      entries.splice(idx, 1);
      return true;
    },
    clear(): void {
      entries.length = 0;
    },
  };
}
