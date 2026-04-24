/**
 * useUserLayout — per-user layout overrides for manifest-driven HUD.
 *
 * Stores a map of `layoutId → UIUserLayout` in localStorage so that a
 * player's tweaks to one layout don't leak into another authored
 * layout on the same module. `resolveLayout(manifest, userLayout)` in
 * `@hyperforge/ui-framework` consumes the stored value at render time.
 *
 * Design notes:
 *   - Overrides are *partial* — only the fields the player changed
 *     are stored, so new widgets shipped by the author appear at
 *     their authored position without interfering.
 *   - Every mutation bumps `updatedAt` so consumers can reason about
 *     freshness; the `layoutRevision` field mirrors the manifest
 *     revision at the time the override was recorded and is used by
 *     future migration code to decide when to drop stale overrides.
 *   - The store is flat (one map across all layouts) so localStorage
 *     stays compact and zustand's persist middleware can round-trip
 *     in a single key.
 */

import { useCallback } from "react";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  safeLoadUserLayout,
  type LayoutAnchor,
  type UIOverride,
  type UIOverridePosition,
  type UIUserLayout,
} from "@hyperforge/ui-framework";
import { reportSafeLoadFailure } from "./safeLoadReport";

/** localStorage key for the entire per-user layout map. */
const STORAGE_KEY = "hyperia-user-layout";
/** Persisted schema version — bump to force migration. */
const STORAGE_VERSION = 1;

/** Fields a caller can override for a single widget instance. */
export interface InstanceOverridePatch {
  /** Anchor + offset + explicit size (all optional). */
  position?: Partial<UIOverridePosition> & {
    anchor?: LayoutAnchor;
  };
  /** Toggle widget visibility without removing it. */
  visible?: boolean;
  /** 0..1 opacity (reserved for U7). */
  transparency?: number;
}

interface UserLayoutStoreState {
  /** `layoutId → UIUserLayout`; empty keys are pruned. */
  layouts: Record<string, UIUserLayout>;

  /** Merge a partial patch into the override for `(layoutId, instanceId)`. */
  setOverride: (
    layoutId: string,
    layoutRevision: number | undefined,
    instanceId: string,
    patch: InstanceOverridePatch,
  ) => void;
  /** Remove the override for a single instance; prunes the layout if empty. */
  clearInstance: (layoutId: string, instanceId: string) => void;
  /** Remove every override for the given layout. */
  clearLayout: (layoutId: string) => void;
  /** Remove overrides for every layout. */
  clearAll: () => void;
}

/**
 * Merge a new `InstanceOverridePatch` into an existing `UIOverride`.
 * Returns `null` if the resulting override would be empty (no
 * position, no visibility, no transparency) so the caller can prune
 * the entry rather than keep an all-undefined record.
 */
function mergeOverride(
  existing: UIOverride | undefined,
  instanceId: string,
  patch: InstanceOverridePatch,
): UIOverride | null {
  const basePosition: UIOverridePosition | undefined =
    patch.position !== undefined || existing?.position
      ? { ...existing?.position, ...patch.position }
      : undefined;

  const positionEmpty =
    !basePosition ||
    (basePosition.anchor === undefined &&
      basePosition.offsetX === undefined &&
      basePosition.offsetY === undefined &&
      basePosition.width === undefined &&
      basePosition.height === undefined);

  const next: UIOverride = {
    instanceId,
    position: positionEmpty ? undefined : basePosition,
    visible: patch.visible !== undefined ? patch.visible : existing?.visible,
    transparency:
      patch.transparency !== undefined
        ? patch.transparency
        : existing?.transparency,
  };

  if (
    next.position === undefined &&
    next.visible === undefined &&
    next.transparency === undefined
  ) {
    return null;
  }
  return next;
}

