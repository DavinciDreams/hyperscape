/**
 * MinimapWidget — schema-driven minimap adapter.
 *
 * Matches the `hyperforge.hud.minimap` widget schema from
 * `@hyperforge/ui-framework/builtins`. Presentational shell only:
 * renders a SQUARE framed placeholder sized per `props.size` with
 * optional compass markers. Real-world projection, entity pips, and
 * the full 3D canvas in `game/hud/Minimap.tsx` plug in once the
 * runtime-bindings layer exposes camera/world state.
 *
 * Frame language mirrors the hand-coded minimap: square viewport
 * with a subtle border, drop shadow, and a grass-tinted background
 * so layouts authored in the editor preview land at the same visual
 * weight as the live HUD minimap.
 */

import { memo } from "react";

export interface MinimapProps {
  size: number;
  baseRadius: number;
  showCompass: boolean;
  showPlayerPips: boolean;
  showEntityPips: boolean;
}

const COMPASS_POINTS: ReadonlyArray<{
  label: string;
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
}> = [
  { label: "N", top: 4, left: 0, right: 0 },
  { label: "S", bottom: 4, left: 0, right: 0 },
  { label: "W", top: 0, bottom: 0, left: 6 },
  { label: "E", top: 0, bottom: 0, right: 6 },
];

export const MinimapWidget = memo(function MinimapWidget({
  size,
  baseRadius: _baseRadius,
  showCompass,
  showPlayerPips,
  showEntityPips: _showEntityPips,
}: MinimapProps) {
  return (
    <div
      role="img"
      aria-label="Minimap"
      style={{
        position: "relative",
        width: size,
        height: size,
        // Grass-tinted fill mirrors hand-coded `#2a4a2a` inner map
        // plus a subtle top-to-bottom vignette.
        background: "linear-gradient(180deg, #2f4a2f 0%, #1d2f1d 100%)",
        border: "2px solid rgba(255, 255, 255, 0.22)",
        borderRadius: 8,
        boxShadow:
          "0 4px 12px rgba(0, 0, 0, 0.4), inset 0 0 24px rgba(0, 0, 0, 0.45)",
        fontFamily: "Inter, system-ui, sans-serif",
        overflow: "hidden",
      }}
    >
      {/* Faint grid lines give the empty placeholder a minimap-y feel */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(255, 255, 255, 0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.04) 1px, transparent 1px)",
          backgroundSize: `${Math.max(16, Math.round(size * 0.1))}px ${Math.max(16, Math.round(size * 0.1))}px`,
          pointerEvents: "none",
        }}
      />
      {showCompass &&
        COMPASS_POINTS.map(({ label, ...pos }) => (
          <div
            key={label}
            style={{
              position: "absolute",
              ...pos,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "rgba(255, 255, 255, 0.85)",
              fontSize: Math.max(9, Math.round(size * 0.06)),
              fontWeight: 700,
              textShadow: "0 1px 2px rgba(0, 0, 0, 0.9)",
              pointerEvents: "none",
              letterSpacing: 0.5,
            }}
          >
            {label}
          </div>
        ))}
      {showPlayerPips && (
        <div
          aria-label="Player marker"
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            width: Math.max(6, Math.round(size * 0.04)),
            height: Math.max(6, Math.round(size * 0.04)),
            marginLeft: -Math.max(3, Math.round(size * 0.02)),
            marginTop: -Math.max(3, Math.round(size * 0.02)),
            borderRadius: "50%",
            background: "#fbbf24",
            border: "1px solid rgba(255, 255, 255, 0.9)",
            boxShadow:
              "0 0 6px rgba(251, 191, 36, 0.8), 0 1px 2px rgba(0, 0, 0, 0.6)",
            pointerEvents: "none",
          }}
        />
      )}
    </div>
  );
});
