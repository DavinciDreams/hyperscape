/**
 * World Studio Context
 *
 * State management for the unified world authoring tool (Phase 2).
 * Composes WorldBuilderContext's reducer for world editing state and adds
 * studio-specific state: project/team context, server persistence, and tool modes.
 */

import type {
  TerrainNoiseConfig,
  BiomeConfig,
  IslandConfig,
} from "@hyperscape/procgen/terrain";
import React, {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
} from "react";

import type { VegetationConfig } from "../WorldBuilder/types";
import type { GameEntityData } from "../WorldBuilder/TileBasedTerrain";

import type {
  WorldBuilderState,
  WorldBuilderAction,
  WorldBuilderMode,
  WorldCreationConfig,
  WorldData,
  Selection,
  SelectionMode,
  HoverInfo,
  CameraMode,
  ViewportOverlays,
  BiomeOverride,
  TownOverride,
  PlacedNPC,
  PlacedQuest,
  PlacedBoss,
  PlacedEvent,
  PlacedLore,
  DifficultyZone,
  CustomPlacement,
  CreationModeState,
  HierarchyNode,
  WorldPosition,
} from "../WorldBuilder/types";

import {
  worldBuilderReducer,
  worldBuilderInitialState,
} from "../WorldBuilder/WorldBuilderContext";

import type {
  ActivePlacement,
  ExtendedWorldLayers,
  ManifestData,
  ManifestItem,
  ManifestQuest,
  ManifestStore,
  ManifestNPC,
  ManifestCombatSpell,
  ManifestPrayer,
  ManifestRecipe,
  ManifestAmmunition,
  ManifestRune,
  ManifestSkillUnlock,
  ManifestTierRequirement,
  ManifestDuelArena,
  PlacedSpawnPoint,
  PlacedTeleport,
  PlacedMobSpawn,
  PlacedResource,
  PlacedStation,
  PlacedPOI,
  PlacedWaterBody,
  PaletteCategory,
  BrushSettings,
  BrushOverlays,
  BrushType,
  TerrainBrushMode,
  BiomePaintMode,
  VegetationPaintMode,
  BrushFalloff,
  TerrainSculptStroke,
  BiomePaintStroke,
  VegetationPaintStroke,
  AudioLayers,
  MusicZone,
  AmbientZone,
  SFXTrigger,
  AIGenerationState,
  GeneratedDialogue,
  GeneratedQuest,
  DeploymentState,
  DeploymentDiff,
  DeploymentRecord,
  DeployTarget,
} from "./types";
import {
  EMPTY_EXTENDED_LAYERS,
  EMPTY_MANIFEST_DATA,
  DEFAULT_BRUSH_SETTINGS,
  EMPTY_BRUSH_OVERLAYS,
  EMPTY_AUDIO_LAYERS,
  EMPTY_AI_GENERATION_STATE,
  EMPTY_DEPLOYMENT_STATE,
} from "./types";

import { useStoreSync } from "../../editor/stores/useStoreSync";

// ============== STUDIO-SPECIFIC TYPES ==============

/** Team/project context from the Phase 1 API */
interface StudioProjectState {
  currentTeamId: string | null;
  currentGameId: string | null;
  currentProjectId: string | null;
  projectName: string | null;
  projectVersion: number;
  lockedBy: string | null;
}

/** Server persistence state */
interface StudioPersistenceState {
  isSaving: boolean;
  isLoading: boolean;
  saveError: string | null;
  loadError: string | null;
  lastSavedAt: number | null;
  autoSaveEnabled: boolean;
}

/** Tool modes — select is default, others unlock in Phase 3+ */
export type StudioToolMode = "select" | "place" | "brush" | "path" | "procgen";

/** Transform gizmo mode */
export type GizmoTransformMode = "translate" | "rotate" | "scale";
/** Transform coordinate space */
export type GizmoTransformSpace = "world" | "local";

interface StudioToolState {
  activeTool: StudioToolMode;
  /** Active placement ghost (when place tool is active) */
  activePlacement: ActivePlacement | null;
  /** Brush settings (when brush tool is active) */
  brushSettings: BrushSettings;
  /** Camera teleport request from minimap (consumed by viewport) */
  cameraTeleportTarget: {
    x: number;
    y: number;
    z: number;
    close?: boolean;
  } | null;
  /** Transform gizmo mode (translate/rotate/scale) */
  transformMode: GizmoTransformMode;
  /** Transform coordinate space (world/local) */
  transformSpace: GizmoTransformSpace;
}

/** Studio-specific viewport overlay toggles and preview settings */
export interface StudioViewportOverlays {
  /** Show biome color overlay on terrain */
  biomeOverlay: boolean;
  /** Show audio zone boundaries */
  audioZoneOverlay: boolean;
  /** Show difficulty zone boundaries */
  difficultyOverlay: boolean;
  /** Show entity density heatmap */
  densityHeatmap: boolean;
  /** Show road network overlay */
  roadOverlay: boolean;
  /** Day/night time-of-day (0-24 hours, null = default lighting) */
  timeOfDay: number | null;
  /** Weather preview mode */
  weatherPreview: "clear" | "rain" | "snow" | "fog" | null;
}

const DEFAULT_VIEWPORT_OVERLAYS: StudioViewportOverlays = {
  biomeOverlay: false,
  audioZoneOverlay: false,
  difficultyOverlay: false,
  densityHeatmap: false,
  roadOverlay: false,
  timeOfDay: null,
  weatherPreview: null,
};

// ============== COMBINED STATE ==============

export interface WorldStudioState {
  /** All world builder state (creation, editing, viewport, history) */
  builder: WorldBuilderState;
  /** Current team/game/project context */
  project: StudioProjectState;
  /** Server persistence tracking */
  persistence: StudioPersistenceState;
  /** Active tool and tool options */
  tools: StudioToolState;
  /** Phase 3+ extended placement layers */
  extendedLayers: ExtendedWorldLayers;
  /** Loaded manifest data for entity palette */
  manifests: ManifestData;
  /** Non-destructive brush stroke overlays */
  brushOverlays: BrushOverlays;
  /** Phase 7: Audio zone layers */
  audioLayers: AudioLayers;
  /** Phase 7: AI content generation state */
  aiGeneration: AIGenerationState;
  /** Phase 8: Deployment pipeline state */
  deployment: DeploymentState;
  /** Phase 9: Viewport overlay settings */
  overlays: StudioViewportOverlays;
  /** Entity data from game manifest (world-areas.json), populated by GameWorldEntitySync */
  gameEntities: GameEntityData | null;
}

// ============== ACTION TYPES ==============

/** Studio-specific actions (project, persistence, tools, placement) */
type StudioSpecificAction =
  // Project actions
  | {
      type: "SET_PROJECT";
      teamId: string;
      gameId: string;
      projectId: string;
      name: string;
      version: number;
    }
  | { type: "CLEAR_PROJECT" }
  | { type: "SET_PROJECT_LOCK"; lockedBy: string | null }
  | { type: "UPDATE_PROJECT_VERSION"; version: number }

  // Persistence actions
  | { type: "SAVE_START" }
  | { type: "SAVE_SUCCESS"; savedAt: number; version: number }
  | { type: "SAVE_ERROR"; error: string }
  | { type: "LOAD_START" }
  | { type: "LOAD_SUCCESS" }
  | { type: "LOAD_ERROR"; error: string }
  | { type: "SET_AUTO_SAVE"; enabled: boolean }

  // Tool actions
  | { type: "SET_TOOL"; tool: StudioToolMode }
  | { type: "SET_TRANSFORM_MODE"; mode: GizmoTransformMode }
  | { type: "SET_TRANSFORM_SPACE"; space: GizmoTransformSpace }
  | { type: "CAMERA_TELEPORT"; target: { x: number; y: number; z: number } }
  | { type: "CAMERA_TELEPORT_CONSUMED" }

  // Placement actions
  | {
      type: "START_PLACEMENT";
      category: PaletteCategory;
      templateId: string;
      templateName: string;
    }
  | {
      type: "UPDATE_PLACEMENT_POSITION";
      position: WorldPosition;
      rotation?: number;
    }
  | { type: "CONFIRM_PLACEMENT" }
  | { type: "CANCEL_PLACEMENT" }

  // Extended layer entity actions — Spawn Points
  | { type: "ADD_SPAWN_POINT"; spawnPoint: PlacedSpawnPoint }
  | {
      type: "UPDATE_SPAWN_POINT";
      id: string;
      updates: Partial<PlacedSpawnPoint>;
    }
  | { type: "REMOVE_SPAWN_POINT"; id: string }

  // Extended layer entity actions — Teleports
  | { type: "ADD_TELEPORT"; teleport: PlacedTeleport }
  | { type: "UPDATE_TELEPORT"; id: string; updates: Partial<PlacedTeleport> }
  | { type: "REMOVE_TELEPORT"; id: string }

  // Extended layer entity actions — Mob Spawns
  | { type: "ADD_MOB_SPAWN"; mobSpawn: PlacedMobSpawn }
  | { type: "UPDATE_MOB_SPAWN"; id: string; updates: Partial<PlacedMobSpawn> }
  | { type: "REMOVE_MOB_SPAWN"; id: string }

  // Extended layer entity actions — Resources
  | { type: "ADD_RESOURCE"; resource: PlacedResource }
  | { type: "UPDATE_RESOURCE"; id: string; updates: Partial<PlacedResource> }
  | { type: "REMOVE_RESOURCE"; id: string }

  // Extended layer entity actions — Stations
  | { type: "ADD_STATION"; station: PlacedStation }
  | { type: "UPDATE_STATION"; id: string; updates: Partial<PlacedStation> }
  | { type: "REMOVE_STATION"; id: string }

  // Brush tool actions
  | { type: "SET_BRUSH_SETTINGS"; settings: Partial<BrushSettings> }
  | { type: "ADD_TERRAIN_SCULPT"; stroke: TerrainSculptStroke }
  | { type: "ADD_BIOME_PAINT"; stroke: BiomePaintStroke }
  | { type: "ADD_VEGETATION_PAINT"; stroke: VegetationPaintStroke }
  | {
      type: "SET_TILE_COLLISION";
      tiles: Array<{ tileX: number; tileZ: number; blocked: boolean }>;
    }
  | { type: "UNDO_LAST_BRUSH_STROKE"; brushType: BrushType }
  | { type: "CLEAR_BRUSH_OVERLAYS"; brushType?: BrushType }

  // Extended layer entity actions — POIs
  | { type: "ADD_POI"; poi: PlacedPOI }
  | { type: "UPDATE_POI"; id: string; updates: Partial<PlacedPOI> }
  | { type: "REMOVE_POI"; id: string }

  // Extended layer entity actions — Water Bodies
  | { type: "ADD_WATER_BODY"; waterBody: PlacedWaterBody }
  | { type: "UPDATE_WATER_BODY"; id: string; updates: Partial<PlacedWaterBody> }
  | { type: "REMOVE_WATER_BODY"; id: string }

  // Manifest loading
  | { type: "MANIFESTS_LOAD_START" }
  | {
      type: "MANIFESTS_LOAD_SUCCESS";
      data: Omit<ManifestData, "loaded" | "loading" | "error">;
    }
  | { type: "MANIFESTS_LOAD_ERROR"; error: string }

  // Manifest editing — update individual manifest data in local state
  | { type: "MANIFEST_UPDATE_RAW"; name: string; content: unknown }
  | { type: "MANIFEST_UPDATE_ITEMS"; items: ManifestItem[] }
  | { type: "MANIFEST_UPDATE_QUESTS"; quests: ManifestQuest[] }
  | { type: "MANIFEST_UPDATE_STORES"; stores: ManifestStore[] }
  | { type: "MANIFEST_UPDATE_NPCS"; npcs: ManifestNPC[] }
  | {
      type: "MANIFEST_UPDATE_COMBAT_SPELLS";
      combatSpells: ManifestCombatSpell[];
    }
  | { type: "MANIFEST_UPDATE_PRAYERS"; prayers: ManifestPrayer[] }
  | { type: "MANIFEST_UPDATE_RECIPES"; recipes: ManifestRecipe[] }
  | { type: "MANIFEST_UPDATE_AMMUNITION"; ammunition: ManifestAmmunition[] }
  | { type: "MANIFEST_UPDATE_RUNES"; runes: ManifestRune[] }
  | {
      type: "MANIFEST_UPDATE_SKILL_UNLOCKS";
      skillUnlocks: ManifestSkillUnlock[];
    }
  | {
      type: "MANIFEST_UPDATE_TIER_REQUIREMENTS";
      tierRequirements: ManifestTierRequirement[];
    }
  | { type: "MANIFEST_UPDATE_DUEL_ARENAS"; duelArenas: ManifestDuelArena[] }

  // Phase 7: Audio zone actions
  | { type: "ADD_MUSIC_ZONE"; zone: MusicZone }
  | { type: "UPDATE_MUSIC_ZONE"; id: string; updates: Partial<MusicZone> }
  | { type: "REMOVE_MUSIC_ZONE"; id: string }
  | { type: "ADD_AMBIENT_ZONE"; zone: AmbientZone }
  | { type: "UPDATE_AMBIENT_ZONE"; id: string; updates: Partial<AmbientZone> }
  | { type: "REMOVE_AMBIENT_ZONE"; id: string }
  | { type: "ADD_SFX_TRIGGER"; trigger: SFXTrigger }
  | { type: "UPDATE_SFX_TRIGGER"; id: string; updates: Partial<SFXTrigger> }
  | { type: "REMOVE_SFX_TRIGGER"; id: string }

  // Phase 7: AI generation actions
  | {
      type: "AI_GENERATION_START";
      generationType: "dialogue" | "voice" | "quest";
      entityId: string;
    }
  | {
      type: "AI_GENERATION_COMPLETE";
      generationType: "dialogue" | "voice" | "quest";
      entityId: string;
      result: unknown;
    }
  | {
      type: "AI_GENERATION_ERROR";
      generationType: "dialogue" | "voice" | "quest";
      entityId: string;
      error: string;
    }
  | {
      type: "AI_GENERATION_ACCEPT";
      generationType: "dialogue" | "voice" | "quest";
      entityId: string;
    }
  | {
      type: "AI_GENERATION_REJECT";
      generationType: "dialogue" | "voice" | "quest";
      entityId: string;
    }
  // Phase 8: Deployment pipeline
  | { type: "DEPLOY_STAGING_START" }
  | {
      type: "DEPLOY_STAGING_STATUS";
      status: DeploymentState["stagingStatus"];
      error?: string;
    }
  | { type: "DEPLOY_STAGING_COMPLETE"; record: DeploymentRecord }
  | { type: "DEPLOY_PRODUCTION_START" }
  | {
      type: "DEPLOY_PRODUCTION_STATUS";
      status: DeploymentState["productionStatus"];
      error?: string;
    }
  | { type: "DEPLOY_PRODUCTION_COMPLETE"; record: DeploymentRecord }
  | { type: "DEPLOY_DIFF_START" }
  | { type: "DEPLOY_DIFF_COMPLETE"; diff: DeploymentDiff }
  | { type: "DEPLOY_HISTORY_LOAD"; history: DeploymentRecord[] }
  | { type: "DEPLOY_ROLLBACK"; deploymentId: string }
  | {
      type: "DEPLOY_PROMOTION_REQUEST";
      id: string;
      requestedBy: string;
      diff: DeploymentDiff;
    }
  | { type: "DEPLOY_PROMOTION_APPROVE"; approvedBy: string }
  | { type: "DEPLOY_PROMOTION_REJECT" }
  // Phase 9: Viewport overlays
  | { type: "SET_OVERLAY"; overlay: Partial<StudioViewportOverlays> }
  // Game entity data from manifest
  | { type: "SET_GAME_ENTITIES"; data: GameEntityData };

