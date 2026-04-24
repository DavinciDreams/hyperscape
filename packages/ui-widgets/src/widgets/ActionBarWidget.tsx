/**
 * ActionBarWidget — schema-driven action bar adapter.
 *
 * Matches the `hyperforge.hud.action-bar` widget schema from
 * `@hyperforge/ui-framework/builtins`. Renders a horizontal row of
 * empty slots sized and counted per the manifest props. Real slot
 * bindings (abilities, items, cooldowns) plug in through a future
 * runtime-bindings layer — this adapter covers the *visual
 * placement* of the bar so layouts authored in the editor preview
 * look the same at runtime.
 *
 * Visual parity is aligned to the hand-coded `ActionBarPanel` in
 * `game/panels/ActionBarPanel/`: a dark inset panel with 3px gaps,
 * 4px padding, corner shortcut labels, and inset shadow on every
 * slot. Once the full D6 migration lands, the widget will pick up
 * theme tokens directly via CSS vars emitted by `applyTheme()`.
 */

import { memo } from "react";

export interface ActionBarProps {
  slotCount: number;
  slotSize: number;
  showKeybindings: boolean;
  showGcd: boolean;
}

const DEFAULT_KEYBINDS = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "0",
  "-",
  "=",
];

// Matches gameUI.actionBar tokens consumed by the hand-coded panel.
const SLOT_GAP = 3;
const PADDING = 4;
const PANEL_BG = "rgba(15, 17, 22, 0.85)";
const PANEL_BORDER = "rgba(255, 255, 255, 0.12)";
const PANEL_INSET_SHADOW = "inset 0 2px 8px rgba(0, 0, 0, 0.5)";
const PANEL_DROP_SHADOW = "0 1px 2px rgba(0, 0, 0, 0.35)";

// Empty-slot treatment mirrors ActionBarSlot's empty variant:
// getPanelInsetStyle(...) + a faint hairline border.
const SLOT_EMPTY_BG = "rgba(0, 0, 0, 0.35)";
const SLOT_EMPTY_BORDER = "rgba(255, 255, 255, 0.1)";
const SLOT_INSET_SHADOW = "inset 0 2px 4px rgba(0, 0, 0, 0.4)";

export const ActionBarWidget = memo(function ActionBarWidget({
  slotCount,
  slotSize,
  showKeybindings,
  showGcd,
}: ActionBarProps) {
  const slots = Array.from({ length: Math.max(0, slotCount) }, (_, i) => i);

  return (
    <div
      role="toolbar"
      aria-label="Action bar"
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${slotCount}, ${slotSize}px)`,
        gap: SLOT_GAP,
        padding: PADDING,
        background: PANEL_BG,
        border: `1px solid ${PANEL_BORDER}`,
        borderRadius: 6,
        boxShadow: `${PANEL_DROP_SHADOW}, ${PANEL_INSET_SHADOW}`,
        backdropFilter: "blur(4px)",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      {slots.map((i) => (
        <div
          key={i}
          style={{
            position: "relative",
            width: slotSize,
            height: slotSize,
            background: SLOT_EMPTY_BG,
            border: `1px solid ${SLOT_EMPTY_BORDER}`,
            borderRadius: 4,
            boxShadow: SLOT_INSET_SHADOW,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "rgba(255, 255, 255, 0.35)",
            fontSize: Math.max(10, Math.round(slotSize * 0.28)),
            fontWeight: 500,
          }}
        >
          {showKeybindings && (
            <span
              style={{
                position: "absolute",
                top: 1,
                left: 2,
                fontSize: 7,
                fontWeight: 700,
                color: "rgba(255, 255, 255, 0.65)",
                textShadow: "0 1px 1px rgba(0, 0, 0, 0.6)",
                pointerEvents: "none",
                lineHeight: 1,
              }}
            >
              {DEFAULT_KEYBINDS[i] ?? ""}
            </span>
          )}
          {showGcd && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: 3,
                boxShadow: "inset 0 0 0 1px rgba(255, 255, 255, 0.05)",
                pointerEvents: "none",
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
});
