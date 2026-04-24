/**
 * Pure FIFO install-queue state for the Plugin Browser.
 *
 * Models the user-visible "Installing Combat Sounds… (3
 * queued)" progress ribbon at the top of the browser. Each
 * entry represents a pending or in-flight install / uninstall
 * / update operation against a single plugin. One entry at a
 * time is "active"; callers pull the head with `startNext` and
 * resolve it with `completeActiveSuccess` or
 * `completeActiveFailure`. The substrate is pure state — it
 * does NOT invoke the actual install — it only tracks the
 * lifecycle so the UI can surface it.
 *
 * Lifecycle per entry:
 *   queued → active → (succeeded | failed | canceled)
 *
 * Cancellation is allowed from `queued` (silently drop from
 * queue) and from `active` (caller is expected to abort the
 * in-flight work). Terminal entries live on until
 * `remove(entryId)` or `clear()` so the UI can flash a
 * success/failure indicator before it drops.
 *
 * Generic payload `<T>` so callers carry their own op union
 * (`{kind:"install",version:"1.2.3"}` etc.) without erasure.
 *
 * Pure state. Caller-owned instance. Never throws. Invalid
 * input (empty pluginId, unknown ids) silently no-op'd.
 */

export type PluginBrowserInstallStatus =
  | "queued"
  | "active"
  | "succeeded"
  | "failed"
  | "canceled";

export interface PluginBrowserInstallEntry<T> {
  readonly id: number;
  readonly pluginId: string;
  readonly payload: T;
  readonly status: PluginBrowserInstallStatus;
  /**
   * Present on `failed` status only; otherwise `undefined`.
   * Caller-supplied.
   */
  readonly failureReason?: string;
}

export interface PluginBrowserInstallQueue<T = unknown> {
  /** True when an entry is currently `active`. */
  hasActive(): boolean;
  /** Current `active` entry, or undefined when none. */
  activeEntry(): PluginBrowserInstallEntry<T> | undefined;
  /** Number of `queued` (not yet started) entries. */
  queuedCount(): number;
  /** Lookup an entry by id, any status. */
  entryById(entryId: number): PluginBrowserInstallEntry<T> | undefined;
  /** All entries in insertion order, any status. */
  entries(): readonly PluginBrowserInstallEntry<T>[];
  /**
   * Enqueue a new op. Returns the new entry id (positive
   * integer) or `-1` when `pluginId` is empty.
   */
  enqueue(pluginId: string, payload: T): number;
  /**
   * Move the oldest `queued` entry to `active`. Returns that
   * entry or `undefined` when the queue is empty OR another
   * entry is already active.
   */
  startNext(): PluginBrowserInstallEntry<T> | undefined;
  /**
   * Mark the active entry as `succeeded`. Returns the
   * updated entry or `undefined` when nothing is active.
   */
  completeActiveSuccess(): PluginBrowserInstallEntry<T> | undefined;
  /**
   * Mark the active entry as `failed`. Returns the updated
   * entry or `undefined` when nothing is active.
   * `reason` is caller-supplied and may be an empty string.
   */
  completeActiveFailure(
    reason: string,
  ): PluginBrowserInstallEntry<T> | undefined;
  /**
   * Cancel an entry. Works on `queued` or `active` only.
   * Returns the updated entry or `undefined` when the id is
   * unknown or already terminal.
   */
  cancelEntry(entryId: number): PluginBrowserInstallEntry<T> | undefined;
  /**
   * Remove a terminal entry (succeeded / failed / canceled)
   * from the ledger. Returns true when removed. Refuses to
   * remove `queued` / `active` entries (cancel first).
   */
  remove(entryId: number): boolean;
  /** Wipe every entry, regardless of status. */
  clear(): void;
}

/**
 * Create a caller-owned install queue.
 */
export function createPluginBrowserInstallQueue<
  T = unknown,
>(): PluginBrowserInstallQueue<T> {
  let nextId = 1;
  const byId = new Map<number, PluginBrowserInstallEntry<T>>();
  const order: number[] = [];
  let activeId = 0;

  function isValidId(s: string): boolean {
    return typeof s === "string" && s.length > 0;
  }

  function updateEntry(
    id: number,
    patch: Partial<PluginBrowserInstallEntry<T>>,
  ): PluginBrowserInstallEntry<T> {
    const prev = byId.get(id);
    if (!prev) throw new Error("unreachable — internal id not tracked");
    const next: PluginBrowserInstallEntry<T> = { ...prev, ...patch };
    byId.set(id, next);
    return next;
  }

  return {
    hasActive(): boolean {
      return activeId !== 0;
    },
    activeEntry(): PluginBrowserInstallEntry<T> | undefined {
      return activeId === 0 ? undefined : byId.get(activeId);
    },
    queuedCount(): number {
      let n = 0;
      for (const id of order) {
        if (byId.get(id)?.status === "queued") n++;
      }
      return n;
    },
    entryById(entryId: number): PluginBrowserInstallEntry<T> | undefined {
      return byId.get(entryId);
    },
    entries(): readonly PluginBrowserInstallEntry<T>[] {
      const out: PluginBrowserInstallEntry<T>[] = [];
      for (const id of order) {
        const e = byId.get(id);
        if (e) out.push(e);
      }
      return out;
    },
    enqueue(pluginId: string, payload: T): number {
      if (!isValidId(pluginId)) return -1;
      const id = nextId++;
      const entry: PluginBrowserInstallEntry<T> = {
        id,
        pluginId,
        payload,
        status: "queued",
      };
      byId.set(id, entry);
      order.push(id);
      return id;
    },
    startNext(): PluginBrowserInstallEntry<T> | undefined {
      if (activeId !== 0) return undefined;
      for (const id of order) {
        const e = byId.get(id);
        if (e && e.status === "queued") {
          const next = updateEntry(id, { status: "active" });
          activeId = id;
          return next;
        }
      }
      return undefined;
    },
    completeActiveSuccess(): PluginBrowserInstallEntry<T> | undefined {
      if (activeId === 0) return undefined;
      const id = activeId;
      const next = updateEntry(id, { status: "succeeded" });
      activeId = 0;
      return next;
    },
    completeActiveFailure(
      reason: string,
    ): PluginBrowserInstallEntry<T> | undefined {
      if (activeId === 0) return undefined;
      const id = activeId;
      const next = updateEntry(id, {
        status: "failed",
        failureReason: typeof reason === "string" ? reason : "",
      });
      activeId = 0;
      return next;
    },
    cancelEntry(entryId: number): PluginBrowserInstallEntry<T> | undefined {
      const prev = byId.get(entryId);
      if (!prev) return undefined;
      if (prev.status !== "queued" && prev.status !== "active")
        return undefined;
      const next = updateEntry(entryId, { status: "canceled" });
      if (activeId === entryId) activeId = 0;
      return next;
    },
    remove(entryId: number): boolean {
      const prev = byId.get(entryId);
      if (!prev) return false;
      if (prev.status === "queued" || prev.status === "active") return false;
      byId.delete(entryId);
      const idx = order.indexOf(entryId);
      if (idx >= 0) order.splice(idx, 1);
      return true;
    },
    clear(): void {
      byId.clear();
      order.length = 0;
      activeId = 0;
    },
  };
}