/** Union of all world builder + studio-specific actions */
export type WorldStudioAction = WorldBuilderAction | StudioSpecificAction;

// ============== INITIAL STATE ==============

const initialProjectState: StudioProjectState = {
  currentTeamId: null,
  currentGameId: null,
  currentProjectId: null,
  projectName: null,
  projectVersion: 0,
  lockedBy: null,
};

const initialPersistenceState: StudioPersistenceState = {
  isSaving: false,
  isLoading: false,
  saveError: null,
  loadError: null,
  lastSavedAt: null,
  autoSaveEnabled: true,
};

const initialToolState: StudioToolState = {
  activeTool: "select",
  activePlacement: null,
  brushSettings: DEFAULT_BRUSH_SETTINGS,
  cameraTeleportTarget: null,
  transformMode: "translate",
  transformSpace: "world",
};

const initialState: WorldStudioState = {
  builder: worldBuilderInitialState,
  project: initialProjectState,
  persistence: initialPersistenceState,
  tools: initialToolState,
  extendedLayers: EMPTY_EXTENDED_LAYERS,
  manifests: EMPTY_MANIFEST_DATA,
  brushOverlays: EMPTY_BRUSH_OVERLAYS,
  audioLayers: EMPTY_AUDIO_LAYERS,
  aiGeneration: EMPTY_AI_GENERATION_STATE,
  deployment: EMPTY_DEPLOYMENT_STATE,
  overlays: DEFAULT_VIEWPORT_OVERLAYS,
  gameEntities: null,
};

// ============== REDUCER ==============

