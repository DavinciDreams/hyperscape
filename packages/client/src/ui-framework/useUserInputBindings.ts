/**
 * useUserInputBindings — per-player input-chord overrides keyed by
 * `manifestId`. Mirrors `useUserLayout`: sparse partial overrides,
 * persisted to localStorage, rehydrated through `safeLoadUserInputBindings`
 * so tampered or schema-drifted blobs are silently dropped.
 *
 * Scope: one record per `manifestId`. If a module ships two different
 * `InputBindingManifest` versions (unlikely but possible), they have
 * independent override state.
 *
 * This is the write-side companion to `resolveInputBindings` and the
 * `useInputActions` listener hook.
 */

import { useCallback } from "react";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  safeLoadUserInputBindings,
  type InputChord,
  type UserInputBindings,
} from "@hyperforge/ui-framework";
import { reportSafeLoadFailure } from "./safeLoadReport";

const STORAGE_KEY = "hyperia-user-input-bindings";
const STORAGE_VERSION = 1;

interface UserInputBindingsStoreState {
  /** `manifestId → UserInputBindings`; empty records are pruned. */
  byManifest: Record<string, UserInputBindings>;

  /**
   * Replace the chord list for `(manifestId, actionId)`. An empty
   * `chords` array unbinds the action. Passing `chords: null` removes
   * the override entirely (so the action falls back to manifest defaults).
   */
  setActionChords: (
    manifestId: string,
    actionId: string,
    chords: InputChord[] | null,
  ) => void;
  /** Remove every override for a manifest. */
  clearManifest: (manifestId: string) => void;
  /** Remove every override across every manifest. */
  clearAll: () => void;
}

function pruneEmpty(
  record: Record<string, UserInputBindings>,
  manifestId: string,
): Record<string, UserInputBindings> {
  const entry = record[manifestId];
  if (entry && entry.bindings.length === 0) {
    const { [manifestId]: _dropped, ...rest } = record;
    return rest;
  }
  return record;
}

export const useUserInputBindingsStore = create<UserInputBindingsStoreState>()(
  persist(
    (set) => ({
      byManifest: {},

      setActionChords: (manifestId, actionId, chords) => {
        set((state) => {
          const existing = state.byManifest[manifestId];
          const existingBindings = existing?.bindings ?? [];
          const filtered = existingBindings.filter(
            (b) => b.actionId !== actionId,
          );
          const nextBindings =
            chords === null ? filtered : [...filtered, { actionId, chords }];

          if (nextBindings.length === 0) {
            const { [manifestId]: _dropped, ...rest } = state.byManifest;
            return { byManifest: rest };
          }

          const next: UserInputBindings = {
            schemaVersion: 1,
            manifestId,
            updatedAt: Date.now(),
            bindings: nextBindings,
          };
          return {
            byManifest: pruneEmpty(
              { ...state.byManifest, [manifestId]: next },
              manifestId,
            ),
          };
        });
      },

      clearManifest: (manifestId) => {
        set((state) => {
          const { [manifestId]: _dropped, ...rest } = state.byManifest;
          return { byManifest: rest };
        });
      },

      clearAll: () => {
        set({ byManifest: {} });
      },
    }),
    {
      name: STORAGE_KEY,
      version: STORAGE_VERSION,
      storage: createJSONStorage(() => localStorage),
      // U11 hardening — every rehydrated entry is validated through
      // `safeLoadUserInputBindings`; corrupt/tampered records are
      // silently dropped rather than propagated into the input stack.
      merge: (persistedState, currentState) => {
        const next: Record<string, UserInputBindings> = {};
        const raw = (persistedState as { byManifest?: unknown } | null)
          ?.byManifest;
        if (raw && typeof raw === "object") {
          for (const [manifestId, entry] of Object.entries(raw)) {
            const loaded = safeLoadUserInputBindings(entry);
            if (loaded.value) {
              next[manifestId] = loaded.value;
            } else if (loaded.failure) {
              reportSafeLoadFailure(
                "user-input-bindings-merge",
                loaded.failure,
              );
            }
          }
        }
        return { ...currentState, byManifest: next };
      },
    },
  ),
);

/**
 * React helper: returns the `UserInputBindings | null` for a manifest.
 */
export function useUserInputBindings(
  manifestId: string | undefined,
): UserInputBindings | null {
  return useUserInputBindingsStore((state) =>
    manifestId ? (state.byManifest[manifestId] ?? null) : null,
  );
}

/**
 * React helper: imperative handle for rebinding UIs. Returns a stable
 * callback keyed by `manifestId`. Pass `chords: null` to clear an
 * override (fall back to manifest defaults) or `chords: []` to unbind.
 */
export function useSetActionChords(
  manifestId: string | undefined,
): (actionId: string, chords: InputChord[] | null) => void {
  const set = useUserInputBindingsStore((s) => s.setActionChords);
  return useCallback(
    (actionId, chords) => {
      if (!manifestId) return;
      set(manifestId, actionId, chords);
    },
    [manifestId, set],
  );
}
