/**
 * JSON-safe serialization of the persistable subset of
 * {@link PluginBrowserState}, plus validation + rehydration.
 *
 * Only a narrow slice of state survives a page reload:
 *  - `selectedPluginId` — which row the user had open
 *  - `cursor.lastSeenTimestamp` — how far the changelog cursor has
 *    advanced (so "unread" markers survive reloads)
 *
 * Explicitly NOT persisted:
 *  - `currentSnapshot` — comes from the live registry every refresh
 *  - `displays` / `overflow` — ephemeral toast surface
 *  - `changelog.entries` — re-derived from live snapshot diffs;
 *    restoring stale entries would reintroduce old toast intents
 *  - `toastSuppression` — cooldown window is a runtime concern
 *
 * All `parse*` helpers return `null` for invalid input rather than
 * throwing, so callers can treat a corrupted-localStorage situation
 * as "no persisted state" and boot clean.
 *
 * Pure transforms / helpers. Never throw.
 */

import {
  initialPluginBrowserState,
  type PluginBrowserState,
} from "./PluginBrowserReducer.js";

/** Bump this when `PluginBrowserPersistedState` changes shape. */
export const PERSISTENCE_SCHEMA_VERSION = 1;

/** JSON-safe snapshot of the persistable subset of state. */
export interface PluginBrowserPersistedState {
  readonly schemaVersion: typeof PERSISTENCE_SCHEMA_VERSION;
  readonly selectedPluginId: string | null;
  readonly lastSeenTimestamp: number | null;
}

/** Extract the persistable subset. */
export function serializePluginBrowserState(
  state: PluginBrowserState,
): PluginBrowserPersistedState {
  return {
    schemaVersion: PERSISTENCE_SCHEMA_VERSION,
    selectedPluginId: state.selectedPluginId,
    lastSeenTimestamp: state.cursor.lastSeenTimestamp,
  };
}

/**
 * Apply a persisted subset over `initial`. The caller controls what
 * `initial` means: typically `initialPluginBrowserState()`, but
 * bootstraps that want to preserve live snapshot data can pass the
 * current store state instead.
 */
export function rehydratePluginBrowserState(
  initial: PluginBrowserState,
  persisted: PluginBrowserPersistedState,
): PluginBrowserState {
  // If persisted values match current, return the same reference to
  // preserve downstream reference-equality optimizations.
  const sameSelection = persisted.selectedPluginId === initial.selectedPluginId;
  const sameCursor =
    persisted.lastSeenTimestamp === initial.cursor.lastSeenTimestamp;
  if (sameSelection && sameCursor) return initial;

  return {
    ...initial,
    selectedPluginId: persisted.selectedPluginId,
    cursor: sameCursor
      ? initial.cursor
      : { lastSeenTimestamp: persisted.lastSeenTimestamp },
  };
}

/**
 * Validate arbitrary input (e.g. `JSON.parse(localStorage.getItem(...))`)
 * and return a well-typed `PluginBrowserPersistedState` on success,
 * `null` on any validation failure.
 *
 * Schema-version mismatch returns `null` — callers can treat that as
 * "unknown version, drop" or run their own migration up-front.
 */
export function parsePluginBrowserPersistedState(
  input: unknown,
): PluginBrowserPersistedState | null {
  if (input === null || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;

  if (o.schemaVersion !== PERSISTENCE_SCHEMA_VERSION) return null;

  const selected = o.selectedPluginId;
  if (selected !== null && typeof selected !== "string") return null;

  const cursor = o.lastSeenTimestamp;
  if (cursor !== null && typeof cursor !== "number") return null;
  if (typeof cursor === "number" && !Number.isFinite(cursor)) return null;

  return {
    schemaVersion: PERSISTENCE_SCHEMA_VERSION,
    selectedPluginId: selected,
    lastSeenTimestamp: cursor,
  };
}

/**
 * Convenience: parse a JSON string (e.g. `localStorage.getItem(k)`)
 * directly. Returns `null` on any JSON parse failure or validation
 * failure.
 */
export function parsePluginBrowserPersistedStateJson(
  json: string | null | undefined,
): PluginBrowserPersistedState | null {
  if (json === null || json === undefined) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  return parsePluginBrowserPersistedState(raw);
}

/**
 * Convenience: serialize + JSON.stringify in one step. Produces a
 * string ready to drop into `localStorage.setItem(...)`.
 */
export function stringifyPluginBrowserPersistedState(
  state: PluginBrowserState,
): string {
  return JSON.stringify(serializePluginBrowserState(state));
}

/**
 * Full-loop helper: given JSON input (or null), return a fresh
 * initial state with persisted fields rehydrated, or a clean
 * initial state if the JSON was absent or corrupt.
 */
export function bootPluginBrowserStateFromJson(
  json: string | null | undefined,
): PluginBrowserState {
  const persisted = parsePluginBrowserPersistedStateJson(json);
  if (!persisted) return initialPluginBrowserState();
  return rehydratePluginBrowserState(initialPluginBrowserState(), persisted);
}
