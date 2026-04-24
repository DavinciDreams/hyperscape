/**
 * Pure per-plugin release-channel-preference ledger.
 *
 * Users can pick a channel (`"stable"`, `"beta"`, `"nightly"`,
 * or a custom caller-defined string) on a per-plugin basis,
 * or leave the plugin on the global default. Drives the
 * "Beta" / "Nightly" pill shown next to the version string on
 * each row and the channel-dropdown on the details panel.
 *
 * This substrate stores:
 *   1. a global `defaultChannel` (every plugin falls back to
 *      this unless it has an explicit override)
 *   2. a sparse map of per-plugin overrides
 *
 * Channel names are caller-supplied opaque strings; no
 * enforcement of canonical values. `stable` is the *implicit*
 * default's default — nothing requires it, but empty/invalid
 * channel strings are rejected at the boundary.
 *
 * Pure state. Caller-owned instance. Never throws. Invalid
 * input (empty pluginId / channel) silently no-op'd.
 */

export interface PluginBrowserReleaseChannelEntry {
  readonly pluginId: string;
  readonly channel: string;
}

export interface PluginBrowserReleaseChannel {
  /** The global fallback channel for plugins without an override. */
  defaultChannel(): string;
  /**
   * Effective channel for `pluginId` — the override if any,
   * otherwise the default. Empty `pluginId` falls back to
   * the default channel.
   */
  getChannel(pluginId: string): string;
  /**
   * The explicit override for `pluginId` or `undefined` when
   * the plugin is on the default.
   */
  getOverride(pluginId: string): string | undefined;
  /** True when `pluginId` has an explicit override. */
  hasOverride(pluginId: string): boolean;
  /** All plugin ids with overrides (insertion order). */
  pluginsWithOverrides(): readonly string[];
  /** Number of overrides currently set. */
  overrideCount(): number;
  /**
   * Change the global default channel. Returns true when
   * this causes a state change. False when channel is the
   * same or empty.
   */
  setDefault(channel: string): boolean;
  /**
   * Set a per-plugin override. If `channel` equals the
   * global default, the override is cleared (mimics the
   * user dragging a plugin back to "follow default").
   * Returns true on state change.
   */
  setChannel(pluginId: string, channel: string): boolean;
  /**
   * Remove the override on `pluginId`. Returns true when
   * an override was actually removed.
   */
  resetToDefault(pluginId: string): boolean;
  /**
   * Remove every override. Returns the count removed.
   */
  resetAll(): number;
  /** Snapshot of overrides in insertion order. */
  entries(): readonly PluginBrowserReleaseChannelEntry[];
}

/**
 * Create a caller-owned release-channel state. `initialDefault`
 * seeds the global default (defaults to `"stable"`). Empty
 * string falls back to `"stable"`.
 */
export function createPluginBrowserReleaseChannel(
  initialDefault: string = "stable",
): PluginBrowserReleaseChannel {
  const overrides = new Map<string, string>();
  let defaultCh =
    typeof initialDefault === "string" && initialDefault.length > 0
      ? initialDefault
      : "stable";

  function isValidId(s: string): boolean {
    return typeof s === "string" && s.length > 0;
  }

  return {
    defaultChannel(): string {
      return defaultCh;
    },
    getChannel(pluginId: string): string {
      if (!isValidId(pluginId)) return defaultCh;
      return overrides.get(pluginId) ?? defaultCh;
    },
    getOverride(pluginId: string): string | undefined {
      if (!isValidId(pluginId)) return undefined;
      return overrides.get(pluginId);
    },
    hasOverride(pluginId: string): boolean {
      if (!isValidId(pluginId)) return false;
      return overrides.has(pluginId);
    },
    pluginsWithOverrides(): readonly string[] {
      return [...overrides.keys()];
    },
    overrideCount(): number {
      return overrides.size;
    },
    setDefault(channel: string): boolean {
      if (!isValidId(channel)) return false;
      if (defaultCh === channel) return false;
      defaultCh = channel;
      return true;
    },
    setChannel(pluginId: string, channel: string): boolean {
      if (!isValidId(pluginId) || !isValidId(channel)) return false;
      if (channel === defaultCh) {
        // Treat setting to default as "follow default" — drop
        // any existing override.
        return overrides.delete(pluginId);
      }
      const prev = overrides.get(pluginId);
      if (prev === channel) return false;
      overrides.set(pluginId, channel);
      return true;
    },
    resetToDefault(pluginId: string): boolean {
      if (!isValidId(pluginId)) return false;
      return overrides.delete(pluginId);
    },
    resetAll(): number {
      const n = overrides.size;
      overrides.clear();
      return n;
    },
    entries(): readonly PluginBrowserReleaseChannelEntry[] {
      const out: PluginBrowserReleaseChannelEntry[] = [];
      for (const [pluginId, channel] of overrides) {
        out.push({ pluginId, channel });
      }
      return out;
    },
  };
}
