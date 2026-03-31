import { create } from "zustand";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProjectState {
  currentTeamId: string | null;
  currentGameId: string | null;
  currentProjectId: string | null;
  projectName: string | null;
  projectVersion: number;
  lockedBy: string | null;
}

interface PersistenceState {
  isSaving: boolean;
  isLoading: boolean;
  saveError: string | null;
  loadError: string | null;
  lastSavedAt: number | null;
  autoSaveEnabled: boolean;
}

interface ProjectStoreState {
  project: ProjectState;
  persistence: PersistenceState;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_PROJECT: ProjectState = {
  currentTeamId: null,
  currentGameId: null,
  currentProjectId: null,
  projectName: null,
  projectVersion: 0,
  lockedBy: null,
};

const DEFAULT_PERSISTENCE: PersistenceState = {
  isSaving: false,
  isLoading: false,
  saveError: null,
  loadError: null,
  lastSavedAt: null,
  autoSaveEnabled: true,
};

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

interface ProjectStore extends ProjectStoreState {
  // Actions
  setProject: (
    teamId: string,
    gameId: string,
    projectId: string,
    name: string,
    version: number,
  ) => void;
  clearProject: () => void;
  setProjectLock: (lockedBy: string | null) => void;
  updateProjectVersion: (version: number) => void;
  saveStart: () => void;
  saveSuccess: (savedAt: number, version: number) => void;
  saveError: (error: string) => void;
  loadStart: () => void;
  loadSuccess: () => void;
  loadError: (error: string) => void;
  setAutoSave: (enabled: boolean) => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useProjectStore = create<ProjectStore>()((set) => ({
  project: { ...DEFAULT_PROJECT },
  persistence: { ...DEFAULT_PERSISTENCE },

  setProject: (teamId, gameId, projectId, name, version) =>
    set({
      project: {
        currentTeamId: teamId,
        currentGameId: gameId,
        currentProjectId: projectId,
        projectName: name,
        projectVersion: version,
        lockedBy: null,
      },
    }),

  clearProject: () =>
    set({
      project: { ...DEFAULT_PROJECT },
      persistence: { ...DEFAULT_PERSISTENCE },
    }),

  setProjectLock: (lockedBy) =>
    set((state) => ({
      project: { ...state.project, lockedBy },
    })),

  updateProjectVersion: (version) =>
    set((state) => ({
      project: { ...state.project, projectVersion: version },
    })),

  saveStart: () =>
    set((state) => ({
      persistence: { ...state.persistence, isSaving: true, saveError: null },
    })),

  saveSuccess: (savedAt, version) =>
    set((state) => ({
      project: { ...state.project, projectVersion: version },
      persistence: {
        ...state.persistence,
        isSaving: false,
        saveError: null,
        lastSavedAt: savedAt,
      },
    })),

  saveError: (error) =>
    set((state) => ({
      persistence: { ...state.persistence, isSaving: false, saveError: error },
    })),

  loadStart: () =>
    set((state) => ({
      persistence: { ...state.persistence, isLoading: true, loadError: null },
    })),

  loadSuccess: () =>
    set((state) => ({
      persistence: {
        ...state.persistence,
        isLoading: false,
        loadError: null,
      },
    })),

  loadError: (error) =>
    set((state) => ({
      persistence: {
        ...state.persistence,
        isLoading: false,
        loadError: error,
      },
    })),

  setAutoSave: (enabled) =>
    set((state) => ({
      persistence: { ...state.persistence, autoSaveEnabled: enabled },
    })),
}));
