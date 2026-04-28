/**
 * CheckboxWidget — labeled checkbox with optional indeterminate state.
 *
 * Phase D6.c forty-third widget migration. New foundational
 * primitive (no single legacy callsite — the codebase inlines
 * native `<input type="checkbox">` markup per use site, often
 * inside multi-select lists, "remember me" rows, agreement
 * checkboxes, batch-action toggles, etc.). Substrate-promote: zero
 * theme-store dependency, all colors as explicit props,
 * keyboard-accessible by default.
 *
 * Differs from ToggleSwitch (slice 62) in shape and intent:
 *   - ToggleSwitch is a sliding pill — typically for system-level
 *     binary settings ("Reduced Motion: ON/OFF").
 *   - Checkbox is a discrete check box — typically for inline
 *     selection/agreement rows or multi-select lists.
 *
 * Adapter wiring (host responsibility):
 *
 *   ```ts
 *   <Checkbox
 *     label="I agree to the terms"
 *     checked={agreed}
 *     onChange={(next) => setAgreed(next)}
 *   />
 *   ```
 */

import {
  defineWidget,
  type Widget,
  type WidgetRegistration,
} from "@hyperforge/ui-framework";
import React, { useId } from "react";
import { z } from "zod";

/** Props the widget exposes through its Zod schema. */
export const checkboxPropsSchema = z.object({
  /** Current checked state. */
  checked: z.boolean().default(false),
  /**
   * Indeterminate state — overrides the visual to show a dash mark
   * instead of a check. `aria-checked="mixed"`. Click still toggles
   * `checked` via `onChange`.
   */
  indeterminate: z.boolean().default(false),
  /** Disabled flag. */
  disabled: z.boolean().default(false),
  /** Label text. Empty hides the label. */
  label: z.string().default(""),
  /** Optional sub-label / description below the label. */
  description: z.string().default(""),
  /** Pixel size of the box (square). */
  sizePx: z.number().int().min(12).max(48).default(18),
  /** Box background (unchecked). */
  uncheckedBackgroundColor: z.string().default("rgba(20, 24, 36, 0.85)"),
  /** Box background (checked). */
  checkedBackgroundColor: z.string().default("#ffd84d"),
  /** Box border (unchecked). */
  uncheckedBorderColor: z.string().default("#3a3f4d"),
  /** Box border (checked). */
  checkedBorderColor: z.string().default("#ffd84d"),
  /** Check mark color. */
  checkColor: z.string().default("#0f1119"),
  /** Label text color. */
  labelColor: z.string().default("#e6e8ec"),
  /** Description text color. */
  descriptionColor: z.string().default("#a8aec0"),
  /** Label font size (px). */
  labelFontSize: z.number().int().min(8).max(48).default(13),
  /** Description font size (px). */
  descriptionFontSize: z.number().int().min(8).max(48).default(11),
  /** Corner radius of the box (px). */
  borderRadiusPx: z.number().int().min(0).max(16).default(3),
});

export type CheckboxProps = z.infer<typeof checkboxPropsSchema>;

/** Extended runtime props — callbacks not modeled in the schema. */
export interface CheckboxRuntimeProps extends CheckboxProps {
  /** Called with the new state when the user clicks or presses Space. */
  readonly onChange?: (checked: boolean) => void;
}

/**
 * Widget definition — registered against the host's UI registry by
 * the meta-plugin's onEnable.
 */
export const checkboxWidget: Widget<CheckboxProps> = defineWidget({
  manifest: {
    id: "com.hyperforge.hyperscape.checkbox",
    name: "Checkbox",
    category: "panel",
    defaultSize: { width: 24, height: 4 },
  },
  propsSchema: checkboxPropsSchema,
  defaultProps: {
    checked: false,
    indeterminate: false,
    disabled: false,
    label: "",
    description: "",
    sizePx: 18,
    uncheckedBackgroundColor: "rgba(20, 24, 36, 0.85)",
    checkedBackgroundColor: "#ffd84d",
    uncheckedBorderColor: "#3a3f4d",
    checkedBorderColor: "#ffd84d",
    checkColor: "#0f1119",
    labelColor: "#e6e8ec",
    descriptionColor: "#a8aec0",
    labelFontSize: 13,
    descriptionFontSize: 11,
    borderRadiusPx: 3,
  },
});

