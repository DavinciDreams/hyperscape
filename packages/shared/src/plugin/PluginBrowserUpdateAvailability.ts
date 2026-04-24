/**
 * Pure per-plugin available-update tracker for the Plugin
 * Browser. Records which installed plugins have an update
 * offered by the marketplace and whether the user has
 * dismissed the notification.
 *
 * Each entry carries:
 *   - `pluginId`
 *   - `currentVersion` — what's installed
 *   - `availableVersion` — what's offered
 *   - `releaseNotes?` — optional changelog blurb
 *   - `dismissed` — user tucked the notification away
 *
 * Complements `PluginBrowserInstallQueue` (single-op
 * lifecycle slot), `PluginBrowserDownloadProgress`
 * (byte-level per-plugin progress), and
 * `PluginBrowserBulkProgress` (multi-plugin aggregate
 * summary) — this substrate is the *catalog* of pending
 * updates a user can trigger or ignore.
 *
 * Pure state, caller-owned instance, never throws. Invalid
 * input (empty id, empty version) silently no-op'd.
 */

export interface PluginBrowserUpdateEntry {
  readonly pluginId: string;
  readonly currentVersion: string;
  readonly availableVersion: string;
  readonly releaseNotes?: string;
  readonly dismissed: boolean;
}

export interface PluginBrowserUpdateAvailability {
  /**
   * Record an available update. Fails when any required
   * field is empty. Replaces any prior entry for the same
   * pluginId (dismissed flag is reset to false on replace).
   */
  setAvailable(
    pluginId: string,
    currentVersion: string,
    availableVersion: string,
    releaseNotes?: string,
  ): boolean;
  /** Forget any record for this pluginId. */
  clear(pluginId: string): boolean;
  /**
   * Tuck the notification away. Returns false if there's
   * no entry or it's already dismissed.
   */
  dismiss(pluginId: string): boolean;
  /**
   * Restore a dismissed notification. Returns false if
   * there's no entry or it's already visible.
   */
  restore(pluginId: string): boolean;
  /** True iff the entry exists and is dismissed. */
  isDismissed(pluginId: string): boolean;
  /** Lookup by pluginId. */
  get(pluginId: string): PluginBrowserUpdateEntry | undefined;
  /** Snapshot of every entry in insertion order. */
  all(): readonly PluginBrowserUpdateEntry[];
  /** Entries with `dismissed === false`, insertion order. */
  visible(): readonly PluginBrowserUpdateEntry[];
  /** Total entries (dismissed + visible). */
  count(): number;
  /** Count of entries with `dismissed === false`. */
  visibleCount(): number;
  /** Wipe everything. */
  clearAll(): void;
}

/**
 * Create a caller-owned update-availability tracker.
 */
export function createPluginBrowserUpdateAvailability(): PluginBrowserUpdateAvailability {
  const entries: PluginBrowserUpdateEntry[] = [];

  function isValidId(s: string): boolean {
    return typeof s === "string" && s.length > 0;
  }

  function findIndex(pluginId: string): number {
    for (let i = 0; i < entries.length; i++) {
      if (entries[i].pluginId === pluginId) return i;
    }
    return -1;
  }

  return {
    setAvailable(
      pluginId: string,
      currentVersion: string,
      availableVersion: string,
      releaseNotes?: string,
    ): boolean {
      if (!isValidId(pluginId)) return false;
      if (!isValidId(currentVersion)) return false;
      if (!isValidId(availableVersion)) return false;
      const normalizedNotes =
        typeof releaseNotes === "string" && releaseNotes.length > 0
          ? releaseNotes
          : undefined;
      const next: PluginBrowserUpdateEntry = normalizedNotes
        ? {
            pluginId,
            currentVersion,
            availableVersion,
            releaseNotes: normalizedNotes,
            dismissed: false,
          }
        : {
            pluginId,
            currentVersion,
            availableVersion,
            dismissed: false,
          };
      const idx = findIndex(pluginId);
      if (idx >= 0) {
        entries[idx] = next;
      } else {
        entries.push(next);
      }
      return true;
    },
    clear(pluginId: string): boolean {
      if (!isValidId(pluginId)) return false;
      const idx = findIndex(pluginId);
      if (idx < 0) return false;
      entries.splice(idx, 1);
      return true;
    },
    dismiss(pluginId: string): boolean {
      if (!isValidId(pluginId)) return false;
      const idx = findIndex(pluginId);
      if (idx < 0) return false;
      const prev = entries[idx];
      if (prev.dismissed) return false;
      entries[idx] = { ...prev, dismissed: true };
      return true;
    },
    restore(pluginId: string): boolean {
      if (!isValidId(pluginId)) return false;
      const idx = findIndex(pluginId);
      if (idx < 0) return false;
      const prev = entries[idx];
      if (!prev.dismissed) return false;
      entries[idx] = { ...prev, dismissed: false };
      return true;
    },
    isDismissed(pluginId: string): boolean {
      if (!isValidId(pluginId)) return false;
      const idx = findIndex(pluginId);
      if (idx < 0) return false;
      return entries[idx].dismissed;
    },
    get(pluginId: string): PluginBrowserUpdateEntry | undefined {
      if (!isValidId(pluginId)) return undefined;
      const idx = findIndex(pluginId);
      if (idx < 0) return undefined;
      return entries[idx];
    },
    all(): readonly PluginBrowserUpdateEntry[] {
      return entries.slice();
    },
    visible(): readonly PluginBrowserUpdateEntry[] {
      return entries.filter((e) => !e.dismissed);
    },
    count(): number {
      return entries.length;
    },
    visibleCount(): number {
      let n = 0;
      for (const e of entries) if (!e.dismissed) n++;
      return n;
    },
    clearAll(): void {
      entries.length = 0;
    },
  };
}
