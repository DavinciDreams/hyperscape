/**
 * Action-oriented classifier of a `TransitionExecutionReport`.
 *
 * The existing `buildTransitionReportView` projects the report into
 * a row-oriented table model. This module answers a different
 * question — "what should the editor do next?" — by collapsing the
 * full report into a single outcome enum + recommendation flags:
 *
 *   - `outcome`             — high-level state for banner color/icon
 *   - `headline`            — short banner string
 *   - `recommendRollback`   — should we surface the "Undo last apply"
 *                              affordance prominently
 *   - `failedPluginIds`     — convenience set for badging
 *   - `skippedPluginIds`    — convenience set for badging
 *
 * Pure transform. Never throws.
 */

import type { TransitionExecutionReport } from "./PluginRegistryTransitionExecutor.js";

export type PluginRegistryApplyOutcomeKind =
  | "no-op"
  | "all-ok"
  | "partial-success"
  | "all-failed";

export interface PluginRegistryApplyOutcome {
  readonly outcome: PluginRegistryApplyOutcomeKind;
  readonly headline: string;
  /**
   * `true` when at least one step failed AND at least one step
   * succeeded — i.e. the registry is now in a half-applied state
   * worth offering "Undo last apply" for. `false` for `all-ok`
   * (nothing to undo), `all-failed` (nothing succeeded to undo),
   * and `no-op` (zero steps).
   */
  readonly recommendRollback: boolean;
  readonly failedPluginIds: readonly string[];
  readonly skippedPluginIds: readonly string[];
}

export function classifyPluginRegistryApplyOutcome(
  report: TransitionExecutionReport,
): PluginRegistryApplyOutcome {
  const total = report.results.length;
  const failedPluginIds: string[] = [];
  const skippedPluginIds: string[] = [];
  for (const r of report.results) {
    if (r.status === "failed") failedPluginIds.push(r.step.pluginId);
    else if (r.status === "skipped") skippedPluginIds.push(r.step.pluginId);
  }

  const outcome = classifyKind(report, total);
  const headline = buildHeadline(outcome, report);
  const recommendRollback = outcome === "partial-success";

  return {
    outcome,
    headline,
    recommendRollback,
    failedPluginIds,
    skippedPluginIds,
  };
}

function classifyKind(
  report: TransitionExecutionReport,
  total: number,
): PluginRegistryApplyOutcomeKind {
  if (total === 0) return "no-op";
  if (report.failedCount === 0 && report.skippedCount === 0) return "all-ok";
  if (report.okCount === 0) return "all-failed";
  return "partial-success";
}

function buildHeadline(
  outcome: PluginRegistryApplyOutcomeKind,
  report: TransitionExecutionReport,
): string {
  switch (outcome) {
    case "no-op":
      return "no changes applied";
    case "all-ok":
      return `applied ${report.okCount} ${pluralStep(report.okCount)}`;
    case "all-failed":
      return `all ${report.failedCount} ${pluralStep(report.failedCount)} failed`;
    case "partial-success": {
      const parts: string[] = [`${report.okCount} ok`];
      if (report.failedCount > 0) parts.push(`${report.failedCount} failed`);
      if (report.skippedCount > 0) parts.push(`${report.skippedCount} skipped`);
      return `partial: ${parts.join(", ")}`;
    }
  }
}

function pluralStep(n: number): string {
  return n === 1 ? "step" : "steps";
}
