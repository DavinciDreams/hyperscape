/**
 * StatsWidget — player summary panel adapter.
 *
 * Matches `hyperforge.panel.stats`. Shows player name + combat level +
 * an HP/prayer bar pair + total level badge. Intentionally compact so
 * it can sit at the top of the right rail above Equipment / Skills.
 */

import { memo } from "react";
import {
  FONT_STACK,
  INSET_BG,
  INSET_SHADOW_SOFT,
  PANEL_BG,
  PANEL_BORDER,
  STATE_DANGER,
  TEXT_ACCENT,
  TEXT_MUTED,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
} from "./widgetStyles";

export interface StatsProps {
  playerName: string;
  combatLevel: number;
  hp: number;
  maxHp: number;
  prayer: number;
  maxPrayer: number;
  totalLevel: number;
}

const HP_FILL = STATE_DANGER;
const PRAYER_FILL = "#0ea5e9";

function Meter({
  label,
  value,
  max,
  fill,
}: {
  label: string;
  value: number;
  max: number;
  fill: string;
}) {
  const pct = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontSize: 10,
      }}
    >
      <span
        style={{
          color: TEXT_MUTED,
          textTransform: "uppercase",
          letterSpacing: 0.4,
          width: 48,
        }}
      >
        {label}
      </span>
      <div
        style={{
          flex: 1,
          height: 8,
          background: "rgba(255, 255, 255, 0.05)",
          border: `1px solid ${fill}33`,
          borderRadius: 0,
          boxShadow: "inset 0 1px 2px rgba(0, 0, 0, 0.3)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct * 100}%`,
            height: "100%",
            background: fill,
            transition: "width 0.2s ease-out",
          }}
        />
      </div>
      <span
        style={{
          color: TEXT_PRIMARY,
          fontWeight: 700,
          fontSize: 10,
          minWidth: 44,
          textAlign: "right",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {Math.round(value)}/{max}
      </span>
    </div>
  );
}

export const StatsWidget = memo(function StatsWidget({
  playerName,
  combatLevel,
  hp,
  maxHp,
  prayer,
  maxPrayer,
  totalLevel,
}: StatsProps) {
  return (
    <div
      role="region"
      aria-label="Stats"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        padding: 6,
        background: PANEL_BG,
        border: `1px solid ${PANEL_BORDER}`,
        borderRadius: 6,
        fontFamily: FONT_STACK,
        minWidth: 220,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "4px 6px",
          background: INSET_BG,
          borderRadius: 4,
          boxShadow: INSET_SHADOW_SOFT,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span
            style={{
              color: TEXT_PRIMARY,
              fontWeight: 700,
              fontSize: 13,
              lineHeight: 1,
            }}
          >
            {playerName}
          </span>
          <span
            style={{
              color: TEXT_SECONDARY,
              fontSize: 9,
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            Lv {combatLevel}
          </span>
        </div>
        <span
          style={{
            color: TEXT_ACCENT,
            fontWeight: 700,
            fontSize: 11,
            fontVariantNumeric: "tabular-nums",
          }}
          title="Total level"
        >
          T {totalLevel}
        </span>
      </div>
      <div
        style={{
          padding: 6,
          background: INSET_BG,
          borderRadius: 4,
          boxShadow: INSET_SHADOW_SOFT,
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        <Meter label="HP" value={hp} max={maxHp} fill={HP_FILL} />
        <Meter
          label="Prayer"
          value={prayer}
          max={maxPrayer}
          fill={PRAYER_FILL}
        />
      </div>
    </div>
  );
});
