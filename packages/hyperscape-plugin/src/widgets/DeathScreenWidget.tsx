/**
 * DeathScreenWidget — full-screen overlay shown when the player
 * dies in-game. Displays the killer name, an item-despawn countdown,
 * and a respawn button.
 *
 * Phase D6.c.2 (overlay HUDs) third cut. Closes the overlay set
 * after KickedOverlayWidget (slice 31) + DisconnectedOverlayWidget
 * (slice 32).
 *
 * Substrate-promote design choices to keep the widget portable:
 *   - Theme tokens (~7 colors) become explicit Zod-validated props.
 *   - Network access (`world.network.send("requestRespawn", …)`)
 *     becomes an `onRespawn` callback. Hosts wire the actual packet
 *     send. The widget only owns the UI state (button-disabled,
 *     timeout-warning, countdown).
 *   - `data.respawnTime` (the absolute despawn-deadline ms) and
 *     `killedBy` come through props — typically bound from the
 *     death-event payload via the host's data context.
 *   - Despawn-countdown timer is internal; resets when
 *     `respawnTime` changes via prop.
 *   - 10s respawn-request timeout is internal; resets on each
 *     respawn attempt.
 */

import {
  defineWidget,
  type Widget,
  type WidgetRegistration,
} from "@hyperforge/ui-framework";
import React, { useEffect, useState } from "react";
import { z } from "zod";

/** Props the widget exposes through its Zod schema. */
export const deathScreenPropsSchema = z.object({
  /** Killer name. Bound from the death event payload. */
  killedBy: z.string().default("Unknown"),
  /**
   * Absolute Unix-ms timestamp at which dropped items despawn.
   * Bound from the death event. The widget renders the remaining
   * time as `mm:ss` and switches to "items despawned" at 0.
   */
  respawnTime: z.number().int().nonnegative().default(0),
  /** Title — defaults to the legacy "Oh dear, you are dead!" line. */
  title: z.string().default("Oh dear, you are dead!"),
  /** Body line 1 (item-loss explanation). */
  bodyText: z
    .string()
    .default("You have lost your items at the death location."),
  /** Respawn-request timeout in ms (re-enables button if server doesn't respond). */
  respawnTimeoutMs: z.number().int().min(1_000).max(60_000).default(10_000),
  /** Backdrop color (semi-transparent). */
  backdropColor: z.string().default("rgba(0, 0, 0, 0.65)"),
  /** Card background. */
  panelBackgroundColor: z.string().default("rgba(15, 17, 25, 0.92)"),
  /** Card border (also danger-text color). */
  dangerColor: z.string().default("#ef4444"),
  /** Warning color (countdown threshold + timeout warning). */
  warningColor: z.string().default("#f59e0b"),
  /** Primary text color. */
  textColor: z.string().default("#e6e8ec"),
  /** Muted text color (item-loss line, countdown label). */
  mutedTextColor: z.string().default("#a8aec0"),
  /** Respawn button background color. */
  buttonColor: z.string().default("#3b82f6"),
});

export type DeathScreenProps = z.infer<typeof deathScreenPropsSchema>;

/**
 * Extended runtime props — `onRespawn` is a callback (not Zod-able).
 * Hosts wire the actual `world.network.send("requestRespawn", …)`
 * here. If omitted, the button click is a no-op and the timeout
 * fires after `respawnTimeoutMs` to re-enable the button.
 */
export interface DeathScreenRuntimeProps extends DeathScreenProps {
  readonly onRespawn?: () => void;
}

/**
 * Widget definition — registered against the host's UI registry by
 * the meta-plugin's onEnable.
 */
export const deathScreenWidget: Widget<DeathScreenProps> = defineWidget({
  manifest: {
    id: "com.hyperforge.hyperscape.death-screen",
    name: "Death Screen",
    category: "overlay",
    defaultSize: { width: 96, height: 24 },
  },
  propsSchema: deathScreenPropsSchema,
  defaultProps: {
    killedBy: "Unknown",
    respawnTime: 0,
    title: "Oh dear, you are dead!",
    bodyText: "You have lost your items at the death location.",
    respawnTimeoutMs: 10_000,
    backdropColor: "rgba(0, 0, 0, 0.65)",
    panelBackgroundColor: "rgba(15, 17, 25, 0.92)",
    dangerColor: "#ef4444",
    warningColor: "#f59e0b",
    textColor: "#e6e8ec",
    mutedTextColor: "#a8aec0",
    buttonColor: "#3b82f6",
  },
});

