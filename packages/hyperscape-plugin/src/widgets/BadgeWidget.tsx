/**
 * BadgeWidget — small labeled pill for status, counts, or tags.
 *
 * Phase D6.c thirty-fourth widget migration. New foundational
 * primitive (no single legacy callsite — the codebase inlines
 * pill-shaped status labels per use site, often as small notifier
 * counts on inventory tabs, "ONLINE"/"OFFLINE" status indicators,
 * stack counts on items, etc.). Substrate-promote: zero theme-store
 * dependency, all colors as explicit props, 5 severity variants.
 *
 * Adapter wiring (host responsibility):
 *
 *   ```ts
 *   <Badge variant="success" label="Online" />
 *   <Badge variant="info" label={`${unreadCount}`} pill />
 *   <Badge variant="warning" label="Beta" outlined />
 *   ```
 */

import {
  defineWidget,
  type Widget,
  type WidgetRegistration,
} from "@hyperforge/ui-framework";
import React from "react";
import { z } from "zod";

/** Severity variants — drives default color palette. */
export const BADGE_VARIANTS = [
  "neutral",
  "success",
  "warning",
  "danger",
  "info",
  "accent",
] as const;
export type BadgeVariant = (typeof BADGE_VARIANTS)[number];

/** Per-variant default colors. */
export const DEFAULT_BADGE_VARIANT_COLORS: Readonly<
  Record<BadgeVariant, { background: string; text: string; border: string }>
> = {
  neutral: {
    background: "rgba(40, 45, 60, 0.85)",
    text: "#e6e8ec",
    border: "#3a3f4d",
  },
  success: {
    background: "rgba(74, 222, 128, 0.18)",
    text: "#86efac",
    border: "#4ade80",
  },
  warning: {
    background: "rgba(255, 216, 77, 0.18)",
    text: "#ffd84d",
    border: "#ffd84d",
  },
  danger: {
    background: "rgba(232, 69, 69, 0.18)",
    text: "#fca5a5",
    border: "#e84545",
  },
  info: {
    background: "rgba(58, 160, 255, 0.18)",
    text: "#7dd3fc",
    border: "#3aa0ff",
  },
  accent: {
    background: "rgba(255, 216, 77, 0.18)",
    text: "#ffd84d",
    border: "#ffd84d",
  },
};

/** Props the widget exposes through its Zod schema. */
export const badgePropsSchema = z.object({
  /** Label text. Empty → null. */
  label: z.string().default(""),
  /** Severity variant. */
  variant: z.enum(BADGE_VARIANTS).default("neutral"),
  /** Optional leading icon glyph (emoji or short string). */
  icon: z.string().default(""),
  /** When true, the badge is outline-only (transparent fill). */
  outlined: z.boolean().default(false),
  /**
   * When true, renders as a fully-rounded pill (border-radius =
   * fontSize). When false, uses `borderRadiusPx`.
   */
  pill: z.boolean().default(false),
  /** Background color override. Empty = use variant default. */
  backgroundColor: z.string().default(""),
  /** Border color override. Empty = use variant default. */
  borderColor: z.string().default(""),
  /** Text color override. Empty = use variant default. */
  textColor: z.string().default(""),
  /** Font size (px). */
  fontSize: z.number().int().min(8).max(48).default(11),
  /** Vertical padding (px). */
  paddingYPx: z.number().int().min(0).max(32).default(2),
  /** Horizontal padding (px). */
  paddingXPx: z.number().int().min(0).max(32).default(8),
  /** Corner radius (px) when `pill: false`. */
  borderRadiusPx: z.number().int().min(0).max(32).default(4),
  /** Letter spacing (px). */
  letterSpacingPx: z.number().min(-2).max(8).default(0.4),
  /** Whether to uppercase the label. */
  uppercase: z.boolean().default(false),
});

export type BadgeProps = z.infer<typeof badgePropsSchema>;

/**
 * Widget definition — registered against the host's UI registry by
 * the meta-plugin's onEnable.
 */
export const badgeWidget: Widget<BadgeProps> = defineWidget({
  manifest: {
    id: "com.hyperforge.hyperscape.badge",
    name: "Badge",
    category: "panel",
    defaultSize: { width: 8, height: 4 },
  },
  propsSchema: badgePropsSchema,
  defaultProps: {
    label: "",
    variant: "neutral",
    icon: "",
    outlined: false,
    pill: false,
    backgroundColor: "",
    borderColor: "",
    textColor: "",
    fontSize: 11,
    paddingYPx: 2,
    paddingXPx: 8,
    borderRadiusPx: 4,
    letterSpacingPx: 0.4,
    uppercase: false,
  },
});

/**
 * React component. Returns null when `label` is empty (callers can
 * use this as a "show counter only when nonzero" idiom).
 */
export function Badge(props: BadgeProps): React.ReactElement | null {
  const {
    label,
    variant,
    icon,
    outlined,
    pill,
    backgroundColor,
    borderColor,
    textColor,
    fontSize,
    paddingYPx,
    paddingXPx,
    borderRadiusPx,
    letterSpacingPx,
    uppercase,
  } = props;

  if (!label) return null;

  const variantColors = DEFAULT_BADGE_VARIANT_COLORS[variant];
  const resolvedBackground = outlined
    ? "transparent"
    : backgroundColor || variantColors.background;
  const resolvedBorder = borderColor || variantColors.border;
  const resolvedText = textColor || variantColors.text;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        background: resolvedBackground,
        border: `1px solid ${resolvedBorder}`,
        borderRadius: pill ? fontSize * 2 : borderRadiusPx,
        color: resolvedText,
        fontSize,
        fontWeight: 600,
        padding: `${paddingYPx}px ${paddingXPx}px`,
        letterSpacing: letterSpacingPx,
        textTransform: uppercase ? "uppercase" : undefined,
        lineHeight: 1,
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif",
        whiteSpace: "nowrap",
      }}
    >
      {icon && <span>{icon}</span>}
      <span>{label}</span>
    </span>
  );
}

/**
 * Bundled registration — pairs the widget schema with its React
 * renderer.
 */
export const badgeRegistration: WidgetRegistration<
  BadgeProps,
  React.ComponentType<BadgeProps>
> = {
  widget: badgeWidget,
  Component: Badge as React.ComponentType<BadgeProps>,
};
