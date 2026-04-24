/**
 * Coarse stability badge derived from {@link PluginLifecycleStats}.
 *
 * The Plugin Browser shows a numeric `successRate` column when the
 * details pane is open, but the row itself wants a one-glance badge.
 * This module is the canonical place that decides: given a plugin's
 * stats, is it `stable`, `flaky`, or `broken`?
 *
 * Default thresholds match the editor's first-cut heuristics; pass
 * `options` to override for tests or alternative UX surfaces.
 *
 * Pure transform. Never throws.
 */

import type { PluginLifecycleStats } from "./PluginLifecycleStats.js";

export type PluginStabilityRating = "unknown" | "stable" | "flaky" | "broken";

export interface PluginStabilityBadge {
  readonly pluginId: string;
  readonly rating: PluginStabilityRating;
  /** Short human-readable reason, e.g. "3 consecutive failures". */
  readonly reason: string;
}

export interface ClassifyPluginStabilityOptions {
  /**
   * Number of trailing failures that flips a plugin to `broken`.
   * Default: 3.
   */
  readonly brokenAfterTrailingFailures?: number;
  /**
   * If `successRate < flakyBelowSuccessRate` and there is at least
   * one failure, the plugin is `flaky`. Default: 0.8 (80%).
   */
  readonly flakyBelowSuccessRate?: number;
  /**
   * Minimum total events before classification escapes `unknown`.
   * Default: 3.
   */
  readonly minimumEventsForRating?: number;
}

const DEFAULTS = {
  brokenAfterTrailingFailures: 3,
  flakyBelowSuccessRate: 0.8,
  minimumEventsForRating: 3,
} as const;

export function classifyPluginStability(
  stats: PluginLifecycleStats,
  options: ClassifyPluginStabilityOptions = {},
): PluginStabilityBadge {
  const brokenAfter =
    options.brokenAfterTrailingFailures ?? DEFAULTS.brokenAfterTrailingFailures;
  const flakyBelow =
    options.flakyBelowSuccessRate ?? DEFAULTS.flakyBelowSuccessRate;
  const minEvents =
    options.minimumEventsForRating ?? DEFAULTS.minimumEventsForRating;

  if (stats.totalEvents === 0) {
    return rate(stats.pluginId, "unknown", "no recorded events");
  }
  if (stats.consecutiveTrailingFailures >= brokenAfter) {
    return rate(
      stats.pluginId,
      "broken",
      `${stats.consecutiveTrailingFailures} consecutive failures`,
    );
  }
  if (stats.totalEvents < minEvents) {
    return rate(stats.pluginId, "unknown", `only ${stats.totalEvents} events`);
  }
  if (
    stats.successRate !== null &&
    stats.successRate < flakyBelow &&
    stats.failedCount > 0
  ) {
    const pct = Math.round(stats.successRate * 100);
    return rate(stats.pluginId, "flaky", `success rate ${pct}%`);
  }
  return rate(stats.pluginId, "stable", "all-clean");
}

function rate(
  pluginId: string,
  rating: PluginStabilityRating,
  reason: string,
): PluginStabilityBadge {
  return { pluginId, rating, reason };
}
