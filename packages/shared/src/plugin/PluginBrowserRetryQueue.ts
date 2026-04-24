/**
 * Pure retry queue for failed Plugin Browser operations.
 *
 * Complements {@link PluginBrowserLoadingTracker} (in-flight) and
 * {@link PluginBrowserOperationResults} (terminal outcomes): when
 * an operation fails and the caller elects to retry, it queues
 * the `(pluginId, operation)` pair here with an attempt count and
 * an absolute `nextAttemptAtMs` timestamp. The caller's scheduler
 * reads `readyEntries(nowMs)` each tick to decide which retries
 * to fire.
 *
 * This module holds **no timers** and has **no delay policy** —
 * the caller computes `nextAttemptAtMs` (typically via exponential
 * backoff with jitter) and passes absolute timestamps in. The
 * queue just stores (pluginId, operation, attempts, nextAttemptAt)
 * tuples and reports which are ready.
 *
 * Semantics:
 *  - `scheduleFirst` creates a new entry with `attempts = 1`.
 *    Returns false when `(pluginId, operation)` is already
 *    queued. Use `scheduleNext` for subsequent failures.
 *  - `scheduleNext` bumps `attempts` and updates
 *    `nextAttemptAtMs` on an existing entry. Returns false
 *    when no entry exists.
 *  - `isReady` is true when the entry exists AND `nowMs >=
 *    nextAttemptAtMs`.
 *  - `dequeue` is called on success/abandon; idempotent.
 *
 * Pure state. Caller-owned instance. Never throws. Invalid
 * input silently no-op'd.
 */

export interface PluginBrowserRetryEntry {
  readonly pluginId: string;
  readonly operation: string;
  readonly attempts: number;
  readonly nextAttemptAtMs: number;
}

export interface PluginBrowserRetryQueue {
  has(pluginId: string, operation: string): boolean;
  get(pluginId: string, operation: string): PluginBrowserRetryEntry | undefined;
  /** 0 when not queued. */
  attempts(pluginId: string, operation: string): number;
  /** True iff queued AND `nowMs >= nextAttemptAtMs`. */
  isReady(pluginId: string, operation: string, nowMs: number): boolean;
  /**
   * Queue a first-failure retry. Returns false when the entry
   * already exists (caller should call `scheduleNext`
   * instead) or when input is invalid.
   */
  scheduleFirst(
    pluginId: string,
    operation: string,
    nextAttemptAtMs: number,
  ): boolean;
  /**
   * Bump attempt count + update nextAttemptAtMs on an existing
   * entry. Returns false when the entry doesn't exist or input
   * is invalid.
   */
  scheduleNext(
    pluginId: string,
    operation: string,
    nextAttemptAtMs: number,
  ): boolean;
  /**
   * Drop a single entry (e.g. after retry succeeded or user
   * cancelled). Returns true when something was removed.
   */
  dequeue(pluginId: string, operation: string): boolean;
  /** Drop every entry for a plugin. */
  dequeueAll(pluginId: string): boolean;
  /** Drop every entry across every plugin. */
  clear(): void;
  /** Total queued entries. */
  size(): number;
  /** Snapshot in insertion order. */
  entries(): readonly PluginBrowserRetryEntry[];
  /**
   * Subset of {@link entries} that is ready to fire at `nowMs`,
   * ordered by `nextAttemptAtMs` ascending (earliest first),
   * ties broken by insertion order.
   */
  readyEntries(nowMs: number): readonly PluginBrowserRetryEntry[];
}

/**
 * Create a caller-owned retry queue.
 */
