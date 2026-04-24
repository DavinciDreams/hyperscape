/**
 * Bridge between `PluginRegistryTransitionExecutor`'s structured
 * execution report and `PluginLifecycleJournal`'s per-plugin
 * activity feed.
 *
 * The executor reports one row per `TransitionStep`; the journal
 * stores per-(plugin, phase) events. This module walks a finished
 * report and records the equivalent journal events so the editor's
 * "Recent activity" panel surfaces transition runs alongside
 * normal lifecycle traffic.
 *
 * Mapping:
 *   - `start`   → records phase `"load"` then `"enable"`
 *   - `restart` → records phase `"disable"`, `"load"`, `"enable"`
 *   - `stop`    → records phase `"disable"`
 *
 * Outcome:
 *   - `ok` step → all phases recorded as `"success"`
 *   - `failed` step → all phases recorded as `"failed"` with
 *     `errorMessage` populated from the report's error
 *   - `skipped` step → not recorded (stopOnError aborts produce
 *     skipped rows that didn't actually run; recording them
 *     would lie about activity)
 *
 * Pure transform. Caller supplies a base timestamp; per-phase
 * timestamps are spaced by 1 ms so the journal sorts them in
 * intent order (`disable` before `load` before `enable` for a
 * restart, etc.).
 */

import type {
  PluginLifecycleJournal,
  PluginLifecycleOutcome,
} from "./PluginLifecycleJournal.js";
import type { LifecyclePhase } from "./PluginLoader.js";
import type {
  TransitionExecutionReport,
  TransitionStepResult,
} from "./PluginRegistryTransitionExecutor.js";

/**
 * Walk a report and record corresponding lifecycle events. The
 * caller supplies `at` (typically `Date.now()`) for the first
 * recorded event; subsequent events for the same step bump by 1
 * ms each so the journal preserves intent order.
 *
 * Returns the number of events recorded.
 */
export function journalTransitionExecutionReport(
  report: TransitionExecutionReport,
  journal: PluginLifecycleJournal,
  at: number,
): number {
  let cursor = at;
  let count = 0;

  for (const result of report.results) {
    if (result.status === "skipped") continue;
    const phases = phasesForStep(result);
    const outcome: PluginLifecycleOutcome =
      result.status === "ok" ? "success" : "failed";
    const errorMessage = result.error?.message;

    for (const phase of phases) {
      journal.record({
        at: cursor,
        pluginId: result.step.pluginId,
        phase,
        outcome,
        ...(errorMessage && outcome === "failed" ? { errorMessage } : {}),
      });
      cursor += 1;
      count += 1;
    }
  }

  return count;
}

function phasesForStep(
  result: TransitionStepResult,
): readonly LifecyclePhase[] {
  switch (result.step.kind) {
    case "start":
      return ["load", "enable"];
    case "restart":
      return ["disable", "load", "enable"];
    case "stop":
      return ["disable"];
  }
}
