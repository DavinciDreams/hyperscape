/**
 * Pure-logic parser for plugin-management CLI commands.
 *
 * Shared by the in-game developer console, the `hyperforge plugin`
 * CLI surface, and the editor's command palette. Strings come in,
 * a typed `PluginCommand` discriminated union comes out, or a
 * structured `PluginCommandParseError` explains what went wrong.
 *
 * Grammar (whitespace-separated tokens):
 *   plugin list                          [--filter=<substring>] [--state=<state>]
 *   plugin info <pluginId>
 *   plugin enable <pluginId>
 *   plugin disable <pluginId>            [--force]
 *   plugin reload <pluginId>
 *
 * Parser never touches registries or clocks — it's a total
 * function over its input string.
 */

import type { PluginLifecycleState } from "./PluginLoader.js";

export type PluginCommand =
  | {
      readonly kind: "list";
      readonly filter?: string;
      readonly state?: PluginLifecycleState;
    }
  | { readonly kind: "info"; readonly pluginId: string }
  | { readonly kind: "enable"; readonly pluginId: string }
  | {
      readonly kind: "disable";
      readonly pluginId: string;
      readonly force: boolean;
    }
  | { readonly kind: "reload"; readonly pluginId: string };

export type PluginCommandParseErrorCode =
  | "empty-input"
  | "missing-leader"
  | "unknown-subcommand"
  | "missing-plugin-id"
  | "unexpected-argument"
  | "unknown-flag"
  | "bad-flag-value";

export class PluginCommandParseError extends Error {
  readonly code: PluginCommandParseErrorCode;
  readonly token?: string;

  constructor(
    code: PluginCommandParseErrorCode,
    message: string,
    token?: string,
  ) {
    super(message);
    this.name = "PluginCommandParseError";
    this.code = code;
    this.token = token;
  }
}

const VALID_STATES: ReadonlySet<PluginLifecycleState> =
  new Set<PluginLifecycleState>([
    "registered",
    "loaded",
    "enabled",
    "disabled",
    "failed",
  ]);

interface FlagMap {
  readonly [key: string]: string | boolean;
}

function splitArgs(rawInput: string): string[] {
  return rawInput
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

function parseFlags(tokens: readonly string[]): {
  positional: string[];
  flags: FlagMap;
} {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (const tok of tokens) {
    if (!tok.startsWith("--")) {
      positional.push(tok);
      continue;
    }
    const body = tok.slice(2);
    const eq = body.indexOf("=");
    if (eq === -1) {
      flags[body] = true;
    } else {
      flags[body.slice(0, eq)] = body.slice(eq + 1);
    }
  }
  return { positional, flags };
}

function requirePluginId(
  positional: readonly string[],
  subcommand: string,
): string {
  if (positional.length === 0) {
    throw new PluginCommandParseError(
      "missing-plugin-id",
      `"plugin ${subcommand}" requires a plugin id`,
    );
  }
  if (positional.length > 1) {
    throw new PluginCommandParseError(
      "unexpected-argument",
      `"plugin ${subcommand}" takes exactly one plugin id; got ${positional.length}`,
      positional[1],
    );
  }
  return positional[0];
}

function rejectUnknownFlags(
  flags: FlagMap,
  allowed: ReadonlySet<string>,
): void {
  for (const key of Object.keys(flags)) {
    if (!allowed.has(key)) {
      throw new PluginCommandParseError(
        "unknown-flag",
        `unknown flag "--${key}"`,
        key,
      );
    }
  }
}

export function parsePluginCommand(rawInput: string): PluginCommand {
  const tokens = splitArgs(rawInput);
  if (tokens.length === 0) {
    throw new PluginCommandParseError("empty-input", "empty command");
  }
  if (tokens[0] !== "plugin") {
    throw new PluginCommandParseError(
      "missing-leader",
      `expected leading "plugin", got "${tokens[0]}"`,
      tokens[0],
    );
  }
  const sub = tokens[1];
  if (sub === undefined) {
    throw new PluginCommandParseError(
      "unknown-subcommand",
      `missing subcommand after "plugin"`,
    );
  }
  const rest = tokens.slice(2);

  switch (sub) {
    case "list": {
      const { positional, flags } = parseFlags(rest);
      if (positional.length > 0) {
        throw new PluginCommandParseError(
          "unexpected-argument",
          `"plugin list" takes no positional arguments`,
          positional[0],
        );
      }
      rejectUnknownFlags(flags, new Set(["filter", "state"]));
      const filterRaw = flags.filter;
      const stateRaw = flags.state;
      if (filterRaw === true) {
        throw new PluginCommandParseError(
          "bad-flag-value",
          `--filter requires a value (e.g. --filter=terrain)`,
          "filter",
        );
      }
      if (stateRaw === true) {
        throw new PluginCommandParseError(
          "bad-flag-value",
          `--state requires a value`,
          "state",
        );
      }
      if (
        typeof stateRaw === "string" &&
        !VALID_STATES.has(stateRaw as PluginLifecycleState)
      ) {
        throw new PluginCommandParseError(
          "bad-flag-value",
          `--state must be one of: ${[...VALID_STATES].join(", ")}`,
          "state",
        );
      }
      return {
        kind: "list",
        filter: typeof filterRaw === "string" ? filterRaw : undefined,
        state:
          typeof stateRaw === "string"
            ? (stateRaw as PluginLifecycleState)
            : undefined,
      };
    }

    case "info": {
      const { positional, flags } = parseFlags(rest);
      rejectUnknownFlags(flags, new Set());
      return { kind: "info", pluginId: requirePluginId(positional, sub) };
    }

    case "enable": {
      const { positional, flags } = parseFlags(rest);
      rejectUnknownFlags(flags, new Set());
      return { kind: "enable", pluginId: requirePluginId(positional, sub) };
    }

    case "disable": {
      const { positional, flags } = parseFlags(rest);
      rejectUnknownFlags(flags, new Set(["force"]));
      if (flags.force !== undefined && flags.force !== true) {
        throw new PluginCommandParseError(
          "bad-flag-value",
          `--force is a boolean flag and takes no value`,
          "force",
        );
      }
      return {
        kind: "disable",
        pluginId: requirePluginId(positional, sub),
        force: flags.force === true,
      };
    }

    case "reload": {
      const { positional, flags } = parseFlags(rest);
      rejectUnknownFlags(flags, new Set());
      return { kind: "reload", pluginId: requirePluginId(positional, sub) };
    }

    default:
      throw new PluginCommandParseError(
        "unknown-subcommand",
        `unknown subcommand "${sub}" (expected list | info | enable | disable | reload)`,
        sub,
      );
  }
}
