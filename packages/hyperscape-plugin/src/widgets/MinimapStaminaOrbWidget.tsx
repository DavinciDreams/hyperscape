/**
 * MinimapStaminaOrbWidget — circular stamina orb for the minimap
 * area. Click to toggle between run and walk modes.
 *
 * Phase D6.c second non-overlay HUD migration. Mirrors the existing
 * hand-coded `MinimapStaminaOrb`. Substrate-promote: the legacy
 * orb polls `world.entities.player` every 200ms, mutates
 * `player.runMode` directly, and sends a `moveRequest` packet
 * from a click handler. The widget receives the same state through
 * typed props and exposes `onToggleRunMode` as an opt-in callback.
 *
 * SVG rendering (gradient + clipped fill + border ring + glass
 * highlight) is preserved verbatim — same visual identity as the
 * legacy orb.
 *
 * Adapter wiring (host responsibility):
 *
 *   ```ts
 *   // Inside the host's player-data adapter:
 *   useEffect(() => {
 *     const tick = (now) => {
 *       if (now - last >= 200) {
 *         const player = world.entities?.player;
 *         setProps((p) => ({
 *           ...p,
 *           stamina: player?.stamina ?? 100,
 *           runMode: player?.runMode ?? true,
 *         }));
 *       }
 *       raf = requestAnimationFrame(tick);
 *     };
 *     raf = requestAnimationFrame(tick);
 *     return () => cancelAnimationFrame(raf);
 *   }, [world]);
 *
 *   <MinimapStaminaOrb
 *     {...staminaProps}
 *     onToggleRunMode={() => {
 *       const next = !staminaProps.runMode;
 *       world.entities.player.runMode = next;
 *       world.network?.send?.("moveRequest", { runMode: next });
 *     }}
 *   />
 *   ```
 */

import {
  defineWidget,
  type Widget,
  type WidgetRegistration,
} from "@hyperforge/ui-framework";
import React, { useId, useState } from "react";
import { z } from "zod";

/** Props the widget exposes through its Zod schema. */
export const minimapStaminaOrbPropsSchema = z.object({
  /** Current stamina percent (0-100). */
  stamina: z.number().min(0).max(100).default(100),
  /** Whether the player is currently in run mode (vs walk). */
  runMode: z.boolean().default(true),
  /** Orb diameter in pixels. */
  size: z.number().int().min(16).max(256).default(44),
  /** Run-mode primary fill color (top of gradient). */
  runFillStartColor: z.string().default("#ffd84d"),
  /** Run-mode mid-gradient fill color. */
  runFillMidColor: z.string().default("#f9b339"),
  /** Run-mode bottom-gradient fill color. */
  runFillEndColor: z.string().default("#cf8a1f"),
  /** Run-mode border color. */
  runBorderColor: z.string().default("#ffd84d80"),
  /** Run-mode glow shadow color. */
  runGlowColor: z.string().default("#ffd84d40"),
  /** Walk-mode primary fill color. */
  walkFillStartColor: z.string().default("#a07a3a"),
  /** Walk-mode mid-gradient fill color. */
  walkFillMidColor: z.string().default("#7a5e2e"),
  /** Walk-mode bottom-gradient fill color. */
  walkFillEndColor: z.string().default("#4d3a1c"),
  /** Walk-mode border color. */
  walkBorderColor: z.string().default("#7a5e2e80"),
  /** Walk-mode glow shadow color. */
  walkGlowColor: z.string().default("#7a5e2e26"),
  /** Icon + percentage text color (overlaid on fill). */
  iconColor: z.string().default("#0b0d12"),
});

export type MinimapStaminaOrbProps = z.infer<
  typeof minimapStaminaOrbPropsSchema
>;

/**
 * Extended runtime props — `onToggleRunMode` is a callback prop, not
 * Zod-able. Host wires the actual run/walk toggle (player mutation +
 * packet send). If omitted, the orb is purely display-only.
 */
export interface MinimapStaminaOrbRuntimeProps extends MinimapStaminaOrbProps {
  readonly onToggleRunMode?: () => void;
}

/**
 * Widget definition — registered against the host's UI registry by
 * the meta-plugin's onEnable.
 */
export const minimapStaminaOrbWidget: Widget<MinimapStaminaOrbProps> =
  defineWidget({
    manifest: {
      id: "com.hyperforge.hyperscape.minimap-stamina-orb",
      name: "Minimap Stamina Orb",
      category: "hud",
      defaultSize: { width: 4, height: 4 },
    },
    propsSchema: minimapStaminaOrbPropsSchema,
    defaultProps: {
      stamina: 100,
      runMode: true,
      size: 44,
      runFillStartColor: "#ffd84d",
      runFillMidColor: "#f9b339",
      runFillEndColor: "#cf8a1f",
      runBorderColor: "#ffd84d80",
      runGlowColor: "#ffd84d40",
      walkFillStartColor: "#a07a3a",
      walkFillMidColor: "#7a5e2e",
      walkFillEndColor: "#4d3a1c",
      walkBorderColor: "#7a5e2e80",
      walkGlowColor: "#7a5e2e26",
      iconColor: "#0b0d12",
    },
  });

