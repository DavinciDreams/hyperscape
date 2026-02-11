import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

import type { ArmorFittingViewerRef } from "../components/ArmorFitting/ArmorFittingViewer";
import type { Asset } from "../types";

type EquipmentSlot =
  | "body"
  | "legs"
  | "helmet"
  | "boots"
  | "gloves"
  | "cape"
  | "shield";

interface JobStatus {
  id: string;
  assetId: string;
  slot: string;
  status: "pending" | "processing" | "completed" | "failed";
  progress: number;
  message: string;
  outputPath: string | null;
  error: string | null;
  startedAt: number;
  completedAt: number | null;
}

interface EquipmentProcessingState {
  // Selected items
  selectedAvatar: Asset | null;
  selectedArmor: Asset | null;
  assetTypeFilter: "avatar" | "armor";

  // Processing parameters
  slot: EquipmentSlot;
  offset: number;
  maxInfluences: number;
  smoothingPasses: number;

  // Docker readiness
  dockerReady: boolean;
  dockerBuilding: boolean;

  // Job state
  processingJobId: string | null;
  jobStatus: JobStatus | null;
  isProcessing: boolean;
  isProcessed: boolean;

  // UI
  showWireframe: boolean;
  showPreview: boolean;
  lastError: string | null;
}

interface EquipmentProcessingActions {
  // Asset selection
  setAssetTypeFilter: (type: "avatar" | "armor") => void;
  handleAssetSelect: (asset: Asset) => void;

  // Parameters
  setSlot: (slot: EquipmentSlot) => void;
  setOffset: (offset: number) => void;
  setMaxInfluences: (maxInfluences: number) => void;
  setSmoothingPasses: (passes: number) => void;

  // Processing
  startProcessing: () => Promise<void>;
  resetProcessing: () => void;

  // Preview
  previewRiggedModel: (
    viewerRef: React.RefObject<ArmorFittingViewerRef | null>,
  ) => Promise<void>;

  // Export
  exportRiggedArmor: () => Promise<void>;

  // Docker
  checkDockerReady: () => Promise<void>;

  // UI
  setShowWireframe: (show: boolean) => void;
  setShowPreview: (show: boolean) => void;
  clearError: () => void;

  // Selectors
  isReadyToProcess: () => boolean;
}

const API_BASE = "/api/equipment";

export const useEquipmentProcessingStore = create<
  EquipmentProcessingState & EquipmentProcessingActions
