/**
 * Minimal argv parser. Hand-rolled to avoid pulling yargs/commander.
 *
 * Conventions:
 *   - Positional args are everything that doesn't start with `-`.
 *   - `--flag` toggles a boolean flag to true.
 *   - `--key=value` and `--key value` both set a string value.
 *   - `--no-flag` sets `flag` to false.
 *   - `--` ends parsing; everything after is treated as positional.
 *   - Repeating the same flag wins last; we don't support arrays
 *     because no command needs them yet.
 *
 * Returns a `ParsedArgs` shape that's a flat record of values plus a
 * `positional` array. Callers do their own type coercion.
 */

export interface ParsedArgs {
  /** Positional args, in order. */
  readonly positional: ReadonlyArray<string>;
  /**
   * Flag values. `true` for `--flag`, `false` for `--no-flag`,
   * a string for `--key=value` / `--key value`. Use the helpers
   * below to coerce.
   */
  readonly flags: Readonly<Record<string, string | boolean>>;
}

export function parseArgs(argv: ReadonlyArray<string>): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  let stopFlags = false;

  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i]!;
    if (stopFlags) {
      positional.push(tok);
      continue;
    }
    if (tok === "--") {
      stopFlags = true;
      continue;
    }
    if (tok.startsWith("--")) {
      const eq = tok.indexOf("=");
      if (eq >= 0) {
        const key = tok.slice(2, eq);
        const value = tok.slice(eq + 1);
        flags[normalize(key)] = value;
        continue;
      }
      const key = tok.slice(2);
      if (key.startsWith("no-")) {
        flags[normalize(key.slice(3))] = false;
        continue;
      }
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("-")) {
        flags[normalize(key)] = next;
        i++;
      } else {
        flags[normalize(key)] = true;
      }
      continue;
    }
    positional.push(tok);
  }

  return { positional, flags };
}

function normalize(key: string): string {
  // `--my-flag` and `--myFlag` resolve to the same key.
  return key.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase());
}

/**
 * Coerce a flag to a string. Returns `undefined` if absent or set
 * to a boolean.
 */
export function stringFlag(args: ParsedArgs, name: string): string | undefined {
  const v = args.flags[name];
  return typeof v === "string" ? v : undefined;
}

/**
 * Coerce a flag to a boolean. Returns `defaultValue` if absent. A
 * string flag value is truthy iff it's a non-empty string other
 * than "false"/"0".
 */
export function boolFlag(
  args: ParsedArgs,
  name: string,
  defaultValue = false,
): boolean {
  const v = args.flags[name];
  if (v === undefined) return defaultValue;
  if (typeof v === "boolean") return v;
  if (v === "" || v === "false" || v === "0") return false;
  return true;
}
