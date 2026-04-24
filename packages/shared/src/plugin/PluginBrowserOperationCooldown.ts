/**
 * Pure per-(plugin, action) cooldown tracker for the
 * Plugin Browser. Prevents double-click spam on transient
 * operations like "install", "update", "remove" by locking
 * out the same action on the same plugin for a fixed
 * duration after it was last triggered.
 *
 * Each entry carries `{pluginId, action, expiresAtMs}`.
 * Time is caller-supplied (`nowMs`), so the substrate
 * stays pure — no `Date.now()`/`performance.now()` reads.
 *
 * Complements:
 *   - `PluginBrowserInstallQueue` (single-op lifecycle)
 *   - `PluginBrowserRetryQueue` (failed-op retry schedule)
 *   - `PluginBrowserBulkProgress` (multi-plugin aggregate)
 *
 * Pure state, caller-owned, never throws. Invalid input
 * (empty ids, non-positive duration, non-finite time)
 * silently no-op'd.
 */

export interface PluginBrowserCooldownEntry {
  readonly pluginId: string;
  readonly action: string;
  readonly expiresAtMs: number;
}

export interface PluginBrowserOperationCooldown {
  /**
   * Start or extend a cooldown for (pluginId, action).
   * `expiresAtMs` becomes `nowMs + durationMs`. If a
   * cooldown is already active, it is always replaced
   * (never shortened — the new expiry is used whether
   * later or earlier, since the caller is saying "restart
   * the cooldown").
   * Rejects invalid ids / non-positive duration /
   * non-finite nowMs.
   */
  start(
    pluginId: string,
    action: string,
    durationMs: number,
    nowMs: number,
  ): boolean;
  /**
   * Milliseconds remaining on a cooldown, or 0 if expired
   * / missing. Never negative.
   */
  remaining(pluginId: string, action: string, nowMs: number): number;
  /** True iff the entry exists and has not yet expired. */
  isActive(pluginId: string, action: string, nowMs: number): boolean;
  /** Remove a single cooldown. Returns true on removal. */
  clear(pluginId: string, action: string): boolean;
  /**
   * Remove all cooldowns for a given plugin regardless of
   * action. Returns count removed.
   */
  clearPlugin(pluginId: string): number;
  /**
   * Remove every cooldown whose `expiresAtMs <= nowMs`.
   * Returns count removed.
   */
  clearExpired(nowMs: number): number;
  /**
   * Snapshot of non-expired entries at `nowMs`, in
   * insertion order (earliest-added first).
   */
  all(nowMs: number): readonly PluginBrowserCooldownEntry[];
  /** Count of non-expired entries at `nowMs`. */
  activeCount(nowMs: number): number;
  /** Wipe everything. */
  reset(): void;
}

/**
 * Create a caller-owned cooldown tracker.
 */
export function createPluginBrowserOperationCooldown(): PluginBrowserOperationCooldown {
  const entries: PluginBrowserCooldownEntry[] = [];

  function isValidId(s: string): boolean {
    return typeof s === "string" && s.length > 0;
  }

  function isValidNow(n: number): boolean {
    return typeof n === "number" && Number.isFinite(n);
  }

  function findIndex(pluginId: string, action: string): number {
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (e.pluginId === pluginId && e.action === action) return i;
    }
    return -1;
  }

  return {
    start(
      pluginId: string,
      action: string,
      durationMs: number,
      nowMs: number,
    ): boolean {
      if (!isValidId(pluginId)) return false;
      if (!isValidId(action)) return false;
      if (typeof durationMs !== "number" || !Number.isFinite(durationMs)) {
        return false;
      }
      if (durationMs <= 0) return false;
      if (!isValidNow(nowMs)) return false;
      const expiresAtMs = nowMs + durationMs;
      const idx = findIndex(pluginId, action);
      const next: PluginBrowserCooldownEntry = {
        pluginId,
        action,
        expiresAtMs,
      };
      if (idx >= 0) {
        entries[idx] = next;
      } else {
        entries.push(next);
      }
      return true;
    },
    remaining(pluginId: string, action: string, nowMs: number): number {
      if (!isValidId(pluginId)) return 0;
      if (!isValidId(action)) return 0;
      if (!isValidNow(nowMs)) return 0;
      const idx = findIndex(pluginId, action);
      if (idx < 0) return 0;
      const diff = entries[idx].expiresAtMs - nowMs;
      return diff > 0 ? diff : 0;
    },
    isActive(pluginId: string, action: string, nowMs: number): boolean {
      if (!isValidId(pluginId)) return false;
      if (!isValidId(action)) return false;
      if (!isValidNow(nowMs)) return false;
      const idx = findIndex(pluginId, action);
      if (idx < 0) return false;
      return entries[idx].expiresAtMs > nowMs;
    },
    clear(pluginId: string, action: string): boolean {
      if (!isValidId(pluginId)) return false;
      if (!isValidId(action)) return false;
      const idx = findIndex(pluginId, action);
      if (idx < 0) return false;
      entries.splice(idx, 1);
      return true;
    },
    clearPlugin(pluginId: string): number {
      if (!isValidId(pluginId)) return 0;
      let removed = 0;
      for (let i = entries.length - 1; i >= 0; i--) {
        if (entries[i].pluginId === pluginId) {
          entries.splice(i, 1);
          removed++;
        }
      }
      return removed;
    },
    clearExpired(nowMs: number): number {
      if (!isValidNow(nowMs)) return 0;
      let removed = 0;
      for (let i = entries.length - 1; i >= 0; i--) {
        if (entries[i].expiresAtMs <= nowMs) {
          entries.splice(i, 1);
          removed++;
        }
      }
      return removed;
    },
    all(nowMs: number): readonly PluginBrowserCooldownEntry[] {
      if (!isValidNow(nowMs)) return [];
      return entries.filter((e) => e.expiresAtMs > nowMs);
    },
    activeCount(nowMs: number): number {
      if (!isValidNow(nowMs)) return 0;
      let n = 0;
      for (const e of entries) if (e.expiresAtMs > nowMs) n++;
      return n;
    },
    reset(): void {
      entries.length = 0;
    },
  };
}