>()(
  immer((set, get) => ({
    // Initial state
    selectedAvatar: null,
    selectedArmor: null,
    assetTypeFilter: "avatar" as const,

    slot: "body" as EquipmentSlot,
    offset: 0.05,
    maxInfluences: 4,
    smoothingPasses: 3,

    dockerReady: false,
    dockerBuilding: false,

    processingJobId: null,
    jobStatus: null,
    isProcessing: false,
    isProcessed: false,

    showWireframe: false,
    showPreview: false,
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
          state.isProcessed = false;
          state.showPreview = false;
        } else {
          state.selectedArmor = asset;
          state.isProcessed = false;
          state.showPreview = false;
        }
      });
    },

    setSlot: (slot) => {
      set((state) => {
        state.slot = slot;
      });
    },

    setOffset: (offset) => {
      set((state) => {
        state.offset = offset;
      });
    },

    setMaxInfluences: (maxInfluences) => {
      set((state) => {
        state.maxInfluences = maxInfluences;
      });
    },

    setSmoothingPasses: (passes) => {
      set((state) => {
        state.smoothingPasses = passes;
      });
    },

    startProcessing: async () => {
      const {
        selectedArmor,
        slot,
        offset,
        maxInfluences,
        smoothingPasses,
        isProcessing,
      } = get();

      if (!selectedArmor || isProcessing) {
        set((state) => {
          state.lastError = "No armor selected or already processing";
        });
        return;
      }

      set((state) => {
        state.isProcessing = true;
        state.isProcessed = false;
        state.lastError = null;
        state.showPreview = false;
      });

      try {
        // Start processing job
        const response = await fetch(`${API_BASE}/process`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            assetId: selectedArmor.id,
            slot,
            offset,
            maxInfluences,
            smoothingPasses,
          }),
        });

        if (!response.ok) {
          throw new Error(`Failed to start processing: ${response.statusText}`);
        }

        const { jobId } = (await response.json()) as { jobId: string };

        set((state) => {
          state.processingJobId = jobId;
        });

        // Poll for status
        await pollJobStatus(jobId, set);
      } catch (error) {
        console.error("Equipment processing failed:", error);
        set((state) => {
          state.lastError = `Processing failed: ${(error as Error).message}`;
          state.isProcessing = false;
        });
      }
    },

    resetProcessing: () => {
      set((state) => {
        state.isProcessed = false;
        state.isProcessing = false;
        state.processingJobId = null;
        state.jobStatus = null;
        state.showPreview = false;
        state.lastError = null;
      });
    },

    previewRiggedModel: async (viewerRef) => {
      const { selectedArmor, isProcessed } = get();

      if (!viewerRef.current || !selectedArmor || !isProcessed) {
        set((state) => {
          state.lastError = "Cannot preview: processing not complete";
        });
        return;
      }

      try {
        // Load rigged GLB via viewer's performEquipmentPreview method
        const riggedUrl = `/api/equipment/rigged/${selectedArmor.id}`;
        await (
          viewerRef.current as ArmorFittingViewerRef & {
            performEquipmentPreview: (url: string) => Promise<void>;
          }
        ).performEquipmentPreview(riggedUrl);

        set((state) => {
          state.showPreview = true;
        });
      } catch (error) {
        console.error("Preview failed:", error);
        set((state) => {
          state.lastError = `Preview failed: ${(error as Error).message}`;
        });
      }
    },

    exportRiggedArmor: async () => {
      const { selectedArmor, isProcessed } = get();

      if (!selectedArmor || !isProcessed) {
        set((state) => {
          state.lastError = "No processed armor to export";
        });
        return;
      }

      try {
        const riggedUrl = `/api/equipment/rigged/${selectedArmor.id}`;
        const response = await fetch(riggedUrl);

        if (!response.ok) {
          throw new Error(
            `Failed to download rigged model: ${response.statusText}`,
          );
        }

        const buffer = await response.arrayBuffer();
        const blob = new Blob([buffer], { type: "model/gltf-binary" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${selectedArmor.id}-rigged.glb`;
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

    checkDockerReady: async () => {
      try {
        const response = await fetch(`${API_BASE}/ready`);
        if (response.ok) {
          const data = (await response.json()) as {
            ready: boolean;
            building: boolean;
          };
          set((state) => {
            state.dockerReady = data.ready;
            state.dockerBuilding = data.building;
          });
        }
      } catch {
        // Server not reachable — leave as not ready
      }
    },

    setShowWireframe: (show) => {
      set((state) => {
        state.showWireframe = show;
      });
    },

    setShowPreview: (show) => {
      set((state) => {
        state.showPreview = show;
      });
    },

    clearError: () => {
      set((state) => {
        state.lastError = null;
      });
    },

    isReadyToProcess: () => {
      const { selectedArmor, isProcessing, dockerReady } = get();
      return !!selectedArmor && !isProcessing && dockerReady;
    },
  })),
);

/** Poll the job status endpoint until completion or failure. */
async function pollJobStatus(
  jobId: string,
  set: (fn: (state: EquipmentProcessingState) => void) => void,
) {
  const POLL_INTERVAL = 1500;
  const MAX_POLLS = 200; // ~5 minutes max

  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));

    try {
      const response = await fetch(`${API_BASE}/process/${jobId}`);
      if (!response.ok) continue;

      const job = (await response.json()) as JobStatus;

      set((state) => {
        state.jobStatus = job;
      });

      if (job.status === "completed") {
        set((state) => {
          state.isProcessing = false;
          state.isProcessed = true;
        });
        return;
      }

      if (job.status === "failed") {
        set((state) => {
          state.isProcessing = false;
          state.lastError = job.error || "Processing failed";
        });
        return;
      }
    } catch (error) {
      console.warn("Poll error:", error);
    }
  }

  // Timeout
  set((state) => {
    state.isProcessing = false;
    state.lastError = "Processing timed out";
  });
}
