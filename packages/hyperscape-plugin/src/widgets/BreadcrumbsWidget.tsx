/**
 * BreadcrumbsWidget — navigation trail with separators and optional
 * link callbacks.
 *
 * Phase D6.c forty-second widget migration. New foundational
 * primitive (no single legacy callsite — used wherever a hierarchy
 * is navigated: SettingsPanel sub-tabs, Bank tab → category trail,
 * QuestJournal selection breadcrumbs, etc.). Substrate-promote:
 * zero theme-store dependency, all colors as explicit props,
 * keyboard-accessible (each crumb is a `<button>` when interactive).
 *
 * Adapter wiring (host responsibility):
 *
 *   ```ts
 *   <Breadcrumbs
 *     crumbs={[
 *       { id: "home",     label: "Home" },
 *       { id: "audio",    label: "Audio" },
 *       { id: "ambience", label: "Ambience" },
 *     ]}
 *     onNavigate={(id) => navigateToSection(id)}
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

/** A single breadcrumb entry. */
export const breadcrumbItemSchema = z.object({
  /** Stable id used as the React key + `onNavigate` payload. */
  id: z.string().min(1),
  /** Visible label. */
  label: z.string().min(1),
  /** Optional leading icon glyph (emoji/short string). */
  icon: z.string().default(""),
  /**
   * When true, the crumb renders as plain text (the last crumb is
   * conventionally non-interactive). When omitted, the widget
   * automatically marks the last entry as non-interactive.
   */
  noLink: z.boolean().default(false),
});

export type BreadcrumbItem = z.infer<typeof breadcrumbItemSchema>;

/** Props the widget exposes through its Zod schema. */
export const breadcrumbsPropsSchema = z.object({
  /** Trail of crumbs from root to current. Empty → null. */
  crumbs: z.array(breadcrumbItemSchema).default(() => []),
  /** Separator glyph between crumbs. */
  separator: z.string().min(1).default("›"),
  /** Optional aria-label for the nav region. */
  ariaLabel: z.string().default("Breadcrumbs"),
  /** Active (last) crumb color. */
  activeColor: z.string().default("#e6e8ec"),
  /** Inactive (linked) crumb color. */
  linkColor: z.string().default("#a8aec0"),
  /** Inactive crumb hover color. */
  linkHoverColor: z.string().default("#ffd84d"),
  /** Separator color. */
  separatorColor: z.string().default("#6e7585"),
  /** Font size (px). */
  fontSize: z.number().int().min(8).max(48).default(12),
  /** Gap between crumbs and separators (px). */
  gapPx: z.number().int().min(0).max(32).default(6),
});

export type BreadcrumbsProps = z.infer<typeof breadcrumbsPropsSchema>;

/** Extended runtime props — callbacks not modeled in the schema. */
export interface BreadcrumbsRuntimeProps extends BreadcrumbsProps {
  /**
   * Called with the crumb id when the user clicks a non-final
   * (or non-`noLink`) crumb.
   */
  readonly onNavigate?: (id: string) => void;
}

/**
 * Widget definition — registered against the host's UI registry by
 * the meta-plugin's onEnable.
 */
export const breadcrumbsWidget: Widget<BreadcrumbsProps> = defineWidget({
  manifest: {
    id: "com.hyperforge.hyperscape.breadcrumbs",
    name: "Breadcrumbs",
    category: "panel",
    defaultSize: { width: 32, height: 4 },
  },
  propsSchema: breadcrumbsPropsSchema,
  defaultProps: {
    crumbs: [],
    separator: "›",
    ariaLabel: "Breadcrumbs",
    activeColor: "#e6e8ec",
    linkColor: "#a8aec0",
    linkHoverColor: "#ffd84d",
    separatorColor: "#6e7585",
    fontSize: 12,
    gapPx: 6,
  },
});

interface CrumbButtonProps {
  readonly crumb: BreadcrumbItem;
  readonly fontSize: number;
  readonly linkColor: string;
  readonly linkHoverColor: string;
  readonly onClick: () => void;
}

function CrumbButton(props: CrumbButtonProps): React.ReactElement {
  const { crumb, fontSize, linkColor, linkHoverColor, onClick } = props;
  const [hover, setHover] = React.useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: 0,
        border: "none",
        background: "transparent",
        color: hover ? linkHoverColor : linkColor,
        fontSize,
        fontFamily: "inherit",
        cursor: "pointer",
        textDecoration: hover ? "underline" : "none",
        transition: "color 120ms ease",
      }}
    >
      {crumb.icon && <span aria-hidden="true">{crumb.icon}</span>}
      <span>{crumb.label}</span>
    </button>
  );
}

/**
 * React component. Returns null when the trail is empty. Renders a
 * `<nav>` containing the crumbs joined by `separator`. The last
 * crumb (or any crumb with `noLink: true`) renders as plain text;
 * earlier crumbs are interactive when `onNavigate` is provided.
 */
export function Breadcrumbs(
  props: BreadcrumbsRuntimeProps,
): React.ReactElement | null {
  const {
    crumbs,
    separator,
    ariaLabel,
    activeColor,
    linkColor,
    linkHoverColor,
    separatorColor,
    fontSize,
    gapPx,
    onNavigate,
  } = props;

  if (crumbs.length === 0) return null;

  return (
    <nav
      aria-label={ariaLabel}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: gapPx,
        flexWrap: "wrap",
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif",
      }}
    >
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1;
        const interactive = !crumb.noLink && !isLast && onNavigate != null;
        return (
          <React.Fragment key={crumb.id}>
            {interactive ? (
              <CrumbButton
                crumb={crumb}
                fontSize={fontSize}
                linkColor={linkColor}
                linkHoverColor={linkHoverColor}
                onClick={() => onNavigate?.(crumb.id)}
              />
            ) : (
              <span
                aria-current={isLast ? "page" : undefined}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  color: isLast ? activeColor : linkColor,
                  fontSize,
                  fontWeight: isLast ? 600 : 400,
                }}
              >
                {crumb.icon && <span aria-hidden="true">{crumb.icon}</span>}
                <span>{crumb.label}</span>
              </span>
            )}
            {i < crumbs.length - 1 && (
              <span
                aria-hidden="true"
                style={{
                  color: separatorColor,
                  fontSize,
                  userSelect: "none",
                }}
              >
                {separator}
              </span>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}

/**
 * Bundled registration — pairs the widget schema with its React
 * renderer.
 */
export const breadcrumbsRegistration: WidgetRegistration<
  BreadcrumbsProps,
  React.ComponentType<BreadcrumbsProps>
> = {
  widget: breadcrumbsWidget,
  Component: Breadcrumbs as React.ComponentType<BreadcrumbsProps>,
};
