/**
 * AlignmentGuidesWidget — full-viewport overlay that renders thin
 * horizontal/vertical guide lines with glow.
 *
 * Phase D6.c twenty-eighth widget migration. Mirrors the legacy
 * hand-coded `AlignmentGuides` (used during window drag in the
 * window manager). Substrate-promote: drops the `useTheme` import
 * and the legacy `edge` + `type` enum machinery. The widget receives
 * a flat `guides` array of `{axis, position, color?}` so hosts can
 * map any guide source to widget input via a thin projection.
 *
 * Adapter wiring (host responsibility):
 *
 *   ```ts
 *   const guides = computeAlignmentGuides(draggedWindow, otherWindows);
 *   const widgetGuides = guides.map((g) => ({
 *     id: `${g.edge}-${g.position}`,
 *     axis: (g.edge === "left" || g.edge === "right" || g.edge === "centerX")
 *       ? "vertical"
 *       : "horizontal",
 *     position: g.position,
 *     color:
 *       g.targetWindowId === "viewport" ? theme.accent
 *       : g.type === "center" ? "#00bcd4"
 *       : "#4CAF50",
 *   }));
 *
 *   <AlignmentGuides guides={widgetGuides} />
 *   ```
 */

import {
  defineWidget,
  type Widget,
  type WidgetRegistration,
} from "@hyperforge/ui-framework";
import React from "react";
import { z } from "zod";

/** Guide line orientation. */
export const ALIGNMENT_GUIDE_AXES = ["horizontal", "vertical"] as const;
export type AlignmentGuideAxis = (typeof ALIGNMENT_GUIDE_AXES)[number];

/** A single guide line. */
export const alignmentGuideSchema = z.object({
  /** Stable id for the React key. */
  id: z.string().min(1),
  /** Orientation. */
  axis: z.enum(ALIGNMENT_GUIDE_AXES).default("vertical"),
  /** Distance from origin in CSS pixels (left for vertical, top for horizontal). */
  position: z.number().default(0),
  /** Per-guide color override. Falls back to `defaultColor`. */
  color: z.string().optional(),
});

export type AlignmentGuide = z.infer<typeof alignmentGuideSchema>;

/** Props the widget exposes through its Zod schema. */
export const alignmentGuidesPropsSchema = z.object({
  /** Active guide lines. Empty array renders null. */
  guides: z.array(alignmentGuideSchema).default(() => []),
  /** Color used when a guide entry has no `color` override. */
  defaultColor: z.string().default("#4CAF50"),
  /** Whether to render the box-shadow glow around each line. */
  glow: z.boolean().default(true),
  /** Line thickness (px). */
  thicknessPx: z.number().int().min(1).max(8).default(2),
  /** Line opacity. */
  opacity: z.number().min(0).max(1).default(0.9),
  /** Z-index for the overlay. */
  zIndex: z.number().int().default(9_998),
});

export type AlignmentGuidesProps = z.infer<typeof alignmentGuidesPropsSchema>;

/**
 * Widget definition — registered against the host's UI registry by
 * the meta-plugin's onEnable.
 */
export const alignmentGuidesWidget: Widget<AlignmentGuidesProps> = defineWidget(
  {
    manifest: {
      id: "com.hyperforge.hyperscape.alignment-guides",
      name: "Alignment Guides",
      category: "debug",
      defaultSize: { width: 96, height: 96 },
    },
    propsSchema: alignmentGuidesPropsSchema,
    defaultProps: {
      guides: [],
      defaultColor: "#4CAF50",
      glow: true,
      thicknessPx: 2,
      opacity: 0.9,
      zIndex: 9_998,
    },
  },
);

/**
 * React component. Returns null when the guide list is empty.
 * Renders a `position: fixed inset: 0` non-interactive overlay
 * with one absolutely-positioned line per guide.
 */
export function AlignmentGuides(
  props: AlignmentGuidesProps,
): React.ReactElement | null {
  const { guides, defaultColor, glow, thicknessPx, opacity, zIndex } = props;

  if (guides.length === 0) return null;

  return (
    <div
      role="presentation"
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex,
      }}
    >
      {guides.map((guide) => {
        const color = guide.color ?? defaultColor;
        const isVertical = guide.axis === "vertical";
        const lineStyle: React.CSSProperties = isVertical
          ? {
              position: "absolute",
              left: guide.position,
              top: 0,
              width: thicknessPx,
              height: "100%",
              backgroundColor: color,
              boxShadow: glow
                ? `0 0 8px ${color}, 0 0 16px ${color}40`
                : undefined,
              opacity,
            }
          : {
              position: "absolute",
              left: 0,
              top: guide.position,
              width: "100%",
              height: thicknessPx,
              backgroundColor: color,
              boxShadow: glow
                ? `0 0 8px ${color}, 0 0 16px ${color}40`
                : undefined,
              opacity,
            };
        return <div key={guide.id} style={lineStyle} />;
      })}
    </div>
  );
}

/**
 * Bundled registration — pairs the widget schema with its React
 * renderer.
 */
export const alignmentGuidesRegistration: WidgetRegistration<
  AlignmentGuidesProps,
  React.ComponentType<AlignmentGuidesProps>
> = {
  widget: alignmentGuidesWidget,
  Component: AlignmentGuides,
};
