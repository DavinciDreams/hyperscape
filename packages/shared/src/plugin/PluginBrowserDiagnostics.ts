/**
 * Pure per-plugin diagnostic log for the Plugin Browser.
 * Records transient warnings emitted during startup,
 * load, update, or runtime (e.g. missing permission,
 * incompatible version, deprecated API call) so the UI
 * can render an "Issues" tab on the plugin detail panel
 * and a global "problems" badge.
 *
 * Each entry:
 *   - monotonic positive `id`
 *   - `pluginId`
 *   - `severity`: `"info" | "warning" | "error"`
 *   - `code` — opaque machine tag (e.g. `MISSING_PERM`)
 *   - `message` — human-readable one-liner
 *   - `timestampMs` — caller-supplied for purity
 *
 * Bounded per-plugin via FIFO eviction (`capacityPerPlugin`,
 * default 50). Plugin-wide overflow evicts oldest entry for
 * *that* plugin only. Global ordering preserved.
 *
 * Pure state, caller-owned, never throws. Invalid input
 * silently no-op'd.
 */

export type PluginBrowserDiagnosticSeverity = "info" | "warning" | "error";

export interface PluginBrowserDiagnosticEntry {
  readonly id: number;
  readonly pluginId: string;
  readonly severity: PluginBrowserDiagnosticSeverity;
  readonly code: string;
  readonly message: string;
  readonly timestampMs: number;
}

export interface PluginBrowserDiagnostics {
  /**
   * Append a diagnostic. Rejects empty pluginId/code/message,
   * unknown severity, or non-finite timestamp. Returns the
   * created entry or undefined. When the plugin already has
   * `capacityPerPlugin` entries, the oldest entry for *that*
   * plugin is evicted first.
   */
  add(
    pluginId: string,
    severity: PluginBrowserDiagnosticSeverity,
    code: string,
    message: string,
    timestampMs: number,
  ): PluginBrowserDiagnosticEntry | undefined;
  /** Snapshot of every entry in insertion order. */
  all(): readonly PluginBrowserDiagnosticEntry[];
  /** Entries for one plugin, insertion order. */
  byPlugin(pluginId: string): readonly PluginBrowserDiagnosticEntry[];
  /** Entries filtered by severity, insertion order. */
  bySeverity(
    severity: PluginBrowserDiagnosticSeverity,
  ): readonly PluginBrowserDiagnosticEntry[];
  /** Dismiss one entry by id. */
  dismiss(entryId: number): boolean;
  /** Dismiss every entry for a plugin; returns count removed. */
  dismissPlugin(pluginId: string): number;
  /** Total entries across all plugins. */
  count(): number;
  /** Entries matching a given severity. */
  countBySeverity(severity: PluginBrowserDiagnosticSeverity): number;
  /** True iff at least one `error`-severity entry exists. */
  hasErrors(): boolean;
  /** Wipe everything. */
  reset(): void;
}

const VALID_SEVERITY: readonly PluginBrowserDiagnosticSeverity[] = [
  "info",
  "warning",
  "error",
];

function isValidSeverity(s: unknown): s is PluginBrowserDiagnosticSeverity {
  return (
    typeof s === "string" && (VALID_SEVERITY as readonly string[]).includes(s)
  );
}

const DEFAULT_CAPACITY_PER_PLUGIN = 50;

/**
 * Create a caller-owned diagnostics ledger.
 */
export function createPluginBrowserDiagnostics(
  capacityPerPlugin: number = DEFAULT_CAPACITY_PER_PLUGIN,
): PluginBrowserDiagnostics {
  const effectiveCapacity =
    Number.isFinite(capacityPerPlugin) && capacityPerPlugin > 0
      ? Math.floor(capacityPerPlugin)
      : DEFAULT_CAPACITY_PER_PLUGIN;

  const entries: PluginBrowserDiagnosticEntry[] = [];
  let nextId = 1;

  function isValidId(s: string): boolean {
    return typeof s === "string" && s.length > 0;
  }

  function countForPlugin(pluginId: string): number {
    let n = 0;
    for (const e of entries) if (e.pluginId === pluginId) n++;
    return n;
  }

  function evictOldestForPlugin(pluginId: string): void {
    for (let i = 0; i < entries.length; i++) {
      if (entries[i].pluginId === pluginId) {
        entries.splice(i, 1);
        return;
      }
    }
  }

  return {
    add(
      pluginId: string,
      severity: PluginBrowserDiagnosticSeverity,
      code: string,
      message: string,
      timestampMs: number,
    ): PluginBrowserDiagnosticEntry | undefined {
      if (!isValidId(pluginId)) return undefined;
      if (!isValidSeverity(severity)) return undefined;
      if (!isValidId(code)) return undefined;
      if (!isValidId(message)) return undefined;
      if (typeof timestampMs !== "number" || !Number.isFinite(timestampMs)) {
        return undefined;
      }
      if (countForPlugin(pluginId) >= effectiveCapacity) {
        evictOldestForPlugin(pluginId);
      }
      const entry: PluginBrowserDiagnosticEntry = {
        id: nextId++,
        pluginId,
        severity,
        code,
        message,
        timestampMs,
      };
      entries.push(entry);
      return entry;
    },
    all(): readonly PluginBrowserDiagnosticEntry[] {
      return entries.slice();
    },
    byPlugin(pluginId: string): readonly PluginBrowserDiagnosticEntry[] {
      if (!isValidId(pluginId)) return [];
      return entries.filter((e) => e.pluginId === pluginId);
    },
    bySeverity(
      severity: PluginBrowserDiagnosticSeverity,
    ): readonly PluginBrowserDiagnosticEntry[] {
      if (!isValidSeverity(severity)) return [];
      return entries.filter((e) => e.severity === severity);
    },
    dismiss(entryId: number): boolean {
      if (typeof entryId !== "number" || !Number.isFinite(entryId)) {
        return false;
      }
      for (let i = 0; i < entries.length; i++) {
        if (entries[i].id === entryId) {
          entries.splice(i, 1);
          return true;
        }
      }
      return false;
    },
    dismissPlugin(pluginId: string): number {
      if (!isValidId(pluginId)) return 0;
      let removed = 0;
      for (let i = entries.length - 1; i >= 0; i--) {
        if (entries[i].pluginId === pluginId) {
          entries.splice(i, 1);
          removed++;
        }
      }
      return removed;
    },
    count(): number {
      return entries.length;
    },
    countBySeverity(severity: PluginBrowserDiagnosticSeverity): number {
      if (!isValidSeverity(severity)) return 0;
      let n = 0;
      for (const e of entries) if (e.severity === severity) n++;
      return n;
    },
    hasErrors(): boolean {
      for (const e of entries) if (e.severity === "error") return true;
      return false;
    },
    reset(): void {
      entries.length = 0;
    },
  };
}
