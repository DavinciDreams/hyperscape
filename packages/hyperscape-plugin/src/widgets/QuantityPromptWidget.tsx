/**
 * QuantityPromptWidget — modal for entering a numeric quantity with
 * K/M suffix support (e.g., "1k", "2.5m"). Used by trade/store
 * panels to ask the player "how many would you like to offer?".
 *
 * Phase D6.c sixteenth widget migration. Mirrors the legacy
 * hand-coded `QuantityPrompt` from the TradePanel. Substrate-promote:
 * the legacy modal subscribes to a theme store, calls
 * `getItem(itemId)` from shared, uses `createPortal` to render at
 * document.body, and embeds theme-helper CSS factories. The widget
 * receives the item label as a typed prop, drops the portal, and
 * exposes all theme tokens as explicit color props.
 *
 * The K/M parsing logic is inlined (`parseQuantityInput`) so the
 * widget has zero dependencies beyond React + Zod.
 *
 * Adapter wiring (host responsibility):
 *
 *   ```ts
 *   const itemData = getItem(item.itemId);
 *
 *   <QuantityPrompt
 *     visible={promptOpen}
 *     itemName={itemData?.name ?? item.itemId}
 *     maxQuantity={item.quantity}
 *     onConfirm={(qty) => { sendOffer(item, qty); setPromptOpen(false); }}
 *     onCancel={() => setPromptOpen(false)}
 *   />
 *   ```
 */

import {
  defineWidget,
  type Widget,
  type WidgetRegistration,
} from "@hyperforge/ui-framework";
import React, { useEffect, useRef, useState } from "react";
import { z } from "zod";

/**
 * Parse a quantity input with K/M suffix support.
 * Returns 0 for unparseable input.
 *
 *   "5"     → 5
 *   "1k"    → 1_000
 *   "2.5m"  → 2_500_000
 */
export function parseQuantityInput(input: string): number {
  const normalized = input.toLowerCase().trim();
  const match = normalized.match(/^(\d+\.?\d*)(k|m)?$/);
  if (!match) return 0;
  let value = parseFloat(match[1]);
  if (match[2] === "k") value *= 1_000;
  if (match[2] === "m") value *= 1_000_000;
  return Math.floor(value);
}

/** Props the widget exposes through its Zod schema. */
export const quantityPromptPropsSchema = z.object({
  /** Whether the modal is visible. Renders null when false. */
  visible: z.boolean().default(false),
  /** Modal title (e.g., "How many would you like to offer?"). */
  title: z.string().default("How many would you like to offer?"),
  /** Display name of the item being prompted on. */
  itemName: z.string().default(""),
  /** Max quantity available — clamps the parsed result. */
  maxQuantity: z.number().int().nonnegative().default(0),
  /** Input placeholder text. */
  placeholder: z.string().default("e.g. 10, 1k, 1.5m"),
  /** Confirm button label. */
  confirmLabel: z.string().default("Confirm"),
  /** Cancel button label. */
  cancelLabel: z.string().default("Cancel"),
  /** Modal width in pixels. */
  widthPx: z.number().int().min(220).max(960).default(280),
  /** Backdrop color. */
  backdropColor: z.string().default("rgba(0, 0, 0, 0.5)"),
  /** Panel background. */
  panelBackgroundColor: z.string().default("rgba(15, 17, 25, 0.95)"),
  /** Panel border. */
  panelBorderColor: z.string().default("#3a3f4d"),
  /** Header background. */
  headerBackgroundColor: z.string().default("#1a1f2e"),
  /** Title text color (theme.colors.text.accent). */
  titleColor: z.string().default("#ffd84d"),
  /** Secondary text (item-name + max). */
  secondaryTextColor: z.string().default("#a8aec0"),
  /** Primary text color (input). */
  textColor: z.string().default("#e6e8ec"),
  /** Input background. */
  inputBackgroundColor: z.string().default("rgba(20, 24, 36, 0.95)"),
  /** Input border. */
  inputBorderColor: z.string().default("#3a3f4d"),
  /** Confirm button color (theme.colors.state.success). */
  confirmAccentColor: z.string().default("#4ade80"),
  /** Cancel button color (theme.colors.state.danger). */
  cancelAccentColor: z.string().default("#e84545"),
});

export type QuantityPromptProps = z.infer<typeof quantityPromptPropsSchema>;

/** Extended runtime props — callbacks not modeled in the schema. */
export interface QuantityPromptRuntimeProps extends QuantityPromptProps {
  /** Called with the clamped quantity when Enter or Confirm fires. */
  readonly onConfirm?: (quantity: number) => void;
  /** Called when the user cancels (Esc, Cancel, backdrop click). */
  readonly onCancel?: () => void;
}

