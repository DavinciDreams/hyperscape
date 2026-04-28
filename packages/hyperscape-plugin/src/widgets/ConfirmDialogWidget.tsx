/**
 * ConfirmDialogWidget — generic yes/no confirmation modal.
 *
 * Phase D6.c fifteenth widget migration. Mirrors the legacy hand-coded
 * `ConfirmModal` (used inside the Bank panel for destructive actions
 * like "Delete tab"). Substrate-promote: the legacy component
 * subscribes to a theme store and embeds a `ModalWindow` primitive
 * from `@/ui`. The widget receives all theme tokens as explicit
 * color props and inlines its own modal frame so it has zero
 * client-side UI-framework dependencies.
 *
 * `variant` toggles the confirm-button color treatment:
 *   - `"danger"` (default): red confirm button — for destructive ops.
 *   - `"primary"`: accent-colored confirm — for non-destructive
 *     "are you sure?" prompts.
 *
 * Adapter wiring (host responsibility):
 *
 *   ```ts
 *   <ConfirmDialog
 *     visible={confirmOpen}
 *     title="Delete tab?"
 *     message="This cannot be undone."
 *     confirmLabel="Delete"
 *     onConfirm={() => { deleteTab(tabId); setConfirmOpen(false); }}
 *     onCancel={() => setConfirmOpen(false)}
 *   />
 *   ```
 */

import {
  defineWidget,
  type Widget,
  type WidgetRegistration,
} from "@hyperforge/ui-framework";
import React, { useState } from "react";
import { z } from "zod";

/** Canonical button-color variants. */
export const CONFIRM_DIALOG_VARIANTS = ["danger", "primary"] as const;

export type ConfirmDialogVariant = (typeof CONFIRM_DIALOG_VARIANTS)[number];

/** Props the widget exposes through its Zod schema. */
export const confirmDialogPropsSchema = z.object({
  /** Whether the modal is visible. Renders null when false. */
  visible: z.boolean().default(false),
  /** Modal title. */
  title: z.string().default("Are you sure?"),
  /** Body message rendered between title and buttons. */
  message: z.string().default(""),
  /** Confirm button label. */
  confirmLabel: z.string().default("Confirm"),
  /** Cancel button label. */
  cancelLabel: z.string().default("Cancel"),
  /**
   * Confirm-button color treatment. `"danger"` paints red; `"primary"`
   * paints accent.
   */
  variant: z.enum(CONFIRM_DIALOG_VARIANTS).default("danger"),
  /** Modal width in pixels. */
  widthPx: z.number().int().min(200).max(960).default(320),
  /** Backdrop color (semi-transparent). */
  backdropColor: z.string().default("rgba(0, 0, 0, 0.5)"),
  /** Panel background. */
  panelBackgroundColor: z.string().default("rgba(15, 17, 25, 0.95)"),
  /** Panel border. */
  panelBorderColor: z.string().default("#3a3f4d"),
  /** Header background. */
  headerBackgroundColor: z.string().default("#1a1f2e"),
  /** Title text color. */
  titleColor: z.string().default("#e6e8ec"),
  /** Body message text color. */
  messageColor: z.string().default("#a8aec0"),
  /** Button label color. */
  buttonTextColor: z.string().default("#e6e8ec"),
  /** Cancel button background (idle). */
  cancelButtonBackground: z.string().default("rgba(40, 45, 60, 0.85)"),
  /** Cancel button background (hover). */
  cancelButtonHoverBackground: z.string().default("rgba(60, 66, 80, 0.95)"),
  /** Cancel button border. */
  cancelButtonBorderColor: z.string().default("#3a3f4d"),
  /** Confirm button color when `variant === "danger"`. */
  dangerColor: z.string().default("#e84545"),
  /** Confirm button color when `variant === "primary"`. */
  accentColor: z.string().default("#ffd84d"),
});

export type ConfirmDialogProps = z.infer<typeof confirmDialogPropsSchema>;

/** Extended runtime props — callbacks not modeled in the schema. */
export interface ConfirmDialogRuntimeProps extends ConfirmDialogProps {
  /** Called when the user clicks the confirm button. */
  readonly onConfirm?: () => void;
  /** Called when the user clicks Cancel or the backdrop. */
  readonly onCancel?: () => void;
}

/**
 * Widget definition — registered against the host's UI registry by
 * the meta-plugin's onEnable.
 */
