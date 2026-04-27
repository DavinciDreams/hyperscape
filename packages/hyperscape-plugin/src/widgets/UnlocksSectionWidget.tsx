/**
 * UnlocksSectionWidget — list of skill-unlock entries shown inside
 * the level-up popup (or anywhere a host wants a unlock list).
 *
 * Phase D6.c twelfth widget migration. Mirrors the legacy hand-coded
 * `UnlocksSection`. Substrate-promote: the legacy component
 * subscribes to a theme store and resolves unlocks via
 * `getUnlocksAtLevel(skill, level)` from shared. The widget receives
 * pre-resolved unlocks as a typed prop and exposes theme tokens as
 * explicit color/spacing props.
 *
 * Adapter wiring (host responsibility):
 *
 *   ```ts
 *   const unlocks = useMemo(
 *     () => getUnlocksAtLevel(skill, level),
 *     [skill, level],
 *   );
 *
 *   <UnlocksSection unlocks={unlocks} accentColor={theme.colors.accent.primary} />
 *   ```
 */

import {
  defineWidget,
  type Widget,
  type WidgetRegistration,
} from "@hyperforge/ui-framework";
import React from "react";
import { z } from "zod";

/** Canonical set of unlock types (mirrors legacy `UnlockType`). */
export const UNLOCK_TYPES = [
  "item",
  "ability",
  "area",
  "quest",
  "activity",
] as const;

export type UnlockType = (typeof UNLOCK_TYPES)[number];

/** Default emoji icon per unlock type. */
export const DEFAULT_UNLOCK_TYPE_ICONS: Readonly<Record<UnlockType, string>> = {
  item: "📦",
  ability: "⚡",
  area: "🗺️",
  quest: "📜",
  activity: "🎯",
};

/** A single unlock row. */
export const unlockEntrySchema = z.object({
  /** Unlock type — picks the default icon when no override is set. */
  type: z.enum(UNLOCK_TYPES),
  /** Display text for the unlock row. */
  description: z.string().min(1),
  /** Originating skill level (used as part of the React key). */
  level: z.number().int().nonnegative(),
});

export type UnlockEntry = z.infer<typeof unlockEntrySchema>;

/** Props the widget exposes through its Zod schema. */
export const unlocksSectionPropsSchema = z.object({
  /** Pre-resolved unlock list — empty array renders null. */
  unlocks: z.array(unlockEntrySchema).default(() => []),
  /** Section title. */
  title: z.string().default("New Unlocks"),
  /** Accent color (used for the divider + title tint). */
  accentColor: z.string().default("#ffd84d"),
  /** Primary text color. */
  textColor: z.string().default("#e6e8ec"),
  /** Row background. */
  rowBackgroundColor: z.string().default("rgba(40, 45, 60, 0.85)"),
  /** Left-border accent color on each row. */
  rowBorderColor: z.string().default("#3aa0ff"),
  /** Per-type icon override. Missing keys fall back to defaults. */
  iconByType: z
    .record(z.string(), z.string().min(1))
    .default(() => ({ ...DEFAULT_UNLOCK_TYPE_ICONS })),
  /** Base font size for the row text. */
  fontSize: z.number().int().min(8).max(48).default(14),
  /** Title font size. */
  titleFontSize: z.number().int().min(8).max(48).default(11),
  /** Spacing unit (px) used for gap/padding. */
  spacingPx: z.number().int().min(0).max(64).default(8),
  /** Row corner radius (px). */
  rowBorderRadiusPx: z.number().int().min(0).max(64).default(4),
});

export type UnlocksSectionProps = z.infer<typeof unlocksSectionPropsSchema>;

/**
 * Widget definition — registered against the host's UI registry by
 * the meta-plugin's onEnable.
 */
export const unlocksSectionWidget: Widget<UnlocksSectionProps> = defineWidget({
  manifest: {
    id: "com.hyperforge.hyperscape.unlocks-section",
    name: "Unlocks Section",
    category: "panel",
    defaultSize: { width: 32, height: 24 },
  },
  propsSchema: unlocksSectionPropsSchema,
  defaultProps: {
    unlocks: [],
    title: "New Unlocks",
    accentColor: "#ffd84d",
    textColor: "#e6e8ec",
    rowBackgroundColor: "rgba(40, 45, 60, 0.85)",
    rowBorderColor: "#3aa0ff",
    iconByType: { ...DEFAULT_UNLOCK_TYPE_ICONS },
    fontSize: 14,
    titleFontSize: 11,
    spacingPx: 8,
    rowBorderRadiusPx: 4,
  },
});

/**
 * React component. Returns null when the unlock list is empty.
 */
export function UnlocksSection(
  props: UnlocksSectionProps,
): React.ReactElement | null {
  const {
    unlocks,
    title,
    accentColor,
    textColor,
    rowBackgroundColor,
    rowBorderColor,
    iconByType,
    fontSize,
    titleFontSize,
    spacingPx,
    rowBorderRadiusPx,
  } = props;

  if (unlocks.length === 0) return null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: spacingPx / 2,
        marginTop: spacingPx,
        paddingTop: spacingPx * 2,
        borderTop: `1px solid ${accentColor}40`,
        width: "100%",
      }}
    >
      <div
        style={{
          fontSize: titleFontSize,
          color: `${accentColor}cc`,
          textTransform: "uppercase",
          letterSpacing: "1px",
          marginBottom: spacingPx / 2,
        }}
      >
        {title}
      </div>
      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          flexDirection: "column",
          gap: spacingPx / 2,
          width: "100%",
        }}
      >
        {unlocks.map((unlock, index) => {
          const icon =
            iconByType[unlock.type] ??
            DEFAULT_UNLOCK_TYPE_ICONS[unlock.type] ??
            "•";
          return (
            <li
              key={`${unlock.level}-${index}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: spacingPx,
                fontSize,
                color: textColor,
                background: rowBackgroundColor,
                padding: `${spacingPx / 2}px ${spacingPx * 2}px`,
                borderRadius: rowBorderRadiusPx,
                borderLeft: `3px solid ${rowBorderColor}`,
              }}
            >
              <span style={{ fontSize }}>{icon}</span>
              <span style={{ flex: 1 }}>{unlock.description}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Bundled registration — pairs the widget schema with its React
 * renderer.
 */
export const unlocksSectionRegistration: WidgetRegistration<
  UnlocksSectionProps,
  React.ComponentType<UnlocksSectionProps>
> = {
  widget: unlocksSectionWidget,
  Component: UnlocksSection,
};
