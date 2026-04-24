/**
 * Safe loaders + migration helpers — U11 hardening substrate.
 *
 * Every place that reads a manifest or user-layout blob from untrusted
 * storage (server fetch, localStorage, imported pack) goes through one
 * of these helpers instead of a raw `safeParse`. They never throw and
 * never silently swallow a meaningful error — successful parses return
 * a validated value, failures return `null` plus a structured
 * `LoadFailure` on the verbose variant so callers can surface a toast
 * / telemetry event / fallback UI.
 *
 * Migration registry:
 *   - A `UserInputBindings` or `UIUserLayout` blob has a pinned
 *     `schemaVersion`. If future schema bumps break backward compat,
 *     register a `{from, to}` migration via
 *     `registerUserLayoutMigration` and the loader will walk the
 *     chain before validating against the current schema.
 *   - No migrations exist today — this is substrate. Adding one is a
 *     one-liner registration + a Zod parse per step.
 */

import {
  UIUserLayoutSchema,
  UILayoutManifestSchema,
  type UILayoutManifest,
  type UIUserLayout,
} from "./layout";
import { UserInputBindingsSchema, type UserInputBindings } from "./input";

export interface LoadFailure {
  /** Short machine-readable cause. */
  code: "malformed" | "migration-missing" | "migration-failed";
  /** Human-readable detail — safe to log or surface in a toast. */
  message: string;
}

export interface LoadResult<T> {
  value: T | null;
  failure: LoadFailure | null;
}

const CURRENT_USER_LAYOUT_VERSION = 1;
const CURRENT_USER_INPUT_BINDINGS_VERSION = 1;
type MigrationFn = (input: unknown) => unknown;
const userLayoutMigrations = new Map<string, MigrationFn>();
const userInputBindingsMigrations = new Map<string, MigrationFn>();

function migrationKey(from: number, to: number): string {
  return `${from}->${to}`;
}

/**
 * Register a migration step. Tests and future bumps call this at
 * module-init time; the loader walks the chain in order until it
 * reaches the current version.
 */
export function registerUserLayoutMigration(
  from: number,
  to: number,
  fn: MigrationFn,
): void {
  userLayoutMigrations.set(migrationKey(from, to), fn);
}

/** Test-only: clear all registered migrations. */
export function _resetUserLayoutMigrations(): void {
  userLayoutMigrations.clear();
}

/**
 * Register a migration step for `UserInputBindings`. Follows the same
 * `{from, to}` chain-walk pattern as `registerUserLayoutMigration`.
 */
export function registerUserInputBindingsMigration(
  from: number,
  to: number,
  fn: MigrationFn,
): void {
  userInputBindingsMigrations.set(migrationKey(from, to), fn);
}

/** Test-only: clear all registered input-bindings migrations. */
export function _resetUserInputBindingsMigrations(): void {
  userInputBindingsMigrations.clear();
}

/**
 * Parse + migrate a `UIUserLayout` blob. Walks `schemaVersion` from
 * whatever the blob declares up to `CURRENT_USER_LAYOUT_VERSION` using
 * the registered migrations, then validates against the current schema.
 */
export function safeLoadUserLayout(input: unknown): LoadResult<UIUserLayout> {
  if (!isPlainObject(input)) {
    return failure("malformed", "Expected a JSON object.");
  }

  // Pull schemaVersion first so we can migrate before validating.
  const declaredVersion = (input as { schemaVersion?: unknown }).schemaVersion;
  if (typeof declaredVersion !== "number") {
    return failure("malformed", "Missing or non-numeric schemaVersion.");
  }

  let current: unknown = input;
  let version = declaredVersion;
  while (version < CURRENT_USER_LAYOUT_VERSION) {
    const next = version + 1;
    const fn = userLayoutMigrations.get(migrationKey(version, next));
    if (!fn) {
      return failure(
        "migration-missing",
        `No registered migration for UIUserLayout ${version}→${next}.`,
      );
    }
    try {
      current = fn(current);
    } catch (err) {
      return failure(
        "migration-failed",
        `Migration ${version}→${next} threw: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    version = next;
  }

  const parsed = UIUserLayoutSchema.safeParse(current);
  if (!parsed.success) {
    return failure(
      "malformed",
      `UIUserLayout validation failed: ${parsed.error.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ")}`,
    );
  }
  return { value: parsed.data, failure: null };
}

/**
 * Parse a `UILayoutManifest`. Never throws; malformed input returns
 * `{ value: null, failure }`. Callers typically fall back to a known-
 * good manifest (e.g. `DEFAULT_UI_LAYOUT`) and surface a toast with
 * the failure message.
 */
export function safeLoadLayoutManifest(
  input: unknown,
): LoadResult<UILayoutManifest> {
  if (input === null || input === undefined) {
    return failure("malformed", "Manifest input was null/undefined.");
  }
  const parsed = UILayoutManifestSchema.safeParse(input);
  if (!parsed.success) {
    return failure(
      "malformed",
      `UILayoutManifest validation failed: ${parsed.error.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ")}`,
    );
  }
  return { value: parsed.data, failure: null };
}

/**
 * Parse + migrate a `UserInputBindings` blob. Mirrors
 * `safeLoadUserLayout`: null/non-object → malformed; missing or
 * non-numeric `schemaVersion` → malformed; walks migrations up to
 * `CURRENT_USER_INPUT_BINDINGS_VERSION`, then validates.
 */
export function safeLoadUserInputBindings(
  input: unknown,
): LoadResult<UserInputBindings> {
  if (!isPlainObject(input)) {
    return failure("malformed", "Expected a JSON object.");
  }

  const declaredVersion = (input as { schemaVersion?: unknown }).schemaVersion;
  if (typeof declaredVersion !== "number") {
    return failure("malformed", "Missing or non-numeric schemaVersion.");
  }

  let current: unknown = input;
  let version = declaredVersion;
  while (version < CURRENT_USER_INPUT_BINDINGS_VERSION) {
    const next = version + 1;
    const fn = userInputBindingsMigrations.get(migrationKey(version, next));
    if (!fn) {
      return failure(
        "migration-missing",
        `No registered migration for UserInputBindings ${version}→${next}.`,
      );
    }
    try {
      current = fn(current);
    } catch (err) {
      return failure(
        "migration-failed",
        `Migration ${version}→${next} threw: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    version = next;
  }

  const parsed = UserInputBindingsSchema.safeParse(current);
  if (!parsed.success) {
    return failure(
      "malformed",
      `UserInputBindings validation failed: ${parsed.error.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ")}`,
    );
  }
  return { value: parsed.data, failure: null };
}

// ----------------------------------------------------------------------
// Internals
// ----------------------------------------------------------------------

function failure<T>(code: LoadFailure["code"], message: string): LoadResult<T> {
  return { value: null, failure: { code, message } };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
