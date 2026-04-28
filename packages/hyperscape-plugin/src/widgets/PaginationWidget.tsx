/**
 * PaginationWidget — page jump controls (« ‹ 1 2 3 … 12 › »).
 *
 * Phase D6.c forty-fifth widget migration. New foundational
 * primitive (no single legacy callsite — used wherever a list is
 * paged: bank tabs, AH search, friends pages, leaderboards, log
 * scrollback, etc.). Substrate-promote: zero theme-store
 * dependency, all colors as explicit props, exposed
 * `computePageWindow` pure helper handles the "show 1, current ±
 * neighbors, last, with ellipses" math.
 *
 * Adapter wiring (host responsibility):
 *
 *   ```ts
 *   <Pagination
 *     currentPage={state.page}
 *     totalPages={state.totalPages}
 *     onPageChange={(next) => setPage(next)}
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
export const paginationPropsSchema = z.object({
  /** 1-indexed current page. Clamped to `[1, totalPages]`. */
  currentPage: z.number().int().min(1).default(1),
  /** Total page count. Must be ≥ 1. */
  totalPages: z.number().int().min(1).default(1),
  /**
   * Number of page-number buttons to render around the current
   * page. The full window is `currentPage ± neighborCount` plus
   * page 1 and last page.
   */
  neighborCount: z.number().int().min(0).max(8).default(1),
  /** Render the first/last (« / ») jump arrows. */
  showJumpArrows: z.boolean().default(true),
  /** Render the prev/next (‹ / ›) step arrows. */
  showStepArrows: z.boolean().default(true),
  /** Disable the entire control. */
  disabled: z.boolean().default(false),
  /** First-page arrow glyph. */
  firstGlyph: z.string().min(1).default("«"),
  /** Last-page arrow glyph. */
  lastGlyph: z.string().min(1).default("»"),
  /** Prev-page arrow glyph. */
  prevGlyph: z.string().min(1).default("‹"),
  /** Next-page arrow glyph. */
  nextGlyph: z.string().min(1).default("›"),
  /** Ellipsis glyph (rendered between non-adjacent windows). */
  ellipsisGlyph: z.string().min(1).default("…"),
  /** Button background (idle). */
  buttonBackgroundColor: z.string().default("rgba(20, 24, 36, 0.85)"),
  /** Button border (idle). */
  buttonBorderColor: z.string().default("#3a3f4d"),
  /** Button text color (idle). */
  buttonTextColor: z.string().default("#a8aec0"),
  /** Button background (hover). */
  buttonHoverBackgroundColor: z.string().default("rgba(255, 255, 255, 0.04)"),
  /** Button background (active page). */
  activeBackgroundColor: z.string().default("rgba(255, 216, 77, 0.15)"),
  /** Button border (active page). */
  activeBorderColor: z.string().default("#ffd84d"),
  /** Button text color (active page). */
  activeTextColor: z.string().default("#ffd84d"),
  /** Disabled-button opacity. */
  disabledOpacity: z.number().min(0).max(1).default(0.4),
  /** Ellipsis text color. */
  ellipsisColor: z.string().default("#6e7585"),
  /** Font size (px). */
  fontSize: z.number().int().min(8).max(48).default(12),
  /** Button min width (px). */
  buttonMinWidthPx: z.number().int().min(16).max(64).default(28),
  /** Button height (px). */
  buttonHeightPx: z.number().int().min(16).max(64).default(28),
  /** Gap between buttons (px). */
  gapPx: z.number().int().min(0).max(16).default(4),
  /** Button corner radius (px). */
  borderRadiusPx: z.number().int().min(0).max(16).default(4),
});

export type PaginationProps = z.infer<typeof paginationPropsSchema>;

/** Extended runtime props — callbacks not modeled in the schema. */
export interface PaginationRuntimeProps extends PaginationProps {
  /**
   * Called with the new 1-indexed page number when the user clicks
   * a page button or arrow. Skipped when `disabled: true`.
   */
  readonly onPageChange?: (page: number) => void;
}

/**
 * One entry in the rendered page window — either a page-number
 * button or an ellipsis spacer.
 */
export type PageWindowEntry =
  | { kind: "page"; page: number }
  | { kind: "ellipsis" };

