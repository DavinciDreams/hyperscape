/**
 * EquipmentSlotIconWidget — geometric silhouette SVG icon for an
 * equipment slot.
 *
 * Phase D6.c eighteenth widget migration. Mirrors the legacy
 * hand-coded `EquipmentIcons.tsx` collection of named SVG icons.
 * Substrate-promote: the legacy module exports 11+ separate icon
 * components, each consumed by name; the widget collapses them
 * into a single registered widget driven by a `slot` enum prop, so
 * hosts that opt into the widget pipeline can render any slot
 * icon through one consistent surface.
 *
 * Adapter wiring (host responsibility):
 *
 *   ```ts
 *   <EquipmentSlotIcon slot="helmet" size={32} color="#ffd84d" />
 *   ```
 */

import {
  defineWidget,
  type Widget,
  type WidgetRegistration,
} from "@hyperforge/ui-framework";
import React from "react";
import { z } from "zod";

/**
 * Canonical equipment-slot identifiers. Mirrors the legacy
 * EquipmentIcons exports + StatsIcon/DeathIcon utility set.
 */
export const EQUIPMENT_SLOT_KEYS = [
  "helmet",
  "weapon",
  "body",
  "shield",
  "legs",
  "arrows",
  "boots",
  "gloves",
  "cape",
  "amulet",
  "ring",
  "stats",
  "death",
] as const;

export type EquipmentSlotKey = (typeof EQUIPMENT_SLOT_KEYS)[number];

/**
 * SVG path data for each slot. Filled-silhouette icons use
 * `fill="currentColor"`; outline icons (stats, death) use stroke.
 *
 * The data is a tagged structure rather than a plain string so the
 * renderer can pick the correct SVG attributes without re-parsing.
 */
type SlotIconSpec =
  | { kind: "fill"; d: string; fillRule?: "evenodd" }
  | {
      kind: "fill-multi";
      paths: ReadonlyArray<{ d: string; fillRule?: "evenodd" }>;
    }
  | { kind: "stroke"; children: React.ReactNode };

const ICON_SPECS: Readonly<Record<EquipmentSlotKey, SlotIconSpec>> = {
  helmet: {
    kind: "fill",
    fillRule: "evenodd",
    d: "M6 5l6-3 6 3v6l-2 8H8l-2-8V5zm6 3H9v5h2v2h2v-2h2V8h-3z",
  },
  weapon: {
    kind: "fill",
    d: "M15 3h6v6l-2-2-6 6 3 3-2 2-4-4-4 4-2-2 4-4-4-4 2-2 3 3 6-6-2-2z",
  },
  body: {
    kind: "fill",
    fillRule: "evenodd",
    d: "M6 3h12l4 6-3 3v9H5v-9L2 9l4-6zm3 4v3h6V7H9z",
  },
  shield: { kind: "fill", d: "M3 4h18v7l-9 11L3 11V4z" },
  legs: {
    kind: "fill",
    d: "M5 3h14v8l-3 2v8H9v-8L6 11V3zM9 5H7v5l2 1V5zm6 0h-2v6l2-1V5z",
  },
  arrows: {
    kind: "fill",
    d: "M15 3h6v6l-1-1-8 8-4-4 8-8-1-1zm-6 8l-5 5 2 2 5-5-2-2zm5 5l-5 5 2 2 5-5-2-2z",
  },
  boots: { kind: "fill", d: "M7 4h10v9l4 4v4H5v-5l2-3V4z" },
  gloves: { kind: "fill", d: "M5 4h14v7l2 4-3 5H6l-3-5 2-4V4z" },
  cape: {
    kind: "fill",
    fillRule: "evenodd",
    d: "M6 3h12l3 18H3L6 3zm2 4v4h8V7H8z",
  },
  amulet: {
    kind: "fill",
    fillRule: "evenodd",
    d: "M6 3h12v4l-4 5v-2L10 8v2L6 7V3zm2 3h8v1L12 9l-4-2V6zm3 7h2v5l-1 2-1-2v-5z",
  },
  ring: {
    kind: "fill",
    fillRule: "evenodd",
    d: "M6 10l3-5h6l3 5v4l-3 5H9l-3-5v-4zm3-.5L10.5 7h3l1.5 2.5V13l-1.5 2.5h-3L9 13V9.5z",
  },
  stats: {
    kind: "stroke",
    children: <path d="M18 20V10M12 20V4M6 20v-6" />,
  },
  death: {
    kind: "stroke",
    children: (
      <>
        <circle cx="12" cy="10" r="7" />
        <circle cx="9" cy="9" r="1.5" fill="currentColor" stroke="none" />
        <circle cx="15" cy="9" r="1.5" fill="currentColor" stroke="none" />
        <path d="M8 17v4M12 17v4M16 17v4" />
        <path d="M9 14c.8.7 1.9 1 3 1s2.2-.3 3-1" />
      </>
    ),
  },
};

