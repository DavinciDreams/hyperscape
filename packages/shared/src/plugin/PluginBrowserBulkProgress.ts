/**
 * Pure aggregate progress tracker for Plugin Browser bulk
 * operations (e.g., "Update 12 plugins", "Remove 5 plugins").
 *
 * Each batch is a monotonic-id-keyed record holding:
 *   - `kind` — opaque caller-supplied label ("install",
 *     "update", "remove", etc.)
 *   - `items` — per-plugin status map with lifecycle
 *     `pending → active → succeeded | failed | canceled`
 *
 * Terminal statuses are `succeeded | failed | canceled`. A
 * batch is *complete* iff every item is terminal. Complete
 * batches stick around so UIs can render a summary toast
 * until `remove(batchId)` or `clear()`.
 *
 * Complements `PluginBrowserInstallQueue` (single-op
 * lifecycle slot) and `PluginBrowserDownloadProgress`
 * (byte-level per-plugin progress) — this substrate is for
 * the multi-plugin *aggregate* summary.
 *
 * Pure state, caller-owned instance, never throws. Invalid
 * input (empty id, empty plugin list, unknown status)
 * silently no-op'd.
 */

export type PluginBrowserBulkItemStatus =
  | "pending"
  | "active"
  | "succeeded"
  | "failed"
  | "canceled";

export interface PluginBrowserBulkItem {
  readonly pluginId: string;
  readonly status: PluginBrowserBulkItemStatus;
}

export interface PluginBrowserBulkBatch {
  readonly id: number;
  readonly kind: string;
  readonly items: readonly PluginBrowserBulkItem[];
}

export interface PluginBrowserBulkCompletion {
  readonly total: number;
  readonly pending: number;
  readonly active: number;
  readonly succeeded: number;
  readonly failed: number;
  readonly canceled: number;
  /** Count of items in a terminal state. */
  readonly terminal: number;
}

export interface PluginBrowserBulkProgress {
  /**
   * Start a new batch. Fails when `kind` is empty, `pluginIds`
   * is empty, or any pluginId is empty. Returns the created
   * batch or undefined.
   */
  start(
    kind: string,
    pluginIds: readonly string[],
  ): PluginBrowserBulkBatch | undefined;
  /**
   * Update an item's status. Fails when batch is missing,
   * pluginId not in batch, or status is invalid. Idempotent
   * on unchanged status (returns false).
   */
  setItemStatus(
    batchId: number,
    pluginId: string,
    status: PluginBrowserBulkItemStatus,
  ): boolean;
  /** Lookup by batch id. */
  getBatch(batchId: number): PluginBrowserBulkBatch | undefined;
  /** Current item status, or undefined when not found. */
  getItemStatus(
    batchId: number,
    pluginId: string,
  ): PluginBrowserBulkItemStatus | undefined;
  /** True iff every item in the batch is terminal. */
  isComplete(batchId: number): boolean;
  /**
   * Counts of items in each status (+ `terminal` total), or
   * undefined when the batch is missing.
   */
  completion(batchId: number): PluginBrowserBulkCompletion | undefined;
  /**
   * Fraction of terminal items over total, in `[0, 1]`.
   * Returns undefined when the batch is missing.
   */
  percentage(batchId: number): number | undefined;
  /**
   * Remove a batch. Refuses to remove non-complete batches.
   * Returns true when a batch was removed.
   */
  remove(batchId: number): boolean;
  /** Snapshot of every batch in insertion order. */
  batches(): readonly PluginBrowserBulkBatch[];
  /** Batches that still have at least one non-terminal item. */
  activeBatches(): readonly PluginBrowserBulkBatch[];
  /** Wipe everything, including non-complete batches. */
  clear(): void;
}

const VALID_STATUS: readonly PluginBrowserBulkItemStatus[] = [
  "pending",
  "active",
  "succeeded",
  "failed",
  "canceled",
];

function isValidStatus(s: unknown): s is PluginBrowserBulkItemStatus {
  return (
    typeof s === "string" && (VALID_STATUS as readonly string[]).includes(s)
  );
}

function isTerminal(s: PluginBrowserBulkItemStatus): boolean {
  return s === "succeeded" || s === "failed" || s === "canceled";
}

/**
 * Create a caller-owned bulk-progress tracker.
 */
