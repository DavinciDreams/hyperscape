/**
 * BuffBarWidget — row/column of active buffs and debuffs with
 * radial timer rings, stack counts, and expiry warnings.
 *
 * Phase D6.c twenty-sixth widget migration. Mirrors the legacy
 * hand-coded `BuffBar` from `packages/client/src/ui/components/`.
 * Substrate-promote: drops `useTheme` + `useAccessibilityStore` +
 * `animationDurations` imports, drops module-load
 * `document.head.appendChild` keyframe injection (replaced with an
 * inline `<style>` tag bearing a unique animation name). All theme
 * tokens become explicit color props; `reducedMotion` becomes a
 * pass-through prop the host owns.
 *
 * Adapter wiring (host responsibility):
 *
 *   ```ts
 *   <BuffBar
 *     buffs={activeBuffs}
 *     orientation="horizontal"
 *     onBuffClick={(id) => openBuffDetail(id)}
 *     reducedMotion={accessibilityStore.reducedMotion}
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

/** Buff type — drives ring color. */
export const BUFF_KINDS = ["buff", "debuff"] as const;
export type BuffKind = (typeof BUFF_KINDS)[number];

/** Orientation. */
export const BUFF_BAR_ORIENTATIONS = ["horizontal", "vertical"] as const;
export type BuffBarOrientation = (typeof BUFF_BAR_ORIENTATIONS)[number];

/** A single buff/debuff entry. */
export const buffEntrySchema = z.object({
  /** Stable id (used as React key + click target). */
  id: z.string().min(1),
  /** Display name (used in `title` tooltip). */
  name: z.string().default(""),
  /** Icon — emoji or http(s) URL. */
  icon: z.string().min(1).default("⭐"),
  /** Total duration in seconds. */
  duration: z.number().nonnegative().default(0),
  /** Remaining time in seconds. */
  remaining: z.number().nonnegative().default(0),
  /** "buff" (success-colored ring) or "debuff" (danger-colored ring). */
  type: z.enum(BUFF_KINDS).default("buff"),
  /** Stack count (renders a small badge when > 1). */
  stacks: z.number().int().min(0).default(0),
  /** Optional description (used in `title` tooltip). */
  description: z.string().default(""),
});

export type BuffEntry = z.infer<typeof buffEntrySchema>;

/** Props the widget exposes through its Zod schema. */
export const buffBarPropsSchema = z.object({
  /** Active buffs/debuffs. */
  buffs: z.array(buffEntrySchema).default(() => []),
  /** Layout direction. */
  orientation: z.enum(BUFF_BAR_ORIENTATIONS).default("horizontal"),
  /** Pixel size of each icon. */
  iconSizePx: z.number().int().min(16).max(128).default(32),
  /** Gap between icons (px). */
  gapPx: z.number().int().min(0).max(32).default(4),
  /** Show numeric timer text below each icon. */
  showTimers: z.boolean().default(true),
  /** Expiry warning threshold in seconds (legacy: 5). */
  expiringThresholdSec: z.number().nonnegative().default(5),
  /**
   * Skip the expiry-pulse animation. Hosts pass their accessibility
   * store value here.
   */
  reducedMotion: z.boolean().default(false),
  /** Buff (success) ring color. */
  buffRingColor: z.string().default("#4ade80"),
  /** Debuff (danger) ring color. */
  debuffRingColor: z.string().default("#e84545"),
  /** Ring track color (background circle). */
  trackColor: z.string().default("rgba(40, 45, 60, 0.85)"),
  /** Ring track stroke color. */
  trackStrokeColor: z.string().default("#3a3f4d"),
  /** Icon backdrop color. */
  iconBackgroundColor: z.string().default("rgba(20, 24, 36, 0.95)"),
  /** Timer text color (idle). */
  timerTextColor: z.string().default("#e6e8ec"),
  /** Timer text color (when expiring). */
  timerExpiringColor: z.string().default("#e84545"),
  /** Stack badge background. */
  stackBackgroundColor: z.string().default("#ffd84d"),
  /** Stack badge text. */
  stackTextColor: z.string().default("#0f1119"),
  /** Separator color (between buff and debuff groups). */
  separatorColor: z.string().default("#3a3f4d"),
  /** Stroke width of the timer ring. */
  ringStrokeWidth: z.number().min(1).max(8).default(3),
  /** Expiry pulse animation duration in ms. */
  pulseDurationMs: z.number().int().min(100).max(5_000).default(800),
});

