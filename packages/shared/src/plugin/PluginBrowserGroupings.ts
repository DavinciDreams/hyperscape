/**
 * Pure-logic grouping helpers for the Plugin Browser sidebar.
 *
 * The editor's Plugin Browser wants to show plugins organized by
 * different axes — lifecycle state, author, tag — so users can
 * narrow by facet before drilling in. These helpers produce flat
 * bucket records ready for tree-view rendering.
 *
 * Groups are sorted alphabetically by key, plugins within each
 * group alphabetically by id. Empty groups are omitted unless the
 * caller explicitly provides a seed list of keys (useful when the
 * UI wants to always show a stable column of `registered / loaded /
 * enabled / disabled / failed` states even when some are empty).
 */

import type { PluginBrowserRow } from "./PluginBrowserSnapshot.js";
import type { PluginLifecycleState } from "./PluginLoader.js";

/**
 * One bucket in a grouped browser view.
 */
export interface PluginBrowserGroup {
  readonly key: string;
  readonly rows: readonly PluginBrowserRow[];
}

const ALL_STATES: readonly PluginLifecycleState[] = [
  "registered",
  "loaded",
  "enabled",
  "disabled",
  "failed",
];

function sortRows(rows: PluginBrowserRow[]): PluginBrowserRow[] {
  return rows.slice().sort((a, b) => a.id.localeCompare(b.id));
}

function flushBuckets(
  buckets: Map<string, PluginBrowserRow[]>,
  seedKeys: readonly string[],
): PluginBrowserGroup[] {
  const keys = new Set<string>([...buckets.keys(), ...seedKeys]);
  const out: PluginBrowserGroup[] = [];
  for (const key of [...keys].sort()) {
    const rows = buckets.get(key) ?? [];
    if (rows.length === 0 && !seedKeys.includes(key)) continue;
    out.push({ key, rows: sortRows(rows) });
  }
  return out;
}

/**
 * Group by `PluginLifecycleState`. When `includeEmptyStates` is
 * true, the five canonical states are always present even when empty.
 */
export function groupByState(
  rows: readonly PluginBrowserRow[],
  options: { readonly includeEmptyStates?: boolean } = {},
): PluginBrowserGroup[] {
  const buckets = new Map<string, PluginBrowserRow[]>();
  for (const row of rows) {
    const existing = buckets.get(row.state);
    if (existing) existing.push(row);
    else buckets.set(row.state, [row]);
  }
  const seed = options.includeEmptyStates === true ? ALL_STATES : [];
  return flushBuckets(buckets, seed);
}

/**
 * Group by the `author` field. Rows without an author go into the
 * bucket keyed by the string `"(unknown)"`.
 */
export function groupByAuthor(
  rows: readonly PluginBrowserRow[],
): PluginBrowserGroup[] {
  const buckets = new Map<string, PluginBrowserRow[]>();
  for (const row of rows) {
    const key = row.author.trim().length === 0 ? "(unknown)" : row.author;
    const existing = buckets.get(key);
    if (existing) existing.push(row);
    else buckets.set(key, [row]);
  }
  return flushBuckets(buckets, []);
}

/**
 * Group by tag. A row with multiple tags appears in each tag's
 * bucket. Rows with no tags are bucketed under the string
 * `"(untagged)"`.
 */
export function groupByTag(
  rows: readonly PluginBrowserRow[],
): PluginBrowserGroup[] {
  const buckets = new Map<string, PluginBrowserRow[]>();
  for (const row of rows) {
    if (row.tags.length === 0) {
      const existing = buckets.get("(untagged)");
      if (existing) existing.push(row);
      else buckets.set("(untagged)", [row]);
      continue;
    }
    for (const tag of row.tags) {
      const existing = buckets.get(tag);
      if (existing) existing.push(row);
      else buckets.set(tag, [row]);
    }
  }
  return flushBuckets(buckets, []);
}
