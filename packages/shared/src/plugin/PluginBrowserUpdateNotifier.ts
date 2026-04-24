/**
 * Pure per-plugin "update available" advertisement ledger for
 * the Plugin Browser.
 *
 * Drives the "⬆" indicator dot on rows, the "Updates (3)"
 * badge on the nav rail, and the "Update all" toolbar button
 * count. Tracks two dimensions per plugin:
 *
 *   1. advertisement — does the remote registry report a
 *      newer version than what we have installed?
 *   2. dismissed — has the user clicked "not now" on this
 *      advertisement?
 *
 * A plugin has a *pending update* (i.e. ought to be shown to
 * the user) iff advertised AND not dismissed. Advertising a
 * *newer* version than the one the user previously dismissed
 * auto-clears the dismissal — the user dismissed the old
 * advertisement, they should see this one.
 *
 * Version strings are caller-supplied opaque strings; no
 * SemVer parsing is done in this module. Advertising the same
 * `availableVersion` that already exists is idempotent.
 *
 * Pure state. Caller-owned instance. Never throws. Invalid
 * input (empty pluginId / empty version string) silently
 * no-op'd.
 */

export interface PluginBrowserUpdateAdvertisement {
  readonly pluginId: string;
  readonly currentVersion: string;
  readonly availableVersion: string;
  readonly dismissed: boolean;
}

export interface PluginBrowserUpdateNotifier {
  /** True when `pluginId` has any advertisement (regardless of dismissed). */
  hasAdvertisement(pluginId: string): boolean;
  /** True iff advertised AND not dismissed. */
  hasPendingUpdate(pluginId: string): boolean;
  /** True iff advertised AND dismissed. */
  isDismissed(pluginId: string): boolean;
  /** Current advertisement or undefined when none. */
  getAdvertisement(
    pluginId: string,
  ): PluginBrowserUpdateAdvertisement | undefined;
  /** All plugins with ads, regardless of dismissed (insertion order). */
  advertisedPlugins(): readonly string[];
  /** Plugins with ads that are NOT dismissed (insertion order). */
  pluginsWithPendingUpdates(): readonly string[];
  /** Total advertisement count across all plugins. */
  advertisementCount(): number;
  /** Count of plugins with pending (advertised + not dismissed) updates. */
  pendingUpdateCount(): number;
  /**
   * Advertise that a newer `availableVersion` is available.
   * Returns true when this causes a state change:
   *   - new advertisement, OR
   *   - `availableVersion` differs from what was previously
   *     advertised (also auto-clears dismissal).
   * Returns false when:
   *   - input is invalid (empty id / versions)
   *   - the same `availableVersion` was already advertised
   *     (dismissed flag is NOT touched either way).
   * `currentVersion` is overwritten on every advertise; a
   * bare currentVersion bump alone does NOT return true.
   */
  advertise(
    pluginId: string,
    currentVersion: string,
    availableVersion: string,
  ): boolean;
  /**
   * Remove the advertisement entirely (e.g. plugin was just
   * updated or removed). Returns true when it existed.
   */
  clearAdvertisement(pluginId: string): boolean;
  /**
   * Mark the current advertisement dismissed. Returns true
   * when this causes a state change (was advertised AND not
   * already dismissed). False when no ad exists or already
   * dismissed.
   */
  dismiss(pluginId: string): boolean;
  /**
   * Un-dismiss the current advertisement. Returns true when
   * this causes a state change (was advertised AND
   * dismissed).
   */
  undismiss(pluginId: string): boolean;
  /** Wipe every entry across every plugin. */
  clear(): void;
  /** Snapshot in insertion order. */
  entries(): readonly PluginBrowserUpdateAdvertisement[];
}

/**
 * Create a caller-owned update notifier.
 */
export function createPluginBrowserUpdateNotifier(): PluginBrowserUpdateNotifier {
  const byPlugin = new Map<
    string,
    { currentVersion: string; availableVersion: string; dismissed: boolean }
  >();

  function isValidId(s: string): boolean {
    return typeof s === "string" && s.length > 0;
  }

  return {
    hasAdvertisement(pluginId: string): boolean {
      if (!isValidId(pluginId)) return false;
      return byPlugin.has(pluginId);
    },
    hasPendingUpdate(pluginId: string): boolean {
      if (!isValidId(pluginId)) return false;
      const ad = byPlugin.get(pluginId);
      return ad !== undefined && !ad.dismissed;
    },
    isDismissed(pluginId: string): boolean {
      if (!isValidId(pluginId)) return false;
      return byPlugin.get(pluginId)?.dismissed ?? false;
    },
    getAdvertisement(
      pluginId: string,
    ): PluginBrowserUpdateAdvertisement | undefined {
      if (!isValidId(pluginId)) return undefined;
      const ad = byPlugin.get(pluginId);
      if (!ad) return undefined;
      return {
        pluginId,
        currentVersion: ad.currentVersion,
        availableVersion: ad.availableVersion,
        dismissed: ad.dismissed,
      };
    },
    advertisedPlugins(): readonly string[] {
      return [...byPlugin.keys()];
    },
    pluginsWithPendingUpdates(): readonly string[] {
      const out: string[] = [];
      for (const [id, ad] of byPlugin) {
        if (!ad.dismissed) out.push(id);
      }
      return out;
    },
    advertisementCount(): number {
      return byPlugin.size;
    },
    pendingUpdateCount(): number {
      let n = 0;
      for (const ad of byPlugin.values()) {
        if (!ad.dismissed) n++;
      }
      return n;
    },
    advertise(
      pluginId: string,
      currentVersion: string,
      availableVersion: string,
    ): boolean {
      if (
        !isValidId(pluginId) ||
        !isValidId(currentVersion) ||
        !isValidId(availableVersion)
      ) {
        return false;
      }
      const prev = byPlugin.get(pluginId);
      if (!prev) {
        byPlugin.set(pluginId, {
          currentVersion,
          availableVersion,
          dismissed: false,
        });
        return true;
      }
      if (prev.availableVersion === availableVersion) {
        // Overwrite currentVersion silently (client may have
        // updated-to-older between polls) but don't report
        // a state change.
        prev.currentVersion = currentVersion;
        return false;
      }
      // New availableVersion — auto-clear dismissal.
      prev.currentVersion = currentVersion;
      prev.availableVersion = availableVersion;
      prev.dismissed = false;
      return true;
    },
    clearAdvertisement(pluginId: string): boolean {
      if (!isValidId(pluginId)) return false;
      return byPlugin.delete(pluginId);
    },
    dismiss(pluginId: string): boolean {
      if (!isValidId(pluginId)) return false;
      const ad = byPlugin.get(pluginId);
      if (!ad || ad.dismissed) return false;
      ad.dismissed = true;
      return true;
    },
    undismiss(pluginId: string): boolean {
      if (!isValidId(pluginId)) return false;
      const ad = byPlugin.get(pluginId);
      if (!ad || !ad.dismissed) return false;
      ad.dismissed = false;
      return true;
    },
    clear(): void {
      byPlugin.clear();
    },
    entries(): readonly PluginBrowserUpdateAdvertisement[] {
      const out: PluginBrowserUpdateAdvertisement[] = [];
      for (const [pluginId, ad] of byPlugin) {
        out.push({
          pluginId,
          currentVersion: ad.currentVersion,
          availableVersion: ad.availableVersion,
          dismissed: ad.dismissed,
        });
      }
      return out;
    },
  };
}
