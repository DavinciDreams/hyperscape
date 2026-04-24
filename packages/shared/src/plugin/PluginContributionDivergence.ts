/**
 * Compare advertised vs live plugin-contribution counts.
 *
 * `PluginBrowserRow.contributions` reports the counts declared in the
 * plugin manifest (authoring truth). `countLiveContributionsForPlugin`
 * reports what is actually registered at runtime. When these differ,
 * the editor should surface the gap so authors can spot:
 *   - plugins not yet enabled (live = 0 despite advertised > 0)
 *   - conditional/dynamic registrations (live > advertised)
 *   - undeclared contributions (advertised = 0 but live > 0)
 *   - stale manifests (advertised > 0 but live = 0 after enable)
 *
 * This module is pure logic — it takes two plain count records and
 * returns a sorted, de-duplicated list of divergence entries. The
 * caller decides how to map manifest fields to registry `kind` names
 * (see `PluginContributionRegistry.kind`); this helper just compares
 * numbers under matching keys.
 */

import type { LivePluginContributionCounts } from "./PluginContributionCounts.js";

/** Snapshot of advertised counts (from the plugin manifest). */
export type AdvertisedPluginContributionCounts = Record<string, number>;

export interface PluginContributionDivergence {
  /** Registry/contribution kind (the key under which counts are compared). */
  readonly kind: string;
  /** Count declared in the plugin manifest. */
  readonly advertised: number;
  /** Count registered at runtime. */
  readonly live: number;
  /** live - advertised. Negative = missing; positive = extra. */
  readonly delta: number;
}

/**
 * Return the union of kinds present in either record, sorted
 * alphabetically, with divergence info for each. Missing keys on
 * either side are treated as `0`.
 *
 * By default only entries where `advertised !== live` are returned.
 * Pass `{ includeMatching: true }` to keep matches too (useful for a
 * full-state editor table).
 */
export function diffContributionCounts(
  advertised: AdvertisedPluginContributionCounts,
  live: LivePluginContributionCounts,
  options: { readonly includeMatching?: boolean } = {},
): PluginContributionDivergence[] {
  const includeMatching = options.includeMatching === true;

  const kinds = new Set<string>();
  for (const k of Object.keys(advertised)) kinds.add(k);
  for (const k of Object.keys(live)) kinds.add(k);

  const out: PluginContributionDivergence[] = [];
  for (const kind of [...kinds].sort()) {
    const a = advertised[kind] ?? 0;
    const l = live[kind] ?? 0;
    if (!includeMatching && a === l) continue;
    out.push({ kind, advertised: a, live: l, delta: l - a });
  }
  return out;
}

/**
 * True when any kind has a non-zero delta. Cheaper than building the
 * full diff when the caller only wants a "has issues" indicator for a
 * row-level badge.
 */
export function hasContributionDivergence(
  advertised: AdvertisedPluginContributionCounts,
  live: LivePluginContributionCounts,
): boolean {
  for (const k of Object.keys(advertised)) {
    if ((advertised[k] ?? 0) !== (live[k] ?? 0)) return true;
  }
  for (const k of Object.keys(live)) {
    if (!(k in advertised) && (live[k] ?? 0) !== 0) return true;
  }
  return false;
}
