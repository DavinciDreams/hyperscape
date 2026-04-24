import { describe, expect, it } from "vitest";
import { summarizePluginBrowserHeader } from "../PluginBrowserHeaderSummary.js";
import type { PluginBrowserRowSummary } from "../PluginBrowserRowSummary.js";

function row(
  pluginId: string,
  severity: PluginBrowserRowSummary["severity"],
): PluginBrowserRowSummary {
  return {
    pluginId,
    severity,
    label: severity,
    reasons: [],
    health: null,
    stability: null,
  };
}

function rows(...args: Array<[string, PluginBrowserRowSummary["severity"]]>) {
  return new Map(args.map(([id, sev]) => [id, row(id, sev)]));
}

describe("summarizePluginBrowserHeader — counts", () => {
  it("returns zero counts on empty input", () => {
    const out = summarizePluginBrowserHeader(new Map());
    expect(out.counts).toEqual({
      total: 0,
      ok: 0,
      info: 0,
      warning: 0,
      error: 0,
    });
    expect(out.worstSeverity).toBe("ok");
    expect(out.headline).toBe("0 plugins");
  });

  it("counts each severity bucket independently", () => {
    const out = summarizePluginBrowserHeader(
      rows(
        ["a", "ok"],
        ["b", "ok"],
        ["c", "info"],
        ["d", "warning"],
        ["e", "warning"],
        ["f", "error"],
      ),
    );
    expect(out.counts).toEqual({
      total: 6,
      ok: 2,
      info: 1,
      warning: 2,
      error: 1,
    });
  });
});

describe("summarizePluginBrowserHeader — worstSeverity", () => {
  it("escalates to error when any row is error", () => {
    const out = summarizePluginBrowserHeader(
      rows(["a", "ok"], ["b", "warning"], ["c", "error"]),
    );
    expect(out.worstSeverity).toBe("error");
  });

  it("uses warning when no errors but some warnings", () => {
    const out = summarizePluginBrowserHeader(
      rows(["a", "ok"], ["b", "info"], ["c", "warning"]),
    );
    expect(out.worstSeverity).toBe("warning");
  });

  it("uses info when only ok+info rows present", () => {
    const out = summarizePluginBrowserHeader(rows(["a", "ok"], ["b", "info"]));
    expect(out.worstSeverity).toBe("info");
  });

  it("uses ok when all rows are ok", () => {
    const out = summarizePluginBrowserHeader(rows(["a", "ok"], ["b", "ok"]));
    expect(out.worstSeverity).toBe("ok");
  });
});

describe("summarizePluginBrowserHeader — headline", () => {
  it("singular plugin label when total is 1", () => {
    const out = summarizePluginBrowserHeader(rows(["a", "ok"]));
    expect(out.headline).toBe("1 plugin");
  });

  it("plural plugin label when total > 1", () => {
    const out = summarizePluginBrowserHeader(rows(["a", "ok"], ["b", "ok"]));
    expect(out.headline).toBe("2 plugins");
  });

  it("includes broken/warning/unrated fragments in priority order", () => {
    const out = summarizePluginBrowserHeader(
      rows(
        ["a", "error"],
        ["b", "error"],
        ["c", "warning"],
        ["d", "info"],
        ["e", "ok"],
      ),
    );
    expect(out.headline).toBe("5 plugins · 2 broken · 1 warning · 1 unrated");
  });

  it("omits zero-count fragments", () => {
    const out = summarizePluginBrowserHeader(
      rows(["a", "ok"], ["b", "warning"]),
    );
    expect(out.headline).toBe("2 plugins · 1 warning");
  });

  it("uses 'broken' invariant (no plural-s)", () => {
    const out = summarizePluginBrowserHeader(
      rows(["a", "error"], ["b", "error"], ["c", "error"]),
    );
    expect(out.headline).toBe("3 plugins · 3 broken");
  });

  it("uses 'unrated' invariant (no plural-s)", () => {
    const out = summarizePluginBrowserHeader(
      rows(["a", "info"], ["b", "info"]),
    );
    expect(out.headline).toBe("2 plugins · 2 unrated");
  });
});
