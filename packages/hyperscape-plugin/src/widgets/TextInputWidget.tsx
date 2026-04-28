/**
 * TextInputWidget — labeled text/email/password/number input.
 *
 * Phase D6.c thirty-sixth widget migration. New foundational
 * primitive (no single legacy callsite — the codebase inlines
 * native `<input>` styling per use site, often inside auth forms,
 * naming dialogs, search bars, etc.). Substrate-promote: zero
 * theme-store dependency, all colors as explicit props,
 * keyboard-accessible by default (native input semantics).
 *
 * Adapter wiring (host responsibility):
 *
 *   ```ts
 *   <TextInput
 *     label="Display name"
 *     placeholder="Enter your name"
 *     value={name}
 *     onChange={(next) => setName(next)}
 *     required
 *     autoFocus
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

/** Supported native input types (subset). */
export const TEXT_INPUT_TYPES = [
  "text",
  "email",
  "password",
  "number",
  "search",
  "url",
  "tel",
] as const;
export type TextInputType = (typeof TEXT_INPUT_TYPES)[number];

/** Props the widget exposes through its Zod schema. */
export const textInputPropsSchema = z.object({
  /** Current value. */
  value: z.string().default(""),
  /** Native input type. */
  type: z.enum(TEXT_INPUT_TYPES).default("text"),
  /** Placeholder shown when empty. */
  placeholder: z.string().default(""),
  /** Optional left-side label. */
  label: z.string().default(""),
  /** Optional sub-label / description below the label. */
  description: z.string().default(""),
  /** Required flag — renders a `*` after the label. */
  required: z.boolean().default(false),
  /** Disabled flag. */
  disabled: z.boolean().default(false),
  /** Autofocus on mount. */
  autoFocus: z.boolean().default(false),
  /** Optional error message rendered below the input. */
  error: z.string().default(""),
  /**
   * Optional max length (only applied when > 0).
   */
  maxLength: z.number().int().min(0).max(10_000).default(0),
  /** Optional leading icon glyph rendered inside the input. */
  leadingIcon: z.string().default(""),
  /** Background color. */
  backgroundColor: z.string().default("rgba(20, 24, 36, 0.85)"),
  /** Border color (idle). */
  borderColor: z.string().default("#3a3f4d"),
  /** Border color when focused. */
  focusBorderColor: z.string().default("#ffd84d"),
  /** Border color when `error` is non-empty. */
  errorBorderColor: z.string().default("#e84545"),
  /** Text color. */
  textColor: z.string().default("#e6e8ec"),
  /** Placeholder color. */
  placeholderColor: z.string().default("#6e7585"),
  /** Label color. */
  labelColor: z.string().default("#e6e8ec"),
  /** Description color. */
  descriptionColor: z.string().default("#a8aec0"),
  /** Required-marker color. */
  requiredMarkerColor: z.string().default("#e84545"),
  /** Error message color. */
  errorTextColor: z.string().default("#fca5a5"),
  /** Leading-icon color. */
  iconColor: z.string().default("#a8aec0"),
  /** Font size (px). */
  fontSize: z.number().int().min(8).max(48).default(13),
  /** Vertical padding (px). */
  paddingYPx: z.number().int().min(0).max(32).default(8),
  /** Horizontal padding (px). */
  paddingXPx: z.number().int().min(0).max(32).default(10),
  /** Corner radius (px). */
  borderRadiusPx: z.number().int().min(0).max(32).default(6),
});

export type TextInputProps = z.infer<typeof textInputPropsSchema>;

/** Extended runtime props — callbacks not modeled in the schema. */
export interface TextInputRuntimeProps extends TextInputProps {
  /** Called with the new value on every input change. */
  readonly onChange?: (value: string) => void;
  /** Called when the input loses focus. */
  readonly onBlur?: () => void;
  /** Called when the user presses Enter inside the input. */
  readonly onSubmit?: (value: string) => void;
}

/**
 * Widget definition — registered against the host's UI registry by
 * the meta-plugin's onEnable.
 */
