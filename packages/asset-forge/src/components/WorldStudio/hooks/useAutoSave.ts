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
import { useWorldStudio } from "../WorldStudioContext";

const AUTO_SAVE_DEBOUNCE_MS = 30_000; // 30 seconds

export function useAutoSave(projectId: string, enabled: boolean) {
  const { state, actions } = useWorldStudio();
  const hasUnsavedChanges = state.builder.editing.hasUnsavedChanges;
  const isSaving = state.persistence.isSaving;
  const world = state.builder.editing.world;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSavingRef = useRef(false);

  const doSave = useCallback(async () => {
    if (!world || isSavingRef.current) return;
    isSavingRef.current = true;
    actions.saveStart();

    try {
      const serialized = serializeWorld(world);
      const result = await saveWorldProject(projectId, {
        worldData: serialized,
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
