/**
 * ChipListWidget — row/column of small removable tag chips.
 *
 * Phase D6.c thirty-ninth widget migration. New foundational
 * primitive (no single legacy callsite — the codebase inlines
 * chip-style markup per use site, often inside filter bars,
 * applied-tag rows, multi-select preview surfaces, recent-search
 * lists, etc.). Substrate-promote: zero theme-store dependency,
 * all colors as explicit props, removable chips emit `onRemove(id)`.
 *
 * Adapter wiring (host responsibility):
 *
 *   ```ts
 *   <ChipList
 *     chips={[
 *       { id: "tag-1", label: "weapon" },
 *       { id: "tag-2", label: "rare", variant: "accent" },
 *     ]}
 *     removable
 *     onRemove={(id) => removeTag(id)}
 *     onChipClick={(id) => focusTag(id)}
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

/** Chip variants — drives default fill/text colors. */
export const CHIP_VARIANTS = [
  "neutral",
  "accent",
  "success",
  "danger",
] as const;
export type ChipVariant = (typeof CHIP_VARIANTS)[number];

/** Per-variant default colors. */
export const DEFAULT_CHIP_VARIANT_COLORS: Readonly<
  Record<ChipVariant, { background: string; text: string; border: string }>
> = {
  neutral: {
    background: "rgba(40, 45, 60, 0.85)",
    text: "#e6e8ec",
    border: "#3a3f4d",
  },
  accent: {
    background: "rgba(255, 216, 77, 0.18)",
    text: "#ffd84d",
    border: "#ffd84d",
  },
  success: {
    background: "rgba(74, 222, 128, 0.18)",
    text: "#86efac",
    border: "#4ade80",
  },
  danger: {
    background: "rgba(232, 69, 69, 0.18)",
    text: "#fca5a5",
    border: "#e84545",
  },
};

/** A single chip entry. */
export const chipItemSchema = z.object({
  /** Stable id for the React key + onRemove/onChipClick payload. */
  id: z.string().min(1),
  /** Visible label. */
  label: z.string().min(1),
  /** Optional leading icon glyph. */
  icon: z.string().default(""),
  /** Severity / theme variant. */
  variant: z.enum(CHIP_VARIANTS).default("neutral"),
  /** When true, the chip is dimmed and click + remove are suppressed. */
  disabled: z.boolean().default(false),
});

export type ChipItem = z.infer<typeof chipItemSchema>;

/** Layout direction. */
export const CHIP_LIST_ORIENTATIONS = ["row", "column"] as const;
export type ChipListOrientation = (typeof CHIP_LIST_ORIENTATIONS)[number];

/** Props the widget exposes through its Zod schema. */
export const chipListPropsSchema = z.object({
  /** Chip entries. Empty array renders null. */
  chips: z.array(chipItemSchema).default(() => []),
  /** When true, every chip renders an inline `×` remove button. */
  removable: z.boolean().default(false),
  /** Layout direction. `row` wraps to a new line when needed. */
  orientation: z.enum(CHIP_LIST_ORIENTATIONS).default("row"),
  /** Gap between chips (px). */
  gapPx: z.number().int().min(0).max(32).default(6),
  /** Font size (px). */
  fontSize: z.number().int().min(8).max(48).default(12),
  /** Vertical padding (px). */
  paddingYPx: z.number().int().min(0).max(32).default(3),
  /** Horizontal padding (px). */
  paddingXPx: z.number().int().min(0).max(32).default(8),
  /** Corner radius (px). */
  borderRadiusPx: z.number().int().min(0).max(32).default(12),
  /** Remove glyph (overridable). */
  removeGlyph: z.string().min(1).default("×"),
  /** Disabled chip opacity. */
  disabledOpacity: z.number().min(0).max(1).default(0.4),
});

export type ChipListProps = z.infer<typeof chipListPropsSchema>;

