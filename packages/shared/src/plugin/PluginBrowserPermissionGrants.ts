/**
 * Pure per-plugin, per-permission grant ledger for the Plugin
 * Browser permission panel.
 *
 * Each plugin declares a set of permissions it needs (network,
 * filesystem, clipboard, etc. — caller-defined opaque strings).
 * This substrate tracks whether the user has explicitly
 * granted, denied, or not-yet-decided on each one:
 *
 *   unrecorded (default) → pending decision (needs prompt)
 *   granted              → user approved
 *   denied               → user rejected
 *
 * Reset returns a permission to the unrecorded state so the
 * next enable will re-prompt.
 *
 * This module is storage only — actually *enforcing* the grant
 * at runtime (deny network if not granted) is the host's job.
 * It also does NOT schedule prompts; `PluginBrowserActionConfirmation`
 * is the dialog engine.
 *
 * Pure state. Caller-owned instance. Never throws. Invalid
 * input (empty ids) silently no-op'd.
 */

export type PluginBrowserPermissionGrantState = "granted" | "denied";

export interface PluginBrowserPermissionGrantEntry {
  readonly pluginId: string;
  readonly permission: string;
  readonly state: PluginBrowserPermissionGrantState;
}

export interface PluginBrowserPermissionGrants {
  /** True iff the user has granted (pluginId, permission). */
  isGranted(pluginId: string, permission: string): boolean;
  /** True iff the user has denied (pluginId, permission). */
  isDenied(pluginId: string, permission: string): boolean;
  /**
   * Explicit state for (pluginId, permission) or `undefined`
   * for unrecorded (pending-on-first-enable).
   */
  getState(
    pluginId: string,
    permission: string,
  ): PluginBrowserPermissionGrantState | undefined;
  /**
   * All permissions granted on `pluginId` (insertion order
   * within that plugin).
   */
  grantedPermissions(pluginId: string): readonly string[];
  /**
   * All permissions denied on `pluginId` (insertion order).
   */
  deniedPermissions(pluginId: string): readonly string[];
  /** Plugin ids with any recorded grants/denials. */
  pluginsWithRecords(): readonly string[];
  /** Total recorded permissions across all plugins. */
  totalRecordCount(): number;
  /**
   * Mark a permission granted. Returns true when this causes
   * a state change (was unrecorded or denied).
   */
  grant(pluginId: string, permission: string): boolean;
  /**
   * Mark a permission denied. Returns true when this causes
   * a state change (was unrecorded or granted).
   */
  deny(pluginId: string, permission: string): boolean;
  /**
   * Clear a single permission record (back to unrecorded).
   * Returns true when a record was removed.
   */
  reset(pluginId: string, permission: string): boolean;
  /**
   * Clear every record for `pluginId`. Returns true when at
   * least one record was removed.
   */
  clearForPlugin(pluginId: string): boolean;
  /** Wipe every record across every plugin. */
  clear(): void;
  /** Snapshot in insertion order. */
  entries(): readonly PluginBrowserPermissionGrantEntry[];
}

/**
 * Create a caller-owned permission-grants ledger.
 */
export function createPluginBrowserPermissionGrants(): PluginBrowserPermissionGrants {
  const byPlugin = new Map<
    string,
    Map<string, PluginBrowserPermissionGrantState>
  >();

  function isValidId(s: string): boolean {
    return typeof s === "string" && s.length > 0;
  }

  function dropIfEmpty(
    pluginId: string,
    m: Map<string, PluginBrowserPermissionGrantState>,
  ): void {
    if (m.size === 0) byPlugin.delete(pluginId);
  }

  function permissionsInState(
    pluginId: string,
    want: PluginBrowserPermissionGrantState,
  ): readonly string[] {
    const m = byPlugin.get(pluginId);
    if (!m) return [];
    const out: string[] = [];
    for (const [perm, state] of m) {
      if (state === want) out.push(perm);
    }
    return out;
  }

  function setState(
    pluginId: string,
    permission: string,
    state: PluginBrowserPermissionGrantState,
  ): boolean {
    if (!isValidId(pluginId) || !isValidId(permission)) return false;
    let m = byPlugin.get(pluginId);
    if (!m) {
      m = new Map();
      byPlugin.set(pluginId, m);
    }
    if (m.get(permission) === state) return false;
    m.set(permission, state);
    return true;
  }

  return {
    isGranted(pluginId: string, permission: string): boolean {
      if (!isValidId(pluginId) || !isValidId(permission)) return false;
      return byPlugin.get(pluginId)?.get(permission) === "granted";
    },
    isDenied(pluginId: string, permission: string): boolean {
      if (!isValidId(pluginId) || !isValidId(permission)) return false;
      return byPlugin.get(pluginId)?.get(permission) === "denied";
    },
    getState(
      pluginId: string,
      permission: string,
    ): PluginBrowserPermissionGrantState | undefined {
      if (!isValidId(pluginId) || !isValidId(permission)) return undefined;
      return byPlugin.get(pluginId)?.get(permission);
    },
    grantedPermissions(pluginId: string): readonly string[] {
      if (!isValidId(pluginId)) return [];
      return permissionsInState(pluginId, "granted");
    },
    deniedPermissions(pluginId: string): readonly string[] {
      if (!isValidId(pluginId)) return [];
      return permissionsInState(pluginId, "denied");
    },
    pluginsWithRecords(): readonly string[] {
      return [...byPlugin.keys()];
    },
    totalRecordCount(): number {
      let n = 0;
      for (const m of byPlugin.values()) n += m.size;
      return n;
    },
    grant(pluginId: string, permission: string): boolean {
      return setState(pluginId, permission, "granted");
    },
    deny(pluginId: string, permission: string): boolean {
      return setState(pluginId, permission, "denied");
    },
    reset(pluginId: string, permission: string): boolean {
      if (!isValidId(pluginId) || !isValidId(permission)) return false;
      const m = byPlugin.get(pluginId);
      if (!m) return false;
      const changed = m.delete(permission);
      if (changed) dropIfEmpty(pluginId, m);
      return changed;
    },
    clearForPlugin(pluginId: string): boolean {
      if (!isValidId(pluginId)) return false;
      return byPlugin.delete(pluginId);
    },
    clear(): void {
      byPlugin.clear();
    },
    entries(): readonly PluginBrowserPermissionGrantEntry[] {
      const out: PluginBrowserPermissionGrantEntry[] = [];
      for (const [pluginId, m] of byPlugin) {
        for (const [permission, state] of m) {
          out.push({ pluginId, permission, state });
        }
      }
      return out;
    },
  };
}