export function createPluginBrowserBulkProgress(): PluginBrowserBulkProgress {
  let nextId = 1;
  const batches: {
    id: number;
    kind: string;
    items: Map<string, PluginBrowserBulkItemStatus>;
    order: string[];
  }[] = [];

  function isValidId(s: string): boolean {
    return typeof s === "string" && s.length > 0;
  }

  function findIndex(batchId: number): number {
    for (let i = 0; i < batches.length; i++) {
      if (batches[i].id === batchId) return i;
    }
    return -1;
  }

  function materialize(b: (typeof batches)[number]): PluginBrowserBulkBatch {
    const items: PluginBrowserBulkItem[] = [];
    for (const pluginId of b.order) {
      const status = b.items.get(pluginId);
      if (status !== undefined) items.push({ pluginId, status });
    }
    return { id: b.id, kind: b.kind, items };
  }

  function batchIsComplete(b: (typeof batches)[number]): boolean {
    for (const s of b.items.values()) {
      if (!isTerminal(s)) return false;
    }
    return true;
  }

  return {
    start(
      kind: string,
      pluginIds: readonly string[],
    ): PluginBrowserBulkBatch | undefined {
      if (!isValidId(kind)) return undefined;
      if (!Array.isArray(pluginIds) || pluginIds.length === 0) return undefined;
      const order: string[] = [];
      const items = new Map<string, PluginBrowserBulkItemStatus>();
      for (const id of pluginIds) {
        if (!isValidId(id)) return undefined;
        if (items.has(id)) continue; // dedup silently
        items.set(id, "pending");
        order.push(id);
      }
      const batch = { id: nextId++, kind, items, order };
      batches.push(batch);
      return materialize(batch);
    },
    setItemStatus(
      batchId: number,
      pluginId: string,
      status: PluginBrowserBulkItemStatus,
    ): boolean {
      if (!isValidId(pluginId)) return false;
      if (!isValidStatus(status)) return false;
      const idx = findIndex(batchId);
      if (idx < 0) return false;
      const b = batches[idx];
      if (!b.items.has(pluginId)) return false;
      const prev = b.items.get(pluginId);
      if (prev === status) return false;
      b.items.set(pluginId, status);
      return true;
    },
    getBatch(batchId: number): PluginBrowserBulkBatch | undefined {
      const idx = findIndex(batchId);
      if (idx < 0) return undefined;
      return materialize(batches[idx]);
    },
    getItemStatus(
      batchId: number,
      pluginId: string,
    ): PluginBrowserBulkItemStatus | undefined {
      if (!isValidId(pluginId)) return undefined;
      const idx = findIndex(batchId);
      if (idx < 0) return undefined;
      return batches[idx].items.get(pluginId);
    },
    isComplete(batchId: number): boolean {
      const idx = findIndex(batchId);
      if (idx < 0) return false;
      return batchIsComplete(batches[idx]);
    },
    completion(batchId: number): PluginBrowserBulkCompletion | undefined {
      const idx = findIndex(batchId);
      if (idx < 0) return undefined;
      const b = batches[idx];
      let pending = 0;
      let active = 0;
      let succeeded = 0;
      let failed = 0;
      let canceled = 0;
      for (const status of b.items.values()) {
        switch (status) {
          case "pending":
            pending++;
            break;
          case "active":
            active++;
            break;
          case "succeeded":
            succeeded++;
            break;
          case "failed":
            failed++;
            break;
          case "canceled":
            canceled++;
            break;
        }
      }
      const terminal = succeeded + failed + canceled;
      return {
        total: b.items.size,
        pending,
        active,
        succeeded,
        failed,
        canceled,
        terminal,
      };
    },
    percentage(batchId: number): number | undefined {
      const c = this.completion(batchId);
      if (!c) return undefined;
      if (c.total === 0) return 0;
      return c.terminal / c.total;
    },
    remove(batchId: number): boolean {
      const idx = findIndex(batchId);
      if (idx < 0) return false;
      if (!batchIsComplete(batches[idx])) return false;
      batches.splice(idx, 1);
      return true;
    },
    batches(): readonly PluginBrowserBulkBatch[] {
      return batches.map(materialize);
    },
    activeBatches(): readonly PluginBrowserBulkBatch[] {
      return batches.filter((b) => !batchIsComplete(b)).map(materialize);
    },
    clear(): void {
      batches.length = 0;
    },
  };
}