export const useUserLayoutStore = create<UserLayoutStoreState>()(
  persist(
    (set) => ({
      layouts: {},

      setOverride: (layoutId, layoutRevision, instanceId, patch) => {
        set((state) => {
          const existingLayout = state.layouts[layoutId];
          const existingOverrides = existingLayout?.overrides ?? [];
          const existingOverride = existingOverrides.find(
            (o) => o.instanceId === instanceId,
          );

          const merged = mergeOverride(existingOverride, instanceId, patch);
          const remaining = existingOverrides.filter(
            (o) => o.instanceId !== instanceId,
          );
          const nextOverrides = merged ? [...remaining, merged] : remaining;

          if (nextOverrides.length === 0) {
            // Prune the layout entry entirely.
            const { [layoutId]: _dropped, ...rest } = state.layouts;
            return { layouts: rest };
          }

          const nextLayout: UIUserLayout = {
            schemaVersion: 1,
            layoutId,
            layoutRevision: layoutRevision ?? existingLayout?.layoutRevision,
            updatedAt: Date.now(),
            overrides: nextOverrides,
          };
          return { layouts: { ...state.layouts, [layoutId]: nextLayout } };
        });
      },

      clearInstance: (layoutId, instanceId) => {
        set((state) => {
          const existing = state.layouts[layoutId];
          if (!existing) return state;
          const nextOverrides = existing.overrides.filter(
            (o) => o.instanceId !== instanceId,
          );
          if (nextOverrides.length === 0) {
            const { [layoutId]: _dropped, ...rest } = state.layouts;
            return { layouts: rest };
          }
          return {
            layouts: {
              ...state.layouts,
              [layoutId]: {
                ...existing,
                updatedAt: Date.now(),
                overrides: nextOverrides,
              },
            },
          };
        });
      },

      clearLayout: (layoutId) => {
        set((state) => {
          const { [layoutId]: _dropped, ...rest } = state.layouts;
          return { layouts: rest };
        });
      },

      clearAll: () => {
        set({ layouts: {} });
      },
    }),
    {
      name: STORAGE_KEY,
      version: STORAGE_VERSION,
      storage: createJSONStorage(() => localStorage),
      // U11 hardening — on every rehydrate, any persisted entry that
      // fails `safeLoadUserLayout` (tampered storage, failed migration,
      // schema drift) is silently dropped instead of propagating into
      // the HUD. Valid entries pass through untouched.
      merge: (persistedState, currentState) => {
        const next: Record<string, UIUserLayout> = {};
        const rawLayouts = (persistedState as { layouts?: unknown } | null)
          ?.layouts;
        if (rawLayouts && typeof rawLayouts === "object") {
          for (const [layoutId, entry] of Object.entries(rawLayouts)) {
            const loaded = safeLoadUserLayout(entry);
            if (loaded.value) {
              next[layoutId] = loaded.value;
            } else if (loaded.failure) {
              reportSafeLoadFailure("user-layout-merge", loaded.failure);
            }
          }
        }
        return { ...currentState, layouts: next };
      },
    },
  ),
);

/**
 * Read the `UIUserLayout | null` for the given layoutId. Returns a
 * stable reference — zustand's shallow equality on primitive layoutId
 * keys avoids unnecessary renders in the HUD tree.
 */
export function useUserLayout(
  layoutId: string | undefined,
): UIUserLayout | null {
  return useUserLayoutStore((state) =>
    layoutId ? (state.layouts[layoutId] ?? null) : null,
  );
}

/**
 * Imperative handle for widgets to patch their own override. The
 * returned callback is stable across renders; it reads the
 * `layoutRevision` lazily so freshly-loaded manifests are honored.
 */
export function useSetInstanceOverride(
  layoutId: string | undefined,
  layoutRevision: number | undefined,
): (instanceId: string, patch: InstanceOverridePatch) => void {
  const setOverride = useUserLayoutStore((s) => s.setOverride);
  return useCallback(
    (instanceId, patch) => {
      if (!layoutId) return;
      setOverride(layoutId, layoutRevision, instanceId, patch);
    },
    [layoutId, layoutRevision, setOverride],
  );
}
