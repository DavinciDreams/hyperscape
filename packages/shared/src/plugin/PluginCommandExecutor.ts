/**
 * Pure-logic executor that consumes a `Pending*` `PluginCommandOutcome`
 * and dispatches it against a `PluginHost`. Read-only outcomes
 * (`list`, `info`, `unknown-plugin-id`) are passed through unchanged.
 *
 * This is the final stage of the CLI / dev-console / editor pipeline:
 *
 *   parsePluginCommand → resolvePluginCommand → executePluginCommand
 *     ^— pure                  ^— pure               ^— touches host
 *
 * The executor deliberately keeps the outcome type system intact —
 * it returns an `ExecutionResult` that tags each mutation with
 * whether the call was attempted, skipped (noop), or raised, so
 * telemetry / journals / UI toasts can react without parsing
 * free-form exceptions.
 */

import type { PluginHost, PluginContextBase } from "./PluginHost.js";
import type {
  PendingDisableOutcome,
  PendingEnableOutcome,
  PendingReloadOutcome,
  PluginCommandOutcome,
} from "./PluginCommandResolver.js";

export type ReadOutcomeKind = "list" | "info" | "unknown-plugin-id";

export type MutationKind = "enable" | "disable" | "reload";

export type ExecutionResult =
  | {
      readonly kind: "read";
      readonly outcome: Extract<
        PluginCommandOutcome,
        { kind: ReadOutcomeKind }
      >;
    }
  | {
      readonly kind: "noop";
      readonly pluginId: string;
      readonly mutation: MutationKind;
      readonly reason: string;
    }
  | {
      readonly kind: "applied";
      readonly pluginId: string;
      readonly mutation: MutationKind;
    }
  | {
      readonly kind: "failed";
      readonly pluginId: string;
      readonly mutation: MutationKind;
      readonly error: Error;
    };

/**
 * Dispatch a resolved `PluginCommandOutcome` against a host.
 *
 * Never throws: lifecycle errors are captured into a `failed`
 * result. This keeps call sites (CLI loop / editor toast pipeline /
 * journal writer) free of try/catch boilerplate.
 *
 * `noop` results pass through the resolver's pre-computed flag
 * WITHOUT hitting the host (the host would also no-op, but skipping
 * the round-trip keeps logs quiet).
 */
export async function executePluginCommand<TContext extends PluginContextBase>(
  outcome: PluginCommandOutcome,
  host: PluginHost<TContext>,
): Promise<ExecutionResult> {
  switch (outcome.kind) {
    case "list":
    case "info":
    case "unknown-plugin-id":
      return { kind: "read", outcome };

    case "pending-enable":
      return runEnable(outcome, host);

    case "pending-disable":
      return runDisable(outcome, host);

    case "pending-reload":
      return runReload(outcome, host);
  }
}

async function runEnable<TContext extends PluginContextBase>(
  outcome: PendingEnableOutcome,
  host: PluginHost<TContext>,
): Promise<ExecutionResult> {
  if (outcome.noop) {
    return {
      kind: "noop",
      pluginId: outcome.pluginId,
      mutation: "enable",
      reason: "already-enabled",
    };
  }
  try {
    await host.enablePlugin(outcome.pluginId);
    return { kind: "applied", pluginId: outcome.pluginId, mutation: "enable" };
  } catch (e) {
    return {
      kind: "failed",
      pluginId: outcome.pluginId,
      mutation: "enable",
      error: e instanceof Error ? e : new Error(String(e)),
    };
  }
}

async function runDisable<TContext extends PluginContextBase>(
  outcome: PendingDisableOutcome,
  host: PluginHost<TContext>,
): Promise<ExecutionResult> {
  if (outcome.noop) {
    return {
      kind: "noop",
      pluginId: outcome.pluginId,
      mutation: "disable",
      reason: `already-${outcome.currentState}`,
    };
  }
  try {
    await host.disablePlugin(outcome.pluginId, { force: outcome.force });
    return { kind: "applied", pluginId: outcome.pluginId, mutation: "disable" };
  } catch (e) {
    return {
      kind: "failed",
      pluginId: outcome.pluginId,
      mutation: "disable",
      error: e instanceof Error ? e : new Error(String(e)),
    };
  }
}

async function runReload<TContext extends PluginContextBase>(
  outcome: PendingReloadOutcome,
  host: PluginHost<TContext>,
): Promise<ExecutionResult> {
  try {
    await host.reloadPlugin(outcome.pluginId);
    return { kind: "applied", pluginId: outcome.pluginId, mutation: "reload" };
  } catch (e) {
    return {
      kind: "failed",
      pluginId: outcome.pluginId,
      mutation: "reload",
      error: e instanceof Error ? e : new Error(String(e)),
    };
  }
}
