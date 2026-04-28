/**
 * CursorTooltipWidget — mouse-following tooltip with title + body.
 *
 * Phase D6.c twenty-fourth widget migration. Mirrors the legacy
 * hand-coded `CursorTooltip` (used across HUD/panel surfaces for
 * hover hints). Substrate-promote: drops `createPortal` to
 * `document.body`, drops `useThemeStore`, drops the
 * `useTooltipPosition` + `useTooltipSize` hooks. The widget receives
 * `title` + `body` as plain string props (rich content goes through
 * a host-owned wrapper) and inlines viewport-edge clamping so it
 * always stays on-screen.
 *
 * Adapter wiring (host responsibility):
 *
 *   ```ts
 *   const [hover, setHover] = useState<{x:number;y:number}|null>(null);
 *
 *   <div
 *     onMouseMove={(e) => setHover({ x: e.clientX, y: e.clientY })}
 *     onMouseLeave={() => setHover(null)}
 *   >
 *     ...
 *   </div>
 *   <CursorTooltip
 *     visible={hover !== null}
 *     x={hover?.x ?? 0}
 *     y={hover?.y ?? 0}
 *     title="Iron Pickaxe"
 *     body="Used to mine iron ore."
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

/** Props the widget exposes through its Zod schema. */
export const cursorTooltipPropsSchema = z.object({
  /** Whether the tooltip is visible. */
  visible: z.boolean().default(false),
  /** Anchor X (screen coords, e.g., MouseEvent.clientX). */
  x: z.number().default(0),
  /** Anchor Y. */
  y: z.number().default(0),
  /** Optional title (rendered bold above the body). */
  title: z.string().default(""),
  /** Body text. Rendered as a single multi-line block. */
  body: z.string().default(""),
  /** Pixel offset from the cursor (legacy default: 4). */
  cursorOffsetPx: z.number().int().min(0).max(64).default(4),
  /** Estimated width before measurement (used for flip detection). */
  estimatedWidthPx: z.number().int().min(40).max(2_048).default(140),
  /** Estimated height before measurement. */
  estimatedHeightPx: z.number().int().min(20).max(2_048).default(60),
  /** Min tooltip width (px). */
  minWidthPx: z.number().int().min(40).max(2_048).default(140),
  /** Max tooltip width (px). */
  maxWidthPx: z.number().int().min(60).max(2_048).default(360),
  /** Background top color (gradient start). */
  backgroundTopColor: z.string().default("rgba(15, 17, 25, 0.96)"),
  /** Background bottom color (gradient end). */
  backgroundBottomColor: z.string().default("rgba(20, 24, 36, 0.96)"),
  /** Border color. */
  borderColor: z.string().default("#3a3f4d"),
  /** Title text color. */
  titleColor: z.string().default("#ffd84d"),
  /** Body text color. */
  bodyColor: z.string().default("#e6e8ec"),
  /** Body font size (px). */
  fontSize: z.number().int().min(8).max(48).default(12),
  /** Title font size (px). */
  titleFontSize: z.number().int().min(8).max(48).default(13),
  /** Tooltip corner radius (px). */
  borderRadiusPx: z.number().int().min(0).max(32).default(4),
  /** Z-index (legacy default: 100000). */
  zIndex: z.number().int().default(100_000),
});

export type CursorTooltipProps = z.infer<typeof cursorTooltipPropsSchema>;

/**
 * Widget definition — registered against the host's UI registry by
 * the meta-plugin's onEnable.
 */
