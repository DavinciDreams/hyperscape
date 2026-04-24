/**
 * Composes the Plugin Browser notification chain
 * (diff → intents → suppression) behind one call so editor code
 * doesn't have to wire the three stages itself.
 *
 * Pure transform. Never throws.
 */

import type { PluginBrowserRowSummary } from "./PluginBrowserRowSummary.js";
import type { PluginBrowserSnapshotDiff } from "./PluginBrowserSnapshotDiff.js";
import { diffPluginBrowserSnapshots } from "./PluginBrowserSnapshotDiff.js";
import type { PluginBrowserToastIntent } from "./PluginBrowserToastRouter.js";
import { buildPluginBrowserToastIntents } from "./PluginBrowserToastRouter.js";
import type { ToastSuppressionState } from "./PluginBrowserToastSuppression.js";
import {
  emptyToastSuppressionState,
  filterPluginBrowserToastIntents,
} from "./PluginBrowserToastSuppression.js";

export interface PluginBrowserNotificationPipelineInput {
  readonly previousSnapshot: ReadonlyMap<string, PluginBrowserRowSummary>;
  readonly currentSnapshot: ReadonlyMap<string, PluginBrowserRowSummary>;
  readonly previousSuppressionState?: ToastSuppressionState;
  readonly now: number;
  readonly cooldownMs?: number;
}

export interface PluginBrowserNotificationPipelineResult {
  /** Full diff — exposed so the editor can render a change summary. */
  readonly diff: PluginBrowserSnapshotDiff;
  /** Every intent the diff produced, pre-suppression (for badges). */
  readonly intents: readonly PluginBrowserToastIntent[];
  /** Intents the editor should actually render now. */
  readonly emitted: readonly PluginBrowserToastIntent[];
  /** Intents suppressed by the cooldown/first-sight rules. */
  readonly suppressed: readonly PluginBrowserToastIntent[];
  /** Thread this back in on the next refresh. */
  readonly nextSuppressionState: ToastSuppressionState;
}

export function runPluginBrowserNotificationPipeline(
  input: PluginBrowserNotificationPipelineInput,
): PluginBrowserNotificationPipelineResult {
  const diff = diffPluginBrowserSnapshots(
    input.previousSnapshot,
    input.currentSnapshot,
  );
  const intents = buildPluginBrowserToastIntents(diff);
  const previousState =
    input.previousSuppressionState ?? emptyToastSuppressionState();
  const { emitted, suppressed, nextState } = filterPluginBrowserToastIntents(
    intents,
    {
      now: input.now,
      previousState,
      cooldownMs: input.cooldownMs,
    },
  );
  return {
    diff,
    intents,
    emitted,
    suppressed,
    nextSuppressionState: nextState,
  };
}