function formatCountdown(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * React component. Renders a centered danger-bordered card with
 * the kill info, item-despawn countdown, and respawn button.
 *
 * Visibility is host-controlled — the widget is always rendered
 * when mounted; layouts gate it via `visible` rules bound to
 * `$player.dead` or similar.
 */
export function DeathScreen(
  props: DeathScreenRuntimeProps,
): React.ReactElement {
  const {
    killedBy,
    respawnTime,
    title,
    bodyText,
    respawnTimeoutMs,
    backdropColor,
    panelBackgroundColor,
    dangerColor,
    warningColor,
    textColor,
    mutedTextColor,
    buttonColor,
    onRespawn,
  } = props;

  const [isRespawning, setIsRespawning] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [countdown, setCountdown] = useState<number>(() =>
    Math.max(0, Math.floor((respawnTime - Date.now()) / 1000)),
  );

  // Respawn-request timeout — re-enable button if server doesn't ack.
  useEffect(() => {
    if (!isRespawning) return;
    const timeoutId = setTimeout(() => {
      setIsRespawning(false);
      setTimedOut(true);
    }, respawnTimeoutMs);
    return () => clearTimeout(timeoutId);
  }, [isRespawning, respawnTimeoutMs]);

  // Despawn countdown — reset whenever the absolute deadline changes.
  useEffect(() => {
    setCountdown(Math.max(0, Math.floor((respawnTime - Date.now()) / 1000)));
    const intervalId = setInterval(() => {
      setCountdown(Math.max(0, Math.floor((respawnTime - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(intervalId);
  }, [respawnTime]);

  const handleRespawn = (): void => {
    if (isRespawning) return;
    setTimedOut(false);
    setIsRespawning(true);
    try {
      onRespawn?.();
    } catch {
      setIsRespawning(false);
    }
  };

  return (
    <div
      role="alertdialog"
      aria-live="assertive"
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: backdropColor,
        pointerEvents: "auto",
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif",
      }}
    >
      <div
        style={{
          backgroundColor: panelBackgroundColor,
          color: textColor,
          padding: 32,
          borderRadius: 16,
          maxWidth: 480,
          border: `2px solid ${dangerColor}`,
          backdropFilter: "blur(8px)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 24,
        }}
      >
        <div
          style={{
            fontSize: 32,
            fontWeight: 700,
            color: dangerColor,
          }}
        >
          {title}
        </div>

        <div style={{ textAlign: "center", lineHeight: 1.5 }}>
          <p style={{ fontSize: 16, margin: 0 }}>
            Killed by:{" "}
            <span style={{ color: dangerColor, fontWeight: 600 }}>
              {killedBy}
            </span>
          </p>
          <p
            style={{
              fontSize: 14,
              opacity: 0.9,
              margin: "8px 0 0 0",
            }}
          >
            {bodyText}
          </p>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
            marginTop: 8,
          }}
        >
          <button
            onClick={handleRespawn}
            disabled={isRespawning}
            style={{
              padding: "12px 32px",
              fontSize: 16,
              fontWeight: 700,
              borderRadius: 8,
              border: `2px solid ${buttonColor}`,
              backgroundColor: isRespawning ? "transparent" : buttonColor,
              color: textColor,
              cursor: isRespawning ? "not-allowed" : "pointer",
              opacity: isRespawning ? 0.6 : 1,
              transition: "opacity 150ms ease, background-color 150ms ease",
            }}
          >
            {isRespawning ? "Respawning..." : "Click here to respawn"}
          </button>

          {timedOut && (
            <div
              style={{
                fontSize: 13,
                color: warningColor,
                textAlign: "center",
                maxWidth: 320,
              }}
            >
              Respawn request timed out. Please try again.
            </div>
          )}

          <div
            style={{
              fontSize: 13,
              textAlign: "center",
              maxWidth: 320,
              lineHeight: 1.6,
            }}
          >
            {countdown > 0 ? (
              <>
                <span style={{ color: mutedTextColor }}>
                  Your items have been dropped at your death location.
                </span>
                <br />
                <span
                  style={{
                    fontWeight: 700,
                    color: countdown <= 60 ? dangerColor : warningColor,
                  }}
                >
                  Time remaining: {formatCountdown(countdown)}
                </span>
              </>
            ) : (
              <span style={{ color: dangerColor }}>
                Your items have despawned!
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Bundled registration — pairs the widget schema with its React
 * renderer. The plugin's `onEnable` passes this to
 * `ctx.widgets.register(...)`.
 */
export const deathScreenRegistration: WidgetRegistration<
  DeathScreenProps,
  React.ComponentType<DeathScreenProps>
> = {
  widget: deathScreenWidget,
  Component: DeathScreen as React.ComponentType<DeathScreenProps>,
};
