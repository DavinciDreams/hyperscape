/**
 * Pure per-plugin release-notes viewer state for the Plugin
 * Browser. A lightweight cursor over a caller-supplied
 * version list: tracks which version is *active* (the one
 * whose notes are currently being rendered) and which
 * versions the user has *read*.
 *
 * The viewer does NOT own the release notes text itself —
 * the caller resolves `pluginId + version → notes markdown`
 * out-of-band. This module is purely navigation + read-state.
 *
 * Lifecycle per plugin:
 *   - `open(pluginId, versions)` initializes the viewer for
 *     a plugin, activating the first version in the list.
 *   - `select(version)` activates another version.
 *   - `markRead(version)` flips a version to read.
 *   - `close()` drops the viewer (read state is retained
 *     across re-opens per-plugin).
 *
 * Distinct from:
 *   - `PluginBrowserChangelog` — authored changelog schema.
 *   - `PluginBrowserUpdateAvailability` — "new version out"
 *     notification.
 *   - `PluginBrowserReviewDraft` — review composer.
 *
 * Pure state, caller-owned, never throws. Invalid input
 * silently no-op'd.
 */

export interface PluginBrowserReleaseNotesViewerState {
  readonly pluginId: string;
  readonly versions: readonly string[];
  readonly activeVersion: string;
}

export interface PluginBrowserReleaseNotesViewer {
  /**
   * Open the viewer for `pluginId` with a non-empty
   * `versions` list. Activates the first version. Rejects
   * empty pluginId, empty `versions`, or `versions`
   * containing empty strings / duplicates.
   */
  open(
    pluginId: string,
    versions: readonly string[],
  ): PluginBrowserReleaseNotesViewerState | undefined;
  /** True iff a viewer is currently open. */
  isOpen(): boolean;
  /** Current open state, or undefined. */
  getState(): PluginBrowserReleaseNotesViewerState | undefined;
  /**
   * Activate another version. Must be in the current
   * viewer's `versions`. Returns false when no viewer is
   * open, version unknown, or version already active.
   */
  select(version: string): boolean;
  /**
   * Mark a version as read. Must be in the current viewer's
   * `versions`. Returns false when no viewer is open,
   * version unknown, or version already read. Read state is
   * scoped per-plugin-id and persists across
   * `close()`/`open()` for the SAME plugin.
   */
  markRead(version: string): boolean;
  /** True iff the version is marked read for the current plugin. */
  isRead(version: string): boolean;
  /**
   * All versions of the current viewer that are currently
   * unread (insertion order of `versions`). Empty when no
   * viewer is open.
   */
  unreadVersions(): readonly string[];
  /** Close the current viewer. Returns false when none open. */
  close(): boolean;
  /**
   * Forget ALL read state for every plugin, including the
   * currently-open viewer's plugin. Does not close the
   * current viewer.
   */
  clearAllReadState(): void;
}

function isValidText(s: unknown): s is string {
  return typeof s === "string" && s.length > 0;
}

function isValidVersions(versions: unknown): versions is readonly string[] {
  if (!Array.isArray(versions)) return false;
  if (versions.length === 0) return false;
  const seen = new Set<string>();
  for (const v of versions) {
    if (!isValidText(v)) return false;
    if (seen.has(v)) return false;
    seen.add(v);
  }
  return true;
}

/**
 * Create a caller-owned release-notes viewer.
 */
export function createPluginBrowserReleaseNotesViewer(): PluginBrowserReleaseNotesViewer {
  let open: PluginBrowserReleaseNotesViewerState | undefined;
  // Map<pluginId, Set<version>>
  const readState = new Map<string, Set<string>>();

  function getReadSet(pluginId: string): Set<string> {
    let s = readState.get(pluginId);
    if (!s) {
      s = new Set<string>();
      readState.set(pluginId, s);
    }
    return s;
  }

  return {
    open(
      pluginId: string,
      versions: readonly string[],
    ): PluginBrowserReleaseNotesViewerState | undefined {
      if (!isValidText(pluginId)) return undefined;
      if (!isValidVersions(versions)) return undefined;
      const snapshot: readonly string[] = versions.slice();
      open = {
        pluginId,
        versions: snapshot,
        activeVersion: snapshot[0],
      };
      return open;
    },
    isOpen(): boolean {
      return open !== undefined;
    },
    getState(): PluginBrowserReleaseNotesViewerState | undefined {
      return open;
    },
    select(version: string): boolean {
      if (open === undefined) return false;
      if (!isValidText(version)) return false;
      if (!open.versions.includes(version)) return false;
      if (open.activeVersion === version) return false;
      open = { ...open, activeVersion: version };
      return true;
    },
    markRead(version: string): boolean {
      if (open === undefined) return false;
      if (!isValidText(version)) return false;
      if (!open.versions.includes(version)) return false;
      const s = getReadSet(open.pluginId);
      if (s.has(version)) return false;
      s.add(version);
      return true;
    },
    isRead(version: string): boolean {
      if (open === undefined) return false;
      if (!isValidText(version)) return false;
      const s = readState.get(open.pluginId);
      return s?.has(version) ?? false;
    },
    unreadVersions(): readonly string[] {
      if (open === undefined) return [];
      const s = readState.get(open.pluginId);
      if (!s || s.size === 0) return open.versions.slice();
      return open.versions.filter((v) => !s.has(v));
    },
    close(): boolean {
      if (open === undefined) return false;
      open = undefined;
      return true;
    },
    clearAllReadState(): void {
      readState.clear();
    },
  };
}
