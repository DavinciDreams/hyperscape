/**
 * HomeTeleportButtonWidget — corner button that teleports the
 * player home. Three-state machine (ready / casting / cooldown)
 * with cast-progress fill + cooldown countdown.
 *
 * Phase D6.c fifth non-overlay HUD migration. Mirrors the existing
 * hand-coded `HomeTeleportButton`. Substrate-promote: the legacy
 * button subscribes to 4 HOME_TELEPORT_* events, runs its own RAF
 * timer for cast/cooldown progress, registers a keyboard shortcut,
 * and tracks mobile breakpoint. The widget receives state +
 * progress through typed props instead, so the host adapter owns
 * subscriptions, RAF lifecycle, keyboard binding, and viewport
 * sizing.
 *
 * State machine (matches the legacy):
 *   - `ready`     → click sends `homeTeleport` packet
 *   - `casting`   → click sends `homeTeleportCancel` packet (label
 *     becomes "Cancel"); cast-progress bar at the bottom edge
 *   - `cooldown`  → button disabled; vertical fill drains down as
 *     cooldown elapses; label shows "m:ss" remaining
 *
 * Adapter wiring (host responsibility):
 *
 *   ```ts
 *   useEffect(() => {
 *     world.on(EventType.HOME_TELEPORT_CAST_START, () =>
 *       setProps({status: "casting", castProgressPct: 0, cooldownRemainingMs: 0}));
 *     world.on(EventType.HOME_TELEPORT_FAILED, (e) => { ... });
 *     world.on(EventType.PLAYER_TELEPORTED, () =>
 *       setProps({status: "cooldown", cooldownRemainingMs: getHomeTeleportCooldownMs(), castProgressPct: 0}));
 *     // Run RAF to update progress; bind H key to onClick
 *   }, [world]);
 *
 *   <HomeTeleportButton
 *     {...state}
 *     onClick={() => {
 *       if (state.status === "casting")
 *         world.network.send("homeTeleportCancel", {});
 *       else if (state.status === "ready")
 *         world.network.send("homeTeleport", {});
 *     }}
 *   />
 *   ```
 */

import {
  defineWidget,
  type Widget,
  type WidgetRegistration,
} from "@hyperforge/ui-framework";
import React, { useState } from "react";
import { z } from "zod";

/** Status state machine — matches the hand-coded HomeTeleportButton. */
export const HOME_TELEPORT_STATUSES = ["ready", "casting", "cooldown"] as const;
export type HomeTeleportStatus = (typeof HOME_TELEPORT_STATUSES)[number];

