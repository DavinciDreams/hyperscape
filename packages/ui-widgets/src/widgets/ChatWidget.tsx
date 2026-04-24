/**
 * ChatWidget — schema-driven chat panel adapter.
 *
 * Matches the `hyperforge.panel.chat` widget schema from
 * `@hyperforge/ui-framework/builtins`. Presentational shell: tab
 * row (when channels are on), scrollback area, and input field. Real
 * channel subscriptions, message history, and command dispatch plug
 * in when the runtime-bindings layer lands.
 *
 * Tabs, typography, and inset treatment mirror the hand-coded
 * `game/panels/ChatPanel.tsx` so a manifest-driven chat drop-in
 * lands at pixel parity with the live chat panel.
 */

import { memo } from "react";

export interface ChatProps {
  bufferSize: number;
  showChannels: boolean;
  autoHide: boolean;
  autoHideDelaySeconds: number;
}

// Match `tabs[]` declared in `ChatPanel.tsx` (All / Game / Clan / PM).
const CHANNELS = ["All", "Game", "Clan", "PM"] as const;

const PANEL_BG = "rgba(18, 20, 26, 0.9)";
const PANEL_BORDER = "rgba(255, 255, 255, 0.15)";
const INSET_BG = "rgba(0, 0, 0, 0.35)";
const INSET_SHADOW = "inset 0 2px 6px rgba(0, 0, 0, 0.45)";
const ACTIVE_TAB_BG = "rgba(99, 102, 241, 0.18)";
const ACTIVE_TAB_BORDER = "#6366f1";
const TEXT_PRIMARY = "#e8e9ed";
const TEXT_SECONDARY = "#9a9caa";
const TEXT_MUTED = "#636577";

export const ChatWidget = memo(function ChatWidget({
  bufferSize: _bufferSize,
  showChannels,
  autoHide: _autoHide,
  autoHideDelaySeconds: _autoHideDelaySeconds,
}: ChatProps) {
  return (
    <div
      role="log"
      aria-label="Chat"
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        minWidth: 280,
        minHeight: 160,
        background: PANEL_BG,
        border: `1px solid ${PANEL_BORDER}`,
        borderRadius: 6,
        color: TEXT_PRIMARY,
        fontFamily: "Inter, system-ui, sans-serif",
        fontSize: 12,
        overflow: "hidden",
      }}
    >
      {showChannels && (
        <div
          style={{
            display: "flex",
            gap: 2,
            padding: "4px 6px 0",
            borderBottom: `1px solid ${PANEL_BORDER}`,
            flexShrink: 0,
          }}
        >
          {CHANNELS.map((channel, idx) => {
            const isActive = idx === 0;
            return (
              <div
                key={channel}
                style={{
                  padding: "4px 10px 5px",
                  fontSize: 11,
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? TEXT_PRIMARY : TEXT_SECONDARY,
                  background: isActive ? ACTIVE_TAB_BG : "transparent",
                  borderRadius: "4px 4px 0 0",
                  borderBottom: isActive
                    ? `2px solid ${ACTIVE_TAB_BORDER}`
                    : "2px solid transparent",
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  opacity: isActive ? 1 : 0.78,
                }}
              >
                {channel}
              </div>
            );
          })}
        </div>
      )}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          margin: 6,
          padding: "6px 8px 8px",
          overflowY: "auto",
          background: INSET_BG,
          borderRadius: 4,
          boxShadow: INSET_SHADOW,
          color: TEXT_SECONDARY,
          fontSize: 11,
          lineHeight: 1.5,
        }}
      >
        <em style={{ color: TEXT_MUTED }}>Chat history will appear here…</em>
      </div>
      <div
        style={{
          padding: 6,
          paddingTop: 0,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            background: INSET_BG,
            border: `1px solid ${PANEL_BORDER}`,
            borderRadius: 4,
            padding: "5px 8px",
            color: TEXT_MUTED,
            fontSize: 11,
            boxShadow: INSET_SHADOW,
          }}
        >
          Type a message…
        </div>
      </div>
    </div>
  );
});
