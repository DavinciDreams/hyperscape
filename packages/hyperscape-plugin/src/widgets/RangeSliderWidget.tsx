/**
 * RangeSliderWidget — labeled numeric slider for settings panels.
 *
 * Phase D6.c thirty-third widget migration. New foundational
 * primitive (no single legacy callsite — the codebase inlines
 * native `<input type="range">` styling per use site, typically
 * inside SettingsPanel rows for volume / sensitivity / brightness
 * controls). Substrate-promote: zero theme-store dependency, all
 * colors as explicit props, keyboard-accessible by default
 * (native `<input type="range">` semantics).
 *
 * Adapter wiring (host responsibility):
 *
 *   ```ts
 *   <RangeSlider
 *     label="Master Volume"
 *     value={settings.masterVolume}
 *     min={0}
 *     max={1}
 *     step={0.01}
 *     formatValue={(v) => `${Math.round(v * 100)}%`}
 *     onChange={(next) => setMasterVolume(next)}
 *   />
 *   ```
 */

import {
  defineWidget,
  type Widget,
  type WidgetRegistration,
} from "@hyperforge/ui-framework";
import React, { useId, useMemo } from "react";
import { z } from "zod";

/** Props the widget exposes through its Zod schema. */
export const rangeSliderPropsSchema = z.object({
  /** Current value. */
  value: z.number().default(0),
  /** Minimum value (inclusive). */
  min: z.number().default(0),
  /** Maximum value (inclusive). Must be > `min`. */
  max: z.number().default(100),
  /** Step granularity. */
  step: z.number().min(0).default(1),
  /** Whether the slider is disabled. */
  disabled: z.boolean().default(false),
  /** Optional label rendered above the slider. */
  label: z.string().default(""),
  /** Optional description below the label. */
  description: z.string().default(""),
  /**
   * When true, render `value` as text on the right of the label
   * row. Format via the `valueSuffix` prop (e.g., "%", "px").
   */
  showValue: z.boolean().default(true),
  /** Suffix appended to the value readout. */
  valueSuffix: z.string().default(""),
  /** Track height (px). */
  trackHeightPx: z.number().int().min(2).max(32).default(6),
  /** Thumb diameter (px). */
  thumbSizePx: z.number().int().min(8).max(48).default(16),
  /** Track background (unfilled portion). */
  trackColor: z.string().default("rgba(40, 45, 60, 0.85)"),
  /** Filled portion color (left of thumb). */
  fillColor: z.string().default("#4ade80"),
  /** Thumb color. */
  thumbColor: z.string().default("#e6e8ec"),
  /** Thumb border color. */
  thumbBorderColor: z.string().default("rgba(0, 0, 0, 0.3)"),
  /** Label text color. */
  labelColor: z.string().default("#e6e8ec"),
  /** Description text color. */
  descriptionColor: z.string().default("#a8aec0"),
  /** Value-readout text color. */
  valueColor: z.string().default("#ffd84d"),
  /** Label font size (px). */
  labelFontSize: z.number().int().min(8).max(48).default(13),
  /** Description font size (px). */
  descriptionFontSize: z.number().int().min(8).max(48).default(11),
  /** Value-readout font size (px). */
  valueFontSize: z.number().int().min(8).max(48).default(13),
});

export type RangeSliderProps = z.infer<typeof rangeSliderPropsSchema>;

/** Extended runtime props — callbacks not modeled in the schema. */
export interface RangeSliderRuntimeProps extends RangeSliderProps {
  /** Called whenever the value changes (drag, keyboard, click). */
  readonly onChange?: (value: number) => void;
  /**
   * Optional value formatter. When provided, replaces the default
   * `${value}${valueSuffix}` rendering for the readout.
   */
  readonly formatValue?: (value: number) => string;
}

/**
 * Widget definition — registered against the host's UI registry by
 * the meta-plugin's onEnable.
 */
