/**
 * Dry-run `TransitionAdapter`. Records each call as a structured
 * row instead of touching the host. Editors use this to render
 * "What would happen if I clicked Apply?" preview panels and to
 * power the confirm modal — running the executor with this
 * adapter produces a `TransitionExecutionReport` whose every step
 * lands as `"ok"` (or `"failed"` if the caller seeded an error
 * for that pluginId).
 *
 * Why pair this with the executor rather than building a
 * separate `previewPluginRegistryTransition()` function? Because
 * the executor's reporting/format/journal pipeline is already
 * useful — composing them means the dry-run preview shares the
 * exact same UX surface as a real run.
 *
 * Pure-logic, side-effect-free except for its own `recorded[]`
 * array. Never throws on its own; if the caller seeded
 * `seededFailures` for a plugin id, the corresponding adapter
 * method throws on call so the executor records `failed`.
 */

import type { PluginManifest } from "@hyperforge/manifest-schema";
import type {
  TransitionAdapter,
  TransitionStepResult,
} from "./PluginRegistryTransitionExecutor.js";
import type {
  TransitionStep,
  TransitionStepRestart,
  TransitionStepStart,
  TransitionStepStop,
} from "./PluginRegistryTransitionOrder.js";

export interface DryRunRecordedCall {
  readonly kind: TransitionStep["kind"];
  readonly pluginId: string;
  /** For start/restart, the manifest the host would load. Null for stop. */
  readonly manifest: PluginManifest | null;
  readonly reason?:
    | TransitionStepRestart["reason"]
    | TransitionStepStop["reason"];
}

export interface DryRunTransitionAdapterOptions {
  /**
   * Map of pluginId → injected error to throw on adapter call.
   * Used by editor "what-if" UI to model a likely-failure scenario
   * (e.g. "what if loading com.foo throws?"). The executor will
   * record the corresponding step as failed in its report.
   */
  readonly seededFailures?: ReadonlyMap<string, Error>;
}

export class DryRunTransitionAdapter implements TransitionAdapter {
  private readonly _recorded: DryRunRecordedCall[] = [];
  private readonly _seededFailures: ReadonlyMap<string, Error>;

  constructor(options: DryRunTransitionAdapterOptions = {}) {
    this._seededFailures = options.seededFailures ?? new Map();
  }

  /** Snapshot of every call made so far, in dispatch order. */
  get recorded(): readonly DryRunRecordedCall[] {
    return [...this._recorded];
  }

  /** Total number of recorded calls. */
  get callCount(): number {
    return this._recorded.length;
  }

  async stop(step: TransitionStepStop): Promise<void> {
    this._recorded.push({
      kind: "stop",
      pluginId: step.pluginId,
      manifest: null,
      reason: step.reason,
    });
    this._maybeThrow(step.pluginId);
  }

  async restart(step: TransitionStepRestart): Promise<void> {
    this._recorded.push({
      kind: "restart",
      pluginId: step.pluginId,
      manifest: step.nextManifest,
      reason: step.reason,
    });
    this._maybeThrow(step.pluginId);
  }

  async start(step: TransitionStepStart): Promise<void> {
    this._recorded.push({
      kind: "start",
      pluginId: step.pluginId,
      manifest: step.manifest,
    });
    this._maybeThrow(step.pluginId);
  }

  private _maybeThrow(pluginId: string): void {
    const seeded = this._seededFailures.get(pluginId);
    if (seeded) throw seeded;
  }
}

/**
 * Quick-render summary of a dry-run adapter's recorded calls,
 * suitable for an editor confirm-modal subtitle. Pure formatter.
 *
 * Output shape:
 *   "1 stop, 2 restart, 3 start (6 total)"
 */
export function summarizeDryRunCalls(
  calls: readonly DryRunRecordedCall[],
): string {
  let stops = 0;
  let restarts = 0;
  let starts = 0;
  for (const c of calls) {
    if (c.kind === "stop") stops++;
    else if (c.kind === "restart") restarts++;
    else if (c.kind === "start") starts++;
  }
  return `${stops} stop, ${restarts} restart, ${starts} start (${calls.length} total)`;
}

/**
 * Helper used by `useDryRunPreview()` (or equivalent) hooks: pull
 * the failed-step plugin ids out of an executor report so the
 * preview UI can render them in red. Pure transform.
 */
export function failedPluginIds(
  results: readonly TransitionStepResult[],
): readonly string[] {
  const out: string[] = [];
  for (const r of results) {
    if (r.status === "failed") out.push(r.step.pluginId);
  }
  return out;
}
