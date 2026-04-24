/**
 * Groups {@link PluginBrowserToastIntent}s by pluginId. When a
 * single plugin produces multiple intents in the same refresh
 * (e.g. it regressed AND its label changed), we surface one
 * expandable group instead of two separate toasts.
 *
 * Pure transform. Never throws.
 *
 * Input should be pre-sorted by priority (as produced by
 * {@link buildPluginBrowserToastIntents}). The first intent seen
 * per pluginId becomes the group's `primary`; everything else goes
 * into `additional` in input order.
 */

import type { PluginRowSummarySeverity } from "./PluginBrowserRowSummary.js";
import type { PluginBrowserToastIntent } from "./PluginBrowserToastRouter.js";

export interface PluginBrowserToastGroup {
  readonly pluginId: string;
  /** Highest-priority intent for this plugin (first seen in input). */
  readonly primary: PluginBrowserToastIntent;
  /** Other intents for the same plugin, in input order. May be empty. */
  readonly additional: readonly PluginBrowserToastIntent[];
  /** Worst severity across primary + additional. */
  readonly severity: PluginRowSummarySeverity;
}

export function groupPluginBrowserToastIntents(
  intents: readonly PluginBrowserToastIntent[],
): readonly PluginBrowserToastGroup[] {
  // Bucket by pluginId, preserving first-occurrence order.
  const buckets = new Map<string, PluginBrowserToastIntent[]>();
  for (const intent of intents) {
    const existing = buckets.get(intent.pluginId);
    if (existing) {
      existing.push(intent);
    } else {
      buckets.set(intent.pluginId, [intent]);
    }
  }

  const groups: PluginBrowserToastGroup[] = [];
  for (const [pluginId, members] of buckets) {
    const [primary, ...additional] = members;
    let worst = primary.severity;
    for (const m of additional) {
      if (SEVERITY_RANK[m.severity] > SEVERITY_RANK[worst]) {
        worst = m.severity;
      }
    }
    groups.push({ pluginId, primary, additional, severity: worst });
  }
  return groups;
}

const SEVERITY_RANK: Record<PluginRowSummarySeverity, number> = {
  ok: 0,
  info: 1,
  warning: 2,
  error: 3,
};
