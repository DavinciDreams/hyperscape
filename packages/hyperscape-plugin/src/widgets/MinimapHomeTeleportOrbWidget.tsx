/**
 * MinimapHomeTeleportOrbWidget — circular orb variant of the home
 * teleport button, designed to overlay the minimap. Same three-state
 * machine (ready / casting / cooldown) as HomeTeleportButton but
 * rendered as an SVG circle with vertical fill.
 *
 * Phase D6.c sixth non-overlay HUD migration. Mirrors the existing
 * hand-coded `MinimapHomeTeleportOrb`. Substrate-promote: identical
 * to slice 38 (HomeTeleportButtonWidget) — host adapter owns the
 * 4 HOME_TELEPORT_* event subscriptions, RAF cast/cooldown ticker,
 * keyboard shortcut, and packet sends. The widget is pure display
 * + click.
 *
 * Re-uses the `HomeTeleportStatus` enum from `HomeTeleportButtonWidget`
 * so adapters can serve both the corner-button and minimap-orb
 * variants from the same state.
 *
 * Visual identity: SVG render with linear-gradient fill, vertical
 * fill ratio drives both casting progress (rising) and cooldown
 * (also rising — the orb fills as cooldown elapses). Icon is the
 * legacy "house silhouette" SVG path. Label is "H" / "X" / m:ss
 * depending on state.
 */

import {
  defineWidget,
  type Widget,
  type WidgetRegistration,
} from "@hyperforge/ui-framework";
import React, { useId, useState } from "react";
import { z } from "zod";

import {
  HOME_TELEPORT_STATUSES,
  type HomeTeleportStatus,
} from "./HomeTeleportButtonWidget.js";

// Re-export the enum so adapters can import either widget's file.
export { HOME_TELEPORT_STATUSES, type HomeTeleportStatus };

/** Props the widget exposes through its Zod schema. */
export const minimapHomeTeleportOrbPropsSchema = z.object({
  /** Current state in the teleport state machine. */
  status: z.enum(HOME_TELEPORT_STATUSES).default("ready"),
  /** Cast progress percent (0-100). Only meaningful when casting. */
  castProgressPct: z.number().min(0).max(100).default(0),
  /**
   * Cooldown remaining in ms. Only meaningful when status is
   * "cooldown" — used for both the m:ss label and the vertical
   * fill ratio.
   */
  cooldownRemainingMs: z.number().int().nonnegative().default(0),
  /**
   * Total cooldown duration in ms — used to compute the vertical
   * fill ratio.
   */
  cooldownTotalMs: z.number().int().min(1).default(60_000),
  /** Orb diameter in pixels. */
  size: z.number().int().min(16).max(256).default(44),
  /** Ready/cooldown fill gradient top color (magical purple). */
  readyFillStartColor: z.string().default("#c084fc"),
  /** Ready/cooldown fill gradient mid color. */
  readyFillMidColor: z.string().default("#a855f7"),
  /** Ready/cooldown fill gradient bottom color. */
  readyFillEndColor: z.string().default("#7c3aed"),
  /** Ready/cooldown border color. */
  readyBorderColor: z.string().default("rgba(192, 132, 252, 0.5)"),
  /** Ready/cooldown glow color. */
  readyGlowColor: z.string().default("rgba(192, 132, 252, 0.25)"),
  /** Casting fill gradient top color (active blue). */
  castingFillStartColor: z.string().default("#60a5fa"),
  /** Casting fill gradient mid color. */
  castingFillMidColor: z.string().default("#3b82f6"),
  /** Casting fill gradient bottom color. */
  castingFillEndColor: z.string().default("#2563eb"),
  /** Casting border color. */
  castingBorderColor: z.string().default("rgba(96, 165, 250, 0.6)"),
  /** Casting glow color. */
  castingGlowColor: z.string().default("rgba(96, 165, 250, 0.3)"),
  /** Cooldown variant border color (muted gray). */
  cooldownBorderColor: z.string().default("rgba(100, 100, 100, 0.5)"),
  /** Cooldown variant glow color. */
  cooldownGlowColor: z.string().default("rgba(100, 100, 100, 0.1)"),
  /** Background shell color (ready/casting). */
  backgroundColor: z.string().default("#1a1510"),
  /** Background shell color (cooldown). */
  cooldownBackgroundColor: z.string().default("#2c2a31"),
  /** Icon + label color (overlaid on fill). */
  iconColor: z.string().default("#1a1510"),
});

