/**
 * bindings.ts — runtime binding expressions for widget props.
 *
 * A `WidgetInstance` can declare `bindings: Record<propKey, expr>`
 * alongside its static `props`. At render time, every bound key is
 * resolved against a `DataContext` and merged on top of the static
 * props; the widget component sees a single, fully-typed props
 * object that validates against its `propsSchema`.
 *
 * The expression language is intentionally minimal — just enough to
 * cover the HUD use cases without introducing eval(), arithmetic, or
 * function calls:
 *
 *   $namespace.path.deeper    — dotted property access
 *   $namespace.list[0]        — non-negative integer array index
 *   $namespace.list[0].name   — mixed chains
 *
 * Every expression starts with `$<ident>` naming a top-level
 * namespace in the DataContext (e.g. `$player`, `$inventory`).
 * Parsing is regex-driven and deterministic; unknown paths resolve
 * to `undefined` so the consumer can decide whether that's an error
 * for a given widget.
 */

import { z } from "zod";

// ── Expression grammar ───────────────────────────────────────────

const IDENT_RE = /[a-zA-Z_][a-zA-Z0-9_]*/;
const STEP_RE = /^(?:\.([a-zA-Z_][a-zA-Z0-9_]*)|\[(\d+)\])/;
const EXPR_RE = new RegExp(
  `^\\$(${IDENT_RE.source})((?:\\.${IDENT_RE.source}|\\[\\d+\\])*)$`,
);

export type BindingStep =
  | { kind: "prop"; key: string }
  | { kind: "index"; index: number };

export interface ParsedBinding {
  namespace: string;
  steps: BindingStep[];
}

export class BindingParseError extends Error {
  constructor(
    public readonly expression: string,
    message: string,
  ) {
    super(`Invalid binding expression "${expression}": ${message}`);
    this.name = "BindingParseError";
  }
}

/**
 * Parse a binding expression into its namespace + step chain.
 * Throws `BindingParseError` on malformed input.
 */
export function parseBindingExpression(expression: string): ParsedBinding {
  const match = EXPR_RE.exec(expression);
  if (!match) {
    throw new BindingParseError(
      expression,
      'must match /^\\$<ident>(?:\\.<ident>|\\[\\d+\\])*$/ (e.g. "$player.hp", "$inventory.items[0].name")',
    );
  }

  const namespace = match[1];
  const rest = match[2];
  const steps: BindingStep[] = [];
  let cursor = 0;
  while (cursor < rest.length) {
    const stepMatch = STEP_RE.exec(rest.slice(cursor));
    if (!stepMatch) {
      throw new BindingParseError(
        expression,
        `failed to tokenize tail "${rest.slice(cursor)}"`,
      );
    }
    if (stepMatch[1] !== undefined) {
      steps.push({ kind: "prop", key: stepMatch[1] });
    } else if (stepMatch[2] !== undefined) {
      steps.push({ kind: "index", index: Number.parseInt(stepMatch[2], 10) });
    }
    cursor += stepMatch[0].length;
  }

  return { namespace, steps };
}

/** Zod schema: a string that parses cleanly as a binding expression. */
export const BindingExpressionSchema = z.string().refine(
  (v) => {
    try {
      parseBindingExpression(v);
      return true;
    } catch {
      return false;
    }
  },
  { message: "Not a valid binding expression (expected $namespace.path[0])" },
);

// ── Evaluation ──────────────────────────────────────────────────

/**
 * A DataContext is a flat map from namespace-ident to arbitrary
 * data. Each namespace is walked independently; namespaces unknown
 * to the context are treated as `undefined`.
 *
 * Example:
 *   { player: { hp: 7, maxHp: 10 }, inventory: { items: [...] } }
 */
export type DataContext = Record<string, unknown>;

/**
 * Resolve a parsed binding against a DataContext. Returns
 * `undefined` at the first missing step rather than throwing — the
 * caller decides whether a missing resolution is a hard failure.
 */
export function evaluateParsedBinding(
  parsed: ParsedBinding,
  context: DataContext,
): unknown {
  let current: unknown = context[parsed.namespace];
  for (const step of parsed.steps) {
    if (current === null || current === undefined) return undefined;
    if (step.kind === "prop") {
      if (typeof current !== "object") return undefined;
      current = (current as Record<string, unknown>)[step.key];
    } else {
      if (!Array.isArray(current)) return undefined;
      current = current[step.index];
    }
  }
  return current;
}

/** Convenience: parse + evaluate in one call. */
export function evaluateBinding(
  expression: string,
  context: DataContext,
): unknown {
  return evaluateParsedBinding(parseBindingExpression(expression), context);
}

// ── Prop resolution ─────────────────────────────────────────────

export interface PropResolutionIssue {
  code: "invalid-expression" | "binding-failed" | "props-validation-failed";
  key?: string;
  message: string;
}