/** Handle studio-specific actions; returns null if action is not studio-specific */
function studioReducer(
  state: WorldStudioState,
  action: WorldStudioAction,
): WorldStudioState | null {
  switch (action.type) {
    // Project actions
    case "SET_PROJECT":
      return {
        ...state,
        project: {
          ...state.project,
          currentTeamId: action.teamId,
          currentGameId: action.gameId,
          currentProjectId: action.projectId,
          projectName: action.name,
          projectVersion: action.version,
        },
      };

    case "CLEAR_PROJECT":
      return {
        ...state,
        project: initialProjectState,
        persistence: initialPersistenceState,
      };

    case "SET_PROJECT_LOCK":
      return {
        ...state,
        project: {
          ...state.project,
          lockedBy: action.lockedBy,
        },
      };

    case "UPDATE_PROJECT_VERSION":
      return {
        ...state,
        project: {
          ...state.project,
          projectVersion: action.version,
        },
      };

    // Persistence actions
    case "SAVE_START":
      return {
        ...state,
        persistence: {
          ...state.persistence,
          isSaving: true,
          saveError: null,
        },
      };

    case "SAVE_SUCCESS":
      return {
        ...state,
        project: {
          ...state.project,
          projectVersion: action.version,
        },
        persistence: {
          ...state.persistence,
          isSaving: false,
          lastSavedAt: action.savedAt,
          saveError: null,
        },
        // Mark builder state as saved
        builder: {
          ...state.builder,
          editing: {
            ...state.builder.editing,
            hasUnsavedChanges: false,
            saveError: null,
          },
        },
      };

    case "SAVE_ERROR":
      return {
        ...state,
        persistence: {
          ...state.persistence,
          isSaving: false,
          saveError: action.error,
        },
      };

    case "LOAD_START":
      return {
        ...state,
        persistence: {
          ...state.persistence,
          isLoading: true,
          loadError: null,
        },
      };

    case "LOAD_SUCCESS":
      return {
        ...state,
        persistence: {
          ...state.persistence,
          isLoading: false,
          loadError: null,
        },
      };

    case "LOAD_ERROR":
      return {
        ...state,
        persistence: {
          ...state.persistence,
          isLoading: false,
          loadError: action.error,
        },
      };

    case "SET_AUTO_SAVE":
      return {
        ...state,
        persistence: {
          ...state.persistence,
          autoSaveEnabled: action.enabled,
        },
      };

    // Tool actions
    case "SET_TOOL":
      return {
        ...state,
        tools: {
          ...state.tools,
          activeTool: action.tool,
          // Clear active placement when switching away from place tool
          activePlacement:
            action.tool !== "place" ? null : state.tools.activePlacement,
        },
      };

    case "SET_TRANSFORM_MODE":
      return {
        ...state,
        tools: { ...state.tools, transformMode: action.mode },
      };
    case "SET_TRANSFORM_SPACE":
      return {
        ...state,
        tools: { ...state.tools, transformSpace: action.space },
      };

    case "CAMERA_TELEPORT":
      return {
        ...state,
        tools: { ...state.tools, cameraTeleportTarget: action.target },
      };
    case "CAMERA_TELEPORT_CONSUMED":
      return {
        ...state,
        tools: { ...state.tools, cameraTeleportTarget: null },
      };

    // Placement actions
    case "START_PLACEMENT":
      return {
        ...state,
        tools: {
          ...state.tools,
          activeTool: "place",
          activePlacement: {
            category: action.category,
            templateId: action.templateId,
            templateName: action.templateName,
            position: { x: 0, y: 0, z: 0 },
            rotation: 0,
            confirmed: false,
          },
        },
      };

    case "UPDATE_PLACEMENT_POSITION":
      if (!state.tools.activePlacement) return state;
      return {
        ...state,
        tools: {
          ...state.tools,
          activePlacement: {
            ...state.tools.activePlacement,
            position: action.position,
            rotation: action.rotation ?? state.tools.activePlacement.rotation,
          },
        },
      };

    case "CONFIRM_PLACEMENT":
      if (!state.tools.activePlacement) return state;
      return {
        ...state,
        tools: {
          ...state.tools,
          activePlacement: {
            ...state.tools.activePlacement,
            confirmed: true,
          },
        },
      };

    case "CANCEL_PLACEMENT":
      return {
        ...state,
        tools: {
          ...state.tools,
          activePlacement: null,
        },
      };

    // Extended layer entity actions — Spawn Points
    case "ADD_SPAWN_POINT":
      return {
        ...state,
        extendedLayers: {
          ...state.extendedLayers,
          spawnPoints: [...state.extendedLayers.spawnPoints, action.spawnPoint],
        },
      };

    case "UPDATE_SPAWN_POINT":
      return {
        ...state,
        extendedLayers: {
          ...state.extendedLayers,
          spawnPoints: state.extendedLayers.spawnPoints.map((sp) =>
            sp.id === action.id ? { ...sp, ...action.updates } : sp,
          ),
        },
      };

    case "REMOVE_SPAWN_POINT":
      return {
        ...state,
        extendedLayers: {
          ...state.extendedLayers,
          spawnPoints: state.extendedLayers.spawnPoints.filter(
            (sp) => sp.id !== action.id,
          ),
        },
      };

    // Extended layer entity actions — Teleports
    case "ADD_TELEPORT":
      return {
        ...state,
        extendedLayers: {
          ...state.extendedLayers,
          teleports: [...state.extendedLayers.teleports, action.teleport],
        },
      };

    case "UPDATE_TELEPORT":
      return {
        ...state,
        extendedLayers: {
          ...state.extendedLayers,
          teleports: state.extendedLayers.teleports.map((tp) =>
            tp.id === action.id ? { ...tp, ...action.updates } : tp,
          ),
        },
      };

    case "REMOVE_TELEPORT":
      return {
        ...state,
        extendedLayers: {
          ...state.extendedLayers,
          teleports: state.extendedLayers.teleports.filter(
            (tp) => tp.id !== action.id,
          ),
        },
      };

    // Extended layer entity actions — Mob Spawns
    case "ADD_MOB_SPAWN":
      return {
        ...state,
        extendedLayers: {
          ...state.extendedLayers,
          mobSpawns: [...state.extendedLayers.mobSpawns, action.mobSpawn],
        },
      };

    case "UPDATE_MOB_SPAWN":
      return {
        ...state,
        extendedLayers: {
          ...state.extendedLayers,
          mobSpawns: state.extendedLayers.mobSpawns.map((ms) =>
            ms.id === action.id ? { ...ms, ...action.updates } : ms,
          ),
        },
      };

    case "REMOVE_MOB_SPAWN":
      return {
        ...state,
        extendedLayers: {
          ...state.extendedLayers,
          mobSpawns: state.extendedLayers.mobSpawns.filter(
            (ms) => ms.id !== action.id,
          ),
        },
      };

    // Extended layer entity actions — Resources
    case "ADD_RESOURCE":
      return {
        ...state,
        extendedLayers: {
          ...state.extendedLayers,
          resources: [...state.extendedLayers.resources, action.resource],
        },
      };

    case "UPDATE_RESOURCE":
      return {
        ...state,
        extendedLayers: {
          ...state.extendedLayers,
          resources: state.extendedLayers.resources.map((r) =>
            r.id === action.id ? { ...r, ...action.updates } : r,
          ),
        },
      };

    case "REMOVE_RESOURCE":
      return {
        ...state,
        extendedLayers: {
          ...state.extendedLayers,
          resources: state.extendedLayers.resources.filter(
            (r) => r.id !== action.id,
          ),
        },
      };

    // Extended layer entity actions — Stations
    case "ADD_STATION":
      return {
        ...state,
        extendedLayers: {
          ...state.extendedLayers,
          stations: [...state.extendedLayers.stations, action.station],
        },
      };

    case "UPDATE_STATION":
      return {
        ...state,
        extendedLayers: {
          ...state.extendedLayers,
          stations: state.extendedLayers.stations.map((s) =>
            s.id === action.id ? { ...s, ...action.updates } : s,
          ),
        },
      };

    case "REMOVE_STATION":
      return {
        ...state,
        extendedLayers: {
          ...state.extendedLayers,
          stations: state.extendedLayers.stations.filter(
            (s) => s.id !== action.id,
          ),
        },
      };

    // Extended layer entity actions — POIs
    case "ADD_POI":
      return {
        ...state,
        extendedLayers: {
          ...state.extendedLayers,
          pois: [...state.extendedLayers.pois, action.poi],
        },
      };

    case "UPDATE_POI":
      return {
        ...state,
        extendedLayers: {
          ...state.extendedLayers,
          pois: state.extendedLayers.pois.map((p) =>
            p.id === action.id ? { ...p, ...action.updates } : p,
          ),
        },
      };

    case "REMOVE_POI":
      return {
        ...state,
        extendedLayers: {
          ...state.extendedLayers,
          pois: state.extendedLayers.pois.filter((p) => p.id !== action.id),
        },
      };

    // Extended layer entity actions — Water Bodies
    case "ADD_WATER_BODY":
      return {
        ...state,
        extendedLayers: {
          ...state.extendedLayers,
          waterBodies: [...state.extendedLayers.waterBodies, action.waterBody],
        },
      };

    case "UPDATE_WATER_BODY":
      return {
        ...state,
        extendedLayers: {
          ...state.extendedLayers,
          waterBodies: state.extendedLayers.waterBodies.map((w) =>
            w.id === action.id ? { ...w, ...action.updates } : w,
          ),
        },
      };

    case "REMOVE_WATER_BODY":
      return {
        ...state,
        extendedLayers: {
          ...state.extendedLayers,
          waterBodies: state.extendedLayers.waterBodies.filter(
            (w) => w.id !== action.id,
          ),
        },
      };

    // Brush tool actions
    case "SET_BRUSH_SETTINGS":
      return {
        ...state,
        tools: {
          ...state.tools,
          brushSettings: { ...state.tools.brushSettings, ...action.settings },
        },
      };

    case "ADD_TERRAIN_SCULPT":
      return {
        ...state,
        brushOverlays: {
          ...state.brushOverlays,
          terrainSculpts: [
            ...state.brushOverlays.terrainSculpts,
            action.stroke,
          ],
        },
      };

    case "ADD_BIOME_PAINT":
      return {
        ...state,
        brushOverlays: {
          ...state.brushOverlays,
          biomePaints: [...state.brushOverlays.biomePaints, action.stroke],
        },
      };

    case "ADD_VEGETATION_PAINT":
      return {
        ...state,
        brushOverlays: {
          ...state.brushOverlays,
          vegetationPaints: [
            ...state.brushOverlays.vegetationPaints,
            action.stroke,
          ],
        },
      };

    case "SET_TILE_COLLISION": {
      // Upsert tile collision overrides by (tileX, tileZ) key
      const existing = [...state.brushOverlays.tileCollisions];
      for (const tile of action.tiles) {
        const idx = existing.findIndex(
          (t) => t.tileX === tile.tileX && t.tileZ === tile.tileZ,
        );
        if (idx >= 0) {
          existing[idx] = { ...existing[idx], blocked: tile.blocked };
        } else {
          existing.push(tile);
        }
      }
      return {
        ...state,
        brushOverlays: { ...state.brushOverlays, tileCollisions: existing },
      };
    }

    case "UNDO_LAST_BRUSH_STROKE": {
      const overlays = { ...state.brushOverlays };
      switch (action.brushType) {
        case "terrain":
          overlays.terrainSculpts = overlays.terrainSculpts.slice(0, -1);
          break;
        case "biome":
          overlays.biomePaints = overlays.biomePaints.slice(0, -1);
          break;
        case "vegetation":
          overlays.vegetationPaints = overlays.vegetationPaints.slice(0, -1);
          break;
        case "collision":
          // Remove last N tile collision entries (batch)
          overlays.tileCollisions = overlays.tileCollisions.slice(0, -1);
          break;
      }
      return { ...state, brushOverlays: overlays };
    }

    case "CLEAR_BRUSH_OVERLAYS":
      if (action.brushType) {
        const cleared = { ...state.brushOverlays };
        switch (action.brushType) {
          case "terrain":
            cleared.terrainSculpts = [];
            break;
          case "biome":
            cleared.biomePaints = [];
            break;
          case "vegetation":
            cleared.vegetationPaints = [];
            break;
          case "collision":
            cleared.tileCollisions = [];
            break;
        }
        return { ...state, brushOverlays: cleared };
      }
      return { ...state, brushOverlays: EMPTY_BRUSH_OVERLAYS };

    // Manifest loading
    case "MANIFESTS_LOAD_START":
      return {
        ...state,
        manifests: {
          ...state.manifests,
          loading: true,
          error: null,
        },
      };

    case "MANIFESTS_LOAD_SUCCESS":
      return {
        ...state,
        manifests: {
          ...EMPTY_MANIFEST_DATA,
          ...action.data,
          loaded: true,
          loading: false,
          error: null,
        },
      };

    case "MANIFESTS_LOAD_ERROR":
      return {
        ...state,
        manifests: {
          ...state.manifests,
          loading: false,
          error: action.error,
        },
      };

    // Manifest editing — update raw manifest in local state
    case "MANIFEST_UPDATE_RAW":
      return {
        ...state,
        manifests: {
          ...state.manifests,
          rawManifests: {
            ...state.manifests.rawManifests,
            [action.name]: action.content,
          },
        },
      };

    case "MANIFEST_UPDATE_ITEMS":
      return {
        ...state,
        manifests: { ...state.manifests, items: action.items },
      };

    case "MANIFEST_UPDATE_QUESTS":
      return {
        ...state,
        manifests: { ...state.manifests, quests: action.quests },
      };

    case "MANIFEST_UPDATE_STORES":
      return {
        ...state,
        manifests: { ...state.manifests, stores: action.stores },
      };
    case "MANIFEST_UPDATE_NPCS":
      return {
        ...state,
        manifests: { ...state.manifests, npcs: action.npcs },
      };
    case "MANIFEST_UPDATE_COMBAT_SPELLS":
      return {
        ...state,
        manifests: { ...state.manifests, combatSpells: action.combatSpells },
      };
    case "MANIFEST_UPDATE_PRAYERS":
      return {
        ...state,
        manifests: { ...state.manifests, prayers: action.prayers },
      };
    case "MANIFEST_UPDATE_RECIPES":
      return {
        ...state,
        manifests: { ...state.manifests, recipes: action.recipes },
      };
    case "MANIFEST_UPDATE_AMMUNITION":
      return {
        ...state,
        manifests: { ...state.manifests, ammunition: action.ammunition },
      };
    case "MANIFEST_UPDATE_RUNES":
      return {
        ...state,
        manifests: { ...state.manifests, runes: action.runes },
      };
    case "MANIFEST_UPDATE_SKILL_UNLOCKS":
      return {
        ...state,
        manifests: { ...state.manifests, skillUnlocks: action.skillUnlocks },
      };
    case "MANIFEST_UPDATE_TIER_REQUIREMENTS":
      return {
        ...state,
        manifests: {
          ...state.manifests,
          tierRequirements: action.tierRequirements,
        },
      };
    case "MANIFEST_UPDATE_DUEL_ARENAS":
      return {
        ...state,
        manifests: { ...state.manifests, duelArenas: action.duelArenas },
      };

    // Phase 7: Audio zone CRUD
    case "ADD_MUSIC_ZONE":
      return {
        ...state,
        audioLayers: {
          ...state.audioLayers,
          musicZones: [...state.audioLayers.musicZones, action.zone],
        },
      };
    case "UPDATE_MUSIC_ZONE":
      return {
        ...state,
        audioLayers: {
          ...state.audioLayers,
          musicZones: state.audioLayers.musicZones.map((z) =>
            z.id === action.id ? { ...z, ...action.updates } : z,
          ),
        },
      };
    case "REMOVE_MUSIC_ZONE":
      return {
        ...state,
        audioLayers: {
          ...state.audioLayers,
          musicZones: state.audioLayers.musicZones.filter(
            (z) => z.id !== action.id,
          ),
        },
      };
    case "ADD_AMBIENT_ZONE":
      return {
        ...state,
        audioLayers: {
          ...state.audioLayers,
          ambientZones: [...state.audioLayers.ambientZones, action.zone],
        },
      };
    case "UPDATE_AMBIENT_ZONE":
      return {
        ...state,
        audioLayers: {
          ...state.audioLayers,
          ambientZones: state.audioLayers.ambientZones.map((z) =>
            z.id === action.id ? { ...z, ...action.updates } : z,
          ),
        },
      };
    case "REMOVE_AMBIENT_ZONE":
      return {
        ...state,
        audioLayers: {
          ...state.audioLayers,
          ambientZones: state.audioLayers.ambientZones.filter(
            (z) => z.id !== action.id,
          ),
        },
      };
    case "ADD_SFX_TRIGGER":
      return {
        ...state,
        audioLayers: {
          ...state.audioLayers,
          sfxTriggers: [...state.audioLayers.sfxTriggers, action.trigger],
        },
      };
    case "UPDATE_SFX_TRIGGER":
      return {
        ...state,
        audioLayers: {
          ...state.audioLayers,
          sfxTriggers: state.audioLayers.sfxTriggers.map((t) =>
            t.id === action.id ? { ...t, ...action.updates } : t,
          ),
        },
      };
    case "REMOVE_SFX_TRIGGER":
      return {
        ...state,
        audioLayers: {
          ...state.audioLayers,
          sfxTriggers: state.audioLayers.sfxTriggers.filter(
            (t) => t.id !== action.id,
          ),
        },
      };

    // Phase 7: AI generation state tracking
    case "AI_GENERATION_START": {
      const gen = {
        ...state.aiGeneration,
        status: "generating" as const,
        activeEntityId: action.entityId,
        error: null,
      };
      if (action.generationType === "dialogue") {
        gen.dialogues = [
          ...gen.dialogues.filter((d) => d.npcId !== action.entityId),
          { npcId: action.entityId, status: "generating" as const },
        ];
      } else if (action.generationType === "quest") {
        gen.quests = [...gen.quests, { status: "generating" as const }];
      }
      return { ...state, aiGeneration: gen };
    }
    case "AI_GENERATION_COMPLETE": {
      const gen = {
        ...state.aiGeneration,
        status: "idle" as const,
        activeEntityId: null,
      };
      if (action.generationType === "dialogue") {
        gen.dialogues = gen.dialogues.map((d) =>
          d.npcId === action.entityId
            ? {
                ...d,
                status: "reviewing" as const,
                nodes: (action.result as { nodes: GeneratedDialogue["nodes"] })
                  .nodes,
              }
            : d,
        );
      } else if (action.generationType === "voice") {
        gen.voiceClips = gen.voiceClips.map((v) =>
          v.npcId === action.entityId && v.status === "generating"
            ? {
                ...v,
                status: "reviewing" as const,
                audioUrl: (action.result as { audioUrl: string }).audioUrl,
              }
            : v,
        );
      } else if (action.generationType === "quest") {
        gen.quests = gen.quests.map((q) =>
          q.status === "generating"
            ? {
                ...q,
                status: "reviewing" as const,
                quest: action.result as GeneratedQuest["quest"],
              }
            : q,
        );
      }
      return { ...state, aiGeneration: gen };
    }
    case "AI_GENERATION_ERROR": {
      const gen = {
        ...state.aiGeneration,
        status: "error" as const,
        error: action.error,
      };
      if (action.generationType === "dialogue") {
        gen.dialogues = gen.dialogues.map((d) =>
          d.npcId === action.entityId
            ? { ...d, status: "rejected" as const, error: action.error }
            : d,
        );
      } else if (action.generationType === "voice") {
        gen.voiceClips = gen.voiceClips.map((v) =>
          v.npcId === action.entityId && v.status === "generating"
            ? { ...v, status: "rejected" as const }
            : v,
        );
      } else if (action.generationType === "quest") {
        gen.quests = gen.quests.map((q) =>
          q.status === "generating"
            ? { ...q, status: "rejected" as const, error: action.error }
            : q,
        );
      }
      return { ...state, aiGeneration: gen };
    }
    case "AI_GENERATION_ACCEPT": {
      const gen = { ...state.aiGeneration };
      if (action.generationType === "dialogue") {
        gen.dialogues = gen.dialogues.map((d) =>
          d.npcId === action.entityId
            ? { ...d, status: "accepted" as const }
            : d,
        );
      } else if (action.generationType === "voice") {
        gen.voiceClips = gen.voiceClips.map((v) =>
          v.npcId === action.entityId && v.status === "reviewing"
            ? { ...v, status: "accepted" as const }
            : v,
        );
      } else if (action.generationType === "quest") {
        gen.quests = gen.quests.map((q) =>
          q.status === "reviewing" ? { ...q, status: "accepted" as const } : q,
        );
      }
      return { ...state, aiGeneration: gen };
    }
    case "AI_GENERATION_REJECT": {
      const gen = { ...state.aiGeneration };
      if (action.generationType === "dialogue") {
        gen.dialogues = gen.dialogues.map((d) =>
          d.npcId === action.entityId
            ? { ...d, status: "rejected" as const }
            : d,
        );
      } else if (action.generationType === "voice") {
        gen.voiceClips = gen.voiceClips.map((v) =>
          v.npcId === action.entityId && v.status === "reviewing"
            ? { ...v, status: "rejected" as const }
            : v,
        );
      } else if (action.generationType === "quest") {
        gen.quests = gen.quests.map((q) =>
          q.status === "reviewing" ? { ...q, status: "rejected" as const } : q,
        );
      }
      return { ...state, aiGeneration: gen };
    }

    // Phase 8: Deployment pipeline
    case "DEPLOY_STAGING_START":
      return {
        ...state,
        deployment: {
          ...state.deployment,
          stagingStatus: "compiling",
          error: null,
        },
      };
    case "DEPLOY_STAGING_STATUS":
      return {
        ...state,
        deployment: {
          ...state.deployment,
          stagingStatus: action.status,
          error: action.error ?? state.deployment.error,
        },
      };
    case "DEPLOY_STAGING_COMPLETE":
      return {
        ...state,
        deployment: {
          ...state.deployment,
          stagingStatus: "success",
          history: [action.record, ...state.deployment.history],
        },
      };
    case "DEPLOY_PRODUCTION_START":
      return {
        ...state,
        deployment: {
          ...state.deployment,
          productionStatus: "deploying",
          error: null,
        },
      };
    case "DEPLOY_PRODUCTION_STATUS":
      return {
        ...state,
        deployment: {
          ...state.deployment,
          productionStatus: action.status,
          error: action.error ?? state.deployment.error,
        },
      };
    case "DEPLOY_PRODUCTION_COMPLETE":
      return {
        ...state,
        deployment: {
          ...state.deployment,
          productionStatus: "success",
          pendingPromotion: null,
          history: [action.record, ...state.deployment.history],
        },
      };
    case "DEPLOY_DIFF_START":
      return {
        ...state,
        deployment: {
          ...state.deployment,
          isComputingDiff: true,
          currentDiff: null,
        },
      };
    case "DEPLOY_DIFF_COMPLETE":
      return {
        ...state,
        deployment: {
          ...state.deployment,
          isComputingDiff: false,
          currentDiff: action.diff,
        },
      };
    case "DEPLOY_HISTORY_LOAD":
      return {
        ...state,
        deployment: { ...state.deployment, history: action.history },
      };
    case "DEPLOY_ROLLBACK":
      return {
        ...state,
        deployment: {
          ...state.deployment,
          history: state.deployment.history.map((r) =>
            r.id === action.deploymentId
              ? { ...r, status: "rolled-back" as const }
              : r,
          ),
        },
      };
    case "DEPLOY_PROMOTION_REQUEST":
      return {
        ...state,
        deployment: {
          ...state.deployment,
          productionStatus: "pending-approval",
          pendingPromotion: {
            id: action.id,
            requestedBy: action.requestedBy,
            requestedAt: new Date().toISOString(),
            diff: action.diff,
          },
        },
      };
    case "DEPLOY_PROMOTION_APPROVE":
      return {
        ...state,
        deployment: {
          ...state.deployment,
          productionStatus: "deploying",
          pendingPromotion: null,
        },
      };
    case "DEPLOY_PROMOTION_REJECT":
      return {
        ...state,
        deployment: {
          ...state.deployment,
          productionStatus: "idle",
          pendingPromotion: null,
        },
      };

    // Phase 9: Viewport overlays
    case "SET_OVERLAY":
      return {
        ...state,
        overlays: { ...state.overlays, ...action.overlay },
      };

    case "SET_GAME_ENTITIES":
      return {
        ...state,
        gameEntities: action.data,
      };

    default:
      return null; // Not a studio-specific action
  }
}

