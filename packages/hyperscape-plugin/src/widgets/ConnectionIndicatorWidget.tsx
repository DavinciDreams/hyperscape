/**
 * ConnectionIndicatorWidget — top-of-screen toast that shows
 * network reconnection status. Renders nothing while connected.
 *
 * Phase D6.c first non-overlay HUD migration. Mirrors the existing
 * hand-coded `ConnectionIndicator`. Substrate-promote: the legacy
 * indicator subscribes to 4 `NETWORK_*` events directly from the
 * world; the widget receives the same state through typed props
 * instead, so the host adapter owns the subscription lifecycle.
 *
 * Status state machine (matches the hand-coded version):
 *   - `connected`     → widget returns null, no chrome
 *   - `disconnected`  → "Disconnected" line, neutral chrome
 *   - `reconnecting`  → spinner + progress bar + "Attempt X of Y"
 *   - `failed`        → red chrome + "Please refresh the page" line
 *
 * Adapter wiring (host responsibility):
 *
 *   ```ts
 *   world.on(EventType.NETWORK_RECONNECTING, ({attempt, maxAttempts, delayMs}) =>
 *     setProps({ status: "reconnecting", attempt, maxAttempts, delayMs }));
 *   world.on(EventType.NETWORK_RECONNECTED, () =>
 *     setProps({ status: "connected", attempt: 0, maxAttempts: 10, delayMs: 0 }));
 *   world.on(EventType.NETWORK_DISCONNECTED, () =>
 *     setProps((prev) => prev.status === "reconnecting" ? prev : {...prev, status: "disconnected"}));
 *   world.on(EventType.NETWORK_RECONNECT_FAILED, ({attempts}) =>
 *     setProps({ status: "failed", attempt: attempts, maxAttempts: attempts, delayMs: 0 }));
 *   ```
 */

import {
  defineWidget,
  type Widget,
  type WidgetRegistration,
} from "@hyperforge/ui-framework";
import React from "react";
import { z } from "zod";

/** Status state machine — matches the hand-coded ConnectionIndicator. */
export const CONNECTION_STATUSES = [
  "connected",
  "disconnected",
  "reconnecting",
  "failed",
] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

/** Props the widget exposes through its Zod schema. */
export const connectionIndicatorPropsSchema = z.object({
  /** Current connection state. `connected` hides the widget entirely. */
  status: z.enum(CONNECTION_STATUSES).default("connected"),
  /** Reconnect attempt number (1-based). Only meaningful when reconnecting. */
  attempt: z.number().int().nonnegative().default(0),
  /** Max attempts before the client gives up. */
  maxAttempts: z.number().int().min(1).max(1000).default(10),
  /** Distance from the top edge in pixels (mobile safe-area + offset). */
  topOffsetPx: z.number().int().nonnegative().max(400).default(56),
  /** z-index. Defaults to a high value so the toast floats above HUD. */
  zIndex: z.number().int().default(50),
  /** Background color for non-failed states. */
  panelBackgroundColor: z.string().default("rgba(40, 40, 40, 0.95)"),
  /** Background color for the failed state (red). */
  failedBackgroundColor: z.string().default("rgba(180, 30, 30, 0.95)"),
  /** Border color for non-failed states. */
  borderColor: z.string().default("#555"),
  /** Border color for the failed state. */
  failedBorderColor: z.string().default("#c44"),
  /** Primary text color. */
  textColor: z.string().default("#ffffff"),
  /** Secondary text color (attempt counter). */
  secondaryTextColor: z.string().default("#aaaaaa"),
  /** Failed-state body text color (lighter red). */
  failedTextColor: z.string().default("#ffaaaa"),
  /** Spinner border base color. */
  spinnerColor: z.string().default("#888888"),
  /** Progress-bar fill color. */
  progressColor: z.string().default("#4a9eff"),
  /** Progress-bar track color. */
  progressTrackColor: z.string().default("#333333"),
});

export type ConnectionIndicatorProps = z.infer<
  typeof connectionIndicatorPropsSchema
>;

/**
 * Widget definition — registered against the host's UI registry by
 * the meta-plugin's onEnable.
 */
