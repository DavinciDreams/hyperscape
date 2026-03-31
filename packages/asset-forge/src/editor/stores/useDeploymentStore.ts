import { create } from "zustand";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DeployTarget = "staging" | "production";

interface DeploymentDiff {
  added: string[];
  modified: string[];
  removed: string[];
  manifestChanges: Array<{
    name: string;
    type: "added" | "modified" | "removed";
  }>;
}

interface DeploymentRecord {
  id: string;
  target: DeployTarget;
  status: "success" | "failed" | "rolled-back";
  deployedAt: string;
  deployedBy: string;
  version: number;
  diff: DeploymentDiff;
  notes?: string;
}

interface PendingPromotion {
  id: string;
  requestedBy: string;
  requestedAt: string;
  diff: DeploymentDiff;
}

interface DeploymentState {
  stagingStatus:
    | "idle"
    | "compiling"
    | "deploying"
    | "validating"
    | "success"
    | "error";
  productionStatus:
    | "idle"
    | "deploying"
    | "pending-approval"
    | "success"
    | "error";
  error: string | null;
  currentDiff: DeploymentDiff | null;
  isComputingDiff: boolean;
  history: DeploymentRecord[];
  pendingPromotion: PendingPromotion | null;
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const INITIAL_STATE: DeploymentState = {
  stagingStatus: "idle",
  productionStatus: "idle",
  error: null,
  currentDiff: null,
  isComputingDiff: false,
  history: [],
  pendingPromotion: null,
};

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

interface DeploymentStore extends DeploymentState {
  // Staging actions
  deployStagingStart: () => void;
  deployStagingStatus: (
    status: DeploymentState["stagingStatus"],
    error?: string,
  ) => void;
  deployStagingComplete: (record: DeploymentRecord) => void;

  // Production actions
  deployProductionStart: () => void;
  deployProductionStatus: (
    status: DeploymentState["productionStatus"],
    error?: string,
  ) => void;
  deployProductionComplete: (record: DeploymentRecord) => void;

  // Diff actions
  deployDiffStart: () => void;
  deployDiffComplete: (diff: DeploymentDiff) => void;

  // History actions
  deployHistoryLoad: (history: DeploymentRecord[]) => void;
  deployRollback: (deploymentId: string) => void;

  // Promotion actions
  deployPromotionRequest: (
    id: string,
    requestedBy: string,
    diff: DeploymentDiff,
  ) => void;
  deployPromotionApprove: () => void;
  deployPromotionReject: () => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useDeploymentStore = create<DeploymentStore>()((set) => ({
  ...INITIAL_STATE,

  // -- Staging --------------------------------------------------------------

  deployStagingStart: () => set({ stagingStatus: "compiling", error: null }),

  deployStagingStatus: (status, error) =>
    set({ stagingStatus: status, error: error ?? null }),

  deployStagingComplete: (record) =>
    set((state) => ({
      stagingStatus: "success",
      error: null,
      history: [record, ...state.history],
    })),

  // -- Production -----------------------------------------------------------

  deployProductionStart: () =>
    set({ productionStatus: "deploying", error: null }),

  deployProductionStatus: (status, error) =>
    set({ productionStatus: status, error: error ?? null }),

  deployProductionComplete: (record) =>
    set((state) => ({
      productionStatus: "success",
      error: null,
      history: [record, ...state.history],
    })),

  // -- Diff -----------------------------------------------------------------

  deployDiffStart: () => set({ isComputingDiff: true, currentDiff: null }),

  deployDiffComplete: (diff) =>
    set({ isComputingDiff: false, currentDiff: diff }),

  // -- History --------------------------------------------------------------

  deployHistoryLoad: (history) => set({ history }),

  deployRollback: (deploymentId) =>
    set((state) => ({
      history: state.history.map((record) =>
        record.id === deploymentId
          ? { ...record, status: "rolled-back" as const }
          : record,
      ),
    })),

  // -- Promotion ------------------------------------------------------------

  deployPromotionRequest: (id, requestedBy, diff) =>
    set({
      productionStatus: "pending-approval",
      pendingPromotion: {
        id,
        requestedBy,
        requestedAt: new Date().toISOString(),
        diff,
      },
    }),

  deployPromotionApprove: () =>
    set({ productionStatus: "deploying", pendingPromotion: null }),

  deployPromotionReject: () =>
    set({ productionStatus: "idle", pendingPromotion: null }),
}));
