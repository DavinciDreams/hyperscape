import { create } from "zustand";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type GenerationStatus = "idle" | "generating" | "error";
type ItemStatus = "generating" | "reviewing" | "accepted" | "rejected";

interface GeneratedDialogue {
  npcId: string;
  status: ItemStatus;
  nodes?: unknown[];
  error?: string;
}

interface GeneratedVoiceClip {
  npcId: string;
  dialogueNodeId: string;
  status: ItemStatus;
  audioUrl?: string;
}

interface GeneratedQuest {
  status: ItemStatus;
  quest?: unknown;
  error?: string;
}

interface AIGenerationState {
  status: GenerationStatus;
  activeEntityId: string | null;
  error: string | null;
  dialogues: GeneratedDialogue[];
  voiceClips: GeneratedVoiceClip[];
  quests: GeneratedQuest[];
}

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

type GenerationType = "dialogue" | "voice" | "quest";

interface AIStore extends AIGenerationState {
  startGeneration: (generationType: GenerationType, entityId: string) => void;
  completeGeneration: (
    generationType: GenerationType,
    entityId: string,
    result: unknown,
  ) => void;
  errorGeneration: (
    generationType: GenerationType,
    entityId: string,
    error: string,
  ) => void;
  acceptGeneration: (generationType: GenerationType, entityId: string) => void;
  rejectGeneration: (generationType: GenerationType, entityId: string) => void;
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const INITIAL_STATE: AIGenerationState = {
  status: "idle",
  activeEntityId: null,
  error: null,
  dialogues: [],
  voiceClips: [],
  quests: [],
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useAIStore = create<AIStore>()((set) => ({
  ...INITIAL_STATE,

  startGeneration: (generationType, entityId) =>
    set((state) => {
      const patch: Partial<AIGenerationState> = {
        status: "generating",
        activeEntityId: entityId,
        error: null,
      };

      if (generationType === "dialogue") {
        patch.dialogues = [
          ...state.dialogues.filter((d) => d.npcId !== entityId),
          { npcId: entityId, status: "generating" as const },
        ];
      } else if (generationType === "quest") {
        patch.quests = [...state.quests, { status: "generating" as const }];
      }

      return patch;
    }),

  completeGeneration: (generationType, entityId, result) =>
    set((state) => {
      const patch: Partial<AIGenerationState> = {
        status: "idle",
        activeEntityId: null,
      };

      if (generationType === "dialogue") {
        patch.dialogues = state.dialogues.map((d) =>
          d.npcId === entityId
            ? {
                ...d,
                status: "reviewing" as const,
                nodes: (result as { nodes: unknown[] }).nodes,
              }
            : d,
        );
      } else if (generationType === "voice") {
        patch.voiceClips = state.voiceClips.map((v) =>
          v.npcId === entityId && v.status === "generating"
            ? {
                ...v,
                status: "reviewing" as const,
                audioUrl: (result as { audioUrl: string }).audioUrl,
              }
            : v,
        );
      } else if (generationType === "quest") {
        patch.quests = state.quests.map((q) =>
          q.status === "generating"
            ? { ...q, status: "reviewing" as const, quest: result }
            : q,
        );
      }

      return patch;
    }),

  errorGeneration: (generationType, entityId, error) =>
    set((state) => {
      const patch: Partial<AIGenerationState> = {
        status: "error",
        error,
      };

      if (generationType === "dialogue") {
        patch.dialogues = state.dialogues.map((d) =>
          d.npcId === entityId
            ? { ...d, status: "rejected" as const, error }
            : d,
        );
      } else if (generationType === "voice") {
        patch.voiceClips = state.voiceClips.map((v) =>
          v.npcId === entityId && v.status === "generating"
            ? { ...v, status: "rejected" as const }
            : v,
        );
      } else if (generationType === "quest") {
        patch.quests = state.quests.map((q) =>
          q.status === "generating"
            ? { ...q, status: "rejected" as const, error }
            : q,
        );
      }

      return patch;
    }),

  acceptGeneration: (generationType, entityId) =>
    set((state) => {
      const patch: Partial<AIGenerationState> = {};

      if (generationType === "dialogue") {
        patch.dialogues = state.dialogues.map((d) =>
          d.npcId === entityId ? { ...d, status: "accepted" as const } : d,
        );
      } else if (generationType === "voice") {
        patch.voiceClips = state.voiceClips.map((v) =>
          v.npcId === entityId && v.status === "reviewing"
            ? { ...v, status: "accepted" as const }
            : v,
        );
      } else if (generationType === "quest") {
        patch.quests = state.quests.map((q) =>
          q.status === "reviewing" ? { ...q, status: "accepted" as const } : q,
        );
      }

      return patch;
    }),

  rejectGeneration: (generationType, entityId) =>
    set((state) => {
      const patch: Partial<AIGenerationState> = {};

      if (generationType === "dialogue") {
        patch.dialogues = state.dialogues.map((d) =>
          d.npcId === entityId ? { ...d, status: "rejected" as const } : d,
        );
      } else if (generationType === "voice") {
        patch.voiceClips = state.voiceClips.map((v) =>
          v.npcId === entityId && v.status === "reviewing"
            ? { ...v, status: "rejected" as const }
            : v,
        );
      } else if (generationType === "quest") {
        patch.quests = state.quests.map((q) =>
          q.status === "reviewing" ? { ...q, status: "rejected" as const } : q,
        );
      }

      return patch;
    }),
}));