/** Props the widget exposes through its Zod schema. */
export const homeTeleportButtonPropsSchema = z.object({
  /** Current state in the teleport state machine. */
  status: z.enum(HOME_TELEPORT_STATUSES).default("ready"),
  /** Cast progress percent (0-100). Only meaningful when casting. */
  castProgressPct: z.number().min(0).max(100).default(0),
  /**
   * Cooldown remaining in ms. Only meaningful when status is
   * "cooldown" — used for both the "m:ss" label and the vertical
   * fill ratio.
   */
  cooldownRemainingMs: z.number().int().nonnegative().default(0),
  /**
   * Total cooldown duration in ms — used to compute the vertical
   * fill ratio (1 - remaining / total).
   */
  cooldownTotalMs: z.number().int().min(1).default(60_000),
  /** Whether to render the mobile-sized variant (smaller button). */
  mobile: z.boolean().default(false),
  /** Icon shown on the button face. */
  icon: z.string().default("🏠"),
  /** Label shown when status === "ready". */
  readyLabel: z.string().default("Home"),
  /** Label shown when status === "casting". */
  castingLabel: z.string().default("Cancel"),
  /** Distance from the bottom edge in pixels (desktop). */
  bottomOffsetPx: z.number().int().nonnegative().max(400).default(100),
  /** Distance from the right edge in pixels (desktop). */
  rightOffsetPx: z.number().int().nonnegative().max(400).default(24),
  /** Distance from the bottom edge in pixels (mobile). */
  mobileBottomOffsetPx: z.number().int().nonnegative().max(400).default(80),
  /** Distance from the right edge in pixels (mobile). */
  mobileRightOffsetPx: z.number().int().nonnegative().max(400).default(12),
  /** Button background gradient end (ready). */
  backgroundColor: z.string().default("#1a1f2e"),
  /** Button background gradient start (ready). */
  backgroundHighlight: z.string().default("#2a3142"),
  /** Cooldown variant background. */
  cooldownBackgroundColor: z.string().default("#0f1218"),
  /** Casting variant background. */
  castingBackgroundColor: z.string().default("#3b82f6"),
  /** Border color (ready). */
  borderColor: z.string().default("#3a3f4d"),
  /** Border color (cooldown). */
  cooldownBorderColor: z.string().default("#3a3f4d"),
  /** Border color (casting). */
  castingBorderColor: z.string().default("#ffd84d"),
  /** Cooldown fill color (drains down). */
  cooldownFillColor: z.string().default("rgba(59, 130, 246, 0.85)"),
  /** Cast-progress bar fill (bottom edge). */
  castProgressColor: z.string().default("#4a9eff"),
  /** Primary label color (ready). */
  labelColor: z.string().default("#ffd84d"),
  /** Secondary label color (cooldown). */
  cooldownLabelColor: z.string().default("rgba(168, 174, 192, 0.5)"),
});

export type HomeTeleportButtonProps = z.infer<
  typeof homeTeleportButtonPropsSchema
>;

/** Extended runtime props — `onClick` is a callback prop. */
export interface HomeTeleportButtonRuntimeProps extends HomeTeleportButtonProps {
  readonly onClick?: () => void;
}

/**
 * Widget definition — registered against the host's UI registry by
 * the meta-plugin's onEnable.
 */
export const homeTeleportButtonWidget: Widget<HomeTeleportButtonProps> =
  defineWidget({
    manifest: {
      id: "com.hyperforge.hyperscape.home-teleport-button",
      name: "Home Teleport Button",
      category: "hud",
      defaultSize: { width: 6, height: 6 },
    },
    propsSchema: homeTeleportButtonPropsSchema,
    defaultProps: {
      status: "ready",
      castProgressPct: 0,
      cooldownRemainingMs: 0,
      cooldownTotalMs: 60_000,
      mobile: false,
      icon: "🏠",
      readyLabel: "Home",
      castingLabel: "Cancel",
      bottomOffsetPx: 100,
      rightOffsetPx: 24,
      mobileBottomOffsetPx: 80,
      mobileRightOffsetPx: 12,
      backgroundColor: "#1a1f2e",
      backgroundHighlight: "#2a3142",
      cooldownBackgroundColor: "#0f1218",
      castingBackgroundColor: "#3b82f6",
      borderColor: "#3a3f4d",
      cooldownBorderColor: "#3a3f4d",
      castingBorderColor: "#ffd84d",
      cooldownFillColor: "rgba(59, 130, 246, 0.85)",
      castProgressColor: "#4a9eff",
      labelColor: "#ffd84d",
      cooldownLabelColor: "rgba(168, 174, 192, 0.5)",
    },
  });

