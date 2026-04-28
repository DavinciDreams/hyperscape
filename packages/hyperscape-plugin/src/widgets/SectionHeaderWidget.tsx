/**
 * SectionHeaderWidget — title + optional subtitle + optional action
 * row, used as a section divider inside panels.
 *
 * Phase D6.c slice 70 — fortieth widget. A new foundational primitive
 * (no single legacy callsite — the codebase inlines section headers
 * per use site, often inside SettingsPanel / FriendsPanel /
 * QuestJournal / DashboardScreen, etc.). Substrate-promote: zero
 * theme-store dependency, all colors as explicit props, optional
 * action button on the right.
 *
 * Adapter wiring (host responsibility):
 *
 *   ```ts
 *   <SectionHeader
 *     title="Audio"
 *     subtitle="Master volume and per-channel mix"
 *     actionLabel="Reset"
 *     onAction={() => resetAudioSettings()}
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

/** Heading element to render — affects only semantics, not styling. */
export const SECTION_HEADER_LEVELS = ["h2", "h3", "h4"] as const;
export type SectionHeaderLevel = (typeof SECTION_HEADER_LEVELS)[number];

/** Props the widget exposes through its Zod schema. */
export const sectionHeaderPropsSchema = z.object({
  /** Title text. Empty → null. */
  title: z.string().default(""),
  /** Optional subtitle / description below the title. */
  subtitle: z.string().default(""),
  /** Heading element semantics. */
  level: z.enum(SECTION_HEADER_LEVELS).default("h3"),
  /** Optional action button label. Empty hides the button. */
  actionLabel: z.string().default(""),
  /** Optional leading icon glyph (emoji/short string). */
  icon: z.string().default(""),
  /**
   * When true, paints a thin divider rule below the header (matches
   * the legacy "section start" affordance in SettingsPanel).
   */
  divided: z.boolean().default(false),
  /** Title text color. */
  titleColor: z.string().default("#ffd84d"),
  /** Subtitle text color. */
  subtitleColor: z.string().default("#a8aec0"),
  /** Action button color. */
  actionColor: z.string().default("#ffd84d"),
  /** Action button hover color. */
  actionHoverColor: z.string().default("rgba(255, 216, 77, 0.12)"),
  /** Divider rule color. */
  dividerColor: z.string().default("rgba(255, 255, 255, 0.08)"),
  /** Title font size (px). */
  titleFontSize: z.number().int().min(8).max(48).default(13),
  /** Subtitle font size (px). */
  subtitleFontSize: z.number().int().min(8).max(48).default(11),
  /** Action button font size (px). */
  actionFontSize: z.number().int().min(8).max(48).default(12),
  /** Whether to uppercase the title (matches the SettingsSection
      pattern). */
  uppercase: z.boolean().default(false),
  /** Title letter-spacing (px). */
  letterSpacingPx: z.number().min(-2).max(8).default(0.5),
  /** Bottom margin / padding (px). Adds breathing room below the
      header before the next content block. */
  marginBottomPx: z.number().int().min(0).max(64).default(8),
});

export type SectionHeaderProps = z.infer<typeof sectionHeaderPropsSchema>;

/** Extended runtime props — callbacks not modeled in the schema. */
export interface SectionHeaderRuntimeProps extends SectionHeaderProps {
  /** Called when the user clicks the action button. */
  readonly onAction?: () => void;
}

/**
 * Widget definition — registered against the host's UI registry by
 * the meta-plugin's onEnable.
 */
export const sectionHeaderWidget: Widget<SectionHeaderProps> = defineWidget({
  manifest: {
    id: "com.hyperforge.hyperscape.section-header",
    name: "Section Header",
    category: "panel",
    defaultSize: { width: 32, height: 4 },
  },
  propsSchema: sectionHeaderPropsSchema,
  defaultProps: {
    title: "",
    subtitle: "",
    level: "h3",
    actionLabel: "",
    icon: "",
    divided: false,
    titleColor: "#ffd84d",
    subtitleColor: "#a8aec0",
    actionColor: "#ffd84d",
    actionHoverColor: "rgba(255, 216, 77, 0.12)",
    dividerColor: "rgba(255, 255, 255, 0.08)",
    titleFontSize: 13,
    subtitleFontSize: 11,
    actionFontSize: 12,
    uppercase: false,
    letterSpacingPx: 0.5,
    marginBottomPx: 8,
  },
});

/**
 * React component. Returns null when `title` is empty (callers
 * leverage this as a "no header for this section" idiom).
 */
export function SectionHeader(
  props: SectionHeaderRuntimeProps,
): React.ReactElement | null {
  const {
    title,
    subtitle,
    level,
    actionLabel,
    icon,
    divided,
    titleColor,
    subtitleColor,
    actionColor,
    actionHoverColor,
    dividerColor,
    titleFontSize,
    subtitleFontSize,
    actionFontSize,
    uppercase,
    letterSpacingPx,
    marginBottomPx,
    onAction,
  } = props;

  const [actionHover, setActionHover] = React.useState(false);

  if (!title) return null;

  const headingStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 6,
    margin: 0,
    color: titleColor,
    fontSize: titleFontSize,
    fontWeight: 700,
    letterSpacing: letterSpacingPx,
    textTransform: uppercase ? "uppercase" : undefined,
    lineHeight: 1.2,
  };
  const headingChildren = (
    <>
      {icon && <span aria-hidden="true">{icon}</span>}
      <span>{title}</span>
    </>
  );
  const headingEl =
    level === "h2" ? (
      <h2 style={headingStyle}>{headingChildren}</h2>
    ) : level === "h4" ? (
      <h4 style={headingStyle}>{headingChildren}</h4>
    ) : (
      <h3 style={headingStyle}>{headingChildren}</h3>
    );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 2,
        marginBottom: marginBottomPx,
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif",
        borderBottom: divided ? `1px solid ${dividerColor}` : undefined,
        paddingBottom: divided ? marginBottomPx : 0,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        {headingEl}
        {actionLabel && (
          <button
            type="button"
            onClick={onAction}
            onMouseEnter={() => setActionHover(true)}
            onMouseLeave={() => setActionHover(false)}
            style={{
              padding: "4px 10px",
              borderRadius: 4,
              border: "none",
              background: actionHover ? actionHoverColor : "transparent",
              color: actionColor,
              fontSize: actionFontSize,
              fontWeight: 600,
              cursor: "pointer",
              transition: "background 120ms ease",
              fontFamily: "inherit",
              flexShrink: 0,
            }}
          >
            {actionLabel}
          </button>
        )}
      </div>
      {subtitle && (
        <span
          style={{
            color: subtitleColor,
            fontSize: subtitleFontSize,
            lineHeight: 1.4,
          }}
        >
          {subtitle}
        </span>
      )}
    </div>
  );
}

/**
 * Bundled registration — pairs the widget schema with its React
 * renderer.
 */
export const sectionHeaderRegistration: WidgetRegistration<
  SectionHeaderProps,
  React.ComponentType<SectionHeaderProps>
> = {
  widget: sectionHeaderWidget,
  Component: SectionHeader as React.ComponentType<SectionHeaderProps>,
};
