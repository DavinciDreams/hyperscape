/**
 * Pure-logic assembler for the Plugin Details panel.
 *
 * The Plugin Browser's left pane shows a flat list (via
 * `buildPluginBrowserSnapshot`); the right pane shows a single
 * plugin's full detail view. That view stitches together:
 *   - the plugin's `PluginBrowserRow` (manifest + lifecycle)
 *   - live registry counts for its `pluginId`
 *   - advertised-vs-live divergence list
 *   - recent lifecycle events (from the journal)
 *   - disable-impact entries (transitive dependents currently
 *     enabled/loaded)
 *
 * This helper does that composition without any DOM/IO/World
 * references so it can be tested as a flat function on plain data.
 * The editor hands the returned snapshot to its React details pane
 * and re-runs it whenever the underlying sources change.
 */

import type { DisableImpactEntry } from "./PluginDependencyGraph.js";
import type { LivePluginContributionCounts } from "./PluginContributionCounts.js";
import type { PluginBrowserRow } from "./PluginBrowserSnapshot.js";
import type {
  AdvertisedPluginContributionCounts,
  PluginContributionDivergence,
} from "./PluginContributionDivergence.js";
import { diffContributionCounts } from "./PluginContributionDivergence.js";
import type { PluginLifecycleEvent } from "./PluginLifecycleJournal.js";

export interface PluginDetailsSnapshotInput {
  readonly row: PluginBrowserRow;
  readonly liveContributions: LivePluginContributionCounts;
  readonly advertisedContributions: AdvertisedPluginContributionCounts;
  readonly recentEvents: readonly PluginLifecycleEvent[];
  readonly disableImpact: readonly DisableImpactEntry[];
}

export interface PluginDetailsSnapshot {
  readonly row: PluginBrowserRow;
  readonly liveContributions: LivePluginContributionCounts;
  readonly advertisedContributions: AdvertisedPluginContributionCounts;
  readonly divergence: readonly PluginContributionDivergence[];
  readonly hasDivergence: boolean;
  readonly recentEvents: readonly PluginLifecycleEvent[];
  readonly disableImpact: readonly DisableImpactEntry[];
  readonly disableImpactCount: number;
  readonly errorMessage: string | null;
  readonly healthIssueCount: number;
}

/**
 * Assemble a flat render-ready details snapshot. `recentEvents` is
 * passed through unmodified so the caller can decide how many to
 * keep (typically last 50 from the journal for this `pluginId`).
 */
export function buildPluginDetailsSnapshot(
  input: PluginDetailsSnapshotInput,
): PluginDetailsSnapshot {
  const divergence = diffContributionCounts(
    input.advertisedContributions,
    input.liveContributions,
  );
  return {
    row: input.row,
    liveContributions: input.liveContributions,
    advertisedContributions: input.advertisedContributions,
    divergence,
    hasDivergence: divergence.length > 0,
    recentEvents: input.recentEvents,
    disableImpact: input.disableImpact,
    disableImpactCount: input.disableImpact.length,
    errorMessage: input.row.errorMessage,
    healthIssueCount: input.row.healthIssues.length,
  };
}