/** Running figure SVG — matches the legacy hand-coded RunIcon. */
function RunIcon({
  size,
  color,
}: {
  size: number;
  color: string;
}): React.ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      style={{ filter: "drop-shadow(0 1px 2px rgba(0, 0, 0, 0.8))" }}
    >
      <circle cx="14" cy="4" r="2.5" fill={color} />
      <path
        d="M11 8.5L8 11.5L10 13.5M11 8.5L15 10L18 8M11 8.5L13 14L11 19M13 14L16 17L18 21"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

/** Walking figure SVG — matches the legacy hand-coded WalkIcon. */
function WalkIcon({
  size,
  color,
}: {
  size: number;
  color: string;
}): React.ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      style={{ filter: "drop-shadow(0 1px 2px rgba(0, 0, 0, 0.8))" }}
    >
      <circle cx="12" cy="4" r="2.5" fill={color} />
      <path
        d="M12 8L12 14M12 14L9 20M12 14L15 20M10 10L14 10"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

/**
 * React component. Pure display + click-to-toggle. State (stamina,
 * runMode) flows through props from a host-side adapter; the widget
 * doesn't poll, doesn't mutate world state, doesn't send packets.
 */
export function MinimapStaminaOrb(
  props: MinimapStaminaOrbRuntimeProps,
): React.ReactElement {
  const {
    stamina,
    runMode,
    size,
    runFillStartColor,
    runFillMidColor,
    runFillEndColor,
    runBorderColor,
    runGlowColor,
    walkFillStartColor,
    walkFillMidColor,
    walkFillEndColor,
    walkBorderColor,
    walkGlowColor,
    iconColor,
    onToggleRunMode,
  } = props;

  const [isHovered, setIsHovered] = useState(false);
  const uniqueId = useId();

  const staminaPercent = Math.max(0, Math.min(100, stamina));

  const fillColorStart = runMode ? runFillStartColor : walkFillStartColor;
  const fillColorMid = runMode ? runFillMidColor : walkFillMidColor;
  const fillColorEnd = runMode ? runFillEndColor : walkFillEndColor;
  const borderColor = runMode ? runBorderColor : walkBorderColor;
  const glowColor = runMode ? runGlowColor : walkGlowColor;

  const gradientId = `staminaGradient-${uniqueId}`;
  const clipId = `circleClip-${uniqueId}`;
  const center = size / 2;
  const borderWidth = 2;
  const fillRadius = center;
  const borderRadius = center - borderWidth / 2;

  const stop = (e: React.SyntheticEvent): void => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div
      role="button"
      aria-pressed={runMode}
      tabIndex={onToggleRunMode ? 0 : -1}
      onClick={(e) => {
        stop(e);
        onToggleRunMode?.();
      }}
      onMouseDown={stop}
      onContextMenu={stop}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        boxShadow: `0 2px 8px rgba(0, 0, 0, 0.5), 0 0 12px ${glowColor}`,
        overflow: "hidden",
        position: "relative",
        cursor: onToggleRunMode ? "pointer" : "default",
        transform: isHovered ? "scale(1.05)" : "scale(1)",
        transition: "transform 0.15s ease, box-shadow 0.15s ease",
      }}
      title={runMode ? "Running (click to walk)" : "Walking (click to run)"}
    >
      <svg
        width={size}
        height={size}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          pointerEvents: "none",
        }}
        viewBox={`0 0 ${size} ${size}`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor={fillColorEnd} />
            <stop offset="50%" stopColor={fillColorMid} />
            <stop offset="100%" stopColor={fillColorStart} />
          </linearGradient>
          <clipPath id={clipId}>
            <circle cx={center} cy={center} r={fillRadius} />
          </clipPath>
        </defs>

        <g clipPath={`url(#${clipId})`}>
          <rect
            x={0}
            y={size * (1 - staminaPercent / 100)}
            width={size}
            height={size * (staminaPercent / 100)}
            fill={`url(#${gradientId})`}
            style={{ transition: "y 0.3s ease-out, height 0.3s ease-out" }}
          />
        </g>

        <circle
          cx={center}
          cy={center}
          r={borderRadius}
          fill="none"
          stroke={borderColor}
          strokeWidth={borderWidth}
        />

        <ellipse
          cx={center}
          cy={center * 0.5}
          rx={fillRadius * 0.45}
          ry={fillRadius * 0.2}
          fill="rgba(255, 255, 255, 0.06)"
        />
      </svg>

      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
          zIndex: 1,
          gap: 1,
        }}
      >
        <div style={{ marginTop: -1 }}>
          {runMode ? (
            <RunIcon size={size * 0.42} color={iconColor} />
          ) : (
            <WalkIcon size={size * 0.42} color={iconColor} />
          )}
        </div>
        <span
          style={{
            fontSize: size * 0.22,
            fontWeight: 700,
            fontFamily:
              "'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif",
            color: iconColor,
            textShadow: `0 0 4px ${fillColorStart}`,
            marginTop: -3,
            letterSpacing: "-0.02em",
          }}
        >
          {Math.round(staminaPercent)}%
        </span>
      </div>
    </div>
  );
}

/**
 * Bundled registration — pairs the widget schema with its React
 * renderer. The plugin's `onEnable` passes this to
 * `ctx.widgets.register(...)`.
 */
export const minimapStaminaOrbRegistration: WidgetRegistration<
  MinimapStaminaOrbProps,
  React.ComponentType<MinimapStaminaOrbProps>
> = {
  widget: minimapStaminaOrbWidget,
  Component: MinimapStaminaOrb as React.ComponentType<MinimapStaminaOrbProps>,
};
