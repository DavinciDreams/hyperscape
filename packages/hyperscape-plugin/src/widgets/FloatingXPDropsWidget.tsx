/**
 * FloatingXPDropsWidget — floating "+N XP" numbers that rise toward
 * the XP orbs and fade out.
 *
 * Phase D6.c second-panel-cycle widget (eleventh D6.c migration
 * overall). Mirrors the legacy hand-coded `FloatingXPDrops` in
 * client/src/game/hud/xp-orb/. Substrate-promote: the legacy
 * component subscribes to a theme store + reaches into HUD layout
 * tokens + resolves skill icons via `getEffectiveSkillIcon` from
 * shared. The widget receives pre-resolved icon strings inside each
 * drop and exposes positioning + color tokens as typed props.
 *
 * Adapter wiring (host responsibility):
 *
 *   ```ts
 *   const widgetDrops = useMemo(
 *     () =>
 *       drops.map((d) => ({
 *         id: d.id,
 *         totalAmount: d.totalAmount,
 *         icons: d.skills.map(
 *           (s) => getEffectiveSkillIcon(s.skill.toLowerCase()) || "⭐",
 *         ),
 *       })),
 *     [drops],
 *   );
 *
 *   <FloatingXPDrops
 *     drops={widgetDrops}
 *     topOffsetCss={HUD_FRAME.topCenterSecondaryOffset}
 *     zIndex={HUD_LAYERS.floating}
 *   />
 *   ```
 */

import {
  defineWidget,
  type Widget,
  type WidgetRegistration,
} from "@hyperforge/ui-framework";
import React, { useMemo } from "react";
import { z } from "zod";

/** A single grouped drop with pre-resolved icon strings. */
export const floatingXPDropSchema = z.object({
  /** Stable id used as the React key. */
  id: z.string().min(1),
  /** Total XP amount across all skills in this drop. */
  totalAmount: z.number().nonnegative(),
  /** Pre-resolved icon strings (emoji or short text), one per skill. */
  icons: z.array(z.string().min(1)),
});

export type FloatingXPDrop = z.infer<typeof floatingXPDropSchema>;

/** Props the widget exposes through its Zod schema. */
export const floatingXPDropsPropsSchema = z.object({
  /** Active drops — empty array renders nothing. */
  drops: z.array(floatingXPDropSchema).default(() => []),
  /**
   * CSS top-position string. Defaults match the legacy
   * `HUD_FRAME.topCenterSecondaryOffset` so dropping this widget in
   * the same slot as the legacy element keeps pixel layout.
   */
  topOffsetCss: z
    .string()
    .default("calc(env(safe-area-inset-top, 0px) + 72px)"),
  /** zIndex layer (defaults to the legacy "floating" layer). */
  zIndex: z.number().int().default(900),
  /** Animation duration in milliseconds. */
  animationMs: z.number().int().min(100).max(10_000).default(1_500),
  /** XP-amount accent color. */
  accentColor: z.string().default("#ffd84d"),
  /** Base font size for the "+N XP" number. */
  fontSize: z.number().int().min(8).max(96).default(20),
  /** Skill-icon font size. */
  iconFontSize: z.number().int().min(8).max(96).default(18),
  /** Font weight for the amount. */
  fontWeight: z.union([z.number().int(), z.string()]).default(700),
});

export type FloatingXPDropsProps = z.infer<typeof floatingXPDropsPropsSchema>;

/**
 * Widget definition — registered against the host's UI registry by
 * the meta-plugin's onEnable.
 */
export const floatingXPDropsWidget: Widget<FloatingXPDropsProps> = defineWidget(
  {
    manifest: {
      id: "com.hyperforge.hyperscape.floating-xp-drops",
      name: "Floating XP Drops",
      category: "hud",
      defaultSize: { width: 24, height: 16 },
    },
    propsSchema: floatingXPDropsPropsSchema,
    defaultProps: {
      drops: [],
      topOffsetCss: "calc(env(safe-area-inset-top, 0px) + 72px)",
      zIndex: 900,
      animationMs: 1_500,
      accentColor: "#ffd84d",
      fontSize: 20,
      iconFontSize: 18,
      fontWeight: 700,
    },
  },
);

/**
 * Unique animation name per-render to avoid global keyframe
 * collisions when multiple widget instances coexist.
 */
const FLOAT_UP_ANIM = "hf-floating-xp-drops-float-up";

const KEYFRAMES = `
@keyframes ${FLOAT_UP_ANIM} {
  0% {
    opacity: 1;
    transform: translate(-50%, 132px) scale(0.98);
  }
  80% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: translate(-50%, 0) scale(1);
  }
}
`;

/**
 * React component. Returns null when no drops are active. Each drop
 * renders as an absolutely-positioned, float-up + fade-out element.
 */
export function FloatingXPDrops(
  props: FloatingXPDropsProps,
): React.ReactElement | null {
  const {
    drops,
    topOffsetCss,
    zIndex,
    animationMs,
    accentColor,
    fontSize,
    iconFontSize,
    fontWeight,
  } = props;

  const dropStyle = useMemo<React.CSSProperties>(
    () => ({
      position: "fixed",
      left: "50%",
      top: topOffsetCss,
      transform: "translate(-50%, 132px)",
      zIndex,
      pointerEvents: "none",
      animation: `${FLOAT_UP_ANIM} ${animationMs}ms ease-out forwards`,
      display: "flex",
      alignItems: "center",
      gap: 2,
      color: accentColor,
      fontSize,
      fontWeight,
      textShadow:
        "-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 0 8px rgba(0, 0, 0, 0.8)",
      whiteSpace: "nowrap",
    }),
    [topOffsetCss, zIndex, animationMs, accentColor, fontSize, fontWeight],
  );

  const iconRowStyle = useMemo<React.CSSProperties>(
    () => ({
      display: "flex",
      alignItems: "center",
      gap: 1,
      fontSize: iconFontSize,
    }),
    [iconFontSize],
  );

  if (drops.length === 0) return null;

  return (
    <>
      <style>{KEYFRAMES}</style>
      {drops.map((drop) => (
        <div key={drop.id} style={dropStyle}>
          <span style={iconRowStyle}>
            {drop.icons.map((icon, i) => (
              <span key={`${drop.id}-icon-${i}`}>{icon}</span>
            ))}
          </span>
          <span style={{ marginLeft: 4 }}>+{Math.floor(drop.totalAmount)}</span>
        </div>
      ))}
    </>
  );
}

/**
 * Bundled registration — pairs the widget schema with its React
 * renderer.
 */
export const floatingXPDropsRegistration: WidgetRegistration<
  FloatingXPDropsProps,
  React.ComponentType<FloatingXPDropsProps>
> = {
  widget: floatingXPDropsWidget,
  Component: FloatingXPDrops,
};
