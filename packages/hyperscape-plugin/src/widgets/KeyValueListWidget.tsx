/**
 * KeyValueListWidget — generic key/value list display for stats,
 * debug overlays, info readouts, and tooltip body content.
 *
 * Phase D6.c twenty-third widget migration. New primitive (no
 * single legacy callsite — abstracts the recurring "label + value
 * row" pattern seen in StatusBars, GrassDebugPanel, ProfilerOverlay,
 * Stats panels, and many tooltip bodies). Substrate-promote: drops
 * theme-store dependence, exposes all colors as explicit props,
 * uses an optional `monospace` toggle for debug overlays.
 *
 * Adapter wiring (host responsibility):
 *
 *   ```ts
 *   <KeyValueList
 *     title="Combat Stats"
 *     rows={[
 *       { label: "Attack",   value: String(stats.attack) },
 *       { label: "Strength", value: String(stats.strength) },
 *       { label: "Defense",  value: String(stats.defense), color: "#4ade80" },
 *     ]}
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

/** A single row in the list. */
export const keyValueRowSchema = z.object({
  /** Left-side label (e.g., "Attack"). */
  label: z.string().min(1),
  /** Right-side value (already-formatted string). */
  value: z.string().default(""),
  /** Optional per-row value color override. */
  color: z.string().optional(),
  /** When true, the value is rendered bold. */
  bold: z.boolean().default(false),
});

export type KeyValueRow = z.infer<typeof keyValueRowSchema>;

/** Props the widget exposes through its Zod schema. */
export const keyValueListPropsSchema = z.object({
  /** Optional title rendered above the list. */
  title: z.string().default(""),
  /** Row data. */
  rows: z.array(keyValueRowSchema).default(() => []),
  /** Horizontal gap between label and value (px). */
  columnGapPx: z.number().int().min(0).max(64).default(16),
  /** Vertical gap between rows (px). */
  rowGapPx: z.number().int().min(0).max(32).default(4),
  /**
   * Use a monospace font. Defaults to false; set true for debug
   * overlays where column alignment matters.
   */
  monospace: z.boolean().default(false),
  /** Renders a thin divider rule between rows when true. */
  divided: z.boolean().default(false),
  /** Container background. */
  backgroundColor: z.string().default("transparent"),
  /** Optional container border color (ignored when transparent). */
  borderColor: z.string().default("transparent"),
  /** Container corner radius (px). */
  borderRadiusPx: z.number().int().min(0).max(32).default(0),
  /** Container padding (px). */
  paddingPx: z.number().int().min(0).max(64).default(0),
  /** Title text color. */
  titleColor: z.string().default("#ffd84d"),
  /** Label text color. */
  labelColor: z.string().default("#a8aec0"),
  /** Default value text color (overridden by per-row `color`). */
  valueColor: z.string().default("#e6e8ec"),
  /** Divider rule color (only used when `divided: true`). */
  dividerColor: z.string().default("rgba(255, 255, 255, 0.06)"),
  /** Title font size (px). */
  titleFontSize: z.number().int().min(8).max(48).default(13),
  /** Row font size (px). */
  fontSize: z.number().int().min(8).max(48).default(12),
});

export type KeyValueListProps = z.infer<typeof keyValueListPropsSchema>;

/**
 * Widget definition — registered against the host's UI registry by
 * the meta-plugin's onEnable.
 */
export const keyValueListWidget: Widget<KeyValueListProps> = defineWidget({
  manifest: {
    id: "com.hyperforge.hyperscape.key-value-list",
    name: "Key-Value List",
    category: "panel",
    defaultSize: { width: 32, height: 24 },
  },
  propsSchema: keyValueListPropsSchema,
  defaultProps: {
    title: "",
    rows: [],
    columnGapPx: 16,
    rowGapPx: 4,
    monospace: false,
    divided: false,
    backgroundColor: "transparent",
    borderColor: "transparent",
    borderRadiusPx: 0,
    paddingPx: 0,
    titleColor: "#ffd84d",
    labelColor: "#a8aec0",
    valueColor: "#e6e8ec",
    dividerColor: "rgba(255, 255, 255, 0.06)",
    titleFontSize: 13,
    fontSize: 12,
  },
});

const SANS_FONT_FAMILY =
  "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif";
const MONO_FONT_FAMILY =
  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

/**
 * React component. Renders an optional title, then a 2-column flex
 * layout of label/value rows. Per-row color and bold overrides
 * compose with the widget-level defaults.
 */
export function KeyValueList(props: KeyValueListProps): React.ReactElement {
  const {
    title,
    rows,
    columnGapPx,
    rowGapPx,
    monospace,
    divided,
    backgroundColor,
    borderColor,
    borderRadiusPx,
    paddingPx,
    titleColor,
    labelColor,
    valueColor,
    dividerColor,
    titleFontSize,
    fontSize,
  } = props;

  const fontFamily = monospace ? MONO_FONT_FAMILY : SANS_FONT_FAMILY;

  return (
    <div
      style={{
        background: backgroundColor,
        border:
          borderColor && borderColor !== "transparent"
            ? `1px solid ${borderColor}`
            : undefined,
        borderRadius: borderRadiusPx,
        padding: paddingPx,
        fontFamily,
      }}
    >
      {title && (
        <div
          style={{
            fontSize: titleFontSize,
            fontWeight: 700,
            color: titleColor,
            marginBottom: rowGapPx,
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}
        >
          {title}
        </div>
      )}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: rowGapPx,
        }}
      >
        {rows.map((row, i) => (
          <div
            key={`${row.label}-${i}`}
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: columnGapPx,
              fontSize,
              borderBottom:
                divided && i < rows.length - 1
                  ? `1px solid ${dividerColor}`
                  : undefined,
              paddingBottom: divided && i < rows.length - 1 ? rowGapPx : 0,
            }}
          >
            <span style={{ color: labelColor }}>{row.label}</span>
            <span
              style={{
                color: row.color ?? valueColor,
                fontWeight: row.bold ? 700 : 500,
                textAlign: "right",
              }}
            >
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Bundled registration — pairs the widget schema with its React
 * renderer.
 */
export const keyValueListRegistration: WidgetRegistration<
  KeyValueListProps,
  React.ComponentType<KeyValueListProps>
> = {
  widget: keyValueListWidget,
  Component: KeyValueList,
};
