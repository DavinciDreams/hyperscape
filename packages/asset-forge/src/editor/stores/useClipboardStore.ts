/**
 * useClipboardStore — Zustand store for entity clipboard (Ctrl+C/V).
 *
 * Stores serialized entity data for copy/paste operations.
 * Also persists to localStorage for cross-session clipboard.
 */

import { create } from "zustand";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ClipboardEntry {
  /** Entity type (selection type, e.g., "spawnPoint", "npc") */
  entityType: string;
  /** Full entity data snapshot */
  data: Record<string, unknown>;
  /** Offset from group centroid (for multi-entity copy) */
  offset: { x: number; y: number; z: number };
}

interface ClipboardStore {
  /** Current clipboard buffer */
  buffer: ClipboardEntry[] | null;
  /** Copy entries to clipboard */
  copy: (entries: ClipboardEntry[]) => void;
  /** Read current buffer (returns null if empty) */
  paste: () => ClipboardEntry[] | null;
  /** Clear clipboard */
  clear: () => void;
}

// ---------------------------------------------------------------------------
// LocalStorage key
// ---------------------------------------------------------------------------

const LS_KEY = "ws-clipboard";

function saveToLocalStorage(entries: ClipboardEntry[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(entries));
  } catch {
    // Ignore quota errors
  }
}

function loadFromLocalStorage(): ClipboardEntry[] | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ClipboardEntry[];
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useClipboardStore = create<ClipboardStore>()((set, get) => ({
  buffer: loadFromLocalStorage(),

  copy: (entries) => {
    set({ buffer: entries });
    saveToLocalStorage(entries);
  },

  paste: () => {
    return get().buffer;
  },

  clear: () => {
    set({ buffer: null });
    try {
      localStorage.removeItem(LS_KEY);
    } catch {
      // Ignore
    }
  },
}));
