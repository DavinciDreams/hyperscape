import { describe, expect, it } from "vitest";
import {
  formatPluginBrowserPluginIds,
  formatPluginBrowserRow,
  formatPluginBrowserRows,
} from "../PluginBrowserClipboard.js";
import type {
  PluginBrowserRowSummary,
  PluginRowSummarySeverity,
} from "../PluginBrowserRowSummary.js";

function row(
  pluginId: string,
  severity: PluginRowSummarySeverity = "ok",
  label = severity,
  reasons: readonly string[] = [],
): PluginBrowserRowSummary {
  return {
    pluginId,
    severity,
    label,
    reasons,
    health: null,
    stability: null,
  };
}

describe("formatPluginBrowserRow — plain", () => {
  it("renders a simple row as tab-delimited", () => {
    const r = row("com.alpha", "ok", "stable", []);
    expect(formatPluginBrowserRow(r, "plain")).toBe("com.alpha\tok\tstable\t");
  });

  it("joins reasons with ' | '", () => {
    const r = row("com.beta", "warning", "warning", ["slow", "noisy"]);
    expect(formatPluginBrowserRow(r, "plain")).toBe(
      "com.beta\twarning\twarning\tslow | noisy",
    );
  });

  it("neutralizes embedded tabs inside reasons", () => {
    const r = row("com.g", "error", "broken", ["bad\ttab"]);
    expect(formatPluginBrowserRow(r, "plain")).toBe(
      "com.g\terror\tbroken\tbad tab",
    );
  });

  it("defaults to plain format when format omitted", () => {
    const r = row("com.d", "ok", "stable", []);
    expect(formatPluginBrowserRow(r)).toBe("com.d\tok\tstable\t");
  });
});

describe("formatPluginBrowserRow — markdown", () => {
  it("renders a severity badge + backtick-quoted id + label", () => {
    const r = row("com.alpha", "ok", "stable", []);
    expect(formatPluginBrowserRow(r, "markdown")).toBe(
      "[ok] `com.alpha`: stable",
    );
  });

  it("includes reasons after an em-dash when present", () => {
    const r = row("com.beta", "warning", "warning", ["slow", "noisy"]);
    expect(formatPluginBrowserRow(r, "markdown")).toBe(
      "[warn] `com.beta`: warning — slow; noisy",
    );
  });

  it("escapes markdown special chars in id and label", () => {
    const r = row("com.a|b", "error", "broken*", []);
    const out = formatPluginBrowserRow(r, "markdown");
    expect(out).toContain("com.a\\|b");
    expect(out).toContain("broken\\*");
  });

  it("renders error/warning/info/ok badges", () => {
    expect(formatPluginBrowserRow(row("a", "error", "e"), "markdown")).toMatch(
      /^\[error\]/,
    );
    expect(
      formatPluginBrowserRow(row("a", "warning", "w"), "markdown"),
    ).toMatch(/^\[warn\]/);
    expect(formatPluginBrowserRow(row("a", "info", "i"), "markdown")).toMatch(
      /^\[info\]/,
    );
    expect(formatPluginBrowserRow(row("a", "ok", "o"), "markdown")).toMatch(
      /^\[ok\]/,
    );
  });
});

describe("formatPluginBrowserRows — plain", () => {
  it("returns empty string for empty input", () => {
    expect(formatPluginBrowserRows([], "plain")).toBe("");
  });

  it("includes a header line then one line per row", () => {
    const out = formatPluginBrowserRows(
      [row("a", "ok", "stable"), row("b", "error", "broken", ["oops"])],
      "plain",
    );
    const lines = out.split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe("plugin\tseverity\tlabel\treasons");
    expect(lines[1]).toBe("a\tok\tstable\t");
    expect(lines[2]).toBe("b\terror\tbroken\toops");
  });
});

describe("formatPluginBrowserRows — markdown", () => {
  it("returns empty string for empty input (no header-only)", () => {
    expect(formatPluginBrowserRows([], "markdown")).toBe("");
  });

  it("emits a GitHub-flavored table with header + divider", () => {
    const out = formatPluginBrowserRows(
      [row("com.a", "ok", "stable")],
      "markdown",
    );
    const lines = out.split("\n");
    expect(lines[0]).toBe("| plugin | severity | label | reasons |");
    expect(lines[1]).toBe("| --- | --- | --- | --- |");
    expect(lines[2]).toBe("| `com.a` | [ok] | stable |  |");
  });

  it("joins multi-line reasons with <br>", () => {
    const out = formatPluginBrowserRows(
      [row("com.a", "warning", "warn", ["first", "second"])],
      "markdown",
    );
    const lastLine = out.split("\n").at(-1)!;
    expect(lastLine).toBe("| `com.a` | [warn] | warn | first<br>second |");
  });

  it("escapes pipes inside cells", () => {
    const out = formatPluginBrowserRows(
      [row("com.a|b", "error", "bad", ["x|y"])],
      "markdown",
    );
    expect(out).toContain("com.a\\|b");
    expect(out).toContain("x\\|y");
  });

  it("replaces newlines inside cell content with space", () => {
    const out = formatPluginBrowserRows(
      [row("com.a", "error", "bad", ["line1\nline2"])],
      "markdown",
    );
    expect(out).toContain("line1 line2");
    expect(out).not.toContain("line1\nline2");
  });

  it("preserves caller-provided row order", () => {
    const out = formatPluginBrowserRows(
      [row("c"), row("a"), row("b")],
      "markdown",
    );
    const idLines = out
      .split("\n")
      .slice(2)
      .map((l) => l.match(/`([^`]+)`/)?.[1]);
    expect(idLines).toEqual(["c", "a", "b"]);
  });
});

describe("formatPluginBrowserPluginIds", () => {
  it("returns empty string for empty input", () => {
    expect(formatPluginBrowserPluginIds([])).toBe("");
  });

  it("joins ids with newlines, no header", () => {
    const out = formatPluginBrowserPluginIds([
      row("com.a"),
      row("com.b"),
      row("com.c"),
    ]);
    expect(out).toBe("com.a\ncom.b\ncom.c");
  });

  it("preserves caller order", () => {
    const out = formatPluginBrowserPluginIds([row("z"), row("a"), row("m")]);
    expect(out).toBe("z\na\nm");
  });
});

describe("formatPluginBrowserRows — determinism", () => {
  it("produces identical output for identical input", () => {
    const rows = [
      row("com.a", "ok", "stable"),
      row("com.b", "warning", "warning", ["x"]),
    ];
    const a = formatPluginBrowserRows(rows, "markdown");
    const b = formatPluginBrowserRows(rows, "markdown");
    expect(a).toBe(b);
  });
});