/** Combined reducer: studio actions handled locally, world builder actions delegated */
function worldStudioReducer(
  state: WorldStudioState,
  action: WorldStudioAction,
): WorldStudioState {
  // Try studio-specific reducer first
  const studioResult = studioReducer(state, action);
  if (studioResult !== null) {
    return studioResult;
  }

  // Delegate to world builder reducer for all WB actions
  const newBuilder = worldBuilderReducer(
    state.builder,
    action as WorldBuilderAction,
  );
  if (newBuilder !== state.builder) {
    return { ...state, builder: newBuilder };
  }

  return state;
}

// ============== VIEWPORT CALLBACKS ==============

/** Ref-based callbacks for viewport operations that bypass React state.
 *  Set by ViewportContainer when scene is ready, consumed by panels like ProcgenPanel. */
export interface ViewportCallbacks {
  refreshVegetation?: (vegConfig?: VegetationConfig) => Promise<void>;
  navigateCamera?: (x: number, z: number, close?: boolean) => void;
}

// ============== CONTEXT ==============

interface WorldStudioContextValue {
  state: WorldStudioState;
  dispatch: React.Dispatch<WorldStudioAction>;
  /** Ref to viewport callbacks — does not trigger re-renders when mutated */
  viewportRef: React.MutableRefObject<ViewportCallbacks>;