/** Extended runtime props — callbacks not modeled in the schema. */
export interface ChipListRuntimeProps extends ChipListProps {
  /** Called with the chip id when the user clicks the chip surface. */
  readonly onChipClick?: (id: string) => void;
  /** Called with the chip id when the user clicks the remove glyph. */
  readonly onRemove?: (id: string) => void;
}

/**
 * Widget definition — registered against the host's UI registry by
 * the meta-plugin's onEnable.
 */
export const chipListWidget: Widget<ChipListProps> = defineWidget({
  manifest: {
    id: "com.hyperforge.hyperscape.chip-list",
    name: "Chip List",
    category: "panel",
    defaultSize: { width: 32, height: 6 },
  },
  propsSchema: chipListPropsSchema,
  defaultProps: {
    chips: [],
    removable: false,
    orientation: "row",
    gapPx: 6,
    fontSize: 12,
    paddingYPx: 3,
    paddingXPx: 8,
    borderRadiusPx: 12,
    removeGlyph: "×",
    disabledOpacity: 0.4,
  },
});

/**
 * React component. Returns null when the chip list is empty.
 * `row` orientation wraps via `flexWrap`. Each chip is a `<span>`
 * with a small remove button when `removable: true`.
 */
export function ChipList(
  props: ChipListRuntimeProps,
): React.ReactElement | null {
  const {
    chips,
    removable,
    orientation,
    gapPx,
    fontSize,
    paddingYPx,
    paddingXPx,
    borderRadiusPx,
    removeGlyph,
    disabledOpacity,
    onChipClick,
    onRemove,
  } = props;

  if (chips.length === 0) return null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: orientation === "row" ? "row" : "column",
        flexWrap: orientation === "row" ? "wrap" : "nowrap",
        gap: gapPx,
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif",
      }}
    >
      {chips.map((chip) => {
        const variantColors = DEFAULT_CHIP_VARIANT_COLORS[chip.variant];
        const isInteractive = !chip.disabled && onChipClick != null;
        return (
          <span
            key={chip.id}
            onClick={isInteractive ? () => onChipClick?.(chip.id) : undefined}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize,
              fontWeight: 500,
              padding: `${paddingYPx}px ${paddingXPx}px`,
              borderRadius: borderRadiusPx,
              background: variantColors.background,
              border: `1px solid ${variantColors.border}`,
              color: variantColors.text,
              cursor: chip.disabled
                ? "not-allowed"
                : isInteractive
                  ? "pointer"
                  : "default",
              opacity: chip.disabled ? disabledOpacity : 1,
              userSelect: "none",
              whiteSpace: "nowrap",
              transition: "background 120ms ease",
            }}
          >
            {chip.icon && <span aria-hidden="true">{chip.icon}</span>}
            <span>{chip.label}</span>
            {removable && (
              <button
                type="button"
                aria-label={`Remove ${chip.label}`}
                disabled={chip.disabled}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!chip.disabled) onRemove?.(chip.id);
                }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginLeft: 2,
                  marginRight: -2,
                  width: fontSize + 2,
                  height: fontSize + 2,
                  padding: 0,
                  border: "none",
                  background: "transparent",
                  color: variantColors.text,
                  fontSize: fontSize + 1,
                  lineHeight: 1,
                  cursor: chip.disabled ? "not-allowed" : "pointer",
                  borderRadius: "50%",
                }}
                onMouseEnter={(e) => {
                  if (!chip.disabled) {
                    e.currentTarget.style.background =
                      "rgba(255, 255, 255, 0.1)";
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                {removeGlyph}
              </button>
            )}
          </span>
        );
      })}
    </div>
  );
}

/**
 * Bundled registration — pairs the widget schema with its React
 * renderer.
 */
export const chipListRegistration: WidgetRegistration<
  ChipListProps,
  React.ComponentType<ChipListProps>
> = {
  widget: chipListWidget,
  Component: ChipList as React.ComponentType<ChipListProps>,
};