export function createPluginBrowserRetryQueue(): PluginBrowserRetryQueue {
  // Composite key so flat iteration stays cheap.
  const byKey = new Map<string, PluginBrowserRetryEntry>();

  function isValidId(s: string): boolean {
    return typeof s === "string" && s.length > 0;
  }

  function isValidMs(n: number): boolean {
    return typeof n === "number" && Number.isFinite(n);
  }

  function keyFor(pluginId: string, operation: string): string {
    return pluginId + "\u0000" + operation;
  }

  return {
    has(pluginId: string, operation: string): boolean {
      if (!isValidId(pluginId) || !isValidId(operation)) return false;
      return byKey.has(keyFor(pluginId, operation));
    },
    get(
      pluginId: string,
      operation: string,
    ): PluginBrowserRetryEntry | undefined {
      if (!isValidId(pluginId) || !isValidId(operation)) {
        return undefined;
      }
      return byKey.get(keyFor(pluginId, operation));
    },
    attempts(pluginId: string, operation: string): number {
      if (!isValidId(pluginId) || !isValidId(operation)) return 0;
      return byKey.get(keyFor(pluginId, operation))?.attempts ?? 0;
    },
    isReady(pluginId: string, operation: string, nowMs: number): boolean {
      if (!isValidMs(nowMs)) return false;
      if (!isValidId(pluginId) || !isValidId(operation)) return false;
      const e = byKey.get(keyFor(pluginId, operation));
      if (!e) return false;
      return nowMs >= e.nextAttemptAtMs;
    },
    scheduleFirst(
      pluginId: string,
      operation: string,
      nextAttemptAtMs: number,
    ): boolean {
      if (
        !isValidId(pluginId) ||
        !isValidId(operation) ||
        !isValidMs(nextAttemptAtMs)
      ) {
        return false;
      }
      const k = keyFor(pluginId, operation);
      if (byKey.has(k)) return false;
      byKey.set(k, {
        pluginId,
        operation,
        attempts: 1,
        nextAttemptAtMs,
      });
      return true;
    },
    scheduleNext(
      pluginId: string,
      operation: string,
      nextAttemptAtMs: number,
    ): boolean {
      if (
        !isValidId(pluginId) ||
        !isValidId(operation) ||
        !isValidMs(nextAttemptAtMs)
      ) {
        return false;
      }
      const k = keyFor(pluginId, operation);
      const prev = byKey.get(k);
      if (!prev) return false;
      byKey.set(k, {
        pluginId,
        operation,
        attempts: prev.attempts + 1,
        nextAttemptAtMs,
      });
      return true;
    },
    dequeue(pluginId: string, operation: string): boolean {
      if (!isValidId(pluginId) || !isValidId(operation)) return false;
      return byKey.delete(keyFor(pluginId, operation));
    },
    dequeueAll(pluginId: string): boolean {
      if (!isValidId(pluginId)) return false;
      let removed = false;
      for (const [k, e] of byKey) {
        if (e.pluginId === pluginId) {
          byKey.delete(k);
          removed = true;
        }
      }
      return removed;
    },
    clear(): void {
      byKey.clear();
    },
    size(): number {
      return byKey.size;
    },
    entries(): readonly PluginBrowserRetryEntry[] {
      return [...byKey.values()];
    },
    readyEntries(nowMs: number): readonly PluginBrowserRetryEntry[] {
      if (!isValidMs(nowMs)) return [];
      const ready: PluginBrowserRetryEntry[] = [];
      // Capture insertion index so stable sort ties are preserved
      // across the nextAttemptAtMs sort below.
      const indexed: Array<{
        entry: PluginBrowserRetryEntry;
        index: number;
      }> = [];
      let i = 0;
      for (const e of byKey.values()) {
        if (nowMs >= e.nextAttemptAtMs) {
          indexed.push({ entry: e, index: i });
        }
        i++;
      }
      indexed.sort((a, b) => {
        if (a.entry.nextAttemptAtMs !== b.entry.nextAttemptAtMs) {
          return a.entry.nextAttemptAtMs - b.entry.nextAttemptAtMs;
        }
        return a.index - b.index;
      });
      for (const { entry } of indexed) ready.push(entry);
      return ready;
    },
  };
}
