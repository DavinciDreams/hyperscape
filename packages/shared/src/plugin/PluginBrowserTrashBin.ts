/**
 * Pure bounded-FIFO trash bin for the Plugin Browser "recently
 * uninstalled" undo affordance.
 *
 * When a plugin is uninstalled/removed/archived, callers push a
 * snapshot of its state to the trash bin. The UI can then show
 * a banner ("Plugin X was removed — Undo?") and call `restore`
 * to recover the snapshot. Entries age out by:
 *
 *   1. capacity overflow — oldest evicted on push
 *   2. explicit `expire(olderThanMs, nowMs)`
 *   3. explicit `remove(id)` / `restore(id)` / `clear()`
 *
 * Generic `<T>` payload for the snapshot body; the bin is
 * opaque to its content. Monotonic positive ids for each
 * entry. Pure state, caller-owned instance, never throws.
 * Invalid input (empty ids, non-finite timestamp) silently
 * no-op'd.
 */

export interface PluginBrowserTrashEntry<T> {
  readonly id: number;
  readonly pluginId: string;
  readonly snapshot: T;
  readonly timestampMs: number;
}

export interface PluginBrowserTrashBin<T> {
  /** Current capacity. */
  capacity(): number;
  /** How many entries are currently stored. */
  size(): number;
  /** True iff `size() === 0`. */
  isEmpty(): boolean;
  /**
   * Push a new snapshot. Returns the resulting entry, or
   * undefined on invalid input. Evicts the oldest entry when
   * already at capacity.
   */
  push(
    pluginId: string,
    snapshot: T,
    timestampMs: number,
  ): PluginBrowserTrashEntry<T> | undefined;
  /** Lookup by entry id. */
  get(id: number): PluginBrowserTrashEntry<T> | undefined;
  /** True iff an entry with `id` exists. */
  hasId(id: number): boolean;
  /** Every entry for `pluginId` in insertion order. */
  findForPlugin(pluginId: string): readonly PluginBrowserTrashEntry<T>[];
  /** Most-recently pushed entry for `pluginId`, or undefined. */
  findLatestForPlugin(pluginId: string): PluginBrowserTrashEntry<T> | undefined;
  /**
   * Remove + return the entry with `id`. Returns undefined when
   * absent. Semantically identical to `remove` but returns the
   * entry payload for the caller to act on.
   */
  restore(id: number): PluginBrowserTrashEntry<T> | undefined;
  /**
   * Drop the entry with `id`. Returns true when an entry was
   * removed.
   */
  remove(id: number): boolean;
  /**
   * Drop every entry with `(nowMs - timestampMs) >= olderThanMs`.
   * Returns the number of evicted entries. Refuses non-finite
   * or negative inputs.
   */
  expire(olderThanMs: number, nowMs: number): number;
  /** Snapshot in insertion order (oldest first). */
  entries(): readonly PluginBrowserTrashEntry<T>[];
  /** Wipe every entry. Returns true when non-empty. */
  clear(): boolean;
}

/**
 * Create a caller-owned trash bin. `capacity` must be a
 * positive finite integer; defaults to 20. Invalid capacity
 * falls back to 20.
 */
export function createPluginBrowserTrashBin<T>(
  capacity = 20,
): PluginBrowserTrashBin<T> {
  const cap =
    Number.isFinite(capacity) && capacity > 0 ? Math.floor(capacity) : 20;
  const items: PluginBrowserTrashEntry<T>[] = [];
  let nextId = 1;

  function isValidId(s: string): boolean {
    return typeof s === "string" && s.length > 0;
  }

  function findIndexById(id: number): number {
    for (let i = 0; i < items.length; i++) {
      if (items[i].id === id) return i;
    }
    return -1;
  }

  return {
    capacity(): number {
      return cap;
    },
    size(): number {
      return items.length;
    },
    isEmpty(): boolean {
      return items.length === 0;
    },
    push(
      pluginId: string,
      snapshot: T,
      timestampMs: number,
    ): PluginBrowserTrashEntry<T> | undefined {
      if (!isValidId(pluginId)) return undefined;
      if (!Number.isFinite(timestampMs)) return undefined;
      const entry: PluginBrowserTrashEntry<T> = {
        id: nextId++,
        pluginId,
        snapshot,
        timestampMs,
      };
      items.push(entry);
      while (items.length > cap) items.shift();
      return entry;
    },
    get(id: number): PluginBrowserTrashEntry<T> | undefined {
      const idx = findIndexById(id);
      return idx >= 0 ? items[idx] : undefined;
    },
    hasId(id: number): boolean {
      return findIndexById(id) >= 0;
    },
    findForPlugin(pluginId: string): readonly PluginBrowserTrashEntry<T>[] {
      if (!isValidId(pluginId)) return [];
      const out: PluginBrowserTrashEntry<T>[] = [];
      for (const e of items) {
        if (e.pluginId === pluginId) out.push(e);
      }
      return out;
    },
    findLatestForPlugin(
      pluginId: string,
    ): PluginBrowserTrashEntry<T> | undefined {
      if (!isValidId(pluginId)) return undefined;
      for (let i = items.length - 1; i >= 0; i--) {
        if (items[i].pluginId === pluginId) return items[i];
      }
      return undefined;
    },
    restore(id: number): PluginBrowserTrashEntry<T> | undefined {
      const idx = findIndexById(id);
      if (idx < 0) return undefined;
      const [entry] = items.splice(idx, 1);
      return entry;
    },
    remove(id: number): boolean {
      const idx = findIndexById(id);
      if (idx < 0) return false;
      items.splice(idx, 1);
      return true;
    },
    expire(olderThanMs: number, nowMs: number): number {
      if (!Number.isFinite(olderThanMs) || olderThanMs < 0) return 0;
      if (!Number.isFinite(nowMs)) return 0;
      let n = 0;
      for (let i = items.length - 1; i >= 0; i--) {
        if (nowMs - items[i].timestampMs >= olderThanMs) {
          items.splice(i, 1);
          n++;
        }
      }
      return n;
    },
    entries(): readonly PluginBrowserTrashEntry<T>[] {
      return [...items];
    },
    clear(): boolean {
      if (items.length === 0) return false;
      items.length = 0;
      return true;
    },
  };
}
