/**
 * NotificationToastListWidget — stack of dismissible notification
 * toasts (success / error / warning / info).
 *
 * Phase D6.c twenty-fifth widget migration. Mirrors the legacy
 * hand-coded `NotificationContainer`. Substrate-promote: drops the
 * `useNotificationStore` subscription. The widget receives the
 * notification array as a typed prop and exposes
 * `onDismiss(id)` + `onAction(id)` callbacks.
 *
 * Adapter wiring (host responsibility):
 *
 *   ```ts
 *   const notifications = useNotificationList();
 *
 *   <NotificationToastList
 *     notifications={notifications.map(n => ({
 *       id: n.id,
 *       type: n.type,
 *       title: n.title,
 *       message: n.message,
 *       dismissible: n.dismissible,
 *       actionLabel: n.action?.label,
 *     }))}
 *     onDismiss={(id) => store.dismiss(id)}
 *     onAction={(id) => notifications.find(n => n.id === id)?.action?.onClick()}
 *   />
 *   ```
 */

import {
  defineWidget,
  type Widget,
  type WidgetRegistration,
} from "@hyperforge/ui-framework";
import React from "react";
import { z } from "zod";

/** Canonical notification severity types. */
export const NOTIFICATION_TYPES = [
  "success",
  "error",
  "warning",
  "info",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** A single toast entry. */
export const notificationToastSchema = z.object({
  /** Stable id used as the React key + dismiss target. */
  id: z.string().min(1),
  /** Severity → drives default colors + icon. */
  type: z.enum(NOTIFICATION_TYPES).default("info"),
  /** Optional title rendered bold above the message. */
  title: z.string().default(""),
  /** Body message. */
  message: z.string().default(""),
  /** When true, renders the dismiss "×" button. */
  dismissible: z.boolean().default(true),
  /** When non-empty, renders an action button below the message. */
  actionLabel: z.string().default(""),
});

export type NotificationToast = z.infer<typeof notificationToastSchema>;

/** Per-type theme entry. */
export const notificationTypeStyleSchema = z.object({
  /** Toast background. */
  background: z.string(),
  /** Border color. */
  border: z.string(),
  /** Leading icon glyph. */
  icon: z.string().min(1),
});

export type NotificationTypeStyle = z.infer<typeof notificationTypeStyleSchema>;

/** Default per-type styles — match the legacy palette. */
export const DEFAULT_NOTIFICATION_TYPE_STYLES: Readonly<
  Record<NotificationType, NotificationTypeStyle>
> = {
  success: {
    background: "rgba(34, 139, 34, 0.95)",
    border: "#2d8a2d",
    icon: "✓",
  },
  error: {
    background: "rgba(180, 30, 30, 0.95)",
    border: "#c44",
    icon: "✕",
  },
  warning: {
    background: "rgba(180, 130, 30, 0.95)",
    border: "#c90",
    icon: "⚠",
  },
  info: {
    background: "rgba(30, 100, 180, 0.95)",
    border: "#369",
    icon: "ℹ",
  },
};

/** Anchor edge (4 corners). */
export const NOTIFICATION_ANCHORS = [
  "top-right",
  "top-left",
  "bottom-right",
  "bottom-left",
] as const;
export type NotificationAnchor = (typeof NOTIFICATION_ANCHORS)[number];

/** Props the widget exposes through its Zod schema. */
export const notificationToastListPropsSchema = z.object({
  /** Active toasts. Empty array renders null. */
  notifications: z.array(notificationToastSchema).default(() => []),
  /** Anchor corner. */
  anchor: z.enum(NOTIFICATION_ANCHORS).default("top-right"),
  /** Distance from the anchor edges (px). */
  edgeOffsetPx: z.number().int().min(0).max(256).default(16),
  /** Z-index. */
  zIndex: z.number().int().default(9_999),
  /** Per-type style overrides (merged over defaults). */
  typeStyles: z
    .record(z.string(), notificationTypeStyleSchema)
    .default(() => ({ ...DEFAULT_NOTIFICATION_TYPE_STYLES })),
  /** Toast text color. */
  textColor: z.string().default("#ffffff"),
  /** Body text alpha-tinted color (legacy: rgba(255,255,255,0.9)). */
  bodyTextColor: z.string().default("rgba(255, 255, 255, 0.9)"),
  /** Action button background. */
  actionBackgroundColor: z.string().default("rgba(255, 255, 255, 0.2)"),
  /** Action button border. */
  actionBorderColor: z.string().default("rgba(255, 255, 255, 0.3)"),
  /** Dismiss button glyph color. */
  dismissColor: z.string().default("rgba(255, 255, 255, 0.7)"),
  /** Min toast width (px). */
  minWidthPx: z.number().int().min(120).max(960).default(280),
  /** Max toast width (px). */
  maxWidthPx: z.number().int().min(120).max(1_280).default(400),
  /** Vertical gap between toasts (px). */
  gapPx: z.number().int().min(0).max(32).default(8),
});

export type NotificationToastListProps = z.infer<
  typeof notificationToastListPropsSchema
>;

/** Extended runtime props — callbacks not modeled in the schema. */
export interface NotificationToastListRuntimeProps extends NotificationToastListProps {
  /** Called when the user clicks the dismiss button on a toast. */
  readonly onDismiss?: (id: string) => void;
  /** Called when the user clicks the action button on a toast. */
  readonly onAction?: (id: string) => void;
}

/**
 * Widget definition — registered against the host's UI registry by
 * the meta-plugin's onEnable.
 */
export const notificationToastListWidget: Widget<NotificationToastListProps> =
  defineWidget({
    manifest: {
      id: "com.hyperforge.hyperscape.notification-toast-list",
      name: "Notification Toast List",
      category: "overlay",
      defaultSize: { width: 36, height: 24 },
    },
    propsSchema: notificationToastListPropsSchema,
    defaultProps: {
      notifications: [],
      anchor: "top-right",
      edgeOffsetPx: 16,
      zIndex: 9_999,
      typeStyles: { ...DEFAULT_NOTIFICATION_TYPE_STYLES },
      textColor: "#ffffff",
      bodyTextColor: "rgba(255, 255, 255, 0.9)",
      actionBackgroundColor: "rgba(255, 255, 255, 0.2)",
      actionBorderColor: "rgba(255, 255, 255, 0.3)",
      dismissColor: "rgba(255, 255, 255, 0.7)",
      minWidthPx: 280,
      maxWidthPx: 400,
      gapPx: 8,
    },
  });

const SLIDE_KEYFRAMES_NAME = "hf-notification-toast-slide-in";
const SLIDE_KEYFRAMES = `
@keyframes ${SLIDE_KEYFRAMES_NAME} {
  from { opacity: 0; transform: translateX(40px); }
  to   { opacity: 1; transform: translateX(0); }
}
`;

/**
 * React component. Returns null when the list is empty. Renders a
 * column-stack of toasts at the chosen corner; each toast respects
 * `dismissible` and `actionLabel` flags.
 */
export function NotificationToastList(
  props: NotificationToastListRuntimeProps,
): React.ReactElement | null {
  const {
    notifications,
    anchor,
    edgeOffsetPx,
    zIndex,
    typeStyles,
    textColor,
    bodyTextColor,
    actionBackgroundColor,
    actionBorderColor,
    dismissColor,
    minWidthPx,
    maxWidthPx,
    gapPx,
    onDismiss,
    onAction,
  } = props;

  if (notifications.length === 0) return null;

  const containerStyle: React.CSSProperties = {
    position: "fixed",
    zIndex,
    display: "flex",
    flexDirection: "column",
    gap: gapPx,
    pointerEvents: "auto",
    fontFamily:
      "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif",
    ...(anchor === "top-right" && {
      top: edgeOffsetPx,
      right: edgeOffsetPx,
      alignItems: "flex-end",
    }),
    ...(anchor === "top-left" && {
      top: edgeOffsetPx,
      left: edgeOffsetPx,
      alignItems: "flex-start",
    }),
    ...(anchor === "bottom-right" && {
      bottom: edgeOffsetPx,
      right: edgeOffsetPx,
      alignItems: "flex-end",
    }),
    ...(anchor === "bottom-left" && {
      bottom: edgeOffsetPx,
      left: edgeOffsetPx,
      alignItems: "flex-start",
    }),
  };

  return (
    <>
      <style>{SLIDE_KEYFRAMES}</style>
      <div role="region" aria-label="Notifications" style={containerStyle}>
        {notifications.map((n) => {
          const style =
            typeStyles[n.type] ??
            DEFAULT_NOTIFICATION_TYPE_STYLES[n.type] ??
            DEFAULT_NOTIFICATION_TYPE_STYLES.info;
          return (
            <div
              key={n.id}
              role="alert"
              aria-live={n.type === "error" ? "assertive" : "polite"}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                padding: "12px 16px",
                backgroundColor: style.background,
                border: `1px solid ${style.border}`,
                borderRadius: 8,
                boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
                minWidth: minWidthPx,
                maxWidth: maxWidthPx,
                color: textColor,
                animation: `${SLIDE_KEYFRAMES_NAME} 200ms ease-out`,
              }}
            >
              <div
                style={{
                  width: 20,
                  height: 20,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 14,
                  color: textColor,
                  flexShrink: 0,
                }}
              >
                {style.icon}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                {n.title && (
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: 14,
                      color: textColor,
                      marginBottom: 4,
                    }}
                  >
                    {n.title}
                  </div>
                )}
                <div
                  style={{
                    fontSize: 13,
                    color: bodyTextColor,
                    lineHeight: 1.4,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {n.message}
                </div>
                {n.actionLabel && (
                  <button
                    type="button"
                    onClick={() => onAction?.(n.id)}
                    style={{
                      marginTop: 8,
                      padding: "6px 12px",
                      backgroundColor: actionBackgroundColor,
                      border: `1px solid ${actionBorderColor}`,
                      borderRadius: 4,
                      color: textColor,
                      fontSize: 12,
                      fontWeight: 500,
                      cursor: "pointer",
                    }}
                  >
                    {n.actionLabel}
                  </button>
                )}
              </div>

              {n.dismissible && (
                <button
                  type="button"
                  onClick={() => onDismiss?.(n.id)}
                  aria-label="Dismiss notification"
                  style={{
                    width: 20,
                    height: 20,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "transparent",
                    border: "none",
                    color: dismissColor,
                    cursor: "pointer",
                    fontSize: 16,
                    padding: 0,
                    flexShrink: 0,
                  }}
                >
                  ×
                </button>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

/**
 * Bundled registration — pairs the widget schema with its React
 * renderer.
 */
export const notificationToastListRegistration: WidgetRegistration<
  NotificationToastListProps,
  React.ComponentType<NotificationToastListProps>
> = {
  widget: notificationToastListWidget,
  Component:
    NotificationToastList as React.ComponentType<NotificationToastListProps>,
};
