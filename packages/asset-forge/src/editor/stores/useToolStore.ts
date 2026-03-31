import { create } from "zustand";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StudioToolMode =
  | "select"
  | "place"
  | "brush"
  | "measure"
  | "path"
  | "procgen";

type BrushType = "terrain" | "biome" | "vegetation" | "collision";
type TerrainBrushMode = "raise" | "lower" | "smooth" | "flatten" | "erode";
type BiomePaintMode = "paint" | "erase";
type VegetationPaintMode = "plant" | "remove" | "density";
type BrushFalloff = "linear" | "smooth" | "constant" | "sphere";

interface BrushSettings {
  brushType: BrushType;
  radius: number;
  strength: number;
  falloff: BrushFalloff;
  terrainMode: TerrainBrushMode;
  biomeMode: BiomePaintMode;
  vegetationMode: VegetationPaintMode;
  selectedBiomeId: string | null;
  selectedSpecies: string | null;
  targetHeight: number;
}

interface ActivePlacement {
  category: string;
  templateId: string;
  templateName: string;
  position: { x: number; y: number; z: number };
  rotation: number;
  confirmed: boolean;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_BRUSH_SETTINGS: BrushSettings = {
  brushType: "terrain",
  radius: 5,
  strength: 0.5,
  falloff: "smooth",
  terrainMode: "raise",
  biomeMode: "paint",
  vegetationMode: "plant",
  selectedBiomeId: null,
  selectedSpecies: null,
  targetHeight: 0,
};

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

interface ToolStore {
  /** Currently active tool mode */
  activeTool: StudioToolMode;
  /** In-progress placement (non-null while placing an entity) */
  activePlacement: ActivePlacement | null;
  /** Brush configuration for terrain/biome/vegetation painting */
  brushSettings: BrushSettings;
  /** One-shot camera teleport target; consumed after the camera moves */
  cameraTeleportTarget: { x: number; y: number; z: number } | null;

  // Actions
  setTool: (tool: StudioToolMode) => void;
  startPlacement: (
    category: string,
    templateId: string,
    templateName: string,
  ) => void;
  updatePlacementPosition: (
    position: { x: number; y: number; z: number },
    rotation?: number,
  ) => void;
  confirmPlacement: () => void;
  cancelPlacement: () => void;
  setBrushSettings: (settings: Partial<BrushSettings>) => void;
  cameraTeleport: (target: { x: number; y: number; z: number }) => void;
  cameraTeleportConsumed: () => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useToolStore = create<ToolStore>()((set) => ({
  activeTool: "select",
  activePlacement: null,
  brushSettings: { ...DEFAULT_BRUSH_SETTINGS },
  cameraTeleportTarget: null,

  setTool: (tool) =>
    set((state) => ({
      activeTool: tool,
      // Clear placement when switching away from "place"
      activePlacement: tool !== "place" ? null : state.activePlacement,
    })),

  startPlacement: (category, templateId, templateName) =>
    set({
      activeTool: "place",
      activePlacement: {
        category,
        templateId,
        templateName,
        position: { x: 0, y: 0, z: 0 },
        rotation: 0,
        confirmed: false,
      },
    }),

  updatePlacementPosition: (position, rotation) =>
    set((state) => {
      if (!state.activePlacement) return state;
      return {
        activePlacement: {
          ...state.activePlacement,
          position,
          rotation: rotation ?? state.activePlacement.rotation,
        },
      };
    }),

  confirmPlacement: () =>
    set((state) => {
      if (!state.activePlacement) return state;
      return {
        activePlacement: { ...state.activePlacement, confirmed: true },
      };
    }),

  cancelPlacement: () => set({ activePlacement: null }),

  setBrushSettings: (settings) =>
    set((state) => ({
      brushSettings: { ...state.brushSettings, ...settings },
    })),

  cameraTeleport: (target) => set({ cameraTeleportTarget: target }),

  cameraTeleportConsumed: () => set({ cameraTeleportTarget: null }),
}));
