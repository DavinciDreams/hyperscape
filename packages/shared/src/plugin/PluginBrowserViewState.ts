/**
 * Plugin Browser view-state serialization.
 *
 * The editor's Plugin Browser panel owns UI state — current search
 * query, active filters, sort column, group mode, which groups are
 * expanded — that the user reasonably expects to survive panel
 * close, page reload, and workspace switch.
 *
 * This module supplies two things:
 *   1. A canonical `PluginBrowserViewState` shape that bundles
 *      everything the panel needs to reconstruct its display.
 *   2. A JSON serializer/deserializer pair with schema-versioning,
 *      field defaults, and fail-soft parsing so a malformed or
 *      out-of-date stored blob never crashes the editor — it
 *      degrades to the default view.
 *
 * Scope: pure data shape + pure string↔object transforms. No DOM
 * storage calls (that's the caller's job — localStorage, URL query,
 * workspace manifest, whatever). Dependency-free on React/zustand.
 */

import type {
  PluginBrowserGroupMode,
  PluginBrowserViewOptions,
} from "./PluginBrowserView.js";
import type { PluginBrowserSearchFilters } from "./PluginBrowserSearch.js";
import type { PluginBrowserSortOrder } from "./PluginBrowserSortOrder.js";

/**
 * Full UI state for the Plugin Browser panel. Mirrors
 * `PluginBrowserViewOptions` + a few UI-only additions (expanded
 * groups, selection cursor) that aren't needed for
 * `buildPluginBrowserView` but ARE needed to restore the visible
 * panel state after reload.
 */
export interface PluginBrowserViewState {
  readonly filters: PluginBrowserSearchFilters;
  readonly sort: PluginBrowserSortOrder | null;
  readonly groupMode: PluginBrowserGroupMode;
  readonly includeEmptyStateGroups: boolean;
  /** Group keys currently expanded. Irrelevant when groupMode==="none". */
  readonly expandedGroupKeys: readonly string[];
  /** Plugin id of the currently selected row, or null when no selection. */
  readonly selectedPluginId: string | null;
}

export const DEFAULT_VIEW_STATE: PluginBrowserViewState = {
  filters: {},
  sort: null,
  groupMode: "none",
  includeEmptyStateGroups: false,
  expandedGroupKeys: [],
  selectedPluginId: null,
};

const SCHEMA_VERSION = 1;

/**
 * Projection from a full panel state to the subset
 * `buildPluginBrowserView` consumes. Call this at render time:
 * `buildPluginBrowserView(rows, viewStateToOptions(state))`.
 */
export function viewStateToOptions(
  state: PluginBrowserViewState,
): PluginBrowserViewOptions {
  return {
    filters: state.filters,
    sort: state.sort ?? undefined,
    groupMode: state.groupMode,
    includeEmptyStateGroups: state.includeEmptyStateGroups,
  };
}

interface SerializedV1 {
  readonly v: 1;
  readonly filters: unknown;
  readonly sort: unknown;
  readonly groupMode: unknown;
  readonly includeEmptyStateGroups: unknown;
  readonly expandedGroupKeys: unknown;
  readonly selectedPluginId: unknown;
}

/**
 * JSON-stringify a view state. Always writes schema v1 with all
 * fields present so round-trip is exact.
 */
export function serializePluginBrowserViewState(
  state: PluginBrowserViewState,
): string {
  const wire: SerializedV1 = {
    v: SCHEMA_VERSION,
    filters: state.filters,
    sort: state.sort,
    groupMode: state.groupMode,
    includeEmptyStateGroups: state.includeEmptyStateGroups,
    expandedGroupKeys: state.expandedGroupKeys,
    selectedPluginId: state.selectedPluginId,
  };
  return JSON.stringify(wire);
}

/**
 * Parse a previously-serialized state. Returns the default state on
 * any parse error, schema mismatch, or type mismatch — fail-soft so
 * the editor never crashes on a stale blob. Individual fields fall
 * back to their defaults when malformed, so a partially-corrupted
 * state still recovers the salvageable pieces.
 */
export function parsePluginBrowserViewState(
  serialized: string | null | undefined,
): PluginBrowserViewState {
  if (serialized == null || serialized.length === 0) {
    return DEFAULT_VIEW_STATE;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(serialized);
  } catch {
    return DEFAULT_VIEW_STATE;
  }
  if (!isObject(raw)) return DEFAULT_VIEW_STATE;
  if (raw.v !== SCHEMA_VERSION) return DEFAULT_VIEW_STATE;

  return {
    filters: sanitizeFilters(raw.filters),
    sort: sanitizeSort(raw.sort),
    groupMode: sanitizeGroupMode(raw.groupMode),
    includeEmptyStateGroups:
      typeof raw.includeEmptyStateGroups === "boolean"
        ? raw.includeEmptyStateGroups
        : false,
    expandedGroupKeys: sanitizeStringArray(raw.expandedGroupKeys),
    selectedPluginId:
      typeof raw.selectedPluginId === "string" ? raw.selectedPluginId : null,
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

const GROUP_MODES: readonly PluginBrowserGroupMode[] = [
  "none",
  "state",
  "author",
  "tag",
];

function sanitizeGroupMode(value: unknown): PluginBrowserGroupMode {
  if (typeof value !== "string") return "none";
  return (GROUP_MODES as readonly string[]).includes(value)
    ? (value as PluginBrowserGroupMode)
    : "none";
}

const SORT_COLUMNS: readonly string[] = [
  "id",
  "name",
  "version",
  "author",
  "state",
  "enabledByDefault",
  "dependencyCount",
  "contributionCount",
  "errorMessage",
  "healthIssueCount",
];

function sanitizeSort(value: unknown): PluginBrowserSortOrder | null {
  if (value === null) return null;
  if (!isObject(value)) return null;
  const col = value.column;
  const dir = value.direction;
  if (typeof col !== "string" || !SORT_COLUMNS.includes(col)) return null;
  if (dir !== "asc" && dir !== "desc") return null;
  return {
    column: col as PluginBrowserSortOrder["column"],
    direction: dir,
  };
}

const LIFECYCLE_STATES: readonly string[] = [
  "registered",
  "loaded",
  "enabled",
  "disabled",
  "failed",
];

function sanitizeFilters(value: unknown): PluginBrowserSearchFilters {
  if (!isObject(value)) return {};
  const out: Record<string, unknown> = {};
  if (typeof value.query === "string") {
    out.query = value.query;
  }
  if (Array.isArray(value.states)) {
    const kept = value.states.filter(
      (s): s is string => typeof s === "string" && LIFECYCLE_STATES.includes(s),
    );
    if (kept.length > 0) out.states = kept;
  }
  const anyTags = sanitizeStringArray(value.anyTags);
  if (anyTags.length > 0) out.anyTags = anyTags;
  const allTags = sanitizeStringArray(value.allTags);
  if (allTags.length > 0) out.allTags = allTags;
  if (typeof value.hasHealthIssues === "boolean") {
    out.hasHealthIssues = value.hasHealthIssues;
  }
  if (typeof value.hasFactory === "boolean") {
    out.hasFactory = value.hasFactory;
  }
  return out as PluginBrowserSearchFilters;
}
