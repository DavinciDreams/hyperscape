/**
 * Editor-facing one-call preview of "what happens when I click
 * Apply". Composes the existing pipeline:
 *
 *   computePluginRegistryTransitionPlan
 *     → orderPluginRegistryTransition
 *       → executePluginRegistryTransition (with DryRunTransitionAdapter)
 *         → buildTransitionReportView
 *         → computePluginRegistryRollbackPlan
 *
 * Returns every intermediate so the editor can render whatever
 * surface it needs (plan badges, ordered-step list, recorded
 * adapter calls, formatted rows + summary headline, the inverse
 * plan that would undo a confirmed apply).
 *
 * Pure composition — no I/O, no state mutation outside the
 * dry-run adapter's own ephemeral `recorded[]` array. The
 * preview *never* touches the real PluginHost; that's the whole
 * point of using `DryRunTransitionAdapter`.
 */

import type { PluginRegistryManifest } from "@hyperforge/manifest-schema";
import {
  type PluginRegistryApplyOutcome,
  classifyPluginRegistryApplyOutcome,
} from "./PluginRegistryApplyOutcome.js";
import {
  type DryRunRecordedCall,
  DryRunTransitionAdapter,
} from "./PluginRegistryDryRunAdapter.js";
import {
  type RollbackPlan,
  computePluginRegistryRollbackPlan,
} from "./PluginRegistryRollbackPlan.js";
import {
  type TransitionExecutionReport,
  executePluginRegistryTransition,
} from "./PluginRegistryTransitionExecutor.js";
import {
  type TransitionStep,
  orderPluginRegistryTransition,
} from "./PluginRegistryTransitionOrder.js";
import {
  type PluginRegistryTransitionPlan,
  computePluginRegistryTransitionPlan,
} from "./PluginRegistryTransitionPlan.js";
import {
  type TransitionReportView,
  buildTransitionReportView,
} from "./PluginRegistryTransitionReportView.js";

export interface PreviewPluginRegistryApplyOptions {
  /**
   * Map of pluginId → error to inject into the dry-run adapter,
   * letting the editor model "what if loading X throws?".
   */
  readonly seededFailures?: ReadonlyMap<string, Error>;
  /**
   * If true, the dry-run executor stops at the first failed
   * step (subsequent steps land as `skipped`). Default `false`
   * (best-effort).
   */
  readonly stopOnError?: boolean;
  /**
   * Used by `buildTransitionReportView` to resolve display
   * names for steps whose own manifest lacks one. Defaults to
   * `oldRegistry` so stop rows show the dropped plugin's name.
   */
  readonly registryForRowNames?: PluginRegistryManifest;
}

export interface PluginRegistryApplyPreview {
  /** The bucketed start/restart/stop/noChange plan. */
  readonly plan: PluginRegistryTransitionPlan;
  /** Plan flattened into dependency-safe execution order. */
  readonly orderedSteps: readonly TransitionStep[];
  /** What the dry-run adapter recorded as it walked the steps. */
  readonly recordedCalls: readonly DryRunRecordedCall[];
  /** Executor report with per-step status + duration. */
  readonly report: TransitionExecutionReport;
  /** Editor table rows + summary headline. */
  readonly view: TransitionReportView;
  /** Inverse plan that, if executed, would restore old state. */
  readonly rollback: RollbackPlan;
  /**
   * Action-oriented classification of the dry-run report —
   * lets the editor pick a banner color/icon and decide whether
   * to surface "Undo last apply" without re-deriving from
   * `report.failedCount` etc.
   */
  readonly outcome: PluginRegistryApplyOutcome;
}

/**
 * Run the full preview pipeline. Async because the executor is
 * async (real adapters are network/fs-bound; the dry-run
 * adapter resolves immediately).
 */
export async function previewPluginRegistryApply(
  oldRegistry: PluginRegistryManifest,
  newRegistry: PluginRegistryManifest,
  runningPluginIds: ReadonlySet<string>,
  options: PreviewPluginRegistryApplyOptions = {},
): Promise<PluginRegistryApplyPreview> {
  const plan = computePluginRegistryTransitionPlan(
    oldRegistry,
    newRegistry,
    runningPluginIds,
  );
  const orderedSteps = orderPluginRegistryTransition(
    plan,
    oldRegistry,
    newRegistry,
  );
  const adapter = new DryRunTransitionAdapter({
    seededFailures: options.seededFailures,
  });
  const report = await executePluginRegistryTransition(orderedSteps, adapter, {
    stopOnError: options.stopOnError ?? false,
  });
  const view = buildTransitionReportView(
    report,
    options.registryForRowNames ?? oldRegistry,
  );
  const rollback = computePluginRegistryRollbackPlan(
    report.results,
    oldRegistry,
    newRegistry,
  );

  return {
    plan,
    orderedSteps,
    recordedCalls: adapter.recorded,
    report,
    view,
    rollback,
    outcome: classifyPluginRegistryApplyOutcome(report),
  };
}

/**
 * Convenience: would the apply succeed (no failed steps)?
 * Used by the editor confirm-modal "Apply (safe)" button label.
 */
export function isPreviewApplySafe(
  preview: PluginRegistryApplyPreview,
): boolean {
  return preview.report.success;
}
