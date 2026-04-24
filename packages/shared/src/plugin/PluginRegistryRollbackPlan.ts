/**
 * Editor "Undo last apply" substrate. Given the executed
 * transition (the report from `executePluginRegistryTransition`)
 * and the registries on either side of it, compute the inverse
 * `TransitionStep[]` — i.e. the steps that, when executed, would
 * restore the OLD registry's running state.
 *
 * The function is deliberately strict about what it considers
 * undoable:
 *   - `ok` results contribute their inverse step
 *   - `failed` and `skipped` results are dropped (and recorded
 *     in `skipped[]` so the editor can surface "we couldn't undo
 *     X because the original step never completed")
 *   - `stop` results whose old manifest is missing from the
 *     supplied `oldRegistry` are dropped (recorded as
 *     `"old-manifest-missing"`); without the old manifest there
 *     is nothing to start back up.
 *
 * Ordering: the inverse plan is conceptually a forward
 * transition from `newRegistry` (the post-apply state) back to
 * `oldRegistry`. So we build a synthetic
 * `PluginRegistryTransitionPlan` and reuse
 * `orderPluginRegistryTransition(plan, newRegistry,
 * oldRegistry)`. That gives us the canonical rule applied with
 * swapped registries: stops sort by reverse-NEW load order
 * (tear down dependents first) and starts/restarts sort by OLD
 * load order (bring deps up before their dependents).
 *
 * Pure transform. Never throws.
 */

import type { PluginRegistryManifest } from "@hyperforge/manifest-schema";
import type { TransitionStepResult } from "./PluginRegistryTransitionExecutor.js";
import {
  type PluginRegistryTransitionPlan,
  type PluginTransitionRestart,
  type PluginTransitionStart,
  type PluginTransitionStop,
} from "./PluginRegistryTransitionPlan.js";
import {
  type TransitionStep,
  orderPluginRegistryTransition,
} from "./PluginRegistryTransitionOrder.js";

export type RollbackPlanSkipReason =
  | "step-failed"
  | "step-skipped"
  | "old-manifest-missing";

export interface RollbackPlanSkip {
  readonly pluginId: string;
  readonly originalKind: TransitionStep["kind"];
  readonly reason: RollbackPlanSkipReason;
}

export interface RollbackPlan {
  /** Inverse steps in dependency-safe execution order. */
  readonly steps: readonly TransitionStep[];
  /** Original results that could not be inverted, with reasons. */
  readonly skipped: readonly RollbackPlanSkip[];
}

/**
 * Compute the inverse plan for the given executor results.
 *
 * - `oldRegistry` is the pre-apply registry (what we want to
 *   roll back to).
 * - `newRegistry` is the post-apply (committed) registry, used
 *   for dependency ordering of inverse stops.
 *
 * Skipped steps:
 *   - failed / skipped results never moved real state, so we drop
 *     them and record the skip
 *   - stop steps whose pluginId is no longer in `oldRegistry`
 *     can't be undone (we'd need the old manifest); recorded
 *     as `old-manifest-missing`
 */
export function computePluginRegistryRollbackPlan(
  results: readonly TransitionStepResult[],
  oldRegistry: PluginRegistryManifest,
  newRegistry: PluginRegistryManifest,
): RollbackPlan {
  const oldById = new Map(oldRegistry.plugins.map((p) => [p.id, p] as const));

  const toStart: PluginTransitionStart[] = [];
  const toRestart: PluginTransitionRestart[] = [];
  const toStop: PluginTransitionStop[] = [];
  const skipped: RollbackPlanSkip[] = [];

  for (const r of results) {
    const step = r.step;
    if (r.status !== "ok") {
      skipped.push({
        pluginId: step.pluginId,
        originalKind: step.kind,
        reason: r.status === "failed" ? "step-failed" : "step-skipped",
      });
      continue;
    }

    if (step.kind === "start") {
      // Original `start` brought a new plugin in; inverse is `stop` for removal.
      toStop.push({ pluginId: step.pluginId, reason: "removed" });
      continue;
    }

    if (step.kind === "stop") {
      // Original `stop` tore a plugin down; inverse is `start` with
      // the manifest as it appeared in `oldRegistry`.
      const oldManifest = oldById.get(step.pluginId);
      if (!oldManifest) {
        skipped.push({
          pluginId: step.pluginId,
          originalKind: step.kind,
          reason: "old-manifest-missing",
        });
        continue;
      }
      toStart.push({ pluginId: step.pluginId, manifest: oldManifest });
      continue;
    }

    // Original `restart` swapped previousManifest → nextManifest;
    // inverse is `restart` with the manifests reversed. Reason
    // tracks which axis differs after the swap.
    const inverseReason: PluginTransitionRestart["reason"] =
      step.previousManifest.version !== step.nextManifest.version
        ? "version-changed"
        : "manifest-changed";
    toRestart.push({
      pluginId: step.pluginId,
      previousManifest: step.nextManifest,
      nextManifest: step.previousManifest,
      reason: inverseReason,
    });
  }

  const inversePlan: PluginRegistryTransitionPlan = {
    toStart,
    toRestart,
    toStop,
    noChange: [],
  };

  // Order the inverse plan as a forward transition from new → old.
  const steps = orderPluginRegistryTransition(
    inversePlan,
    newRegistry,
    oldRegistry,
  );

  return { steps, skipped };
}

/**
 * Convenience: number of inverse steps the rollback would
 * execute. Useful for editor "Revert (3 steps)" button labels.
 */
export function rollbackStepCount(plan: RollbackPlan): number {
  return plan.steps.length;
}

/**
 * Convenience: returns true when nothing can be rolled back.
 * Either every original step failed/skipped, or there were no
 * results to begin with.
 */
export function isRollbackPlanEmpty(plan: RollbackPlan): boolean {
  return plan.steps.length === 0;
}
