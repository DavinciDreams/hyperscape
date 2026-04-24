/**
 * Pure per-plugin note/scratchpad ledger for the Plugin
 * Browser "My notes" sidebar.
 *
 * A plain free-form text string per plugin. Caller-supplied
 * content; no length or content validation beyond "empty
 * clears the note" (parity with UE5-style inline-edit "save
 * blank = delete"). Pure state, caller-owned instance, never
 * throws. Invalid ids silently no-op'd.
 */

export interface PluginBrowserNoteEntry {
  readonly pluginId: string;
  readonly note: string;
}

export interface PluginBrowserNotes {
  /** Note for `pluginId`, or undefined if none. */
  getNote(pluginId: string): string | undefined;
  /** True iff a non-empty note is stored for `pluginId`. */
  hasNote(pluginId: string): boolean;
  /**
   * Store a note. Empty string clears the note. Returns true
   * when the effective state changed. Invalid id → false.
   */
  setNote(pluginId: string, note: string): boolean;
  /**
   * Delete the note for `pluginId`. Returns true when a note
   * was removed.
   */
  clearNote(pluginId: string): boolean;
  /** Plugin ids with stored notes (insertion order). */
  pluginsWithNotes(): readonly string[];
  /** Count of notes. */
  noteCount(): number;
  /** Snapshot of every (pluginId, note) in insertion order. */
  entries(): readonly PluginBrowserNoteEntry[];
  /** Wipe everything. Returns true when non-empty. */
  clearAll(): boolean;
}

/**
 * Create a caller-owned notes ledger.
 */
export function createPluginBrowserNotes(): PluginBrowserNotes {
  const notes = new Map<string, string>();

  function isValidId(s: string): boolean {
    return typeof s === "string" && s.length > 0;
  }

  return {
    getNote(pluginId: string): string | undefined {
      if (!isValidId(pluginId)) return undefined;
      return notes.get(pluginId);
    },
    hasNote(pluginId: string): boolean {
      if (!isValidId(pluginId)) return false;
      return notes.has(pluginId);
    },
    setNote(pluginId: string, note: string): boolean {
      if (!isValidId(pluginId)) return false;
      if (typeof note !== "string") return false;
      if (note.length === 0) {
        return notes.delete(pluginId);
      }
      const prev = notes.get(pluginId);
      if (prev === note) return false;
      notes.set(pluginId, note);
      return true;
    },
    clearNote(pluginId: string): boolean {
      if (!isValidId(pluginId)) return false;
      return notes.delete(pluginId);
    },
    pluginsWithNotes(): readonly string[] {
      return [...notes.keys()];
    },
    noteCount(): number {
      return notes.size;
    },
    entries(): readonly PluginBrowserNoteEntry[] {
      const out: PluginBrowserNoteEntry[] = [];
      for (const [pluginId, note] of notes) {
        out.push({ pluginId, note });
      }
      return out;
    },
    clearAll(): boolean {
      if (notes.size === 0) return false;
      notes.clear();
      return true;
    },
  };
}
