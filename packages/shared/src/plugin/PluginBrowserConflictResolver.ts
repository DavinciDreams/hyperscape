/**
 * Pure single-session dependency-conflict prompt state machine
 * for the Plugin Browser "Enable X" flow.
 *
 * When enabling plugin P requires other plugins (deps) that are
 * missing / disabled / at incompatible versions, callers open a
 * conflict-resolution session here. The UI renders the list;
 * the user either clicks "Resolve all" (→ `accept`) or
 * "Cancel" (→ `cancel`). `close()` force-dismisses without an
 * outcome (e.g., user hits Escape).
 *
 * This substrate stores only the pending conflict list —
 * per-conflict follow-up actions (install, update, enable)
 * are the caller's responsibility. Pure state, caller-owned
 * instance, never throws. Invalid input silently no-op'd.
 * At most one open session at a time; a second `open()`
 * silently replaces the prior (UE5 dialog parity).
 */

export type PluginBrowserConflictKind =
  | "missing"
  | "disabled"
  | "version-mismatch";

export interface PluginBrowserConflict {
  readonly requiredPluginId: string;
  readonly kind: PluginBrowserConflictKind;
  readonly currentVersion?: string;
  readonly requiredVersion?: string;
}

export interface PluginBrowserConflictSession {
  readonly id: number;
  readonly pluginId: string;
  readonly conflicts: readonly PluginBrowserConflict[];
}

export interface PluginBrowserConflictClosed {
  readonly id: number;
  readonly pluginId: string;
  readonly conflicts: readonly PluginBrowserConflict[];
  readonly outcome: "accepted" | "canceled";
}

export interface PluginBrowserConflictResolver {
  /**
   * Open (or replace) the conflict session. Returns the new
   * session or undefined when input is invalid (empty
   * pluginId / empty conflicts / any conflict with an empty
   * requiredPluginId / invalid kind).
   */
  open(
    pluginId: string,
    conflicts: readonly PluginBrowserConflict[],
  ): PluginBrowserConflictSession | undefined;
  /** True iff a session is currently open. */
  hasOpen(): boolean;
  /** Snapshot of the currently-open session, or undefined. */
  getOpen(): PluginBrowserConflictSession | undefined;
  /**
   * User chose "Resolve all". Returns the closed session
   * (outcome="accepted") or undefined when no session was
   * open.
   */
  accept(): PluginBrowserConflictClosed | undefined;
  /**
   * User chose "Cancel". Returns the closed session
   * (outcome="canceled") or undefined.
   */
  cancel(): PluginBrowserConflictClosed | undefined;
  /**
   * Force-dismiss without an outcome (e.g., user hit Escape
   * or navigated away). Returns true when a session was
   * closed.
   */
  close(): boolean;
}

const VALID_KIND: readonly PluginBrowserConflictKind[] = [
  "missing",
  "disabled",
  "version-mismatch",
];

function isValidKind(k: unknown): k is PluginBrowserConflictKind {
  return typeof k === "string" && (VALID_KIND as readonly string[]).includes(k);
}

function isValidId(s: string): boolean {
  return typeof s === "string" && s.length > 0;
}

function freezeConflicts(
  raw: readonly PluginBrowserConflict[],
): readonly PluginBrowserConflict[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: PluginBrowserConflict[] = [];
  for (const c of raw) {
    if (!c || typeof c !== "object") return undefined;
    if (!isValidId(c.requiredPluginId)) return undefined;
    if (!isValidKind(c.kind)) return undefined;
    const entry: PluginBrowserConflict = {
      requiredPluginId: c.requiredPluginId,
      kind: c.kind,
    };
    // Preserve optional version fields when non-empty strings.
    const withCur: PluginBrowserConflict & { currentVersion?: string } =
      typeof c.currentVersion === "string" && c.currentVersion.length > 0
        ? { ...entry, currentVersion: c.currentVersion }
        : entry;
    const withReq: PluginBrowserConflict & {
      currentVersion?: string;
      requiredVersion?: string;
    } =
      typeof c.requiredVersion === "string" && c.requiredVersion.length > 0
        ? { ...withCur, requiredVersion: c.requiredVersion }
        : withCur;
    out.push(withReq);
  }
  return out;
}

/**
 * Create a caller-owned conflict-resolver session holder.
 */
export function createPluginBrowserConflictResolver(): PluginBrowserConflictResolver {
  let nextId = 1;
  let current: PluginBrowserConflictSession | undefined;

  return {
    open(
      pluginId: string,
      conflicts: readonly PluginBrowserConflict[],
    ): PluginBrowserConflictSession | undefined {
      if (!isValidId(pluginId)) return undefined;
      const frozen = freezeConflicts(conflicts);
      if (!frozen) return undefined;
      const session: PluginBrowserConflictSession = {
        id: nextId++,
        pluginId,
        conflicts: frozen,
      };
      current = session;
      return session;
    },
    hasOpen(): boolean {
      return current !== undefined;
    },
    getOpen(): PluginBrowserConflictSession | undefined {
      return current;
    },
    accept(): PluginBrowserConflictClosed | undefined {
      if (!current) return undefined;
      const closed: PluginBrowserConflictClosed = {
        id: current.id,
        pluginId: current.pluginId,
        conflicts: current.conflicts,
        outcome: "accepted",
      };
      current = undefined;
      return closed;
    },
    cancel(): PluginBrowserConflictClosed | undefined {
      if (!current) return undefined;
      const closed: PluginBrowserConflictClosed = {
        id: current.id,
        pluginId: current.pluginId,
        conflicts: current.conflicts,
        outcome: "canceled",
      };
      current = undefined;
      return closed;
    },
    close(): boolean {
      if (!current) return false;
      current = undefined;
      return true;
    },
  };
}
