/**
 * SpellsWidget — spellbook grid panel adapter.
 *
 * Matches `hyperforge.panel.spells`. Layout mirrors
 * `game/panels/SpellsPanel.tsx` default view: header strip with the
 * active spellbook + magic level, then a grid of spell icons.
 */

import { memo } from "react";
import {
  FONT_STACK,
  INSET_BG,
  INSET_BG_SOFT,
  INSET_SHADOW_SOFT,
  PANEL_BG,
  PANEL_BORDER,
  SLOT_EMPTY_BG,
  SLOT_FILLED_BG,
  STATE_DANGER,
  TEXT_ACCENT_SECONDARY,
  TEXT_MUTED,
  TEXT_SECONDARY,
} from "./widgetStyles";

export interface SpellRow {
  id: string;
  name: string;
  icon: string;
  levelRequired: number;
  castable: boolean;
}

export interface SpellsProps {
  magicLevel: number;
  spellbook: string;
  columns: number;
  items?: ReadonlyArray<SpellRow>;
}

const FALLBACK: ReadonlyArray<SpellRow> = [
  {
    id: "wind_strike",
    name: "Wind Strike",
    icon: "💨",
    levelRequired: 1,
    castable: true,
  },
  {
    id: "confuse",
    name: "Confuse",
    icon: "💫",
    levelRequired: 3,
    castable: false,
  },
  {
    id: "water_strike",
    name: "Water Strike",
    icon: "💧",
    levelRequired: 5,
    castable: false,
  },
  {
    id: "earth_strike",
    name: "Earth Strike",
    icon: "🪨",
    levelRequired: 9,
    castable: false,
  },
  {
    id: "weaken",
    name: "Weaken",
    icon: "🌀",
    levelRequired: 11,
    castable: false,
  },
  {
    id: "fire_strike",
    name: "Fire Strike",
    icon: "🔥",
    levelRequired: 13,
    castable: false,
  },
  {
    id: "bones_to_bananas",
    name: "Bones to Bananas",
    icon: "🍌",
    levelRequired: 15,
    castable: false,
  },
  {
    id: "wind_bolt",
    name: "Wind Bolt",
    icon: "🌬",
    levelRequired: 17,
    castable: false,
  },
  { id: "curse", name: "Curse", icon: "☠", levelRequired: 19, castable: false },
];

export const SpellsWidget = memo(function SpellsWidget({
  magicLevel,
  spellbook,
  columns,
  items,
}: SpellsProps) {
  const cols = Math.max(1, columns);
  const rows = items && items.length > 0 ? items : FALLBACK;

  return (
    <div
      role="region"
      aria-label="Spells"
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        minWidth: 220,
        minHeight: 240,
        padding: 4,
        background: PANEL_BG,
        border: `1px solid ${PANEL_BORDER}`,
        borderRadius: 6,
        fontFamily: FONT_STACK,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "4px 6px",
          marginBottom: 4,
          background: INSET_BG_SOFT,
          borderRadius: 4,
          boxShadow: INSET_SHADOW_SOFT,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 14 }}>✨</span>
          <span
            style={{
              color: TEXT_MUTED,
              fontSize: 8,
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            {spellbook}
          </span>
        </div>
        <span
          style={{
            color: TEXT_ACCENT_SECONDARY,
            fontSize: 10,
            fontWeight: 700,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          Mage Lv {magicLevel}
        </span>
      </div>
      <div
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gap: 3,
          padding: 4,
          background: INSET_BG,
          borderRadius: 4,
          boxShadow: INSET_SHADOW_SOFT,
          overflow: "auto",
        }}
      >
        {rows.map((row) => {
          const locked = row.levelRequired > magicLevel;
          const tint = row.castable
            ? TEXT_ACCENT_SECONDARY
            : locked
              ? STATE_DANGER
              : TEXT_MUTED;
          return (
            <div
              key={row.id}
              title={`${row.name} (Lv ${row.levelRequired})`}
              style={{
                aspectRatio: "1 / 1",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 2,
                padding: 2,
                background: row.castable ? SLOT_FILLED_BG : SLOT_EMPTY_BG,
                border: `1px solid ${tint}55`,
                borderRadius: 4,
                boxShadow: "inset 0 1px 2px rgba(0, 0, 0, 0.35)",
                opacity: locked ? 0.4 : 1,
              }}
            >
              <span style={{ fontSize: 16, lineHeight: 1 }}>{row.icon}</span>
              <span
                style={{
                  fontSize: 7,
                  color: TEXT_SECONDARY,
                  letterSpacing: 0.3,
                  textAlign: "center",
                  lineHeight: 1.1,
                }}
              >
                L{row.levelRequired}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
});