  /** Convenience action creators matching WorldBuilderContext pattern */
  actions: {
    // Mode
    setMode: (mode: WorldBuilderMode) => void;
    switchToCreation: () => void;
    switchToEditing: () => void;

    // Creation
    setPreset: (presetId: string | null) => void;
    updateCreationConfig: (config: Partial<WorldCreationConfig>) => void;
    updateTerrainConfig: (
      config: Partial<WorldCreationConfig["terrain"]>,
    ) => void;
    updateNoiseConfig: (config: Partial<TerrainNoiseConfig>) => void;
    updateBiomeConfig: (config: Partial<BiomeConfig>) => void;
    updateIslandConfig: (config: Partial<IslandConfig>) => void;
    updateTownConfig: (config: Partial<WorldCreationConfig["towns"]>) => void;
    updateRoadConfig: (config: Partial<WorldCreationConfig["roads"]>) => void;
    setSeed: (seed: number) => void;
    randomizeSeed: () => void;
    startGeneration: () => void;
    finishGeneration: (stats: CreationModeState["previewStats"]) => void;
    failGeneration: (error: string) => void;
    applyAndLock: (world: WorldData) => void;

    // Editing
    loadWorld: (world: WorldData) => void;
    unloadWorld: () => void;
    setSelection: (selection: Selection | null) => void;
    setHovered: (info: HoverInfo | null) => void;
    setSelectionMode: (mode: SelectionMode) => void;
    toggleNodeExpanded: (nodeId: string) => void;
    expandNode: (nodeId: string) => void;
    collapseNode: (nodeId: string) => void;

    // Layer editing
    addBiomeOverride: (override: BiomeOverride) => void;
    updateBiomeOverride: (
      biomeId: string,
      override: Partial<BiomeOverride>,
    ) => void;
    removeBiomeOverride: (biomeId: string) => void;
    addTownOverride: (override: TownOverride) => void;
    updateTownOverride: (
      townId: string,
      override: Partial<TownOverride>,
    ) => void;
    removeTownOverride: (townId: string) => void;
    addNPC: (npc: PlacedNPC) => void;
    updateNPC: (npcId: string, updates: Partial<PlacedNPC>) => void;
    removeNPC: (npcId: string) => void;
    addQuest: (quest: PlacedQuest) => void;
    updateQuest: (questId: string, updates: Partial<PlacedQuest>) => void;
    removeQuest: (questId: string) => void;
    addBoss: (boss: PlacedBoss) => void;
    updateBoss: (bossId: string, updates: Partial<PlacedBoss>) => void;
    removeBoss: (bossId: string) => void;
    addEvent: (event: PlacedEvent) => void;
    updateEvent: (eventId: string, updates: Partial<PlacedEvent>) => void;
    removeEvent: (eventId: string) => void;
    addLore: (lore: PlacedLore) => void;
    updateLore: (loreId: string, updates: Partial<PlacedLore>) => void;
    removeLore: (loreId: string) => void;
    addDifficultyZone: (zone: DifficultyZone) => void;
    updateDifficultyZone: (
      zoneId: string,
      updates: Partial<DifficultyZone>,
    ) => void;
    removeDifficultyZone: (zoneId: string) => void;
    addCustomPlacement: (placement: CustomPlacement) => void;
    updateCustomPlacement: (
      placementId: string,
      updates: Partial<CustomPlacement>,
    ) => void;
    removeCustomPlacement: (placementId: string) => void;
    markSaved: () => void;
    setSaveError: (error: string | null) => void;

    // Viewport
    setCameraMode: (mode: CameraMode) => void;
    setCameraHeight: (height: number) => void;
    setMoveSpeed: (speed: number) => void;
    toggleOverlay: (overlay: keyof ViewportOverlays) => void;
    setOverlays: (overlays: Partial<ViewportOverlays>) => void;

    // History (undo/redo)
    undo: () => void;
    redo: () => void;
    clearHistory: () => void;

    // Studio-specific: Project
    setProject: (
      teamId: string,
      gameId: string,
      projectId: string,
      name: string,
      version: number,
    ) => void;
    clearProject: () => void;
    setProjectLock: (lockedBy: string | null) => void;

    // Studio-specific: Persistence
    saveStart: () => void;
    saveSuccess: (savedAt: number, version: number) => void;
    saveError: (error: string) => void;
    loadStart: () => void;
    loadSuccess: () => void;
    loadError: (error: string) => void;
    setAutoSave: (enabled: boolean) => void;

    // Studio-specific: Tools
    setTool: (tool: StudioToolMode) => void;
    setTransformMode: (mode: GizmoTransformMode) => void;
    setTransformSpace: (space: GizmoTransformSpace) => void;
    cameraTeleport: (target: {
      x: number;
      y: number;
      z: number;
      close?: boolean;
    }) => void;
    cameraTeleportConsumed: () => void;

    // Studio-specific: Brush
    setBrushSettings: (settings: Partial<BrushSettings>) => void;
    addTerrainSculpt: (stroke: TerrainSculptStroke) => void;
    addBiomePaint: (stroke: BiomePaintStroke) => void;
    addVegetationPaint: (stroke: VegetationPaintStroke) => void;
    setTileCollision: (
      tiles: Array<{ tileX: number; tileZ: number; blocked: boolean }>,
    ) => void;
    undoLastBrushStroke: (brushType: BrushType) => void;
    clearBrushOverlays: (brushType?: BrushType) => void;

    // Studio-specific: Placement
    startPlacement: (
      category: PaletteCategory,
      templateId: string,
      templateName: string,
    ) => void;
    updatePlacementPosition: (
      position: WorldPosition,
      rotation?: number,
    ) => void;
    confirmPlacement: () => void;
    cancelPlacement: () => void;

    // Studio-specific: Extended layers — Spawn Points
    addSpawnPoint: (spawnPoint: PlacedSpawnPoint) => void;
    updateSpawnPoint: (id: string, updates: Partial<PlacedSpawnPoint>) => void;
    removeSpawnPoint: (id: string) => void;

    // Studio-specific: Extended layers — Teleports
    addTeleport: (teleport: PlacedTeleport) => void;
    updateTeleport: (id: string, updates: Partial<PlacedTeleport>) => void;
    removeTeleport: (id: string) => void;

    // Studio-specific: Extended layers — Mob Spawns
    addMobSpawn: (mobSpawn: PlacedMobSpawn) => void;
    updateMobSpawn: (id: string, updates: Partial<PlacedMobSpawn>) => void;
    removeMobSpawn: (id: string) => void;

    // Studio-specific: Extended layers — Resources
    addResource: (resource: PlacedResource) => void;
    updateResource: (id: string, updates: Partial<PlacedResource>) => void;
    removeResource: (id: string) => void;

    // Studio-specific: Extended layers — Stations
    addStation: (station: PlacedStation) => void;
    updateStation: (id: string, updates: Partial<PlacedStation>) => void;
    removeStation: (id: string) => void;

    // Studio-specific: POIs
    addPOI: (poi: PlacedPOI) => void;
    updatePOI: (id: string, updates: Partial<PlacedPOI>) => void;
    removePOI: (id: string) => void;

    // Studio-specific: Water Bodies
    addWaterBody: (waterBody: PlacedWaterBody) => void;
    updateWaterBody: (id: string, updates: Partial<PlacedWaterBody>) => void;
    removeWaterBody: (id: string) => void;

    // Studio-specific: Manifests
    loadManifestsStart: () => void;
    loadManifestsSuccess: (
      data: Omit<ManifestData, "loaded" | "loading" | "error">,
    ) => void;
    loadManifestsError: (error: string) => void;
    updateManifestRaw: (name: string, content: unknown) => void;
    updateManifestItems: (items: ManifestItem[]) => void;
    updateManifestQuests: (quests: ManifestQuest[]) => void;
    updateManifestStores: (stores: ManifestStore[]) => void;
    updateManifestNPCs: (npcs: ManifestNPC[]) => void;
    updateManifestCombatSpells: (combatSpells: ManifestCombatSpell[]) => void;
    updateManifestPrayers: (prayers: ManifestPrayer[]) => void;
    updateManifestRecipes: (recipes: ManifestRecipe[]) => void;
    updateManifestAmmunition: (ammunition: ManifestAmmunition[]) => void;
    updateManifestRunes: (runes: ManifestRune[]) => void;
    updateManifestSkillUnlocks: (skillUnlocks: ManifestSkillUnlock[]) => void;
    updateManifestTierRequirements: (
      tierRequirements: ManifestTierRequirement[],
    ) => void;
    updateManifestDuelArenas: (duelArenas: ManifestDuelArena[]) => void;

    // Phase 7: Audio zones
    addMusicZone: (zone: MusicZone) => void;
    updateMusicZone: (id: string, updates: Partial<MusicZone>) => void;
    removeMusicZone: (id: string) => void;
    addAmbientZone: (zone: AmbientZone) => void;
    updateAmbientZone: (id: string, updates: Partial<AmbientZone>) => void;
    removeAmbientZone: (id: string) => void;
    addSFXTrigger: (trigger: SFXTrigger) => void;
    updateSFXTrigger: (id: string, updates: Partial<SFXTrigger>) => void;
    removeSFXTrigger: (id: string) => void;

    // Phase 7: AI generation
    startAIGeneration: (
      generationType: "dialogue" | "voice" | "quest",
      entityId: string,
    ) => void;
    completeAIGeneration: (
      generationType: "dialogue" | "voice" | "quest",
      entityId: string,
      result: unknown,
    ) => void;
    errorAIGeneration: (
      generationType: "dialogue" | "voice" | "quest",
      entityId: string,
      error: string,
    ) => void;
    acceptAIGeneration: (
      generationType: "dialogue" | "voice" | "quest",
      entityId: string,
    ) => void;
    rejectAIGeneration: (
      generationType: "dialogue" | "voice" | "quest",
      entityId: string,
    ) => void;
    // Phase 8: Deployment pipeline
    deployStagingStart: () => void;
    deployStagingStatus: (
      status: DeploymentState["stagingStatus"],
      error?: string,
    ) => void;
    deployStagingComplete: (record: DeploymentRecord) => void;
    deployProductionStart: () => void;
    deployProductionStatus: (
      status: DeploymentState["productionStatus"],
      error?: string,
    ) => void;
    deployProductionComplete: (record: DeploymentRecord) => void;
    deployDiffStart: () => void;
    deployDiffComplete: (diff: DeploymentDiff) => void;
    deployHistoryLoad: (history: DeploymentRecord[]) => void;
    deployRollback: (deploymentId: string) => void;
    deployPromotionRequest: (
      id: string,
      requestedBy: string,
      diff: DeploymentDiff,
    ) => void;
    deployPromotionApprove: (approvedBy: string) => void;
    deployPromotionReject: () => void;
    // Phase 9: Viewport overlays
    setOverlay: (overlay: Partial<StudioViewportOverlays>) => void;
    // Game entity data
    setGameEntities: (data: GameEntityData) => void;
  };

  /** Computed values */
  computed: {
    isCreationMode: boolean;
    isEditingMode: boolean;
    hasLoadedWorld: boolean;
    isConfigModified: boolean;
    getHierarchyTree: () => HierarchyNode | null;
    canUndo: boolean;
    canRedo: boolean;
    undoCount: number;
    redoCount: number;
    hasProject: boolean;
    isProjectLocked: boolean;
    hasUnsavedChanges: boolean;
    isPersisting: boolean;
  };
}

const WorldStudioContext = createContext<WorldStudioContextValue | null>(null);

// ============== PROVIDER ==============

interface WorldStudioProviderProps {
  children: ReactNode;
}