/**
 * Compute the windowed page list. Always includes page 1 and
 * `totalPages`; surrounds `currentPage` with `neighborCount`
 * pages on each side. Inserts an ellipsis spacer when the windows
 * are non-adjacent.
 *
 *   computePageWindow(1, 1, 1)   → [{kind:"page",page:1}]
 *   computePageWindow(5, 12, 1)  → [1, "...", 4, 5, 6, "...", 12]
 *   computePageWindow(1, 5, 1)   → [1, 2, "...", 5]
 *   computePageWindow(2, 5, 1)   → [1, 2, 3, 4, 5]   (all adjacent)
 */
export function computePageWindow(
  currentPage: number,
  totalPages: number,
  neighborCount: number,
): PageWindowEntry[] {
  if (totalPages <= 1) {
    return [{ kind: "page", page: 1 }];
  }
  const safeCurrent = Math.max(1, Math.min(totalPages, currentPage));
  const minNeighbor = Math.max(2, safeCurrent - neighborCount);
  const maxNeighbor = Math.min(totalPages - 1, safeCurrent + neighborCount);

  const entries: PageWindowEntry[] = [{ kind: "page", page: 1 }];
  if (minNeighbor > 2) {
    entries.push({ kind: "ellipsis" });
  }
  for (let p = minNeighbor; p <= maxNeighbor; p++) {
    entries.push({ kind: "page", page: p });
  }
  if (maxNeighbor < totalPages - 1) {
    entries.push({ kind: "ellipsis" });
  }
  if (totalPages > 1) {
    entries.push({ kind: "page", page: totalPages });
  }
  return entries;
}

/**
 * Widget definition — registered against the host's UI registry by
 * the meta-plugin's onEnable.
 */
export const paginationWidget: Widget<PaginationProps> = defineWidget({
  manifest: {
    id: "com.hyperforge.hyperscape.pagination",
    name: "Pagination",
    category: "panel",
    defaultSize: { width: 32, height: 6 },
  },
  propsSchema: paginationPropsSchema,
  defaultProps: {
    currentPage: 1,
    totalPages: 1,
    neighborCount: 1,
    showJumpArrows: true,
    showStepArrows: true,
    disabled: false,
    firstGlyph: "«",
    lastGlyph: "»",
    prevGlyph: "‹",
    nextGlyph: "›",
    ellipsisGlyph: "…",
    buttonBackgroundColor: "rgba(20, 24, 36, 0.85)",
    buttonBorderColor: "#3a3f4d",
    buttonTextColor: "#a8aec0",
    buttonHoverBackgroundColor: "rgba(255, 255, 255, 0.04)",
    activeBackgroundColor: "rgba(255, 216, 77, 0.15)",
    activeBorderColor: "#ffd84d",
    activeTextColor: "#ffd84d",
    disabledOpacity: 0.4,
    ellipsisColor: "#6e7585",
    fontSize: 12,
    buttonMinWidthPx: 28,
    buttonHeightPx: 28,
    gapPx: 4,
    borderRadiusPx: 4,
  },
});

interface PageButtonProps {
  readonly label: string;
  readonly active: boolean;
  readonly disabled: boolean;
  readonly minWidthPx: number;
  readonly heightPx: number;
  readonly fontSize: number;
  readonly borderRadiusPx: number;
  readonly disabledOpacity: number;
  readonly background: string;
  readonly border: string;
  readonly textColor: string;
  readonly hoverBackground: string;
  readonly activeBackground: string;
  readonly activeBorder: string;
  readonly activeTextColor: string;
  readonly ariaLabel?: string;
  readonly onClick: () => void;
}

function PageButton(props: PageButtonProps): React.ReactElement {
  const {
    label,
    active,
    disabled,
    minWidthPx,
    heightPx,
    fontSize,
    borderRadiusPx,
    disabledOpacity,
    background,
    border,
    textColor,
    hoverBackground,
    activeBackground,
    activeBorder,
    activeTextColor,
    ariaLabel,
    onClick,
  } = props;
  const [hover, setHover] = React.useState(false);
  const isInteractive = !disabled && !active;
  return (
    <button
      type="button"
      disabled={disabled}
      aria-current={active ? "page" : undefined}
      aria-label={ariaLabel}
      onClick={() => {
        if (isInteractive) onClick();
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: minWidthPx,
        height: heightPx,
        padding: "0 6px",
        fontSize,
        fontWeight: active ? 600 : 500,
        background: active
          ? activeBackground
          : hover && isInteractive
            ? hoverBackground
            : background,
        border: `1px solid ${active ? activeBorder : border}`,
        borderRadius: borderRadiusPx,
        color: active ? activeTextColor : textColor,
        opacity: disabled ? disabledOpacity : 1,
        cursor: disabled ? "not-allowed" : active ? "default" : "pointer",
        transition: "background 120ms ease, border-color 120ms ease",
        fontFamily: "inherit",
      }}
    >
      {label}
    </button>
  );
}

