/**
 * ProgressBarWidget — generic linear progress bar primitive with
 * optional label and percentage readout.
 *
 * Phase D6.c thirtieth widget migration. New foundational primitive
 * (no single legacy callsite — distilled from the recurring "filled
 * track" pattern seen in LoadingScreen, StatusBars HP/MP rows,
 * SkillingPanel progress, AchievementProgress, etc.). Substrate-
 * promote: zero theme-store dependency, all colors as explicit
 * props, optional indeterminate-stripe animation for "still
 * working" states.
 *
 * Adapter wiring (host responsibility):
 *
 *   ```ts
 *   <ProgressBar
 *     progress={loadingState.progress}
 *     label={loadingState.stage}
 *     showPercent
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

/** Orientation. */
export const PROGRESS_BAR_ORIENTATIONS = ["horizontal", "vertical"] as const;
export type ProgressBarOrientation = (typeof PROGRESS_BAR_ORIENTATIONS)[number];

/** Props the widget exposes through its Zod schema. */
export const progressBarPropsSchema = z.object({
  /** Progress value in [0, 1]. Clamped at render time. */
  progress: z.number().min(0).max(1).default(0),
  /** Optional label rendered next to or above the bar. */
  label: z.string().default(""),
  /** Render the `Math.round(progress * 100)%` readout. */
  showPercent: z.boolean().default(false),
  /**
   * `true` ignores `progress` and renders a moving stripe — for
   * "still working but no measurable progress" states.
   */
  indeterminate: z.boolean().default(false),
  /** Layout direction. Vertical fills bottom-up. */
  orientation: z.enum(PROGRESS_BAR_ORIENTATIONS).default("horizontal"),
  /** Bar height (horizontal) / width (vertical). */
  thicknessPx: z.number().int().min(2).max(64).default(8),
  /** Bar length (horizontal width / vertical height). 0 = stretch to container. */
  lengthPx: z.number().int().min(0).max(2_048).default(0),
  /** Track (unfilled) color. */
  trackColor: z.string().default("rgba(40, 45, 60, 0.85)"),
  /** Fill color. */
  fillColor: z.string().default("#4ade80"),
  /** Border color. Empty string = no border. */
  borderColor: z.string().default(""),
  /** Corner radius (px). */
  borderRadiusPx: z.number().int().min(0).max(32).default(4),
  /** Label text color. */
  labelColor: z.string().default("#a8aec0"),
  /** Percentage text color. */
  percentColor: z.string().default("#e6e8ec"),
  /** Label/percent font size (px). */
  fontSize: z.number().int().min(8).max(48).default(12),
  /** Indeterminate stripe animation duration in ms. */
  indeterminateDurationMs: z.number().int().min(200).max(10_000).default(1_500),
});

export type ProgressBarProps = z.infer<typeof progressBarPropsSchema>;

/**
 * Widget definition — registered against the host's UI registry by
 * the meta-plugin's onEnable.
 */
export const progressBarWidget: Widget<ProgressBarProps> = defineWidget({
  manifest: {
    id: "com.hyperforge.hyperscape.progress-bar",
    name: "Progress Bar",
    category: "panel",
    defaultSize: { width: 32, height: 4 },
  },
  propsSchema: progressBarPropsSchema,
  defaultProps: {
    progress: 0,
    label: "",
    showPercent: false,
    indeterminate: false,
    orientation: "horizontal",
    thicknessPx: 8,
    lengthPx: 0,
    trackColor: "rgba(40, 45, 60, 0.85)",
    fillColor: "#4ade80",
    borderColor: "",
    borderRadiusPx: 4,
    labelColor: "#a8aec0",
    percentColor: "#e6e8ec",
    fontSize: 12,
    indeterminateDurationMs: 1_500,
  },
});

const SLIDE_KEYFRAMES_NAME = "hf-progress-bar-indeterminate-slide";
const SLIDE_KEYFRAMES = `
@keyframes ${SLIDE_KEYFRAMES_NAME} {
  0%   { transform: translateX(-100%); }
  100% { transform: translateX(200%); }
}
`;

/**
 * Clamp the input to [0, 1] for safety even though Zod already
 * validates the schema — runtime callers can pass through the
 * runtime props interface and skip validation.
 */
function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * React component. Renders a track + fill + optional label/percent
 * row. When `indeterminate` is true, the fill is replaced with a
 * sliding stripe that loops continuously.
 */
export function ProgressBar(props: ProgressBarProps): React.ReactElement {
  const {
    progress,
    label,
    showPercent,
    indeterminate,
    orientation,
    thicknessPx,
    lengthPx,
    trackColor,
    fillColor,
    borderColor,
    borderRadiusPx,
    labelColor,
    percentColor,
    fontSize,
    indeterminateDurationMs,
  } = props;

  const clamped = clamp01(progress);
  const percent = Math.round(clamped * 100);
  const isHorizontal = orientation === "horizontal";

  const trackStyle: React.CSSProperties = {
    position: "relative",
    background: trackColor,
    border: borderColor ? `1px solid ${borderColor}` : undefined,
    borderRadius: borderRadiusPx,
    overflow: "hidden",
    width: isHorizontal ? (lengthPx > 0 ? lengthPx : "100%") : thicknessPx,
    height: isHorizontal ? thicknessPx : lengthPx > 0 ? lengthPx : "100%",
  };

  const fillStyle: React.CSSProperties = isHorizontal
    ? {
        height: "100%",
        width: `${clamped * 100}%`,
        background: fillColor,
        transition: indeterminate ? "none" : "width 200ms ease-out",
      }
    : {
        width: "100%",
        height: `${clamped * 100}%`,
        position: "absolute",
        bottom: 0,
        left: 0,
        background: fillColor,
        transition: indeterminate ? "none" : "height 200ms ease-out",
      };

  const indeterminateStyle: React.CSSProperties = {
    position: "absolute",
    top: 0,
    left: 0,
    width: "33%",
    height: "100%",
    background: fillColor,
    animation: `${SLIDE_KEYFRAMES_NAME} ${indeterminateDurationMs}ms linear infinite`,
  };

  return (
    <>
      {indeterminate && <style>{SLIDE_KEYFRAMES}</style>}
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={indeterminate ? undefined : percent}
        aria-label={label || undefined}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: label || showPercent ? 4 : 0,
          fontFamily:
            "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif",
        }}
      >
        {(label || showPercent) && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              fontSize,
            }}
          >
            <span style={{ color: labelColor }}>{label}</span>
            {showPercent && !indeterminate && (
              <span style={{ color: percentColor, fontWeight: 600 }}>
                {percent}%
              </span>
            )}
          </div>
        )}
        <div style={trackStyle}>
          {indeterminate ? (
            <div style={indeterminateStyle} />
          ) : (
            <div style={fillStyle} />
          )}
        </div>
      </div>
    </>
  );
}

/**
 * Bundled registration — pairs the widget schema with its React
 * renderer.
 */
export const progressBarRegistration: WidgetRegistration<
  ProgressBarProps,
  React.ComponentType<ProgressBarProps>
> = {
  widget: progressBarWidget,
  Component: ProgressBar,
};
