/**
 * Pure per-plugin, per-field validation-error ledger for the
 * Plugin Browser config editor.
 *
 * Complements `PluginBrowserDirtyState` (which tracks *what
 * changed*) by tracking *what's invalid*. Drives the red
 * underline on a field, the tooltip with the error message,
 * and the disabled state on the "Save" button when any field
 * is invalid.
 *
 * Field paths are caller-supplied opaque strings matching the
 * dirty-state paths (e.g. "settings.port"). Error messages are
 * arbitrary caller-authored strings (typically pre-localized).
 *
 * Semantics:
 *  - A plugin "has errors" iff it has at least one errored
 *    field. When the last errored field is cleared, the plugin
 *    is dropped from the ledger.
 *  - Setting an error with the same message is idempotent
 *    (returns false). Updating the message on an existing
 *    errored field returns true.
 *  - Empty ids / empty messages silently no-op.
 *
 * Pure state. Caller-owned instance. Never throws.
 */

export interface PluginBrowserFieldErrorEntry {
  readonly pluginId: string;
  readonly errors: ReadonlyArray<{
    readonly fieldPath: string;
    readonly message: string;
  }>;
}

export interface PluginBrowserFieldValidation {
  /** True when `pluginId` has any errored fields. */
  hasError(pluginId: string): boolean;
  /** True when `(pluginId, fieldPath)` has an error. */
  hasFieldError(pluginId: string, fieldPath: string): boolean;
  /**
   * Error message for `(pluginId, fieldPath)` or `undefined`
   * when no error is present.
   */
  getFieldError(pluginId: string, fieldPath: string): string | undefined;
  /** All errored field paths on `pluginId` (insertion order). */
  erroredFields(pluginId: string): readonly string[];
  /** All plugin ids with at least one errored field. */
  erroredPlugins(): readonly string[];
  /** Total errored-field count across every plugin. */
  totalErrorCount(): number;
  /** Number of plugins with any errored fields. */
  erroredPluginCount(): number;
  /**
   * Set the error message on `(pluginId, fieldPath)`. Returns
   * true when this causes a state change (new error OR
   * different message). False when idempotent or invalid.
   */
  setError(pluginId: string, fieldPath: string, message: string): boolean;
  /**
   * Clear a specific field's error. Returns true when it was
   * previously errored.
   */
  clearError(pluginId: string, fieldPath: string): boolean;
  /**
   * Clear every errored field on `pluginId`. Returns true
   * when the plugin had at least one errored field.
   */
  clearAllForPlugin(pluginId: string): boolean;
  /** Wipe every entry across every plugin. */
  clear(): void;
  /** Snapshot in insertion order. */
  entries(): readonly PluginBrowserFieldErrorEntry[];
}

/**
 * Create a caller-owned field-validation ledger.
 */
export function createPluginBrowserFieldValidation(): PluginBrowserFieldValidation {
  const byPlugin = new Map<string, Map<string, string>>();

  function isValidId(s: string): boolean {
    return typeof s === "string" && s.length > 0;
  }

  function dropIfEmpty(pluginId: string, m: Map<string, string>): void {
    if (m.size === 0) byPlugin.delete(pluginId);
  }

  return {
    hasError(pluginId: string): boolean {
      if (!isValidId(pluginId)) return false;
      const m = byPlugin.get(pluginId);
      return m !== undefined && m.size > 0;
    },
    hasFieldError(pluginId: string, fieldPath: string): boolean {
      if (!isValidId(pluginId) || !isValidId(fieldPath)) return false;
      return byPlugin.get(pluginId)?.has(fieldPath) ?? false;
    },
    getFieldError(pluginId: string, fieldPath: string): string | undefined {
      if (!isValidId(pluginId) || !isValidId(fieldPath)) return undefined;
      return byPlugin.get(pluginId)?.get(fieldPath);
    },
    erroredFields(pluginId: string): readonly string[] {
      if (!isValidId(pluginId)) return [];
      const m = byPlugin.get(pluginId);
      return m ? [...m.keys()] : [];
    },
    erroredPlugins(): readonly string[] {
      return [...byPlugin.keys()];
    },
    totalErrorCount(): number {
      let total = 0;
      for (const m of byPlugin.values()) total += m.size;
      return total;
    },
    erroredPluginCount(): number {
      return byPlugin.size;
    },
    setError(pluginId: string, fieldPath: string, message: string): boolean {
      if (
        !isValidId(pluginId) ||
        !isValidId(fieldPath) ||
        !isValidId(message)
      ) {
        return false;
      }
      let m = byPlugin.get(pluginId);
      if (!m) {
        m = new Map();
        byPlugin.set(pluginId, m);
      }
      const prev = m.get(fieldPath);
      if (prev === message) return false;
      m.set(fieldPath, message);
      return true;
    },
    clearError(pluginId: string, fieldPath: string): boolean {
      if (!isValidId(pluginId) || !isValidId(fieldPath)) return false;
      const m = byPlugin.get(pluginId);
      if (!m) return false;
      const changed = m.delete(fieldPath);
      if (changed) dropIfEmpty(pluginId, m);
      return changed;
    },
    clearAllForPlugin(pluginId: string): boolean {
      if (!isValidId(pluginId)) return false;
      return byPlugin.delete(pluginId);
    },
    clear(): void {
      byPlugin.clear();
    },
    entries(): readonly PluginBrowserFieldErrorEntry[] {
      const out: PluginBrowserFieldErrorEntry[] = [];
      for (const [pluginId, m] of byPlugin) {
        const errors: { fieldPath: string; message: string }[] = [];
        for (const [fieldPath, message] of m) {
          errors.push({ fieldPath, message });
        }
        out.push({ pluginId, errors });
      }
      return out;
    },
  };
}