/**
 * React component. Renders « ‹ [page buttons] › » — windowed via
 * `computePageWindow`. Hides the first/last and prev/next arrows
 * via the `showJumpArrows` / `showStepArrows` flags.
 */
export function Pagination(props: PaginationRuntimeProps): React.ReactElement {
  const {
    currentPage,
    totalPages,
    neighborCount,
    showJumpArrows,
    showStepArrows,
    disabled,
    firstGlyph,
    lastGlyph,
    prevGlyph,
    nextGlyph,
    ellipsisGlyph,
    buttonBackgroundColor,
    buttonBorderColor,
    buttonTextColor,
    buttonHoverBackgroundColor,
    activeBackgroundColor,
    activeBorderColor,
    activeTextColor,
    disabledOpacity,
    ellipsisColor,
    fontSize,
    buttonMinWidthPx,
    buttonHeightPx,
    gapPx,
    borderRadiusPx,
    onPageChange,
  } = props;

  const safeCurrent = Math.max(1, Math.min(totalPages, currentPage));
  const window = computePageWindow(safeCurrent, totalPages, neighborCount);
  const atStart = safeCurrent <= 1;
  const atEnd = safeCurrent >= totalPages;

  const navigateTo = (page: number): void => {
    if (disabled) return;
    if (page === safeCurrent) return;
    if (page < 1 || page > totalPages) return;
    onPageChange?.(page);
  };

  const buttonShared = {
    minWidthPx: buttonMinWidthPx,
    heightPx: buttonHeightPx,
    fontSize,
    borderRadiusPx,
    disabledOpacity,
    background: buttonBackgroundColor,
    border: buttonBorderColor,
    textColor: buttonTextColor,
    hoverBackground: buttonHoverBackgroundColor,
    activeBackground: activeBackgroundColor,
    activeBorder: activeBorderColor,
    activeTextColor,
  };

  return (
    <nav
      role="navigation"
      aria-label="Pagination"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: gapPx,
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif",
      }}
    >
      {showJumpArrows && (
        <PageButton
          {...buttonShared}
          label={firstGlyph}
          ariaLabel="First page"
          active={false}
          disabled={disabled || atStart}
          onClick={() => navigateTo(1)}
        />
      )}
      {showStepArrows && (
        <PageButton
          {...buttonShared}
          label={prevGlyph}
          ariaLabel="Previous page"
          active={false}
          disabled={disabled || atStart}
          onClick={() => navigateTo(safeCurrent - 1)}
        />
      )}
      {window.map((entry, i) =>
        entry.kind === "page" ? (
          <PageButton
            {...buttonShared}
            key={`p-${entry.page}`}
            label={String(entry.page)}
            ariaLabel={`Page ${entry.page}`}
            active={entry.page === safeCurrent}
            disabled={disabled}
            onClick={() => navigateTo(entry.page)}
          />
        ) : (
          <span
            key={`e-${i}`}
            aria-hidden="true"
            style={{
              minWidth: buttonMinWidthPx,
              height: buttonHeightPx,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              color: ellipsisColor,
              fontSize,
              userSelect: "none",
            }}
          >
            {ellipsisGlyph}
          </span>
        ),
      )}
      {showStepArrows && (
        <PageButton
          {...buttonShared}
          label={nextGlyph}
          ariaLabel="Next page"
          active={false}
          disabled={disabled || atEnd}
          onClick={() => navigateTo(safeCurrent + 1)}
        />
      )}
      {showJumpArrows && (
        <PageButton
          {...buttonShared}
          label={lastGlyph}
          ariaLabel="Last page"
          active={false}
          disabled={disabled || atEnd}
          onClick={() => navigateTo(totalPages)}
        />
      )}
    </nav>
  );
}

/**
 * Bundled registration — pairs the widget schema with its React
 * renderer.
 */
export const paginationRegistration: WidgetRegistration<
  PaginationProps,
  React.ComponentType<PaginationProps>
> = {
  widget: paginationWidget,
  Component: Pagination as React.ComponentType<PaginationProps>,
};
