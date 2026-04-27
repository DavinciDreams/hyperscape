/**
 * CoinPouchWidget — money pouch display + click-to-withdraw button.
 *
 * Phase D6.c thirteenth widget migration. Mirrors the legacy
 * hand-coded `CoinPouch` element used inside the inventory panel.
 * Substrate-promote: the legacy component subscribes to a theme
 * store and embeds a `CursorTooltip` primitive from `@/ui`. The
 * widget receives all theme tokens as explicit color props and
 * drops the tooltip entirely — hosts that want a tooltip wrap the
 * widget with their own primitive (the widget calls
 * `onHoverChange(x, y)` on enter/move and `null` on leave so the
 * host can position one if desired).
 *
 * Adapter wiring (host responsibility):
 *
 *   ```ts
 *   const [hoverPos, setHoverPos] = useState<{x:number;y:number}|null>(null);
 *
 *   <CoinPouch
 *     coins={inventory.coins}
 *     onWithdrawClick={() => openCoinAmountModal()}
 *     onHoverChange={setHoverPos}
 *   />
 *   {hoverPos && <CursorTooltip ... />}
 *   ```
 */

import {
  defineWidget,
  type Widget,
  type WidgetRegistration,
} from "@hyperforge/ui-framework";
import React, { useCallback } from "react";
import { z } from "zod";

/** Props the widget exposes through its Zod schema. */
export const coinPouchPropsSchema = z.object({
  /** Current coin balance. */
  coins: z.number().int().nonnegative().default(0),
  /** Label rendered next to the icon (legacy: "Coins"). */
  label: z.string().default("Coins"),
  /** Icon character/emoji (legacy: 💰). */
  icon: z.string().min(1).default("💰"),
  /**
   * aria-label template — `{count}` is replaced with
   * `coins.toLocaleString()`. Defaults match legacy verbiage.
   */
  ariaLabelTemplate: z
    .string()
    .default("Money pouch: {count} coins. Press Enter to withdraw."),
  /** Top of the gradient background (panelSecondary). */
  backgroundTopColor: z.string().default("rgba(40, 45, 60, 0.9)"),
  /** Bottom of the gradient background (panelPrimary). */
  backgroundBottomColor: z.string().default("rgba(20, 24, 36, 0.95)"),
  /** Border color. */
  borderColor: z.string().default("#3a3f4d"),
  /** Label text color (theme.colors.text.secondary). */
  labelTextColor: z.string().default("#a8aec0"),
  /** Coin-amount text color (theme.colors.accent.secondary). */
  amountTextColor: z.string().default("#ffd84d"),
  /** Focus-ring color. */
  focusRingColor: z.string().default("rgba(255, 216, 77, 0.5)"),
  /** Base font size for the amount + label. */
  fontSize: z.number().int().min(8).max(48).default(12),
  /** Icon font size (legacy: text-base = 16). */
  iconFontSize: z.number().int().min(8).max(96).default(16),
  /** Vertical padding (px). */
  paddingYPx: z.number().int().min(0).max(64).default(4),
  /** Horizontal padding (px). */
  paddingXPx: z.number().int().min(0).max(64).default(8),
  /** Corner radius (px). */
  borderRadiusPx: z.number().int().min(0).max(32).default(4),
});

export type CoinPouchProps = z.infer<typeof coinPouchPropsSchema>;

/** Extended runtime props — callbacks not modeled in the schema. */
export interface CoinPouchRuntimeProps extends CoinPouchProps {
  /** Called when the pouch is clicked or activated via Enter/Space. */
  readonly onWithdrawClick?: () => void;
  /**
   * Called with a screen-coords point on enter/move and `null` on
   * leave. Hosts that want a hover tooltip subscribe here.
   */
  readonly onHoverChange?: (point: { x: number; y: number } | null) => void;
}

/**
 * Widget definition — registered against the host's UI registry by
 * the meta-plugin's onEnable.
 */
