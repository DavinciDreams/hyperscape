/**
 * useStoreSync — One-way bridge from WorldStudioContext → Zustand stores
 *
 * During the incremental migration from the monolithic context to Zustand,
 * this hook keeps both systems in sync. It pushes context state changes
 * INTO the Zustand stores so that:
 *
 * - Existing code continues using the context (no breakage)
 * - New/migrated code can subscribe to Zustand stores for fine-grained
 *   re-renders (only re-render when your slice changes)
 *
 * Type assertions are used throughout because the Zustand stores define
 * structurally similar (but independently declared) types. This is
 * intentional and temporary — once migration completes, this file and
 * the context wrapper are deleted.
 */

import { useEffect, useRef } from "react";

import type { WorldStudioState } from "../../components/WorldStudio/WorldStudioContext";
import { useSelectionStore } from "./useSelectionStore";
import { useToolStore } from "./useToolStore";
import { useProjectStore } from "./useProjectStore";
import { useDeploymentStore } from "./useDeploymentStore";
import { useAudioStore } from "./useAudioStore";
import { useAIStore } from "./useAIStore";
import { useOverlayStore } from "./useOverlayStore";
import { useSceneStore } from "./useSceneStore";

// Helper: shallow-assign a partial into a Zustand store, bypassing
// nominal type differences between the context types and store types.
// Safe because the shapes are structurally identical at runtime.
function syncStore<T extends object>(
  store: { setState: (partial: Partial<T>) => void },
  partial: Record<string, unknown>,
): void {
  store.setState(partial as Partial<T>);
}

/**
 * Call inside WorldStudioProvider. Syncs context state → Zustand stores
 * on every render where the relevant slice has changed.
 */
export function useStoreSync(state: WorldStudioState): void {
  const prevRef = useRef<WorldStudioState | null>(null);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = state;

    // Selection
    if (
      !prev ||
      prev.builder.editing.selection !== state.builder.editing.selection
    ) {
      const s = state.builder.editing.selection;
      syncStore(useSelectionStore, { selection: s ? { ...s } : null });
    }
    if (
      !prev ||
      prev.builder.editing.hoveredElement !==
        state.builder.editing.hoveredElement
    ) {
      const h = state.builder.editing.hoveredElement;
      syncStore(useSelectionStore, { hovered: h ? { ...h } : null });
    }
    if (
      !prev ||
      prev.builder.editing.selectionMode !== state.builder.editing.selectionMode
    ) {
      syncStore(useSelectionStore, {
        selectionMode: state.builder.editing.selectionMode,
      });
    }

    // Tools
    if (!prev || prev.tools !== state.tools) {
      const t = state.tools;
      syncStore(useToolStore, {
        activeTool: t.activeTool,
        activePlacement: t.activePlacement ? { ...t.activePlacement } : null,
        brushSettings: { ...t.brushSettings },
        cameraTeleportTarget: t.cameraTeleportTarget,
      });
    }

    // Project + persistence
    if (
      !prev ||
      prev.project !== state.project ||
      prev.persistence !== state.persistence
    ) {
      syncStore(useProjectStore, {
        project: { ...state.project },
        persistence: { ...state.persistence },
      });
    }

    // Deployment
    if (!prev || prev.deployment !== state.deployment) {
      const d = state.deployment;
      syncStore(useDeploymentStore, {
        stagingStatus: d.stagingStatus,
        productionStatus: d.productionStatus,
        error: d.error,
        currentDiff: d.currentDiff ? { ...d.currentDiff } : null,
        isComputingDiff: d.isComputingDiff,
        history: [...d.history],
        pendingPromotion: d.pendingPromotion ? { ...d.pendingPromotion } : null,
      });
    }

    // Audio
    if (!prev || prev.audioLayers !== state.audioLayers) {
      const a = state.audioLayers;
      syncStore(useAudioStore, {
        musicZones: [...a.musicZones],
        ambientZones: [...a.ambientZones],
        sfxTriggers: [...a.sfxTriggers],
      });
    }

    // AI generation
    if (!prev || prev.aiGeneration !== state.aiGeneration) {
      const ai = state.aiGeneration;
      syncStore(useAIStore, {
        status: ai.status,
        activeEntityId: ai.activeEntityId,
        error: ai.error,
        dialogues: [...ai.dialogues],
        voiceClips: [...ai.voiceClips],
        quests: [...ai.quests],
      });
    }

    // Viewport overlays
    if (!prev || prev.overlays !== state.overlays) {
      syncStore(useOverlayStore, { ...state.overlays });
    }

    // Extended layers
    if (!prev || prev.extendedLayers !== state.extendedLayers) {
      const ext = state.extendedLayers;
      syncStore(useSceneStore, {
        extendedLayers: {
          spawnPoints: [...ext.spawnPoints],
          teleports: [...ext.teleports],
          mobSpawns: [...ext.mobSpawns],
          resources: [...ext.resources],
          stations: [...ext.stations],
          npcs: [],
          pois: [...ext.pois],
          waterBodies: [...ext.waterBodies],
        },
      });
    }

    // Brush overlays
    if (!prev || prev.brushOverlays !== state.brushOverlays) {
      const bo = state.brushOverlays;
      syncStore(useSceneStore, {
        brushOverlays: {
          terrainSculpts: [...bo.terrainSculpts],
          biomePaints: [...bo.biomePaints],
          vegetationPaints: [...bo.vegetationPaints],
          tileCollisions: [...bo.tileCollisions],
        },
      });
    }
  });
}
