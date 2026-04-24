/**
 * Pure per-plugin / per-operation outcome ledger for the Plugin
 * Browser. Companion to `PluginBrowserLoadingTracker` — where the
 * tracker says "this op is currently in flight", this ledger
 * remembers the last terminal outcome so rows can render a
 * lingering "installed just now" or "install failed: timeout"
 * badge after the spinner clears.
 *
 * Shape: for each plugin, the ledger keeps a keyed record of
 * operation → outcome (success or failure + timestamp + optional
 * failure reason). Overwriting an entry replaces it; the
 * previous outcome is discarded.
 *
 * Operation kinds are caller-supplied so plugin authors can
 * extend the set (install / update / enable / disable / reload /
 * uninstall / custom).
 *
 * Pure state. Caller-owned instance (not a singleton). Never
 * throws. Invalid input is a silent no-op.
 */

export type PluginBrowserOperationOutcome =
  | { readonly kind: "success"; readonly atMs: number }
  | {
      readonly kind: "failure";
      readonly atMs: number;
      readonly reason: string;
    };

export interface PluginBrowserOperationResultEntry {
  readonly pluginId: string;
  readonly operation: string;
  readonly outcome: PluginBrowserOperationOutcome;
}

export interface PluginBrowserOperationResults {
  /** True when `(pluginId, operation)` has a recorded outcome. */
  has(pluginId: string, operation: string): boolean;
  /** Recorded outcome or `undefined`. */
  get(
    pluginId: string,
    operation: string,
  ): PluginBrowserOperationOutcome | undefined;
  /**
   * Most-recent outcome across every recorded operation on
   * `pluginId`, or `undefined` when none. Ties broken by insertion
   * order (most-recently recorded wins).
   */
  latestFor(pluginId: string): PluginBrowserOperationOutcome | undefined;
  /** All operations with recorded outcomes for `pluginId`. */
  operationsFor(pluginId: string): readonly string[];
  /**
   * Record a success outcome. Returns true when the entry was
   * created or replaced (always true on valid input).
   */
  recordSuccess(pluginId: string, operation: string, atMs: number): boolean;
  /**
   * Record a failure outcome with a caller-supplied reason
   * string. Empty `reason` is tolerated (stored as empty).
   */
  recordFailure(
    pluginId: string,
    operation: string,
    reason: string,
    atMs: number,
  ): boolean;
  /**
   * Drop a single entry. Returns true when something was
   * removed.
   */
  forget(pluginId: string, operation: string): boolean;
  /**
   * Drop every entry for a plugin. Returns true when the
   * plugin had at least one entry.
   */
  forgetAll(pluginId: string): boolean;
  /** Drop every entry across all plugins. */
  clear(): void;
  /** Total number of recorded entries (sum across plugins). */
  size(): number;
  /** Snapshot in insertion order. */
  entries(): readonly PluginBrowserOperationResultEntry[];
}

/**
 * Create a caller-owned operation-results ledger.
 */
export function createPluginBrowserOperationResults(): PluginBrowserOperationResults {
  const byPlugin = new Map<
    string,
    Map<string, PluginBrowserOperationOutcome>
  >();

  function isValidId(s: string): boolean {
    return typeof s === "string" && s.length > 0;
  }

  function isValidNow(n: number): boolean {
    return typeof n === "number" && Number.isFinite(n);
  }

  function record(
    pluginId: string,
    operation: string,
    outcome: PluginBrowserOperationOutcome,
  ): boolean {
    let m = byPlugin.get(pluginId);
    if (!m) {
      m = new Map();
      byPlugin.set(pluginId, m);
    }
    // Re-insert key at the tail so insertion order reflects
    // most-recently-recorded for ties.
    if (m.has(operation)) m.delete(operation);
    m.set(operation, outcome);
    return true;
  }

  return {
    has(pluginId: string, operation: string): boolean {
      if (!isValidId(pluginId) || !isValidId(operation)) return false;
      const m = byPlugin.get(pluginId);
      return m !== undefined && m.has(operation);
    },
    get(
      pluginId: string,
      operation: string,
    ): PluginBrowserOperationOutcome | undefined {
      if (!isValidId(pluginId) || !isValidId(operation)) {
        return undefined;
      }
      return byPlugin.get(pluginId)?.get(operation);
    },
    latestFor(pluginId: string): PluginBrowserOperationOutcome | undefined {
      if (!isValidId(pluginId)) return undefined;
      const m = byPlugin.get(pluginId);
      if (!m || m.size === 0) return undefined;
      let best: PluginBrowserOperationOutcome | undefined;
      for (const outcome of m.values()) {
        if (!best || outcome.atMs >= best.atMs) best = outcome;
      }
      return best;
    },
    operationsFor(pluginId: string): readonly string[] {
      if (!isValidId(pluginId)) return [];
      const m = byPlugin.get(pluginId);
      return m ? [...m.keys()] : [];
    },
    recordSuccess(pluginId: string, operation: string, atMs: number): boolean {
      if (!isValidId(pluginId) || !isValidId(operation) || !isValidNow(atMs)) {
        return false;
      }
      return record(pluginId, operation, { kind: "success", atMs });
    },
    recordFailure(
      pluginId: string,
      operation: string,
      reason: string,
      atMs: number,
    ): boolean {
      if (
        !isValidId(pluginId) ||
        !isValidId(operation) ||
        !isValidNow(atMs) ||
        typeof reason !== "string"
      ) {
        return false;
      }
      return record(pluginId, operation, {
        kind: "failure",
        atMs,
        reason,
      });
    },
    forget(pluginId: string, operation: string): boolean {
      if (!isValidId(pluginId) || !isValidId(operation)) return false;
      const m = byPlugin.get(pluginId);
      if (!m) return false;
      const changed = m.delete(operation);
      if (changed && m.size === 0) byPlugin.delete(pluginId);
      return changed;
    },
    forgetAll(pluginId: string): boolean {
      if (!isValidId(pluginId)) return false;
      return byPlugin.delete(pluginId);
    },
    clear(): void {
      byPlugin.clear();
    },
    size(): number {
      let total = 0;
      for (const m of byPlugin.values()) total += m.size;
      return total;
    },
    entries(): readonly PluginBrowserOperationResultEntry[] {
      const out: PluginBrowserOperationResultEntry[] = [];
      for (const [pluginId, m] of byPlugin) {
        for (const [operation, outcome] of m) {
          out.push({ pluginId, operation, outcome });
        }
      }
      return out;
    },
  };
}