export const coinPouchWidget: Widget<CoinPouchProps> = defineWidget({
  manifest: {
    id: "com.hyperforge.hyperscape.coin-pouch",
    name: "Coin Pouch",
    category: "panel",
    defaultSize: { width: 32, height: 4 },
  },
  propsSchema: coinPouchPropsSchema,
  defaultProps: {
    coins: 0,
    label: "Coins",
    icon: "💰",
    ariaLabelTemplate: "Money pouch: {count} coins. Press Enter to withdraw.",
    backgroundTopColor: "rgba(40, 45, 60, 0.9)",
    backgroundBottomColor: "rgba(20, 24, 36, 0.95)",
    borderColor: "#3a3f4d",
    labelTextColor: "#a8aec0",
    amountTextColor: "#ffd84d",
    focusRingColor: "rgba(255, 216, 77, 0.5)",
    fontSize: 12,
    iconFontSize: 16,
    paddingYPx: 4,
    paddingXPx: 8,
    borderRadiusPx: 4,
  },
});

/**
 * React component. Renders a compact button with icon + label on
 * the left and the formatted coin count on the right. Activates on
 * click, Enter, or Space.
 */
export function CoinPouch(props: CoinPouchRuntimeProps): React.ReactElement {
  const {
    coins,
    label,
    icon,
    ariaLabelTemplate,
    backgroundTopColor,
    backgroundBottomColor,
    borderColor,
    labelTextColor,
    amountTextColor,
    focusRingColor,
    fontSize,
    iconFontSize,
    paddingYPx,
    paddingXPx,
    borderRadiusPx,
    onWithdrawClick,
    onHoverChange,
  } = props;

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onWithdrawClick?.();
      }
    },
    [onWithdrawClick],
  );

  const formattedCoins = coins.toLocaleString();
  const ariaLabel = ariaLabelTemplate.replace("{count}", formattedCoins);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onWithdrawClick?.()}
      onKeyDown={handleKeyDown}
      onMouseEnter={(e) => onHoverChange?.({ x: e.clientX, y: e.clientY })}
      onMouseMove={(e) => onHoverChange?.({ x: e.clientX, y: e.clientY })}
      onMouseLeave={() => onHoverChange?.(null)}
      onFocus={(e) => {
        const target = e.currentTarget;
        target.style.boxShadow = `inset 0 1px 0 rgba(150, 130, 80, 0.2), 0 1px 2px rgba(0, 0, 0, 0.3), 0 0 0 2px ${focusRingColor}`;
      }}
      onBlur={(e) => {
        const target = e.currentTarget;
        target.style.boxShadow =
          "inset 0 1px 0 rgba(150, 130, 80, 0.2), 0 1px 2px rgba(0, 0, 0, 0.3)";
      }}
      aria-label={ariaLabel}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: `${paddingYPx}px ${paddingXPx}px`,
        border: `1px solid ${borderColor}`,
        borderRadius: borderRadiusPx,
        background: `linear-gradient(180deg, ${backgroundTopColor} 0%, ${backgroundBottomColor} 100%)`,
        boxShadow:
          "inset 0 1px 0 rgba(150, 130, 80, 0.2), 0 1px 2px rgba(0, 0, 0, 0.3)",
        cursor: "pointer",
        outline: "none",
        transition: "filter 150ms ease",
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: iconFontSize }}>{icon}</span>
        <span
          style={{
            fontSize,
            fontWeight: 500,
            color: labelTextColor,
          }}
        >
          {label}
        </span>
      </div>
      <span
        style={{
          fontSize,
          fontWeight: 700,
          color: amountTextColor,
          textShadow: "0 1px 2px rgba(0, 0, 0, 0.8)",
        }}
      >
        {formattedCoins}
      </span>
    </div>
  );
}

/**
 * Bundled registration — pairs the widget schema with its React
 * renderer.
 */
export const coinPouchRegistration: WidgetRegistration<
  CoinPouchProps,
  React.ComponentType<CoinPouchProps>
> = {
  widget: coinPouchWidget,
  Component: CoinPouch as React.ComponentType<CoinPouchProps>,
};