export function WorldStudioProvider({ children }: WorldStudioProviderProps) {
  const [state, dispatch] = useReducer(worldStudioReducer, initialState);
  const viewportRef = useRef<ViewportCallbacks>({});

  // Sync context state → Zustand stores for incremental migration
  useStoreSync(state);

  // Memoized action creators
  const actions = useMemo(
    () => ({
      // Mode
      setMode: (mode: WorldBuilderMode) => dispatch({ type: "SET_MODE", mode }),
      switchToCreation: () => dispatch({ type: "SET_MODE", mode: "creation" }),
      switchToEditing: () => dispatch({ type: "SET_MODE", mode: "editing" }),

      // Creation
      setPreset: (presetId: string | null) =>
        dispatch({ type: "SET_PRESET", presetId }),
      updateCreationConfig: (config: Partial<WorldCreationConfig>) =>
        dispatch({ type: "UPDATE_CREATION_CONFIG", config }),
      updateTerrainConfig: (config: Partial<WorldCreationConfig["terrain"]>) =>
        dispatch({ type: "UPDATE_TERRAIN_CONFIG", config }),
      updateNoiseConfig: (config: Partial<TerrainNoiseConfig>) =>
        dispatch({ type: "UPDATE_NOISE_CONFIG", config }),
      updateBiomeConfig: (config: Partial<BiomeConfig>) =>
        dispatch({ type: "UPDATE_BIOME_CONFIG", config }),
      updateIslandConfig: (config: Partial<IslandConfig>) =>
        dispatch({ type: "UPDATE_ISLAND_CONFIG", config }),
      updateTownConfig: (config: Partial<WorldCreationConfig["towns"]>) =>
        dispatch({ type: "UPDATE_TOWN_CONFIG", config }),
      updateRoadConfig: (config: Partial<WorldCreationConfig["roads"]>) =>
        dispatch({ type: "UPDATE_ROAD_CONFIG", config }),
      setSeed: (seed: number) => dispatch({ type: "SET_SEED", seed }),
      randomizeSeed: () => dispatch({ type: "RANDOMIZE_SEED" }),
      startGeneration: () => dispatch({ type: "GENERATE_PREVIEW_START" }),
      finishGeneration: (stats: CreationModeState["previewStats"]) =>
        dispatch({ type: "GENERATE_PREVIEW_SUCCESS", stats }),
      failGeneration: (error: string) =>
        dispatch({ type: "GENERATE_PREVIEW_ERROR", error }),
      applyAndLock: (world: WorldData) =>
        dispatch({ type: "APPLY_AND_LOCK", world }),

      // Editing
      loadWorld: (world: WorldData) => dispatch({ type: "LOAD_WORLD", world }),
      unloadWorld: () => dispatch({ type: "UNLOAD_WORLD" }),
      setSelection: (selection: Selection | null) =>
        dispatch({ type: "SET_SELECTION", selection }),
      setHovered: (info: HoverInfo | null) =>
        dispatch({ type: "SET_HOVERED", info }),
      setSelectionMode: (mode: SelectionMode) =>
        dispatch({ type: "SET_SELECTION_MODE", mode }),
      toggleNodeExpanded: (nodeId: string) =>
        dispatch({ type: "TOGGLE_NODE_EXPANDED", nodeId }),
      expandNode: (nodeId: string) => dispatch({ type: "EXPAND_NODE", nodeId }),
      collapseNode: (nodeId: string) =>
        dispatch({ type: "COLLAPSE_NODE", nodeId }),

      // Layer editing
      addBiomeOverride: (override: BiomeOverride) =>
        dispatch({ type: "ADD_BIOME_OVERRIDE", override }),
      updateBiomeOverride: (
        biomeId: string,
        override: Partial<BiomeOverride>,
      ) => dispatch({ type: "UPDATE_BIOME_OVERRIDE", biomeId, override }),
      removeBiomeOverride: (biomeId: string) =>
        dispatch({ type: "REMOVE_BIOME_OVERRIDE", biomeId }),
      addTownOverride: (override: TownOverride) =>
        dispatch({ type: "ADD_TOWN_OVERRIDE", override }),
      updateTownOverride: (townId: string, override: Partial<TownOverride>) =>
        dispatch({ type: "UPDATE_TOWN_OVERRIDE", townId, override }),
      removeTownOverride: (townId: string) =>
        dispatch({ type: "REMOVE_TOWN_OVERRIDE", townId }),
      addNPC: (npc: PlacedNPC) => dispatch({ type: "ADD_NPC", npc }),
      updateNPC: (npcId: string, updates: Partial<PlacedNPC>) =>
        dispatch({ type: "UPDATE_NPC", npcId, updates }),
      removeNPC: (npcId: string) => dispatch({ type: "REMOVE_NPC", npcId }),
      addQuest: (quest: PlacedQuest) => dispatch({ type: "ADD_QUEST", quest }),
      updateQuest: (questId: string, updates: Partial<PlacedQuest>) =>
        dispatch({ type: "UPDATE_QUEST", questId, updates }),
      removeQuest: (questId: string) =>
        dispatch({ type: "REMOVE_QUEST", questId }),
      addBoss: (boss: PlacedBoss) => dispatch({ type: "ADD_BOSS", boss }),
      updateBoss: (bossId: string, updates: Partial<PlacedBoss>) =>
        dispatch({ type: "UPDATE_BOSS", bossId, updates }),
      removeBoss: (bossId: string) => dispatch({ type: "REMOVE_BOSS", bossId }),
      addEvent: (event: PlacedEvent) => dispatch({ type: "ADD_EVENT", event }),
      updateEvent: (eventId: string, updates: Partial<PlacedEvent>) =>
        dispatch({ type: "UPDATE_EVENT", eventId, updates }),
      removeEvent: (eventId: string) =>
        dispatch({ type: "REMOVE_EVENT", eventId }),
      addLore: (lore: PlacedLore) => dispatch({ type: "ADD_LORE", lore }),
      updateLore: (loreId: string, updates: Partial<PlacedLore>) =>
        dispatch({ type: "UPDATE_LORE", loreId, updates }),
      removeLore: (loreId: string) => dispatch({ type: "REMOVE_LORE", loreId }),
      addDifficultyZone: (zone: DifficultyZone) =>
        dispatch({ type: "ADD_DIFFICULTY_ZONE", zone }),
      updateDifficultyZone: (
        zoneId: string,
        updates: Partial<DifficultyZone>,
      ) => dispatch({ type: "UPDATE_DIFFICULTY_ZONE", zoneId, updates }),
      removeDifficultyZone: (zoneId: string) =>
        dispatch({ type: "REMOVE_DIFFICULTY_ZONE", zoneId }),
      addCustomPlacement: (placement: CustomPlacement) =>
        dispatch({ type: "ADD_CUSTOM_PLACEMENT", placement }),
      updateCustomPlacement: (
        placementId: string,
        updates: Partial<CustomPlacement>,
      ) => dispatch({ type: "UPDATE_CUSTOM_PLACEMENT", placementId, updates }),
      removeCustomPlacement: (placementId: string) =>
        dispatch({ type: "REMOVE_CUSTOM_PLACEMENT", placementId }),
      markSaved: () => dispatch({ type: "MARK_SAVED" }),
      setSaveError: (error: string | null) =>
        dispatch({ type: "SET_SAVE_ERROR", error }),

      // Viewport
      setCameraMode: (mode: CameraMode) =>
        dispatch({ type: "SET_CAMERA_MODE", mode }),
      setCameraHeight: (height: number) =>
        dispatch({ type: "SET_CAMERA_HEIGHT", height }),
      setMoveSpeed: (speed: number) =>
        dispatch({ type: "SET_MOVE_SPEED", speed }),
      toggleOverlay: (overlay: keyof ViewportOverlays) =>
        dispatch({ type: "TOGGLE_OVERLAY", overlay }),
      setOverlays: (overlays: Partial<ViewportOverlays>) =>
        dispatch({ type: "SET_OVERLAYS", overlays }),

      // History (undo/redo)
      undo: () => dispatch({ type: "UNDO" }),
      redo: () => dispatch({ type: "REDO" }),
      clearHistory: () => dispatch({ type: "CLEAR_HISTORY" }),

      // Studio-specific: Project
      setProject: (
        teamId: string,
        gameId: string,
        projectId: string,
        name: string,
        version: number,
      ) =>
        dispatch({
          type: "SET_PROJECT",
          teamId,
          gameId,
          projectId,
          name,
          version,
        }),
      clearProject: () => dispatch({ type: "CLEAR_PROJECT" }),
      setProjectLock: (lockedBy: string | null) =>
        dispatch({ type: "SET_PROJECT_LOCK", lockedBy }),

      // Studio-specific: Persistence
      saveStart: () => dispatch({ type: "SAVE_START" }),
      saveSuccess: (savedAt: number, version: number) =>
        dispatch({ type: "SAVE_SUCCESS", savedAt, version }),
      saveError: (error: string) => dispatch({ type: "SAVE_ERROR", error }),
      loadStart: () => dispatch({ type: "LOAD_START" }),
      loadSuccess: () => dispatch({ type: "LOAD_SUCCESS" }),
      loadError: (error: string) => dispatch({ type: "LOAD_ERROR", error }),
      setAutoSave: (enabled: boolean) =>
        dispatch({ type: "SET_AUTO_SAVE", enabled }),

      // Studio-specific: Tools
      setTool: (tool: StudioToolMode) => dispatch({ type: "SET_TOOL", tool }),
      setTransformMode: (mode: GizmoTransformMode) =>
        dispatch({ type: "SET_TRANSFORM_MODE", mode }),
      setTransformSpace: (space: GizmoTransformSpace) =>
        dispatch({ type: "SET_TRANSFORM_SPACE", space }),
      cameraTeleport: (target: {
        x: number;
        y: number;
        z: number;
        close?: boolean;
      }) => dispatch({ type: "CAMERA_TELEPORT", target }),
      cameraTeleportConsumed: () =>
        dispatch({ type: "CAMERA_TELEPORT_CONSUMED" }),

      // Studio-specific: Brush
      setBrushSettings: (settings: Partial<BrushSettings>) =>
        dispatch({ type: "SET_BRUSH_SETTINGS", settings }),
      addTerrainSculpt: (stroke: TerrainSculptStroke) =>
        dispatch({ type: "ADD_TERRAIN_SCULPT", stroke }),
      addBiomePaint: (stroke: BiomePaintStroke) =>
        dispatch({ type: "ADD_BIOME_PAINT", stroke }),
      addVegetationPaint: (stroke: VegetationPaintStroke) =>
        dispatch({ type: "ADD_VEGETATION_PAINT", stroke }),
      setTileCollision: (
        tiles: Array<{ tileX: number; tileZ: number; blocked: boolean }>,
      ) => dispatch({ type: "SET_TILE_COLLISION", tiles }),
      undoLastBrushStroke: (brushType: BrushType) =>
        dispatch({ type: "UNDO_LAST_BRUSH_STROKE", brushType }),
      clearBrushOverlays: (brushType?: BrushType) =>
        dispatch({ type: "CLEAR_BRUSH_OVERLAYS", brushType }),

      // Studio-specific: Placement
      startPlacement: (
        category: PaletteCategory,
        templateId: string,
        templateName: string,
      ) =>
        dispatch({
          type: "START_PLACEMENT",
          category,
          templateId,
          templateName,
        }),
      updatePlacementPosition: (position: WorldPosition, rotation?: number) =>
        dispatch({ type: "UPDATE_PLACEMENT_POSITION", position, rotation }),
      confirmPlacement: () => dispatch({ type: "CONFIRM_PLACEMENT" }),
      cancelPlacement: () => dispatch({ type: "CANCEL_PLACEMENT" }),

      // Studio-specific: Extended layers — Spawn Points
      addSpawnPoint: (spawnPoint: PlacedSpawnPoint) =>
        dispatch({ type: "ADD_SPAWN_POINT", spawnPoint }),
      updateSpawnPoint: (id: string, updates: Partial<PlacedSpawnPoint>) =>
        dispatch({ type: "UPDATE_SPAWN_POINT", id, updates }),
      removeSpawnPoint: (id: string) =>
        dispatch({ type: "REMOVE_SPAWN_POINT", id }),

      // Studio-specific: Extended layers — Teleports
      addTeleport: (teleport: PlacedTeleport) =>
        dispatch({ type: "ADD_TELEPORT", teleport }),
      updateTeleport: (id: string, updates: Partial<PlacedTeleport>) =>
        dispatch({ type: "UPDATE_TELEPORT", id, updates }),
      removeTeleport: (id: string) => dispatch({ type: "REMOVE_TELEPORT", id }),

      // Studio-specific: Extended layers — Mob Spawns
      addMobSpawn: (mobSpawn: PlacedMobSpawn) =>
        dispatch({ type: "ADD_MOB_SPAWN", mobSpawn }),
      updateMobSpawn: (id: string, updates: Partial<PlacedMobSpawn>) =>
        dispatch({ type: "UPDATE_MOB_SPAWN", id, updates }),
      removeMobSpawn: (id: string) =>
        dispatch({ type: "REMOVE_MOB_SPAWN", id }),

      // Studio-specific: Extended layers — Resources
      addResource: (resource: PlacedResource) =>
        dispatch({ type: "ADD_RESOURCE", resource }),
      updateResource: (id: string, updates: Partial<PlacedResource>) =>
        dispatch({ type: "UPDATE_RESOURCE", id, updates }),
      removeResource: (id: string) => dispatch({ type: "REMOVE_RESOURCE", id }),

      // Studio-specific: Extended layers — Stations
      addStation: (station: PlacedStation) =>
        dispatch({ type: "ADD_STATION", station }),
      updateStation: (id: string, updates: Partial<PlacedStation>) =>
        dispatch({ type: "UPDATE_STATION", id, updates }),
      removeStation: (id: string) => dispatch({ type: "REMOVE_STATION", id }),

      // Studio-specific: Extended layers — POIs
      addPOI: (poi: PlacedPOI) => dispatch({ type: "ADD_POI", poi }),
      updatePOI: (id: string, updates: Partial<PlacedPOI>) =>
        dispatch({ type: "UPDATE_POI", id, updates }),
      removePOI: (id: string) => dispatch({ type: "REMOVE_POI", id }),

      // Studio-specific: Extended layers — Water Bodies
      addWaterBody: (waterBody: PlacedWaterBody) =>
        dispatch({ type: "ADD_WATER_BODY", waterBody }),
      updateWaterBody: (id: string, updates: Partial<PlacedWaterBody>) =>
        dispatch({ type: "UPDATE_WATER_BODY", id, updates }),
      removeWaterBody: (id: string) =>
        dispatch({ type: "REMOVE_WATER_BODY", id }),

      // Studio-specific: Manifests
      loadManifestsStart: () => dispatch({ type: "MANIFESTS_LOAD_START" }),
      loadManifestsSuccess: (
        data: Omit<ManifestData, "loaded" | "loading" | "error">,
      ) => dispatch({ type: "MANIFESTS_LOAD_SUCCESS", data }),
      loadManifestsError: (error: string) =>
        dispatch({ type: "MANIFESTS_LOAD_ERROR", error }),
      updateManifestRaw: (name: string, content: unknown) =>
        dispatch({ type: "MANIFEST_UPDATE_RAW", name, content }),
      updateManifestItems: (items: ManifestItem[]) =>
        dispatch({ type: "MANIFEST_UPDATE_ITEMS", items }),
      updateManifestQuests: (quests: ManifestQuest[]) =>
        dispatch({ type: "MANIFEST_UPDATE_QUESTS", quests }),
      updateManifestStores: (stores: ManifestStore[]) =>
        dispatch({ type: "MANIFEST_UPDATE_STORES", stores }),
      updateManifestNPCs: (npcs: ManifestNPC[]) =>
        dispatch({ type: "MANIFEST_UPDATE_NPCS", npcs }),
      updateManifestCombatSpells: (combatSpells: ManifestCombatSpell[]) =>
        dispatch({ type: "MANIFEST_UPDATE_COMBAT_SPELLS", combatSpells }),
      updateManifestPrayers: (prayers: ManifestPrayer[]) =>
        dispatch({ type: "MANIFEST_UPDATE_PRAYERS", prayers }),
      updateManifestRecipes: (recipes: ManifestRecipe[]) =>
        dispatch({ type: "MANIFEST_UPDATE_RECIPES", recipes }),
      updateManifestAmmunition: (ammunition: ManifestAmmunition[]) =>
        dispatch({ type: "MANIFEST_UPDATE_AMMUNITION", ammunition }),
      updateManifestRunes: (runes: ManifestRune[]) =>
        dispatch({ type: "MANIFEST_UPDATE_RUNES", runes }),
      updateManifestSkillUnlocks: (skillUnlocks: ManifestSkillUnlock[]) =>
        dispatch({ type: "MANIFEST_UPDATE_SKILL_UNLOCKS", skillUnlocks }),
      updateManifestTierRequirements: (
        tierRequirements: ManifestTierRequirement[],
      ) =>
        dispatch({
          type: "MANIFEST_UPDATE_TIER_REQUIREMENTS",
          tierRequirements,
        }),
      updateManifestDuelArenas: (duelArenas: ManifestDuelArena[]) =>
        dispatch({ type: "MANIFEST_UPDATE_DUEL_ARENAS", duelArenas }),

      // Phase 7: Audio zones
      addMusicZone: (zone: MusicZone) =>
        dispatch({ type: "ADD_MUSIC_ZONE", zone }),
      updateMusicZone: (id: string, updates: Partial<MusicZone>) =>
        dispatch({ type: "UPDATE_MUSIC_ZONE", id, updates }),
      removeMusicZone: (id: string) =>
        dispatch({ type: "REMOVE_MUSIC_ZONE", id }),
      addAmbientZone: (zone: AmbientZone) =>
        dispatch({ type: "ADD_AMBIENT_ZONE", zone }),
      updateAmbientZone: (id: string, updates: Partial<AmbientZone>) =>
        dispatch({ type: "UPDATE_AMBIENT_ZONE", id, updates }),
      removeAmbientZone: (id: string) =>
        dispatch({ type: "REMOVE_AMBIENT_ZONE", id }),
      addSFXTrigger: (trigger: SFXTrigger) =>
        dispatch({ type: "ADD_SFX_TRIGGER", trigger }),
      updateSFXTrigger: (id: string, updates: Partial<SFXTrigger>) =>
        dispatch({ type: "UPDATE_SFX_TRIGGER", id, updates }),
      removeSFXTrigger: (id: string) =>
        dispatch({ type: "REMOVE_SFX_TRIGGER", id }),

      // Phase 7: AI generation
      startAIGeneration: (
        generationType: "dialogue" | "voice" | "quest",
        entityId: string,
      ) => dispatch({ type: "AI_GENERATION_START", generationType, entityId }),
      completeAIGeneration: (
        generationType: "dialogue" | "voice" | "quest",
        entityId: string,
        result: unknown,
      ) =>
        dispatch({
          type: "AI_GENERATION_COMPLETE",
          generationType,
          entityId,
          result,
        }),
      errorAIGeneration: (
        generationType: "dialogue" | "voice" | "quest",
        entityId: string,
        error: string,
      ) =>
        dispatch({
          type: "AI_GENERATION_ERROR",
          generationType,
          entityId,
          error,
        }),
      acceptAIGeneration: (
        generationType: "dialogue" | "voice" | "quest",
        entityId: string,
      ) => dispatch({ type: "AI_GENERATION_ACCEPT", generationType, entityId }),
      rejectAIGeneration: (
        generationType: "dialogue" | "voice" | "quest",
        entityId: string,
      ) => dispatch({ type: "AI_GENERATION_REJECT", generationType, entityId }),
      // Phase 8: Deployment pipeline
      deployStagingStart: () => dispatch({ type: "DEPLOY_STAGING_START" }),
      deployStagingStatus: (
        status: DeploymentState["stagingStatus"],
        error?: string,
      ) => dispatch({ type: "DEPLOY_STAGING_STATUS", status, error }),
      deployStagingComplete: (record: DeploymentRecord) =>
        dispatch({ type: "DEPLOY_STAGING_COMPLETE", record }),
      deployProductionStart: () =>
        dispatch({ type: "DEPLOY_PRODUCTION_START" }),
      deployProductionStatus: (
        status: DeploymentState["productionStatus"],
        error?: string,
      ) => dispatch({ type: "DEPLOY_PRODUCTION_STATUS", status, error }),
      deployProductionComplete: (record: DeploymentRecord) =>
        dispatch({ type: "DEPLOY_PRODUCTION_COMPLETE", record }),
      deployDiffStart: () => dispatch({ type: "DEPLOY_DIFF_START" }),
      deployDiffComplete: (diff: DeploymentDiff) =>
        dispatch({ type: "DEPLOY_DIFF_COMPLETE", diff }),
      deployHistoryLoad: (history: DeploymentRecord[]) =>
        dispatch({ type: "DEPLOY_HISTORY_LOAD", history }),
      deployRollback: (deploymentId: string) =>
        dispatch({ type: "DEPLOY_ROLLBACK", deploymentId }),
      deployPromotionRequest: (
        id: string,
        requestedBy: string,
        diff: DeploymentDiff,
      ) =>
        dispatch({ type: "DEPLOY_PROMOTION_REQUEST", id, requestedBy, diff }),
      deployPromotionApprove: (approvedBy: string) =>
        dispatch({ type: "DEPLOY_PROMOTION_APPROVE", approvedBy }),
      deployPromotionReject: () =>
        dispatch({ type: "DEPLOY_PROMOTION_REJECT" }),
      // Phase 9: Viewport overlays
      setOverlay: (overlay: Partial<StudioViewportOverlays>) =>
        dispatch({ type: "SET_OVERLAY", overlay }),
      // Game entity data
      setGameEntities: (data: GameEntityData) =>
        dispatch({ type: "SET_GAME_ENTITIES", data }),
    }),
    [],
  );

  // Build hierarchy tree from world data (same logic as WorldBuilderContext)
  const getHierarchyTree = useCallback((): HierarchyNode | null => {
    const world = state.builder.editing.world;
    if (!world) return null;

    const foundation = world.foundation;
    const layers = world.layers;

    // Build biome children
    const biomeChildren: HierarchyNode[] = foundation.biomes.map((biome) => {
      const override = layers.biomeOverrides.get(biome.id);
      const displayType = override?.typeOverride || biome.type;
      return {
        id: `biome-${biome.id}`,
        label: `${displayType.charAt(0).toUpperCase() + displayType.slice(1)} (${biome.tileKeys.length} tiles)`,
        type: "biome",
        children: [],
        dataId: biome.id,
        expandable: false,
        metadata: { biomeType: displayType, tileCount: biome.tileKeys.length },
      };
    });

    // Build town children
    const townChildren: HierarchyNode[] = foundation.towns.map((town) => {
      const override = layers.townOverrides.get(town.id);
      const displayName = override?.nameOverride || town.name;

      const buildingChildren: HierarchyNode[] = foundation.buildings
        .filter((b) => b.townId === town.id)
        .map((building) => ({
          id: `building-${building.id}`,
          label: building.name,
          type: "building" as const,
          children: [],
          dataId: building.id,
          expandable: false,
          metadata: { buildingType: building.type },
        }));

      const townNpcs = layers.npcs.filter(
        (npc) =>
          npc.parentContext.type === "town" &&
          npc.parentContext.townId === town.id,
      );
      const npcChildren: HierarchyNode[] = townNpcs.map((npc) => ({
        id: `npc-${npc.id}`,
        label: npc.name,
        type: "npc" as const,
        children: [],
        dataId: npc.id,
        expandable: false,
        metadata: { npcType: npc.npcTypeId },
      }));

      return {
        id: `town-${town.id}`,
        label: `${displayName} (${town.size})`,
        type: "town" as const,
        children: [
          ...buildingChildren,
          ...(npcChildren.length > 0
            ? [
                {
                  id: `town-${town.id}-npcs`,
                  label: "NPCs",
                  type: "npcs" as const,
                  children: npcChildren,
                  expandable: true,
                  badge: npcChildren.length,
                },
              ]
            : []),
        ],
        dataId: town.id,
        badge: buildingChildren.length,
        expandable: buildingChildren.length > 0 || npcChildren.length > 0,
        metadata: { townSize: town.size, layoutType: town.layoutType },
      };
    });

    // Build layers children
    const worldNpcs = layers.npcs.filter(
      (npc) => npc.parentContext.type === "world",
    );
    const layersChildren: HierarchyNode[] = [
      {
        id: "layer-npcs",
        label: "NPCs",
        type: "npcs",
        children: worldNpcs.map((npc) => ({
          id: `npc-${npc.id}`,
          label: npc.name,
          type: "npc" as const,
          children: [],
          dataId: npc.id,
          expandable: false,
        })),
        badge: layers.npcs.length,
        expandable: layers.npcs.length > 0,
      },
      {
        id: "layer-quests",
        label: "Quests",
        type: "quests",
        children: layers.quests.map((quest) => ({
          id: `quest-${quest.id}`,
          label: quest.name,
          type: "quest" as const,
          children: [],
          dataId: quest.id,
          expandable: false,
        })),
        badge: layers.quests.length,
        expandable: layers.quests.length > 0,
      },
      {
        id: "layer-bosses",
        label: "Bosses",
        type: "bosses",
        children: layers.bosses.map((boss) => ({
          id: `boss-${boss.id}`,
          label: boss.name,
          type: "boss" as const,
          children: [],
          dataId: boss.id,
          expandable: false,
        })),
        badge: layers.bosses.length,
        expandable: layers.bosses.length > 0,
      },
      {
        id: "layer-events",
        label: "Events",
        type: "events",
        children: layers.events.map((event) => ({
          id: `event-${event.id}`,
          label: event.name,
          type: "event" as const,
          children: [],
          dataId: event.id,
          expandable: false,
        })),
        badge: layers.events.length,
        expandable: layers.events.length > 0,
      },
      {
        id: "layer-lore",
        label: "Lore",
        type: "loreEntries",
        children: layers.lore.map((lore) => ({
          id: `lore-${lore.id}`,
          label: lore.title,
          type: "lore" as const,
          children: [],
          dataId: lore.id,
          expandable: false,
          metadata: { category: lore.category },
        })),
        badge: layers.lore.length,
        expandable: layers.lore.length > 0,
      },
      {
        id: "layer-difficulty-zones",
        label: "Difficulty Zones",
        type: "difficultyZones",
        children: layers.difficultyZones.map((zone) => ({
          id: `zone-${zone.id}`,
          label: zone.name,
          type: "difficultyZone" as const,
          children: [],
          dataId: zone.id,
          expandable: false,
          metadata: { difficultyLevel: zone.difficultyLevel },
        })),
        badge: layers.difficultyZones.length,
        expandable: layers.difficultyZones.length > 0,
      },
      {
        id: "layer-custom-placements",
        label: "Custom Placements",
        type: "customPlacements",
        children: layers.customPlacements.map((placement) => ({
          id: `placement-${placement.id}`,
          label: `${placement.objectType} @ (${Math.round(placement.position.x)}, ${Math.round(placement.position.z)})`,
          type: "customPlacement" as const,
          children: [],
          dataId: placement.id,
          expandable: false,
          metadata: { objectType: placement.objectType },
        })),
        badge: layers.customPlacements.length,
        expandable: layers.customPlacements.length > 0,
      },
    ];

    // Phase 3 extended layer children
    const ext = state.extendedLayers;
    const extendedLayersChildren: HierarchyNode[] = [
      {
        id: "layer-spawn-points",
        label: "Spawn Points",
        type: "spawnPoints",
        children: ext.spawnPoints.map((sp) => ({
          id: `spawn-${sp.id}`,
          label: sp.name,
          type: "spawnPoint" as const,
          children: [],
          dataId: sp.id,
          expandable: false,
          metadata: { spawnType: sp.spawnType },
        })),
        badge: ext.spawnPoints.length,
        expandable: ext.spawnPoints.length > 0,
      },
      {
        id: "layer-teleports",
        label: "Teleports",
        type: "teleports",
        children: ext.teleports.map((tp) => ({
          id: `teleport-${tp.id}`,
          label: tp.name,
          type: "teleport" as const,
          children: [],
          dataId: tp.id,
          expandable: false,
          metadata: { connections: tp.connections.length },
        })),
        badge: ext.teleports.length,
        expandable: ext.teleports.length > 0,
      },
      {
        id: "layer-mob-spawns",
        label: "Mob Spawns",
        type: "mobSpawns",
        children: ext.mobSpawns.map((ms) => ({
          id: `mobspawn-${ms.id}`,
          label: ms.name,
          type: "mobSpawn" as const,
          children: [],
          dataId: ms.id,
          expandable: false,
          metadata: { mobId: ms.mobId, maxCount: ms.maxCount },
        })),
        badge: ext.mobSpawns.length,
        expandable: ext.mobSpawns.length > 0,
      },
      {
        id: "layer-resources",
        label: "Resources",
        type: "resources",
        children: ext.resources.map((r) => ({
          id: `resource-${r.id}`,
          label: r.name,
          type: "resource" as const,
          children: [],
          dataId: r.id,
          expandable: false,
          metadata: { resourceType: r.resourceType },
        })),
        badge: ext.resources.length,
        expandable: ext.resources.length > 0,
      },
      {
        id: "layer-stations",
        label: "Stations",
        type: "stations",
        children: ext.stations.map((s) => ({
          id: `station-${s.id}`,
          label: s.name,
          type: "station" as const,
          children: [],
          dataId: s.id,
          expandable: false,
          metadata: { stationType: s.stationType },
        })),
        badge: ext.stations.length,
        expandable: ext.stations.length > 0,
      },
      {
        id: "layer-pois",
        label: "Points of Interest",
        type: "pois",
        children: ext.pois.map((poi) => ({
          id: `poi-${poi.id}`,
          label: poi.name,
          type: "poi" as const,
          children: [],
          dataId: poi.id,
          expandable: false,
          metadata: { category: poi.category, importance: poi.importance },
        })),
        badge: ext.pois.length,
        expandable: ext.pois.length > 0,
      },
      {
        id: "layer-water-bodies",
        label: "Water Bodies",
        type: "waterBodies",
        children: ext.waterBodies.map((wb) => ({
          id: `water-${wb.id}`,
          label: wb.name,
          type: "waterBody" as const,
          children: [],
          dataId: wb.id,
          expandable: false,
          metadata: { bodyType: wb.bodyType },
        })),
        badge: ext.waterBodies.length,
        expandable: ext.waterBodies.length > 0,
      },
    ];

    // Build audio layer children
    const audio = state.audioLayers;
    const audioChildren: HierarchyNode[] = [
      {
        id: "layer-music-zones",
        label: "Music Zones",
        type: "musicZones",
        children: audio.musicZones.map((mz) => ({
          id: `music-${mz.id}`,
          label: mz.name,
          type: "musicZone" as const,
          children: [],
          dataId: mz.id,
          expandable: false,
          metadata: { trackId: mz.trackId },
        })),
        badge: audio.musicZones.length,
        expandable: audio.musicZones.length > 0,
      },
      {
        id: "layer-ambient-zones",
        label: "Ambient Zones",
        type: "ambientZones",
        children: audio.ambientZones.map((az) => ({
          id: `ambient-${az.id}`,
          label: az.name,
          type: "ambientZone" as const,
          children: [],
          dataId: az.id,
          expandable: false,
          metadata: { ambientType: az.ambientType },
        })),
        badge: audio.ambientZones.length,
        expandable: audio.ambientZones.length > 0,
      },
      {
        id: "layer-sfx-triggers",
        label: "SFX Triggers",
        type: "sfxTriggers",
        children: audio.sfxTriggers.map((sfx) => ({
          id: `sfx-${sfx.id}`,
          label: sfx.name,
          type: "sfxTrigger" as const,
          children: [],
          dataId: sfx.id,
          expandable: false,
          metadata: { soundPath: sfx.soundPath, looping: sfx.looping },
        })),
        badge: audio.sfxTriggers.length,
        expandable: audio.sfxTriggers.length > 0,
      },
    ];

    // Build terrain chunks
    const worldSize = foundation.config.terrain.worldSize;
    const chunksPerSide = Math.ceil(worldSize / 10);
    const chunkChildren: HierarchyNode[] = [];
    for (let cx = 0; cx < chunksPerSide; cx++) {
      for (let cz = 0; cz < chunksPerSide; cz++) {
        const chunkId = `chunk-${cx}-${cz}`;
        const tilesInChunk =
          Math.min(10, worldSize - cx * 10) * Math.min(10, worldSize - cz * 10);
        chunkChildren.push({
          id: chunkId,
          label: `Chunk (${cx}, ${cz})`,
          type: "chunk",
          children: [],
          dataId: chunkId,
          expandable: false,
          badge: tilesInChunk,
          metadata: { chunkX: cx, chunkZ: cz, tileCount: tilesInChunk },
        });
      }
    }

    // Build road children
    const roadChildren: HierarchyNode[] = foundation.roads.map((road, idx) => ({
      id: `road-${road.id || idx}`,
      label: `Road ${road.connectedTowns[0]} → ${road.connectedTowns[1]}`,
      type: "road" as const,
      children: [],
      dataId: road.id || `road-${idx}`,
      expandable: false,
      metadata: {
        fromTown: road.connectedTowns[0],
        toTown: road.connectedTowns[1],
        length: road.path.length,
        isMainRoad: road.isMainRoad,
      },
    }));

    return {
      id: "world",
      label: world.name,
      type: "world",
      children: [
        {
          id: "terrain",
          label: "Terrain",
          type: "terrain",
          children: [
            {
              id: "chunks",
              label: "Chunks",
              type: "chunks",
              children: chunkChildren,
              badge: chunkChildren.length,
              expandable: chunkChildren.length > 0,
            },
          ],
          badge: worldSize * worldSize,
          expandable: true,
          metadata: {
            worldSize,
            tileSize: foundation.config.terrain.tileSize,
            totalTiles: worldSize * worldSize,
          },
        },
        {
          id: "biomes",
          label: "Biomes",
          type: "biomes",
          children: biomeChildren,
          badge: biomeChildren.length,
          expandable: biomeChildren.length > 0,
        },
        {
          id: "towns",
          label: "Towns",
          type: "towns",
          children: townChildren,
          badge: townChildren.length,
          expandable: townChildren.length > 0,
        },
        {
          id: "roads",
          label: "Roads",
          type: "roads",
          children: roadChildren,
          badge: roadChildren.length,
          expandable: roadChildren.length > 0,
        },
        {
          id: "layers",
          label: "Layers",
          type: "layers",
          children: [...layersChildren, ...extendedLayersChildren],
          expandable: true,
        },
        // Game manifest entities (from world-areas.json, rendered in viewport)
        ...(state.gameEntities
          ? (() => {
              const ge = state.gameEntities;
              const totalGame =
                ge.npcs.length +
                ge.stations.length +
                ge.resources.length +
                ge.mobSpawns.length;
              return [
                {
                  id: "game-entities",
                  label: "Game Entities",
                  type: "gameEntities" as const,
                  children: [
                    {
                      id: "game-npcs",
                      label: "NPCs",
                      type: "gameNpcs" as const,
                      children: ge.npcs.map((n) => ({
                        id: `game-npc-${n.selectableId}`,
                        label: n.name,
                        type: "gameNpc" as const,
                        children: [] as HierarchyNode[],
                        dataId: n.entityId,
                        expandable: false,
                        metadata: {
                          selectableId: n.selectableId,
                          position: n.position,
                        },
                      })),
                      badge: ge.npcs.length,
                      expandable: ge.npcs.length > 0,
                    },
                    {
                      id: "game-stations",
                      label: "Stations",
                      type: "gameStations" as const,
                      children: ge.stations.map((s) => ({
                        id: `game-station-${s.selectableId}`,
                        label: s.name,
                        type: "gameStation" as const,
                        children: [] as HierarchyNode[],
                        dataId: s.entityId,
                        expandable: false,
                        metadata: {
                          selectableId: s.selectableId,
                          position: s.position,
                        },
                      })),
                      badge: ge.stations.length,
                      expandable: ge.stations.length > 0,
                    },
                    {
                      id: "game-resources",
                      label: "Resources",
                      type: "gameResources" as const,
                      children: ge.resources.map((r) => ({
                        id: `game-resource-${r.selectableId}`,
                        label: r.name,
                        type: "gameResource" as const,
                        children: [] as HierarchyNode[],
                        dataId: r.entityId,
                        expandable: false,
                        metadata: {
                          selectableId: r.selectableId,
                          position: r.position,
                        },
                      })),
                      badge: ge.resources.length,
                      expandable: ge.resources.length > 0,
                    },
                    {
                      id: "game-mob-spawns",
                      label: "Mob Spawns",
                      type: "gameMobSpawns" as const,
                      children: ge.mobSpawns.map((m) => ({
                        id: `game-mobspawn-${m.selectableId}`,
                        label: m.name,
                        type: "gameMobSpawn" as const,
                        children: [] as HierarchyNode[],
                        dataId: m.entityId,
                        expandable: false,
                        metadata: {
                          selectableId: m.selectableId,
                          position: m.position,
                        },
                      })),
                      badge: ge.mobSpawns.length,
                      expandable: ge.mobSpawns.length > 0,
                    },
                    {
                      id: "game-fishing",
                      label: "Fishing Spots",
                      type: "gameFishing" as const,
                      children: [],
                      badge: ge.fishingSpots,
                      expandable: false,
                    },
                    {
                      id: "game-areas",
                      label: "World Areas",
                      type: "gameAreas" as const,
                      children: [],
                      badge: ge.areas,
                      expandable: false,
                    },
                  ],
                  badge: totalGame,
                  expandable: true,
                },
              ];
            })()
          : []),
        {
          id: "audio",
          label: "Audio",
          type: "audio",
          children: audioChildren,
          badge:
            audio.musicZones.length +
            audio.ambientZones.length +
            audio.sfxTriggers.length,
          expandable: audioChildren.some((c) => c.children.length > 0),
        },
      ],
      expandable: true,
    };
  }, [
    state.builder.editing.world,
    state.extendedLayers,
    state.audioLayers,
    state.gameEntities,
  ]);

  // Computed values
  const computed = useMemo(
    () => ({
      isCreationMode: state.builder.mode === "creation",
      isEditingMode: state.builder.mode === "editing",
      hasLoadedWorld: state.builder.editing.world !== null,
      isConfigModified: state.builder.creation.selectedPreset === null,
      getHierarchyTree,
      canUndo: state.builder.history.past.length > 0,
      canRedo: state.builder.history.future.length > 0,
      undoCount: state.builder.history.past.length,
      redoCount: state.builder.history.future.length,
      hasProject: state.project.currentProjectId !== null,
      isProjectLocked: state.project.lockedBy !== null,
      hasUnsavedChanges: state.builder.editing.hasUnsavedChanges,
      isPersisting: state.persistence.isSaving || state.persistence.isLoading,
    }),
    [
      state.builder.mode,
      state.builder.editing.world,
      state.builder.editing.hasUnsavedChanges,
      state.builder.creation.selectedPreset,
      getHierarchyTree,
      state.builder.history.past.length,
      state.builder.history.future.length,
      state.project.currentProjectId,
      state.project.lockedBy,
      state.persistence.isSaving,
      state.persistence.isLoading,
    ],
  );

  const contextValue = useMemo(
    () => ({ state, dispatch, actions, computed, viewportRef }),
    [state, actions, computed],
  );

  return (
    <WorldStudioContext.Provider value={contextValue}>
      {children}
    </WorldStudioContext.Provider>
  );
}

