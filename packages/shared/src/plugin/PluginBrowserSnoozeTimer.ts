/**
 * Pure per-plugin snooze-timer ledger. Snoozes a plugin's
 * notifications (update nag, crash toast, permission
 * prompt) until a caller-supplied future timestamp. Expiry
 * is lazy — `isSnoozed(id, now)` re-evaluates on each
 * query, and `clearExpired(now)` garbage-collects.
 *
 * Distinct from:
 *   - `PluginBrowserMutedPlugins` — permanent mute.
 *   - `PluginBrowserOperationCooldown` — per-action spam
 *     gate (keyed by pluginId + action).
 *   - `PluginBrowserUpdateAvailability.dismiss` — sticky
 *     dismissal with explicit restore.
 *
 * Time is caller-supplied (`nowMs` / `untilMs`) so the
 * substrate stays pure — no `Date.now()` reads.
 *
 * Pure state, caller-owned, never throws. Invalid input
 * (empty id, non-finite time, past expiry) silently
 * no-op'd.
 */

export interface PluginBrowserSnoozeEntry {
  readonly pluginId: string;
  readonly untilMs: number;
}

export interface PluginBrowserSnoozeTimer {
  /**
   * Snooze a plugin until `untilMs`. Rejects when:
   *   - pluginId is empty
   *   - untilMs or nowMs are not finite numbers
   *   - untilMs is not strictly after nowMs (can't snooze
   *     into the past/present)
   * Replaces any prior snooze for the same plugin.
   */
  snooze(pluginId: string, untilMs: number, nowMs: number): boolean;
  /** Cancel a snooze early. Returns false if none active. */
  unsnooze(pluginId: string): boolean;
  /** True iff the entry exists and untilMs > nowMs. */
  isSnoozed(pluginId: string, nowMs: number): boolean;
  /**
   * Milliseconds remaining on a snooze, or 0 when expired
   * / missing. Never negative.
   */
  remaining(pluginId: string, nowMs: number): number;
  /**
   * Raw expiry timestamp regardless of whether it has
   * passed, or undefined when no entry.
   */
  snoozedUntil(pluginId: string): number | undefined;
  /**
   * Remove every entry whose `untilMs <= nowMs`. Returns
   * count removed.
   */
  clearExpired(nowMs: number): number;
  /**
   * Snapshot of non-expired entries at `nowMs`, in
   * insertion order (earliest-added first).
   */
  all(nowMs: number): readonly PluginBrowserSnoozeEntry[];
  /** Count of non-expired entries. */
  count(nowMs: number): number;
  /** Wipe everything. */
  reset(): void;
}

/**
 * Create a caller-owned snooze-timer.
 */
export function createPluginBrowserSnoozeTimer(): PluginBrowserSnoozeTimer {
  const entries: PluginBrowserSnoozeEntry[] = [];

  function isValidId(s: string): boolean {
    return typeof s === "string" && s.length > 0;
  }

  function isValidTime(n: number): boolean {
    return typeof n === "number" && Number.isFinite(n);
  }

  function findIndex(pluginId: string): number {
    for (let i = 0; i < entries.length; i++) {
      if (entries[i].pluginId === pluginId) return i;
    }
    return -1;
  }

  return {
    snooze(pluginId: string, untilMs: number, nowMs: number): boolean {
      if (!isValidId(pluginId)) return false;
      if (!isValidTime(untilMs)) return false;
      if (!isValidTime(nowMs)) return false;
      if (untilMs <= nowMs) return false;
      const idx = findIndex(pluginId);
      const next: PluginBrowserSnoozeEntry = { pluginId, untilMs };
      if (idx >= 0) {
        entries[idx] = next;
      } else {
        entries.push(next);
      }
      return true;
    },
    unsnooze(pluginId: string): boolean {
      if (!isValidId(pluginId)) return false;
      const idx = findIndex(pluginId);
      if (idx < 0) return false;
      entries.splice(idx, 1);
      return true;
    },
    isSnoozed(pluginId: string, nowMs: number): boolean {
      if (!isValidId(pluginId)) return false;
      if (!isValidTime(nowMs)) return false;
      const idx = findIndex(pluginId);
      if (idx < 0) return false;
      return entries[idx].untilMs > nowMs;
    },
    remaining(pluginId: string, nowMs: number): number {
      if (!isValidId(pluginId)) return 0;
      if (!isValidTime(nowMs)) return 0;
      const idx = findIndex(pluginId);
      if (idx < 0) return 0;
      const diff = entries[idx].untilMs - nowMs;
      return diff > 0 ? diff : 0;
    },
    snoozedUntil(pluginId: string): number | undefined {
      if (!isValidId(pluginId)) return undefined;
      const idx = findIndex(pluginId);
      if (idx < 0) return undefined;
      return entries[idx].untilMs;
    },
    clearExpired(nowMs: number): number {
      if (!isValidTime(nowMs)) return 0;
      let removed = 0;
      for (let i = entries.length - 1; i >= 0; i--) {
        if (entries[i].untilMs <= nowMs) {
          entries.splice(i, 1);
          removed++;
        }
      }
      return removed;
    },
    all(nowMs: number): readonly PluginBrowserSnoozeEntry[] {
      if (!isValidTime(nowMs)) return [];
      return entries.filter((e) => e.untilMs > nowMs);
    },
    count(nowMs: number): number {
      if (!isValidTime(nowMs)) return 0;
      let n = 0;
      for (const e of entries) if (e.untilMs > nowMs) n++;
      return n;
    },
    reset(): void {
      entries.length = 0;
    },
  };
}