export const rangeSliderWidget: Widget<RangeSliderProps> = defineWidget({
  manifest: {
    id: "com.hyperforge.hyperscape.range-slider",
    name: "Range Slider",
    category: "panel",
    defaultSize: { width: 32, height: 6 },
  },
  propsSchema: rangeSliderPropsSchema,
  defaultProps: {
    value: 0,
    min: 0,
    max: 100,
    step: 1,
    disabled: false,
    label: "",
    description: "",
    showValue: true,
    valueSuffix: "",
    trackHeightPx: 6,
    thumbSizePx: 16,
    trackColor: "rgba(40, 45, 60, 0.85)",
    fillColor: "#4ade80",
    thumbColor: "#e6e8ec",
    thumbBorderColor: "rgba(0, 0, 0, 0.3)",
    labelColor: "#e6e8ec",
    descriptionColor: "#a8aec0",
    valueColor: "#ffd84d",
    labelFontSize: 13,
    descriptionFontSize: 11,
    valueFontSize: 13,
  },
});

/**
 * Compute the fill percentage for the visual track based on value
 * relative to the [min, max] range. Clamps to [0, 100].
 */
export function computeRangeFillPercent(
  value: number,
  min: number,
  max: number,
): number {
  if (max <= min) return 0;
  const pct = ((value - min) / (max - min)) * 100;
  return Math.max(0, Math.min(100, pct));
}

/**
 * React component. Wraps a native `<input type="range">` for
 * keyboard accessibility (arrow keys, Home/End, PageUp/PageDown
 * are handled by the browser) and overlays a custom track + fill
 * rendered behind the native control.
 */
export function RangeSlider(
  props: RangeSliderRuntimeProps,
): React.ReactElement {
  const {
    value,
    min,
    max,
    step,
    disabled,
    label,
    description,
    showValue,
    valueSuffix,
    trackHeightPx,
    thumbSizePx,
    trackColor,
    fillColor,
    labelColor,
    descriptionColor,
    valueColor,
    labelFontSize,
    descriptionFontSize,
    valueFontSize,
    onChange,
    formatValue,
  } = props;

  const reactId = useId();
  const labelId = `${reactId}-label`;
  const descId = `${reactId}-desc`;

  const fillPct = useMemo(
    () => computeRangeFillPercent(value, min, max),
    [value, min, max],
  );

  const formatted = formatValue ? formatValue(value) : `${value}${valueSuffix}`;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {(label || (showValue && !description)) && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
          }}
        >
          {label && (
            <span
              id={labelId}
              style={{
                fontSize: labelFontSize,
                fontWeight: 500,
                color: labelColor,
              }}
            >
              {label}
            </span>
          )}
          {showValue && (
            <span
              style={{
                fontSize: valueFontSize,
                color: valueColor,
                fontWeight: 600,
              }}
            >
              {formatted}
            </span>
          )}
        </div>
      )}
      {description && (
        <span
          id={descId}
          style={{
            fontSize: descriptionFontSize,
            color: descriptionColor,
          }}
        >
          {description}
        </span>
      )}
      <div
        style={{
          position: "relative",
          height: thumbSizePx,
          display: "flex",
          alignItems: "center",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: "50%",
            transform: "translateY(-50%)",
            height: trackHeightPx,
            background: trackColor,
            borderRadius: trackHeightPx / 2,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${fillPct}%`,
              height: "100%",
              background: fillColor,
              transition: "width 100ms linear",
            }}
          />
        </div>
        <input
          type="range"
          value={value}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          aria-labelledby={label ? labelId : undefined}
          aria-describedby={description ? descId : undefined}
          aria-valuetext={formatted}
          onChange={(e) => onChange?.(parseFloat(e.target.value))}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            margin: 0,
            opacity: 0,
            cursor: disabled ? "not-allowed" : "pointer",
          }}
        />
        {/* Visual thumb (sibling to the invisible native input above) */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            left: `calc(${fillPct}% - ${thumbSizePx / 2}px)`,
            top: "50%",
            transform: "translateY(-50%)",
            width: thumbSizePx,
            height: thumbSizePx,
            borderRadius: "50%",
            background: props.thumbColor,
            border: `1px solid ${props.thumbBorderColor}`,
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.3)",
            pointerEvents: "none",
            transition: "left 100ms linear",
          }}
        />
      </div>
    </div>
  );
}

/**
 * Bundled registration — pairs the widget schema with its React
 * renderer.
 */
export const rangeSliderRegistration: WidgetRegistration<
  RangeSliderProps,
  React.ComponentType<RangeSliderProps>
> = {
  widget: rangeSliderWidget,
  Component: RangeSlider as React.ComponentType<RangeSliderProps>,
};