// ============== HOOKS ==============

export function useWorldStudio(): WorldStudioContextValue {
  const context = useContext(WorldStudioContext);
  if (!context) {
    throw new Error("useWorldStudio must be used within a WorldStudioProvider");
  }
  return context;
}

/** Select from the combined studio state */
export function useWorldStudioSelector<T>(
  selector: (state: WorldStudioState) => T,
): T {
  const { state } = useWorldStudio();
  return selector(state);
}

/** Get the builder sub-state (same shape as WorldBuilderState) */
export function useBuilderState(): WorldBuilderState {
  return useWorldStudioSelector((s) => s.builder);
}

/** Get the current mode */
export function useStudioMode(): WorldBuilderMode {
  return useWorldStudioSelector((s) => s.builder.mode);
}

/** Get the creation state */
export function useStudioCreationState(): CreationModeState {
  return useWorldStudioSelector((s) => s.builder.creation);
}

/** Get the editing state */
export function useStudioEditingState() {
  return useWorldStudioSelector((s) => s.builder.editing);
}

/** Get the viewport state */
export function useStudioViewportState() {
  return useWorldStudioSelector((s) => s.builder.viewport);
}

/** Get the current world data (or null) */
export function useStudioWorld(): WorldData | null {
  return useWorldStudioSelector((s) => s.builder.editing.world);
}

/** Get the current selection (or null) */
export function useStudioSelection(): Selection | null {
  return useWorldStudioSelector((s) => s.builder.editing.selection);
}

/** Get the project state */
export function useStudioProject(): StudioProjectState {
  return useWorldStudioSelector((s) => s.project);
}

/** Get the persistence state */
export function useStudioPersistence(): StudioPersistenceState {
  return useWorldStudioSelector((s) => s.persistence);
}

/** Get the active tool */
export function useStudioTool(): StudioToolMode {
  return useWorldStudioSelector((s) => s.tools.activeTool);
}

/** Get the active placement (or null) */
export function useActivePlacement(): ActivePlacement | null {
  return useWorldStudioSelector((s) => s.tools.activePlacement);
}

/** Get extended layers (Phase 3+ entities) */
export function useExtendedLayers(): ExtendedWorldLayers {
  return useWorldStudioSelector((s) => s.extendedLayers);
}

/** Get manifest data */
export function useManifests(): ManifestData {
  return useWorldStudioSelector((s) => s.manifests);
}

export default WorldStudioContext;
