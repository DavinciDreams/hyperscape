/**
 * End-to-end plugin command runner.
 *
 * Ties the CLI pipeline into a single call for the editor's
 * command palette, the in-game dev console, and the eventual
 * `hyperforge plugin …` CLI:
 *
 *   parsePluginCommand → resolvePluginCommand → executePluginCommand
 *                                                     ↓
 *                                          journal.record() if provided
 *
 * A parse error returns `{kind:"parse-error", error}` rather than
 * throwing, so REPL loops can print a red token-caret without
 * try/catch. Resolver/executor outcomes pass through unchanged.
 *
 * When a `PluginLifecycleJournal` + `now` clock is supplied, every
 * `applied`/`failed` mutation is recorded as a lifecycle event
 * (noop results are NOT recorded — nothing changed). Read outcomes
 * are never journaled.
 */

import type { PluginLifecycleJournal } from "./PluginLifecycleJournal.js";
import type { PluginBrowserRow } from "./PluginBrowserSnapshot.js";
import type { DisableImpactEntry } from "./PluginDependencyGraph.js";
import type { ExecutionResult } from "./PluginCommandExecutor.js";
import { executePluginCommand } from "./PluginCommandExecutor.js";
import type { PluginHost, PluginContextBase } from "./PluginHost.js";
import type { LifecyclePhase } from "./PluginLoader.js";
import {
  parsePluginCommand,
  PluginCommandParseError,
} from "./PluginCommandParser.js";
import { resolvePluginCommand } from "./PluginCommandResolver.js";

export type RunnerResult =
  | { readonly kind: "parse-error"; readonly error: PluginCommandParseError }
  | { readonly kind: "executed"; readonly result: ExecutionResult };

export interface RunPluginCommandLineOptions<
  TContext extends PluginContextBase,
> {
  readonly host: PluginHost<TContext>;
  readonly rows: readonly PluginBrowserRow[];
  readonly computeDisableImpact?: (
    pluginId: string,
  ) => readonly DisableImpactEntry[];
  readonly journal?: PluginLifecycleJournal;
  /**
   * Clock supplied by the caller — keeps the runner deterministic
   * for tests / replay. Required only when `journal` is set.
   */
  readonly now?: () => number;
}

export async function runPluginCommandLine<TContext extends PluginContextBase>(
  line: string,
  options: RunPluginCommandLineOptions<TContext>,
): Promise<RunnerResult> {
  let command;
  try {
    command = parsePluginCommand(line);
  } catch (e) {
    if (e instanceof PluginCommandParseError) {
      return { kind: "parse-error", error: e };
    }
    throw e;
  }

  const outcome = resolvePluginCommand(command, {
    rows: options.rows,
    computeDisableImpact: options.computeDisableImpact,
  });
  const result = await executePluginCommand(outcome, options.host);

  if (options.journal) {
    recordResult(options.journal, result, options.now);
  }

  return { kind: "executed", result };
}

/**
 * Translate an `ExecutionResult` into a `PluginLifecycleJournal`
 * entry. Applied/failed mutations are recorded; noop and read
 * results are skipped. Exposed separately so callers that want to
 * journal from their own execution site (e.g. bulk lifecycle) can
 * reuse the mapping.
 */
export function journalPluginExecutionResult(
  journal: PluginLifecycleJournal,
  result: ExecutionResult,
  now?: () => number,
): void {
  if (result.kind !== "applied" && result.kind !== "failed") return;
  const at = now ? now() : Date.now();
  const phase = mutationToPhase(result.mutation);
  if (result.kind === "applied") {
    journal.record({
      at,
      pluginId: result.pluginId,
      phase,
      outcome: "success",
    });
  } else {
    journal.record({
      at,
      pluginId: result.pluginId,
      phase,
      outcome: "failed",
      errorMessage: result.error.message,
    });
  }
}

function recordResult(
  journal: PluginLifecycleJournal,
  result: ExecutionResult,
  now: (() => number) | undefined,
): void {
  journalPluginExecutionResult(journal, result, now);
}

function mutationToPhase(
  mutation: "enable" | "disable" | "reload",
): LifecyclePhase {
  // Reload ends in an enable on success; for journaling we tag it
  // as `enable` so Browser timelines show the end-state phase.
  if (mutation === "reload") return "enable";
  return mutation;
}
