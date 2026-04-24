/**
 * Pure-logic resolver that turns a parsed `PluginCommand` into
 * either:
 *   - a rendered read-only result (for `list` / `info`), or
 *   - a `PendingPluginMutation` marker the runtime caller must
 *     execute against the live `PluginHost`.
 *
 * Read operations resolve entirely against a `PluginBrowserRow[]`
 * snapshot — no host, no clock. Mutation operations return a
 * descriptor so the caller can show a confirm dialog (populated
 * with `disableImpact` for disables) before touching the host.
 *
 * Keeping resolution separate from execution makes the console
 * loop testable as pure logic: parse → resolve → dispatch, with
 * only the final dispatch hitting real runtime state.
 */

import type { DisableImpactEntry } from "./PluginDependencyGraph.js";
import type { PluginBrowserRow } from "./PluginBrowserSnapshot.js";
import {
  searchPluginBrowser,
  type ScoredPluginBrowserRow,
} from "./PluginBrowserSearch.js";
import type { PluginCommand } from "./PluginCommandParser.js";

export type UnknownPluginIdOutcome = {
  readonly kind: "unknown-plugin-id";
  readonly pluginId: string;
};

export type ListOutcome = {
  readonly kind: "list";
  readonly rows: readonly ScoredPluginBrowserRow[];
};

export type InfoOutcome = {
  readonly kind: "info";
  readonly row: PluginBrowserRow;
};

export type PendingEnableOutcome = {
  readonly kind: "pending-enable";
  readonly pluginId: string;
  readonly currentState: PluginBrowserRow["state"];
  readonly noop: boolean;
};

export type PendingDisableOutcome = {
  readonly kind: "pending-disable";
  readonly pluginId: string;
  readonly force: boolean;
  readonly currentState: PluginBrowserRow["state"];
  readonly impact: readonly DisableImpactEntry[];
  readonly noop: boolean;
};

export type PendingReloadOutcome = {
  readonly kind: "pending-reload";
  readonly pluginId: string;
  readonly currentState: PluginBrowserRow["state"];
};

export type PluginCommandOutcome =
  | ListOutcome
  | InfoOutcome
  | PendingEnableOutcome
  | PendingDisableOutcome
  | PendingReloadOutcome
  | UnknownPluginIdOutcome;

export interface ResolveContext {
  readonly rows: readonly PluginBrowserRow[];
  /**
   * Optional impact-lookup. The resolver only *requests* impact
   * for disables — if omitted, the outcome carries `impact: []`
   * and the caller must compute it itself if needed.
   */
  readonly computeDisableImpact?: (
    pluginId: string,
  ) => readonly DisableImpactEntry[];
}

function findRow(
  rows: readonly PluginBrowserRow[],
  pluginId: string,
): PluginBrowserRow | undefined {
  return rows.find((r) => r.id === pluginId);
}

export function resolvePluginCommand(
  command: PluginCommand,
  ctx: ResolveContext,
): PluginCommandOutcome {
  switch (command.kind) {
    case "list": {
      const scored = searchPluginBrowser(ctx.rows, {
        query: command.filter,
        states: command.state ? [command.state] : undefined,
      });
      return { kind: "list", rows: scored };
    }

    case "info": {
      const row = findRow(ctx.rows, command.pluginId);
      if (!row)
        return { kind: "unknown-plugin-id", pluginId: command.pluginId };
      return { kind: "info", row };
    }

    case "enable": {
      const row = findRow(ctx.rows, command.pluginId);
      if (!row)
        return { kind: "unknown-plugin-id", pluginId: command.pluginId };
      return {
        kind: "pending-enable",
        pluginId: command.pluginId,
        currentState: row.state,
        noop: row.state === "enabled",
      };
    }

    case "disable": {
      const row = findRow(ctx.rows, command.pluginId);
      if (!row)
        return { kind: "unknown-plugin-id", pluginId: command.pluginId };
      const impact = ctx.computeDisableImpact
        ? ctx.computeDisableImpact(command.pluginId)
        : [];
      const alreadyOff =
        row.state === "disabled" ||
        row.state === "registered" ||
        row.state === "failed";
      return {
        kind: "pending-disable",
        pluginId: command.pluginId,
        force: command.force,
        currentState: row.state,
        impact,
        noop: alreadyOff,
      };
    }

    case "reload": {
      const row = findRow(ctx.rows, command.pluginId);
      if (!row)
        return { kind: "unknown-plugin-id", pluginId: command.pluginId };
      return {
        kind: "pending-reload",
        pluginId: command.pluginId,
        currentState: row.state,
      };
    }
  }
}