export type BuffBarProps = z.infer<typeof buffBarPropsSchema>;

/** Extended runtime props — callbacks not modeled in the schema. */
export interface BuffBarRuntimeProps extends BuffBarProps {
  /** Called with the buff id when the user clicks an icon. */
  readonly onBuffClick?: (buffId: string) => void;
}

/**
 * Widget definition — registered against the host's UI registry by
 * the meta-plugin's onEnable.
 */
export const buffBarWidget: Widget<BuffBarProps> = defineWidget({
  manifest: {
    id: "com.hyperforge.hyperscape.buff-bar",
    name: "Buff Bar",
    category: "hud",
    defaultSize: { width: 36, height: 6 },
  },
  propsSchema: buffBarPropsSchema,
  defaultProps: {
    buffs: [],
    orientation: "horizontal",
    iconSizePx: 32,
    gapPx: 4,
    showTimers: true,
    expiringThresholdSec: 5,
    reducedMotion: false,
    buffRingColor: "#4ade80",
    debuffRingColor: "#e84545",
    trackColor: "rgba(40, 45, 60, 0.85)",
    trackStrokeColor: "#3a3f4d",
    iconBackgroundColor: "rgba(20, 24, 36, 0.95)",
    timerTextColor: "#e6e8ec",
    timerExpiringColor: "#e84545",
    stackBackgroundColor: "#ffd84d",
    stackTextColor: "#0f1119",
    separatorColor: "#3a3f4d",
    ringStrokeWidth: 3,
    pulseDurationMs: 800,
  },
});

const PULSE_KEYFRAMES_NAME = "hf-buff-bar-expire-pulse";
const PULSE_KEYFRAMES = `
@keyframes ${PULSE_KEYFRAMES_NAME} {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.5; }
}
`;

interface BuffIconProps {
  readonly buff: BuffEntry;
  readonly sizePx: number;
  readonly strokeWidth: number;
  readonly showTimer: boolean;
  readonly expiringThresholdSec: number;
  readonly reducedMotion: boolean;
  readonly buffRingColor: string;
  readonly debuffRingColor: string;
  readonly trackColor: string;
  readonly trackStrokeColor: string;
  readonly iconBackgroundColor: string;
  readonly timerTextColor: string;
  readonly timerExpiringColor: string;
  readonly stackBackgroundColor: string;
  readonly stackTextColor: string;
  readonly pulseDurationMs: number;
  readonly onClick?: () => void;
}

function BuffIcon(props: BuffIconProps): React.ReactElement {
  const {
    buff,
    sizePx,
    strokeWidth,
    showTimer,
    expiringThresholdSec,
    reducedMotion,
    buffRingColor,
    debuffRingColor,
    trackColor,
    trackStrokeColor,
    iconBackgroundColor,
    timerTextColor,
    timerExpiringColor,
    stackBackgroundColor,
    stackTextColor,
    pulseDurationMs,
    onClick,
  } = props;

  const progress =
    buff.duration > 0
      ? Math.max(0, Math.min(1, buff.remaining / buff.duration))
      : 0;
  const isExpiring = buff.remaining <= expiringThresholdSec;
  const radius = (sizePx - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progress);
  const ringColor = buff.type === "buff" ? buffRingColor : debuffRingColor;
  const isImageIcon =
    buff.icon.startsWith("http://") || buff.icon.startsWith("https://");

  return (
    <div
      onClick={onClick}
      title={`${buff.name}${buff.description ? `: ${buff.description}` : ""}`}
      style={{
        position: "relative",
        width: sizePx,
        height: sizePx,
        cursor: onClick ? "pointer" : "default",
        animation:
          isExpiring && !reducedMotion
            ? `${PULSE_KEYFRAMES_NAME} ${pulseDurationMs}ms ease-in-out infinite`
            : undefined,
      }}
    >
      <svg
        width={sizePx}
        height={sizePx}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          transform: "rotate(-90deg)",
        }}
      >
        <circle
          cx={sizePx / 2}
          cy={sizePx / 2}
          r={radius}
          fill={trackColor}
          stroke={trackStrokeColor}
          strokeWidth={strokeWidth}
        />
        <circle
          cx={sizePx / 2}
          cy={sizePx / 2}
          r={radius}
          fill="none"
          stroke={ringColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          style={{
            transition: reducedMotion
              ? "none"
              : "stroke-dashoffset 0.5s linear",
          }}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          top: strokeWidth,
          left: strokeWidth,
          width: sizePx - strokeWidth * 2,
          height: sizePx - strokeWidth * 2,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: sizePx * 0.5,
          borderRadius: "50%",
          overflow: "hidden",
          backgroundColor: iconBackgroundColor,
        }}
      >
        {isImageIcon ? (
          <img
            src={buff.icon}
            alt={buff.name}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          buff.icon
        )}
      </div>
      {showTimer && (
        <div
          style={{
            position: "absolute",
            bottom: -2,
            left: 0,
            right: 0,
            textAlign: "center",
            fontSize: 9,
            fontWeight: 600,
            color: isExpiring ? timerExpiringColor : timerTextColor,
            textShadow: "0 0 2px black, 0 0 2px black",
          }}
        >
          {Math.ceil(buff.remaining)}s
        </div>
      )}
      {buff.stacks > 1 && (
        <div
          style={{
            position: "absolute",
            top: -4,
            right: -4,
            minWidth: 14,
            height: 14,
            borderRadius: 7,
            backgroundColor: stackBackgroundColor,
            color: stackTextColor,
            fontSize: 9,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 3px",
          }}
        >
          {buff.stacks}
        </div>
      )}
    </div>
  );
}

