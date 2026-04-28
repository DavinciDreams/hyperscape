/**
 * ToggleSwitchWidget — labeled on/off slider for settings panels.
 *
 * Phase D6.c thirty-second widget migration. New foundational
 * primitive (no single legacy callsite — the codebase inlines
 * toggle styling per use site, typically inside SettingsPanel rows
 * and accessibility/audio surfaces). Substrate-promote: zero
 * theme-store dependency, all colors as explicit props,
 * keyboard-accessible by default.
 *
 * Adapter wiring (host responsibility):
 *
 *   ```ts
 *   <ToggleSwitch
 *     label="Reduced Motion"
 *     description="Reduce animations and transitions"
 *     checked={accessibility.reducedMotion}
 *     onChange={(next) => setReducedMotion(next)}
 *   />
 *   ```
 */

import {
  defineWidget,
  type Widget,
  type WidgetRegistration,
} from "@hyperforge/ui-framework";
import React, { useId } from "react";
import { z } from "zod";

/** Props the widget exposes through its Zod schema. */
export const toggleSwitchPropsSchema = z.object({
  /** Current toggle state. */
  checked: z.boolean().default(false),
  /** When true, the toggle is rendered dimmed and click is suppressed. */
  disabled: z.boolean().default(false),
  /** Optional left-side label. */
  label: z.string().default(""),
  /** Optional sub-label / description below the label. */
  description: z.string().default(""),
  /**
   * Layout of label vs. switch:
   *   - `"row"` (default): label on the left, switch on the right.
   *   - `"stacked"`: label above, switch below.
   */
  orientation: z.enum(["row", "stacked"]).default("row"),
  /** Track width (px). */
  trackWidthPx: z.number().int().min(20).max(120).default(36),
  /** Track height (px). */
  trackHeightPx: z.number().int().min(12).max(48).default(20),
  /** Thumb diameter (px). Falls back to `trackHeight - 4` when 0. */
  thumbSizePx: z.number().int().min(0).max(48).default(0),
  /** Thumb edge inset from the track on each side (px). */
  thumbInsetPx: z.number().int().min(0).max(16).default(2),
  /** Track background when `checked: false`. */
  offTrackColor: z.string().default("rgba(40, 45, 60, 0.85)"),
  /** Track background when `checked: true`. */
  onTrackColor: z.string().default("#4ade80"),
  /** Track border. Empty = no border. */
  trackBorderColor: z.string().default("#3a3f4d"),
  /** Thumb color. */
  thumbColor: z.string().default("#e6e8ec"),
  /** Label text color. */
  labelColor: z.string().default("#e6e8ec"),
  /** Description text color. */
  descriptionColor: z.string().default("#a8aec0"),
  /** Label font size (px). */
  labelFontSize: z.number().int().min(8).max(48).default(13),
  /** Description font size (px). */
  descriptionFontSize: z.number().int().min(8).max(48).default(11),
});

export type ToggleSwitchProps = z.infer<typeof toggleSwitchPropsSchema>;

/** Extended runtime props — callbacks not modeled in the schema. */
export interface ToggleSwitchRuntimeProps extends ToggleSwitchProps {
  /** Called with the new state when the user clicks or presses Space/Enter. */
  readonly onChange?: (checked: boolean) => void;
}

/**
 * Widget definition — registered against the host's UI registry by
 * the meta-plugin's onEnable.
 */
export const toggleSwitchWidget: Widget<ToggleSwitchProps> = defineWidget({
  manifest: {
    id: "com.hyperforge.hyperscape.toggle-switch",
    name: "Toggle Switch",
    category: "panel",
    defaultSize: { width: 24, height: 6 },
  },
  propsSchema: toggleSwitchPropsSchema,
  defaultProps: {
    checked: false,
    disabled: false,
    label: "",
    description: "",
    orientation: "row",
    trackWidthPx: 36,
    trackHeightPx: 20,
    thumbSizePx: 0,
    thumbInsetPx: 2,
    offTrackColor: "rgba(40, 45, 60, 0.85)",
    onTrackColor: "#4ade80",
    trackBorderColor: "#3a3f4d",
    thumbColor: "#e6e8ec",
    labelColor: "#e6e8ec",
    descriptionColor: "#a8aec0",
    labelFontSize: 13,
    descriptionFontSize: 11,
  },
});

/**
 * React component. Click-to-toggle and keyboard-accessible (Space
 * or Enter triggers the same `onChange`). The track grows from
 * left to right; the thumb slides between insets.
 */
export function ToggleSwitch(
  props: ToggleSwitchRuntimeProps,
): React.ReactElement {
  const {
    checked,
    disabled,
    label,
    description,
    orientation,
    trackWidthPx,
    trackHeightPx,
    thumbSizePx,
    thumbInsetPx,
    offTrackColor,
    onTrackColor,
    trackBorderColor,
    thumbColor,
    labelColor,
    descriptionColor,
    labelFontSize,
    descriptionFontSize,
    onChange,
  } = props;

  const reactId = useId();
  const labelId = `${reactId}-label`;
  const descId = `${reactId}-desc`;

  const effectiveThumb =
    thumbSizePx > 0
      ? thumbSizePx
      : Math.max(8, trackHeightPx - thumbInsetPx * 2);
  const thumbTravel = trackWidthPx - effectiveThumb - thumbInsetPx * 2;

  const handleToggle = (): void => {
    if (disabled) return;
    onChange?.(!checked);
  };

  const handleKey = (e: React.KeyboardEvent): void => {
    if (disabled) return;
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      onChange?.(!checked);
    }
  };

  const switchEl = (
    <div
      role="switch"
      tabIndex={disabled ? -1 : 0}
      aria-checked={checked}
      aria-disabled={disabled}
      aria-labelledby={label ? labelId : undefined}
      aria-describedby={description ? descId : undefined}
      onClick={handleToggle}
      onKeyDown={handleKey}
      style={{
        position: "relative",
        width: trackWidthPx,
        height: trackHeightPx,
        background: checked ? onTrackColor : offTrackColor,
        border: trackBorderColor ? `1px solid ${trackBorderColor}` : undefined,
        borderRadius: trackHeightPx / 2,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "background 150ms ease",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: thumbInsetPx,
          left: thumbInsetPx + (checked ? thumbTravel : 0),
          width: effectiveThumb,
          height: effectiveThumb,
          borderRadius: "50%",
          background: thumbColor,
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.3)",
          transition: "left 150ms ease",
        }}
      />
    </div>
  );

  const labelBlock = (label || description) && (
    <div style={{ minWidth: 0 }}>
      {label && (
        <div
          id={labelId}
          style={{
            fontSize: labelFontSize,
            fontWeight: 500,
            color: labelColor,
          }}
        >
          {label}
        </div>
      )}
      {description && (
        <div
          id={descId}
          style={{
            fontSize: descriptionFontSize,
            color: descriptionColor,
            marginTop: 2,
          }}
        >
          {description}
        </div>
      )}
    </div>
  );

  if (orientation === "stacked") {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
          fontFamily:
            "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif",
        }}
      >
        {labelBlock}
        {switchEl}
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif",
      }}
    >
      {labelBlock}
      {switchEl}
    </div>
  );
}

/**
 * Bundled registration — pairs the widget schema with its React
 * renderer.
 */
export const toggleSwitchRegistration: WidgetRegistration<
  ToggleSwitchProps,
  React.ComponentType<ToggleSwitchProps>
> = {
  widget: toggleSwitchWidget,
  Component: ToggleSwitch as React.ComponentType<ToggleSwitchProps>,
};
