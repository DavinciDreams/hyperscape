import { describe, expect, it } from "vitest";
import {
  SEARCH_SCORE_ID_EXACT,
  SEARCH_SCORE_ID_PREFIX,
  SEARCH_SCORE_ID_SUBSTRING,
  SEARCH_SCORE_LABEL_EXACT,
  SEARCH_SCORE_LABEL_PREFIX,
  SEARCH_SCORE_LABEL_SUBSTRING,
  SEARCH_SCORE_NO_MATCH,
  SEARCH_SCORE_REASON_SUBSTRING,
  scorePluginBrowserRow,
  searchPluginBrowserRows,
} from "../PluginBrowserSearchIndex.js";
import type { PluginBrowserRowSummary } from "../PluginBrowserRowSummary.js";

function row(
  pluginId: string,
  label: string,
  reasons: readonly string[] = [],
): PluginBrowserRowSummary {
  return {
    pluginId,
    severity: "ok",
    label,
    reasons,
    health: null,
    stability: null,
  };
}

describe("scorePluginBrowserRow — tier resolution", () => {
  const r = row("com.example.alpha", "Alpha Widgets", [
    "requires extra memory",
  ]);

  it("returns 0 for empty or whitespace query", () => {
    expect(scorePluginBrowserRow(r, "")).toBe(SEARCH_SCORE_NO_MATCH);
    expect(scorePluginBrowserRow(r, "   ")).toBe(SEARCH_SCORE_NO_MATCH);
  });

  it("scores pluginId exact (case-insensitive) highest", () => {
    expect(scorePluginBrowserRow(r, "com.example.alpha")).toBe(
      SEARCH_SCORE_ID_EXACT,
    );
    expect(scorePluginBrowserRow(r, "COM.EXAMPLE.ALPHA")).toBe(
      SEARCH_SCORE_ID_EXACT,
    );
  });

  it("scores pluginId prefix below exact", () => {
    expect(scorePluginBrowserRow(r, "com.example")).toBe(
      SEARCH_SCORE_ID_PREFIX,
    );
  });

  it("scores pluginId substring below prefix", () => {
    expect(scorePluginBrowserRow(r, "example")).toBe(SEARCH_SCORE_ID_SUBSTRING);
  });

  it("scores label exact below id substring when id doesn't match", () => {
    const r2 = row("com.a", "Alpha Widgets");
    expect(scorePluginBrowserRow(r2, "alpha widgets")).toBe(
      SEARCH_SCORE_LABEL_EXACT,
    );
  });

  it("scores label prefix below label exact", () => {
    const r2 = row("com.a", "Alpha Widgets");
    expect(scorePluginBrowserRow(r2, "alpha")).toBe(SEARCH_SCORE_LABEL_PREFIX);
  });

  it("scores label substring below label prefix", () => {
    const r2 = row("com.a", "Alpha Widgets");
    expect(scorePluginBrowserRow(r2, "widgets")).toBe(
      SEARCH_SCORE_LABEL_SUBSTRING,
    );
  });

  it("scores reason substring as lowest non-zero tier", () => {
    const r2 = row("com.a", "Something", ["requires extra memory"]);
    expect(scorePluginBrowserRow(r2, "memory")).toBe(
      SEARCH_SCORE_REASON_SUBSTRING,
    );
  });

  it("returns 0 when nothing matches", () => {
    const r2 = row("com.a", "Alpha", ["missing asset"]);
    expect(scorePluginBrowserRow(r2, "zzzzz")).toBe(SEARCH_SCORE_NO_MATCH);
  });

  it("returns the HIGHEST matching tier when multiple would match", () => {
    const r2 = row("alpha.plugin", "Alpha", []);
    // "alpha" matches id substring AND label exact. Id wins.
    expect(scorePluginBrowserRow(r2, "alpha")).toBe(SEARCH_SCORE_ID_PREFIX);
  });

  it("matches pluginId prefix even when a label would also match", () => {
    const r2 = row("searchable.id", "Searchable Label");
    expect(scorePluginBrowserRow(r2, "searchable")).toBe(
      SEARCH_SCORE_ID_PREFIX,
    );
  });
});

describe("searchPluginBrowserRows — empty query", () => {
  it("returns every row with score 0 in input order", () => {
    const rows = [row("b", "B"), row("a", "A"), row("c", "C")];
    const out = searchPluginBrowserRows(rows, "");
    expect(out).toHaveLength(3);
    expect(out.map((m) => m.row.pluginId)).toEqual(["b", "a", "c"]);
    expect(out.every((m) => m.score === 0)).toBe(true);
  });

  it("treats whitespace-only as empty", () => {
    const rows = [row("a", "A")];
    expect(searchPluginBrowserRows(rows, "   ")).toHaveLength(1);
  });
});

describe("searchPluginBrowserRows — non-empty query", () => {
  it("drops rows that score zero", () => {
    const rows = [row("foo", "Foo"), row("bar", "Bar")];
    const out = searchPluginBrowserRows(rows, "foo");
    expect(out.map((m) => m.row.pluginId)).toEqual(["foo"]);
  });

  it("orders by descending score", () => {
    const rows = [
      row("com.b.plugin", "B Plugin"), // id substring (50)
      row("b", "B label"), // id exact (100)
      row("com.b-like", "B-like"), // id substring (50)
    ];
    const out = searchPluginBrowserRows(rows, "b");
    expect(out[0].row.pluginId).toBe("b");
    expect(out[0].score).toBe(SEARCH_SCORE_ID_EXACT);
  });

  it("preserves input order for ties", () => {
    const rows = [
      row("com.b.one", "One"), // id substring
      row("com.b.two", "Two"), // id substring
      row("com.b.three", "Three"), // id substring
    ];
    const out = searchPluginBrowserRows(rows, "b.");
    expect(out.map((m) => m.row.pluginId)).toEqual([
      "com.b.one",
      "com.b.two",
      "com.b.three",
    ]);
  });

  it("interleaves tiers correctly", () => {
    const rows = [
      row("alpha.foo", "Alpha"), // id prefix (75)
      row("com.alpha", "Alpha label"), // label exact-ish
      row("com.z", "Contains alpha"), // label substring (20)
    ];
    const out = searchPluginBrowserRows(rows, "alpha");
    // Id-prefix row must be first.
    expect(out[0].row.pluginId).toBe("alpha.foo");
  });

  it("is case-insensitive", () => {
    const rows = [row("Com.Example", "Example")];
    const out = searchPluginBrowserRows(rows, "EXAMPLE");
    expect(out).toHaveLength(1);
  });

  it("does not mutate the input array", () => {
    const rows = [row("b", "B"), row("a", "A")];
    const copy = rows.slice();
    searchPluginBrowserRows(rows, "a");
    expect(rows).toEqual(copy);
  });

  it("matches via reason substring when id/label don't", () => {
    const rows = [
      row("com.ok", "Ok", ["needs extra memory to run"]),
      row("com.fine", "Fine", ["no issues"]),
    ];
    const out = searchPluginBrowserRows(rows, "memory");
    expect(out.map((m) => m.row.pluginId)).toEqual(["com.ok"]);
    expect(out[0].score).toBe(SEARCH_SCORE_REASON_SUBSTRING);
  });

  it("returns empty array when no row matches and query is non-empty", () => {
    const rows = [row("a", "A"), row("b", "B")];
    expect(searchPluginBrowserRows(rows, "zzz")).toEqual([]);
  });
});
