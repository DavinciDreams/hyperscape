/**
 * Pure per-plugin, per-field "unsaved edits" tracker for the
 * Plugin Browser config editor.
 *
 * Drives the tiny "●" marker on rows, the "Save 3 changes?"
 * toast, and the "Discard unsaved edits?" confirm dialog. The
 * ledger records which field paths on which plugins have
 * uncommitted edits; it does NOT store values. Caller's config
 * form owns current + pristine values.
 *
 * Semantics:
 *  - Field paths are caller-supplied opaque strings (e.g.
 *    "settings.port", "prayers[0].level"). Uniqueness within a
 *    plugin is enforced by Set semantics.
 *  - A plugin "is dirty" iff it has at least one dirty field.
 *  - When a plugin's last dirty field is cleaned, the plugin
 *    is dropped from the ledger (so `dirtyPlugins()` stays
 *    clean).
 *
 * Pure state. Caller-owned instance. Never throws. Invalid
 * input (empty ids / paths) silently no-op'd.
 */

export interface PluginBrowserDirtyEntry {
  readonly pluginId: string;
  readonly dirtyFields: readonly string[];
}

export interface PluginBrowserDirtyState {
  /** True when `pluginId` has any dirty fields. */
  isDirty(pluginId: string): boolean;
  /** True when `(pluginId, fieldPath)` is specifically marked dirty. */
  isFieldDirty(pluginId: string, fieldPath: string): boolean;
  /** Dirty field paths on `pluginId` (insertion order). */
  dirtyFields(pluginId: string): readonly string[];
  /** Plugin ids with at least one dirty field (insertion order). */
  dirtyPlugins(): readonly string[];
  /** Total dirty-field count across every plugin. */
  totalDirtyFields(): number;
  /** Number of plugins with any dirty fields. */
  dirtyPluginCount(): number;
  /**
   * Mark a field dirty. Returns true when this causes a state
   * change (previously clean). False when already dirty or
   * invalid input.
   */
  markDirty(pluginId: string, fieldPath: string): boolean;
  /**
   * Mark a specific field clean. Returns true when it was
   * previously dirty.
   */
  markClean(pluginId: string, fieldPath: string): boolean;
  /**
   * Mark every field on `pluginId` clean. Returns true when
   * the plugin had at least one dirty field.
   */
  markAllClean(pluginId: string): boolean;
  /** Wipe every entry across every plugin. */
  clear(): void;
  /** Snapshot in insertion order. */
  entries(): readonly PluginBrowserDirtyEntry[];
}

/**
 * Create a caller-owned dirty-state tracker.
 */
export function createPluginBrowserDirtyState(): PluginBrowserDirtyState {
  const byPlugin = new Map<string, Set<string>>();

  function isValidId(s: string): boolean {
    return typeof s === "string" && s.length > 0;
  }

  function dropIfEmpty(pluginId: string, s: Set<string>): void {
    if (s.size === 0) byPlugin.delete(pluginId);
  }

  return {
    isDirty(pluginId: string): boolean {
      if (!isValidId(pluginId)) return false;
      const s = byPlugin.get(pluginId);
      return s !== undefined && s.size > 0;
    },
    isFieldDirty(pluginId: string, fieldPath: string): boolean {
      if (!isValidId(pluginId) || !isValidId(fieldPath)) return false;
      return byPlugin.get(pluginId)?.has(fieldPath) ?? false;
    },
    dirtyFields(pluginId: string): readonly string[] {
      if (!isValidId(pluginId)) return [];
      const s = byPlugin.get(pluginId);
      return s ? [...s] : [];
    },
    dirtyPlugins(): readonly string[] {
      return [...byPlugin.keys()];
    },
    totalDirtyFields(): number {
      let total = 0;
      for (const s of byPlugin.values()) total += s.size;
      return total;
    },
    dirtyPluginCount(): number {
      return byPlugin.size;
    },
    markDirty(pluginId: string, fieldPath: string): boolean {
      if (!isValidId(pluginId) || !isValidId(fieldPath)) return false;
      let s = byPlugin.get(pluginId);
      if (!s) {
        s = new Set();
        byPlugin.set(pluginId, s);
      }
      if (s.has(fieldPath)) return false;
      s.add(fieldPath);
      return true;
    },
    markClean(pluginId: string, fieldPath: string): boolean {
      if (!isValidId(pluginId) || !isValidId(fieldPath)) return false;
      const s = byPlugin.get(pluginId);
      if (!s) return false;
      const changed = s.delete(fieldPath);
      if (changed) dropIfEmpty(pluginId, s);
      return changed;
    },
    markAllClean(pluginId: string): boolean {
      if (!isValidId(pluginId)) return false;
      return byPlugin.delete(pluginId);
    },
    clear(): void {
      byPlugin.clear();
    },
    entries(): readonly PluginBrowserDirtyEntry[] {
      const out: PluginBrowserDirtyEntry[] = [];
      for (const [pluginId, s] of byPlugin) {
        out.push({ pluginId, dirtyFields: [...s] });
      }
      return out;
    },
  };
}
