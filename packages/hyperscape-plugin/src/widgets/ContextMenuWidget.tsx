/**
 * ContextMenuWidget — generic right-click / on-demand context menu.
 *
 * Phase D6.c twenty-second widget migration. Generalized from the
 * legacy hand-coded `TradeContextMenu`. Substrate-promote: drops the
 * theme-helper imports, drops the trade-specific item-name lookup,
 * drops the `createPortal` to `document.body`. The widget receives
 * `items` as a typed array of `{id, label, accent?, disabled?}`
 * and exposes click-outside + Escape-to-close behavior internally
 * via `onClose`.
 *
 * Adapter wiring (host responsibility):
 *
 *   ```ts
 *   <ContextMenu
 *     visible={menuOpen}
 *     x={menuPos.x}
 *     y={menuPos.y}
 *     title="Lobster"
 *     items={[
 *       { id: "offer-1",  label: "Offer 1",       accent: true },
 *       { id: "offer-5",  label: "Offer-5" },
 *       { id: "offer-10", label: "Offer-10" },
 *       { id: "offer-x",  label: "Offer-X" },
 *       { id: "value",    label: "Value" },
 *       { id: "examine",  label: "Examine" },
 *     ]}
 *     onSelect={(id) => handleAction(id)}
 *     onClose={() => setMenuOpen(false)}
 *   />
 *   ```
 */

import {
  defineWidget,
  type Widget,
  type WidgetRegistration,
} from "@hyperforge/ui-framework";
import React, { useEffect, useRef } from "react";
import { z } from "zod";

/** A single menu item. */
export const contextMenuItemSchema = z.object({
  /** Stable id passed back to `onSelect`. */
  id: z.string().min(1),
  /** Visible label. */
  label: z.string().min(1),
  /** When true, paints the item with the accent color. */
  accent: z.boolean().default(false),
  /** When true, the item is rendered dimmed and click is suppressed. */
  disabled: z.boolean().default(false),
});

export type ContextMenuItem = z.infer<typeof contextMenuItemSchema>;

/** Props the widget exposes through its Zod schema. */
export const contextMenuPropsSchema = z.object({
  /** Whether the menu is visible. Renders null when false. */
  visible: z.boolean().default(false),
  /** Anchor X (screen coords). */
  x: z.number().default(0),
  /** Anchor Y (screen coords). */
  y: z.number().default(0),
  /** Optional header text (e.g., the item name). */
  title: z.string().default(""),
  /** Menu items. */
  items: z.array(contextMenuItemSchema).default(() => []),
  /** Min menu width (px). */
  minWidthPx: z.number().int().min(80).max(640).default(160),
  /** Optional max menu height (px). 0 = unlimited. */
  maxHeightPx: z.number().int().min(0).max(2_048).default(0),
  /** Surface background. */
  backgroundColor: z.string().default("rgba(15, 17, 25, 0.98)"),
  /** Surface border color. */
  borderColor: z.string().default("#3a3f4d"),
  /** Surface corner radius (px). */
  borderRadiusPx: z.number().int().min(0).max(32).default(6),
  /** Header background. */
  headerBackgroundColor: z.string().default("#1a1f2e"),
  /** Header text color. */
  titleColor: z.string().default("#ffd84d"),
  /** Item primary text color. */
  itemTextColor: z.string().default("#e6e8ec"),
  /** Item accent text color (for `accent: true` items + the first row). */
  accentTextColor: z.string().default("#ffd84d"),
  /** Item hover background. */
  hoverBackgroundColor: z.string().default("rgba(214, 197, 160, 0.12)"),
  /** Disabled item color. */
  disabledTextColor: z.string().default("#5a606e"),
  /** Item font size (px). */
  fontSize: z.number().int().min(8).max(48).default(12),
  /** Z-index for the surface. */
  zIndex: z.number().int().default(2000),
});

export type ContextMenuProps = z.infer<typeof contextMenuPropsSchema>;

/** Extended runtime props — callbacks not modeled in the schema. */
export interface ContextMenuRuntimeProps extends ContextMenuProps {
  /** Called with the selected item's id. The widget closes after `onClose`. */
  readonly onSelect?: (itemId: string) => void;
  /** Called when the user clicks outside or presses Escape. */
  readonly onClose?: () => void;
}

/**
 * Widget definition — registered against the host's UI registry by
 * the meta-plugin's onEnable.
 */
