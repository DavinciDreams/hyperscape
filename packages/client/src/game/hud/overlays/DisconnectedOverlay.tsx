/**
 * Disconnected Overlay — host adapter.
 *
 * Renders the registered `DisconnectedOverlay` widget from the
 * `@hyperforge/hyperscape` meta-plugin (slice 32 of the D6.c
 * widget migration arc). This file is now a thin adapter:
 *   - threads the active theme into the widget's typed color props
 *   - exposes the same `<Disconnected />` surface so the
 *     `./overlays` barrel + the single call site in CoreUI.tsx
 *     stay unchanged
 *
 * Auto-reconnect countdown, manual reconnect, and the cancel
 * affordance all live in the registered widget at
 * `packages/hyperscape-plugin/src/widgets/DisconnectedOverlayWidget.tsx`.
 */

import React from "react";
import { useThemeStore } from "@/ui";
import { DisconnectedOverlay as DisconnectedOverlayWidget } from "@hyperforge/hyperscape";

export function Disconnected(): React.ReactElement {
  const theme = useThemeStore((s) => s.theme);
  return (
    <DisconnectedOverlayWidget
      countdownSeconds={5}
      title="Connection Lost"
      panelBackgroundColor={theme.colors.background.primary}
      textColor={theme.colors.text.primary}
      secondaryTextColor={theme.colors.text.secondary}
      reconnectingDotColor="#f59e0b"
      cancelledDotColor="#ef4444"
      primaryButtonColor={
        theme.colors.accent?.primary ?? theme.colors.border.default
      }
      onReconnect={() => window.location.reload()}
    />
  );
}

export default Disconnected;
