/**
 * Pure-logic filter + score for the Plugin Browser panel.
 *
 * Consumes the flat `PluginBrowserRow[]` produced by
 * `buildPluginBrowserSnapshot` and returns rows that match a
 * text query plus optional structured filters (state, tags,
 * has-health-issues, has-factory). Results are scored so the
 * editor can render them in relevance order.
 *
 * Scoring is intentionally simple — exact id/name match ranks
 * highest, then prefix, then substring across searchable fields.
 * This is not a fuzzy matcher; it's predictable enough to be
 * keyboard-navigable. If we need typo tolerance later we can swap
 * in a Levenshtein step without changing the interface.
 */

import type { PluginBrowserRow } from "./PluginBrowserSnapshot.js";
import type { PluginLifecycleState } from "./PluginLoader.js";

export interface PluginBrowserSearchFilters {
  /** Free-text query. Empty/whitespace matches all rows. */
  readonly query?: string;
  /** Keep only rows whose lifecycle state is one of these. */
  readonly states?: readonly PluginLifecycleState[];
  /** Keep only rows that carry at least one of these tags. */
  readonly anyTags?: readonly string[];
  /** Keep only rows that carry every one of these tags. */
  readonly allTags?: readonly string[];
  /** Keep only rows with/without health issues. */
  readonly hasHealthIssues?: boolean;
  /** Keep only rows with/without a registered factory. */
  readonly hasFactory?: boolean;
}

export interface ScoredPluginBrowserRow {
  readonly row: PluginBrowserRow;
  readonly score: number;
  /** Which field delivered the best score, for debug/UI highlight. */
  readonly matchedField:
    | "id"
    | "name"
    | "description"
    | "tag"
    | "author"
    | null;
}

const SCORE_EXACT = 100;
const SCORE_PREFIX = 60;
const SCORE_SUBSTRING = 20;
const SCORE_TAG = 15;

function scoreField(
  haystack: string,
  needle: string,
): { score: number; matched: boolean } {
  if (haystack === needle) return { score: SCORE_EXACT, matched: true };
  if (haystack.startsWith(needle))
    return { score: SCORE_PREFIX, matched: true };
  if (haystack.includes(needle))
    return { score: SCORE_SUBSTRING, matched: true };
  return { score: 0, matched: false };
}

function scoreRow(
  row: PluginBrowserRow,
  normalized: string,
): { score: number; matchedField: ScoredPluginBrowserRow["matchedField"] } {
  let best = {
    score: 0,
    matchedField: null as ScoredPluginBrowserRow["matchedField"],
  };
  const fields: Array<{
    value: string;
    name: Exclude<ScoredPluginBrowserRow["matchedField"], null | "tag">;
  }> = [
    { value: row.id, name: "id" },
    { value: row.name, name: "name" },
    { value: row.description, name: "description" },
    { value: row.author, name: "author" },
  ];
  for (const f of fields) {
    const r = scoreField(f.value.toLowerCase(), normalized);
    if (r.matched && r.score > best.score) {
      best = { score: r.score, matchedField: f.name };
    }
  }
  for (const tag of row.tags) {
    if (tag.toLowerCase() === normalized) {
      if (SCORE_EXACT > best.score) {
        best = { score: SCORE_EXACT, matchedField: "tag" };
      }
    } else if (tag.toLowerCase().includes(normalized)) {
      if (SCORE_TAG > best.score) {
        best = { score: SCORE_TAG, matchedField: "tag" };
      }
    }
  }
  return best;
}

function passesFilters(
  row: PluginBrowserRow,
  filters: PluginBrowserSearchFilters,
): boolean {
  if (filters.states && filters.states.length > 0) {
    if (!filters.states.includes(row.state)) return false;
  }
  if (filters.anyTags && filters.anyTags.length > 0) {
    const rowTags = new Set(row.tags);
    if (!filters.anyTags.some((t) => rowTags.has(t))) return false;
  }
  if (filters.allTags && filters.allTags.length > 0) {
    const rowTags = new Set(row.tags);
    if (!filters.allTags.every((t) => rowTags.has(t))) return false;
  }
  if (filters.hasHealthIssues !== undefined) {
    const has = row.healthIssues.length > 0;
    if (has !== filters.hasHealthIssues) return false;
  }
  if (filters.hasFactory !== undefined) {
    if (row.hasFactory !== filters.hasFactory) return false;
  }
  return true;
}

/**
 * Filter + score. Rows without a text match are still returned when
 * the query is empty/whitespace — they just receive score `0`. Tie
 * break: alphabetical by id. Caller gets a stable render order.
 */
export function searchPluginBrowser(
  rows: readonly PluginBrowserRow[],
  filters: PluginBrowserSearchFilters = {},
): ScoredPluginBrowserRow[] {
  const query = (filters.query ?? "").trim().toLowerCase();
  const out: ScoredPluginBrowserRow[] = [];
  for (const row of rows) {
    if (!passesFilters(row, filters)) continue;
    if (query.length === 0) {
      out.push({ row, score: 0, matchedField: null });
      continue;
    }
    const { score, matchedField } = scoreRow(row, query);
    if (score === 0) continue;
    out.push({ row, score, matchedField });
  }
  out.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.row.id.localeCompare(b.row.id);
  });
  return out;
}
