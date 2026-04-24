/**
 * Diff between two consecutive Plugin Browser snapshots. Powers the
 * editor's notification toasts ("com.x just flipped to broken",
 * "com.y was uninstalled"). Pure transform over the row-summary map
 * portion of {@link PluginBrowserSnapshotComposed}.
 *
 * Pure transform. Never throws.
 */

import type {
  PluginBrowserRowSummary,
  PluginRowSummarySeverity,
} from "./PluginBrowserRowSummary.js";

export type PluginBrowserRowChangeKind =
  | "added"
  | "removed"
  | "severity-changed"
  | "label-changed"
  | "unchanged";

export interface PluginBrowserRowChange {
  readonly pluginId: string;
  readonly kind: PluginBrowserRowChangeKind;
  readonly previous: PluginBrowserRowSummary | null;
  readonly current: PluginBrowserRowSummary | null;
  /**
   * Severity transition tag. Populated on `added`, `removed`, and
   * `severity-changed`; null on `label-changed`/`unchanged`.
   */
  readonly severityTransition: {
    readonly from: PluginRowSummarySeverity | null;
    readonly to: PluginRowSummarySeverity | null;
  } | null;
}

export interface PluginBrowserSnapshotDiff {
  readonly added: readonly PluginBrowserRowChange[];
  readonly removed: readonly PluginBrowserRowChange[];
  readonly severityChanged: readonly PluginBrowserRowChange[];
  readonly labelChanged: readonly PluginBrowserRowChange[];
  readonly unchanged: readonly PluginBrowserRowChange[];
}

export function diffPluginBrowserSnapshots(
  previous: ReadonlyMap<string, PluginBrowserRowSummary>,
  current: ReadonlyMap<string, PluginBrowserRowSummary>,
): PluginBrowserSnapshotDiff {
  const added: PluginBrowserRowChange[] = [];
  const removed: PluginBrowserRowChange[] = [];
  const severityChanged: PluginBrowserRowChange[] = [];
  const labelChanged: PluginBrowserRowChange[] = [];
  const unchanged: PluginBrowserRowChange[] = [];

  for (const [id, curRow] of current) {
    const prevRow = previous.get(id) ?? null;
    if (prevRow === null) {
      added.push({
        pluginId: id,
        kind: "added",
        previous: null,
        current: curRow,
        severityTransition: { from: null, to: curRow.severity },
      });
      continue;
    }
    if (prevRow.severity !== curRow.severity) {
      severityChanged.push({
        pluginId: id,
        kind: "severity-changed",
        previous: prevRow,
        current: curRow,
        severityTransition: { from: prevRow.severity, to: curRow.severity },
      });
      continue;
    }
    if (prevRow.label !== curRow.label) {
      labelChanged.push({
        pluginId: id,
        kind: "label-changed",
        previous: prevRow,
        current: curRow,
        severityTransition: null,
      });
      continue;
    }
    unchanged.push({
      pluginId: id,
      kind: "unchanged",
      previous: prevRow,
      current: curRow,
      severityTransition: null,
    });
  }

  for (const [id, prevRow] of previous) {
    if (current.has(id)) continue;
    removed.push({
      pluginId: id,
      kind: "removed",
      previous: prevRow,
      current: null,
      severityTransition: { from: prevRow.severity, to: null },
    });
  }

  return { added, removed, severityChanged, labelChanged, unchanged };
}

/**
 * Convenience: true when the diff contains only `unchanged` entries
 * (no adds, removes, or mutations). The editor can short-circuit the
 * notification pipeline in that case.
 */
export function isPluginBrowserSnapshotDiffEmpty(
  diff: PluginBrowserSnapshotDiff,
): boolean {
  return (
    diff.added.length === 0 &&
    diff.removed.length === 0 &&
    diff.severityChanged.length === 0 &&
    diff.labelChanged.length === 0
  );
}

/**
 * Convenience: filter severityChanged to entries whose new severity is
 * strictly worse than the previous one. Used to gate "something just
 * broke" toasts without spamming "something recovered".
 */
export function severityRegressions(
  diff: PluginBrowserSnapshotDiff,
): readonly PluginBrowserRowChange[] {
  return diff.severityChanged.filter((c) => {
    const from = c.severityTransition?.from;
    const to = c.severityTransition?.to;
    if (!from || !to) return false;
    return severityRank(to) > severityRank(from);
  });
}

const SEVERITY_RANK: Record<PluginRowSummarySeverity, number> = {
  ok: 0,
  info: 1,
  warning: 2,
  error: 3,
};

function severityRank(s: PluginRowSummarySeverity): number {
  return SEVERITY_RANK[s];
}