export const cursorTooltipWidget: Widget<CursorTooltipProps> = defineWidget({
  manifest: {
    id: "com.hyperforge.hyperscape.cursor-tooltip",
    name: "Cursor Tooltip",
    category: "overlay",
    defaultSize: { width: 24, height: 12 },
  },
  propsSchema: cursorTooltipPropsSchema,
  defaultProps: {
    visible: false,
    x: 0,
    y: 0,
    title: "",
    body: "",
    cursorOffsetPx: 4,
    estimatedWidthPx: 140,
    estimatedHeightPx: 60,
    minWidthPx: 140,
    maxWidthPx: 360,
    backgroundTopColor: "rgba(15, 17, 25, 0.96)",
    backgroundBottomColor: "rgba(20, 24, 36, 0.96)",
    borderColor: "#3a3f4d",
    titleColor: "#ffd84d",
    bodyColor: "#e6e8ec",
    fontSize: 12,
    titleFontSize: 13,
    borderRadiusPx: 4,
    zIndex: 100_000,
  },
});

/**
 * Compute a viewport-safe `(left, top)` for the tooltip. Tries to
 * place it bottom-right of the cursor first; flips to the opposite
 * side on the axis if it would clip.
 *
 * Exported so hosts can pre-compute the position (e.g., for
 * animation timing) without re-rendering the widget.
 */
export function calculateCursorTooltipPosition(
  cursor: { x: number; y: number },
  size: { width: number; height: number },
  cursorOffset: number,
  viewport: { width: number; height: number } = {
    width: typeof window !== "undefined" ? window.innerWidth : 1920,
    height: typeof window !== "undefined" ? window.innerHeight : 1080,
  },
): { left: number; top: number } {
  let left = cursor.x + cursorOffset;
  let top = cursor.y + cursorOffset;
  if (left + size.width > viewport.width) {
    left = cursor.x - size.width - cursorOffset;
  }
  if (top + size.height > viewport.height) {
    top = cursor.y - size.height - cursorOffset;
  }
  if (left < 0) left = 0;
  if (top < 0) top = 0;
  return { left, top };
}

/**
 * React component. Returns null when `visible` is false. Positioned
 * via `position: fixed`; never blocks pointer events
 * (`pointerEvents: none`).
 */
export function CursorTooltip(
  props: CursorTooltipProps,
): React.ReactElement | null {
  const {
    visible,
    x,
    y,
    title,
    body,
    cursorOffsetPx,
    estimatedWidthPx,
    estimatedHeightPx,
    minWidthPx,
    maxWidthPx,
    backgroundTopColor,
    backgroundBottomColor,
    borderColor,
    titleColor,
    bodyColor,
    fontSize,
    titleFontSize,
    borderRadiusPx,
    zIndex,
  } = props;

  if (!visible) return null;

  const { left, top } = calculateCursorTooltipPosition(
    { x, y },
    { width: estimatedWidthPx, height: estimatedHeightPx },
    cursorOffsetPx,
  );

  return (
    <div
      role="tooltip"
      style={{
        position: "fixed",
        left,
        top,
        zIndex,
        pointerEvents: "none",
        minWidth: minWidthPx,
        maxWidth: maxWidthPx,
        background: `linear-gradient(180deg, ${backgroundTopColor} 0%, ${backgroundBottomColor} 100%)`,
        border: `1px solid ${borderColor}`,
        borderRadius: borderRadiusPx,
        padding: "8px 10px",
        boxShadow: "0 4px 16px rgba(0, 0, 0, 0.5)",
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif",
      }}
    >
      {title && (
        <div
          style={{
            fontSize: titleFontSize,
            fontWeight: 700,
            color: titleColor,
            marginBottom: body ? 4 : 0,
          }}
        >
          {title}
        </div>
      )}
      {body && (
        <div
          style={{
            fontSize,
            color: bodyColor,
            whiteSpace: "pre-wrap",
            lineHeight: 1.4,
          }}
        >
          {body}
        </div>
      )}
    </div>
  );
}

/**
 * Bundled registration — pairs the widget schema with its React
 * renderer.
 */
export const cursorTooltipRegistration: WidgetRegistration<
  CursorTooltipProps,
  React.ComponentType<CursorTooltipProps>
> = {
  widget: cursorTooltipWidget,
  Component: CursorTooltip,
};
