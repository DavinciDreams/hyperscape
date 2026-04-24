/**
 * Pure per-user telemetry opt-in ledger for the Plugin
 * Browser. Tracks a small set of *telemetry categories*
 * (e.g. `crashReports`, `usageMetrics`, `performanceTraces`)
 * with a tri-state per category: `optedIn | optedOut |
 * undecided`. Decisions are timestamped with a
 * caller-supplied `decidedAtMs` so consent prompts can
 * re-ask after a grace period.
 *
 * Semantics:
 *   - `setDecision(category, decision, decidedAtMs)` — sets
 *     a tri-state. `undecided` clears any prior decision
 *     (distinct from optedOut).
 *   - Unknown categories return `undecided` from `get()`
 *     and are not persisted until `setDecision` is called.
 *   - `allDecided()` / `anyOptedIn()` / `listPending()` —
 *     aggregation helpers for the consent UI.
 *
 * Pure state, caller-owned, never throws. Invalid input
 * silently no-op'd.
 */

export type PluginBrowserTelemetryDecision =
  | "optedIn"
  | "optedOut"
  | "undecided";

export interface PluginBrowserTelemetryEntry {
  readonly category: string;
  readonly decision: PluginBrowserTelemetryDecision;
  readonly decidedAtMs: number;
}

export interface PluginBrowserTelemetryOptIn {
  /**
   * Set a decision for a category. `undecided` clears any
   * prior decision (removes the entry entirely). Returns
   * false on empty category, invalid decision, or
   * non-finite decidedAtMs. Idempotent on unchanged
   * decision (returns false).
   */
  setDecision(
    category: string,
    decision: PluginBrowserTelemetryDecision,
    decidedAtMs: number,
  ): boolean;
  /** Current decision for category, or `undecided` if never set. */
  get(category: string): PluginBrowserTelemetryDecision;
  /** Full entry (including timestamp), or undefined. */
  getEntry(category: string): PluginBrowserTelemetryEntry | undefined;
  /** All recorded entries, insertion order. */
  all(): readonly PluginBrowserTelemetryEntry[];
  /**
   * Returns true iff *every* category in `required` has a
   * non-undecided decision. Empty `required` trivially true.
   */
  allDecided(required: readonly string[]): boolean;
  /** Returns true iff any category is currently `optedIn`. */
  anyOptedIn(): boolean;
  /**
   * Categories in `required` that are currently `undecided`
   * (never set or explicitly cleared). Insertion order of
   * `required`. Empty-string entries ignored.
   */
  listPending(required: readonly string[]): readonly string[];
  /** Remove a category decision (same as setting `undecided`). */
  clear(category: string): boolean;
  /** Wipe every recorded decision. */
  clearAll(): void;
}

const VALID_DECISIONS: readonly PluginBrowserTelemetryDecision[] = [
  "optedIn",
  "optedOut",
  "undecided",
];

function isValidDecision(d: unknown): d is PluginBrowserTelemetryDecision {
  return (
    typeof d === "string" && (VALID_DECISIONS as readonly string[]).includes(d)
  );
}

function isValidCategory(s: unknown): s is string {
  return typeof s === "string" && s.length > 0;
}

function isValidTime(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

/**
 * Create a caller-owned telemetry opt-in ledger.
 */
export function createPluginBrowserTelemetryOptIn(): PluginBrowserTelemetryOptIn {
  const entries: PluginBrowserTelemetryEntry[] = [];

  function findIndex(category: string): number {
    for (let i = 0; i < entries.length; i++) {
      if (entries[i].category === category) return i;
    }
    return -1;
  }

  return {
    setDecision(
      category: string,
      decision: PluginBrowserTelemetryDecision,
      decidedAtMs: number,
    ): boolean {
      if (!isValidCategory(category)) return false;
      if (!isValidDecision(decision)) return false;
      if (!isValidTime(decidedAtMs)) return false;
      const idx = findIndex(category);
      if (decision === "undecided") {
        if (idx < 0) return false;
        entries.splice(idx, 1);
        return true;
      }
      if (idx < 0) {
        entries.push({ category, decision, decidedAtMs });
        return true;
      }
      const prev = entries[idx];
      if (prev.decision === decision && prev.decidedAtMs === decidedAtMs) {
        return false;
      }
      entries[idx] = { category, decision, decidedAtMs };
      return true;
    },
    get(category: string): PluginBrowserTelemetryDecision {
      if (!isValidCategory(category)) return "undecided";
      const idx = findIndex(category);
      return idx < 0 ? "undecided" : entries[idx].decision;
    },
    getEntry(category: string): PluginBrowserTelemetryEntry | undefined {
      if (!isValidCategory(category)) return undefined;
      const idx = findIndex(category);
      return idx < 0 ? undefined : entries[idx];
    },
    all(): readonly PluginBrowserTelemetryEntry[] {
      return entries.slice();
    },
    allDecided(required: readonly string[]): boolean {
      if (!Array.isArray(required)) return false;
      for (const c of required) {
        if (!isValidCategory(c)) continue;
        const idx = findIndex(c);
        if (idx < 0) return false;
        if (entries[idx].decision === "undecided") return false;
      }
      return true;
    },
    anyOptedIn(): boolean {
      for (const e of entries) if (e.decision === "optedIn") return true;
      return false;
    },
    listPending(required: readonly string[]): readonly string[] {
      if (!Array.isArray(required)) return [];
      const pending: string[] = [];
      const seen = new Set<string>();
      for (const c of required) {
        if (!isValidCategory(c)) continue;
        if (seen.has(c)) continue;
        seen.add(c);
        const idx = findIndex(c);
        if (idx < 0) {
          pending.push(c);
          continue;
        }
        if (entries[idx].decision === "undecided") pending.push(c);
      }
      return pending;
    },
    clear(category: string): boolean {
      if (!isValidCategory(category)) return false;
      const idx = findIndex(category);
      if (idx < 0) return false;
      entries.splice(idx, 1);
      return true;
    },
    clearAll(): void {
      entries.length = 0;
    },
  };
}
