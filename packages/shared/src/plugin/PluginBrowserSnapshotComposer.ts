/**
 * One-shot composer that wires the entire Plugin Browser projection
 * chain so the editor can build the full table from a single call.
 *
 * Inputs: list of plugin ids, health digest, and the lifecycle event
 * stream.
 *
 * Outputs:
 *   - per-row health badges
 *   - per-row stability badges
 *   - per-row merged summaries
 *   - aggregate header summary
 *   - sorted/filtered row arrays the editor can render directly
 *
 * Pure transform. Never throws.
 */

import {
  type PluginBrowserHeaderSummary,
  summarizePluginBrowserHeader,
} from "./PluginBrowserHeaderSummary.js";
import {
  type PluginRowHealthBadge,
  buildPluginBrowserHealthBadges,
} from "./PluginBrowserHealthBadges.js";
import {
  type PluginBrowserRowSortOrder,
  sortPluginBrowserRowSummaries,
} from "./PluginBrowserRowSort.js";
import {
  type PluginBrowserRowSummary,
  summarizePluginBrowserRows,
} from "./PluginBrowserRowSummary.js";
import {
  type PluginBrowserSeverityFilter,
  filterPluginBrowserRowsBySeverity,
} from "./PluginBrowserSeverityFilter.js";
import type { PluginLifecycleEvent } from "./PluginLifecycleJournal.js";
import { buildPluginLifecycleStats } from "./PluginLifecycleStats.js";
import type { PluginRegistryHealthDigest } from "./PluginRegistryHealthDigest.js";
import {
  type ClassifyPluginStabilityOptions,
  type PluginStabilityBadge,
  classifyPluginStability,
} from "./PluginStabilityClassifier.js";

export interface ComposePluginBrowserSnapshotInput {
  readonly pluginIds: readonly string[];
  readonly healthDigest: PluginRegistryHealthDigest;
  readonly lifecycleEvents: readonly PluginLifecycleEvent[];
}

export interface ComposePluginBrowserSnapshotOptions {
  readonly stability?: ClassifyPluginStabilityOptions;
  readonly filter?: PluginBrowserSeverityFilter;
  readonly sort?: PluginBrowserRowSortOrder;
}

export interface PluginBrowserSnapshotComposed {
  readonly healthBadges: ReadonlyMap<string, PluginRowHealthBadge>;
  readonly stabilityBadges: ReadonlyMap<string, PluginStabilityBadge>;
  readonly rowSummaries: ReadonlyMap<string, PluginBrowserRowSummary>;
  /** Same data as {@link rowSummaries}, run through filter then sort. */
  readonly visibleRows: readonly PluginBrowserRowSummary[];
  readonly header: PluginBrowserHeaderSummary;
}

export function composePluginBrowserSnapshot(
  input: ComposePluginBrowserSnapshotInput,
  options: ComposePluginBrowserSnapshotOptions = {},
): PluginBrowserSnapshotComposed {
  const healthBadges = buildPluginBrowserHealthBadges(
    input.healthDigest,
    input.pluginIds,
  );
  const stabilityBadges = buildStabilityBadges(
    input.pluginIds,
    input.lifecycleEvents,
    options.stability,
  );
  const rowSummaries = summarizePluginBrowserRows({
    pluginIds: input.pluginIds,
    healthBadges,
    stabilityBadges,
  });
  const filtered = options.filter
    ? filterPluginBrowserRowsBySeverity(rowSummaries, options.filter)
    : rowSummaries;
  const filteredArr = Array.from(filtered.values());
  const visibleRows = options.sort
    ? sortPluginBrowserRowSummaries(filteredArr, options.sort)
    : filteredArr;
  const header = summarizePluginBrowserHeader(rowSummaries);
  return {
    healthBadges,
    stabilityBadges,
    rowSummaries,
    visibleRows,
    header,
  };
}

function buildStabilityBadges(
  pluginIds: readonly string[],
  events: readonly PluginLifecycleEvent[],
  options: ClassifyPluginStabilityOptions | undefined,
): ReadonlyMap<string, PluginStabilityBadge> {
  const out = new Map<string, PluginStabilityBadge>();
  for (const id of pluginIds) {
    const stats = buildPluginLifecycleStats(id, events);
    out.set(id, classifyPluginStability(stats, options));
  }
  return out;
}
