/**
 * SelectOptionWidget — themed `<select>` dropdown.
 *
 * Phase D6.c fourteenth widget migration. Mirrors the legacy
 * hand-coded `SelectOption` from the SettingsPanel. Substrate-
 * promote: the legacy component subscribes to a theme store. The
 * widget receives all theme tokens as explicit color props.
 *
 * Adapter wiring (host responsibility):
 *
 *   ```ts
 *   <SelectOption
 *     options={[
 *       { label: "Low",    value: "low" },
 *       { label: "Medium", value: "medium" },
 *       { label: "High",   value: "high" },
 *     ]}
 *     value={quality}
 *     onChange={(next) => setQuality(next as Quality)}
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

/** A single option entry. */
export const selectOptionEntrySchema = z.object({
  /** Visible text. */
  label: z.string().min(1),
  /** Returned value. */
  value: z.string().min(1),
});

export type SelectOptionEntry = z.infer<typeof selectOptionEntrySchema>;

/** Props the widget exposes through its Zod schema. */
export const selectOptionPropsSchema = z.object({
  /** Option list. */
  options: z.array(selectOptionEntrySchema).default(() => []),
  /** Current selected value. */
  value: z.string().default(""),
  /** Optional DOM `id` attribute (useful for `<label htmlFor>`). */
  id: z.string().optional(),
  /** Background color (theme.colors.background.panelSecondary). */
  backgroundColor: z.string().default("rgba(40, 45, 60, 0.85)"),
  /** Text color (theme.colors.text.primary). */
  textColor: z.string().default("#e6e8ec"),
  /** Border color (theme.colors.border.default). */
  borderColor: z.string().default("#3a3f4d"),
  /** Font size (px). */
  fontSize: z.number().int().min(8).max(48).default(14),
  /** Vertical padding (px). */
  paddingYPx: z.number().int().min(0).max(64).default(4),
  /** Horizontal padding (px). */
  paddingXPx: z.number().int().min(0).max(64).default(8),
  /** Corner radius (px). */
  borderRadiusPx: z.number().int().min(0).max(32).default(4),
});

export type SelectOptionProps = z.infer<typeof selectOptionPropsSchema>;

/** Extended runtime props — callback not modeled in the schema. */
export interface SelectOptionRuntimeProps extends SelectOptionProps {
  /** Called with the new value when the user picks an option. */
  readonly onChange?: (value: string) => void;
}

/**
 * Widget definition — registered against the host's UI registry by
 * the meta-plugin's onEnable.
 */
export const selectOptionWidget: Widget<SelectOptionProps> = defineWidget({
  manifest: {
    id: "com.hyperforge.hyperscape.select-option",
    name: "Select Option",
    category: "panel",
    defaultSize: { width: 16, height: 4 },
  },
  propsSchema: selectOptionPropsSchema,
  defaultProps: {
    options: [],
    value: "",
    backgroundColor: "rgba(40, 45, 60, 0.85)",
    textColor: "#e6e8ec",
    borderColor: "#3a3f4d",
    fontSize: 14,
    paddingYPx: 4,
    paddingXPx: 8,
    borderRadiusPx: 4,
  },
});

/**
 * React component. Native `<select>` with theme-overridable colors.
 * Hosts handle `onChange` and pass `value` back through props.
 */
export function SelectOption(
  props: SelectOptionRuntimeProps,
): React.ReactElement {
  const {
    options,
    value,
    id,
    backgroundColor,
    textColor,
    borderColor,
    fontSize,
    paddingYPx,
    paddingXPx,
    borderRadiusPx,
    onChange,
  } = props;

  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      style={{
        padding: `${paddingYPx}px ${paddingXPx}px`,
        borderRadius: borderRadiusPx,
        fontSize,
        cursor: "pointer",
        backgroundColor,
        color: textColor,
        border: `1px solid ${borderColor}`,
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif",
        outline: "none",
      }}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

/**
 * Bundled registration — pairs the widget schema with its React
 * renderer.
 */
export const selectOptionRegistration: WidgetRegistration<
  SelectOptionProps,
  React.ComponentType<SelectOptionProps>
> = {
  widget: selectOptionWidget,
  Component: SelectOption as React.ComponentType<SelectOptionProps>,
};