export const connectionIndicatorWidget: Widget<ConnectionIndicatorProps> =
  defineWidget({
    manifest: {
      id: "com.hyperforge.hyperscape.connection-indicator",
      name: "Connection Indicator",
      category: "hud",
      defaultSize: { width: 32, height: 6 },
    },
    propsSchema: connectionIndicatorPropsSchema,
    defaultProps: {
      status: "connected",
      attempt: 0,
      maxAttempts: 10,
      topOffsetPx: 56,
      zIndex: 50,
      panelBackgroundColor: "rgba(40, 40, 40, 0.95)",
      failedBackgroundColor: "rgba(180, 30, 30, 0.95)",
      borderColor: "#555",
      failedBorderColor: "#c44",
      textColor: "#ffffff",
      secondaryTextColor: "#aaaaaa",
      failedTextColor: "#ffaaaa",
      spinnerColor: "#888888",
      progressColor: "#4a9eff",
      progressTrackColor: "#333333",
    },
  });

/** Status-line text matches the hand-coded ConnectionIndicator. */
function statusLine(status: ConnectionStatus): string {
  switch (status) {
    case "reconnecting":
      return "Reconnecting...";
    case "disconnected":
      return "Disconnected";
    case "failed":
      return "Connection Lost";
    case "connected":
      return ""; // unused — widget returns null in this branch
  }
}

/**
 * React component. Returns null when `status === "connected"`.
 * Otherwise renders a centered top-screen toast with status icon,
 * status line, and an optional progress bar (reconnecting only) or
 * recovery instruction (failed only).
 */
export function ConnectionIndicator(
  props: ConnectionIndicatorProps,
): React.ReactElement | null {
  const {
    status,
    attempt,
    maxAttempts,
    topOffsetPx,
    zIndex,
    panelBackgroundColor,
    failedBackgroundColor,
    borderColor,
    failedBorderColor,
    textColor,
    secondaryTextColor,
    failedTextColor,
    spinnerColor,
    progressColor,
    progressTrackColor,
  } = props;

  if (status === "connected") return null;

  const isFailed = status === "failed";
  const progressPct =
    status === "reconnecting"
      ? Math.min(100, Math.max(0, (attempt / maxAttempts) * 100))
      : isFailed
        ? 100
        : 0;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        top: topOffsetPx,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        padding: "12px 20px",
        backgroundColor: isFailed
          ? failedBackgroundColor
          : panelBackgroundColor,
        borderRadius: 8,
        border: `1px solid ${isFailed ? failedBorderColor : borderColor}`,
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.5)",
        minWidth: 200,
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {status === "reconnecting" && (
          <div
            style={{
              width: 16,
              height: 16,
              border: `2px solid ${spinnerColor}`,
              borderTopColor: textColor,
              borderRadius: "50%",
              animation: "hyperscape-connection-spin 1s linear infinite",
            }}
          />
        )}
        {isFailed && (
          <div
            style={{
              width: 16,
              height: 16,
              color: textColor,
              fontSize: 16,
              lineHeight: "16px",
              textAlign: "center",
            }}
          >
            ✕
          </div>
        )}
        <span style={{ color: textColor, fontSize: 14, fontWeight: 500 }}>
          {statusLine(status)}
        </span>
      </div>

      {status === "reconnecting" && (
        <>
          <div
            style={{
              width: "100%",
              height: 4,
              backgroundColor: progressTrackColor,
              borderRadius: 2,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${progressPct}%`,
                height: "100%",
                backgroundColor: progressColor,
                transition: "width 0.3s ease",
              }}
            />
          </div>
          <span style={{ color: secondaryTextColor, fontSize: 12 }}>
            Attempt {attempt} of {maxAttempts}
          </span>
        </>
      )}

      {isFailed && (
        <span
          style={{
            color: failedTextColor,
            fontSize: 12,
            textAlign: "center",
          }}
        >
          Please refresh the page to reconnect.
        </span>
      )}

      <style>
        {`@keyframes hyperscape-connection-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}
      </style>
    </div>
  );
}

/**
 * Bundled registration — pairs the widget schema with its React
 * renderer. The plugin's `onEnable` passes this to
 * `ctx.widgets.register(...)`.
 */
export const connectionIndicatorRegistration: WidgetRegistration<
  ConnectionIndicatorProps,
  React.ComponentType<ConnectionIndicatorProps>
> = {
  widget: connectionIndicatorWidget,
  Component:
    ConnectionIndicator as React.ComponentType<ConnectionIndicatorProps>,
};
