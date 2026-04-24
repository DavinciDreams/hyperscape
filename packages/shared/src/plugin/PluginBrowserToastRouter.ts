/**
 * Maps a {@link PluginBrowserSnapshotDiff} to an ordered list of
 * toast intents the editor can render without reimplementing the
 * precedence/suppression logic. Pure transform; never throws.
 *
 * An "intent" is a rendering-agnostic description of what the user
 * should see (kind + severity + plugin + previous/current rows). The
 * editor is free to decorate it with localized strings or icons.
 */

import type {
  PluginBrowserRowSummary,
  PluginRowSummarySeverity,
} from "./PluginBrowserRowSummary.js";
import type {
  PluginBrowserRowChange,
  PluginBrowserSnapshotDiff,
} from "./PluginBrowserSnapshotDiff.js";

export type PluginBrowserToastKind =
  | "added"
  | "removed"
  | "regressed"
  | "recovered"
  | "label-changed";

export interface PluginBrowserToastIntent {
  /** Deterministic id, suitable for toast dedupe: `${kind}:${pluginId}`. */
  readonly id: string;
  readonly kind: PluginBrowserToastKind;
  /** Severity the toast should be decorated with. */
  readonly severity: PluginRowSummarySeverity;
  readonly pluginId: string;
  readonly previous: PluginBrowserRowSummary | null;
  readonly current: PluginBrowserRowSummary | null;
}

export function buildPluginBrowserToastIntents(
  diff: PluginBrowserSnapshotDiff,
): readonly PluginBrowserToastIntent[] {
  const intents: PluginBrowserToastIntent[] = [];

  for (const c of diff.severityChanged) {
    intents.push(buildSeverityIntent(c));
  }
  for (const c of diff.removed) {
    intents.push({
      id: `removed:${c.pluginId}`,
      kind: "removed",
      severity: c.previous?.severity ?? "info",
      pluginId: c.pluginId,
      previous: c.previous,
      current: null,
    });
  }
  for (const c of diff.added) {
    intents.push({
      id: `added:${c.pluginId}`,
      kind: "added",
      severity: c.current?.severity ?? "info",
      pluginId: c.pluginId,
      previous: null,
      current: c.current,
    });
  }
  for (const c of diff.labelChanged) {
    intents.push({
      id: `label-changed:${c.pluginId}`,
      kind: "label-changed",
      severity: c.current?.severity ?? "info",
      pluginId: c.pluginId,
      previous: c.previous,
      current: c.current,
    });
  }

  intents.sort((a, b) => {
    const kd = KIND_RANK[a.kind] - KIND_RANK[b.kind];
    if (kd !== 0) return kd;
    const sd = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    if (sd !== 0) return sd;
    return a.pluginId.localeCompare(b.pluginId);
  });

  return intents;
}

function buildSeverityIntent(
  c: PluginBrowserRowChange,
): PluginBrowserToastIntent {
  const from = c.severityTransition?.from ?? null;
  const to = c.severityTransition?.to ?? null;
  const worse =
    from !== null && to !== null
      ? SEVERITY_RANK[to] > SEVERITY_RANK[from]
      : false;
  const kind: PluginBrowserToastKind = worse ? "regressed" : "recovered";
  return {
    id: `${kind}:${c.pluginId}`,
    kind,
    severity: c.current?.severity ?? "info",
    pluginId: c.pluginId,
    previous: c.previous,
    current: c.current,
  };
}

/**
 * Ordering priority across kinds:
 *  0. regressed   — something just got worse
 *  1. removed     — uninstalled; user should know even if it was healthy
 *  2. added       — newly installed
 *  3. recovered   — good news; surface after the bad news
 *  4. label-changed — descriptive-only change; lowest priority
 * Within the same kind, severity desc then pluginId asc.
 */
const KIND_RANK: Record<PluginBrowserToastKind, number> = {
  regressed: 0,
  removed: 1,
  added: 2,
  recovered: 3,
  "label-changed": 4,
};

const SEVERITY_RANK: Record<PluginRowSummarySeverity, number> = {
  ok: 0,
  info: 1,
  warning: 2,
  error: 3,
};
