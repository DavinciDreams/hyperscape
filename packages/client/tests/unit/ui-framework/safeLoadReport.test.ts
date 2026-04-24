/**
 * safeLoadReport — pluggable failure sink.
 *
 * Verifies swap/silence/reset semantics and that a throwing handler
 * doesn't bubble back out (failures in the reporting pipe must never
 * break rendering).
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  _resetSafeLoadFailureHandler,
  reportSafeLoadFailure,
  setSafeLoadFailureHandler,
} from "../../../src/ui-framework/safeLoadReport";

const sampleFailure = {
  code: "malformed" as const,
  message: "Expected object.",
};

afterEach(() => {
  _resetSafeLoadFailureHandler();
});

describe("safeLoadReport", () => {
  it("invokes the installed handler with context + failure", () => {
    const spy = vi.fn();
    setSafeLoadFailureHandler(spy);
    reportSafeLoadFailure("active-layout", sampleFailure);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith("active-layout", sampleFailure);
  });

  it("silences reporting when handler is set to null", () => {
    setSafeLoadFailureHandler(null);
    // Should not throw and not reach any console.warn spy either.
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    reportSafeLoadFailure("active-layout", sampleFailure);
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("swallows exceptions thrown by the handler", () => {
    setSafeLoadFailureHandler(() => {
      throw new Error("telemetry down");
    });
    expect(() =>
      reportSafeLoadFailure("active-layout", sampleFailure),
    ).not.toThrow();
  });

  it("_resetSafeLoadFailureHandler re-installs the console.warn default", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    setSafeLoadFailureHandler(null);
    _resetSafeLoadFailureHandler();
    reportSafeLoadFailure("user-layout-merge", sampleFailure);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const msg = String(warnSpy.mock.calls[0]?.[0] ?? "");
    expect(msg).toContain("user-layout-merge");
    expect(msg).toContain("malformed");
    warnSpy.mockRestore();
  });
});
