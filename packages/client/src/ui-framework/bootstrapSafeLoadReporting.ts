/**
 * bootstrapSafeLoadReporting — wire `safeLoadReport` to the shared
 * notification store at app startup.
 *
 * The `@hyperforge/ui-framework` core stays app-agnostic. This shim
 * lives in the client bundle so it can reach across to the
 * notification store without introducing a cross-package dependency.
 *
 * Call `bootstrapSafeLoadReporting()` exactly once during app init.
 * Subsequent calls are safe no-ops.
 */

import { useNotificationStore } from "../ui/stores/notificationStore";
import {
  setSafeLoadFailureHandler,
  type SafeLoadContext,
  type SafeLoadFailureHandler,
} from "./safeLoadReport";

let bootstrapped = false;

function humanizeContext(ctx: SafeLoadContext): string {
  switch (ctx) {
    case "active-layout":
      return "Active UI layout";
    case "user-layout-merge":
      return "Saved UI overrides";
    case "user-input-bindings-merge":
      return "Saved key bindings";
    default:
      return ctx;
  }
}

const notificationHandler: SafeLoadFailureHandler = (context, failure) => {
  // Still emit a dev log so `console` consumers and CI capture remain
  // informative — the notification store is a user-facing surface.
  // eslint-disable-next-line no-console
  console.warn(
    `[ui-framework] safeLoad failure in ${context}: ${failure.code} — ${failure.message}`,
  );
  const { showWarning } = useNotificationStore.getState();
  showWarning(
    `${humanizeContext(context)} contained invalid data and was reset to defaults.`,
    "UI state reset",
  );
};

/**
 * Install the notification-store handler. Returns `true` on the first
 * call and `false` thereafter so the caller can warn in dev if it ends
 * up wired twice by accident.
 */
export function bootstrapSafeLoadReporting(): boolean {
  if (bootstrapped) return false;
  bootstrapped = true;
  setSafeLoadFailureHandler(notificationHandler);
  return true;
}

/**
 * Test-only: clear the bootstrap guard and reinstall the default
 * `console.warn` sink. Mirrors `_resetSafeLoadFailureHandler` but also
 * clears the "already bootstrapped" latch.
 */
export function _resetSafeLoadReportingBootstrap(): void {
  bootstrapped = false;
}
