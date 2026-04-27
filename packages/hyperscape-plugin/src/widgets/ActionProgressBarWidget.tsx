/**
 * ActionProgressBarWidget — bottom-of-screen progress bar shown
 * during gathering / skilling actions (woodcutting, fishing,
 * mining). Renders nothing when no action is active.
 *
 * Phase D6.c fourth non-overlay HUD migration. Mirrors the existing
 * hand-coded `ActionProgressBar`. Substrate-promote: the legacy bar
 * subscribes to 3 RESOURCE_GATHERING_* events and runs its own RAF
 * progress timer; the widget receives `progress` (0-1), `action`,
 * and `resourceName` through typed props instead, so the host adapter
 * owns the event subscription + RAF lifecycle.
 *
 * Renders null when `progress` is `null` or undefined — same gating
 * behavior as the legacy bar's "currentAction === null" branch.
 *
 * Adapter wiring (host responsibility):
 *
 *   ```ts
 *   const [action, setAction] = useState<{
 *     progress: number; action: string; resourceName: string;
 *   } | null>(null);
 *
 *   useEffect(() => {
 *     const onStart = (data) => {
 *       if (data.playerId !== world.entities?.player?.id) return;
 *       const start = Date.now();
 *       const duration = data.duration ?? data.cycleTicks * data.tickDurationMs;
 *       setAction({ action: data.action, resourceName: ..., progress: 0 });
 *       const tick = () => {
 *         const elapsed = Date.now() - start;
 *         setAction((prev) => prev && {
 *           ...prev,
 *           progress: Math.min(elapsed / duration, 1),
 *         });
 *         if (elapsed < duration) raf = requestAnimationFrame(tick);
 *       };
 *       raf = requestAnimationFrame(tick);
 *     };
 *     world.on(EventType.RESOURCE_GATHERING_STARTED, onStart);
 *     // similar for COMPLETED + STOPPED → setAction(null)
 *     return () => { ...off + cancelAnimationFrame... };
 *   }, [world]);
 *
 *   <ActionProgressBar
 *     progress={action?.progress ?? null}
 *     action={action?.action ?? ""}
 *     resourceName={action?.resourceName ?? ""}
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

/** Props the widget exposes through its Zod schema. */
export const actionProgressBarPropsSchema = z.object({
  /**
   * Current action progress in [0, 1]. Pass `null` (the default) to
   * render nothing — matches the legacy bar's "no current action"
   * branch.
   */
  progress: z.number().min(0).max(1).nullable().default(null),
  /** Action verb (e.g. "Chopping", "Fishing", "Mining"). */
  action: z.string().default(""),
  /** Target resource display name (e.g. "Tree", "Fishing Spot"). */
  resourceName: z.string().default(""),
  /** Action emoji/icon shown left of the label. */
  icon: z.string().default("🪓"),
  /** Distance from the bottom edge in pixels. */
  bottomOffsetPx: z.number().int().nonnegative().max(800).default(120),
  /** Bar width in pixels (caps at 90vw). */
  widthPx: z.number().int().min(120).max(800).default(320),
  /** Bar fill color. */
  fillColor: z.string().default("#84cc16"),
  /** Bar track background color. */
  trackColor: z.string().default("rgba(20, 22, 28, 0.85)"),
  /** Bar border color. */
  borderColor: z.string().default("#3a3f4d"),
  /** Primary text color (label + percentage). */
  textColor: z.string().default("#e6e8ec"),
  /** Bar height in pixels. */
  barHeightPx: z.number().int().min(8).max(80).default(28),
});

export type ActionProgressBarProps = z.infer<
  typeof actionProgressBarPropsSchema
>;

/**
 * Widget definition — registered against the host's UI registry by
 * the meta-plugin's onEnable.
 */
export const actionProgressBarWidget: Widget<ActionProgressBarProps> =
  defineWidget({
    manifest: {
      id: "com.hyperforge.hyperscape.action-progress-bar",
      name: "Action Progress Bar",
      category: "hud",
      defaultSize: { width: 48, height: 8 },
    },
    propsSchema: actionProgressBarPropsSchema,
    defaultProps: {
      progress: null,
      action: "",
      resourceName: "",
      icon: "🪓",
      bottomOffsetPx: 120,
      widthPx: 320,
      fillColor: "#84cc16",
      trackColor: "rgba(20, 22, 28, 0.85)",
      borderColor: "#3a3f4d",
      textColor: "#e6e8ec",
      barHeightPx: 28,
    },
  });

/**
 * React component. Pure display; returns null when `progress` is
 * null/undefined. Pulse animation is inlined via a unique-keyframe
 * <style> block.
 */
export function ActionProgressBar(
  props: ActionProgressBarProps,
): React.ReactElement | null {
  const {
    progress,
    action,
    resourceName,
    icon,
    bottomOffsetPx,
    widthPx,
    fillColor,
    trackColor,
    borderColor,
    textColor,
    barHeightPx,
  } = props;

  if (progress === null || progress === undefined) return null;

  const clamped = Math.max(0, Math.min(1, progress));
  const percentage = Math.floor(clamped * 100);
  const radius = Math.max(4, Math.floor(barHeightPx / 2));

  return (
    <div
      role="progressbar"
      aria-valuenow={percentage}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${action} ${resourceName}`}
      style={{
        width: widthPx,
        maxWidth: "90vw",
        position: "fixed",
        left: "50%",
        transform: "translateX(-50%)",
        bottom: bottomOffsetPx,
        pointerEvents: "none",
        zIndex: 40,
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif",
      }}
    >
      <style>
        {`@keyframes hyperscape-action-progress-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.85; } }`}
      </style>
      <div
        style={{
          textAlign: "center",
          color: textColor,
          fontSize: 14,
          fontWeight: 600,
          marginBottom: 6,
          textShadow: "0 2px 4px rgba(0, 0, 0, 0.8)",
          animation:
            "hyperscape-action-progress-pulse 1.5s ease-in-out infinite",
        }}
      >
        <span
          style={{ display: "inline-block", marginRight: 4 }}
          aria-hidden="true"
        >
          {icon}
        </span>
        {action} {resourceName}...
      </div>

      <div
        style={{
          height: barHeightPx,
          background: trackColor,
          border: `2px solid ${borderColor}`,
          borderRadius: radius,
          overflow: "hidden",
          position: "relative",
          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.5)",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${percentage}%`,
            background: fillColor,
            borderRadius: radius - 4,
            transition: "width 50ms linear",
            position: "relative",
            overflow: "hidden",
            boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.3)",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: "50%",
              background:
                "linear-gradient(to bottom, rgba(255, 255, 255, 0.4), transparent)",
              borderRadius: `${radius}px ${radius}px 0 0`,
            }}
          />
        </div>

        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            color: textColor,
            fontSize: 12,
            fontWeight: 700,
            pointerEvents: "none",
            textShadow: "0 1px 2px rgba(0, 0, 0, 0.8)",
          }}
        >
          {percentage}%
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
export const actionProgressBarRegistration: WidgetRegistration<
  ActionProgressBarProps,
  React.ComponentType<ActionProgressBarProps>
> = {
  widget: actionProgressBarWidget,
  Component: ActionProgressBar as React.ComponentType<ActionProgressBarProps>,
};
