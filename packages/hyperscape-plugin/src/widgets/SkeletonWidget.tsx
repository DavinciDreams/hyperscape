/**
 * SkeletonWidget — placeholder block with shimmer animation,
 * shown while data loads.
 *
 * Phase D6.c forty-eighth widget migration. New foundational
 * primitive — every panel that loads data asynchronously typically
 * shows a "loading row" or "loading card" before the real data
 * arrives. The codebase currently inlines `background: #222;
 * animation: pulse 1.5s ...` per use site. Substrate-promote: zero
 * theme-store dependency, all colors as explicit props.
 *
 * Adapter wiring (host responsibility):
 *
 *   ```ts
 *   {loading ? (
 *     <>
 *       <Skeleton width={120} height={16} />
 *       <Skeleton width={200} height={12} />
 *       <Skeleton width={80}  height={12} />
 *     </>
 *   ) : <ActualContent />}
 *   ```
 */

import {
  defineWidget,
  type Widget,
  type WidgetRegistration,
} from "@hyperforge/ui-framework";
import React from "react";
import { z } from "zod";

/** Animation styles. */
export const SKELETON_ANIMATIONS = ["pulse", "shimmer", "none"] as const;
export type SkeletonAnimation = (typeof SKELETON_ANIMATIONS)[number];

/** Block shape presets. */
export const SKELETON_SHAPES = ["rect", "circle", "rounded"] as const;
export type SkeletonShape = (typeof SKELETON_SHAPES)[number];

/** Props the widget exposes through its Zod schema. */
export const skeletonPropsSchema = z.object({
  /** Width — number of CSS pixels OR a CSS length string ("100%", "12em"). */
  width: z
    .union([z.number().int().min(0).max(8_192), z.string().min(1)])
    .default(120),
  /** Height — number of CSS pixels OR a CSS length string. */
  height: z
    .union([z.number().int().min(0).max(8_192), z.string().min(1)])
    .default(16),
  /** Block shape. */
  shape: z.enum(SKELETON_SHAPES).default("rect"),
  /** Animation style. */
  animation: z.enum(SKELETON_ANIMATIONS).default("pulse"),
  /** Animation duration (ms). */
  animationDurationMs: z.number().int().min(100).max(10_000).default(1_500),
  /** Base block color. */
  backgroundColor: z.string().default("rgba(40, 45, 60, 0.85)"),
  /** Highlight color (used by `shimmer`). */
  shimmerColor: z.string().default("rgba(255, 255, 255, 0.06)"),
  /** Min/max opacity for `pulse` animation. */
  pulseMinOpacity: z.number().min(0).max(1).default(0.5),
  pulseMaxOpacity: z.number().min(0).max(1).default(1),
  /** Corner radius for `rounded` shape (px). Ignored by rect/circle. */
  roundedRadiusPx: z.number().int().min(0).max(64).default(8),
});

export type SkeletonProps = z.infer<typeof skeletonPropsSchema>;

/**
 * Widget definition — registered against the host's UI registry by
 * the meta-plugin's onEnable.
 */
export const skeletonWidget: Widget<SkeletonProps> = defineWidget({
  manifest: {
    id: "com.hyperforge.hyperscape.skeleton",
    name: "Skeleton",
    category: "panel",
    defaultSize: { width: 24, height: 4 },
  },
  propsSchema: skeletonPropsSchema,
  defaultProps: {
    width: 120,
    height: 16,
    shape: "rect",
    animation: "pulse",
    animationDurationMs: 1_500,
    backgroundColor: "rgba(40, 45, 60, 0.85)",
    shimmerColor: "rgba(255, 255, 255, 0.06)",
    pulseMinOpacity: 0.5,
    pulseMaxOpacity: 1,
    roundedRadiusPx: 8,
  },
});

const PULSE_ANIM = "hf-skeleton-pulse";
const SHIMMER_ANIM = "hf-skeleton-shimmer";

/** Resolve a width/height value to a valid CSS length. */
function toCssLength(v: number | string): string {
  return typeof v === "number" ? `${v}px` : v;
}

/**
 * React component. Renders a single block with the chosen shape +
 * animation. The animation keyframes are inlined via a `<style>`
 * tag, scoped to unique animation names so the widget composes
 * cleanly with the rest of the app.
 */
export function Skeleton(props: SkeletonProps): React.ReactElement {
  const {
    width,
    height,
    shape,
    animation,
    animationDurationMs,
    backgroundColor,
    shimmerColor,
    pulseMinOpacity,
    pulseMaxOpacity,
    roundedRadiusPx,
  } = props;

  const widthCss = toCssLength(width);
  const heightCss = toCssLength(height);

  const radius =
    shape === "circle" ? "50%" : shape === "rounded" ? roundedRadiusPx : 4;

  const keyframes =
    animation === "pulse"
      ? `
@keyframes ${PULSE_ANIM} {
  0%, 100% { opacity: ${pulseMaxOpacity}; }
  50%      { opacity: ${pulseMinOpacity}; }
}
`
      : animation === "shimmer"
        ? `
@keyframes ${SHIMMER_ANIM} {
  0%   { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
`
        : "";

  const animatedStyle: React.CSSProperties =
    animation === "pulse"
      ? {
          background: backgroundColor,
          animation: `${PULSE_ANIM} ${animationDurationMs}ms ease-in-out infinite`,
        }
      : animation === "shimmer"
        ? {
            background: `linear-gradient(90deg, ${backgroundColor} 0%, ${shimmerColor} 50%, ${backgroundColor} 100%)`,
            backgroundSize: "200% 100%",
            animation: `${SHIMMER_ANIM} ${animationDurationMs}ms linear infinite`,
          }
        : { background: backgroundColor };

  return (
    <>
      {animation !== "none" && <style>{keyframes}</style>}
      <div
        role="presentation"
        aria-hidden="true"
        style={{
          width: widthCss,
          height: heightCss,
          borderRadius: radius,
          flexShrink: 0,
          ...animatedStyle,
        }}
      />
    </>
  );
}

/**
 * Bundled registration — pairs the widget schema with its React
 * renderer.
 */
export const skeletonRegistration: WidgetRegistration<
  SkeletonProps,
  React.ComponentType<SkeletonProps>
> = {
  widget: skeletonWidget,
  Component: Skeleton,
};
