/**
 * CommandRegistry — pluggable host-side command surface for
 * action bindings.
 *
 * Phase A2 of `PLAN_AI_AUTHORING_FOUNDATIONS.md`. The mirror of
 * `DataSourceRegistry`: where data sources project state INTO
 * widgets via `bindings`, commands carry intent OUT of widgets via
 * `actions`. Together the two close the JSON-authoring loop —
 * `tinyThirdPartyPack.test.tsx` step 6 (no JSON path for data flow
 * OUT of a widget) becomes a positive assertion once the renderer
 * wires this up.
 *
 * Typing model:
 *   - Each command has a Zod `argsSchema` so the registry can
 *     validate args at dispatch time. Validation is a hard contract
 *     — handlers receive parsed, narrowed args.
 *   - Handlers are async-by-default. The registry's `dispatch`
 *     returns the handler's resolved value so callers can chain
 *     follow-up work (toast, log, etc.).
 *   - Hosts register concrete commands at boot
 *     (`requestRespawn`, `useAbility`, `sendChatMessage`, …).
 *     Plugins can register additional commands the same way they
 *     register widgets — at `onEnable` against the host-supplied
 *     registry.
 *
 * The registry is intentionally **flat** (no namespacing). Commands
 * are coarser-grained than data sources — typically a single
 * registry holds 5–50 commands across the whole game, where data
 * sources have hundreds of dotted-path entries inside each
 * namespace. A flat key-space matches that scale.
 */

import { z } from "zod";

/**
 * A single registered command. `id` is the global identifier
 * referenced from widget action bindings as `$command.<id>`.
 */
export interface Command<TArgs = unknown, TResult = unknown> {
  /** Globally-unique command id. Conventional shape: `verb` or `domain.verb`. */
  readonly id: string;
  /**
   * Optional human-facing description for the catalog / agent
   * prompt context. Empty string is the documented "no description"
   * value — keeps the JSON-friendly contract uniform.
   */
  readonly description?: string;
  /**
   * Zod schema for the args object the handler receives. Use
   * `z.object({})` for commands that take no args.
   */
  readonly argsSchema: z.ZodType<TArgs>;
  /**
   * Async handler. Receives args already validated against
   * `argsSchema`. Resolves with whatever the host wants to surface
   * to the dispatcher.
   */
  handler(args: TArgs): Promise<TResult> | TResult;
}

/**
 * Result of a successful dispatch. `ok: false` is used for both
 * arg validation failures and handler-thrown errors so callers can
 * branch on the same shape.
 */
export type CommandDispatchResult<TResult = unknown> =
  | { readonly ok: true; readonly value: TResult }
  | {
      readonly ok: false;
      readonly error: {
        readonly kind: "unknown-command" | "invalid-args" | "handler-threw";
        readonly message: string;
        /** Original cause when available. */
        readonly cause?: unknown;
      };
    };

/**
 * Pluggable host-side command registry. Mirror of
 * `DataSourceRegistry`. Single-host-owned instance — shared
 * between the bindings runtime and plugins.
 */
export class CommandRegistry {
  private readonly commands = new Map<string, Command<unknown, unknown>>();

  /**
   * Register a command. Throws on duplicate id — deliberate, same
   * loud-over-silent rule as `DataSourceRegistry.register`.
   *
   * @returns An unregister callback. Call it on plugin teardown to
   *   remove the command without leaking.
   */
  register<TArgs, TResult>(command: Command<TArgs, TResult>): () => void {
    if (this.commands.has(command.id)) {
      throw new Error(
        `CommandRegistry: command id "${command.id}" is already registered. ` +
          `If a plugin needs to extend an existing command, the host should ` +
          `re-register a composite handler rather than double-registering.`,
      );
    }
    this.commands.set(command.id, command as Command<unknown, unknown>);
    return () => {
      this.commands.delete(command.id);
    };
  }

  /** Look up a command by id. */
  get(id: string): Command<unknown, unknown> | undefined {
    return this.commands.get(id);
  }

  /** Whether a command with the given id is registered. */
  has(id: string): boolean {
    return this.commands.has(id);
  }

  /** List registered command ids in registration order. */
  keys(): string[] {
    return Array.from(this.commands.keys());
  }

  /** Number of registered commands. */
  get size(): number {
    return this.commands.size;
  }

  /**
   * Validate args against the command's `argsSchema`, then await
   * the handler. Errors are returned as discriminated results
   * rather than thrown so action-binding callers (which can't
   * trivially propagate exceptions through a click handler) have
   * a single branch to handle.
   */
  async dispatch(
    id: string,
    rawArgs: unknown,
  ): Promise<CommandDispatchResult<unknown>> {
    const command = this.commands.get(id);
    if (!command) {
      return {
        ok: false,
        error: {
          kind: "unknown-command",
          message: `CommandRegistry: no command registered for id "${id}"`,
        },
      };
    }
    const parsed = command.argsSchema.safeParse(rawArgs);
    if (!parsed.success) {
      return {
        ok: false,
        error: {
          kind: "invalid-args",
          message:
            `CommandRegistry: args for "${id}" failed validation: ` +
            parsed.error.issues
              .map((i) => `${i.path.join(".") || "(root)"} ${i.message}`)
              .join("; "),
          cause: parsed.error,
        },
      };
    }
    try {
      const value = await command.handler(parsed.data);
      return { ok: true, value };
    } catch (err) {
      return {
        ok: false,
        error: {
          kind: "handler-threw",
          message:
            err instanceof Error
              ? `CommandRegistry: handler for "${id}" threw: ${err.message}`
              : `CommandRegistry: handler for "${id}" threw a non-Error value`,
          cause: err,
        },
      };
    }
  }

  /**
   * Remove every registered command. Mainly useful in test setup
   * to isolate cases.
   */
  clear(): void {
    this.commands.clear();
  }
}