export type MinimapHomeTeleportOrbProps = z.infer<
  typeof minimapHomeTeleportOrbPropsSchema
>;

/** Extended runtime props — `onClick` is a callback prop. */
export interface MinimapHomeTeleportOrbRuntimeProps extends MinimapHomeTeleportOrbProps {
  readonly onClick?: () => void;
}

/**
 * Widget definition — registered against the host's UI registry by
 * the meta-plugin's onEnable.
 */
export const minimapHomeTeleportOrbWidget: Widget<MinimapHomeTeleportOrbProps> =
  defineWidget({
    manifest: {
      id: "com.hyperforge.hyperscape.minimap-home-teleport-orb",
      name: "Minimap Home Teleport Orb",
      category: "hud",
      defaultSize: { width: 4, height: 4 },
    },
    propsSchema: minimapHomeTeleportOrbPropsSchema,
    defaultProps: {
      status: "ready",
      castProgressPct: 0,
      cooldownRemainingMs: 0,
      cooldownTotalMs: 60_000,
      size: 44,
      readyFillStartColor: "#c084fc",
      readyFillMidColor: "#a855f7",
      readyFillEndColor: "#7c3aed",
      readyBorderColor: "rgba(192, 132, 252, 0.5)",
      readyGlowColor: "rgba(192, 132, 252, 0.25)",
      castingFillStartColor: "#60a5fa",
      castingFillMidColor: "#3b82f6",
      castingFillEndColor: "#2563eb",
      castingBorderColor: "rgba(96, 165, 250, 0.6)",
      castingGlowColor: "rgba(96, 165, 250, 0.3)",
      cooldownBorderColor: "rgba(100, 100, 100, 0.5)",
      cooldownGlowColor: "rgba(100, 100, 100, 0.1)",
      backgroundColor: "#1a1510",
      cooldownBackgroundColor: "#2c2a31",
      iconColor: "#1a1510",
    },
  });

