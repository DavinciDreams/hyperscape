/**
 * `useRegistryReload` — subscribe a React component to a manifest
 * registry's `onReloaded` notification.
 *
 * Returns a counter that increments every time the registry fires
 * `onReloaded` (after a successful `load()` / `loadFromJson()`).
 * Use the returned value as a dependency in `useMemo`/`useCallback`
 * to force re-derivation when manifests hot-reload in PIE / editor
 * sessions.
 *
 * The pattern this replaces:
 *
 * ```tsx
 * const [revision, setRevision] = useState(0);
 * useEffect(() => {
 *   return registry.onReloaded(() => setRevision((r) => r + 1));
 * }, []);
 * ```
 *
 * becomes:
 *
 * ```tsx
 * const revision = useRegistryReload(registry);
 * ```
 *
 * Backed by `useSyncExternalStore` for React 18 concurrent-mode
 * safety. Compatible with any registry that exposes the standard
 * shared-package contract:
 *
 * ```ts
 * interface ReloadableRegistry {
 *   onReloaded(cb: () => void): () => void;
 * }
 * ```
 *
 * Examples:
 *
 * ```tsx
 * import { useRegistryReload } from "@hyperforge/ui-widgets";
 * import { xpCurveRegistry, skillIconsRegistry } from "@hyperforge/shared";
 *
 * function XPOrb() {
 *   const rev = useRegistryReload(xpCurveRegistry, skillIconsRegistry);
 *   const xpToNext = useMemo(() => xpCurveRegistry.xpForLevel(99), [rev]);
 *   // ...
 * }
 * ```
 */

import { useCallback, useSyncExternalStore } from "react";

/** Minimal contract a registry must satisfy to be subscribed. */
export interface ReloadableRegistry {
  onReloaded(cb: () => void): () => void;
}

// Module-level revision counter. Every `onReloaded` notification —
// from any registry, observed by any subscribed component — bumps
// this counter. Consumers re-render and recompute `useMemo` slots
// keyed on the returned revision.
//
// Bumping a single global counter (rather than a per-registry one)
// is intentional: PIE manifest hot-reloads are rare + user-driven,
// not per-frame; and React's `useSyncExternalStore` requires
// `getSnapshot()` to return a stable value between notifications,
// which is easiest with a single counter.
let revision = 0;

function snapshotRevision(): number {
  return revision;
}

// SSR snapshot — registries don't reload during SSR, so always 0.
function snapshotRevisionSSR(): number {
  return 0;
}

/**
 * Subscribe to one or more registries' `onReloaded` notifications.
 * Returns a counter that increments after every fired notification
 * from any of the passed registries.
 *
 * The registry list is captured at subscribe-time; consumers should
 * pass module-level singletons. If the caller swaps in a different
 * registry reference between renders, the hook re-subscribes.
 */
export function useRegistryReload(
  ...registries: readonly ReloadableRegistry[]
): number {
  const subscribe = useCallback(
    (notify: () => void) => {
      const bumpAndNotify = () => {
        revision = (revision + 1) | 0;
        notify();
      };
      const offs = registries.map((r) => r.onReloaded(bumpAndNotify));
      return () => {
        for (const off of offs) off();
      };
    },
    // Re-subscribe when the registry identities change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    registries,
  );

  return useSyncExternalStore(subscribe, snapshotRevision, snapshotRevisionSSR);
}

// Test-only access to the module counter. Not part of the public API.
export const __test = {
  getRevision: () => revision,
  resetForTests: () => {
    revision = 0;
  },
};