export type PropResolutionResult<P> =
  | { ok: true; props: P; issues: PropResolutionIssue[] }
  | { ok: false; issues: PropResolutionIssue[] };

/**
 * Resolve a widget instance's full props object, merging bound
 * values on top of static `props` and validating the result against
 * the widget's `propsSchema`.
 *
 * - Bindings that parse cleanly but resolve to `undefined` are
 *   emitted as `binding-failed` issues — the static fallback (if
 *   any) is still used, which often lets the widget render with a
 *   sensible default.
 * - Static + bound props combined must still pass Zod validation.
 *
 * Never throws; returns a tagged result instead.
 */
export function resolveWidgetProps<P>(
  staticProps: Record<string, unknown>,
  bindings: Record<string, string> | undefined,
  propsSchema: z.ZodType<P>,
  context: DataContext,
): PropResolutionResult<P> {
  const issues: PropResolutionIssue[] = [];
  const merged: Record<string, unknown> = { ...staticProps };

  if (bindings) {
    for (const [key, expression] of Object.entries(bindings)) {
      let parsed: ParsedBinding;
      try {
        parsed = parseBindingExpression(expression);
      } catch (err) {
        issues.push({
          code: "invalid-expression",
          key,
          message: err instanceof Error ? err.message : String(err),
        });
        continue;
      }
      const value = evaluateParsedBinding(parsed, context);
      if (value === undefined) {
        issues.push({
          code: "binding-failed",
          key,
          message: `Expression "${expression}" resolved to undefined in the given context`,
        });
        // Leave static fallback in place (if any).
        continue;
      }
      merged[key] = value;
    }
  }

  const parsedProps = propsSchema.safeParse(merged);
  if (!parsedProps.success) {
    for (const issue of parsedProps.error.issues) {
      issues.push({
        code: "props-validation-failed",
        key: issue.path.map((p) => String(p)).join("."),
        message: issue.message,
      });
    }
    return { ok: false, issues };
  }

  // Props validated. `issues` may contain non-fatal warnings
  // (binding-failed entries that were patched over by static
  // fallbacks in `merged`). Caller inspects the array to surface
  // them to the editor or logger.
  return { ok: true, props: parsedProps.data, issues };
}

// ── Command bindings (Phase A2) ─────────────────────────────────
//
// Action bindings flow data OUT of widgets via `$command.<id>`
// expressions. Author syntax is intentionally narrower than
// data-bindings: a command binding has no path tail. Args come
// from whatever value the widget callback was invoked with —
// the renderer (Phase A2.3) wraps the dispatch in a callback
// shaped to the widget's `*RuntimeProps` callback signature.

const COMMAND_EXPR_RE = new RegExp(
  `^\\$command\\.(${IDENT_RE.source}(?:[.-]${IDENT_RE.source})*)$`,
);

/** Parsed command binding — just the command id, no path tail. */
export interface ParsedCommandBinding {
  /** The command id to dispatch (matches `Command.id`). */
  readonly commandId: string;
}

/**
 * Parse a command binding expression. Throws `BindingParseError` on
 * malformed input.
 *
 *   "$command.useAbility"          → { commandId: "useAbility" }
 *   "$command.requestRespawn"      → { commandId: "requestRespawn" }
 *   "$command.npc.dialogue.next"   → { commandId: "npc.dialogue.next" }
 *
 * Convention: command ids are flat in the registry but author
 * syntax allows dotted/dashed segments so plugins can namespace
 * (`shooter.weapons.fire`) without colliding.
 */
export function parseCommandBinding(expression: string): ParsedCommandBinding {
  const match = COMMAND_EXPR_RE.exec(expression);
  if (!match) {
    throw new BindingParseError(
      expression,
      "must match /^\\$command\\.<id>$/ where <id> is an identifier " +
        '(dotted/dashed segments allowed). Examples: "$command.useAbility", ' +
        '"$command.npc.dialogue.next"',
    );
  }
  return { commandId: match[1] };
}

/** Zod schema: a string that parses cleanly as a command binding. */
export const CommandBindingExpressionSchema = z.string().refine(
  (v) => {
    try {
      parseCommandBinding(v);
      return true;
    } catch {
      return false;
    }
  },
  {
    message:
      'Not a valid command binding (expected "$command.<id>" — see parseCommandBinding)',
  },
);

/**
 * Layout-author shape for the `actions` field on a widget instance.
 * Maps callback prop names (`onClick`, `onConfirm`, `onCancel`, …)
 * to command bindings.
 *
 * Today the only supported binding form is the shorthand string
 * `"$command.<id>"`. A future cut may extend this to an object form
 * with author-supplied static args + per-arg binding expressions
 * (e.g. `{ command: "useAbility", args: { slot: "$widget.slotIndex" } }`).
 */
export const CommandBindingSchema = CommandBindingExpressionSchema;

export type CommandBindingExpression = z.infer<
  typeof CommandBindingExpressionSchema
>;