/**
 * React component. Splits the input array into buffs and debuffs,
 * renders buffs first, then a separator if both groups exist, then
 * debuffs. Each icon is rendered with a radial timer ring tied to
 * `remaining / duration`.
 */
export function BuffBar(props: BuffBarRuntimeProps): React.ReactElement {
  const {
    buffs,
    orientation,
    iconSizePx,
    gapPx,
    showTimers,
    expiringThresholdSec,
    reducedMotion,
    buffRingColor,
    debuffRingColor,
    trackColor,
    trackStrokeColor,
    iconBackgroundColor,
    timerTextColor,
    timerExpiringColor,
    stackBackgroundColor,
    stackTextColor,
    separatorColor,
    ringStrokeWidth,
    pulseDurationMs,
    onBuffClick,
  } = props;

  const buffList = buffs.filter((b) => b.type === "buff");
  const debuffList = buffs.filter((b) => b.type === "debuff");

  const renderIcon = (buff: BuffEntry): React.ReactElement => (
    <BuffIcon
      key={buff.id}
      buff={buff}
      sizePx={iconSizePx}
      strokeWidth={ringStrokeWidth}
      showTimer={showTimers}
      expiringThresholdSec={expiringThresholdSec}
      reducedMotion={reducedMotion}
      buffRingColor={buffRingColor}
      debuffRingColor={debuffRingColor}
      trackColor={trackColor}
      trackStrokeColor={trackStrokeColor}
      iconBackgroundColor={iconBackgroundColor}
      timerTextColor={timerTextColor}
      timerExpiringColor={timerExpiringColor}
      stackBackgroundColor={stackBackgroundColor}
      stackTextColor={stackTextColor}
      pulseDurationMs={pulseDurationMs}
      onClick={onBuffClick ? () => onBuffClick(buff.id) : undefined}
    />
  );

  return (
    <>
      <style>{PULSE_KEYFRAMES}</style>
      <div
        role="region"
        aria-label="Active buffs and debuffs"
        style={{
          display: "flex",
          flexDirection: orientation === "horizontal" ? "row" : "column",
          gap: gapPx,
          alignItems: "flex-start",
          fontFamily:
            "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif",
        }}
      >
        {buffList.map(renderIcon)}
        {buffList.length > 0 && debuffList.length > 0 && (
          <div
            style={{
              width: orientation === "horizontal" ? 1 : "100%",
              height: orientation === "horizontal" ? iconSizePx : 1,
              backgroundColor: separatorColor,
              margin:
                orientation === "horizontal"
                  ? `0 ${gapPx / 2}px`
                  : `${gapPx / 2}px 0`,
            }}
          />
        )}
        {debuffList.map(renderIcon)}
      </div>
    </>
  );
}

/**
 * Bundled registration — pairs the widget schema with its React
 * renderer.
 */
export const buffBarRegistration: WidgetRegistration<
  BuffBarProps,
  React.ComponentType<BuffBarProps>
> = {
  widget: buffBarWidget,
  Component: BuffBar as React.ComponentType<BuffBarProps>,
};
