/**
 * Encode / decode the **view configuration** of the Plugin Browser
 * as a URL-hash-safe query string so a user can share a deep link
 * that restores their current selection + filter + sort.
 *
 * Example round-trip:
 *
 *   encodePluginBrowserDeepLink({
 *     selectedPluginId: "com.example",
 *     severityInclude: ["error", "warning"],
 *     sortKey: "pluginId",
 *     sortDirection: "asc",
 *   })
 *   // => "selected=com.example&include=error,warning&sortKey=pluginId&sortDir=asc"
 *
 * The encoded form is compact, human-inspectable, and stable (keys
 * emitted in a fixed order; severity arrays sorted lexicographically).
 *
 * Decoding is **tolerant**: unknown keys are ignored; malformed
 * values for a given key cause *only that key* to be dropped. The
 * function never throws.
 *
 * No DOM deps — caller owns the URL API (`location.hash`,
 * `URLSearchParams`, `history.pushState`).
 *
 * Pure transforms / helpers. Never throw.
 */

import type { PluginRowSummarySeverity } from "./PluginBrowserRowSummary.js";
import type {
  PluginBrowserRowSortKey,
  PluginBrowserRowSortDirection,
} from "./PluginBrowserRowSort.js";

export interface PluginBrowserDeepLinkState {
  readonly selectedPluginId?: string | null;
  readonly severityInclude?: readonly PluginRowSummarySeverity[];
  readonly severityExclude?: readonly PluginRowSummarySeverity[];
  readonly sortKey?: PluginBrowserRowSortKey;
  readonly sortDirection?: PluginBrowserRowSortDirection;
}

const SEVERITY_VALUES: ReadonlySet<PluginRowSummarySeverity> = new Set([
  "ok",
  "info",
  "warning",
  "error",
]);

const SORT_KEYS: ReadonlySet<PluginBrowserRowSortKey> = new Set([
  "severity",
  "pluginId",
  "label",
]);

const SORT_DIRECTIONS: ReadonlySet<PluginBrowserRowSortDirection> = new Set([
  "asc",
  "desc",
]);

/**
 * Serialize the deep-link state. Keys are emitted in a fixed
 * order; empty / null / undefined fields are omitted entirely so
 * round-trips don't accumulate no-op params.
 */
export function encodePluginBrowserDeepLink(
  state: PluginBrowserDeepLinkState,
): string {
  const parts: string[] = [];

  if (state.selectedPluginId) {
    parts.push(`selected=${encodeURIComponent(state.selectedPluginId)}`);
  }
  if (state.severityInclude && state.severityInclude.length > 0) {
    parts.push(`include=${encodeSeverityList(state.severityInclude)}`);
  }
  if (state.severityExclude && state.severityExclude.length > 0) {
    parts.push(`exclude=${encodeSeverityList(state.severityExclude)}`);
  }
  if (state.sortKey) {
    parts.push(`sortKey=${state.sortKey}`);
  }
  if (state.sortDirection) {
    parts.push(`sortDir=${state.sortDirection}`);
  }

  return parts.join("&");
}

/**
 * Parse a deep-link hash string back into a
 * `PluginBrowserDeepLinkState`. Tolerant of:
 *  - a leading `?` or `#` character (stripped)
 *  - unknown keys (ignored)
 *  - malformed values on *one* key (that key dropped, others kept)
 *  - empty input (returns `{}`)
 *
 * Severity lists are returned in the input order but de-duplicated
 * and filtered to known severities.
 */
export function decodePluginBrowserDeepLink(
  input: string | null | undefined,
): PluginBrowserDeepLinkState {
  if (!input) return {};
  let body = input.trim();
  if (body.startsWith("#") || body.startsWith("?")) body = body.slice(1);
  if (body.length === 0) return {};

  const out: Mutable<PluginBrowserDeepLinkState> = {};

  for (const chunk of body.split("&")) {
    if (chunk.length === 0) continue;
    const eq = chunk.indexOf("=");
    const rawKey = eq < 0 ? chunk : chunk.slice(0, eq);
    const rawVal = eq < 0 ? "" : chunk.slice(eq + 1);
    const key = decodeSafe(rawKey);
    if (!key) continue;

    switch (key) {
      case "selected": {
        const val = decodeSafe(rawVal);
        if (val) out.selectedPluginId = val;
        break;
      }
      case "include": {
        const list = parseSeverityList(rawVal);
        if (list.length > 0) out.severityInclude = list;
        break;
      }
      case "exclude": {
        const list = parseSeverityList(rawVal);
        if (list.length > 0) out.severityExclude = list;
        break;
      }
      case "sortKey": {
        const val = decodeSafe(rawVal);
        if (val && (SORT_KEYS as ReadonlySet<string>).has(val)) {
          out.sortKey = val as PluginBrowserRowSortKey;
        }
        break;
      }
      case "sortDir": {
        const val = decodeSafe(rawVal);
        if (val && (SORT_DIRECTIONS as ReadonlySet<string>).has(val)) {
          out.sortDirection = val as PluginBrowserRowSortDirection;
        }
        break;
      }
      default:
        // Unknown key: ignore.
        break;
    }
  }

  return out;
}

/** `encodePluginBrowserDeepLink({}) === ""` — verify via this. */
export function isEmptyPluginBrowserDeepLink(
  state: PluginBrowserDeepLinkState,
): boolean {
  return (
    !state.selectedPluginId &&
    (!state.severityInclude || state.severityInclude.length === 0) &&
    (!state.severityExclude || state.severityExclude.length === 0) &&
    !state.sortKey &&
    !state.sortDirection
  );
}

// -- internals --------------------------------------------------------------

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

function decodeSafe(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return "";
  }
}

function encodeSeverityList(list: readonly PluginRowSummarySeverity[]): string {
  // De-duplicate, filter to known values, preserve input order. The
  // output is deterministic given deterministic input — callers can
  // sort lexicographically themselves if they want stable URLs.
  const seen = new Set<PluginRowSummarySeverity>();
  const kept: PluginRowSummarySeverity[] = [];
  for (const s of list) {
    if (seen.has(s)) continue;
    if (!SEVERITY_VALUES.has(s)) continue;
    seen.add(s);
    kept.push(s);
  }
  return kept.join(",");
}

function parseSeverityList(raw: string): readonly PluginRowSummarySeverity[] {
  const decoded = decodeSafe(raw);
  if (!decoded) return [];
  const seen = new Set<PluginRowSummarySeverity>();
  const kept: PluginRowSummarySeverity[] = [];
  for (const part of decoded.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    if (!(SEVERITY_VALUES as ReadonlySet<string>).has(trimmed)) continue;
    const sev = trimmed as PluginRowSummarySeverity;
    if (seen.has(sev)) continue;
    seen.add(sev);
    kept.push(sev);
  }
  return kept;
}