export const contextMenuWidget: Widget<ContextMenuProps> = defineWidget({
  manifest: {
    id: "com.hyperforge.hyperscape.context-menu",
    name: "Context Menu",
    category: "menu",
    defaultSize: { width: 24, height: 32 },
  },
  propsSchema: contextMenuPropsSchema,
  defaultProps: {
    visible: false,
    x: 0,
    y: 0,
    title: "",
    items: [],
    minWidthPx: 160,
    maxHeightPx: 0,
    backgroundColor: "rgba(15, 17, 25, 0.98)",
    borderColor: "#3a3f4d",
    borderRadiusPx: 6,
    headerBackgroundColor: "#1a1f2e",
    titleColor: "#ffd84d",
    itemTextColor: "#e6e8ec",
    accentTextColor: "#ffd84d",
    hoverBackgroundColor: "rgba(214, 197, 160, 0.12)",
    disabledTextColor: "#5a606e",
    fontSize: 12,
    zIndex: 2000,
  },
});

/**
 * React component. Returns null when `visible` is false. Anchors at
 * `(x, y)` and clamps to viewport so the menu doesn't overflow the
 * right or bottom edge. Closes on outside click or Escape.
 *
 * The first item in `items` is rendered with the accent color
 * automatically (matches legacy "primary action" affordance), in
 * addition to any explicit `accent: true` entries.
 */
export function ContextMenu(
  props: ContextMenuRuntimeProps,
): React.ReactElement | null {
  const {
    visible,
    x,
    y,
    title,
    items,
    minWidthPx,
    maxHeightPx,
    backgroundColor,
    borderColor,
    borderRadiusPx,
    headerBackgroundColor,
    titleColor,
    itemTextColor,
    accentTextColor,
    hoverBackgroundColor,
    disabledTextColor,
    fontSize,
    zIndex,
    onSelect,
    onClose,
  } = props;

  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!visible) return;
    const handleOutside = (e: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose?.();
      }
    };
    const handleEsc = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [visible, onClose]);

  if (!visible) return null;

  const viewportW = typeof window !== "undefined" ? window.innerWidth : 1920;
  const viewportH = typeof window !== "undefined" ? window.innerHeight : 1080;
  const adjustedX = Math.min(x, viewportW - minWidthPx);
  const adjustedY = Math.min(y, viewportH - 280);

  return (
    <div
      ref={menuRef}
      role="menu"
      style={{
        position: "fixed",
        left: adjustedX,
        top: adjustedY,
        zIndex,
        minWidth: minWidthPx,
        maxHeight: maxHeightPx > 0 ? maxHeightPx : undefined,
        overflowY: maxHeightPx > 0 ? "auto" : undefined,
        background: backgroundColor,
        border: `1px solid ${borderColor}`,
        borderRadius: borderRadiusPx,
        padding: "2px 0",
        boxShadow: "0 8px 24px rgba(0, 0, 0, 0.5)",
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif",
      }}
    >
      {title && (
        <div
          style={{
            padding: "4px 8px",
            background: headerBackgroundColor,
            color: titleColor,
            fontWeight: 700,
            fontSize,
          }}
        >
          {title}
        </div>
      )}
      {items.map((item, i) => {
        const isAccent = i === 0 || item.accent;
        const color = item.disabled
          ? disabledTextColor
          : isAccent
            ? accentTextColor
            : itemTextColor;
        return (
          <div
            key={item.id}
            role="menuitem"
            tabIndex={item.disabled ? -1 : 0}
            aria-disabled={item.disabled}
            onClick={() => {
              if (item.disabled) return;
              onSelect?.(item.id);
              onClose?.();
            }}
            style={{
              padding: "4px 8px",
              color,
              fontSize,
              cursor: item.disabled ? "not-allowed" : "pointer",
              userSelect: "none",
              transition: "background 100ms ease",
            }}
            onMouseEnter={(e) => {
              if (item.disabled) return;
              e.currentTarget.style.background = hoverBackgroundColor;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            {item.label}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Bundled registration — pairs the widget schema with its React
 * renderer.
 */
export const contextMenuRegistration: WidgetRegistration<
  ContextMenuProps,
  React.ComponentType<ContextMenuProps>
> = {
  widget: contextMenuWidget,
  Component: ContextMenu as React.ComponentType<ContextMenuProps>,
};
