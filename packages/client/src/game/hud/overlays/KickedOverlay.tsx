/**
 * Kicked Overlay — host adapter.
 *
 * Renders the registered `KickedOverlay` widget from the
 * `@hyperforge/hyperscape` meta-plugin (slice 31 of the D6.c
 * widget migration arc). This file is now a thin adapter:
 *   - threads the active theme into the widget's typed color props
 *   - exposes the same `<KickedOverlay code={...}>` surface so the
 *     `./overlays` barrel + the single call site in CoreUI.tsx
 *     stay unchanged
 *
 * The actual rendering — message lookup, layout, ARIA — lives in
 * `packages/hyperscape-plugin/src/widgets/KickedOverlayWidget.tsx`.
 */

import React from "react";
import { useThemeStore } from "@/ui";
import { KickedOverlay as KickedOverlayWidget } from "@hyperforge/hyperscape";

interface KickedOverlayProps {
  /** Kick reason code — looked up by the widget's `messages` map. */
  code: string;
}

export function KickedOverlay({
  code,
}: KickedOverlayProps): React.ReactElement {
  const theme = useThemeStore((s) => s.theme);
  return (
    <KickedOverlayWidget
      code={code}
      messages={{
        duplicate_user: "Player already active on another device or window.",
        player_limit: "Player limit reached.",
        unknown: "You were kicked.",
      }}
      backgroundColor={theme.colors.background.primary}
      textColor={theme.colors.text.primary}
      fontSize={18}
    />
  );
}

export default KickedOverlay;
