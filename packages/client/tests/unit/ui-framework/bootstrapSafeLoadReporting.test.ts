/**
 * bootstrapSafeLoadReporting — wires `safeLoadReport` to the shared
 * notification store. These tests verify:
 *
 *   - bootstrap installs a handler that pushes a `warning` toast
 *   - the context tag is humanized in the user-visible message
 *   - bootstrap is idempotent — second call is a no-op
 *   - `_resetSafeLoadReportingBootstrap()` clears the latch
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  _resetSafeLoadReportingBootstrap,
  bootstrapSafeLoadReporting,
} from "../../../src/ui-framework/bootstrapSafeLoadReporting";
import {
  _resetSafeLoadFailureHandler,
  reportSafeLoadFailure,
} from "../../../src/ui-framework/safeLoadReport";
import { useNotificationStore } from "../../../src/ui/stores/notificationStore";

beforeEach(() => {
  useNotificationStore.getState().dismissAll();
});

afterEach(() => {
  _resetSafeLoadReportingBootstrap();
  _resetSafeLoadFailureHandler();
  useNotificationStore.getState().dismissAll();
});

describe("bootstrapSafeLoadReporting", () => {
  it("returns true on first call and false on subsequent calls", () => {
    expect(bootstrapSafeLoadReporting()).toBe(true);
    expect(bootstrapSafeLoadReporting()).toBe(false);
  });

  it("pushes a warning notification when a safeLoad failure is reported", () => {
    bootstrapSafeLoadReporting();
    reportSafeLoadFailure("active-layout", {
      code: "malformed",
      message: "bad json",
    });
    const list = useNotificationStore.getState().notifications;
    expect(list).toHaveLength(1);
    expect(list[0]?.type).toBe("warning");
    expect(list[0]?.message).toContain("Active UI layout");
  });

  it("humanizes known contexts", () => {
    bootstrapSafeLoadReporting();
    reportSafeLoadFailure("user-layout-merge", {
      code: "malformed",
      message: "x",
    });
    reportSafeLoadFailure("user-input-bindings-merge", {
      code: "malformed",
      message: "y",
    });
    const list = useNotificationStore.getState().notifications;
    const messages = list.map((n) => n.message);
    expect(messages).toHaveLength(2);
    expect(messages.some((m) => m.includes("Saved UI overrides"))).toBe(true);
    expect(messages.some((m) => m.includes("Saved key bindings"))).toBe(true);
  });

  it("falls through to the raw context string for unknown tags", () => {
    bootstrapSafeLoadReporting();
    reportSafeLoadFailure("something-else", {
      code: "malformed",
      message: "z",
    });
    const list = useNotificationStore.getState().notifications;
    expect(list[0]?.message).toContain("something-else");
  });

  it("_resetSafeLoadReportingBootstrap clears the latch so next call installs fresh", () => {
    bootstrapSafeLoadReporting();
    _resetSafeLoadReportingBootstrap();
    expect(bootstrapSafeLoadReporting()).toBe(true);
  });
});