function formatTime(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}:${s.toString().padStart(2, "0")}` : `${s}s`;
}

/** House silhouette SVG icon — preserves the legacy HomeIcon. */
function HomeIcon({
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
      <path
        d="M3 12L5 10M5 10L12 3L19 10M5 10V20C5 20.5523 5.44772 21 6 21H9V15H15V21H18C18.5523 21 19 20.5523 19 20V10M19 10L21 12"
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
 * React component. Pure display + click. State + progress flow
 * through props from a host-side adapter (same adapter that drives
 * HomeTeleportButtonWidget).
 */
export function MinimapHomeTeleportOrb(
  props: MinimapHomeTeleportOrbRuntimeProps,
): React.ReactElement {
  const {
    status,
    castProgressPct,
    cooldownRemainingMs,
    cooldownTotalMs,
    size,
    readyFillStartColor,
    readyFillMidColor,
    readyFillEndColor,
    readyBorderColor,
    readyGlowColor,
    castingFillStartColor,
    castingFillMidColor,
    castingFillEndColor,
    castingBorderColor,
    castingGlowColor,
    cooldownBorderColor,
    cooldownGlowColor,
    backgroundColor,
    cooldownBackgroundColor,
    iconColor,
    onClick,
  } = props;

  const [isHovered, setIsHovered] = useState(false);
  const uniqueId = useId();

  const isCasting = status === "casting";
  const isDisabled = status === "cooldown";

  // Fill percent: casting fills as cast progresses; cooldown fills as
  // cooldown elapses (1 - remaining / total); ready is at 100% (full
  // ready-state purple).
  const cooldownProgressPct = isDisabled
    ? Math.max(
        0,
        Math.min(100, (1 - cooldownRemainingMs / cooldownTotalMs) * 100),
      )
    : 0;
  const fillPercent = isCasting
    ? Math.max(0, Math.min(100, castProgressPct))
    : isDisabled
      ? cooldownProgressPct
      : 100;

  // Fill gradient + border + glow swap by status.
  const fillStart = isCasting ? castingFillStartColor : readyFillStartColor;
  const fillMid = isCasting ? castingFillMidColor : readyFillMidColor;
  const fillEnd = isCasting ? castingFillEndColor : readyFillEndColor;
  const borderColor = isDisabled
    ? cooldownBorderColor
    : isCasting
      ? castingBorderColor
      : readyBorderColor;
  const glowColor = isDisabled
    ? cooldownGlowColor
    : isCasting
      ? castingGlowColor
      : readyGlowColor;

  const gradientId = `homeTeleportOrbGradient-${uniqueId}`;
  const clipId = `homeTeleportOrbClip-${uniqueId}`;
  const center = size / 2;
  const borderWidth = 2;
  const fillRadius = center;
  const outerBorderRadius = center - borderWidth / 2;

  const label = isDisabled
    ? formatTime(cooldownRemainingMs)
    : isCasting
      ? "X"
      : "H";

  const title = isDisabled
    ? `On cooldown (${formatTime(cooldownRemainingMs)})`
    : isCasting
      ? "Click to cancel (H)"
      : "Teleport home (H)";

  const stop = (e: React.SyntheticEvent): void => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div
      role="button"
      aria-label={title}
      tabIndex={onClick && !isDisabled ? 0 : -1}
      onClick={(e) => {
        stop(e);
        if (!isDisabled) onClick?.();
      }}
      onMouseDown={stop}
      onContextMenu={stop}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        boxShadow: `0 2px 8px rgba(0,0,0,0.5), 0 0 12px ${glowColor}`,
        overflow: "hidden",
        position: "relative",
        cursor: isDisabled ? "not-allowed" : onClick ? "pointer" : "default",
        opacity: isDisabled ? 0.7 : 1,
        transform: isHovered && !isDisabled ? "scale(1.05)" : "scale(1)",
        transition: "transform 0.15s ease, box-shadow 0.15s ease",
      }}
      title={title}
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
            <stop offset="0%" stopColor={fillEnd} />
            <stop offset="50%" stopColor={fillMid} />
            <stop offset="100%" stopColor={fillStart} />
          </linearGradient>
          <clipPath id={clipId}>
            <circle cx={center} cy={center} r={fillRadius} />
          </clipPath>
        </defs>

        <circle
          cx={center}
          cy={center}
          r={fillRadius}
          fill={isDisabled ? cooldownBackgroundColor : backgroundColor}
        />

        <g clipPath={`url(#${clipId})`}>
          <rect
            x={0}
            y={size * (1 - fillPercent / 100)}
            width={size}
            height={size * (fillPercent / 100)}
            fill={`url(#${gradientId})`}
            style={{ transition: "y 0.05s linear, height 0.05s linear" }}
          />
        </g>

        <circle
          cx={center}
          cy={center}
          r={outerBorderRadius}
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
          gap: 0,
        }}
      >
        <div style={{ marginTop: -2 }}>
          <HomeIcon size={size * 0.42} color={iconColor} />
        </div>
        <span
          style={{
            fontSize: size * 0.24,
            fontWeight: 700,
            fontFamily:
              "'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif",
            color: iconColor,
            textShadow: `0 0 4px ${fillStart}`,
            marginTop: -4,
            letterSpacing: "-0.02em",
          }}
        >
          {label}
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
export const minimapHomeTeleportOrbRegistration: WidgetRegistration<
  MinimapHomeTeleportOrbProps,
  React.ComponentType<MinimapHomeTeleportOrbProps>
> = {
  widget: minimapHomeTeleportOrbWidget,
  Component:
    MinimapHomeTeleportOrb as React.ComponentType<MinimapHomeTeleportOrbProps>,
};
