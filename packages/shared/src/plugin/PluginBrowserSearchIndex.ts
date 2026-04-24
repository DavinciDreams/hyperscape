/**
 * Pure tiered-substring search over {@link PluginBrowserRowSummary}
 * values. Drives the Plugin Browser's search field without pulling
 * in a heavyweight fuzzy library.
 *
 * Scoring tiers (per row, per query, higher = better):
 *  - pluginId exact (case-insensitive): 100
 *  - pluginId starts-with: 75
 *  - pluginId contains: 50
 *  - label exact: 40
 *  - label starts-with: 30
 *  - label contains: 20
 *  - any reason contains: 10
 *  - no match: 0
 *
 * The scoring function returns the **highest** tier that matched,
 * so one row never ranks higher than another for the same tier.
 * Tie-breaks are stable: rows preserve input order.
 *
 * Empty / whitespace queries return every row with `score = 0` in
 * input order — callers can treat that as a pass-through list.
 *
 * Pure transforms / helpers. Never throw.
 */

import type { PluginBrowserRowSummary } from "./PluginBrowserRowSummary.js";

export interface PluginBrowserSearchMatch {
  readonly row: PluginBrowserRowSummary;
  /** Score in [0, 100]. 0 = no match, matched only on pass-through. */
  readonly score: number;
}

/** Score tier constants (exported so tests + UI can reference them). */
export const SEARCH_SCORE_ID_EXACT = 100;
export const SEARCH_SCORE_ID_PREFIX = 75;
export const SEARCH_SCORE_ID_SUBSTRING = 50;
export const SEARCH_SCORE_LABEL_EXACT = 40;
export const SEARCH_SCORE_LABEL_PREFIX = 30;
export const SEARCH_SCORE_LABEL_SUBSTRING = 20;
export const SEARCH_SCORE_REASON_SUBSTRING = 10;
export const SEARCH_SCORE_NO_MATCH = 0;

/**
 * Score a single row against `query`. Returns the highest matching
 * tier, or 0 when nothing matches. Query is normalized (trimmed,
 * lower-cased) before comparison.
 */
export function scorePluginBrowserRow(
  row: PluginBrowserRowSummary,
  query: string,
): number {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return SEARCH_SCORE_NO_MATCH;

  const id = row.pluginId.toLowerCase();
  if (id === q) return SEARCH_SCORE_ID_EXACT;
  if (id.startsWith(q)) return SEARCH_SCORE_ID_PREFIX;
  if (id.includes(q)) return SEARCH_SCORE_ID_SUBSTRING;

  const label = row.label.toLowerCase();
  if (label === q) return SEARCH_SCORE_LABEL_EXACT;
  if (label.startsWith(q)) return SEARCH_SCORE_LABEL_PREFIX;
  if (label.includes(q)) return SEARCH_SCORE_LABEL_SUBSTRING;

  for (const reason of row.reasons) {
    if (reason.toLowerCase().includes(q)) {
      return SEARCH_SCORE_REASON_SUBSTRING;
    }
  }

  return SEARCH_SCORE_NO_MATCH;
}

/**
 * Filter + rank rows against `query`. Returns all rows ordered by
 * descending score with input order as stable tie-break. Rows with
 * score 0 are dropped **unless** the query is empty — in that case
 * every row is returned (score=0) in input order so callers can use
 * this as an idempotent pass-through.
 */
export function searchPluginBrowserRows(
  rows: readonly PluginBrowserRowSummary[],
  query: string,
): readonly PluginBrowserSearchMatch[] {
  const q = query.trim();
  if (q.length === 0) {
    return rows.map((row) => ({ row, score: 0 }));
  }

  // Pair each row with its original index for stable sort.
  const scored: Array<PluginBrowserSearchMatch & { i: number }> = [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const score = scorePluginBrowserRow(row, q);
    if (score > 0) scored.push({ row, score, i });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.i - b.i;
  });

  // Strip the `i` field.
  return scored.map(({ row, score }) => ({ row, score }));
}
