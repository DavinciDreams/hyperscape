/**
 * Quantity Prompt Modal Component
 *
 * Modal for entering custom quantity (Offer-X).
 * Supports K/M notation for quick entry.
 */

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { getItem } from "@hyperscape/shared";
import { getPanelHeaderStyle, getPanelSurfaceStyle } from "@/ui/theme/themes";
import { parseQuantityInput } from "../utils";
import type { QuantityPromptProps } from "../types";

export function QuantityPrompt({
  item,
  theme,
  onConfirm,
  onCancel,
}: QuantityPromptProps) {
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const itemData = getItem(item.itemId);
  const itemName = itemData?.name || item.itemId;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = () => {
    const qty = parseQuantityInput(inputValue);
    if (qty > 0) {
      const finalQty = Math.min(qty, item.quantity);
      onConfirm(finalQty);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 100000, background: "rgba(0, 0, 0, 0.5)" }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          ...getPanelSurfaceStyle(theme, { emphasis: "strong" }),
          borderRadius: theme.borderRadius.xl,
          padding: "16px",
          minWidth: "280px",
        }}
      >
        <h3
          style={{
            ...getPanelHeaderStyle(theme),
            color: theme.colors.text.accent,
            fontWeight: "bold",
            margin: "-16px -16px 12px",
            marginBottom: "12px",
            padding: "12px 16px",
            fontSize: "14px",
          }}
        >
          How many would you like to offer?
        </h3>
        <p
          style={{
            color: theme.colors.text.secondary,
            fontSize: "12px",
            marginBottom: "8px",
          }}
        >
          {itemName} (max: {item.quantity.toLocaleString()})
        </p>
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSubmit();
            if (e.key === "Escape") onCancel();
          }}
          placeholder="e.g. 10, 1k, 1.5m"
          style={{
            width: "100%",
            padding: "8px",
            background: theme.colors.background.panelPrimary,
            border: `1px solid ${theme.colors.border.default}66`,
            borderRadius: `${theme.borderRadius.md}px`,
            color: theme.colors.text.primary,
            fontSize: "14px",
            marginBottom: "12px",
          }}
        />
        <div className="flex gap-2">
          <button
            onClick={handleSubmit}
            style={{
              flex: 1,
              padding: "8px",
              background: `linear-gradient(135deg, ${theme.colors.state.success}CC 0%, ${theme.colors.state.success}AA 100%)`,
              color: "white",
              border: "none",
              borderRadius: `${theme.borderRadius.md}px`,
              cursor: "pointer",
              fontWeight: "bold",
            }}
          >
            Confirm
          </button>
          <button
            onClick={onCancel}
            style={{
              flex: 1,
              padding: "8px",
              background: `linear-gradient(135deg, ${theme.colors.state.danger}CC 0%, ${theme.colors.state.danger}AA 100%)`,
              color: "white",
              border: "none",
              borderRadius: `${theme.borderRadius.md}px`,
              cursor: "pointer",
              fontWeight: "bold",
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
