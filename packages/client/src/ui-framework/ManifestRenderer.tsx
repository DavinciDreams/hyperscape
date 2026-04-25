/**
 * ManifestRenderer — client-side wrapper around the shared
 * `@hyperforge/ui-widgets` ManifestRenderer.
 *
 * The actual render logic moved to ui-widgets so multiple consumers
 * (live game HUD, World Studio UI Layout Editor preview, PIE viewport
 * overlay) can share it. This wrapper exists to wire the client's
 * two production singletons:
 *
 *   1. `uiRegistry` — the bound, populated widget registry.
 *   2. `MovableWidgetShell` — the drag-to-edit shell that recognizes
 *      the client's edit-mode store.
 *
 * Callers in the client tree get the same `<ManifestRenderer ... />`
 * surface they had before; only the `registry` + `widgetShell` props
 * are pre-bound here. New non-client consumers (asset-forge, tests)
 * import directly from `@hyperforge/ui-widgets` and pass their own.
 */

import {
  ManifestRenderer as SharedManifestRenderer,
  type ManifestRendererProps as SharedManifestRendererProps,
  type ManifestWidgetShellProps,
} from "@hyperforge/ui-widgets";
import { memo } from "react";

import { uiRegistry } from "./bindings";
import { MovableWidgetShell } from "./MovableWidgetShell";

// Same props as the shared renderer, minus the two we wire in.
export type ManifestRendererProps = Omit<
  SharedManifestRendererProps,
  "registry" | "widgetShell"
>;

// Adapter: shared shell signature → client's MovableWidgetShell. The
// shapes match by-name so this is a straight pass-through; the
// adapter exists only to absorb React's identity equality so memoized
// consumers don't see a fresh component on every render.
function ClientMovableShell(props: ManifestWidgetShellProps) {
  return <MovableWidgetShell {...props} />;
}

export const ManifestRenderer = memo(function ManifestRenderer(
  props: ManifestRendererProps,
) {
  return (
    <SharedManifestRenderer
      {...props}
      registry={uiRegistry}
      widgetShell={ClientMovableShell}
    />
  );
});