/**
 * Widget definition — registered against the host's UI registry by
 * the meta-plugin's onEnable.
 */
export const quantityPromptWidget: Widget<QuantityPromptProps> = defineWidget({
  manifest: {
    id: "com.hyperforge.hyperscape.quantity-prompt",
    name: "Quantity Prompt",
    category: "modal",
    defaultSize: { width: 32, height: 24 },
  },
  propsSchema: quantityPromptPropsSchema,
  defaultProps: {
    visible: false,
    title: "How many would you like to offer?",
    itemName: "",
    maxQuantity: 0,
    placeholder: "e.g. 10, 1k, 1.5m",
    confirmLabel: "Confirm",
    cancelLabel: "Cancel",
    widthPx: 280,
    backdropColor: "rgba(0, 0, 0, 0.5)",
    panelBackgroundColor: "rgba(15, 17, 25, 0.95)",
    panelBorderColor: "#3a3f4d",
    headerBackgroundColor: "#1a1f2e",
    titleColor: "#ffd84d",
    secondaryTextColor: "#a8aec0",
    textColor: "#e6e8ec",
    inputBackgroundColor: "rgba(20, 24, 36, 0.95)",
    inputBorderColor: "#3a3f4d",
    confirmAccentColor: "#4ade80",
    cancelAccentColor: "#e84545",
  },
});

/**
 * React component. Returns null when `visible` is false. Auto-
 * focuses the input when shown. Supports Enter to confirm and
 * Escape to cancel. Quantity is clamped to `maxQuantity`.
 */
export function QuantityPrompt(
  props: QuantityPromptRuntimeProps,
): React.ReactElement | null {
  const {
    visible,
    title,
    itemName,
    maxQuantity,
    placeholder,
    confirmLabel,
    cancelLabel,
    widthPx,
    backdropColor,
    panelBackgroundColor,
    panelBorderColor,
    headerBackgroundColor,
    titleColor,
    secondaryTextColor,
    textColor,
    inputBackgroundColor,
    inputBorderColor,
    confirmAccentColor,
    cancelAccentColor,
    onConfirm,
    onCancel,
  } = props;

  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (visible) {
      inputRef.current?.focus();
      setInputValue("");
    }
  }, [visible]);

  if (!visible) return null;

  const handleSubmit = (): void => {
    const qty = parseQuantityInput(inputValue);
    if (qty > 0) {
      const finalQty = maxQuantity > 0 ? Math.min(qty, maxQuantity) : qty;
      onConfirm?.(finalQty);
    }
  };

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
          color: textColor,
        }}
      >
        <div
          style={{
            padding: "12px 16px",
            background: headerBackgroundColor,
          }}
        >
          <h3
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: titleColor,
              margin: 0,
            }}
          >
            {title}
          </h3>
        </div>

        <div style={{ padding: 16 }}>
          {itemName && (
            <p
              style={{
                color: secondaryTextColor,
                fontSize: 12,
                margin: "0 0 8px",
              }}
            >
              {itemName}
              {maxQuantity > 0 && ` (max: ${maxQuantity.toLocaleString()})`}
            </p>
          )}

          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit();
              if (e.key === "Escape") onCancel?.();
            }}
            placeholder={placeholder}
            style={{
              width: "100%",
              padding: 8,
              borderRadius: 6,
              border: `1px solid ${inputBorderColor}`,
              background: inputBackgroundColor,
              color: textColor,
              fontSize: 14,
              marginBottom: 12,
              outline: "none",
              boxSizing: "border-box",
            }}
          />

          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={handleSubmit}
              style={{
                flex: 1,
                padding: 8,
                borderRadius: 6,
                border: `1px solid ${confirmAccentColor}`,
                background: `${confirmAccentColor}b3`,
                color: "white",
                cursor: "pointer",
                fontWeight: 700,
                fontSize: 13,
              }}
            >
              {confirmLabel}
            </button>
            <button
              onClick={onCancel}
              style={{
                flex: 1,
                padding: 8,
                borderRadius: 6,
                border: `1px solid ${cancelAccentColor}`,
                background: `${cancelAccentColor}b3`,
                color: "white",
                cursor: "pointer",
                fontWeight: 700,
                fontSize: 13,
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
export const quantityPromptRegistration: WidgetRegistration<
  QuantityPromptProps,
  React.ComponentType<QuantityPromptProps>
> = {
  widget: quantityPromptWidget,
  Component: QuantityPrompt as React.ComponentType<QuantityPromptProps>,
};
