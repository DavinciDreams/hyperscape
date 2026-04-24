/**
 * TooltipWidget — schema-driven tooltip overlay adapter.
 *
 * Matches the `hyperforge.overlay.tooltip` widget schema from
 * `@hyperforge/ui-framework/builtins`. Presentational only: shows a
 * sample tooltip card sized per the manifest. Real hover-to-content
 * binding plugs in via a later runtime-data layer; the editor preview
 * and default layout use this to reserve placement and validate
 * pixel parity.
 *
 * Surface language is aligned to `ui/core/tooltip/CursorTooltip.tsx`
 * (4px squared radius, 180deg dark gradient, 8px/10px padding, soft
 * drop shadow) and title/meta styles from `tooltipStyles.ts`
 * (`getTooltipTitleStyle`, `getTooltipMetaStyle`).
 */

import { memo } from "react";

export interface TooltipProps {
  anchor: "cursor" | "element";
  delayMs: number;
  maxWidth: number;
}

// Values approximate the default (dark) theme tokens consumed by
// `CursorTooltip`: background.primary → background.secondary gradient
// and border.hover. The widget is theme-unaware today; once the
// runtime picks up CSS vars from `applyTheme()`, these will swap to
// `var(--color-…)` tokens directly.
const BG_GRADIENT =
  "linear-gradient(180deg, rgba(12, 13, 16, 0.96) 0%, rgba(18, 20, 26, 0.96) 100%)";
const BORDER = "rgba(255, 255, 255, 0.22)";
const SHADOW = "0 4px 16px rgba(0, 0, 0, 0.5)";
const TITLE_COLOR = "#a5b4fc"; // accent.secondary on dark theme
const META_COLOR = "#636577"; // text.muted

export const TooltipWidget = memo(function TooltipWidget({
  anchor,
  delayMs,
  maxWidth,
}: TooltipProps) {
  return (
    <div
      role="tooltip"
      style={{
        maxWidth,
        padding: "8px 10px",
        background: BG_GRADIENT,
        border: `1px solid ${BORDER}`,
        borderRadius: 4,
        color: "#e8e9ed",
        fontFamily: "Inter, system-ui, sans-serif",
        fontSize: 11,
        lineHeight: 1.45,
        boxShadow: SHADOW,
      }}
    >
      <div
        style={{
          color: TITLE_COLOR,
          fontWeight: 700,
          fontSize: 13,
          lineHeight: 1.2,
          marginBottom: 3,
        }}
      >
        Tooltip
      </div>
      <div
        style={{
          color: META_COLOR,
          fontSize: 11,
          lineHeight: 1.3,
        }}
      >
        Anchor: {anchor} · delay {delayMs}ms
      </div>
    </div>
  );
});