/**
 * React component. Click anywhere on the row toggles. Native
 * `role="checkbox"` semantics with `aria-checked` (true/false/
 * "mixed" for indeterminate).
 */
export function Checkbox(props: CheckboxRuntimeProps): React.ReactElement {
  const {
    checked,
    indeterminate,
    disabled,
    label,
    description,
    sizePx,
    uncheckedBackgroundColor,
    checkedBackgroundColor,
    uncheckedBorderColor,
    checkedBorderColor,
    checkColor,
    labelColor,
    descriptionColor,
    labelFontSize,
    descriptionFontSize,
    borderRadiusPx,
    onChange,
  } = props;

  const reactId = useId();
  const labelId = `${reactId}-label`;
  const descId = `${reactId}-desc`;

  const ariaChecked: boolean | "mixed" = indeterminate ? "mixed" : checked;
  const visuallyChecked = checked || indeterminate;

  const handleToggle = (): void => {
    if (disabled) return;
    onChange?.(!checked);
  };

  const handleKey = (e: React.KeyboardEvent): void => {
    if (disabled) return;
    if (e.key === " ") {
      e.preventDefault();
      onChange?.(!checked);
    }
  };

  const checkSize = Math.max(8, Math.floor(sizePx * 0.65));

  return (
    <div
      role="checkbox"
      tabIndex={disabled ? -1 : 0}
      aria-checked={ariaChecked}
      aria-disabled={disabled}
      aria-labelledby={label ? labelId : undefined}
      aria-describedby={description ? descId : undefined}
      onClick={handleToggle}
      onKeyDown={handleKey}
      style={{
        display: "inline-flex",
        alignItems: "flex-start",
        gap: 8,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        userSelect: "none",
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif",
      }}
    >
      <div
        style={{
          width: sizePx,
          height: sizePx,
          flexShrink: 0,
          marginTop: label ? Math.max(0, (labelFontSize - sizePx) / 2 + 2) : 0,
          background: visuallyChecked
            ? checkedBackgroundColor
            : uncheckedBackgroundColor,
          border: `1px solid ${
            visuallyChecked ? checkedBorderColor : uncheckedBorderColor
          }`,
          borderRadius: borderRadiusPx,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "background 120ms ease, border-color 120ms ease",
        }}
      >
        {indeterminate ? (
          <div
            style={{
              width: checkSize,
              height: 2,
              background: checkColor,
              borderRadius: 1,
            }}
          />
        ) : checked ? (
          <svg
            width={checkSize}
            height={checkSize}
            viewBox="0 0 16 16"
            fill="none"
            stroke={checkColor}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="3,8 7,12 13,4" />
          </svg>
        ) : null}
      </div>
      {(label || description) && (
        <div style={{ minWidth: 0 }}>
          {label && (
            <div
              id={labelId}
              style={{
                fontSize: labelFontSize,
                fontWeight: 500,
                color: labelColor,
                lineHeight: 1.3,
              }}
            >
              {label}
            </div>
          )}
          {description && (
            <div
              id={descId}
              style={{
                fontSize: descriptionFontSize,
                color: descriptionColor,
                marginTop: 2,
                lineHeight: 1.4,
              }}
            >
              {description}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Bundled registration — pairs the widget schema with its React
 * renderer.
 */
export const checkboxRegistration: WidgetRegistration<
  CheckboxProps,
  React.ComponentType<CheckboxProps>
> = {
  widget: checkboxWidget,
  Component: Checkbox as React.ComponentType<CheckboxProps>,
};
