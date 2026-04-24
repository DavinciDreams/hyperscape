/**
 * Pure per-plugin download-progress ledger for the Plugin
 * Browser install/update UX.
 *
 * Complements `PluginBrowserInstallQueue` (which tracks the
 * lifecycle slot of each queued op) by tracking the
 * *byte-level* progress of the active fetch:
 *
 *   active    → download in flight, `doneBytes ≤ totalBytes`
 *   completed → fully fetched (doneBytes := totalBytes)
 *   failed    → aborted with `reason`
 *   canceled  → user canceled
 *
 * At most one record per pluginId. Terminal records stick
 * around until `remove()` or `clear()` so UIs can render
 * trailing success/failure toasts. Pure state, caller-owned
 * instance, never throws. Invalid input (empty id, non-positive
 * totalBytes) silently no-op'd.
 */

export type PluginBrowserDownloadStatus =
  | "active"
  | "completed"
  | "failed"
  | "canceled";

export interface PluginBrowserDownloadEntry {
  readonly pluginId: string;
  readonly status: PluginBrowserDownloadStatus;
  readonly doneBytes: number;
  readonly totalBytes: number;
  readonly reason?: string;
}

export interface PluginBrowserDownloadProgress {
  /** Entry for `pluginId`, or undefined if none tracked. */
  getProgress(pluginId: string): PluginBrowserDownloadEntry | undefined;
  /** True iff an entry exists and its status is "active". */
  isActive(pluginId: string): boolean;
  /**
   * Fraction in `[0, 1]` of `doneBytes / totalBytes`, or
   * undefined when no entry exists. `totalBytes === 0` safely
   * returns 0.
   */
  percentage(pluginId: string): number | undefined;
  /** Count of entries currently in "active" status. */
  activeCount(): number;
  /** Plugin ids in tracking order. */
  pluginsTracked(): readonly string[];
  /** Snapshot of every entry. */
  entries(): readonly PluginBrowserDownloadEntry[];

  /**
   * Begin tracking a download. Requires a positive `totalBytes`.
   * If an entry already exists and is still active, returns
   * false — callers must cancel/complete/fail the old one
   * first. Terminal entries are silently replaced. Returns true
   * on successful start.
   */
  start(pluginId: string, totalBytes: number): boolean;
  /**
   * Update `doneBytes` for an active entry. Clamps to
   * `[0, totalBytes]`. Returns true when the effective value
   * changed. No-op when entry is missing or not active.
   */
  update(pluginId: string, doneBytes: number): boolean;
  /**
   * Mark the active entry "completed" (sets doneBytes to
   * totalBytes). Returns the resulting entry or undefined when
   * there was no active entry.
   */
  complete(pluginId: string): PluginBrowserDownloadEntry | undefined;
  /**
   * Mark the active entry "failed" with `reason`. Requires a
   * non-empty reason. Returns the resulting entry or undefined.
   */
  fail(
    pluginId: string,
    reason: string,
  ): PluginBrowserDownloadEntry | undefined;
  /**
   * Mark the active entry "canceled". Returns the resulting
   * entry or undefined.
   */
  cancel(pluginId: string): PluginBrowserDownloadEntry | undefined;

  /**
   * Remove the entry for `pluginId`. Refuses to remove while
   * the entry is still active (caller must cancel/complete/fail
   * first). Returns true when an entry was removed.
   */
  remove(pluginId: string): boolean;
  /** Wipe every entry (including active ones). */
  clear(): void;
}

/**
 * Create a caller-owned download-progress ledger.
 */
export function createPluginBrowserDownloadProgress(): PluginBrowserDownloadProgress {
  const byId = new Map<string, PluginBrowserDownloadEntry>();

  function isValidId(s: string): boolean {
    return typeof s === "string" && s.length > 0;
  }

  function clampDone(done: number, total: number): number {
    if (!Number.isFinite(done) || done < 0) return 0;
    if (done > total) return total;
    return done;
  }

  return {
    getProgress(pluginId: string): PluginBrowserDownloadEntry | undefined {
      if (!isValidId(pluginId)) return undefined;
      return byId.get(pluginId);
    },
    isActive(pluginId: string): boolean {
      if (!isValidId(pluginId)) return false;
      return byId.get(pluginId)?.status === "active";
    },
    percentage(pluginId: string): number | undefined {
      if (!isValidId(pluginId)) return undefined;
      const e = byId.get(pluginId);
      if (!e) return undefined;
      if (e.totalBytes === 0) return 0;
      return e.doneBytes / e.totalBytes;
    },
    activeCount(): number {
      let n = 0;
      for (const e of byId.values()) {
        if (e.status === "active") n++;
      }
      return n;
    },
    pluginsTracked(): readonly string[] {
      return [...byId.keys()];
    },
    entries(): readonly PluginBrowserDownloadEntry[] {
      return [...byId.values()];
    },
    start(pluginId: string, totalBytes: number): boolean {
      if (!isValidId(pluginId)) return false;
      if (!Number.isFinite(totalBytes) || totalBytes <= 0) return false;
      const existing = byId.get(pluginId);
      if (existing && existing.status === "active") return false;
      byId.set(pluginId, {
        pluginId,
        status: "active",
        doneBytes: 0,
        totalBytes,
      });
      return true;
    },
    update(pluginId: string, doneBytes: number): boolean {
      if (!isValidId(pluginId)) return false;
      const e = byId.get(pluginId);
      if (!e || e.status !== "active") return false;
      const clamped = clampDone(doneBytes, e.totalBytes);
      if (clamped === e.doneBytes) return false;
      byId.set(pluginId, { ...e, doneBytes: clamped });
      return true;
    },
    complete(pluginId: string): PluginBrowserDownloadEntry | undefined {
      if (!isValidId(pluginId)) return undefined;
      const e = byId.get(pluginId);
      if (!e || e.status !== "active") return undefined;
      const next: PluginBrowserDownloadEntry = {
        pluginId: e.pluginId,
        status: "completed",
        doneBytes: e.totalBytes,
        totalBytes: e.totalBytes,
      };
      byId.set(pluginId, next);
      return next;
    },
    fail(
      pluginId: string,
      reason: string,
    ): PluginBrowserDownloadEntry | undefined {
      if (!isValidId(pluginId)) return undefined;
      if (typeof reason !== "string" || reason.length === 0) return undefined;
      const e = byId.get(pluginId);
      if (!e || e.status !== "active") return undefined;
      const next: PluginBrowserDownloadEntry = {
        pluginId: e.pluginId,
        status: "failed",
        doneBytes: e.doneBytes,
        totalBytes: e.totalBytes,
        reason,
      };
      byId.set(pluginId, next);
      return next;
    },
    cancel(pluginId: string): PluginBrowserDownloadEntry | undefined {
      if (!isValidId(pluginId)) return undefined;
      const e = byId.get(pluginId);
      if (!e || e.status !== "active") return undefined;
      const next: PluginBrowserDownloadEntry = {
        pluginId: e.pluginId,
        status: "canceled",
        doneBytes: e.doneBytes,
        totalBytes: e.totalBytes,
      };
      byId.set(pluginId, next);
      return next;
    },
    remove(pluginId: string): boolean {
      if (!isValidId(pluginId)) return false;
      const e = byId.get(pluginId);
      if (!e) return false;
      if (e.status === "active") return false;
      byId.delete(pluginId);
      return true;
    },
    clear(): void {
      byId.clear();
    },
  };
}
