/**
 * DividerWidget — horizontal/vertical separator with optional
 * centered label.
 *
 * Phase D6.c forty-seventh widget migration. New foundational
 * primitive — every panel-with-sections currently inlines a 1-px
 * `border-bottom`/`border-right` rule, often with a label
 * sandwich pattern ("OR" between two button groups, "Today" / "
 * Yesterday" inside a chat log, etc.). Substrate-promote: zero
 * theme-store dependency, all colors as explicit props.
 *
 * Adapter wiring (host responsibility):
 *
 *   ```ts
 *   <Divider />                           // simple horizontal rule
 *   <Divider orientation="vertical" />   // sibling-divider in flex row
 *   <Divider label="OR" />               // label sandwich
 *   ```
 */

import {
  defineWidget,
  type Widget,
  type WidgetRegistration,
} from "@hyperforge/ui-framework";
import React from "react";
import { z } from "zod";

/** Layout orientation. */
export const DIVIDER_ORIENTATIONS = ["horizontal", "vertical"] as const;
export type DividerOrientation = (typeof DIVIDER_ORIENTATIONS)[number];

/** Line-style — solid / dashed / dotted. */
export const DIVIDER_STYLES = ["solid", "dashed", "dotted"] as const;
export type DividerStyle = (typeof DIVIDER_STYLES)[number];

/** Props the widget exposes through its Zod schema. */
export const dividerPropsSchema = z.object({
  /** Layout direction. */
  orientation: z.enum(DIVIDER_ORIENTATIONS).default("horizontal"),
  /** Optional centered label (only applies to `orientation: "horizontal"`). */
  label: z.string().default(""),
  /** Line style. */
  lineStyle: z.enum(DIVIDER_STYLES).default("solid"),
  /** Line color. */
  lineColor: z.string().default("rgba(255, 255, 255, 0.08)"),
  /** Line thickness (px). */
  thicknessPx: z.number().int().min(1).max(8).default(1),
  /**
   * Outer length / spacing:
   *   - horizontal: `marginYPx` controls vertical gap above/below.
   *   - vertical: `marginXPx` controls horizontal gap left/right.
   */
  marginYPx: z.number().int().min(0).max(64).default(8),
  marginXPx: z.number().int().min(0).max(64).default(0),
  /** Label text color (only used when `label` is set). */
  labelColor: z.string().default("#a8aec0"),
  /** Label font size (px). */
  labelFontSize: z.number().int().min(8).max(48).default(11),
  /** Label letter-spacing (px). */
  labelLetterSpacingPx: z.number().min(-2).max(8).default(0.6),
  /** Whether to uppercase the label. */
  labelUppercase: z.boolean().default(true),
  /** Padding around the label, between the two line segments (px). */
  labelGapPx: z.number().int().min(0).max(48).default(12),
});

export type DividerProps = z.infer<typeof dividerPropsSchema>;

/**
 * Widget definition — registered against the host's UI registry by
 * the meta-plugin's onEnable.
 */
export const dividerWidget: Widget<DividerProps> = defineWidget({
  manifest: {
    id: "com.hyperforge.hyperscape.divider",
    name: "Divider",
    category: "panel",
    defaultSize: { width: 32, height: 2 },
  },
  propsSchema: dividerPropsSchema,
  defaultProps: {
    orientation: "horizontal",
    label: "",
    lineStyle: "solid",
    lineColor: "rgba(255, 255, 255, 0.08)",
    thicknessPx: 1,
    marginYPx: 8,
    marginXPx: 0,
    labelColor: "#a8aec0",
    labelFontSize: 11,
    labelLetterSpacingPx: 0.6,
    labelUppercase: true,
    labelGapPx: 12,
  },
});

/**
 * React component. Renders a styled `<hr>` for the no-label
 * horizontal case (best a11y), a vertical bar for the vertical
 * case, and a label-sandwich `<div>` (with `role="separator"`)
 * for the labeled-horizontal case.
 */
export function Divider(props: DividerProps): React.ReactElement {
  const {
    orientation,
    label,
    lineStyle,
    lineColor,
    thicknessPx,
    marginYPx,
    marginXPx,
    labelColor,
    labelFontSize,
    labelLetterSpacingPx,
    labelUppercase,
    labelGapPx,
  } = props;

  if (orientation === "vertical") {
    return (
      <div
        role="separator"
        aria-orientation="vertical"
        style={{
          width: thicknessPx,
          alignSelf: "stretch",
          minHeight: 12,
          margin: `0 ${marginXPx}px`,
          background: lineStyle === "solid" ? lineColor : "transparent",
          borderLeft:
            lineStyle === "solid"
              ? undefined
              : `${thicknessPx}px ${lineStyle} ${lineColor}`,
        }}
      />
    );
  }

  if (label) {
    const lineStyleCss =
      lineStyle === "solid"
        ? { background: lineColor, height: thicknessPx }
        : {
            height: 0,
            borderTop: `${thicknessPx}px ${lineStyle} ${lineColor}`,
          };
    return (
      <div
        role="separator"
        aria-orientation="horizontal"
        style={{
          display: "flex",
          alignItems: "center",
          gap: labelGapPx,
          margin: `${marginYPx}px ${marginXPx}px`,
          fontFamily:
            "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif",
        }}
      >
        <span style={{ flex: 1, ...lineStyleCss }} />
        <span
          style={{
            color: labelColor,
            fontSize: labelFontSize,
            fontWeight: 600,
            letterSpacing: labelLetterSpacingPx,
            textTransform: labelUppercase ? "uppercase" : undefined,
            lineHeight: 1,
          }}
        >
          {label}
        </span>
        <span style={{ flex: 1, ...lineStyleCss }} />
      </div>
    );
  }

  // Plain horizontal rule — `<hr>` is the most semantic option.
  if (lineStyle === "solid") {
    return (
      <hr
        style={{
          border: "none",
          height: thicknessPx,
          background: lineColor,
          margin: `${marginYPx}px ${marginXPx}px`,
        }}
      />
    );
  }
  return (
    <hr
      style={{
        border: "none",
        borderTop: `${thicknessPx}px ${lineStyle} ${lineColor}`,
        height: 0,
        margin: `${marginYPx}px ${marginXPx}px`,
      }}
    />
  );
}

/**
 * Bundled registration — pairs the widget schema with its React
 * renderer.
 */
export const dividerRegistration: WidgetRegistration<
  DividerProps,
  React.ComponentType<DividerProps>
> = {
  widget: dividerWidget,
  Component: Divider,
};
