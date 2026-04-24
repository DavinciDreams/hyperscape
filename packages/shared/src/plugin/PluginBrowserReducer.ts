/**
 * Pure reducer that consolidates every Plugin Browser state
 * transition behind a single `(state, action) => state` function.
 * React panels (or any UI shell) become thin `useReducer`
 * consumers — no bespoke orchestration in the view layer.
 *
 * Delegates to the existing pure transforms:
 *  - snapshot diff + toast pipeline on `snapshotRefreshed`
 *  - append to changelog on every refresh with non-empty intents
 *  - cursor advance on `markAllSeen`
 *  - details-pane selection on `selectPlugin` / `clearSelection`
 *
 * State is serializable via {@link savePluginBrowserEditorState}
 * for localStorage persistence.
 *
 * Pure transform. Never throws.
 */

import type { PluginBrowserChangelogState } from "./PluginBrowserChangelog.js";
import {
  appendPluginBrowserChangelog,
  emptyPluginBrowserChangelog,
} from "./PluginBrowserChangelog.js";
import type { PluginBrowserChangelogCursorState } from "./PluginBrowserChangelogCursor.js";
import {
  emptyPluginBrowserChangelogCursor,
  markPluginBrowserChangelogSeen,
} from "./PluginBrowserChangelogCursor.js";
import type { PluginBrowserRowSummary } from "./PluginBrowserRowSummary.js";
import type { PluginBrowserToastDisplay } from "./PluginBrowserToastDisplay.js";
import type { PluginBrowserToastOverflowDisplay } from "./PluginBrowserToastRender.js";
import { runPluginBrowserToastPipeline } from "./PluginBrowserToastPipeline.js";
import type { ToastSuppressionState } from "./PluginBrowserToastSuppression.js";
import { emptyToastSuppressionState } from "./PluginBrowserToastSuppression.js";

export type PluginBrowserSnapshot = ReadonlyMap<
  string,
  PluginBrowserRowSummary
>;

export interface PluginBrowserState {
  /** Most recent snapshot — drives the main table. */
  readonly currentSnapshot: PluginBrowserSnapshot;
  /** Last live toast surface (displays + overflow). */
  readonly displays: readonly PluginBrowserToastDisplay[];
  readonly overflow: PluginBrowserToastOverflowDisplay | null;
  readonly changelog: PluginBrowserChangelogState;
  readonly cursor: PluginBrowserChangelogCursorState;
  readonly toastSuppression: ToastSuppressionState;
  /** Currently selected plugin for the details pane; null = closed. */
  readonly selectedPluginId: string | null;
}

export function initialPluginBrowserState(): PluginBrowserState {
  return {
    currentSnapshot: new Map(),
    displays: [],
    overflow: null,
    changelog: emptyPluginBrowserChangelog(),
    cursor: emptyPluginBrowserChangelogCursor(),
    toastSuppression: emptyToastSuppressionState(),
    selectedPluginId: null,
  };
}

export type PluginBrowserAction =
  | {
      readonly type: "snapshotRefreshed";
      readonly snapshot: PluginBrowserSnapshot;
      readonly now: number;
      readonly cooldownMs?: number;
      readonly maxVisible?: number;
    }
  | { readonly type: "markAllSeen" }
  | { readonly type: "selectPlugin"; readonly pluginId: string }
  | { readonly type: "clearSelection" }
  | { readonly type: "clearChangelog" };

export function pluginBrowserReducer(
  state: PluginBrowserState,
  action: PluginBrowserAction,
): PluginBrowserState {
  switch (action.type) {
    case "snapshotRefreshed": {
      const r = runPluginBrowserToastPipeline({
        previousSnapshot: state.currentSnapshot,
        currentSnapshot: action.snapshot,
        previousSuppressionState: state.toastSuppression,
        now: action.now,
        cooldownMs: action.cooldownMs,
        maxVisible: action.maxVisible,
      });
      // Collect intents from the diff for the changelog. We derive
      // intents from the pipeline's own grouping output via its
      // displays[] → localization block; however, the cleanest
      // route is to re-derive via the NotificationPipeline's
      // `emitted`. The toast pipeline doesn't surface that list
      // directly, so we instead persist one entry per display
      // using the display's pluginId + severity pairing. To keep
      // the changelog faithful to per-intent granularity, we key
      // changelog growth off the pipeline's diff buckets:
      const intents: {
        readonly id: string;
        readonly pluginId: string;
        readonly kind:
          | "added"
          | "removed"
          | "regressed"
          | "recovered"
          | "label-changed";
        readonly severity: PluginBrowserRowSummary["severity"];
        readonly previous: PluginBrowserRowSummary | null;
        readonly current: PluginBrowserRowSummary | null;
      }[] = [];
      for (const change of r.diff.added) {
        const row = change.current;
        if (!row) continue;
        intents.push({
          id: `${change.pluginId}:added:${action.now}`,
          pluginId: change.pluginId,
          kind: "added",
          severity: row.severity,
          previous: null,
          current: row,
        });
      }
      for (const change of r.diff.removed) {
        const row = change.previous;
        if (!row) continue;
        intents.push({
          id: `${change.pluginId}:removed:${action.now}`,
          pluginId: change.pluginId,
          kind: "removed",
          severity: row.severity,
          previous: row,
          current: null,
        });
      }
      for (const change of r.diff.severityChanged) {
        const prev = change.previous;
        const curr = change.current;
        if (!prev || !curr) continue;
        const regressed =
          SEVERITY_RANK[curr.severity] > SEVERITY_RANK[prev.severity];
        intents.push({
          id: `${change.pluginId}:${regressed ? "regressed" : "recovered"}:${action.now}`,
          pluginId: change.pluginId,
          kind: regressed ? "regressed" : "recovered",
          severity: curr.severity,
          previous: prev,
          current: curr,
        });
      }
      for (const change of r.diff.labelChanged) {
        const prev = change.previous;
        const curr = change.current;
        if (!prev || !curr) continue;
        intents.push({
          id: `${change.pluginId}:label-changed:${action.now}`,
          pluginId: change.pluginId,
          kind: "label-changed",
          severity: curr.severity,
          previous: prev,
          current: curr,
        });
      }
      const nextChangelog =
        intents.length === 0
          ? state.changelog
          : appendPluginBrowserChangelog(state.changelog, {
              intents,
              now: action.now,
            });
      return {
        ...state,
        currentSnapshot: action.snapshot,
        displays: r.displays,
        overflow: r.overflow,
        toastSuppression: r.nextSuppressionState,
        changelog: nextChangelog,
      };
    }
    case "markAllSeen": {
      const nextCursor = markPluginBrowserChangelogSeen(
        state.changelog,
        state.cursor,
      );
      if (nextCursor === state.cursor) return state;
      return { ...state, cursor: nextCursor };
    }
    case "selectPlugin": {
      if (state.selectedPluginId === action.pluginId) return state;
      return { ...state, selectedPluginId: action.pluginId };
    }
    case "clearSelection": {
      if (state.selectedPluginId === null) return state;
      return { ...state, selectedPluginId: null };
    }
    case "clearChangelog": {
      if (state.changelog.entries.length === 0) return state;
      return {
        ...state,
        changelog: emptyPluginBrowserChangelog(state.changelog.maxEntries),
        cursor: emptyPluginBrowserChangelogCursor(),
      };
    }
  }
}

const SEVERITY_RANK: Readonly<
  Record<PluginBrowserRowSummary["severity"], number>
> = {
  ok: 0,
  info: 1,
  warning: 2,
  error: 3,
};
