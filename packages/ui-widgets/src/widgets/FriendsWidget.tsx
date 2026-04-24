/**
 * FriendsWidget — friend list panel adapter.
 *
 * Matches `hyperforge.panel.friends`. Presentational list with an
 * optional add-friend input. Add/remove/whisper stays in the
 * hand-coded `FriendsPanel.tsx`.
 */

import { memo } from "react";
import {
  FONT_STACK,
  INSET_BG,
  INSET_BG_SOFT,
  INSET_SHADOW_SOFT,
  PANEL_BG,
  PANEL_BORDER,
  STATE_SUCCESS,
  TEXT_MUTED,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
} from "./widgetStyles";

export interface FriendRow {
  id: string;
  name: string;
  online: boolean;
  world?: number;
}

export interface FriendsProps {
  showAddInput: boolean;
  items?: ReadonlyArray<FriendRow>;
}

const FALLBACK: ReadonlyArray<FriendRow> = [];

export const FriendsWidget = memo(function FriendsWidget({
  showAddInput,
  items,
}: FriendsProps) {
  const rows = items ?? FALLBACK;

  return (
    <div
      role="region"
      aria-label="Friends"
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        minWidth: 200,
        minHeight: 200,
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
          <span style={{ fontSize: 14 }}>👥</span>
          <span
            style={{
              color: TEXT_MUTED,
              fontSize: 8,
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            Friends
          </span>
        </div>
        <span
          style={{
            color: TEXT_SECONDARY,
            fontSize: 9,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {rows.filter((r) => r.online).length}/{rows.length} online
        </span>
      </div>
      {showAddInput && (
        <div
          style={{
            padding: "4px 6px",
            marginBottom: 4,
            background: INSET_BG_SOFT,
            border: `1px solid ${PANEL_BORDER}`,
            borderRadius: 4,
            color: TEXT_MUTED,
            fontSize: 10,
            boxShadow: INSET_SHADOW_SOFT,
          }}
        >
          Add friend…
        </div>
      )}
      <div
        style={{
          flex: 1,
          padding: 4,
          background: INSET_BG,
          borderRadius: 4,
          boxShadow: INSET_SHADOW_SOFT,
          overflow: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        {rows.length === 0 && (
          <div
            style={{
              padding: "12px 6px",
              textAlign: "center",
              color: TEXT_MUTED,
              fontSize: 10,
              fontStyle: "italic",
            }}
          >
            No friends yet — add one above.
          </div>
        )}
        {rows.map((row) => (
          <div
            key={row.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 6px",
              borderRadius: 3,
              background: "rgba(255, 255, 255, 0.02)",
              border: "1px solid rgba(255, 255, 255, 0.05)",
              opacity: row.online ? 1 : 0.55,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: row.online ? STATE_SUCCESS : "#555",
                flexShrink: 0,
                boxShadow: row.online ? `0 0 4px ${STATE_SUCCESS}88` : "none",
              }}
            />
            <span
              style={{
                flex: 1,
                color: TEXT_PRIMARY,
                fontSize: 11,
                fontWeight: 500,
              }}
            >
              {row.name}
            </span>
            {row.online && typeof row.world === "number" && (
              <span
                style={{
                  color: TEXT_SECONDARY,
                  fontSize: 9,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                W{row.world}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
});
