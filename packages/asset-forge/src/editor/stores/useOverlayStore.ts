import { create } from "zustand";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StudioViewportOverlays {
  biomeOverlay: boolean;
  audioZoneOverlay: boolean;
  difficultyOverlay: boolean;
  densityHeatmap: boolean;
  roadOverlay: boolean;
  timeOfDay: number | null;
  weatherPreview: "clear" | "rain" | "snow" | "fog" | null;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_OVERLAYS: StudioViewportOverlays = {
  biomeOverlay: false,
  audioZoneOverlay: false,
  difficultyOverlay: false,
  densityHeatmap: false,
  roadOverlay: false,
  timeOfDay: null,
  weatherPreview: null,
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
