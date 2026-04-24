/**
 * HpBarWidget — schema-driven HP bar adapter.
 *
 * Matches the `hyperforge.hud.hp-bar` widget schema exported by
 * `@hyperforge/ui-framework/builtins`. This is the *manifest-driven*
 * renderer used when a layout manifest references the HP bar widget;
 * the existing `game/hud/StatusBars.tsx` continues to drive the live
 * HUD until the full D6 migration flips InterfaceManager to render
 * from a layout manifest.
 *
 * Visual style mirrors the game's existing HP orb palette so
 * manifest-driven layouts match hand-coded parity pixel-for-pixel.
 */

import { memo } from "react";

export interface HpBarProps {
  orientation: "horizontal" | "vertical";
  showNumeric: boolean;
  current: number;
  max: number;
}

// Pixel-parity constants mirroring the hand-coded `StatusBars.tsx`
// bars-mode HP row: flat red fill (#dc2626), 8px tall track, 0 radius,
// inset shadow, red-tinted hairline border.
const HP_FILL = "#dc2626";
const HP_TRACK_BG = "rgba(255, 255, 255, 0.05)";
const HP_TRACK_BORDER = "rgba(220, 38, 38, 0.3)";
const HP_TRACK_SHADOW = "inset 0 1px 2px rgba(0, 0, 0, 0.3)";
const BAR_THICKNESS = 8;

export const HpBarWidget = memo(function HpBarWidget({
  orientation,
  showNumeric,
  current,
  max,
}: HpBarProps) {
  const safeMax = Math.max(1, max);
  const clamped = Math.max(0, Math.min(current, safeMax));
  const pct = clamped / safeMax;
  const horizontal = orientation === "horizontal";

  return (
    <div
      role="progressbar"
      aria-label="Health"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      style={{
        position: "relative",
        width: horizontal ? "100%" : BAR_THICKNESS,
        height: horizontal ? BAR_THICKNESS : "100%",
        background: HP_TRACK_BG,
        border: `1px solid ${HP_TRACK_BORDER}`,
        borderRadius: 0,
        overflow: "hidden",
        boxShadow: HP_TRACK_SHADOW,
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          bottom: 0,
          width: horizontal ? `${pct * 100}%` : "100%",
          height: horizontal ? "100%" : `${pct * 100}%`,
          background: HP_FILL,
          borderRadius: 0,
          transition: "width 0.2s ease-out, height 0.2s ease-out",
        }}
      />
      {showNumeric && (
        <span
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 10,
            fontWeight: 700,
            color: "white",
            textShadow:
              "0 0 3px rgba(0, 0, 0, 0.9), 0 1px 2px rgba(0, 0, 0, 0.8)",
            pointerEvents: "none",
            lineHeight: 1,
          }}
        >
          {clamped}/{safeMax}
        </span>
      )}
    </div>
  );
});
