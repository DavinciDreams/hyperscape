/**
 * Bundle + versioned-envelope for the Plugin Browser's editor-only
 * persistent state. Combines all caller-owned state shapes
 * (changelog ring buffer + cursor + toast-suppression cache) behind
 * a single `save` / `load` pair suitable for `localStorage` or the
 * editor preferences store.
 *
 * Pure transforms. Never throws at the persistence boundary —
 * malformed or wrong-version input yields a fresh default state
 * plus a diagnostic report instead of throwing.
 */

import type { PluginBrowserChangelogState } from "./PluginBrowserChangelog.js";
import {
  DEFAULT_MAX_CHANGELOG_ENTRIES,
  emptyPluginBrowserChangelog,
} from "./PluginBrowserChangelog.js";
import type { PluginBrowserChangelogCursorState } from "./PluginBrowserChangelogCursor.js";
import { emptyPluginBrowserChangelogCursor } from "./PluginBrowserChangelogCursor.js";
import type { ToastSuppressionState } from "./PluginBrowserToastSuppression.js";
import { emptyToastSuppressionState } from "./PluginBrowserToastSuppression.js";

export const PLUGIN_BROWSER_EDITOR_STATE_VERSION = 1 as const;

export interface PluginBrowserEditorState {
  readonly changelog: PluginBrowserChangelogState;
  readonly cursor: PluginBrowserChangelogCursorState;
  readonly toastSuppression: ToastSuppressionState;
}

export function emptyPluginBrowserEditorState(
  maxChangelogEntries: number = DEFAULT_MAX_CHANGELOG_ENTRIES,
): PluginBrowserEditorState {
  return {
    changelog: emptyPluginBrowserChangelog(maxChangelogEntries),
    cursor: emptyPluginBrowserChangelogCursor(),
    toastSuppression: emptyToastSuppressionState(),
  };
}

// ---------- Serialized envelope ----------

/**
 * Serializable form — `Map` flattened to plain object for safe
 * `JSON.stringify` round-trip through localStorage.
 */
export interface SerializedPluginBrowserEditorState {
  readonly changelog: PluginBrowserChangelogState;
  readonly cursor: PluginBrowserChangelogCursorState;
  readonly toastSuppression: {
    readonly shown: Readonly<Record<string, number>>;
  };
}

export interface PluginBrowserEditorStateEnvelope {
  readonly version: typeof PLUGIN_BROWSER_EDITOR_STATE_VERSION;
  readonly state: SerializedPluginBrowserEditorState;
}

function serializeSuppression(
  s: ToastSuppressionState,
): SerializedPluginBrowserEditorState["toastSuppression"] {
  const shown: Record<string, number> = {};
  for (const [k, v] of s.shown) shown[k] = v;
  return { shown };
}

export function savePluginBrowserEditorState(
  state: PluginBrowserEditorState,
): PluginBrowserEditorStateEnvelope {
  return {
    version: PLUGIN_BROWSER_EDITOR_STATE_VERSION,
    state: {
      changelog: state.changelog,
      cursor: state.cursor,
      toastSuppression: serializeSuppression(state.toastSuppression),
    },
  };
}

export type PluginBrowserEditorStateLoadIssue =
  | "non-object-input"
  | "missing-version"
  | "unsupported-version"
  | "missing-state"
  | "malformed-changelog"
  | "malformed-cursor"
  | "malformed-suppression";

export interface PluginBrowserEditorStateLoadResult {
  readonly state: PluginBrowserEditorState;
  /** Non-empty when the input was falsy, malformed, or wrong-version. */
  readonly issues: readonly PluginBrowserEditorStateLoadIssue[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseChangelog(
  value: unknown,
  issues: PluginBrowserEditorStateLoadIssue[],
): PluginBrowserChangelogState {
  if (!isRecord(value)) {
    issues.push("malformed-changelog");
    return emptyPluginBrowserChangelog();
  }
  const entries = value.entries;
  const maxEntries = value.maxEntries;
  if (!Array.isArray(entries) || typeof maxEntries !== "number") {
    issues.push("malformed-changelog");
    return emptyPluginBrowserChangelog();
  }
  return { entries, maxEntries } as PluginBrowserChangelogState;
}

function parseCursor(
  value: unknown,
  issues: PluginBrowserEditorStateLoadIssue[],
): PluginBrowserChangelogCursorState {
  if (!isRecord(value)) {
    issues.push("malformed-cursor");
    return emptyPluginBrowserChangelogCursor();
  }
  const t = value.lastSeenTimestamp;
  if (t !== null && typeof t !== "number") {
    issues.push("malformed-cursor");
    return emptyPluginBrowserChangelogCursor();
  }
  return { lastSeenTimestamp: t };
}

function parseSuppression(
  value: unknown,
  issues: PluginBrowserEditorStateLoadIssue[],
): ToastSuppressionState {
  if (!isRecord(value)) {
    issues.push("malformed-suppression");
    return emptyToastSuppressionState();
  }
  const shown = value.shown;
  if (!isRecord(shown)) {
    issues.push("malformed-suppression");
    return emptyToastSuppressionState();
  }
  const out = new Map<string, number>();
  for (const [k, v] of Object.entries(shown)) {
    if (typeof v !== "number") {
      issues.push("malformed-suppression");
      return emptyToastSuppressionState();
    }
    out.set(k, v);
  }
  return { shown: out };
}

export function loadPluginBrowserEditorState(
  raw: unknown,
): PluginBrowserEditorStateLoadResult {
  const issues: PluginBrowserEditorStateLoadIssue[] = [];
  if (!isRecord(raw)) {
    return {
      state: emptyPluginBrowserEditorState(),
      issues: ["non-object-input"],
    };
  }
  if (!("version" in raw)) {
    return {
      state: emptyPluginBrowserEditorState(),
      issues: ["missing-version"],
    };
  }
  if (raw.version !== PLUGIN_BROWSER_EDITOR_STATE_VERSION) {
    return {
      state: emptyPluginBrowserEditorState(),
      issues: ["unsupported-version"],
    };
  }
  if (!("state" in raw) || !isRecord(raw.state)) {
    return {
      state: emptyPluginBrowserEditorState(),
      issues: ["missing-state"],
    };
  }
  const inner = raw.state;
  const state: PluginBrowserEditorState = {
    changelog: parseChangelog(inner.changelog, issues),
    cursor: parseCursor(inner.cursor, issues),
    toastSuppression: parseSuppression(inner.toastSuppression, issues),
  };
  return { state, issues };
}
