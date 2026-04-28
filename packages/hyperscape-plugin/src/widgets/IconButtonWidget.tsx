/**
 * IconButtonWidget — square button with a single icon glyph.
 *
 * Phase D6.c forty-sixth widget migration. New foundational
 * primitive (no single legacy callsite — used wherever an icon-
 * only button appears: panel close X, refresh, expand/collapse
 * carets, settings gears, etc.). Substrate-promote: zero theme-
 * store dependency, all colors as explicit props, 5 size presets,
 * native button semantics.
 *
 * Adapter wiring (host responsibility):
 *
 *   ```ts
 *   <IconButton icon="✕" ariaLabel="Close" onClick={() => close()} />
 *
 *   <IconButton icon="⟳" ariaLabel="Refresh" size="lg" variant="primary"
 *               onClick={() => refresh()} />
 *   ```
 */

import {
  defineWidget,
  type Widget,
  type WidgetRegistration,
} from "@hyperforge/ui-framework";
import React from "react";
import { z } from "zod";

/** Size presets. */
export const ICON_BUTTON_SIZES = ["xs", "sm", "md", "lg", "xl"] as const;
export type IconButtonSize = (typeof ICON_BUTTON_SIZES)[number];

/** Per-size pixel mapping (button + icon). */
export const ICON_BUTTON_SIZE_TABLE: Readonly<
  Record<IconButtonSize, { button: number; icon: number }>
> = {
  xs: { button: 18, icon: 11 },
  sm: { button: 22, icon: 13 },
  md: { button: 28, icon: 15 },
  lg: { button: 36, icon: 18 },
  xl: { button: 44, icon: 22 },
};

/** Variants — drives default colors. */
export const ICON_BUTTON_VARIANTS = [
  "ghost",
  "subtle",
  "primary",
  "danger",
] as const;
export type IconButtonVariant = (typeof ICON_BUTTON_VARIANTS)[number];

/** Per-variant default palettes. */
export const DEFAULT_ICON_BUTTON_VARIANT_COLORS: Readonly<
  Record<
    IconButtonVariant,
    {
      background: string;
      hoverBackground: string;
      border: string;
      iconColor: string;
    }
  >
> = {
  ghost: {
    background: "transparent",
    hoverBackground: "rgba(255, 255, 255, 0.06)",
    border: "transparent",
    iconColor: "#a8aec0",
  },
  subtle: {
    background: "rgba(20, 24, 36, 0.85)",
    hoverBackground: "rgba(40, 45, 60, 0.95)",
    border: "#3a3f4d",
    iconColor: "#e6e8ec",
  },
  primary: {
    background: "rgba(255, 216, 77, 0.15)",
    hoverBackground: "rgba(255, 216, 77, 0.25)",
    border: "#ffd84d",
    iconColor: "#ffd84d",
  },
  danger: {
    background: "rgba(232, 69, 69, 0.15)",
    hoverBackground: "rgba(232, 69, 69, 0.25)",
    border: "#e84545",
    iconColor: "#fca5a5",
  },
};

/** Props the widget exposes through its Zod schema. */
export const iconButtonPropsSchema = z.object({
  /** Icon glyph (emoji/short string). */
  icon: z.string().min(1).default("•"),
  /** Required for accessibility. */
  ariaLabel: z.string().default(""),
  /** Size preset. */
  size: z.enum(ICON_BUTTON_SIZES).default("md"),
  /** Visual variant. */
  variant: z.enum(ICON_BUTTON_VARIANTS).default("ghost"),
  /** Disabled flag. */
  disabled: z.boolean().default(false),
  /** Background color override. Empty = variant default. */
  backgroundColor: z.string().default(""),
  /** Hover background override. Empty = variant default. */
  hoverBackgroundColor: z.string().default(""),
  /** Border color override. Empty = variant default. */
  borderColor: z.string().default(""),
  /** Icon color override. Empty = variant default. */
  iconColor: z.string().default(""),
  /** Corner radius (px). */
  borderRadiusPx: z.number().int().min(0).max(32).default(4),
  /** Disabled-button opacity. */
  disabledOpacity: z.number().min(0).max(1).default(0.4),
});

export type IconButtonProps = z.infer<typeof iconButtonPropsSchema>;

/** Extended runtime props — callback not modeled in the schema. */
export interface IconButtonRuntimeProps extends IconButtonProps {
  /** Called when the user clicks the button. */
  readonly onClick?: () => void;
}

/**
 * Widget definition — registered against the host's UI registry by
 * the meta-plugin's onEnable.
 */
export const iconButtonWidget: Widget<IconButtonProps> = defineWidget({
  manifest: {
    id: "com.hyperforge.hyperscape.icon-button",
    name: "Icon Button",
    category: "panel",
    defaultSize: { width: 4, height: 4 },
  },
  propsSchema: iconButtonPropsSchema,
  defaultProps: {
    icon: "•",
    ariaLabel: "",
    size: "md",
    variant: "ghost",
    disabled: false,
    backgroundColor: "",
    hoverBackgroundColor: "",
    borderColor: "",
    iconColor: "",
    borderRadiusPx: 4,
    disabledOpacity: 0.4,
  },
});

/**
 * React component. Renders a `<button>` square with the icon
 * centered. Hover state is internal; click is suppressed when
 * `disabled`.
 */
export function IconButton(props: IconButtonRuntimeProps): React.ReactElement {
  const {
    icon,
    ariaLabel,
    size,
    variant,
    disabled,
    backgroundColor,
    hoverBackgroundColor,
    borderColor,
    iconColor,
    borderRadiusPx,
    disabledOpacity,
    onClick,
  } = props;

  const [hover, setHover] = React.useState(false);
  const dims = ICON_BUTTON_SIZE_TABLE[size];
  const palette = DEFAULT_ICON_BUTTON_VARIANT_COLORS[variant];
  const resolvedBackground = backgroundColor || palette.background;
  const resolvedHover = hoverBackgroundColor || palette.hoverBackground;
  const resolvedBorder = borderColor || palette.border;
  const resolvedIconColor = iconColor || palette.iconColor;

  return (
    <button
      type="button"
      aria-label={ariaLabel || icon}
      disabled={disabled}
      onClick={() => {
        if (!disabled) onClick?.();
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: dims.button,
        height: dims.button,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: hover && !disabled ? resolvedHover : resolvedBackground,
        border:
          resolvedBorder && resolvedBorder !== "transparent"
            ? `1px solid ${resolvedBorder}`
            : "1px solid transparent",
        borderRadius: borderRadiusPx,
        color: resolvedIconColor,
        fontSize: dims.icon,
        lineHeight: 1,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? disabledOpacity : 1,
        padding: 0,
        transition: "background 120ms ease, border-color 120ms ease",
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif",
      }}
    >
      {icon}
    </button>
  );
}

/**
 * Bundled registration — pairs the widget schema with its React
 * renderer.
 */
export const iconButtonRegistration: WidgetRegistration<
  IconButtonProps,
  React.ComponentType<IconButtonProps>
> = {
  widget: iconButtonWidget,
  Component: IconButton as React.ComponentType<IconButtonProps>,
};
