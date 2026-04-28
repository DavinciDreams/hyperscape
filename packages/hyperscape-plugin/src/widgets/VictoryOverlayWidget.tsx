/**
 * VictoryOverlayWidget — celebratory headline + subtitle overlay
 * with a pulse-in animation. Used by streaming duels for "SO_AND_SO
 * WINS!" but generic enough for any "big text reveal" moment
 * (achievements, milestones, etc.).
 *
 * Phase D6.c twenty-seventh widget migration. Mirrors the legacy
 * hand-coded `VictoryOverlay`. Substrate-promote: drops the
 * `AgentInfo` type import — the widget receives `winnerName` as a
 * plain string. Drops the imperative `classList.remove + reflow +
 * classList.add` pulse trigger by using a `key`-driven re-mount via
 * an `animationToken` prop change. Drops global keyframe injection
 * via inline `<style>` tag with a unique animation name.
 *
 * Adapter wiring (host responsibility):
 *
 *   ```ts
 *   <VictoryOverlay
 *     visible={duelEnded}
 *     winnerName={winner.name}
 *     reasonLine="Knockout — HP reached zero."
 *     animationToken={duelId}
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
export const victoryOverlayPropsSchema = z.object({
  /** Whether the overlay is visible. */
  visible: z.boolean().default(false),
  /** Top headline (e.g., the winner's name). */
  winnerName: z.string().default(""),
  /** Bottom headline (e.g., "WINS!"). */
  winsLabel: z.string().default("WINS!"),
  /** Optional subtitle reason line. Empty hides it. */
  reasonLine: z.string().default(""),
  /**
   * Animation re-trigger token. Changing this value re-mounts the
   * inner element so the pulse-in animation runs again. Hosts pass
   * the duel id, achievement id, etc.
   */
  animationToken: z.string().default(""),
  /** Pulse animation duration (ms). */
  animationMs: z.number().int().min(100).max(5_000).default(600),
  /** Winner-name color. */
  winnerColor: z.string().default("#f2d08a"),
  /** Wins-label color. */
  winsLabelColor: z.string().default("#ff6b6b"),
  /** Reason line color. */
  reasonLineColor: z.string().default("rgba(226, 232, 240, 0.95)"),
  /** Glow color around the winner name (used in textShadow). */
  winnerGlowColor: z.string().default("rgba(242, 208, 138, 0.8)"),
  /** Glow color around the wins label. */
  winsLabelGlowColor: z.string().default("rgba(255, 107, 107, 0.8)"),
  /** Z-index. */
  zIndex: z.number().int().default(60),
});

export type VictoryOverlayProps = z.infer<typeof victoryOverlayPropsSchema>;

/**
 * Widget definition — registered against the host's UI registry by
 * the meta-plugin's onEnable.
 */
export const victoryOverlayWidget: Widget<VictoryOverlayProps> = defineWidget({
  manifest: {
    id: "com.hyperforge.hyperscape.victory-overlay",
    name: "Victory Overlay",
    category: "overlay",
    defaultSize: { width: 96, height: 32 },
  },
  propsSchema: victoryOverlayPropsSchema,
  defaultProps: {
    visible: false,
    winnerName: "",
    winsLabel: "WINS!",
    reasonLine: "",
    animationToken: "",
    animationMs: 600,
    winnerColor: "#f2d08a",
    winsLabelColor: "#ff6b6b",
    reasonLineColor: "rgba(226, 232, 240, 0.95)",
    winnerGlowColor: "rgba(242, 208, 138, 0.8)",
    winsLabelGlowColor: "rgba(255, 107, 107, 0.8)",
    zIndex: 60,
  },
});

const PULSE_KEYFRAMES_NAME = "hf-victory-overlay-pulse";
const PULSE_KEYFRAMES = `
@keyframes ${PULSE_KEYFRAMES_NAME} {
  0%   { transform: scale(0.5); opacity: 0; }
  60%  { transform: scale(1.15); }
  100% { transform: scale(1); opacity: 1; }
}
`;

/**
 * React component. Returns null when `visible` is false. Re-mounts
 * the inner content via `key={animationToken}` so the pulse-in
 * animation replays whenever the host updates the token.
 */
export function VictoryOverlay(
  props: VictoryOverlayProps,
): React.ReactElement | null {
  const {
    visible,
    winnerName,
    winsLabel,
    reasonLine,
    animationToken,
    animationMs,
    winnerColor,
    winsLabelColor,
    reasonLineColor,
    winnerGlowColor,
    winsLabelGlowColor,
    zIndex,
  } = props;

  if (!visible) return null;

  return (
    <>
      <style>{PULSE_KEYFRAMES}</style>
      <div
        role="status"
        aria-live="polite"
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex,
          pointerEvents: "none",
        }}
      >
        <div
          key={animationToken}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 0,
            animation: `${PULSE_KEYFRAMES_NAME} ${animationMs}ms ease-out`,
          }}
        >
          <div
            style={{
              color: winnerColor,
              fontSize: "clamp(2.5rem, 10vw, 6rem)",
              fontWeight: 700,
              fontFamily: "Impact, Haettenschweiler, sans-serif",
              letterSpacing: 2,
              textTransform: "uppercase",
              textShadow: `0 0 40px ${winnerGlowColor}, 0 0 80px ${winnerGlowColor.replace(
                "0.8",
                "0.4",
              )}, 0 4px 8px rgba(0, 0, 0, 0.8)`,
              lineHeight: 1.1,
              textAlign: "center",
              maxWidth: "min(95vw, 1200px)",
              padding: "0 12px",
            }}
          >
            {winnerName}
          </div>
          <div
            style={{
              color: winsLabelColor,
              fontSize: "clamp(3.2rem, 12vw, 8rem)",
              fontWeight: 700,
              fontFamily: "Impact, Haettenschweiler, sans-serif",
              letterSpacing: -2,
              textShadow: `0 0 40px ${winsLabelGlowColor}, 0 0 80px ${winsLabelGlowColor.replace(
                "0.8",
                "0.4",
              )}, 0 4px 8px rgba(0, 0, 0, 0.8)`,
              lineHeight: 1,
            }}
          >
            {winsLabel}
          </div>
          {reasonLine && (
            <div
              style={{
                marginTop: "0.35em",
                maxWidth: "min(90vw, 560px)",
                padding: "0 20px",
                textAlign: "center",
                fontSize: "clamp(0.85rem, 2.2vw, 1.1rem)",
                fontWeight: 600,
                letterSpacing: "0.06em",
                color: reasonLineColor,
                textShadow:
                  "0 2px 16px rgba(0, 0, 0, 0.9), 0 0 20px rgba(96, 165, 250, 0.12)",
                lineHeight: 1.35,
              }}
            >
              {reasonLine}
            </div>
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
export const victoryOverlayRegistration: WidgetRegistration<
  VictoryOverlayProps,
  React.ComponentType<VictoryOverlayProps>
> = {
  widget: victoryOverlayWidget,
  Component: VictoryOverlay,
};
