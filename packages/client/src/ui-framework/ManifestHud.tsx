/**
 * ManifestHud — the single mount point that the rest of the client
 * drops into the HUD tree to opt into manifest-driven rendering.
 *
 * Responsibilities:
 *   1. Short-circuit to `null` when the feature flag is off.
 *   2. Ensure `bindAllWidgets()` has run (idempotent).
 *   3. Read the live player data via `usePlayerDataContext()` and
 *      project it into a `DataContext`.
 *   4. Delegate to `ManifestRenderer` with `DEFAULT_UI_LAYOUT`.
 *
 * This component is intentionally render-only; it doesn't subscribe
 * to additional stores beyond what `usePlayerDataContext` already
 * provides, so adding it next to the existing HUD has zero extra
 * event-bus traffic.
 */

import { memo, useMemo } from "react";
import { applyLayoutVariant, resolveLayout } from "@hyperforge/ui-framework";
import { usePlayerDataContext } from "@/hooks";
import {
  ClientUIWidgetProvider,
  allBuiltinsBound,
  bindAllWidgets,
} from "./bindings";
import { buildPlayerDataContext } from "./dataContext";
import { DEFAULT_UI_LAYOUT } from "./defaultLayout";
import { ManifestRenderer } from "./ManifestRenderer";
import { isManifestHudEnabled } from "./featureFlag";
import { resolveThemeById } from "./themeRegistry";
import { useActiveUILayout } from "./useActiveUILayout";
import { useUserLayout } from "./useUserLayout";
import { useViewportVariant } from "./useViewportVariant";

function ensureWidgetsBound(): void {
  // `bindComponent` throws on duplicate binds, so we only call
  // `bindAllWidgets()` when at least one builtin is still unbound.
  // This makes the function safe to call from any render path.
  if (!allBuiltinsBound()) {
    bindAllWidgets();
  }
}

export const ManifestHud = memo(function ManifestHud() {
  const enabled = isManifestHudEnabled();

  // Bind synchronously before first render — ManifestRenderer consumes
  // the registry immediately and would throw on an unbound widget if we
  // deferred this to useEffect. `ensureWidgetsBound` is idempotent.
  if (enabled) {
    ensureWidgetsBound();
  }

  const { inventory, equipment, playerStats, coins } = usePlayerDataContext();

  const dataContext = useMemo(
    () =>
      buildPlayerDataContext({
        inventory,
        equipment,
        playerStats,
        coins,
      }),
    [inventory, equipment, playerStats, coins],
  );

  // Fetch the team's active layout when the studio has provided a
  // team/game context. Falls back to the hand-coded `DEFAULT_UI_LAYOUT`
  // while loading, on error, or when no studio context is configured —
  // so the HUD always has *something* to render.
  const { layout: activeLayout } = useActiveUILayout();
  const authoredLayout = activeLayout ?? DEFAULT_UI_LAYOUT;

  // U9: pick the matching author-time variant for this viewport, if
  // any. `applyLayoutVariant` is a no-op when `viewport` is null or
  // the manifest declares no matching variant, so this is zero-cost
  // for desktop-only layouts.
  const viewport = useViewportVariant();
  const baseLayout = useMemo(() => {
    const variantResult = applyLayoutVariant(authoredLayout, viewport);
    return variantResult.manifest;
  }, [authoredLayout, viewport]);

  // Merge any per-user overrides stored in localStorage. `resolveLayout`
  // is pure — it prunes stale ids and never throws — so a bad user
  // layout degrades gracefully to the authored manifest.
  const userLayout = useUserLayout(baseLayout.id);
  const resolvedLayout = useMemo(() => {
    if (!userLayout) return baseLayout;
    const resolved = resolveLayout(baseLayout, userLayout);
    return resolved.hasOverrides
      ? { ...baseLayout, instances: resolved.instances }
      : baseLayout;
  }, [baseLayout, userLayout]);

  // Minimal game-context feed for U8 visibility rules: collapse the
  // live combat flag into `"combat"` vs `"world"`. Richer contexts
  // (`"menu"`, `"cutscene"`, `"loading"`) remain a follow-up and
  // should be sourced from the UI stores that own those states.
  const gameContext: string | null = playerStats?.inCombat ? "combat" : "world";

  if (!enabled) return null;

  return (
    <ClientUIWidgetProvider>
      <ManifestRenderer
        layout={resolvedLayout}
        dataContext={dataContext}
        gameContext={gameContext}
        resolveTheme={resolveThemeById}
      />
    </ClientUIWidgetProvider>
  );
});
