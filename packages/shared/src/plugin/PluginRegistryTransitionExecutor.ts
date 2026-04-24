/**
 * Walks an ordered `TransitionStep[]` and asks an injected
 * `TransitionAdapter` to perform each lifecycle action against
 * the actual host. Pure orchestration: this module never touches
 * `PluginHost` or `PluginLoader` directly — it just calls the
 * adapter and collects a structured report.
 *
 * Why an adapter rather than wiring directly to `PluginHost`?
 *   - `start` for a brand-new plugin requires sourcing a factory
 *     (typically a dynamic import based on `manifest.entry`).
 *     That belongs in `@hyperforge/gameplay-framework`, not in
 *     `@hyperforge/shared` — keeping the executor adapter-driven
 *     means the dynamic-import boundary lives outside this package.
 *   - Tests can pass mock adapters and assert call sequence +
 *     report shape without spinning up a real host.
 *   - Editors/CLI/headless replays can each provide their own
 *     adapter shape (e.g. dry-run adapter that no-ops + logs).
 *
 * Default semantics: best-effort. A failing step is recorded and
 * execution continues with the next step. Pass `stopOnError: true`
 * to abort the rest of the sequence on the first failure (the
 * remaining steps land in the report as `skipped`).
 *
 * Pure async transform. Never throws — failures are recorded.
 */

import type { PluginManifest } from "@hyperforge/manifest-schema";
import type {
  TransitionStep,
  TransitionStepRestart,
  TransitionStepStart,
  TransitionStepStop,
} from "./PluginRegistryTransitionOrder.js";

export interface TransitionAdapter {
  /**
   * Tear down a plugin currently running in the host. Reason
   * (`removed` vs `disabled`) is informational — the adapter
   * decides whether to keep the factory registered (disabled) or
   * fully unregister it (removed).
   */
  stop(step: TransitionStepStop): Promise<void>;
  /**
   * Restart a plugin in place: typically disable, swap manifest,
   * re-enable. Adapter is responsible for sourcing the new
   * factory (e.g. via dynamic import of `nextManifest.entry`).
   */
  restart(step: TransitionStepRestart): Promise<void>;
  /**
   * Bring a brand-new plugin online: register factory + load +
   * enable. Adapter sources the factory.
   */
  start(step: TransitionStepStart): Promise<void>;
}

export type TransitionStepStatus = "ok" | "failed" | "skipped";

export interface TransitionStepResult {
  readonly step: TransitionStep;
  readonly status: TransitionStepStatus;
  readonly error: Error | null;
  /** Wallclock duration in ms. 0 for skipped steps. */
  readonly durationMs: number;
}

export interface TransitionExecutionReport {
  readonly results: readonly TransitionStepResult[];
  readonly okCount: number;
  readonly failedCount: number;
  readonly skippedCount: number;
  /** True iff every step was `ok`. Convenience for editor UX. */
  readonly success: boolean;
}

export interface ExecuteTransitionOptions {
  /**
   * Abort remaining steps on the first failure. Remaining steps
   * land in the report as `skipped` (with `error: null`).
   * Default: false (best-effort: continue past failures).
   */
  readonly stopOnError?: boolean;
  /**
   * Optional clock override for deterministic test assertions on
   * `durationMs`. Defaults to `Date.now`.
   */
  readonly now?: () => number;
}

/**
 * Walk the ordered steps, dispatch each to the adapter, collect
 * a structured report. Never throws; adapter errors are caught
 * and recorded.
 */
export async function executePluginRegistryTransition(
  steps: readonly TransitionStep[],
  adapter: TransitionAdapter,
  options: ExecuteTransitionOptions = {},
): Promise<TransitionExecutionReport> {
  const now = options.now ?? Date.now;
  const stopOnError = options.stopOnError === true;
  const results: TransitionStepResult[] = [];
  let aborted = false;

  for (const step of steps) {
    if (aborted) {
      results.push({ step, status: "skipped", error: null, durationMs: 0 });
      continue;
    }
    const startedAt = now();
    try {
      await dispatch(step, adapter);
      results.push({
        step,
        status: "ok",
        error: null,
        durationMs: now() - startedAt,
      });
    } catch (raw) {
      const error = raw instanceof Error ? raw : new Error(String(raw));
      results.push({
        step,
        status: "failed",
        error,
        durationMs: now() - startedAt,
      });
      if (stopOnError) aborted = true;
    }
  }

  let okCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  for (const r of results) {
    if (r.status === "ok") okCount++;
    else if (r.status === "failed") failedCount++;
    else skippedCount++;
  }

  return {
    results,
    okCount,
    failedCount,
    skippedCount,
    success: failedCount === 0 && skippedCount === 0,
  };
}

function dispatch(
  step: TransitionStep,
  adapter: TransitionAdapter,
): Promise<void> {
  switch (step.kind) {
    case "stop":
      return adapter.stop(step);
    case "restart":
      return adapter.restart(step);
    case "start":
      return adapter.start(step);
  }
}

/**
 * Helper used by editor "Transition log" panels: take a
 * completed report and return a flat per-step text summary.
 * Pure formatter; no allocation beyond the output strings.
 */
export function formatTransitionExecutionReport(
  report: TransitionExecutionReport,
): readonly string[] {
  return report.results.map((r) => {
    const head = `${statusGlyph(r.status)} ${r.step.kind} ${r.step.pluginId}`;
    if (r.status === "ok") return `${head} (${r.durationMs}ms)`;
    if (r.status === "failed") {
      return `${head} (${r.durationMs}ms): ${r.error?.message ?? "unknown error"}`;
    }
    return `${head} (skipped after prior failure)`;
  });
}

function statusGlyph(status: TransitionStepStatus): string {
  if (status === "ok") return "[ok]";
  if (status === "failed") return "[FAIL]";
  return "[skip]";
}

/**
 * Re-export — convenient for callers that want to peek at the
 * manifest a step refers to without reaching into the union.
 */
export function manifestForStep(step: TransitionStep): PluginManifest | null {
  if (step.kind === "start") return step.manifest;
  if (step.kind === "restart") return step.nextManifest;
  return null;
}
