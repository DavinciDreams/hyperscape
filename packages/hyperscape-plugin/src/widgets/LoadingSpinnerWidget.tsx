/**
 * LoadingSpinnerWidget — generic CSS-driven loading spinner primitive.
 *
 * Phase D6.c thirty-first widget migration. New foundational
 * primitive (no single legacy callsite — the codebase currently
 * inlines spinner SVGs and CSS keyframes per use site). Substrate-
 * promote: zero theme-store dependency, all colors as explicit
 * props, configurable size/thickness/duration.
 *
 * Three render variants (driven by `kind`):
 *   - `"ring"`: rotating arc on a ring (default, classic spinner).
 *   - `"dots"`: 3 dots that pulse in sequence.
 *   - `"bar"`: indeterminate bar — for horizontal slot use.
 *
 * Adapter wiring (host responsibility):
 *
 *   ```ts
 *   {isLoading && <LoadingSpinner kind="ring" sizePx={32} />}
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
export const LOADING_SPINNER_KINDS = ["ring", "dots", "bar"] as const;
export type LoadingSpinnerKind = (typeof LOADING_SPINNER_KINDS)[number];

/** Props the widget exposes through its Zod schema. */
export const loadingSpinnerPropsSchema = z.object({
  /** Whether the spinner renders. False → null. */
  visible: z.boolean().default(true),
  /** Render variant. */
  kind: z.enum(LOADING_SPINNER_KINDS).default("ring"),
  /** Pixel size of the spinner footprint. */
  sizePx: z.number().int().min(8).max(256).default(24),
  /** Spin duration in ms (lower = faster). */
  durationMs: z.number().int().min(100).max(10_000).default(900),
  /** Primary spinner color. */
  color: z.string().default("#ffd84d"),
  /** Track color (only used by `ring`). */
  trackColor: z.string().default("rgba(255, 255, 255, 0.12)"),
  /** Stroke width for `ring` (px). */
  strokeWidth: z.number().min(0.5).max(16).default(3),
  /** Optional label rendered below the spinner. */
  label: z.string().default(""),
  /** Label text color. */
  labelColor: z.string().default("#a8aec0"),
  /** Label font size (px). */
  labelFontSize: z.number().int().min(8).max(48).default(12),
});

export type LoadingSpinnerProps = z.infer<typeof loadingSpinnerPropsSchema>;

/**
 * Widget definition — registered against the host's UI registry by
 * the meta-plugin's onEnable.
 */
export const loadingSpinnerWidget: Widget<LoadingSpinnerProps> = defineWidget({
  manifest: {
    id: "com.hyperforge.hyperscape.loading-spinner",
    name: "Loading Spinner",
    category: "panel",
    defaultSize: { width: 4, height: 4 },
  },
  propsSchema: loadingSpinnerPropsSchema,
  defaultProps: {
    visible: true,
    kind: "ring",
    sizePx: 24,
    durationMs: 900,
    color: "#ffd84d",
    trackColor: "rgba(255, 255, 255, 0.12)",
    strokeWidth: 3,
    label: "",
    labelColor: "#a8aec0",
    labelFontSize: 12,
  },
});

const SPIN_KEYFRAMES_NAME = "hf-loading-spinner-rotate";
const PULSE_KEYFRAMES_NAME = "hf-loading-spinner-dot-pulse";
const SLIDE_KEYFRAMES_NAME = "hf-loading-spinner-bar-slide";
const KEYFRAMES = `
@keyframes ${SPIN_KEYFRAMES_NAME} {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
@keyframes ${PULSE_KEYFRAMES_NAME} {
  0%, 80%, 100% { opacity: 0.25; transform: scale(0.8); }
  40%           { opacity: 1;    transform: scale(1.1); }
}
@keyframes ${SLIDE_KEYFRAMES_NAME} {
  0%   { transform: translateX(-100%); }
  100% { transform: translateX(200%); }
}
`;

interface SpinnerVariantProps {
  readonly sizePx: number;
  readonly durationMs: number;
  readonly color: string;
  readonly trackColor: string;
  readonly strokeWidth: number;
}

function RingVariant(props: SpinnerVariantProps): React.ReactElement {
  const { sizePx, durationMs, color, trackColor, strokeWidth } = props;
  const radius = (sizePx - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg
      width={sizePx}
      height={sizePx}
      viewBox={`0 0 ${sizePx} ${sizePx}`}
      style={{
        animation: `${SPIN_KEYFRAMES_NAME} ${durationMs}ms linear infinite`,
      }}
      role="img"
      aria-label="Loading"
    >
      <circle
        cx={sizePx / 2}
        cy={sizePx / 2}
        r={radius}
        fill="none"
        stroke={trackColor}
        strokeWidth={strokeWidth}
      />
      <circle
        cx={sizePx / 2}
        cy={sizePx / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * 0.75}
      />
    </svg>
  );
}

function DotsVariant(props: SpinnerVariantProps): React.ReactElement {
  const { sizePx, durationMs, color } = props;
  const dotSize = Math.max(4, Math.floor(sizePx / 4));
  return (
    <div
      role="img"
      aria-label="Loading"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: dotSize / 2,
        width: sizePx,
        height: sizePx,
      }}
    >
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            width: dotSize,
            height: dotSize,
            background: color,
            borderRadius: "50%",
            animation: `${PULSE_KEYFRAMES_NAME} ${durationMs * 1.4}ms ease-in-out infinite`,
            animationDelay: `${i * (durationMs / 6)}ms`,
          }}
        />
      ))}
    </div>
  );
}

function BarVariant(props: SpinnerVariantProps): React.ReactElement {
  const { sizePx, durationMs, color, trackColor } = props;
  const height = Math.max(2, Math.floor(sizePx / 6));
  return (
    <div
      role="img"
      aria-label="Loading"
      style={{
        position: "relative",
        width: sizePx,
        height,
        background: trackColor,
        borderRadius: height / 2,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "33%",
          height: "100%",
          background: color,
          animation: `${SLIDE_KEYFRAMES_NAME} ${durationMs * 1.6}ms linear infinite`,
        }}
      />
    </div>
  );
}

/**
 * React component. Returns null when `visible` is false. Renders
 * the chosen variant + optional label below.
 */
export function LoadingSpinner(
  props: LoadingSpinnerProps,
): React.ReactElement | null {
  const {
    visible,
    kind,
    sizePx,
    durationMs,
    color,
    trackColor,
    strokeWidth,
    label,
    labelColor,
    labelFontSize,
  } = props;

  if (!visible) return null;

  const variantProps: SpinnerVariantProps = {
    sizePx,
    durationMs,
    color,
    trackColor,
    strokeWidth,
  };

  return (
    <>
      <style>{KEYFRAMES}</style>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: label ? 6 : 0,
          fontFamily:
            "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif",
        }}
      >
        {kind === "ring" && <RingVariant {...variantProps} />}
        {kind === "dots" && <DotsVariant {...variantProps} />}
        {kind === "bar" && <BarVariant {...variantProps} />}
        {label && (
          <span style={{ color: labelColor, fontSize: labelFontSize }}>
            {label}
          </span>
        )}
      </div>
    </>
  );
}

/**
 * Bundled registration — pairs the widget schema with its React
 * renderer.
 */
export const loadingSpinnerRegistration: WidgetRegistration<
  LoadingSpinnerProps,
  React.ComponentType<LoadingSpinnerProps>
> = {
  widget: loadingSpinnerWidget,
  Component: LoadingSpinner as React.ComponentType<LoadingSpinnerProps>,
};
