/**
 * CountdownDisplayWidget — formatted time-remaining readout (mm:ss
 * or hh:mm:ss) with optional label and warning state.
 *
 * Phase D6.c forty-first widget migration. New foundational
 * primitive (no single legacy callsite — the codebase inlines
 * `Math.floor(remaining / 60)`-style formatting per use site,
 * often inside duel countdowns, cooldown timers, event timers,
 * disconnect countdowns, etc.). Substrate-promote: zero theme-
 * store dependency, all colors as explicit props, color flips when
 * remaining time crosses a configurable warning threshold.
 *
 * Adapter wiring (host responsibility):
 *
 *   ```ts
 *   const [secondsLeft, setSecondsLeft] = useState(60);
 *   useEffect(() => {
 *     const id = setInterval(() => setSecondsLeft(s => Math.max(0, s - 1)), 1000);
 *     return () => clearInterval(id);
 *   }, []);
 *
 *   <CountdownDisplay
 *     label="Match starts in"
 *     totalSeconds={secondsLeft}
 *     warningAtSeconds={10}
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

/** Output format. */
export const COUNTDOWN_FORMATS = ["mm:ss", "hh:mm:ss", "auto"] as const;
export type CountdownFormat = (typeof COUNTDOWN_FORMATS)[number];

/** Props the widget exposes through its Zod schema. */
export const countdownDisplayPropsSchema = z.object({
  /** Total seconds remaining. Negative values clamp to 0. */
  totalSeconds: z.number().default(0),
  /** Optional label rendered before the time. Empty hides it. */
  label: z.string().default(""),
  /**
   * Output format:
   *   - `"mm:ss"` always renders minutes:seconds (overflow-friendly).
   *   - `"hh:mm:ss"` always renders hours:minutes:seconds.
   *   - `"auto"` (default) picks `hh:mm:ss` when ≥ 1 hour, else
   *     `mm:ss`.
   */
  format: z.enum(COUNTDOWN_FORMATS).default("auto"),
  /**
   * Render the time text in the warning color when `totalSeconds`
   * crosses below this threshold.
   */
  warningAtSeconds: z.number().nonnegative().default(0),
  /**
   * When true, the time text pulses (opacity 1 → 0.5 → 1) once
   * the warning threshold is crossed.
   */
  pulseOnWarning: z.boolean().default(true),
  /** Pulse animation duration (ms). */
  pulseDurationMs: z.number().int().min(100).max(5_000).default(800),
  /** Label color. */
  labelColor: z.string().default("#a8aec0"),
  /** Time-text color (idle). */
  timeColor: z.string().default("#e6e8ec"),
  /** Time-text color when below the warning threshold. */
  warningColor: z.string().default("#e84545"),
  /** Label font size (px). */
  labelFontSize: z.number().int().min(8).max(48).default(12),
  /** Time font size (px). */
  timeFontSize: z.number().int().min(8).max(96).default(16),
  /** Use a monospace font for the time digits to prevent jitter. */
  monospace: z.boolean().default(true),
  /** Font weight for the time text. */
  timeFontWeight: z.union([z.number().int(), z.string()]).default(700),
});

export type CountdownDisplayProps = z.infer<typeof countdownDisplayPropsSchema>;

/**
 * Format a seconds count as a readable time string.
 *
 *   formatCountdown(0)            → "0:00"
 *   formatCountdown(45)           → "0:45"
 *   formatCountdown(125)          → "2:05"
 *   formatCountdown(3725)         → "1:02:05"   (auto picks hh:mm:ss)
 *   formatCountdown(3725, "mm:ss") → "62:05"     (overflow allowed)
 */
export function formatCountdown(
  totalSeconds: number,
  format: CountdownFormat = "auto",
): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe - hours * 3600) / 60);
  const seconds = safe - hours * 3600 - minutes * 60;
  const ss = String(seconds).padStart(2, "0");
  const useHours = format === "hh:mm:ss" || (format === "auto" && hours > 0);
  if (useHours) {
    const mm = String(minutes).padStart(2, "0");
    return `${hours}:${mm}:${ss}`;
  }
  // mm:ss — keep minutes overflow-friendly when format = "mm:ss"
  if (format === "mm:ss") {
    return `${minutes + hours * 60}:${ss}`;
  }
  return `${minutes}:${ss}`;
}

/**
 * Widget definition — registered against the host's UI registry by
 * the meta-plugin's onEnable.
 */
export const countdownDisplayWidget: Widget<CountdownDisplayProps> =
  defineWidget({
    manifest: {
      id: "com.hyperforge.hyperscape.countdown-display",
      name: "Countdown Display",
      category: "panel",
      defaultSize: { width: 12, height: 4 },
    },
    propsSchema: countdownDisplayPropsSchema,
    defaultProps: {
      totalSeconds: 0,
      label: "",
      format: "auto",
      warningAtSeconds: 0,
      pulseOnWarning: true,
      pulseDurationMs: 800,
      labelColor: "#a8aec0",
      timeColor: "#e6e8ec",
      warningColor: "#e84545",
      labelFontSize: 12,
      timeFontSize: 16,
      monospace: true,
      timeFontWeight: 700,
    },
  });

const PULSE_KEYFRAMES_NAME = "hf-countdown-display-pulse";
const PULSE_KEYFRAMES = `
@keyframes ${PULSE_KEYFRAMES_NAME} {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.5; }
}
`;

const SANS_FONT_FAMILY =
  "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif";
const MONO_FONT_FAMILY =
  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

/**
 * React component. Renders a label + formatted time pair. Switches
 * the time color and (optionally) starts a pulse animation when
 * `totalSeconds` crosses below `warningAtSeconds`.
 */
export function CountdownDisplay(
  props: CountdownDisplayProps,
): React.ReactElement {
  const {
    totalSeconds,
    label,
    format,
    warningAtSeconds,
    pulseOnWarning,
    pulseDurationMs,
    labelColor,
    timeColor,
    warningColor,
    labelFontSize,
    timeFontSize,
    monospace,
    timeFontWeight,
  } = props;

  const text = formatCountdown(totalSeconds, format);
  const isWarning = warningAtSeconds > 0 && totalSeconds <= warningAtSeconds;
  const fontFamily = monospace ? MONO_FONT_FAMILY : SANS_FONT_FAMILY;

  return (
    <>
      {pulseOnWarning && isWarning && <style>{PULSE_KEYFRAMES}</style>}
      <div
        role="timer"
        aria-live="off"
        aria-atomic="true"
        style={{
          display: "inline-flex",
          alignItems: "baseline",
          gap: 6,
          fontFamily: SANS_FONT_FAMILY,
        }}
      >
        {label && (
          <span style={{ color: labelColor, fontSize: labelFontSize }}>
            {label}
          </span>
        )}
        <span
          style={{
            color: isWarning ? warningColor : timeColor,
            fontSize: timeFontSize,
            fontFamily,
            fontWeight: timeFontWeight,
            fontVariantNumeric: monospace ? "tabular-nums" : undefined,
            animation:
              pulseOnWarning && isWarning
                ? `${PULSE_KEYFRAMES_NAME} ${pulseDurationMs}ms ease-in-out infinite`
                : undefined,
          }}
        >
          {text}
        </span>
      </div>
    </>
  );
}

/**
 * Bundled registration — pairs the widget schema with its React
 * renderer.
 */
export const countdownDisplayRegistration: WidgetRegistration<
  CountdownDisplayProps,
  React.ComponentType<CountdownDisplayProps>
> = {
  widget: countdownDisplayWidget,
  Component: CountdownDisplay,
};
