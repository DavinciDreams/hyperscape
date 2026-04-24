/**
 * Pure user-muted-plugins ledger for the Plugin Browser.
 *
 * Suppresses notifications / toasts / badge highlights for
 * specific plugins. Supports permanent mutes (`mute`) and
 * time-limited mutes (`muteUntil`, `muteFor`) so the user can
 * "snooze" a chatty plugin for an hour / day / etc. Caller
 * provides the current wallclock `nowMs` when asking whether a
 * plugin is currently muted — the ledger itself stores only
 * absolute expiry timestamps and holds no timers.
 *
 * Semantics:
 *  - `mute(id)` records a permanent mute (no expiry).
 *  - `muteUntil(id, expiresAtMs)` records a time-limited mute.
 *    `expiresAtMs` is an absolute timestamp; when `nowMs >=
 *    expiresAtMs` the plugin is no longer considered muted.
 *  - `muteFor(id, nowMs, durationMs)` is sugar for
 *    `muteUntil(id, nowMs + durationMs)` with input guards.
 *  - `isMuted(id, nowMs)` returns true iff an entry exists and
 *    it hasn't yet expired at `nowMs`.
 *  - `pruneExpired(nowMs)` removes every entry whose expiry
 *    has passed. Callers can invoke opportunistically (e.g.
 *    once per frame or per user interaction) to keep the
 *    ledger compact.
 *
 * Pure state. Caller-owned instance. Never throws. Invalid
 * input is a silent no-op.
 */

export interface PluginBrowserMutedPluginEntry {
  readonly pluginId: string;
  /** Absolute expiry timestamp, or `undefined` for permanent mute. */
  readonly expiresAtMs: number | undefined;
}

export interface PluginBrowserMutedPlugins {
  /** True iff `pluginId` is muted (and hasn't expired at `nowMs`). */
  isMuted(pluginId: string, nowMs: number): boolean;
  /**
   * Absolute expiry timestamp, or `undefined` for permanent
   * mute, or `undefined` when the plugin isn't muted at all.
   * Does NOT check `nowMs` — use `isMuted` to gate on expiry.
   */
  mutedUntilMs(pluginId: string): number | undefined;
  /** Mute permanently. Returns true on any state change. */
  mute(pluginId: string): boolean;
  /**
   * Mute until an absolute timestamp. Returns true on any
   * state change (including "already muted under different
   * terms"). Invalid `expiresAtMs` (NaN/Infinity) rejected.
   */
  muteUntil(pluginId: string, expiresAtMs: number): boolean;
  /**
   * Mute for a relative duration starting at `nowMs`. Invalid
   * inputs rejected; zero-or-negative `durationMs` also
   * rejected (use `unmute` instead).
   */
  muteFor(pluginId: string, nowMs: number, durationMs: number): boolean;
  /** Unmute. Returns true iff there was a live mute entry. */
  unmute(pluginId: string): boolean;
  /** Clear every entry. */
  clear(): void;
  /**
   * Drop every entry whose expiry has passed at `nowMs`.
   * Returns the number of entries removed.
   */
  pruneExpired(nowMs: number): number;
  /** Plugin ids currently muted at `nowMs` (insertion order). */
  mutedIds(nowMs: number): readonly string[];
  /** Number of currently-muted plugins at `nowMs`. */
  size(nowMs: number): number;
  /**
   * Every stored entry (including expired ones), in insertion
   * order. Does NOT check `nowMs`.
   */
  entries(): readonly PluginBrowserMutedPluginEntry[];
}

/**
 * Create a caller-owned muted-plugins ledger.
 */
export function createPluginBrowserMutedPlugins(): PluginBrowserMutedPlugins {
  // Map from pluginId → expiry. `null` sentinel = permanent mute.
  const byId = new Map<string, number | null>();

  function isValidId(s: string): boolean {
    return typeof s === "string" && s.length > 0;
  }

  function isValidMs(n: number): boolean {
    return typeof n === "number" && Number.isFinite(n);
  }

  function normalizedExpiry(v: number | null): number | undefined {
    return v === null ? undefined : v;
  }

  function isLiveAt(v: number | null, nowMs: number): boolean {
    if (v === null) return true;
    return nowMs < v;
  }

  return {
    isMuted(pluginId: string, nowMs: number): boolean {
      if (!isValidId(pluginId) || !isValidMs(nowMs)) return false;
      const v = byId.get(pluginId);
      if (v === undefined) return false;
      return isLiveAt(v, nowMs);
    },
    mutedUntilMs(pluginId: string): number | undefined {
      if (!isValidId(pluginId)) return undefined;
      const v = byId.get(pluginId);
      if (v === undefined) return undefined;
      return normalizedExpiry(v);
    },
    mute(pluginId: string): boolean {
      if (!isValidId(pluginId)) return false;
      const prev = byId.get(pluginId);
      if (prev === null) return false;
      byId.set(pluginId, null);
      return true;
    },
    muteUntil(pluginId: string, expiresAtMs: number): boolean {
      if (!isValidId(pluginId) || !isValidMs(expiresAtMs)) {
        return false;
      }
      const prev = byId.get(pluginId);
      if (prev === expiresAtMs) return false;
      byId.set(pluginId, expiresAtMs);
      return true;
    },
    muteFor(pluginId: string, nowMs: number, durationMs: number): boolean {
      if (
        !isValidId(pluginId) ||
        !isValidMs(nowMs) ||
        !isValidMs(durationMs) ||
        durationMs <= 0
      ) {
        return false;
      }
      const expiresAt = nowMs + durationMs;
      const prev = byId.get(pluginId);
      if (prev === expiresAt) return false;
      byId.set(pluginId, expiresAt);
      return true;
    },
    unmute(pluginId: string): boolean {
      if (!isValidId(pluginId)) return false;
      return byId.delete(pluginId);
    },
    clear(): void {
      byId.clear();
    },
    pruneExpired(nowMs: number): number {
      if (!isValidMs(nowMs)) return 0;
      let removed = 0;
      for (const [id, v] of byId) {
        if (v !== null && nowMs >= v) {
          byId.delete(id);
          removed++;
        }
      }
      return removed;
    },
    mutedIds(nowMs: number): readonly string[] {
      if (!isValidMs(nowMs)) return [];
      const out: string[] = [];
      for (const [id, v] of byId) {
        if (isLiveAt(v, nowMs)) out.push(id);
      }
      return out;
    },
    size(nowMs: number): number {
      if (!isValidMs(nowMs)) return 0;
      let total = 0;
      for (const v of byId.values()) {
        if (isLiveAt(v, nowMs)) total++;
      }
      return total;
    },
    entries(): readonly PluginBrowserMutedPluginEntry[] {
      const out: PluginBrowserMutedPluginEntry[] = [];
      for (const [pluginId, v] of byId) {
        out.push({
          pluginId,
          expiresAtMs: normalizedExpiry(v),
        });
      }
      return out;
    },
  };
}
