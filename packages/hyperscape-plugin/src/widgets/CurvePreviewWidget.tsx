/**
 * CurvePreviewWidget — canvas-based 2D curve visualizer.
 *
 * Phase D6.c twenty-first widget migration. Mirrors the legacy
 * hand-coded `CurvePreview` (used in character/skill template
 * editors to preview a `Curve` object). Substrate-promote: the
 * legacy component imports `Curve` from `@hyperforge/shared` and
 * calls `curve.evaluate(t)` to sample. The widget receives a
 * pre-sampled `samples: number[]` array via props so it has zero
 * shared-package dependency — the host evaluates the curve and
 * passes the result.
 *
 * Adapter wiring (host responsibility):
 *
 *   ```ts
 *   const samples = useMemo(() => {
 *     const out: number[] = [];
 *     const N = 200;
 *     for (let i = 0; i < N; i++) {
 *       const t = (i / (N - 1)) * (xMax - xMin) + xMin;
 *       out.push(curve.evaluate(t));
 *     }
 *     return out;
 *   }, [curve, xMin, xMax]);
 *
 *   <CurvePreview samples={samples} yMin={0} yMax={1} />
 *   ```
 */

import {
  defineWidget,
  type Widget,
  type WidgetRegistration,
} from "@hyperforge/ui-framework";
import React, { useEffect, useRef } from "react";
import { z } from "zod";

/** Props the widget exposes through its Zod schema. */
export const curvePreviewPropsSchema = z.object({
  /**
   * Pre-sampled y values along the x range. The widget linearly
   * interpolates between them across the canvas width.
   */
  samples: z.array(z.number()).default(() => []),
  /** Min y value (used to normalize against canvas height). */
  yMin: z.number().default(0),
  /** Max y value. Must be > `yMin`. */
  yMax: z.number().default(1),
  /** Canvas width (CSS pixels). */
  widthPx: z.number().int().min(40).max(2_048).default(200),
  /** Canvas height (CSS pixels). */
  heightPx: z.number().int().min(20).max(2_048).default(100),
  /** Background color. */
  backgroundColor: z.string().default("#1a1a1a"),
  /** Grid line color (lower-opacity hint marks). */
  gridColor: z.string().default("rgba(255, 255, 255, 0.1)"),
  /** Curve stroke color. */
  lineColor: z.string().default("#00a7ff"),
  /** Curve stroke width. */
  lineWidth: z.number().min(0.5).max(8).default(2),
  /** Number of grid divisions on each axis (4 = legacy default). */
  gridDivisions: z.number().int().min(0).max(16).default(4),
  /** Border color around the canvas frame. */
  borderColor: z.string().default("rgba(255, 255, 255, 0.1)"),
  /** Frame corner radius (px). */
  borderRadiusPx: z.number().int().min(0).max(64).default(4),
});

export type CurvePreviewProps = z.infer<typeof curvePreviewPropsSchema>;

/**
 * Widget definition — registered against the host's UI registry by
 * the meta-plugin's onEnable.
 */
export const curvePreviewWidget: Widget<CurvePreviewProps> = defineWidget({
  manifest: {
    id: "com.hyperforge.hyperscape.curve-preview",
    name: "Curve Preview",
    category: "panel",
    defaultSize: { width: 32, height: 16 },
  },
  propsSchema: curvePreviewPropsSchema,
  defaultProps: {
    samples: [],
    yMin: 0,
    yMax: 1,
    widthPx: 200,
    heightPx: 100,
    backgroundColor: "#1a1a1a",
    gridColor: "rgba(255, 255, 255, 0.1)",
    lineColor: "#00a7ff",
    lineWidth: 2,
    gridDivisions: 4,
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderRadiusPx: 4,
  },
});

/**
 * React component. Renders a `<canvas>` and re-paints it on every
 * relevant prop change. Honors `devicePixelRatio` for crisp lines
 * on hi-dpi displays.
 *
 * `samples.length === 0` renders the background + grid only (no
 * curve), so an empty/uninitialized state still has a visible
 * placeholder.
 */
export function CurvePreview(props: CurvePreviewProps): React.ReactElement {
  const {
    samples,
    yMin,
    yMax,
    widthPx,
    heightPx,
    backgroundColor,
    gridColor,
    lineColor,
    lineWidth,
    gridDivisions,
    borderColor,
    borderRadiusPx,
  } = props;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = widthPx * dpr;
    canvas.height = heightPx * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, widthPx, heightPx);

    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, widthPx, heightPx);

    if (gridDivisions > 0) {
      ctx.strokeStyle = gridColor;
      ctx.lineWidth = 1;
      for (let i = 0; i <= gridDivisions; i++) {
        const x = (i / gridDivisions) * widthPx;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, heightPx);
        ctx.stroke();
      }
      for (let i = 0; i <= gridDivisions; i++) {
        const y = (i / gridDivisions) * heightPx;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(widthPx, y);
        ctx.stroke();
      }
    }

    if (samples.length >= 2 && yMax > yMin) {
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      const range = yMax - yMin;
      for (let x = 0; x < widthPx; x++) {
        const t = x / (widthPx - 1);
        const sampleIdx = t * (samples.length - 1);
        const i0 = Math.floor(sampleIdx);
        const i1 = Math.min(samples.length - 1, i0 + 1);
        const lerp = sampleIdx - i0;
        const y = samples[i0] * (1 - lerp) + samples[i1] * lerp;
        const norm = 1 - (y - yMin) / range;
        const pixelY = Math.max(0, Math.min(heightPx, norm * heightPx));
        if (x === 0) ctx.moveTo(x, pixelY);
        else ctx.lineTo(x, pixelY);
      }
      ctx.stroke();
    }
  }, [
    samples,
    yMin,
    yMax,
    widthPx,
    heightPx,
    backgroundColor,
    gridColor,
    lineColor,
    lineWidth,
    gridDivisions,
  ]);

  return (
    <div
      style={{
        width: widthPx,
        height: heightPx,
        border: `1px solid ${borderColor}`,
        borderRadius: borderRadiusPx,
        overflow: "hidden",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", display: "block" }}
      />
    </div>
  );
}

/**
 * Bundled registration — pairs the widget schema with its React
 * renderer.
 */
export const curvePreviewRegistration: WidgetRegistration<
  CurvePreviewProps,
  React.ComponentType<CurvePreviewProps>
> = {
  widget: curvePreviewWidget,
  Component: CurvePreview,
};
