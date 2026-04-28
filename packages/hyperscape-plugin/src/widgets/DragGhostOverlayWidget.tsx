/**
 * DragGhostOverlayWidget — small visual ghost that follows the
 * cursor during drag operations.
 *
 * Phase D6.c twenty-ninth widget migration. Mirrors the legacy
 * hand-coded `DragOverlay` from `packages/client/src/ui/components/`.
 * Substrate-promote: drops `useDragStore` + `useTheme`. The widget
 * receives the drag state via typed props; the host adapter
 * subscribes to the drag store and threads state through.
 *
 * Three render variants (driven by `kind`):
 *   - `"tab"`: pill with `label` text — used when dragging a tab.
 *   - `"marker"`: small circular dot — generic drop indicator.
 *   - `"none"`: returns null — explicit "don't render anything"
 *     state for in-place dragging like windows.
 *
 * Adapter wiring (host responsibility):
 *
 *   ```ts
 *   const isDragging = useDragStore((s) => s.isDragging);
 *   const item = useDragStore((s) => s.item);
 *   const current = useDragStore((s) => s.current);
 *
 *   <DragGhostOverlay
 *     visible={isDragging && item != null}
 *     x={current.x}
 *     y={current.y}
 *     kind={
 *       item?.type === "tab" ? "tab"
 *         : item?.type === "window" ? "none"
 *         : "marker"
 *     }
 *     label={item?.type === "tab" ? String(item.data.label) : ""}
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

/** Render variants. */
export const DRAG_GHOST_KINDS = ["tab", "marker", "none"] as const;
export type DragGhostKind = (typeof DRAG_GHOST_KINDS)[number];

/** Props the widget exposes through its Zod schema. */
export const dragGhostOverlayPropsSchema = z.object({
  /** Whether to render at all. */
  visible: z.boolean().default(false),
  /** Cursor X (screen coords). */
  x: z.number().default(0),
  /** Cursor Y (screen coords). */
  y: z.number().default(0),
  /** Render variant. `"none"` returns null even when visible. */
  kind: z.enum(DRAG_GHOST_KINDS).default("marker"),
  /** Label shown inside the tab pill (only used when `kind === "tab"`). */
  label: z.string().default(""),
  /** Z-index — defaults to a high tooltip-like layer. */
  zIndex: z.number().int().default(99_999),
  /** Tab-pill background. */
  tabBackgroundColor: z.string().default("rgba(20, 24, 36, 0.95)"),
  /** Tab-pill border (also accent for marker). */
  accentColor: z.string().default("#ffd84d"),
  /** Tab-pill text color. */
  tabTextColor: z.string().default("#e6e8ec"),
  /** Tab font size (px). */
  tabFontSize: z.number().int().min(8).max(48).default(12),
  /** Marker dot diameter (px). */
  markerSizePx: z.number().int().min(4).max(64).default(24),
});

export type DragGhostOverlayProps = z.infer<typeof dragGhostOverlayPropsSchema>;

/**
 * Widget definition — registered against the host's UI registry by
 * the meta-plugin's onEnable.
 */
export const dragGhostOverlayWidget: Widget<DragGhostOverlayProps> =
  defineWidget({
    manifest: {
      id: "com.hyperforge.hyperscape.drag-ghost-overlay",
      name: "Drag Ghost Overlay",
      category: "overlay",
      defaultSize: { width: 8, height: 4 },
    },
    propsSchema: dragGhostOverlayPropsSchema,
    defaultProps: {
      visible: false,
      x: 0,
      y: 0,
      kind: "marker",
      label: "",
      zIndex: 99_999,
      tabBackgroundColor: "rgba(20, 24, 36, 0.95)",
      accentColor: "#ffd84d",
      tabTextColor: "#e6e8ec",
      tabFontSize: 12,
      markerSizePx: 24,
    },
  });

/**
 * React component. Returns null when `visible` is false or `kind`
 * is `"none"`. Pinned to the cursor with a `translate(-50%, -50%)`
 * centering transform.
 */
export function DragGhostOverlay(
  props: DragGhostOverlayProps,
): React.ReactElement | null {
  const {
    visible,
    x,
    y,
    kind,
    label,
    zIndex,
    tabBackgroundColor,
    accentColor,
    tabTextColor,
    tabFontSize,
    markerSizePx,
  } = props;

  if (!visible || kind === "none") return null;

  const overlayStyle: React.CSSProperties = {
    position: "fixed",
    left: x,
    top: y,
    transform: "translate(-50%, -50%)",
    pointerEvents: "none",
    zIndex,
  };

  if (kind === "tab") {
    return (
      <div style={overlayStyle}>
        <div
          style={{
            padding: "4px 8px",
            backgroundColor: tabBackgroundColor,
            border: `1px solid ${accentColor}`,
            borderRadius: 4,
            color: tabTextColor,
            fontSize: tabFontSize,
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.4)",
            fontFamily:
              "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif",
            whiteSpace: "nowrap",
          }}
        >
          {label || "Tab"}
        </div>
      </div>
    );
  }

  // marker
  return (
    <div style={overlayStyle}>
      <div
        style={{
          width: markerSizePx,
          height: markerSizePx,
          backgroundColor: accentColor,
          borderRadius: "50%",
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.4)",
        }}
      />
    </div>
  );
}

/**
 * Bundled registration — pairs the widget schema with its React
 * renderer.
 */
export const dragGhostOverlayRegistration: WidgetRegistration<
  DragGhostOverlayProps,
  React.ComponentType<DragGhostOverlayProps>
> = {
  widget: dragGhostOverlayWidget,
  Component: DragGhostOverlay,
};
