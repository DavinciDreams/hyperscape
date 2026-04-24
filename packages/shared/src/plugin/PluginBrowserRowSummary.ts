/**
 * Per-row summary for the Plugin Browser. Combines the structural
 * health signal (from {@link PluginRegistryHealthDigest} via
 * {@link PluginRowHealthBadge}) with the runtime stability signal
 * (from {@link PluginLifecycleStats} via {@link PluginStabilityBadge})
 * into a single row indicator.
 *
 * The two inputs answer different questions:
 * - Health: "is the plugin currently misconfigured / divergent /
 *   crashing in recent events?"
 * - Stability: "across the lifetime of this plugin, does it usually
 *   succeed or does it usually fail?"
 *
 * The Plugin Browser row wants one badge. This module decides which
 * signal wins and produces a merged reason list so the editor can
 * surface both contributing factors in a tooltip without duplicating
 * the merge logic.
 *
 * Pure transform. Never throws.
 */

import type { PluginRowHealthBadge } from "./PluginBrowserHealthBadges.js";
import type { PluginStabilityBadge } from "./PluginStabilityClassifier.js";

export type PluginRowSummarySeverity = "ok" | "info" | "warning" | "error";

export interface PluginBrowserRowSummary {
  readonly pluginId: string;
  /**
   * Combined severity. Health wins when it's `error`/`warning`,
   * otherwise stability is allowed to escalate. `unknown` stability
   * never escalates above `info`.
   */
  readonly severity: PluginRowSummarySeverity;
  /** Short label for compact row display, e.g. "broken", "warning", "stable". */
  readonly label: string;
  /**
   * Reasons in priority order (health first, then stability).
   * Already deduped; safe to render verbatim.
   */
  readonly reasons: readonly string[];
  readonly health: PluginRowHealthBadge | null;
  readonly stability: PluginStabilityBadge | null;
}

export interface SummarizePluginBrowserRowsInput {
  readonly pluginIds: readonly string[];
  readonly healthBadges: ReadonlyMap<string, PluginRowHealthBadge>;
  readonly stabilityBadges: ReadonlyMap<string, PluginStabilityBadge>;
}

/**
 * Produce one summary per plugin id. Insertion order matches
 * `input.pluginIds`.
 */
export function summarizePluginBrowserRows(
  input: SummarizePluginBrowserRowsInput,
): ReadonlyMap<string, PluginBrowserRowSummary> {
  const out = new Map<string, PluginBrowserRowSummary>();
  for (const id of input.pluginIds) {
    const health = input.healthBadges.get(id) ?? null;
    const stability = input.stabilityBadges.get(id) ?? null;
    out.set(id, mergeRow(id, health, stability));
  }
  return out;
}

function mergeRow(
  pluginId: string,
  health: PluginRowHealthBadge | null,
  stability: PluginStabilityBadge | null,
): PluginBrowserRowSummary {
  const severity = combineSeverity(health, stability);
  const label = labelFor(severity, health, stability);
  const reasons = mergeReasons(health, stability);
  return { pluginId, severity, label, reasons, health, stability };
}

function combineSeverity(
  health: PluginRowHealthBadge | null,
  stability: PluginStabilityBadge | null,
): PluginRowSummarySeverity {
  // Health is the structural authority. If it says error, we're done.
  if (health?.severity === "error") return "error";
  // Stability "broken" escalates to error even if health is clean —
  // a plugin that keeps failing its lifecycle calls is broken
  // regardless of whether the registry knows about it.
  if (stability?.rating === "broken") return "error";
  if (health?.severity === "warning") return "warning";
  if (stability?.rating === "flaky") return "warning";
  if (stability?.rating === "unknown") return "info";
  return "ok";
}

function labelFor(
  severity: PluginRowSummarySeverity,
  health: PluginRowHealthBadge | null,
  stability: PluginStabilityBadge | null,
): string {
  if (stability?.rating === "broken") return "broken";
  if (severity === "error") return "error";
  if (stability?.rating === "flaky") return "flaky";
  if (severity === "warning") return "warning";
  if (stability?.rating === "unknown") return "unrated";
  if (health && stability?.rating === "stable") return "stable";
  if (stability?.rating === "stable") return "stable";
  return "ok";
}

function mergeReasons(
  health: PluginRowHealthBadge | null,
  stability: PluginStabilityBadge | null,
): readonly string[] {
  const reasons: string[] = [];
  if (health) {
    for (const r of health.reasons) {
      if (!reasons.includes(r)) reasons.push(r);
    }
  }
  if (stability && stability.rating !== "stable") {
    if (!reasons.includes(stability.reason)) {
      reasons.push(stability.reason);
    }
  }
  return reasons;
}
