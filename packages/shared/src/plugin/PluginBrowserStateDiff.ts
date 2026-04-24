/**
 * Pure diff between two consecutive {@link PluginBrowserState}
 * values, emitting a flat list of semantic change events suitable
 * for telemetry, logging, and devtools.
 *
 * The view layer already re-renders reactively via the store; this
 * module exists for _observers_ — analytics sinks, developer logs,
 * replay capture — that want to know "what changed" at a higher
 * level than "state identity moved".
 *
 * Wire-up pattern:
 *
 *   let prev = store.getState();
 *   store.subscribe((next) => {
 *     for (const ev of diffPluginBrowserState(prev, next)) {
 *       telemetry.emit(ev);
 *     }
 *     prev = next;
 *   });
 *
 * All events carry minimal payloads — the consumer can always
 * re-query `next` for more detail. Events are emitted in a stable,
 * deterministic order so snapshot-based tests work.
 *
 * Pure transforms / helpers. Never throw.
 */

import type { PluginBrowserState } from "./PluginBrowserReducer.js";
import type { PluginRowSummarySeverity } from "./PluginBrowserRowSummary.js";

/** Discriminated union of diff events. */
export type PluginBrowserStateDiffEvent =
  | {
      readonly kind: "selectionChanged";
      readonly from: string | null;
      readonly to: string | null;
    }
  | {
      readonly kind: "snapshotAdded";
      readonly pluginId: string;
      readonly severity: PluginRowSummarySeverity;
    }
  | {
      readonly kind: "snapshotRemoved";
      readonly pluginId: string;
    }
  | {
      readonly kind: "snapshotSeverityChanged";
      readonly pluginId: string;
      readonly from: PluginRowSummarySeverity;
      readonly to: PluginRowSummarySeverity;
    }
  | {
      readonly kind: "changelogAppended";
      readonly addedCount: number;
      readonly totalCount: number;
    }
  | {
      readonly kind: "changelogCleared";
    }
  | {
      readonly kind: "cursorAdvanced";
      readonly from: number | null;
      readonly to: number | null;
    }
  | {
      readonly kind: "toastSurfaceChanged";
      readonly from: number;
      readonly to: number;
    };

/**
 * Diff two successive state values. Returns an empty array when
 * nothing of interest changed (including when `prev === next`).
 *
 * Emission order (stable):
 *   1. selectionChanged
 *   2. snapshotRemoved (one per removed id, lexicographic)
 *   3. snapshotAdded (one per new id, lexicographic)
 *   4. snapshotSeverityChanged (one per id whose severity moved,
 *      lexicographic)
 *   5. changelogCleared | changelogAppended (at most one)
 *   6. cursorAdvanced
 *   7. toastSurfaceChanged
 */
export function diffPluginBrowserState(
  prev: PluginBrowserState,
  next: PluginBrowserState,
): readonly PluginBrowserStateDiffEvent[] {
  if (prev === next) return [];
  const events: PluginBrowserStateDiffEvent[] = [];

  // 1. selection
  if (prev.selectedPluginId !== next.selectedPluginId) {
    events.push({
      kind: "selectionChanged",
      from: prev.selectedPluginId,
      to: next.selectedPluginId,
    });
  }

  // 2–4. snapshot diff (only when the map identity moved)
  if (prev.currentSnapshot !== next.currentSnapshot) {
    const prevSnap = prev.currentSnapshot;
    const nextSnap = next.currentSnapshot;

    // Removed
    const removed: string[] = [];
    for (const id of prevSnap.keys()) {
      if (!nextSnap.has(id)) removed.push(id);
    }
    removed.sort();
    for (const pluginId of removed) {
      events.push({ kind: "snapshotRemoved", pluginId });
    }

    // Added
    const added: string[] = [];
    for (const id of nextSnap.keys()) {
      if (!prevSnap.has(id)) added.push(id);
    }
    added.sort();
    for (const pluginId of added) {
      const row = nextSnap.get(pluginId);
      if (!row) continue;
      events.push({
        kind: "snapshotAdded",
        pluginId,
        severity: row.severity,
      });
    }

    // Severity-changed (only ids present in both)
    const severityMoved: string[] = [];
    for (const id of nextSnap.keys()) {
      const prevRow = prevSnap.get(id);
      const nextRow = nextSnap.get(id);
      if (!prevRow || !nextRow) continue;
      if (prevRow.severity !== nextRow.severity) severityMoved.push(id);
    }
    severityMoved.sort();
    for (const pluginId of severityMoved) {
      const prevRow = prevSnap.get(pluginId);
      const nextRow = nextSnap.get(pluginId);
      if (!prevRow || !nextRow) continue;
      events.push({
        kind: "snapshotSeverityChanged",
        pluginId,
        from: prevRow.severity,
        to: nextRow.severity,
      });
    }
  }

  // 5. changelog
  if (prev.changelog !== next.changelog) {
    const prevCount = prev.changelog.entries.length;
    const nextCount = next.changelog.entries.length;
    if (nextCount === 0 && prevCount > 0) {
      events.push({ kind: "changelogCleared" });
    } else if (nextCount > prevCount) {
      events.push({
        kind: "changelogAppended",
        addedCount: nextCount - prevCount,
        totalCount: nextCount,
      });
    }
  }

  // 6. cursor
  if (prev.cursor !== next.cursor) {
    const from = prev.cursor.lastSeenTimestamp;
    const to = next.cursor.lastSeenTimestamp;
    if (from !== to) {
      events.push({ kind: "cursorAdvanced", from, to });
    }
  }

  // 7. toast surface (displays + overflow count)
  const prevSurface = toastSurfaceCount(prev);
  const nextSurface = toastSurfaceCount(next);
  if (prevSurface !== nextSurface) {
    events.push({
      kind: "toastSurfaceChanged",
      from: prevSurface,
      to: nextSurface,
    });
  }

  return events;
}

function toastSurfaceCount(state: PluginBrowserState): number {
  return state.displays.length + (state.overflow ? state.overflow.count : 0);
}
