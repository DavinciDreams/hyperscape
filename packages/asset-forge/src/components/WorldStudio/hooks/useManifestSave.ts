/**
 * useManifestSave — Saves manifest changes back to the Asset Forge API
 *
 * Provides a saveManifest function that writes manifest content via PUT /api/manifests/:name,
 * with automatic backup creation and validation. Returns save state (saving, error).
 */

import { useState, useCallback } from "react";

const MANIFESTS_API_BASE = "/api/manifests";

interface SaveResult {
  success: boolean;
  backupPath?: string;
  error?: string;
}

interface ManifestSaveState {
  isSaving: boolean;
  lastError: string | null;
  lastSavedManifest: string | null;
}

export function useManifestSave() {
  const [saveState, setSaveState] = useState<ManifestSaveState>({
    isSaving: false,
    lastError: null,
    lastSavedManifest: null,
  });

  const saveManifest = useCallback(
    async (name: string, content: unknown): Promise<SaveResult> => {
      setSaveState({
        isSaving: true,
        lastError: null,
        lastSavedManifest: null,
      });

      try {
        // Validate first
        const validateRes = await fetch(
          `${MANIFESTS_API_BASE}/${name}/validate`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content }),
          },
        );

        if (!validateRes.ok) {
          const err = await validateRes.json();
          throw new Error(
            err.error ?? `Validation failed: ${validateRes.status}`,
          );
        }

        const validation = await validateRes.json();
        if (!validation.valid && validation.errors?.length > 0) {
          const errorMessages = validation.errors
            .slice(0, 3)
            .map(
              (e: { path: string; message: string }) =>
                `${e.path}: ${e.message}`,
            )
            .join("; ");
          throw new Error(`Validation errors: ${errorMessages}`);
        }

        // Save
        const saveRes = await fetch(`${MANIFESTS_API_BASE}/${name}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        });

        if (!saveRes.ok) {
          const err = await saveRes.json();
          throw new Error(err.error ?? `Save failed: ${saveRes.status}`);
        }

        const result = await saveRes.json();
        setSaveState({
          isSaving: false,
          lastError: null,
          lastSavedManifest: name,
        });
        return {
          success: true,
          backupPath: result.backupPath,
        };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to save manifest";
        setSaveState({
          isSaving: false,
          lastError: message,
          lastSavedManifest: null,
        });
        return { success: false, error: message };
      }
    },
    [],
  );

  return { saveManifest, ...saveState };
}
