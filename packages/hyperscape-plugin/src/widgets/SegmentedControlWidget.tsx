/**
 * SegmentedControlWidget — single-choice button strip (radio-button
 * group rendered as tabs).
 *
 * Phase D6.c thirty-fifth widget migration. New foundational
 * primitive (no single legacy callsite — the codebase inlines
 * "active tab" button strips per use site, often inside settings
 * tabs, attack-style switchers, sort selectors, etc.). Substrate-
 * promote: zero theme-store dependency, all colors as explicit
 * props, keyboard-accessible (Arrow Left/Right cycles selection).
 *
 * Adapter wiring (host responsibility):
 *
 *   ```ts
 *   <SegmentedControl
 *     options={[
 *       { id: "stab",   label: "Stab" },
 *       { id: "slash",  label: "Slash" },
 *       { id: "crush",  label: "Crush" },
 *     ]}
 *     value={attackStyle}
 *     onChange={(next) => setAttackStyle(next)}
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

/** Layout direction. */
export const SEGMENTED_CONTROL_ORIENTATIONS = [
  "horizontal",
  "vertical",
] as const;
export type SegmentedControlOrientation =
  (typeof SEGMENTED_CONTROL_ORIENTATIONS)[number];

/** A single segment option. */
export const segmentedOptionSchema = z.object({
  /** Stable id used as the React key + onChange payload. */
  id: z.string().min(1),
  /** Visible label. */
  label: z.string().min(1),
  /** Optional leading icon glyph. */
  icon: z.string().default(""),
  /** When true, the segment is rendered dimmed and click-suppressed. */
  disabled: z.boolean().default(false),
});

export type SegmentedOption = z.infer<typeof segmentedOptionSchema>;

/** Props the widget exposes through its Zod schema. */
export const segmentedControlPropsSchema = z.object({
  /** Option list. */
  options: z.array(segmentedOptionSchema).default(() => []),
  /** Currently selected option id. */
  value: z.string().default(""),
  /** Layout direction. */
  orientation: z.enum(SEGMENTED_CONTROL_ORIENTATIONS).default("horizontal"),
  /** Optional aria-label for the group. */
  ariaLabel: z.string().default(""),
  /** Container background. */
  backgroundColor: z.string().default("rgba(20, 24, 36, 0.85)"),
  /** Container border color. */
  borderColor: z.string().default("#3a3f4d"),
  /** Container corner radius (px). */
  borderRadiusPx: z.number().int().min(0).max(32).default(6),
  /** Inactive segment text color. */
  textColor: z.string().default("#a8aec0"),
  /** Active segment background. */
  activeBackgroundColor: z.string().default("rgba(255, 216, 77, 0.15)"),
  /** Active segment text color. */
  activeTextColor: z.string().default("#ffd84d"),
  /** Hover background for inactive segments. */
  hoverBackgroundColor: z.string().default("rgba(255, 255, 255, 0.04)"),
  /** Vertical padding (px). */
  paddingYPx: z.number().int().min(0).max(32).default(6),
  /** Horizontal padding (px). */
  paddingXPx: z.number().int().min(0).max(64).default(12),
  /** Font size (px). */
  fontSize: z.number().int().min(8).max(48).default(12),
  /** Disabled segment opacity. */
  disabledOpacity: z.number().min(0).max(1).default(0.4),
});

export type SegmentedControlProps = z.infer<typeof segmentedControlPropsSchema>;

/** Extended runtime props — callbacks not modeled in the schema. */
export interface SegmentedControlRuntimeProps extends SegmentedControlProps {
  /** Called with the new id when the user picks a segment. */
  readonly onChange?: (id: string) => void;
}

/**
 * Widget definition — registered against the host's UI registry by
 * the meta-plugin's onEnable.
 */
export const segmentedControlWidget: Widget<SegmentedControlProps> =
  defineWidget({
    manifest: {
      id: "com.hyperforge.hyperscape.segmented-control",
      name: "Segmented Control",
      category: "panel",
      defaultSize: { width: 32, height: 6 },
    },
    propsSchema: segmentedControlPropsSchema,
    defaultProps: {
      options: [],
      value: "",
      orientation: "horizontal",
      ariaLabel: "",
      backgroundColor: "rgba(20, 24, 36, 0.85)",
      borderColor: "#3a3f4d",
      borderRadiusPx: 6,
      textColor: "#a8aec0",
      activeBackgroundColor: "rgba(255, 216, 77, 0.15)",
      activeTextColor: "#ffd84d",
      hoverBackgroundColor: "rgba(255, 255, 255, 0.04)",
      paddingYPx: 6,
      paddingXPx: 12,
      fontSize: 12,
      disabledOpacity: 0.4,
    },
  });