/** Props the widget exposes through its Zod schema. */
export const equipmentSlotIconPropsSchema = z.object({
  /** Which slot icon to render. */
  slot: z.enum(EQUIPMENT_SLOT_KEYS).default("helmet"),
  /** Pixel size (width = height). */
  sizePx: z.number().int().min(8).max(256).default(24),
  /**
   * CSS color applied via `currentColor` on the SVG. Defaults to
   * `currentColor` so hosts can paint via parent `color`.
   */
  color: z.string().default("currentColor"),
  /** Stroke width — only used by outline icons (stats, death). */
  strokeWidth: z.number().min(0.5).max(8).default(1.5),
  /** Optional title for accessibility (becomes <title>). */
  title: z.string().default(""),
});

export type EquipmentSlotIconProps = z.infer<
  typeof equipmentSlotIconPropsSchema
>;

/**
 * Widget definition — registered against the host's UI registry by
 * the meta-plugin's onEnable.
 */
export const equipmentSlotIconWidget: Widget<EquipmentSlotIconProps> =
  defineWidget({
    manifest: {
      id: "com.hyperforge.hyperscape.equipment-slot-icon",
      name: "Equipment Slot Icon",
      category: "panel",
      defaultSize: { width: 4, height: 4 },
    },
    propsSchema: equipmentSlotIconPropsSchema,
    defaultProps: {
      slot: "helmet",
      sizePx: 24,
      color: "currentColor",
      strokeWidth: 1.5,
      title: "",
    },
  });

/**
 * React component. Picks the SVG path/group from `ICON_SPECS` based
 * on the `slot` prop and renders an inline `<svg>`.
 */
export function EquipmentSlotIcon(
  props: EquipmentSlotIconProps,
): React.ReactElement {
  const { slot, sizePx, color, strokeWidth, title } = props;
  const spec = ICON_SPECS[slot];

  const commonAttrs = {
    width: sizePx,
    height: sizePx,
    viewBox: "0 0 24 24",
    style: { color },
    role: title ? "img" : undefined,
    "aria-label": title || undefined,
  } as const;

  if (spec.kind === "fill") {
    return (
      <svg {...commonAttrs} fill="currentColor">
        {title && <title>{title}</title>}
        <path d={spec.d} fillRule={spec.fillRule} clipRule={spec.fillRule} />
      </svg>
    );
  }

  if (spec.kind === "fill-multi") {
    return (
      <svg {...commonAttrs} fill="currentColor">
        {title && <title>{title}</title>}
        {spec.paths.map((p, i) => (
          <path key={i} d={p.d} fillRule={p.fillRule} clipRule={p.fillRule} />
        ))}
      </svg>
    );
  }

  // stroke
  return (
    <svg
      {...commonAttrs}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="square"
    >
      {title && <title>{title}</title>}
      {spec.children}
    </svg>
  );
}

/**
 * Bundled registration — pairs the widget schema with its React
 * renderer.
 */
export const equipmentSlotIconRegistration: WidgetRegistration<
  EquipmentSlotIconProps,
  React.ComponentType<EquipmentSlotIconProps>
> = {
  widget: equipmentSlotIconWidget,
  Component: EquipmentSlotIcon,
};
