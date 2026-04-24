/**
 * safeLoadReport — pluggable failure sink for `safeLoad*` callsites.
 *
 * The framework never throws on bad input — it returns a structured
 * `LoadFailure`. This module routes those failures to a single hook so
 * the app (or tests) can:
 *
 *   - wire a toast surface (`showErrorNotification`)
 *   - emit telemetry
 *   - log to the console in dev
 *
 * The default handler is `console.warn`. Replace it at bootstrap with
 * `setSafeLoadFailureHandler(myHandler)`; pass `null` to silence.
 *
 * Kept deliberately tiny and app-agnostic so `@hyperforge/ui-framework`
 * stays React/notifier-free.
 */

import type { LoadFailure } from "@hyperforge/ui-framework";

/** Free-form string identifying which loader surfaced the failure. */
export type SafeLoadContext =
  | "active-layout"
  | "user-layout-merge"
  | "user-input-bindings-merge"
  | (string & {});

export type SafeLoadFailureHandler = (
  context: SafeLoadContext,
  failure: LoadFailure,
) => void;

let handler: SafeLoadFailureHandler | null = (context, failure) => {
  // Default: log to the console. Intentionally not `console.error` so
  // that a recoverable fallback doesn't trip error-boundary telemetry.
  // eslint-disable-next-line no-console
  console.warn(
    `[ui-framework] safeLoad failure in ${context}: ${failure.code} — ${failure.message}`,
  );
};

/**
 * Swap the active handler. Pass `null` to disable reporting entirely
 * (useful in tests that want silent behavior).
 */
export function setSafeLoadFailureHandler(
  next: SafeLoadFailureHandler | null,
): void {
  handler = next;
}

/**
 * Report a failure through the active handler. No-op when the handler
 * is null. Never throws — a throwing handler is swallowed so a broken
 * telemetry pipe can't take down the HUD.
 */
export function reportSafeLoadFailure(
  context: SafeLoadContext,
  failure: LoadFailure,
): void {
  if (!handler) return;
  try {
    handler(context, failure);
  } catch {
    // Swallowed — reporting must not affect UI rendering.
  }
}

/**
 * Test-only: re-install the default `console.warn` handler. Kept
 * separate from `setSafeLoadFailureHandler(null)` because tests often
 * want to restore the shipped default, not the silent one.
 */
export function _resetSafeLoadFailureHandler(): void {
  handler = (context, failure) => {
    // eslint-disable-next-line no-console
    console.warn(
      `[ui-framework] safeLoad failure in ${context}: ${failure.code} — ${failure.message}`,
    );
  };
}
