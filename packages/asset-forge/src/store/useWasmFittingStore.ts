import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

import { ArmorFittingViewerRef } from "../components/ArmorFitting/ArmorFittingViewer";
import { Asset } from "../types";

interface WasmFittingState {
  // Selected items
  selectedAvatar: Asset | null;
  selectedArmor: Asset | null;
  assetTypeFilter: "avatar" | "armor";

  // Fitting parameters
  offset: number;
  sdfResolution: number;
  conformStrength: number;
  smoothingStrength: number;
  smoothingPasses: number;
  boundaryFalloff: number;

  // Fitting state
  isFitting: boolean;
  fittingProgress: number;
  fittingMessage: string;
  fittingStartTime: number | null;
  isArmorFitted: boolean;

  // UI
  showWireframe: boolean;
  lastError: string | null;
}

interface WasmFittingActions {
  // Asset selection
  setAssetTypeFilter: (type: "avatar" | "armor") => void;
  handleAssetSelect: (asset: Asset) => void;

  // Parameters
  setOffset: (offset: number) => void;
  setSdfResolution: (resolution: number) => void;
  setConformStrength: (strength: number) => void;
  setSmoothingStrength: (strength: number) => void;
  setSmoothingPasses: (passes: number) => void;
  setBoundaryFalloff: (falloff: number) => void;

  // Fitting
  performFitting: (
    viewerRef: React.RefObject<ArmorFittingViewerRef | null>,
  ) => Promise<void>;
  resetFitting: () => void;

  // Export
  exportFittedArmor: (
    viewerRef: React.RefObject<ArmorFittingViewerRef | null>,
  ) => Promise<void>;

  // UI
  setShowWireframe: (show: boolean) => void;
  clearError: () => void;

  // Selectors
  isReadyToFit: () => boolean;
  currentProgress: () => string;
}

export const useWasmFittingStore = create<
  WasmFittingState & WasmFittingActions
>()(
  immer((set, get) => ({
    // Initial state
    selectedAvatar: null,
    selectedArmor: null,
    assetTypeFilter: "avatar" as const,

    offset: 0.04,
    sdfResolution: 64,
    conformStrength: 0.9,
    smoothingStrength: 0.4,
    smoothingPasses: 4,
    boundaryFalloff: 0.8,

    isFitting: false,
    fittingProgress: 0,
    fittingMessage: "",
    fittingStartTime: null,
    isArmorFitted: false,

    showWireframe: false,
    lastError: null,

    // Actions
    setAssetTypeFilter: (type) => {
      set((state) => {
        state.assetTypeFilter = type;
      });
    },

    handleAssetSelect: (asset) => {
      set((state) => {
        if (asset.type === "character") {
          state.selectedAvatar = asset;
          state.assetTypeFilter = "armor";
          state.isArmorFitted = false;
        } else {
          state.selectedArmor = asset;
          state.isArmorFitted = false;
        }
      });
    },

    setOffset: (offset) => {
      set((state) => {
        state.offset = offset;
      });
    },

    setSdfResolution: (resolution) => {
      set((state) => {
        state.sdfResolution = resolution;
      });
    },

    setConformStrength: (strength) => {
      set((state) => {
        state.conformStrength = strength;
      });
    },

    setSmoothingStrength: (strength) => {
      set((state) => {
        state.smoothingStrength = strength;
      });
    },

    setSmoothingPasses: (passes) => {
      set((state) => {
        state.smoothingPasses = passes;
      });
    },

    setBoundaryFalloff: (falloff) => {
      set((state) => {
        state.boundaryFalloff = falloff;
      });
    },

    performFitting: async (viewerRef) => {
      const { selectedAvatar, selectedArmor, isFitting } = get();

      if (!viewerRef.current || !selectedAvatar || !selectedArmor) {
        set((state) => {
          state.lastError = "Missing avatar or armor selection";
        });
        return;
      }

      if (isFitting) return;

      set((state) => {
        state.isFitting = true;
        state.fittingProgress = 0;
        state.fittingMessage = "Preparing...";
        state.fittingStartTime = Date.now();
        state.lastError = null;
      });

      try {
        const {
          offset,
          sdfResolution,
          conformStrength,
          smoothingStrength,
          smoothingPasses,
          boundaryFalloff,
        } = get();

        await viewerRef.current.performWasmFitting({
          offset,
          sdfResolution,
          conformStrength,
          smoothingStrength,
          smoothingPasses,
          boundaryFalloff,
          onProgress: (progress: number, message?: string) => {
            set((state) => {
              state.fittingProgress = progress;
              if (message) {
                state.fittingMessage = message;
              }
            });
          },
        });

        set((state) => {
          state.fittingProgress = 100;
          state.fittingMessage = "Complete";
          state.isArmorFitted = true;
        });
      } catch (error) {
        console.error("WASM fitting failed:", error);
        set((state) => {
          state.lastError = `Fitting failed: ${(error as Error).message}`;
        });
      } finally {
        set((state) => {
          state.isFitting = false;
          state.fittingMessage = "";
          state.fittingStartTime = null;
        });
      }
    },

    resetFitting: () => {
      set((state) => {
        state.isArmorFitted = false;
        state.fittingProgress = 0;
        state.fittingMessage = "";
      });
    },

    exportFittedArmor: async (viewerRef) => {
      if (!viewerRef.current) {
        set((state) => {
          state.lastError = "Viewer not available";
        });
        return;
      }

      try {
        const buffer = await viewerRef.current.exportFittedModel();
        const blob = new Blob([buffer], { type: "model/gltf-binary" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "fitted-armor-sdf.glb";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } catch (error) {
        console.error("Export failed:", error);
        set((state) => {
          state.lastError = `Export failed: ${(error as Error).message}`;
        });
      }
    },

    setShowWireframe: (show) => {
      set((state) => {
        state.showWireframe = show;
      });
    },

    clearError: () => {
      set((state) => {
        state.lastError = null;
      });
    },

    isReadyToFit: () => {
      const { selectedAvatar, selectedArmor, isFitting } = get();
      return !!selectedAvatar && !!selectedArmor && !isFitting;
    },

    currentProgress: () => {
      const { fittingMessage, fittingProgress } = get();
      return fittingMessage || `${Math.round(fittingProgress)}%`;
    },
  })),
);
