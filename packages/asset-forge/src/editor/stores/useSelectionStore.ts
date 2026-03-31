import { create } from "zustand";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SelectionMode = "single" | "multi" | "box";

interface HoverInfo {
  type: string;
  id?: string;
  position?: { x: number; y: number; z: number };
  tileX?: number;
  tileZ?: number;
  [key: string]: unknown;
}

interface Selection {
  type: string;
  id: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

interface SelectionStore {
  /** Current selection */
  selection: Selection | null;
  /** What the mouse is hovering over */
  hovered: HoverInfo | null;
  /** Selection mode (single, multi, box) */
  selectionMode: SelectionMode;
  /** Multi-select accumulator */
  multiSelection: Selection[];

  // Actions
  setSelection: (selection: Selection | null) => void;
  setHovered: (info: HoverInfo | null) => void;
  setSelectionMode: (mode: SelectionMode) => void;
  addToMultiSelection: (selection: Selection) => void;
  removeFromMultiSelection: (id: string) => void;
  clearMultiSelection: () => void;
  /** Toggle a selection in/out of multi-selection (for Ctrl+Click) */
  toggleMultiSelection: (selection: Selection) => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useSelectionStore = create<SelectionStore>()((set) => ({
  selection: null,
  hovered: null,
  selectionMode: "single",
  multiSelection: [],

  setSelection: (selection) => set({ selection }),

  setHovered: (info) => set({ hovered: info }),

  setSelectionMode: (mode) => set({ selectionMode: mode }),

  addToMultiSelection: (selection) =>
    set((state) => {
      // Prevent duplicates by id
      if (state.multiSelection.some((s) => s.id === selection.id)) {
        return state;
      }
      return { multiSelection: [...state.multiSelection, selection] };
    }),

  removeFromMultiSelection: (id) =>
    set((state) => ({
      multiSelection: state.multiSelection.filter((s) => s.id !== id),
    })),

  clearMultiSelection: () => set({ multiSelection: [] }),

  toggleMultiSelection: (selection) =>
    set((state) => {
      const exists = state.multiSelection.some((s) => s.id === selection.id);
      if (exists) {
        return {
          multiSelection: state.multiSelection.filter(
            (s) => s.id !== selection.id,
          ),
        };
      }
      return { multiSelection: [...state.multiSelection, selection] };
    }),
}));