function formatTime(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}:${s.toString().padStart(2, "0")}` : `${s}s`;
}

/**
 * React component. Pure display + click-to-act. State + progress
 * flow through props from a host-side adapter; the widget doesn't
 * own subscriptions, RAF, keyboard, or viewport detection.
 */
export function HomeTeleportButton(
  props: HomeTeleportButtonRuntimeProps,
): React.ReactElement {
  const {
    status,
    castProgressPct,
    cooldownRemainingMs,
    cooldownTotalMs,
    mobile,
    icon,
    readyLabel,
    castingLabel,
    bottomOffsetPx,
    rightOffsetPx,
    mobileBottomOffsetPx,
    mobileRightOffsetPx,
    backgroundColor,
    backgroundHighlight,
    cooldownBackgroundColor,
    castingBackgroundColor,
    borderColor,
    cooldownBorderColor,
    castingBorderColor,
    cooldownFillColor,
    castProgressColor,
    labelColor,
    cooldownLabelColor,
  } = props;

  const [, setHover] = useState(false);

  const isCasting = status === "casting";
  const isCooldown = status === "cooldown";
  const size = mobile ? 48 : 56;

  const cooldownProgress = isCooldown
    ? Math.max(
        0,
        Math.min(100, (1 - cooldownRemainingMs / cooldownTotalMs) * 100),
      )
    : 0;

  const bg = isCooldown
    ? `linear-gradient(135deg, ${cooldownBackgroundColor}, ${cooldownBackgroundColor})`
    : isCasting
      ? `linear-gradient(135deg, ${castingBackgroundColor}, ${castingBackgroundColor})`
      : `linear-gradient(135deg, ${backgroundHighlight}, ${backgroundColor})`;

  const border = isCooldown
    ? cooldownBorderColor
    : isCasting
      ? castingBorderColor
      : borderColor;

  const label = isCooldown
    ? formatTime(cooldownRemainingMs)
    : isCasting
      ? castingLabel
      : readyLabel;

  const title = isCooldown
    ? `On cooldown (${formatTime(cooldownRemainingMs)})`
    : isCasting
      ? "Click to cancel (H)"
      : "Teleport home (H)";

  return (
    <div
      style={{
        position: "fixed",
        bottom: mobile ? mobileBottomOffsetPx : bottomOffsetPx,
        right: mobile ? mobileRightOffsetPx : rightOffsetPx,
        pointerEvents: "auto",
        zIndex: 50,
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif",
      }}
    >
      <button
        onClick={() => props.onClick?.()}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        title={title}
        style={{
          width: size,
          height: size,
          borderRadius: 12,
          background: bg,
          border: `2px solid ${border}`,
          boxShadow: isCooldown
            ? "0 2px 4px rgba(0,0,0,0.4)"
            : "0 4px 12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,216,77,0.2)",
          cursor: isCooldown ? "not-allowed" : "pointer",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          overflow: "hidden",
          padding: 0,
          color: labelColor,
        }}
      >
        {isCooldown && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              top: `${100 - cooldownProgress}%`,
              background: cooldownFillColor,
              transition: "top 0.1s linear",
              pointerEvents: "none",
            }}
          />
        )}
        <div
          style={{
            position: "relative",
            zIndex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span
            style={{
              fontSize: mobile ? "1.25rem" : "1.5rem",
              opacity: isCooldown ? 0.5 : 1,
              filter: isCasting ? "brightness(1.2)" : "none",
            }}
          >
            {icon}
          </span>
          <span
            style={{
              fontSize: mobile ? "0.7rem" : "0.8rem",
              color: isCooldown ? cooldownLabelColor : labelColor,
              fontWeight: 600,
              textShadow: "0 1px 2px rgba(0,0,0,0.8)",
              marginTop: 2,
            }}
          >
            {label}
          </span>
        </div>
        {isCasting && (
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              width: `${castProgressPct}%`,
              height: 4,
              background: castProgressColor,
              borderRadius: "0 0 10px 10px",
              transition: "width 0.05s linear",
            }}
          />
        )}
      </button>
    </div>
  );
}

/**
 * Bundled registration — pairs the widget schema with its React
 * renderer. The plugin's `onEnable` passes this to
 * `ctx.widgets.register(...)`.
 */
export const homeTeleportButtonRegistration: WidgetRegistration<
  HomeTeleportButtonProps,
  React.ComponentType<HomeTeleportButtonProps>
> = {
  widget: homeTeleportButtonWidget,
  Component: HomeTeleportButton as React.ComponentType<HomeTeleportButtonProps>,
};
