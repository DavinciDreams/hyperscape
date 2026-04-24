/**
 * End-to-end Plugin Browser toast pipeline. Chains the substrate:
 *
 *   diff → intents → suppression → group → rate-limit → render
 *
 * behind a single call so the editor's toast surface can pass in
 * `{previousSnapshot, currentSnapshot, previousSuppressionState?,
 * now, cooldownMs?, maxVisible?}` and get back a fully-formed
 * `{displays, overflow, nextSuppressionState, diff}` ready to
 * render.
 *
 * Pure transform. Never throws.
 */

import type { PluginBrowserRowSummary } from "./PluginBrowserRowSummary.js";
import type { PluginBrowserSnapshotDiff } from "./PluginBrowserSnapshotDiff.js";
import { groupPluginBrowserToastIntents } from "./PluginBrowserToastGrouping.js";
import { runPluginBrowserNotificationPipeline } from "./PluginBrowserNotificationPipeline.js";
import { rateLimitPluginBrowserToastIntents } from "./PluginBrowserToastRateLimit.js";
import type { PluginBrowserToastDisplay } from "./PluginBrowserToastDisplay.js";
import type { PluginBrowserToastOverflowDisplay } from "./PluginBrowserToastRender.js";
import { renderPluginBrowserToastDisplays } from "./PluginBrowserToastRender.js";
import type { ToastSuppressionState } from "./PluginBrowserToastSuppression.js";

export interface PluginBrowserToastPipelineInput {
  readonly previousSnapshot: ReadonlyMap<string, PluginBrowserRowSummary>;
  readonly currentSnapshot: ReadonlyMap<string, PluginBrowserRowSummary>;
  readonly previousSuppressionState?: ToastSuppressionState;
  readonly now: number;
  readonly cooldownMs?: number;
  /**
   * Upper bound on surfaced groups per refresh. When omitted (or
   * negative), no rate-limit is applied and `overflow` is null.
   */
  readonly maxVisible?: number;
}

export interface PluginBrowserToastPipelineResult {
  readonly diff: PluginBrowserSnapshotDiff;
  readonly displays: readonly PluginBrowserToastDisplay[];
  readonly overflow: PluginBrowserToastOverflowDisplay | null;
  readonly nextSuppressionState: ToastSuppressionState;
}

export function runPluginBrowserToastPipeline(
  input: PluginBrowserToastPipelineInput,
): PluginBrowserToastPipelineResult {
  const pipeline = runPluginBrowserNotificationPipeline({
    previousSnapshot: input.previousSnapshot,
    currentSnapshot: input.currentSnapshot,
    previousSuppressionState: input.previousSuppressionState,
    now: input.now,
    cooldownMs: input.cooldownMs,
  });

  const groups = groupPluginBrowserToastIntents(pipeline.emitted);

  const limited =
    input.maxVisible === undefined || input.maxVisible < 0
      ? { emitted: groups, overflow: null }
      : rateLimitGroups(groups, input.maxVisible);

  const rendered = renderPluginBrowserToastDisplays({
    groups: limited.emitted,
    overflow: limited.overflow
      ? overflowFromGroupRateLimit(limited.overflow)
      : null,
  });

  return {
    diff: pipeline.diff,
    displays: rendered.displays,
    overflow: rendered.overflow,
    nextSuppressionState: pipeline.nextSuppressionState,
  };
}

/**
 * The rate-limit helper operates on intents, not groups. We adapt
 * it here by re-using its counters over the group list — each
 * group contributes one "row" worth of overflow but carries its
 * own `severity` (worst across group members) and primary kind.
 */
function rateLimitGroups(
  groups: ReturnType<typeof groupPluginBrowserToastIntents>,
  maxVisible: number,
) {
  // Reuse rate-limit semantics by projecting each group to a
  // single stand-in intent derived from its primary. That keeps
  // all counting logic in one place.
  const standIns = groups.map((g) => ({
    id: `group:${g.pluginId}`,
    kind: g.primary.kind,
    severity: g.severity, // group severity (worst across members)
    pluginId: g.pluginId,
    previous: g.primary.previous,
    current: g.primary.current,
  }));
  const r = rateLimitPluginBrowserToastIntents(standIns, { maxVisible });
  const emittedPluginIds = new Set(r.emitted.map((i) => i.pluginId));
  const emitted = groups.filter((g) => emittedPluginIds.has(g.pluginId));
  return { emitted, overflow: r.overflow };
}

/**
 * Overflow summary from `rateLimitPluginBrowserToastIntents` is
 * structurally identical to what the renderer expects, but we
 * re-wrap the ids to reflect "group:" projection.
 */
function overflowFromGroupRateLimit(
  overflow: NonNullable<
    ReturnType<typeof rateLimitPluginBrowserToastIntents>["overflow"]
  >,
) {
  // The rate-limit summary is already the exact shape the renderer
  // expects (counts + ids); passing it straight through preserves
  // the "group:<pluginId>" id projection applied above.
  return overflow;
}
