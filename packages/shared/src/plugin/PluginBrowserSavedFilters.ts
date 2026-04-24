/**
 * Pure named-preset memory for the Plugin Browser list pane.
 * Stores user-named filter compositions (severity picks,
 * search query, per-column searches, sort order, etc.) as
 * opaque payloads so the consumer can restore a complete
 * filter state with one click.
 *
 * The payload type is generic (`T`) — substrate stays
 * agnostic to the filter shape. The consumer decides what
 * goes in.
 *
 * Pure state. Caller-owned instance (not a singleton). Never
 * throws.
 *
 * Invariants:
 * - Names are trimmed on input. Whitespace-only names are
 *   silent no-ops.
 * - Names are **case-sensitive** — "MyFilter" and "myfilter"
 *   are distinct entries (matches typical file-system /
 *   user-label semantics).
 * - `save(name, payload)` on an existing name replaces the
 *   payload in place (order is preserved). Order is
 *   *insertion order* of the first save.
 * - `rename` refuses to overwrite an existing name.
 * - Capacity 0 disables storage entirely.
 */

export interface PluginBrowserSavedFilter<T> {
  readonly name: string;
  readonly payload: T;
}

export interface PluginBrowserSavedFiltersOptions<T> {
  /**
   * Initial presets, in insertion order. Duplicate names
   * (case-sensitive) are silently deduped first-wins;
   * empty names dropped. Entries beyond `capacity` are
   * truncated.
   */
  readonly initialFilters?: readonly PluginBrowserSavedFilter<T>[];
  /**
   * Maximum number of saved presets. Defaults to `50`.
   * Set to `0` to disable storage entirely. Non-finite or
   * negative capacity falls back to the default.
   */
  readonly capacity?: number;
}

export interface PluginBrowserSavedFilters<T> {
  /** Number of stored presets. */
  size(): number;
  /** Effective capacity (read-only). */
  capacity(): number;
  /** True when a preset exists under `name`. */
  has(name: string): boolean;
  /** Payload for `name`, or `undefined` when unknown. */
  get(name: string): T | undefined;
  /**
   * Upsert a preset. Returns `true` when the save
   * succeeded, `false` when the name was empty, when
   * capacity is `0`, or when the name is invalid. At
   * capacity the oldest preset evicts to make room — only
   * for *new* names (updates never evict).
   */
  save(name: string, payload: T): boolean;
  /**
   * Remove one preset. Unknown names are silent no-ops.
   * Returns `true` when a change occurred.
   */
  remove(name: string): boolean;
  /**
   * Rename one preset. Refuses to overwrite an existing
   * target. Returns `true` on success, `false` on any error
   * (unknown source, empty target, or target already in
   * use).
   */
  rename(oldName: string, newName: string): boolean;
  /** Drop every preset. */
  clear(): void;
  /** Presets in insertion order. */
  list(): readonly PluginBrowserSavedFilter<T>[];
  /** Preset names in insertion order. */
  names(): readonly string[];
}

const DEFAULT_CAPACITY = 50;

function normalizeCapacity(raw: number | undefined): number {
  if (raw === undefined) return DEFAULT_CAPACITY;
  if (!Number.isFinite(raw) || raw < 0) return DEFAULT_CAPACITY;
  return Math.floor(raw);
}

function normalizeName(s: unknown): string {
  if (typeof s !== "string") return "";
  return s.trim();
}

/**
 * Create a caller-owned saved-filter manager.
 */
export function createPluginBrowserSavedFilters<T>(
  options: PluginBrowserSavedFiltersOptions<T> = {},
): PluginBrowserSavedFilters<T> {
  const capacity = normalizeCapacity(options.capacity);

  // Map preserves insertion order.
  const byName = new Map<string, T>();

  if (capacity > 0 && options.initialFilters) {
    for (const entry of options.initialFilters) {
      if (!entry) continue;
      const name = normalizeName(entry.name);
      if (name.length === 0) continue;
      if (byName.has(name)) continue; // dedupe first-wins
      byName.set(name, entry.payload);
      if (byName.size >= capacity) break;
    }
  }

  return {
    size(): number {
      return byName.size;
    },
    capacity(): number {
      return capacity;
    },
    has(name: string): boolean {
      const n = normalizeName(name);
      if (n.length === 0) return false;
      return byName.has(n);
    },
    get(name: string): T | undefined {
      const n = normalizeName(name);
      if (n.length === 0) return undefined;
      return byName.get(n);
    },
    save(name: string, payload: T): boolean {
      if (capacity === 0) return false;
      const n = normalizeName(name);
      if (n.length === 0) return false;
      if (byName.has(n)) {
        // Update in place; preserves insertion order.
        byName.set(n, payload);
        return true;
      }
      // New entry — evict oldest to make room.
      while (byName.size >= capacity) {
        const oldest = byName.keys().next().value as string | undefined;
        if (oldest === undefined) break;
        byName.delete(oldest);
      }
      byName.set(n, payload);
      return true;
    },
    remove(name: string): boolean {
      const n = normalizeName(name);
      if (n.length === 0) return false;
      return byName.delete(n);
    },
    rename(oldName: string, newName: string): boolean {
      const src = normalizeName(oldName);
      const dst = normalizeName(newName);
      if (src.length === 0 || dst.length === 0) return false;
      if (!byName.has(src)) return false;
      if (src === dst) return true;
      if (byName.has(dst)) return false;
      // Preserve insertion order by rebuilding the map —
      // JS Map has no rename, just add-at-end.
      const entries: [string, T][] = [];
      for (const [k, v] of byName) {
        entries.push([k === src ? dst : k, v]);
      }
      byName.clear();
      for (const [k, v] of entries) byName.set(k, v);
      return true;
    },
    clear(): void {
      byName.clear();
    },
    list(): readonly PluginBrowserSavedFilter<T>[] {
      const out: PluginBrowserSavedFilter<T>[] = [];
      for (const [name, payload] of byName) {
        out.push({ name, payload });
      }
      return out;
    },
    names(): readonly string[] {
      return [...byName.keys()];
    },
  };
}
