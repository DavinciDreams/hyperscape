/**
 * PIEHudOverlay — manifest-driven HUD overlay for the World Studio
 * PIE viewport.
 *
 * Closes the visible loop for criterion #4 ("a new game can be built
 * in World Studio by loading plugins"): the asset-forge editor now
 * actually renders plugin-contributed widgets while PIE is active.
 *
 * Lifecycle (owned by `usePIESession`):
 *   - When PIE starts, the hook creates a session-scoped
 *     `WidgetRegistry<UIWidgetComponent>` via `createUIWidgetRegistry()`
 *     + `bindAllWidgets()`. The registry is then passed both to
 *     `createPIEPluginHooks(gameId, registry)` (so plugin
 *     contributions land in it) AND to this component (so the
 *     overlay reads from the same registry instance).
 *   - When PIE stops, the plugin scope disposers unregister every
 *     contributed widget; the hook drops its reference to the
 *     registry.
 *
 * Layout selection: per-game minimal layouts defined inline below.
 * The hyperscape branch is intentionally empty for now — the full
 * HUD needs a `DataContext` populated from live player state that
 * the editor doesn't yet plumb. The shooter-demo branch mounts the
 * single crosshair instance, which renders without any data context
 * (purely prop-driven).
 *
 * `overlayPosition="absolute"` keeps the renderer scoped to the
 * viewport container — covering the editor's toolbars + dock would
 * be wrong.
 */

import {
  type UILayoutManifest,
  UILayoutManifestSchema,
} from "@hyperforge/ui-framework";
import {
  ManifestRenderer,
  type UIWidgetComponent,
} from "@hyperforge/ui-widgets";
import type { WidgetRegistry } from "@hyperforge/ui-framework";
import { useMemo } from "react";

import type { GamePluginSetId } from "../toolbar/gamePluginResolver";
import { useAgentPack } from "../state/agentPack";

const SHOOTER_DEMO_PIE_LAYOUT: UILayoutManifest = UILayoutManifestSchema.parse({
  id: "shooter-demo.pie",
  name: "Shooter Demo PIE HUD",
  description:
    "Minimal in-PIE HUD for the shooter-demo plugin. Just the crosshair contributed via ctx.widgets.register(crosshairRegistration).",
  instances: [
    {
      instanceId: "crosshair-center",
      widgetId: "com.hyperforge.shooter-demo.crosshair",
      position: {
        kind: "anchored",
        anchor: "center",
        offset: { x: 0, y: 0 },
      },
      props: {
        size: 32,
        color: "#7ef7b3",
        thickness: 2,
      },
      label: "Crosshair",
    },
  ],
});

const EMPTY_PIE_LAYOUT: UILayoutManifest = UILayoutManifestSchema.parse({
  id: "pie.empty",
  name: "Empty PIE HUD",
  description: "Placeholder layout used when no game-specific layout exists.",
  instances: [],
});

function pickLayoutForGame(gameId: GamePluginSetId): UILayoutManifest {
  switch (gameId) {
    case "shooter-demo":
      return SHOOTER_DEMO_PIE_LAYOUT;
    case "hyperscape":
    default:
      // Hyperscape's full HUD needs a DataContext (HP, inventory, etc.)
      // populated from live player state — out of scope for the PIE
      // overlay's first cut. Render an empty layout so the overlay
      // doesn't blow up on missing data bindings.
      return EMPTY_PIE_LAYOUT;
  }
}

export interface PIEHudOverlayProps {
  /**
   * Session-scoped widget registry the `usePIESession` hook owns.
   * Populated with builtins via `bindAllWidgets()` and any plugin
   * contributions made during PIE start. Null when PIE is not
   * running — the overlay returns null in that case.
   */
  registry: WidgetRegistry<UIWidgetComponent> | null;
  /**
   * Active game plugin set id, picked by `resolveGamePluginSetId()`
   * at PIE start. Determines which layout to render.
   */
  gameId: GamePluginSetId;
}

export function PIEHudOverlay({ registry, gameId }: PIEHudOverlayProps) {
  const agentPack = useAgentPack();
  // Agent-emitted pack wins over the static per-game layout when set.
  // Designers using the AI tab in the right sidebar see their
  // chat-designed HUD render live in PIE.
  const layout = useMemo(
    () => agentPack?.defaultLayout ?? pickLayoutForGame(gameId),
    [agentPack, gameId],
  );

  // Debug: surface what PIE is about to render so the chat-to-HUD
  // loop is observable in the console while the demo flow is new.
  if (typeof window !== "undefined") {
    const unresolved = layout.instances.filter(
      (inst) => !registry?.hasComponent(inst.widgetId),
    );
    // eslint-disable-next-line no-console
    console.info("[PIEHud] mount", {
      source: agentPack ? "agent" : "static",
      instances: layout.instances.length,
      registry: registry ? "ready" : "null",
      unresolvedWidgetIds: unresolved.map((i) => i.widgetId),
    });
  }

  if (!registry) return null;
  if (layout.instances.length === 0) return null;

  return (
    <ManifestRenderer
      registry={registry}
      layout={layout}
      // PIE doesn't yet plumb live player state into the overlay —
      // the only widget rendered today (crosshair) is purely prop-
      // driven, so an empty data context is fine.
      dataContext={{}}
      overlayPosition="absolute"
    />
  );
}
