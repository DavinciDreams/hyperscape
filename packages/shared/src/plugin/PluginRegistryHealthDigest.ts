/**
 * Editor "Health" tab one-shot digest. Combines the three
 * already-shipped health signals into a single, severity-classified
 * summary the editor can render at the top of the Plugin
 * Browser:
 *
 *   1. `checkPluginHostHealth(host)` → static catalog/factory issues
 *   2. `diffContributionCounts(advertised, live)` per plugin → runtime
 *      divergence between what the manifest says vs what was actually
 *      registered (includes only divergent plugins; matching plugins
 *      are filtered out)
 *   3. `PluginLifecycleJournal.all()` filtered to recent failed
 *      lifecycle events → "did anything blow up since N ms ago"
 *
 * Severity classification:
 *   - `error`   if any host issue OR any recent failure
 *   - `warning` if any contribution divergence (and no errors)
 *   - `ok`      otherwise
 *
 * Pure transform. Never throws.
 */

import type { PluginContributionDivergence } from "./PluginContributionDivergence.js";
import type {
  PluginHealthIssue,
  PluginHostHealthReport,
} from "./PluginHostHealthCheck.js";
import type { PluginLifecycleEvent } from "./PluginLifecycleJournal.js";

export type PluginRegistryHealthSeverity = "ok" | "warning" | "error";

export interface PluginRegistryHealthCounts {
  readonly hostIssueCount: number;
  /** Number of plugins with at least one divergent contribution kind. */
  readonly divergencePluginCount: number;
  /** Number of failed lifecycle events within the recent window. */
  readonly recentFailureCount: number;
}

export interface PluginRegistryHealthDigest {
  readonly severity: PluginRegistryHealthSeverity;
  readonly counts: PluginRegistryHealthCounts;
  /**
   * Concise summary, e.g.
   * `"2 host issues, 1 divergent plugin, 3 recent failures"`
   * or `"healthy"` when everything is clean.
   */
  readonly headline: string;
  readonly hostIssues: readonly PluginHealthIssue[];
  /**
   * Map of pluginId → its divergent contribution counts. Only plugins
   * with at least one nonzero `delta` are included.
   */
  readonly divergences: ReadonlyMap<
    string,
    readonly PluginContributionDivergence[]
  >;
  /** Recent failed lifecycle events, oldest-first. */
  readonly recentFailures: readonly PluginLifecycleEvent[];
}

export interface BuildHealthDigestInput {
  readonly hostHealth: PluginHostHealthReport;
  /**
   * Per-plugin contribution divergences. Pass already-computed
   * results from `diffContributionCounts(advertised, live)` keyed by
   * pluginId. The digest filters out plugins whose entries are all
   * zero-delta so callers can pass everything without pre-filtering.
   */
  readonly contributionDivergencesByPlugin?: ReadonlyMap<
    string,
    readonly PluginContributionDivergence[]
  >;
  /**
   * Caller's full lifecycle journal snapshot (e.g.
   * `journal.all()`). The digest filters this down to
   * `outcome === "failed"` events whose `at >= now -
   * recentFailureWindowMs`.
   */
  readonly events: readonly PluginLifecycleEvent[];
  /**
   * Wallclock used as the upper bound of the "recent" window.
   * Defaults to `Date.now()`. Inject for deterministic tests.
   */
  readonly now?: number;
  /**
   * How far back the "recent failures" window extends, in
   * milliseconds. Defaults to 24h (86_400_000).
   */
  readonly recentFailureWindowMs?: number;
}

const DEFAULT_RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Build the digest. Pure — no I/O, no clock reads beyond the
 * caller-supplied `now`.
 */
export function buildPluginRegistryHealthDigest(
  input: BuildHealthDigestInput,
): PluginRegistryHealthDigest {
  const now = input.now ?? Date.now();
  const windowMs = input.recentFailureWindowMs ?? DEFAULT_RECENT_WINDOW_MS;
  const earliest = now - windowMs;

  const recentFailures = input.events
    .filter((e) => e.outcome === "failed" && e.at >= earliest)
    .sort((a, b) => a.at - b.at);

  const divergences = new Map<
    string,
    readonly PluginContributionDivergence[]
  >();
  if (input.contributionDivergencesByPlugin) {
    for (const [pluginId, list] of input.contributionDivergencesByPlugin) {
      const filtered = list.filter((d) => d.delta !== 0);
      if (filtered.length > 0) divergences.set(pluginId, filtered);
    }
  }

  const counts: PluginRegistryHealthCounts = {
    hostIssueCount: input.hostHealth.issues.length,
    divergencePluginCount: divergences.size,
    recentFailureCount: recentFailures.length,
  };

  const severity = classifySeverity(counts);
  const headline = buildHeadline(counts);

  return {
    severity,
    counts,
    headline,
    hostIssues: input.hostHealth.issues,
    divergences,
    recentFailures,
  };
}

function classifySeverity(
  counts: PluginRegistryHealthCounts,
): PluginRegistryHealthSeverity {
  if (counts.hostIssueCount > 0 || counts.recentFailureCount > 0)
    return "error";
  if (counts.divergencePluginCount > 0) return "warning";
  return "ok";
}

function buildHeadline(counts: PluginRegistryHealthCounts): string {
  const parts: string[] = [];
  if (counts.hostIssueCount > 0) {
    parts.push(
      `${counts.hostIssueCount} host issue${counts.hostIssueCount === 1 ? "" : "s"}`,
    );
  }
  if (counts.divergencePluginCount > 0) {
    parts.push(
      `${counts.divergencePluginCount} divergent plugin${counts.divergencePluginCount === 1 ? "" : "s"}`,
    );
  }
  if (counts.recentFailureCount > 0) {
    parts.push(
      `${counts.recentFailureCount} recent failure${counts.recentFailureCount === 1 ? "" : "s"}`,
    );
  }
  return parts.length === 0 ? "healthy" : parts.join(", ");
}
