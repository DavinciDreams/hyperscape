import { create } from "zustand";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StudioViewportOverlays {
  biomeOverlay: boolean;
  difficultyOverlay: boolean;
  zoneOverlay: boolean;
  timeOfDay: number | null;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_OVERLAYS: StudioViewportOverlays = {
  biomeOverlay: false,
  difficultyOverlay: false,
  zoneOverlay: true,
  timeOfDay: null,
};

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

interface OverlayStore extends StudioViewportOverlays {
  // Actions
  setOverlay: (overlay: Partial<StudioViewportOverlays>) => void;
  resetOverlays: () => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useOverlayStore = create<OverlayStore>()((set) => ({
  ...DEFAULT_OVERLAYS,

  setOverlay: (overlay) => set((state) => ({ ...state, ...overlay })),

  resetOverlays: () => set(DEFAULT_OVERLAYS),
}));