export const textInputWidget: Widget<TextInputProps> = defineWidget({
  manifest: {
    id: "com.hyperforge.hyperscape.text-input",
    name: "Text Input",
    category: "panel",
    defaultSize: { width: 32, height: 6 },
  },
  propsSchema: textInputPropsSchema,
  defaultProps: {
    value: "",
    type: "text",
    placeholder: "",
    label: "",
    description: "",
    required: false,
    disabled: false,
    autoFocus: false,
    error: "",
    maxLength: 0,
    leadingIcon: "",
    backgroundColor: "rgba(20, 24, 36, 0.85)",
    borderColor: "#3a3f4d",
    focusBorderColor: "#ffd84d",
    errorBorderColor: "#e84545",
    textColor: "#e6e8ec",
    placeholderColor: "#6e7585",
    labelColor: "#e6e8ec",
    descriptionColor: "#a8aec0",
    requiredMarkerColor: "#e84545",
    errorTextColor: "#fca5a5",
    iconColor: "#a8aec0",
    fontSize: 13,
    paddingYPx: 8,
    paddingXPx: 10,
    borderRadiusPx: 6,
  },
});

/** Unique id-suffix for the placeholder color CSS rule. */
const PLACEHOLDER_RULE_NAME = "hf-text-input-placeholder";

/**
 * React component. Renders an optional label/description block,
 * the native input wrapped in a styled container, and an optional
 * error message below.
 */
export function TextInput(props: TextInputRuntimeProps): React.ReactElement {
  const {
    value,
    type,
    placeholder,
    label,
    description,
    required,
    disabled,
    autoFocus,
    error,
    maxLength,
    leadingIcon,
    backgroundColor,
    borderColor,
    focusBorderColor,
    errorBorderColor,
    textColor,
    placeholderColor,
    labelColor,
    descriptionColor,
    requiredMarkerColor,
    errorTextColor,
    iconColor,
    fontSize,
    paddingYPx,
    paddingXPx,
    borderRadiusPx,
    onChange,
    onBlur,
    onSubmit,
  } = props;

  const reactId = useId();
  const inputId = `${reactId}-input`;
  const descId = `${reactId}-desc`;
  const errorId = `${reactId}-err`;
  const [focused, setFocused] = React.useState(false);

  const hasError = error.length > 0;
  const activeBorderColor = hasError
    ? errorBorderColor
    : focused
      ? focusBorderColor
      : borderColor;

  // Placeholder color is only stylable via CSS pseudo-class — emit a
  // scoped rule that targets the input via id.
  const placeholderRule = `
#${inputId}.${PLACEHOLDER_RULE_NAME}::placeholder { color: ${placeholderColor}; opacity: 1; }
  `;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        opacity: disabled ? 0.5 : 1,
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif",
      }}
    >
      <style>{placeholderRule}</style>
      {label && (
        <label
          htmlFor={inputId}
          style={{
            fontSize,
            fontWeight: 500,
            color: labelColor,
          }}
        >
          {label}
          {required && (
            <span style={{ color: requiredMarkerColor, marginLeft: 4 }}>*</span>
          )}
        </label>
      )}
      {description && (
        <span
          id={descId}
          style={{
            fontSize: Math.max(8, fontSize - 2),
            color: descriptionColor,
          }}
        >
          {description}
        </span>
      )}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: `${paddingYPx}px ${paddingXPx}px`,
          background: backgroundColor,
          border: `1px solid ${activeBorderColor}`,
          borderRadius: borderRadiusPx,
          transition: "border-color 120ms ease",
        }}
      >
        {leadingIcon && (
          <span style={{ fontSize, color: iconColor }} aria-hidden="true">
            {leadingIcon}
          </span>
        )}
        <input
          id={inputId}
          className={PLACEHOLDER_RULE_NAME}
          type={type}
          value={value}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          autoFocus={autoFocus}
          maxLength={maxLength > 0 ? maxLength : undefined}
          aria-invalid={hasError}
          aria-describedby={
            description && error
              ? `${descId} ${errorId}`
              : description
                ? descId
                : error
                  ? errorId
                  : undefined
          }
          onChange={(e) => onChange?.(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            onBlur?.();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSubmit?.(value);
          }}
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            color: textColor,
            fontSize,
            fontFamily: "inherit",
            minWidth: 0,
          }}
        />
      </div>
      {error && (
        <span
          id={errorId}
          role="alert"
          style={{
            fontSize: Math.max(8, fontSize - 2),
            color: errorTextColor,
          }}
        >
          {error}
        </span>
      )}
    </div>
  );
}

/**
 * Bundled registration — pairs the widget schema with its React
 * renderer.
 */
export const textInputRegistration: WidgetRegistration<
  TextInputProps,
  React.ComponentType<TextInputProps>
> = {
  widget: textInputWidget,
  Component: TextInput as React.ComponentType<TextInputProps>,
};
