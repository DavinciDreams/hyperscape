/**
 * Render-ready projection of {@link PluginBrowserChangelogState}
 * into a timeline of refresh groups, each carrying its own ordered
 * intent rows.
 *
 * The changelog stores a flat entry list sharing `timestamp`
 * across a single refresh. The "Recent Changes" pane wants a
 * two-level structure:
 *
 *   Refresh group (shared timestamp)
 *     └─ Row per intent (stable order)
 *
 * This module is the pure transform from one to the other, reusing
 * {@link PluginBrowserToastDisplay} for per-row phrasing so
 * timeline rows match toast titles verbatim.
 *
 * Pure transform. Never throws.
 */

import type { PluginBrowserChangelogEntry } from "./PluginBrowserChangelog.js";
import type { PluginRowSummarySeverity } from "./PluginBrowserRowSummary.js";
import type { PluginBrowserToastDisplay } from "./PluginBrowserToastDisplay.js";
import { formatPluginBrowserToastGroup } from "./PluginBrowserToastDisplay.js";
import type { PluginBrowserToastIntent } from "./PluginBrowserToastRouter.js";

function singletonDisplay(
  intent: PluginBrowserToastIntent,
): PluginBrowserToastDisplay {
  return formatPluginBrowserToastGroup({
    pluginId: intent.pluginId,
    primary: intent,
    additional: [],
    severity: intent.severity,
  });
}

export interface PluginBrowserChangelogViewRow {
  /** Stable id `${timestamp}:${indexWithinRefresh}` echoed from the entry. */
  readonly id: string;
  readonly pluginId: string;
  readonly display: PluginBrowserToastDisplay;
}

export interface PluginBrowserChangelogViewGroup {
  /** Shared refresh timestamp. */
  readonly timestamp: number;
  /** Worst severity across rows in this group. */
  readonly severity: PluginRowSummarySeverity;
  readonly rows: readonly PluginBrowserChangelogViewRow[];
}

export interface PluginBrowserChangelogView {
  readonly groups: readonly PluginBrowserChangelogViewGroup[];
}

const SEVERITY_RANK: Readonly<Record<PluginRowSummarySeverity, number>> = {
  ok: 0,
  info: 1,
  warning: 2,
  error: 3,
};

function worseSeverity(
  a: PluginRowSummarySeverity,
  b: PluginRowSummarySeverity,
): PluginRowSummarySeverity {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}

export interface RenderPluginBrowserChangelogViewOptions {
  /**
   * Newest-first when true (default). Flip to `false` for an
   * append-order view (useful for diagnostics).
   */
  readonly newestFirst?: boolean;
}

export function renderPluginBrowserChangelogView(
  entries: readonly PluginBrowserChangelogEntry[],
  options: RenderPluginBrowserChangelogViewOptions = {},
): PluginBrowserChangelogView {
  if (entries.length === 0) return { groups: [] };

  // Bucket by timestamp preserving first-seen order.
  const buckets = new Map<number, PluginBrowserChangelogViewRow[]>();
  const severityByTimestamp = new Map<number, PluginRowSummarySeverity>();
  const order: number[] = [];

  for (const e of entries) {
    let rows = buckets.get(e.timestamp);
    if (!rows) {
      rows = [];
      buckets.set(e.timestamp, rows);
      order.push(e.timestamp);
    }
    rows.push({
      id: e.id,
      pluginId: e.intent.pluginId,
      display: singletonDisplay(e.intent),
    });
    const currentWorst = severityByTimestamp.get(e.timestamp) ?? "ok";
    severityByTimestamp.set(
      e.timestamp,
      worseSeverity(currentWorst, e.intent.severity),
    );
  }

  const timestamps =
    options.newestFirst === false ? order : [...order].reverse();

  const groups: PluginBrowserChangelogViewGroup[] = timestamps.map((ts) => ({
    timestamp: ts,
    severity: severityByTimestamp.get(ts) ?? "ok",
    rows: buckets.get(ts) ?? [],
  }));

  return { groups };
}
