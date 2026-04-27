/**
 * MinimapCompassWidget — circular compass display showing camera
 * yaw with a rotating "N" indicator. Click to toggle the minimap.
 *
 * Phase D6.c third non-overlay HUD migration. Mirrors the existing
 * hand-coded `MinimapCompass`. Substrate-promote: the legacy compass
 * polls `world.camera.getWorldDirection()` every animation frame to
 * read the current yaw; the widget receives the yaw value through a
 * typed prop instead, so the host adapter owns the RAF lifecycle.
 *
 * Three size presets (compact / small / normal) preserved as a Zod
 * enum. Each preset bundles a coordinated size + inner-size +
 * fontSize + borderWidth, mirroring the legacy SIZE_CONFIG.
 *
 * Adapter wiring (host responsibility):
 *
 *   ```ts
 *   useEffect(() => {
 *     let raf = 0;
 *     const tmp = new THREE.Vector3();
 *     const loop = () => {
 *       if (world.camera) {
 *         world.camera.getWorldDirection(tmp);
 *         tmp.y = 0;
 *         if (tmp.lengthSq() > 1e-6) {
 *           tmp.normalize();
 *           const yaw = Math.atan2(tmp.x, -tmp.z);
 *           setYawDeg(THREE.MathUtils.radToDeg(yaw));
 *         }
 *       }
 *       raf = requestAnimationFrame(loop);
 *     };
 *     raf = requestAnimationFrame(loop);
 *     return () => cancelAnimationFrame(raf);
 *   }, [world]);
 *   ```
 */

import {
  defineWidget,
  type Widget,
  type WidgetRegistration,
} from "@hyperforge/ui-framework";
import React, { useState } from "react";
import { z } from "zod";

/** Size presets — matches the legacy SIZE_CONFIG. */
export const COMPASS_SIZES = ["compact", "small", "normal"] as const;
export type CompassSize = (typeof COMPASS_SIZES)[number];

interface SizeConfig {
  readonly size: number;
  readonly innerSize: number;
  readonly fontSize: number;
  readonly borderWidth: number;
  readonly hoverScale: number;
}

const SIZE_CONFIG: Readonly<Record<CompassSize, SizeConfig>> = {
  compact: {
    size: 30,
    innerSize: 18,
    fontSize: 8,
    borderWidth: 2,
    hoverScale: 1.1,
  },
  small: {
    size: 38,
    innerSize: 24,
    fontSize: 10,
    borderWidth: 2,
    hoverScale: 1.1,
  },
  normal: {
    size: 44,
    innerSize: 28,
    fontSize: 11,
    borderWidth: 3,
    hoverScale: 1.1,
  },
};

/** Props the widget exposes through its Zod schema. */
export const minimapCompassPropsSchema = z.object({
  /** Current camera yaw in degrees (0 = north). */
  yawDeg: z.number().default(0),
  /** Whether the minimap is currently collapsed (affects tooltip text). */
  isCollapsed: z.boolean().default(false),
  /** Size variant — matches MenuButton sizing presets. */
  size: z.enum(COMPASS_SIZES).default("normal"),
  /** Outer ring background color. */
  backgroundColor: z.string().default("#0b0d12"),
  /** Default border color. */
  borderColor: z.string().default("#3a3f4d"),
  /** Hover border color (theme accent). */
  hoverBorderColor: z.string().default("#ffd84d"),
  /** Inner ring stroke (around the rotating compass face). */
  innerRingColor: z.string().default("rgba(255, 255, 255, 0.5)"),
  /** "N" indicator color (danger/red by default). */
  northColor: z.string().default("#ef4444"),
});

export type MinimapCompassProps = z.infer<typeof minimapCompassPropsSchema>;

/**
 * Extended runtime props — `onClick` is a callback prop, not Zod-able.
 * Hosts wire it to the minimap-collapse toggle. If omitted, the
 * compass is purely display-only.
 */
export interface MinimapCompassRuntimeProps extends MinimapCompassProps {
  readonly onClick?: () => void;
}

/**
 * Widget definition — registered against the host's UI registry by
 * the meta-plugin's onEnable.
 */
export const minimapCompassWidget: Widget<MinimapCompassProps> = defineWidget({
  manifest: {
    id: "com.hyperforge.hyperscape.minimap-compass",
    name: "Minimap Compass",
    category: "hud",
    defaultSize: { width: 4, height: 4 },
  },
  propsSchema: minimapCompassPropsSchema,
  defaultProps: {
    yawDeg: 0,
    isCollapsed: false,
    size: "normal",
    backgroundColor: "#0b0d12",
    borderColor: "#3a3f4d",
    hoverBorderColor: "#ffd84d",
    innerRingColor: "rgba(255, 255, 255, 0.5)",
    northColor: "#ef4444",
  },
});

/**
 * React component. Pure display + click-to-toggle. Yaw flows through
 * `yawDeg` prop from a host-side adapter; the widget doesn't read
 * the camera, doesn't run a RAF loop.
 */
export function MinimapCompass(
  props: MinimapCompassRuntimeProps,
): React.ReactElement {
  const {
    yawDeg,
    isCollapsed,
    size,
    backgroundColor,
    borderColor,
    hoverBorderColor,
    innerRingColor,
    northColor,
    onClick,
  } = props;

  const [isHovered, setIsHovered] = useState(false);
  const config = SIZE_CONFIG[size];

  const stop = (e: React.SyntheticEvent): void => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div
      role="button"
      aria-label={isCollapsed ? "Show minimap" : "Hide minimap"}
      tabIndex={onClick ? 0 : -1}
      onClick={(e) => {
        stop(e);
        onClick?.();
      }}
      onMouseDown={stop}
      onContextMenu={stop}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        width: config.size,
        height: config.size,
        borderRadius: "50%",
        border: `${config.borderWidth}px solid ${
          isHovered ? hoverBorderColor : borderColor
        }`,
        background: backgroundColor,
        boxShadow:
          "0 4px 12px rgba(0, 0, 0, 0.6), inset 0 0 4px rgba(0, 0, 0, 0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: onClick ? "pointer" : "default",
        position: "relative",
        flexShrink: 0,
        transition: "all 200ms ease-out",
        transform: isHovered ? `scale(${config.hoverScale})` : "scale(1)",
      }}
      title={isCollapsed ? "Show minimap" : "Hide minimap"}
    >
      <div
        style={{
          position: "relative",
          width: config.innerSize,
          height: config.innerSize,
          pointerEvents: "none",
          transform: `rotate(${yawDeg}deg)`,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            border: `1px solid ${innerRingColor}`,
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: 1,
            transform: "translateX(-50%)",
            fontSize: config.fontSize,
            color: northColor,
            fontWeight: 600,
            textShadow: "0 1px 1px rgba(0, 0, 0, 0.8)",
            pointerEvents: "none",
          }}
        >
          N
        </div>
      </div>
    </div>
  );
}

/**
 * Bundled registration — pairs the widget schema with its React
 * renderer. The plugin's `onEnable` passes this to
 * `ctx.widgets.register(...)`.
 */
export const minimapCompassRegistration: WidgetRegistration<
  MinimapCompassProps,
  React.ComponentType<MinimapCompassProps>
> = {
  widget: minimapCompassWidget,
  Component: MinimapCompass as React.ComponentType<MinimapCompassProps>,
};
