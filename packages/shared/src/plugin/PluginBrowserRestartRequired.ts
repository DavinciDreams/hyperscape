/**
 * Pure per-plugin "restart-required" ledger for the Plugin
 * Browser. When a plugin state change (install, update,
 * permission change) can't take effect until the runtime
 * is restarted, the caller records an entry here. The UI
 * can then render "N plugins need restart" with per-row
 * badges and a one-click "Restart now" action.
 *
 * Each entry carries `{pluginId, reason?, scheduledAtMs}`
 * where `scheduledAtMs` is caller-supplied (so substrate
 * stays pure — no `Date.now()` reads).
 *
 * Complements:
 *   - `PluginBrowserInstallQueue` (single-op lifecycle)
 *   - `PluginBrowserUpdateAvailability` (pending updates)
 *   - `PluginBrowserOperationCooldown` (action time-gate)
 *
 * Pure state, caller-owned, never throws. Invalid input
 * (empty id, non-finite time) silently no-op'd.
 */

export interface PluginBrowserRestartEntry {
  readonly pluginId: string;
  readonly reason?: string;
  readonly scheduledAtMs: number;
}

export interface PluginBrowserRestartRequired {
  /**
   * Mark a plugin as needing a restart. Replaces any prior
   * entry for the same pluginId (the new reason /
   * scheduledAtMs wins). Rejects empty id / non-finite
   * scheduledAtMs. Empty reason normalized to undefined.
   */
  schedule(
    pluginId: string,
    reason: string | undefined,
    scheduledAtMs: number,
  ): boolean;
  /**
   * Cancel a scheduled restart for this plugin. Returns
   * false if no entry existed.
   */
  cancel(pluginId: string): boolean;
  /** True iff there's an entry for this pluginId. */
  isScheduled(pluginId: string): boolean;
  /** Lookup by pluginId. */
  get(pluginId: string): PluginBrowserRestartEntry | undefined;
  /** Snapshot of every entry in insertion order. */
  all(): readonly PluginBrowserRestartEntry[];
  /**
   * Same as `all()` but sorted ascending by
   * `scheduledAtMs` — ties broken by insertion order.
   */
  oldestFirst(): readonly PluginBrowserRestartEntry[];
  /** Count of entries. */
  count(): number;
  /** Wipe everything. */
  clearAll(): void;
}

/**
 * Create a caller-owned restart-required tracker.
 */
export function createPluginBrowserRestartRequired(): PluginBrowserRestartRequired {
  const entries: PluginBrowserRestartEntry[] = [];

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
    schedule(
      pluginId: string,
      reason: string | undefined,
      scheduledAtMs: number,
    ): boolean {
      if (!isValidId(pluginId)) return false;
      if (!isValidTime(scheduledAtMs)) return false;
      const normalizedReason =
        typeof reason === "string" && reason.length > 0 ? reason : undefined;
      const next: PluginBrowserRestartEntry = normalizedReason
        ? { pluginId, reason: normalizedReason, scheduledAtMs }
        : { pluginId, scheduledAtMs };
      const idx = findIndex(pluginId);
      if (idx >= 0) {
        entries[idx] = next;
      } else {
        entries.push(next);
      }
      return true;
    },
    cancel(pluginId: string): boolean {
      if (!isValidId(pluginId)) return false;
      const idx = findIndex(pluginId);
      if (idx < 0) return false;
      entries.splice(idx, 1);
      return true;
    },
    isScheduled(pluginId: string): boolean {
      if (!isValidId(pluginId)) return false;
      return findIndex(pluginId) >= 0;
    },
    get(pluginId: string): PluginBrowserRestartEntry | undefined {
      if (!isValidId(pluginId)) return undefined;
      const idx = findIndex(pluginId);
      if (idx < 0) return undefined;
      return entries[idx];
    },
    all(): readonly PluginBrowserRestartEntry[] {
      return entries.slice();
    },
    oldestFirst(): readonly PluginBrowserRestartEntry[] {
      // Decorate with index to achieve a stable sort by
      // scheduledAtMs with insertion order as tiebreaker.
      const indexed = entries.map((e, i) => ({ e, i }));
      indexed.sort((a, b) => {
        if (a.e.scheduledAtMs !== b.e.scheduledAtMs) {
          return a.e.scheduledAtMs - b.e.scheduledAtMs;
        }
        return a.i - b.i;
      });
      return indexed.map((x) => x.e);
    },
    count(): number {
      return entries.length;
    },
    clearAll(): void {
      entries.length = 0;
    },
  };
}
