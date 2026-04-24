/**
 * CrosshairWidget — the shooter-demo's visible proof-of-composition.
 *
 * When the editor user picks "Shooter Demo" in the toolbar game
 * selector and hits Play, the plugin's onEnable walks `ctx.widgets`
 * (host-provided) and registers this widget on the process-wide
 * UI registry. The editor's ManifestRenderer then mounts the
 * component wherever the active layout positions it.
 *
 * Under "Hyperscape" the widget is never registered — so the
 * crosshair is absent. That's the visual tell that the game-plugin
 * set actually drives what the user sees, not just what's in
 * memory.
 *
 * Deliberately minimal: pure SVG, no state, no external deps beyond
 * React + the ui-framework's `defineWidget` schema authoring.
 */

import {
  defineWidget,
  type Widget,
  type WidgetRegistration,
} from "@hyperforge/ui-framework";
import React from "react";
import { z } from "zod";

/** Props the crosshair widget exposes through its Zod schema. */
export const crosshairPropsSchema = z.object({
  size: z.number().min(4).max(128).default(32),
  color: z.string().default("#7ef7b3"),
  thickness: z.number().min(1).max(8).default(2),
});

type CrosshairProps = z.infer<typeof crosshairPropsSchema>;

/**
 * Widget schema. `defineWidget` validates the manifest + default
 * props at import time so malformed authoring fails at `bun build`,
 * not at host registration.
 */
export const crosshairWidget: Widget<CrosshairProps> = defineWidget({
  manifest: {
    id: "com.hyperforge.shooter-demo.crosshair",
    name: "Crosshair",
    category: "hud",
    defaultSize: { width: 2, height: 2 },
  },
  propsSchema: crosshairPropsSchema,
  defaultProps: { size: 32, color: "#7ef7b3", thickness: 2 },
});

/**
 * React component. Renders a centered crosshair using two SVG lines
 * + a small gap in the middle. Sized by props; positioned by the
 * host layout (anchor: center).
 */
export function Crosshair(props: CrosshairProps): React.ReactElement {
  const { size, color, thickness } = props;
  const half = size / 2;
  const gap = Math.max(2, size / 8);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ pointerEvents: "none" }}
      aria-label="Crosshair"
    >
      {/* Horizontal line (left half + right half with center gap) */}
      <line
        x1={0}
        y1={half}
        x2={half - gap}
        y2={half}
        stroke={color}
        strokeWidth={thickness}
        strokeLinecap="round"
      />
      <line
        x1={half + gap}
        y1={half}
        x2={size}
        y2={half}
        stroke={color}
        strokeWidth={thickness}
        strokeLinecap="round"
      />
      {/* Vertical line (top half + bottom half with center gap) */}
      <line
        x1={half}
        y1={0}
        x2={half}
        y2={half - gap}
        stroke={color}
        strokeWidth={thickness}
        strokeLinecap="round"
      />
      <line
        x1={half}
        y1={half + gap}
        x2={half}
        y2={size}
        stroke={color}
        strokeWidth={thickness}
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Bundled registration — pairs the widget schema with its React
 * renderer. The plugin's `onEnable` passes this to the host's
 * `ctx.widgets.register(...)` adapter.
 */
export const crosshairRegistration: WidgetRegistration<
  CrosshairProps,
  React.ComponentType<CrosshairProps>
> = {
  widget: crosshairWidget,
  Component: Crosshair,
};
