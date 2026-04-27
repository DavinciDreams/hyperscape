/**
 * useActiveUIPack — React hook that subscribes to the client's
 * `uiPackRegistry` and returns the currently-active `LoadedUIPack`.
 *
 * Built on `useSyncExternalStore` so React 18+ tearing-safety holds
 * for concurrent renders. The store snapshot is the active pack
 * reference itself; identity comparison is sufficient because
 * `registerUIPack` always allocates a fresh `LoadedUIPack` object
 * via `loadUIPack` (no in-place mutation of registered packs).
 *
 * Returns `null` when no pack is active. Consumers fall through to
 * the existing `useActiveUILayout` / `getDefaultUILayoutForGame`
 * pipeline in that case — see ManifestHud's pack-aware path
 * (D10 wire-through).
 */

import { useSyncExternalStore } from "react";

import type { LoadedUIPack } from "@hyperforge/ui-framework";

import { getActiveUIPack, subscribeUIPackRegistry } from "./uiPackRegistry";

export function useActiveUIPack(): LoadedUIPack | null {
  return useSyncExternalStore(
    subscribeUIPackRegistry,
    getActiveUIPack,
    // SSR snapshot — always null because the registry is in-memory
    // and lives only on the client. SSR'd HUD falls through to the
    // existing useActiveUILayout server-fetch path.
    () => null,
  );
}
