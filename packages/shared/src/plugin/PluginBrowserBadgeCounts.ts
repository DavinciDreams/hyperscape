/**
 * Pure per-plugin numeric badge counter ledger.
 *
 * Drives the small numeric pills on plugin rows — e.g. "3 new
 * events", "2 warnings", "12 unread log entries". Counters are
 * keyed within a plugin so a single plugin can contribute to
 * multiple badges (info / warning / error buckets). The ledger
 * just stores integers; caller-owned semantics decide what each
 * key means.
 *
 * Semantics:
 *  - Counts clamp to integers >= 0. Negative `set(value)`
 *    clamps to 0; `increment(by)` with a negative `by` that
 *    would drop the count below 0 clamps to 0.
 *  - When a counter hits 0 (via `set(0)`, `reset`, or a
 *    clamped-to-0 increment), its key is dropped entirely so
 *    `totalFor(pluginId)` and `pluginsWithBadges()` stay clean.
 *  - Non-integer `by` / `value` is floored.
 *
 * Pure state. Caller-owned instance. Never throws. Invalid
 * input is a silent no-op.
 */

export interface PluginBrowserBadgeEntry {
  readonly pluginId: string;
  readonly key: string;
  readonly count: number;
}

export interface PluginBrowserBadgeCounts {
  /** Count for `(pluginId, key)`; 0 when unset. */
  count(pluginId: string, key: string): number;
  /** Sum of every key's count on `pluginId`; 0 when plugin has no badges. */
  totalFor(pluginId: string): number;
  /** Plugin ids with at least one non-zero badge (insertion order). */
  pluginsWithBadges(): readonly string[];
  /** Keys on `pluginId` with non-zero counts (insertion order). */
  keysFor(pluginId: string): readonly string[];
  /**
   * Add `by` (integer, default 1) to the counter. Returns the
   * new count. Clamps at 0. Removing the entry when the new
   * count is 0.
   */
  increment(pluginId: string, key: string, by?: number): number;
  /**
   * Overwrite the counter. `value <= 0` removes the entry.
   * Returns true when internal state changed.
   */
  set(pluginId: string, key: string, value: number): boolean;
  /** Drop a single counter. Returns true iff a counter existed. */
  reset(pluginId: string, key: string): boolean;
  /** Drop every counter on `pluginId`. Returns true iff any existed. */
  resetAll(pluginId: string): boolean;
  /** Drop every counter across every plugin. */
  clear(): void;
  /** Total non-zero counters across all plugins. */
  size(): number;
  /** Snapshot in insertion order. */
  entries(): readonly PluginBrowserBadgeEntry[];
}

/**
 * Create a caller-owned badge-counter ledger.
 */
export function createPluginBrowserBadgeCounts(): PluginBrowserBadgeCounts {
  const byPlugin = new Map<string, Map<string, number>>();

  function isValidId(s: string): boolean {
    return typeof s === "string" && s.length > 0;
  }

  function floorInt(n: number): number {
    if (typeof n !== "number" || !Number.isFinite(n)) return 0;
    return Math.floor(n);
  }

  function pluginMap(pluginId: string): Map<string, number> | undefined {
    return byPlugin.get(pluginId);
  }

  function ensurePluginMap(pluginId: string): Map<string, number> {
    let m = byPlugin.get(pluginId);
    if (!m) {
      m = new Map();
      byPlugin.set(pluginId, m);
    }
    return m;
  }

  function dropIfEmpty(pluginId: string, m: Map<string, number>): void {
    if (m.size === 0) byPlugin.delete(pluginId);
  }

  return {
    count(pluginId: string, key: string): number {
      if (!isValidId(pluginId) || !isValidId(key)) return 0;
      return pluginMap(pluginId)?.get(key) ?? 0;
    },
    totalFor(pluginId: string): number {
      if (!isValidId(pluginId)) return 0;
      const m = pluginMap(pluginId);
      if (!m) return 0;
      let total = 0;
      for (const v of m.values()) total += v;
      return total;
    },
    pluginsWithBadges(): readonly string[] {
      return [...byPlugin.keys()];
    },
    keysFor(pluginId: string): readonly string[] {
      if (!isValidId(pluginId)) return [];
      const m = pluginMap(pluginId);
      return m ? [...m.keys()] : [];
    },
    increment(pluginId: string, key: string, by = 1): number {
      if (!isValidId(pluginId) || !isValidId(key)) return 0;
      const delta = floorInt(by);
      const m = ensurePluginMap(pluginId);
      const prev = m.get(key) ?? 0;
      const next = Math.max(0, prev + delta);
      if (next === 0) {
        m.delete(key);
        dropIfEmpty(pluginId, m);
        return 0;
      }
      m.set(key, next);
      return next;
    },
    set(pluginId: string, key: string, value: number): boolean {
      if (!isValidId(pluginId) || !isValidId(key)) return false;
      const next = Math.max(0, floorInt(value));
      const m = pluginMap(pluginId);
      const prev = m?.get(key) ?? 0;
      if (next === prev) return false;
      if (next === 0) {
        if (!m) return false;
        m.delete(key);
        dropIfEmpty(pluginId, m);
        return true;
      }
      const mm = ensurePluginMap(pluginId);
      mm.set(key, next);
      return true;
    },
    reset(pluginId: string, key: string): boolean {
      if (!isValidId(pluginId) || !isValidId(key)) return false;
      const m = pluginMap(pluginId);
      if (!m) return false;
      const changed = m.delete(key);
      if (changed) dropIfEmpty(pluginId, m);
      return changed;
    },
    resetAll(pluginId: string): boolean {
      if (!isValidId(pluginId)) return false;
      return byPlugin.delete(pluginId);
    },
    clear(): void {
      byPlugin.clear();
    },
    size(): number {
      let total = 0;
      for (const m of byPlugin.values()) total += m.size;
      return total;
    },
    entries(): readonly PluginBrowserBadgeEntry[] {
      const out: PluginBrowserBadgeEntry[] = [];
      for (const [pluginId, m] of byPlugin) {
        for (const [key, count] of m) {
          out.push({ pluginId, key, count });
        }
      }
      return out;
    },
  };
}
