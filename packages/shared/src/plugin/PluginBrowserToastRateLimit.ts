/**
 * Caps the number of toasts surfaced per refresh and collapses the
 * rest into a single overflow summary. Prevents toast-spam on bulk
 * plugin operations that flip many plugins at once (mass disable,
 * manifest swap, etc).
 *
 * Pure transform. Never throws.
 *
 * Input should be pre-sorted by priority (as produced by
 * {@link buildPluginBrowserToastIntents}). We keep the first
 * `maxVisible` and collapse the tail — the router's ordering
 * guarantees the most-urgent intents survive.
 */

import type { PluginRowSummarySeverity } from "./PluginBrowserRowSummary.js";
import type {
  PluginBrowserToastIntent,
  PluginBrowserToastKind,
} from "./PluginBrowserToastRouter.js";

export interface PluginBrowserToastOverflowSummary {
  readonly overflowCount: number;
  readonly bySeverity: Readonly<Record<PluginRowSummarySeverity, number>>;
  readonly byKind: Readonly<Record<PluginBrowserToastKind, number>>;
  /** Ids of intents that were rolled into this summary. */
  readonly overflowIds: readonly string[];
}

export interface RateLimitToastIntentsOptions {
  /** Maximum toasts to surface. Must be >= 0. Values < 0 are clamped to 0. */
  readonly maxVisible: number;
}

export interface RateLimitToastIntentsResult {
  readonly emitted: readonly PluginBrowserToastIntent[];
  /** Null when no intents overflowed. */
  readonly overflow: PluginBrowserToastOverflowSummary | null;
}

export function rateLimitPluginBrowserToastIntents(
  intents: readonly PluginBrowserToastIntent[],
  options: RateLimitToastIntentsOptions,
): RateLimitToastIntentsResult {
  const max = Math.max(0, options.maxVisible | 0);
  if (intents.length <= max) {
    return { emitted: intents, overflow: null };
  }
  const emitted = intents.slice(0, max);
  const tail = intents.slice(max);

  const bySeverity: Record<PluginRowSummarySeverity, number> = {
    ok: 0,
    info: 0,
    warning: 0,
    error: 0,
  };
  const byKind: Record<PluginBrowserToastKind, number> = {
    added: 0,
    removed: 0,
    regressed: 0,
    recovered: 0,
    "label-changed": 0,
  };
  const overflowIds: string[] = [];
  for (const intent of tail) {
    bySeverity[intent.severity] += 1;
    byKind[intent.kind] += 1;
    overflowIds.push(intent.id);
  }

  return {
    emitted,
    overflow: {
      overflowCount: tail.length,
      bySeverity,
      byKind,
      overflowIds,
    },
  };
}
