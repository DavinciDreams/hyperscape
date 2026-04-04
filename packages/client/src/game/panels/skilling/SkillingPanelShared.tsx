import React from "react";
import type { CSSProperties, ReactNode } from "react";
import type { Theme } from "@/ui";

interface SkillingPanelBodyProps {
  theme: Theme;
  children?: ReactNode;
  emptyMessage?: string;
  intro?: string;
}

interface SkillingSectionProps {
  theme: Theme;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

interface SkillingQuantitySelectorProps {
  theme: Theme;
  showCustomInput: boolean;
  customQuantity: string;
  lastCustomQuantity: number;
  onCustomQuantityChange: (value: string) => void;
  onCustomSubmit: () => void;
  onCancelCustomInput: () => void;
  onPresetQuantity: (quantity: number) => void;
  allQuantity: number;
  onShowCustomInput: () => void;
}

export function SkillingPanelBody({
  theme,
  children,
  emptyMessage,
  intro,
}: SkillingPanelBodyProps) {
  return (
    <div className="flex min-w-0 w-full flex-col gap-3">
      {intro ? (
        <p
          className="text-xs leading-relaxed"
          style={{ color: theme.colors.text.secondary }}
        >
          {intro}
        </p>
      ) : null}

      {emptyMessage ? (
        <div
          className="rounded-xl border px-4 py-8 text-center text-sm"
          style={{
            background: theme.colors.background.panelSecondary,
            borderColor: theme.colors.border.default,
            color: theme.colors.text.secondary,
          }}
        >
          {emptyMessage}
        </div>
      ) : (
        children
      )}
    </div>
  );
}

export function SkillingSection({
  theme,
  children,
  className,
  style,
}: SkillingSectionProps) {
  return (
    <div
      className={["rounded-xl border p-3", className].filter(Boolean).join(" ")}
      style={{
        background: theme.colors.background.panelSecondary,
        borderColor: theme.colors.border.default,
        boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.03)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function getSkillingSelectableStyle(
  theme: Theme,
  selected: boolean,
  disabled = false,
): CSSProperties {
  return {
    background: selected
      ? `${theme.colors.accent.primary}18`
      : "rgba(8, 10, 14, 0.34)",
    borderColor: selected
      ? `${theme.colors.accent.primary}66`
      : theme.colors.border.default,
    boxShadow: selected
      ? `0 0 0 1px ${theme.colors.accent.primary}33 inset`
      : "none",
    opacity: disabled ? 0.48 : 1,
  };
}

export function getSkillingBadgeStyle(theme: Theme): CSSProperties {
  return {
    background: "rgba(6, 8, 12, 0.34)",
    border: `1px solid ${theme.colors.border.default}`,
    color: theme.colors.text.secondary,
  };
}

export function SkillingQuantitySelector({
  theme,
  showCustomInput,
  customQuantity,
  lastCustomQuantity,
  onCustomQuantityChange,
  onCustomSubmit,
  onCancelCustomInput,
  onPresetQuantity,
  allQuantity,
  onShowCustomInput,
}: SkillingQuantitySelectorProps) {
  if (showCustomInput) {
    return (
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="number"
          value={customQuantity}
          onChange={(e) => onCustomQuantityChange(e.target.value)}
          className="flex-1 rounded-lg px-3 py-2 text-sm outline-none"
          style={{
            background: theme.colors.background.panelPrimary,
            border: `1px solid ${theme.colors.border.default}`,
            color: theme.colors.accent.primary,
          }}
          placeholder={`Amount (last: ${lastCustomQuantity})`}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") onCustomSubmit();
            if (e.key === "Escape") onCancelCustomInput();
          }}
        />
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <button
            onClick={onCustomSubmit}
            className="rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:brightness-110"
            style={{
              background: `${theme.colors.state.success}2b`,
              border: `1px solid ${theme.colors.state.success}5e`,
              color: theme.colors.state.success,
            }}
          >
            OK
          </button>
          <button
            onClick={onCancelCustomInput}
            className="rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:brightness-110"
            style={{
              background: `${theme.colors.text.muted}16`,
              border: `1px solid ${theme.colors.border.default}`,
              color: theme.colors.text.secondary,
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {[1, 5, 10].map((qty) => (
        <button
          key={qty}
          onClick={() => onPresetQuantity(qty)}
          className="rounded-lg px-2 py-2 text-xs font-semibold transition-colors hover:brightness-110"
          style={{
            background: `${theme.colors.accent.primary}1e`,
            border: `1px solid ${theme.colors.accent.primary}3a`,
            color: theme.colors.accent.primary,
          }}
        >
          {qty}
        </button>
      ))}
      <button
        onClick={() => onPresetQuantity(allQuantity)}
        className="rounded-lg px-2 py-2 text-xs font-semibold transition-colors hover:brightness-110"
        style={{
          background: `${theme.colors.accent.primary}1e`,
          border: `1px solid ${theme.colors.accent.primary}3a`,
          color: theme.colors.accent.primary,
        }}
      >
        All
      </button>
      <button
        onClick={onShowCustomInput}
        className="rounded-lg px-2 py-2 text-xs font-semibold transition-colors hover:brightness-110"
        style={{
          background: `${theme.colors.accent.primary}1e`,
          border: `1px solid ${theme.colors.accent.primary}3a`,
          color: theme.colors.accent.primary,
        }}
      >
        X
      </button>
    </div>
  );
}
