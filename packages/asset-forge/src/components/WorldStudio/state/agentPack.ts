/**
 * agentPack — World-Studio-local state holder for the most recent
 * UIPackManifest emitted by the in-editor AgentBuilderForm.
 *
 * Why a local store: the runtime client has its own `uiPackRegistry`
 * (in packages/client/src/ui-framework/uiPackRegistry.ts) but
 * asset-forge / World Studio don't import from packages/client.
 * This module mirrors the same pattern (module-level state +
 * listeners + useSyncExternalStore hook) on the editor side so
 * PIE's HUD overlay can subscribe to agent-emitted packs.
 *
 * Lifecycle:
 *   1. AgentBuilderForm receives a validated pack from the agent
 *      server, calls `setAgentPack(pack)`.
 *   2. PIEHudOverlay (or any other consumer) reads the current pack
 *      via `useAgentPack()`. The hook re-renders subscribers when
 *      the pack changes.
 *   3. `clearAgentPack()` resets to null so the static
 *      `pickLayoutForGame` fallback wins again.
 *
 * The pack here is intentionally typed as `LoadedUIPack` — the
 * already-validated form, since the panel runs the pack through
 * `loadUIPack` before storing it. PIEHudOverlay can read the
 * `defaultLayout` directly with no further validation.
 */

import { useSyncExternalStore } from "react";
import {
  loadUIPack,
  type LoadedUIPack,
  type UIPackManifest,
} from "@hyperforge/ui-framework";

let activePack: LoadedUIPack | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

/**
 * Validate + store. Returns the LoadedUIPack on success or the
 * Zod issue list on failure (the panel already validates server-
 * side, but this is a defensive re-check at the editor seam).
 */
export function setAgentPack(
  pack: UIPackManifest | unknown,
):
  | { ok: true; loaded: LoadedUIPack }
  | { ok: false; issues: ReadonlyArray<{ path: string; message: string }> } {
  const result = loadUIPack(pack);
  if (!result.ok) {
    return {
      ok: false,
      issues: result.error.issues.map((i) => ({
        path: i.path.join(".") || "(root)",
        message: i.message,
      })),
    };
  }
  activePack = result.loaded;
  notify();
  return { ok: true, loaded: result.loaded };
}

export function clearAgentPack(): void {
  if (activePack === null) return;
  activePack = null;
  notify();
}

export function getAgentPack(): LoadedUIPack | null {
  return activePack;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * React hook — re-renders when the active agent pack changes.
 * Returns null when no pack is set (consumers fall back to their
 * existing layout source).
 */
export function useAgentPack(): LoadedUIPack | null {
  return useSyncExternalStore(
    subscribe,
    getAgentPack,
    () => null, // SSR snapshot
  );
}
