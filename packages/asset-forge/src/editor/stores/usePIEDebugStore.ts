/**
 * usePIEDebugStore — Zustand store for the PIE Debug Console.
 *
 * Receives debug entries from the PlayTestWorld script runner while a PIE
 * session is active. The PIE Console panel reads from this store to render
 * a live, scrolling log of trigger fires, action emits, and errors —
 * mirroring UE5's "Output Log" during Play-in-Editor.
 *
 * Lives outside the WorldStudio reducer because:
 *  - debug entries are high-frequency (one per script tick) and would balloon
 *    the undo/redo history if stored there;
 *  - they are runtime-only and have no relevance to project save state.
 *
 * The buffer is bounded to MAX_ENTRIES so a long-running PIE session doesn't
 * leak memory.
 */

import { create } from "zustand";
import type { PIEDebugEntry } from "@hyperforge/shared/runtime";

/** Maximum number of entries kept in memory. Older entries are dropped. */
const MAX_ENTRIES = 500;

interface PIEDebugStore {
  /** Most-recent-last list of debug entries (capped at MAX_ENTRIES). */
  entries: PIEDebugEntry[];
  /** Append a single entry (called by PIE script runner via debugSink). */
  append: (entry: PIEDebugEntry) => void;
  /** Clear all entries. Called when PIE starts or the user hits "Clear". */
  clear: () => void;
}

export const usePIEDebugStore = create<PIEDebugStore>()((set) => ({
  entries: [],

  append: (entry) =>
    set((state) => {
      const next =
        state.entries.length >= MAX_ENTRIES
          ? // drop oldest, keep newest
            [
              ...state.entries.slice(state.entries.length - MAX_ENTRIES + 1),
              entry,
            ]
          : [...state.entries, entry];
      return { entries: next };
    }),

  clear: () => set({ entries: [] }),
}));
