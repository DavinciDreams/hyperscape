/**
 * EmptyStateWidget — centered placeholder for "no data yet" surfaces
 * (empty inventories, empty quest journals, no friends online,
 * search-with-no-results, etc.).
 *
 * Phase D6.c thirty-eighth widget migration. New foundational
 * primitive (no single legacy callsite — the codebase inlines
 * "no items yet" markup per use site, often inside trade panels,
 * friends lists, banks, search results, etc.). Substrate-promote:
 * zero theme-store dependency, all colors as explicit props,
 * optional icon + title + body + action button.
 *
 * Adapter wiring (host responsibility):
 *
 *   ```ts
 *   <EmptyState
 *     icon="📦"
 *     title="Your inventory is empty"
 *     body="Pick up items from the world or buy them at a store to get started."
 *     actionLabel="Open store"
 *     onAction={() => openStore()}
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

/** Props the widget exposes through its Zod schema. */
export const emptyStatePropsSchema = z.object({
  /** Optional leading icon (emoji or short string). */
  icon: z.string().default(""),
  /** Heading. */
  title: z.string().default("Nothing here yet"),
  /** Optional body description below the title. */
  body: z.string().default(""),
  /** Optional action button label. Empty hides the button. */
  actionLabel: z.string().default(""),
  /**
   * When true, the action button is rendered as a primary CTA;
   * when false, as a secondary outline button.
   */
  primaryAction: z.boolean().default(true),
  /** Container background. Empty = transparent. */
  backgroundColor: z.string().default("transparent"),
  /** Container border color. Empty = no border. */
  borderColor: z.string().default(""),
  /** Container corner radius (px). */
  borderRadiusPx: z.number().int().min(0).max(32).default(8),
  /** Vertical padding (px). */
  paddingYPx: z.number().int().min(0).max(128).default(32),
  /** Horizontal padding (px). */
  paddingXPx: z.number().int().min(0).max(128).default(24),
  /** Icon font size (px). */
  iconFontSize: z.number().int().min(8).max(128).default(48),
  /** Title color. */
  titleColor: z.string().default("#e6e8ec"),
  /** Body color. */
  bodyColor: z.string().default("#a8aec0"),
  /** Title font size (px). */
  titleFontSize: z.number().int().min(8).max(48).default(15),
  /** Body font size (px). */
  bodyFontSize: z.number().int().min(8).max(48).default(13),
  /** Primary CTA background. */
  actionPrimaryBackgroundColor: z.string().default("#ffd84d"),
  /** Primary CTA hover background. */
  actionPrimaryHoverColor: z.string().default("#ffe278"),
  /** Primary CTA text color. */
  actionPrimaryTextColor: z.string().default("#0f1119"),
  /** Secondary action border color. */
  actionSecondaryBorderColor: z.string().default("#3a3f4d"),
  /** Secondary action hover background. */
  actionSecondaryHoverBackground: z
    .string()
    .default("rgba(255, 255, 255, 0.04)"),
  /** Secondary action text color. */
  actionSecondaryTextColor: z.string().default("#e6e8ec"),
});

export type EmptyStateProps = z.infer<typeof emptyStatePropsSchema>;

/** Extended runtime props — callbacks not modeled in the schema. */
export interface EmptyStateRuntimeProps extends EmptyStateProps {
  /** Called when the user clicks the action button. */
  readonly onAction?: () => void;
}

/**
 * Widget definition — registered against the host's UI registry by
 * the meta-plugin's onEnable.
 */
export const emptyStateWidget: Widget<EmptyStateProps> = defineWidget({
  manifest: {
    id: "com.hyperforge.hyperscape.empty-state",
    name: "Empty State",
    category: "panel",
    defaultSize: { width: 32, height: 24 },
  },
  propsSchema: emptyStatePropsSchema,
  defaultProps: {
    icon: "",
    title: "Nothing here yet",
    body: "",
    actionLabel: "",
    primaryAction: true,
    backgroundColor: "transparent",
    borderColor: "",
    borderRadiusPx: 8,
    paddingYPx: 32,
    paddingXPx: 24,
    iconFontSize: 48,
    titleColor: "#e6e8ec",
    bodyColor: "#a8aec0",
    titleFontSize: 15,
    bodyFontSize: 13,
    actionPrimaryBackgroundColor: "#ffd84d",
    actionPrimaryHoverColor: "#ffe278",
    actionPrimaryTextColor: "#0f1119",
    actionSecondaryBorderColor: "#3a3f4d",
    actionSecondaryHoverBackground: "rgba(255, 255, 255, 0.04)",
    actionSecondaryTextColor: "#e6e8ec",
  },
});

/**
 * React component. Vertically and horizontally centers an icon +
 * title + body + optional action button.
 */
export function EmptyState(props: EmptyStateRuntimeProps): React.ReactElement {
  const {
    icon,
    title,
    body,
    actionLabel,
    primaryAction,
    backgroundColor,
    borderColor,
    borderRadiusPx,
    paddingYPx,
    paddingXPx,
    iconFontSize,
    titleColor,
    bodyColor,
    titleFontSize,
    bodyFontSize,
    actionPrimaryBackgroundColor,
    actionPrimaryHoverColor,
    actionPrimaryTextColor,
    actionSecondaryBorderColor,
    actionSecondaryHoverBackground,
    actionSecondaryTextColor,
    onAction,
  } = props;

  const [hover, setHover] = React.useState(false);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        gap: 8,
        padding: `${paddingYPx}px ${paddingXPx}px`,
        background: backgroundColor,
        border: borderColor ? `1px solid ${borderColor}` : undefined,
        borderRadius: borderRadiusPx,
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif",
      }}
    >
      {icon && (
        <div
          aria-hidden="true"
          style={{
            fontSize: iconFontSize,
            lineHeight: 1,
            opacity: 0.85,
            marginBottom: 4,
          }}
        >
          {icon}
        </div>
      )}
      {title && (
        <div
          style={{
            fontSize: titleFontSize,
            fontWeight: 600,
            color: titleColor,
            maxWidth: 480,
          }}
        >
          {title}
        </div>
      )}
      {body && (
        <div
          style={{
            fontSize: bodyFontSize,
            color: bodyColor,
            maxWidth: 480,
            lineHeight: 1.45,
          }}
        >
          {body}
        </div>
      )}
      {actionLabel && (
        <button
          type="button"
          onClick={onAction}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          style={{
            marginTop: 8,
            padding: "8px 16px",
            borderRadius: 6,
            fontSize: bodyFontSize,
            fontWeight: 600,
            cursor: "pointer",
            transition: "background 120ms ease, border-color 120ms ease",
            ...(primaryAction
              ? {
                  background: hover
                    ? actionPrimaryHoverColor
                    : actionPrimaryBackgroundColor,
                  border: "none",
                  color: actionPrimaryTextColor,
                }
              : {
                  background: hover
                    ? actionSecondaryHoverBackground
                    : "transparent",
                  border: `1px solid ${actionSecondaryBorderColor}`,
                  color: actionSecondaryTextColor,
                }),
            fontFamily: "inherit",
          }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

/**
 * Bundled registration — pairs the widget schema with its React
 * renderer.
 */
export const emptyStateRegistration: WidgetRegistration<
  EmptyStateProps,
  React.ComponentType<EmptyStateProps>
> = {
  widget: emptyStateWidget,
  Component: EmptyState as React.ComponentType<EmptyStateProps>,
};