export const confirmDialogWidget: Widget<ConfirmDialogProps> = defineWidget({
  manifest: {
    id: "com.hyperforge.hyperscape.confirm-dialog",
    name: "Confirm Dialog",
    category: "modal",
    defaultSize: { width: 40, height: 24 },
  },
  propsSchema: confirmDialogPropsSchema,
  defaultProps: {
    visible: false,
    title: "Are you sure?",
    message: "",
    confirmLabel: "Confirm",
    cancelLabel: "Cancel",
    variant: "danger",
    widthPx: 320,
    backdropColor: "rgba(0, 0, 0, 0.5)",
    panelBackgroundColor: "rgba(15, 17, 25, 0.95)",
    panelBorderColor: "#3a3f4d",
    headerBackgroundColor: "#1a1f2e",
    titleColor: "#e6e8ec",
    messageColor: "#a8aec0",
    buttonTextColor: "#e6e8ec",
    cancelButtonBackground: "rgba(40, 45, 60, 0.85)",
    cancelButtonHoverBackground: "rgba(60, 66, 80, 0.95)",
    cancelButtonBorderColor: "#3a3f4d",
    dangerColor: "#e84545",
    accentColor: "#ffd84d",
  },
});

/**
 * React component. Returns null when `visible` is false. Hover state
 * is internal; resets on close.
 */
export function ConfirmDialog(
  props: ConfirmDialogRuntimeProps,
): React.ReactElement | null {
  const {
    visible,
    title,
    message,
    confirmLabel,
    cancelLabel,
    variant,
    widthPx,
    backdropColor,
    panelBackgroundColor,
    panelBorderColor,
    headerBackgroundColor,
    titleColor,
    messageColor,
    buttonTextColor,
    cancelButtonBackground,
    cancelButtonHoverBackground,
    cancelButtonBorderColor,
    dangerColor,
    accentColor,
    onConfirm,
    onCancel,
  } = props;

  const [confirmHover, setConfirmHover] = useState(false);
  const [cancelHover, setCancelHover] = useState(false);

  if (!visible) return null;

  const confirmAccent = variant === "danger" ? dangerColor : accentColor;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel?.();
      }}
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: backdropColor,
        pointerEvents: "auto",
        zIndex: 100,
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif",
      }}
    >
      <div
        style={{
          width: widthPx,
          maxWidth: "calc(100% - 32px)",
          background: panelBackgroundColor,
          border: `1px solid ${panelBorderColor}`,
          borderRadius: 12,
          overflow: "hidden",
          color: buttonTextColor,
        }}
      >
        <div
          style={{
            padding: "10px 14px",
            background: headerBackgroundColor,
          }}
        >
          <h2
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: titleColor,
              margin: 0,
            }}
          >
            {title}
          </h2>
        </div>

        <div style={{ padding: 14 }}>
          {message && (
            <p
              style={{
                fontSize: 13,
                color: messageColor,
                textAlign: "center",
                margin: "0 0 16px",
              }}
            >
              {message}
            </p>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={onConfirm}
              onMouseEnter={() => setConfirmHover(true)}
              onMouseLeave={() => setConfirmHover(false)}
              style={{
                flex: 1,
                padding: "8px",
                borderRadius: 6,
                border: `1px solid ${confirmAccent}`,
                background: confirmHover ? confirmAccent : `${confirmAccent}b3`,
                color: buttonTextColor,
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 700,
                transition: "background 200ms ease",
              }}
            >
              {confirmLabel}
            </button>
            <button
              onClick={onCancel}
              onMouseEnter={() => setCancelHover(true)}
              onMouseLeave={() => setCancelHover(false)}
              style={{
                flex: 1,
                padding: "8px",
                borderRadius: 6,
                border: `1px solid ${cancelButtonBorderColor}`,
                background: cancelHover
                  ? cancelButtonHoverBackground
                  : cancelButtonBackground,
                color: buttonTextColor,
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 700,
                transition: "background 200ms ease",
              }}
            >
              {cancelLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Bundled registration — pairs the widget schema with its React
 * renderer.
 */
export const confirmDialogRegistration: WidgetRegistration<
  ConfirmDialogProps,
  React.ComponentType<ConfirmDialogProps>
> = {
  widget: confirmDialogWidget,
  Component: ConfirmDialog as React.ComponentType<ConfirmDialogProps>,
};
