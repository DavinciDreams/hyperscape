/**
 * DisconnectedOverlayWidget — full-screen overlay shown when the
 * client loses connection to the server. Auto-reconnect with a
 * countdown + manual reconnect button.
 *
 * Phase D6.c.2 (overlay HUDs) second cut. Mirrors the existing
 * hand-coded DisconnectedOverlay. Replaces the client-only
 * `useThemeStore` + `getInteractiveTileStyle` dependencies with
 * explicit color/style props so the widget works in any host.
 *
 * Reload behavior: the legacy overlay calls
 * `window.location.reload()` directly. This widget exposes an
 * `onReconnect` callback prop so the host wires the actual reload
 * (or in-app reconnect) without the widget owning the side effect.
 * If the host omits the callback, the widget falls back to
 * `window.location.reload()` for parity with the legacy.
 *
 * Internal state: countdown integer + `cancelled` flag. Resets
 * whenever `countdownSeconds` changes via prop (so the host can
 * reset by re-mounting with a new initial value).
 */

import {
  defineWidget,
  type Widget,
  type WidgetRegistration,
} from "@hyperforge/ui-framework";
import React, { useEffect, useState } from "react";
import { z } from "zod";

/** Props the widget exposes through its Zod schema. */
export const disconnectedOverlayPropsSchema = z.object({
  /** Initial countdown to auto-reload, in seconds. */
  countdownSeconds: z.number().int().min(0).max(120).default(5),
  /** Title shown above the countdown. */
  title: z.string().default("Connection Lost"),
  /** Background card color (semi-transparent panel). */
  panelBackgroundColor: z.string().default("rgba(15, 17, 25, 0.85)"),
  /** Primary text color (title + buttons). */
  textColor: z.string().default("#e6e8ec"),
  /** Secondary text color (countdown line). */
  secondaryTextColor: z.string().default("#a8aec0"),
  /** Status-dot color while auto-reconnecting (amber). */
  reconnectingDotColor: z.string().default("#f59e0b"),
  /** Status-dot color when auto-reconnect is cancelled (red). */
  cancelledDotColor: z.string().default("#ef4444"),
  /** Primary button background (Reconnect Now). */
  primaryButtonColor: z.string().default("#3b82f6"),
});

export type DisconnectedOverlayProps = z.infer<
  typeof disconnectedOverlayPropsSchema
>;

/**
 * Extended runtime props — `onReconnect` is a callback, can't go
 * through the Zod schema. The widget reads this from React props
 * directly; layouts that don't bind it fall back to
 * `window.location.reload()`.
 */
export interface DisconnectedOverlayRuntimeProps extends DisconnectedOverlayProps {
  readonly onReconnect?: () => void;
}

/**
 * Widget definition — registered against the host's UI registry by
 * the meta-plugin's onEnable.
 */
export const disconnectedOverlayWidget: Widget<DisconnectedOverlayProps> =
  defineWidget({
    manifest: {
      id: "com.hyperforge.hyperscape.disconnected-overlay",
      name: "Disconnected Overlay",
      category: "overlay",
      defaultSize: { width: 96, height: 24 },
    },
    propsSchema: disconnectedOverlayPropsSchema,
    defaultProps: {
      countdownSeconds: 5,
      title: "Connection Lost",
      panelBackgroundColor: "rgba(15, 17, 25, 0.85)",
      textColor: "#e6e8ec",
      secondaryTextColor: "#a8aec0",
      reconnectingDotColor: "#f59e0b",
      cancelledDotColor: "#ef4444",
      primaryButtonColor: "#3b82f6",
    },
  });

/**
 * React component. Renders a centered card with auto-reconnect
 * countdown. The host turns the widget on/off via the layout's
 * visibility rules (e.g. bind to a `$session.disconnected` flag).
 */
export function DisconnectedOverlay(
  props: DisconnectedOverlayRuntimeProps,
): React.ReactElement {
  const {
    countdownSeconds,
    title,
    panelBackgroundColor,
    textColor,
    secondaryTextColor,
    reconnectingDotColor,
    cancelledDotColor,
    primaryButtonColor,
    onReconnect,
  } = props;

  const [countdown, setCountdown] = useState(countdownSeconds);
  const [isAutoReconnecting, setIsAutoReconnecting] = useState(true);

  const reload = (): void => {
    if (onReconnect) {
      onReconnect();
    } else if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  // Auto-reconnect countdown.
  useEffect(() => {
    if (!isAutoReconnecting || countdown <= 0) return;
    const timer = setTimeout(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          reload();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearTimeout(timer);
    // `reload` is stable across renders by reference; we deliberately
    // only depend on the countdown + cancellation state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAutoReconnecting, countdown]);

  return (
    <div
      role="alert"
      aria-live="assertive"
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "auto",
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif",
      }}
    >
      <div
        style={{
          backgroundColor: panelBackgroundColor,
          color: textColor,
          padding: "16px 20px",
          borderRadius: 16,
          minWidth: 240,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
          backdropFilter: "blur(8px)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              backgroundColor: isAutoReconnecting
                ? reconnectingDotColor
                : cancelledDotColor,
              animation: isAutoReconnecting
                ? "hyperscape-disconnect-pulse 1.5s ease-in-out infinite"
                : "none",
            }}
          />
          <span style={{ fontWeight: 500 }}>{title}</span>
        </div>

        <style>{`@keyframes hyperscape-disconnect-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>

        {isAutoReconnecting ? (
          <>
            <div style={{ fontSize: 13, color: secondaryTextColor }}>
              Reconnecting in {countdown}s...
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={reload}
                style={{
                  padding: "6px 12px",
                  borderRadius: 8,
                  backgroundColor: primaryButtonColor,
                  color: textColor,
                  border: "none",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 500,
                }}
              >
                Reconnect Now
              </button>
              <button
                onClick={() => setIsAutoReconnecting(false)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 8,
                  backgroundColor: "transparent",
                  color: secondaryTextColor,
                  border: `1px solid ${secondaryTextColor}`,
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 13, color: secondaryTextColor }}>
              Auto-reconnect cancelled
            </div>
            <button
              onClick={reload}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                backgroundColor: primaryButtonColor,
                color: textColor,
                border: "none",
                cursor: "pointer",
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              Reconnect
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Bundled registration — pairs the widget schema with its React
 * renderer. The plugin's `onEnable` passes this to
 * `ctx.widgets.register(...)`.
 */
export const disconnectedOverlayRegistration: WidgetRegistration<
  DisconnectedOverlayProps,
  React.ComponentType<DisconnectedOverlayProps>
> = {
  widget: disconnectedOverlayWidget,
  Component:
    DisconnectedOverlay as React.ComponentType<DisconnectedOverlayProps>,
};
