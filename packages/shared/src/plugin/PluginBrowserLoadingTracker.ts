/**
 * Pure in-flight operation tracker for the Plugin Browser.
 * Drives per-row spinner overlays and "disable bulk action on
 * busy plugins" logic. Records WHICH plugins currently have
 * WHICH operations in progress.
 *
 * Operation kinds are caller-supplied so plugin authors can
 * extend the set (install / update / enable / disable / reload /
 * uninstall / custom).
 *
 * Pure state. Caller-owned instance (not a singleton). Never
 * throws. Unknown / empty ids and operations are silent no-ops.
 */

export interface PluginBrowserLoadingTrackerEntry {
  readonly pluginId: string;
  readonly operations: readonly string[];
}

export interface PluginBrowserLoadingTracker {
  /** True when `pluginId` has any in-flight operation. */
  isBusy(pluginId: string): boolean;
  /**
   * True when `pluginId` has `operation` specifically in
   * flight.
   */
  has(pluginId: string, operation: string): boolean;
  /** Number of plugins with at least one in-flight operation. */
  busyCount(): number;
  /** All plugin ids with at least one in-flight operation. */
  busyPluginIds(): readonly string[];
  /**
   * Sorted operations currently in flight for `pluginId` (or
   * `[]` when idle). Operations are returned in the order they
   * were started.
   */
  operationsFor(pluginId: string): readonly string[];
  /**
   * Start `operation` on `pluginId`. Returns true when a
   * change occurred (`false` when invalid input or when that
   * operation was already in flight).
   */
  start(pluginId: string, operation: string): boolean;
  /**
   * Finish `operation` on `pluginId`. Returns true when a
   * change occurred (`false` when the operation was not in
   * flight).
   */
  finish(pluginId: string, operation: string): boolean;
  /**
   * Finish every operation on `pluginId`. Returns true when
   * `pluginId` had at least one in-flight operation.
   */
  finishAll(pluginId: string): boolean;
  /** Drop every in-flight operation across all plugins. */
  clear(): void;
  /** Snapshot (stable insertion order). */
  entries(): readonly PluginBrowserLoadingTrackerEntry[];
}

/**
 * Create a caller-owned loading tracker.
 */
export function createPluginBrowserLoadingTracker(): PluginBrowserLoadingTracker {
  // Map preserves insertion order at both levels.
  const byPlugin = new Map<string, Set<string>>();

  function setFor(pluginId: string): Set<string> | undefined {
    return byPlugin.get(pluginId);
  }

  function isValidId(s: string): boolean {
    return typeof s === "string" && s.length > 0;
  }

  return {
    isBusy(pluginId: string): boolean {
      if (!isValidId(pluginId)) return false;
      const s = setFor(pluginId);
      return s !== undefined && s.size > 0;
    },
    has(pluginId: string, operation: string): boolean {
      if (!isValidId(pluginId) || !isValidId(operation)) {
        return false;
      }
      const s = setFor(pluginId);
      return s !== undefined && s.has(operation);
    },
    busyCount(): number {
      return byPlugin.size;
    },
    busyPluginIds(): readonly string[] {
      return [...byPlugin.keys()];
    },
    operationsFor(pluginId: string): readonly string[] {
      if (!isValidId(pluginId)) return [];
      const s = setFor(pluginId);
      return s ? [...s] : [];
    },
    start(pluginId: string, operation: string): boolean {
      if (!isValidId(pluginId) || !isValidId(operation)) {
        return false;
      }
      let s = byPlugin.get(pluginId);
      if (!s) {
        s = new Set<string>();
        byPlugin.set(pluginId, s);
      }
      if (s.has(operation)) return false;
      s.add(operation);
      return true;
    },
    finish(pluginId: string, operation: string): boolean {
      if (!isValidId(pluginId) || !isValidId(operation)) {
        return false;
      }
      const s = byPlugin.get(pluginId);
      if (!s) return false;
      const changed = s.delete(operation);
      if (changed && s.size === 0) byPlugin.delete(pluginId);
      return changed;
    },
    finishAll(pluginId: string): boolean {
      if (!isValidId(pluginId)) return false;
      return byPlugin.delete(pluginId);
    },
    clear(): void {
      byPlugin.clear();
    },
    entries(): readonly PluginBrowserLoadingTrackerEntry[] {
      const out: PluginBrowserLoadingTrackerEntry[] = [];
      for (const [pluginId, ops] of byPlugin) {
        out.push({ pluginId, operations: [...ops] });
      }
      return out;
    },
  };
}
