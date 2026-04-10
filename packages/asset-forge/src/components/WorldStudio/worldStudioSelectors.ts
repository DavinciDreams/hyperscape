/**
 * World Studio state selectors — typed accessor functions that encapsulate
 * state access patterns and eliminate deep property chain access.
 *
 * Extracted from WorldStudioContext.tsx to reduce file size.
 * Also provides selector hooks for React components.
 */

import type {
  WorldStudioState,
  StudioToolMode,
  GizmoTransformMode,
  GizmoTransformSpace,
  StudioViewportOverlays,
  ZonePaintState,
  WizardPreviewData,
  ActivePlacement,
  ExtendedWorldLayers,
  ManifestData,
  BrushSettings,
  BrushOverlays,
  AudioLayers,
  DeploymentState,
  WorldData,
  Selection,
  PlacedMobSpawn,
  PlacedResource,
  PlacedStation,
  PlacedNPC,
  PlacedSpawnPoint,
  PlacedTeleport,
  PlacedPOI,
  PlacedWaterBody,
  PlacedRegion,
  PlacedDangerSource,
  PlacedMine,
  WildernessBoundary,
  ManifestOverrides,
  GameEntityData,
  StudioProjectState,
  StudioPersistenceState,
} from "./worldStudioTypes";

// ============== PURE SELECTOR FUNCTIONS ==============
// Use these in components or tests to access state without deep chains.

// --- Tool state ---
export const selectActiveTool = (state: WorldStudioState): StudioToolMode =>
  state.tools.activeTool;

export const selectTransformMode = (
  state: WorldStudioState,
): GizmoTransformMode => state.tools.transformMode;

export const selectTransformSpace = (
  state: WorldStudioState,
): GizmoTransformSpace => state.tools.transformSpace;

export const selectActivePlacement = (
  state: WorldStudioState,
): ActivePlacement | null => state.tools.activePlacement;

export const selectBrushSettings = (state: WorldStudioState): BrushSettings =>
  state.tools.brushSettings;

export const selectZonePaint = (
  state: WorldStudioState,
): ZonePaintState | null => state.tools.zonePaint;

export const selectCameraTeleportTarget = (state: WorldStudioState) =>
  state.tools.cameraTeleportTarget;

// --- Extended layers ---
export const selectExtendedLayers = (
  state: WorldStudioState,
): ExtendedWorldLayers => state.extendedLayers;

export const selectNPCs = (state: WorldStudioState): PlacedNPC[] =>
  state.extendedLayers.npcs;

export const selectSpawnPoints = (
  state: WorldStudioState,
): PlacedSpawnPoint[] => state.extendedLayers.spawnPoints;

export const selectTeleports = (state: WorldStudioState): PlacedTeleport[] =>
  state.extendedLayers.teleports;

export const selectMobSpawns = (state: WorldStudioState): PlacedMobSpawn[] =>
  state.extendedLayers.mobSpawns;

export const selectResources = (state: WorldStudioState): PlacedResource[] =>
  state.extendedLayers.resources;

export const selectStations = (state: WorldStudioState): PlacedStation[] =>
  state.extendedLayers.stations;

export const selectPOIs = (state: WorldStudioState): PlacedPOI[] =>
  state.extendedLayers.pois;

export const selectWaterBodies = (state: WorldStudioState): PlacedWaterBody[] =>
  state.extendedLayers.waterBodies;

export const selectRegions = (state: WorldStudioState): PlacedRegion[] =>
  state.extendedLayers.regions;

export const selectDangerSources = (
  state: WorldStudioState,
): PlacedDangerSource[] => state.extendedLayers.dangerSources;

export const selectMines = (state: WorldStudioState): PlacedMine[] =>
  state.extendedLayers.mines;

export const selectWildernessBoundary = (
  state: WorldStudioState,
): WildernessBoundary | null => state.extendedLayers.wildernessBoundary;

// --- Overlays ---
export const selectOverlays = (
  state: WorldStudioState,
): StudioViewportOverlays => state.overlays;

export const selectBrushOverlays = (state: WorldStudioState): BrushOverlays =>
  state.brushOverlays;

// --- Manifests ---
export const selectManifests = (state: WorldStudioState): ManifestData =>
  state.manifests;

export const selectManifestOverrides = (
  state: WorldStudioState,
): ManifestOverrides => state.manifestOverrides;

// --- Audio ---
export const selectAudioLayers = (state: WorldStudioState): AudioLayers =>
  state.audioLayers;

// --- Deployment ---
export const selectDeployment = (state: WorldStudioState): DeploymentState =>
  state.deployment;

// --- Project & persistence ---
export const selectProject = (state: WorldStudioState): StudioProjectState =>
  state.project;

export const selectPersistence = (
  state: WorldStudioState,
): StudioPersistenceState => state.persistence;

// --- Builder sub-state ---
export const selectWorld = (state: WorldStudioState): WorldData | null =>
  state.builder.editing.world;

export const selectSelection = (state: WorldStudioState): Selection | null =>
  state.builder.editing.selection;

export const selectHasUnsavedChanges = (state: WorldStudioState): boolean =>
  state.builder.editing.hasUnsavedChanges;

export const selectCanUndo = (state: WorldStudioState): boolean =>
  state.builder.history.past.length > 0;

export const selectCanRedo = (state: WorldStudioState): boolean =>
  state.builder.history.future.length > 0;

// --- Game entities & wizard ---
export const selectGameEntities = (
  state: WorldStudioState,
): GameEntityData | null => state.gameEntities;

export const selectWizardPreview = (
  state: WorldStudioState,
): WizardPreviewData | null => state.wizardPreview;
