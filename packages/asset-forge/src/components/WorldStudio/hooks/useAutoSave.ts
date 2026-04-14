/**
 * useAutoSave — Periodic auto-save to server
 *
 * Watches for unsaved changes and debounces saves to the server.
 * Refreshes project lock on each save.
 */

import { useEffect, useRef, useCallback } from "react";

import { serializeWorld } from "../../WorldBuilder/utils/worldPersistence";
import {
  saveWorldProject,
  acquireProjectLock,
} from "../../../utils/worldProjectApi";
import { serializeManifestOverrides } from "../types";
import { useWorldStudio } from "../WorldStudioContext";

const AUTO_SAVE_DEBOUNCE_MS = 30_000; // 30 seconds

export function useAutoSave(projectId: string, enabled: boolean) {
  const { state, actions } = useWorldStudio();
  const hasUnsavedChanges = state.builder.editing.hasUnsavedChanges;
  const isSaving = state.persistence.isSaving;
  const world = state.builder.editing.world;
  const manifestOverrides = state.manifestOverrides;
  const brushOverlays = state.brushOverlays;
  const extendedLayers = state.extendedLayers;
  const audioLayers = state.audioLayers;
  const prefabs = state.prefabs;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSavingRef = useRef(false);
  const manifestOverridesRef = useRef(manifestOverrides);
  manifestOverridesRef.current = manifestOverrides;
  const brushOverlaysRef = useRef(brushOverlays);
  brushOverlaysRef.current = brushOverlays;
  const extendedLayersRef = useRef(extendedLayers);
  extendedLayersRef.current = extendedLayers;
  const audioLayersRef = useRef(audioLayers);
  audioLayersRef.current = audioLayers;
  const prefabsRef = useRef(prefabs);
  prefabsRef.current = prefabs;

  const doSave = useCallback(async () => {
    if (!world || isSavingRef.current) return;
    isSavingRef.current = true;
    actions.saveStart();

    try {
      const serialized = serializeWorld(world) as unknown as Record<
        string,
        unknown
      >;
      // Persist brush overlays (terrain sculpts, biome paints) alongside world data
      const bo = brushOverlaysRef.current;
      if (bo.terrainSculpts.length > 0 || bo.biomePaints.length > 0) {
        serialized.brushOverlays = bo;
      }
      // Persist extended layers (spawn points, teleports, resources, etc.)
      const ext = extendedLayersRef.current;
      const hasExtendedData = Object.values(ext).some((v) =>
        Array.isArray(v) ? v.length > 0 : v !== null,
      );
      if (hasExtendedData) {
        serialized.extendedLayers = ext;
      }
      // Persist audio layers (music zones, ambient zones, SFX triggers)
      const audio = audioLayersRef.current;
      if (
        audio.musicZones.length > 0 ||
        audio.ambientZones.length > 0 ||
        audio.sfxTriggers.length > 0
      ) {
        serialized.audioLayers = audio;
      }
      // Persist prefabs
      const pf = prefabsRef.current;
      if (pf.length > 0) {
        serialized.prefabs = pf;
      }
      const manifestSnapshot = serializeManifestOverrides(
        manifestOverridesRef.current,
      );
      const result = await saveWorldProject(projectId, {
        worldData: serialized,
        manifestSnapshot,
      });
      actions.saveSuccess(Date.now(), result.version);

      // Refresh lock
      try {
        await acquireProjectLock(projectId);
      } catch {
        // Non-fatal
      }
    } catch (err) {
      actions.saveError(
        err instanceof Error ? err.message : "Auto-save failed",
      );
    } finally {
      isSavingRef.current = false;
    }
  }, [world, projectId, actions]);

  // Debounce auto-save
  useEffect(() => {
    if (!enabled || !hasUnsavedChanges || isSaving) return;

    timerRef.current = setTimeout(() => {
      doSave();
    }, AUTO_SAVE_DEBOUNCE_MS);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [enabled, hasUnsavedChanges, isSaving, doSave]);

  return { save: doSave };
}