/**
 * Find the next/previous enabled option index. Wraps around at
 * either end. Skips disabled entries. Returns the input index when
 * no enabled option exists.
 */
export function nextEnabledIndex(
  options: ReadonlyArray<{ disabled?: boolean }>,
  fromIndex: number,
  direction: 1 | -1,
): number {
  const n = options.length;
  if (n === 0) return fromIndex;
  let i = fromIndex;
  for (let step = 0; step < n; step++) {
    i = (i + direction + n) % n;
    if (!options[i]?.disabled) return i;
  }
  return fromIndex;
}

/**
 * React component. Renders a row/column of segments. Uses
 * `role="radiogroup"` + `role="radio"` semantics for accessibility.
 * Arrow Left/Right (or Up/Down for vertical) cycles selection
 * through enabled options.
 */
export function SegmentedControl(
  props: SegmentedControlRuntimeProps,
): React.ReactElement {
  const {
    options,
    value,
    orientation,
    ariaLabel,
    backgroundColor,
    borderColor,
    borderRadiusPx,
    textColor,
    activeBackgroundColor,
    activeTextColor,
    hoverBackgroundColor,
    paddingYPx,
    paddingXPx,
    fontSize,
    disabledOpacity,
    onChange,
  } = props;

  const [hoverId, setHoverId] = React.useState<string | null>(null);
  const isHorizontal = orientation === "horizontal";

  const handleKey = (e: React.KeyboardEvent): void => {
    const cycleNext =
      (isHorizontal && e.key === "ArrowRight") ||
      (!isHorizontal && e.key === "ArrowDown");
    const cyclePrev =
      (isHorizontal && e.key === "ArrowLeft") ||
      (!isHorizontal && e.key === "ArrowUp");
    if (!cycleNext && !cyclePrev) return;
    e.preventDefault();
    const currentIndex = options.findIndex((o) => o.id === value);
    const nextIndex = nextEnabledIndex(
      options,
      currentIndex < 0 ? 0 : currentIndex,
      cycleNext ? 1 : -1,
    );
    const nextOpt = options[nextIndex];
    if (nextOpt) onChange?.(nextOpt.id);
  };

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel || undefined}
      onKeyDown={handleKey}
      style={{
        display: "inline-flex",
        flexDirection: isHorizontal ? "row" : "column",
        background: backgroundColor,
        border: `1px solid ${borderColor}`,
        borderRadius: borderRadiusPx,
        overflow: "hidden",
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif",
      }}
    >
      {options.map((opt) => {
        const isActive = opt.id === value;
        const isHover = hoverId === opt.id;
        const isInteractive = !opt.disabled;
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-disabled={opt.disabled}
            tabIndex={isActive ? 0 : -1}
            disabled={opt.disabled}
            onClick={() => isInteractive && onChange?.(opt.id)}
            onMouseEnter={() => isInteractive && setHoverId(opt.id)}
            onMouseLeave={() => setHoverId(null)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: `${paddingYPx}px ${paddingXPx}px`,
              border: "none",
              background: isActive
                ? activeBackgroundColor
                : isHover
                  ? hoverBackgroundColor
                  : "transparent",
              color: isActive ? activeTextColor : textColor,
              fontSize,
              fontWeight: isActive ? 600 : 500,
              cursor: opt.disabled ? "not-allowed" : "pointer",
              opacity: opt.disabled ? disabledOpacity : 1,
              transition: "background 120ms ease, color 120ms ease",
              fontFamily: "inherit",
              whiteSpace: "nowrap",
            }}
          >
            {opt.icon && <span>{opt.icon}</span>}
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Bundled registration — pairs the widget schema with its React
 * renderer.
 */
export const segmentedControlRegistration: WidgetRegistration<
  SegmentedControlProps,
  React.ComponentType<SegmentedControlProps>
> = {
  widget: segmentedControlWidget,
  Component: SegmentedControl as React.ComponentType<SegmentedControlProps>,
};
