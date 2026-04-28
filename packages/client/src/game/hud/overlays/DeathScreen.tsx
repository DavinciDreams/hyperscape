/**
 * Death Screen — host adapter.
 *
 * Renders the registered `DeathScreen` widget from the
 * `@hyperforge/hyperscape` meta-plugin (slice 33 of the D6.c
 * widget migration arc). This file is now a thin adapter:
 *   - threads the active theme into the widget's typed color props
 *   - forwards the respawn packet send via the `onRespawn` callback
 *   - exposes the same `<DeathScreen data={...} world={...} />`
 *     surface so the `./overlays` barrel + the single call site in
 *     CoreUI.tsx stay unchanged
 *
 * Countdown ticking, respawn-timeout state, and respawn button
 * gating all live in the registered widget at
 * `packages/hyperscape-plugin/src/widgets/DeathScreenWidget.tsx`.
 */

import React from "react";
import { useThemeStore } from "@/ui";
import { DeathScreen as DeathScreenWidget } from "@hyperforge/hyperscape";
import type { ClientWorld } from "@/types";

/** Death screen data — preserved from the legacy file for callers. */
export interface DeathScreenData {
  message: string;
  killedBy: string;
  respawnTime: number;
}

interface DeathScreenProps {
  data: DeathScreenData;
  world: ClientWorld;
}

export function DeathScreen({
  data,
  world,
}: DeathScreenProps): React.ReactElement {
  const theme = useThemeStore((s) => s.theme);

  const handleRespawn = (): void => {
    const network = world.network as {
      send?: (packet: string, data: unknown) => void;
    };
    if (!network?.send) {
      console.error("[DeathScreen] Network.send is unavailable");
      return;
    }
    try {
      network.send("requestRespawn", {
        playerId: world.entities?.player?.id,
      });
    } catch (err) {
      console.error("[DeathScreen] Error sending respawn packet:", err);
    }
  };

  return (
    <DeathScreenWidget
      killedBy={data.killedBy}
      respawnTime={data.respawnTime}
      title="Oh dear, you are dead!"
      bodyText="You have lost your items at the death location."
      respawnTimeoutMs={10_000}
      backdropColor={theme.colors.background.overlay ?? "rgba(0, 0, 0, 0.65)"}
      panelBackgroundColor={theme.colors.background.primary}
      dangerColor={theme.colors.state.danger}
      warningColor={theme.colors.state.warning}
      textColor={theme.colors.text.primary}
      mutedTextColor={theme.colors.text.muted}
      buttonColor={
        theme.colors.state.info ?? theme.colors.accent?.primary ?? "#3b82f6"
      }
      onRespawn={handleRespawn}
    />
  );
}

export default DeathScreen;
