/**
 * uiPackRegistry.ts — client-side store of loaded `UIPackManifest`s.
 *
 * The engine's `loadUIPack` is pure — it validates a manifest and
 * returns a structured `LoadedUIPack` projection, but it doesn't
 * remember anything. The host needs to keep track of which packs
 * have been loaded and which one is currently "active" so React
 * components can render against it without re-loading on every
 * render.
 *
 * This module is the host-side persistence layer. Mirrors the shape
 * of `themeRegistry`: tiny + synchronous, in-memory only, with a
 * `useSyncExternalStore`-friendly listener API that React hooks
 * consume.
 *
 * Phase D9 → D10. The active-pack pointer is the seam that
 * `useActiveUIPack` reads from; downstream consumers (ManifestHud,
 * etc.) will eventually pull `activePack.layouts.default` instead of
 * the hand-wired `DEFAULT_UI_LAYOUT` fallback.
 */

import type { LoadedUIPack } from "@hyperforge/ui-framework";

const packs = new Map<string, LoadedUIPack>();
let activePackId: string | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

/**
 * Register a loaded pack. If a pack with the same id is already
 * registered it is replaced — packs are versioned by their `id`, so
 * re-registering is the standard way to update a pack at runtime.
 *
 * Returns the registered pack so callers can chain `setActiveUIPack`
 * if desired.
 */
export function registerUIPack(loaded: LoadedUIPack): LoadedUIPack {
  packs.set(loaded.id, loaded);
  notify();
  return loaded;
}

/**
 * Remove a pack by id. If the pack was the active one, the active
 * pointer is cleared (callers must `setActiveUIPack(...)` again to
 * pick a new one).
 */
export function unregisterUIPack(id: string): void {
  if (!packs.has(id)) return;
  packs.delete(id);
  if (activePackId === id) activePackId = null;
  notify();
}

/** Look up a registered pack by id. Returns `null` for unknown ids. */
export function resolveUIPackById(id: string): LoadedUIPack | null {
  return packs.get(id) ?? null;
}

/** Full list of currently-registered pack ids. */
export function listRegisteredUIPacks(): string[] {
  return Array.from(packs.keys());
}

/** Number of registered packs. */
export function uiPackRegistrySize(): number {
  return packs.size;
}

/**
 * Set the active pack by id. Throws if the id isn't registered —
 * callers should `registerUIPack(...)` first. Pass `null` to clear
 * the active pointer.
 */
export function setActiveUIPack(id: string | null): void {
  if (id !== null && !packs.has(id)) {
    throw new Error(
      `setActiveUIPack: pack "${id}" is not registered. ` +
        `Call registerUIPack(...) first.`,
    );
  }
  if (activePackId === id) return; // No-op if unchanged — avoids redundant notifies.
  activePackId = id;
  notify();
}

/** Read the active pack id (or `null` if none is active). */
export function getActiveUIPackId(): string | null {
  return activePackId;
}

/**
 * Read the active pack. Returns `null` when no pack is active or the
 * active id has been unregistered (defensive — should not happen,
 * but cheap to guard).
 */
export function getActiveUIPack(): LoadedUIPack | null {
  if (activePackId === null) return null;
  return packs.get(activePackId) ?? null;
}

/**
 * Subscribe to registry changes. Returns an unsubscribe callback.
 * Used by `useActiveUIPack` via `useSyncExternalStore`. Listeners are
 * invoked on every register / unregister / setActive call.
 */
export function subscribeUIPackRegistry(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Reset the registry to empty — test hook only.
 */
export function _resetUIPackRegistryForTests(): void {
  packs.clear();
  activePackId = null;
  notify();
}
