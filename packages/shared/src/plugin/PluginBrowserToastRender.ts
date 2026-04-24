/**
 * Batch-renders {@link PluginBrowserToastGroup}s into an ordered
 * array of display-ready records, plus an optional overflow summary
 * produced by the rate-limiter. Lets the editor's toast surface
 * iterate one clean list rather than composing group→display +
 * overflow→display by hand.
 *
 * Pure transform. Never throws.
 */

import type { PluginRowSummarySeverity } from "./PluginBrowserRowSummary.js";
import type { PluginBrowserToastDisplay } from "./PluginBrowserToastDisplay.js";
import { formatPluginBrowserToastGroup } from "./PluginBrowserToastDisplay.js";
import type { PluginBrowserToastGroup } from "./PluginBrowserToastGrouping.js";
import type { PluginBrowserToastKind } from "./PluginBrowserToastRouter.js";
import type { PluginBrowserToastOverflowSummary } from "./PluginBrowserToastRateLimit.js";

export interface PluginBrowserToastOverflowDisplay {
  readonly count: number;
  readonly severity: PluginRowSummarySeverity;
  /** English fallback title. */
  readonly title: string;
  /** Kind chips, ordered by priority, only for kinds with count > 0. */
  readonly badges: readonly string[];
  readonly localization: {
    readonly titleKey: string;
    readonly titleParams: Readonly<Record<string, string | number>>;
  };
  readonly ariaLabel: string;
}

export interface RenderPluginBrowserToastsInput {
  readonly groups: readonly PluginBrowserToastGroup[];
  readonly overflow?: PluginBrowserToastOverflowSummary | null;
}

export interface RenderPluginBrowserToastsResult {
  readonly displays: readonly PluginBrowserToastDisplay[];
  readonly overflow: PluginBrowserToastOverflowDisplay | null;
}

export function renderPluginBrowserToastDisplays(
  input: RenderPluginBrowserToastsInput,
): RenderPluginBrowserToastsResult {
  const displays = input.groups.map(formatPluginBrowserToastGroup);
  const overflow = input.overflow ? renderOverflow(input.overflow) : null;
  return { displays, overflow };
}

function renderOverflow(
  summary: PluginBrowserToastOverflowSummary,
): PluginBrowserToastOverflowDisplay {
  const severity = worstSeverity(summary.bySeverity);
  const title =
    summary.overflowCount === 1
      ? "1 more change"
      : `${summary.overflowCount} more changes`;
  const badges = KIND_ORDER.filter((kind) => summary.byKind[kind] > 0).map(
    (kind) => KIND_BADGE[kind],
  );

  const ariaBreakdown = KIND_ORDER.flatMap((kind) => {
    const count = summary.byKind[kind];
    return count > 0 ? [`${count} ${kind}`] : [];
  }).join(", ");
  const ariaLabel =
    ariaBreakdown.length === 0 ? title : `${title}: ${ariaBreakdown}`;

  return {
    count: summary.overflowCount,
    severity,
    title,
    badges,
    localization: {
      titleKey: "plugin.toast.overflow",
      titleParams: { count: summary.overflowCount },
    },
    ariaLabel,
  };
}

function worstSeverity(
  counts: Readonly<Record<PluginRowSummarySeverity, number>>,
): PluginRowSummarySeverity {
  if (counts.error > 0) return "error";
  if (counts.warning > 0) return "warning";
  if (counts.info > 0) return "info";
  return "ok";
}

const KIND_ORDER: readonly PluginBrowserToastKind[] = [
  "regressed",
  "removed",
  "added",
  "recovered",
  "label-changed",
];

const KIND_BADGE: Record<PluginBrowserToastKind, string> = {
  regressed: "regressed",
  removed: "removed",
  added: "added",
  recovered: "recovered",
  "label-changed": "label",
};
