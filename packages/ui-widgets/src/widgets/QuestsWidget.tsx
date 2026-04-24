/**
 * QuestsWidget — quest journal panel adapter.
 *
 * Matches `hyperforge.panel.quests`. Renders a scrollable list of
 * quest rows with status dot color-coded per state. Quest detail
 * modal, "start quest" actions, and cutscenes stay in the hand-coded
 * `QuestsPanel.tsx` / `QuestJournalPanel.tsx`.
 */

import { memo } from "react";
import {
  FONT_STACK,
  INSET_BG,
  INSET_BG_SOFT,
  INSET_SHADOW_SOFT,
  PANEL_BG,
  PANEL_BORDER,
  STATE_DANGER,
  STATE_SUCCESS,
  STATE_WARNING,
  TEXT_ACCENT,
  TEXT_MUTED,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
} from "./widgetStyles";

export interface QuestRow {
  id: string;
  name: string;
  status: "not-started" | "in-progress" | "complete";
  difficulty?: string;
  questPoints?: number;
}

export interface QuestsProps {
  questPoints: number;
  maxQuestPoints: number;
  items?: ReadonlyArray<QuestRow>;
}

const FALLBACK: ReadonlyArray<QuestRow> = [
  {
    id: "cooks_assistant",
    name: "Cook's Assistant",
    status: "not-started",
    difficulty: "Novice",
    questPoints: 1,
  },
  {
    id: "rune_mysteries",
    name: "Rune Mysteries",
    status: "not-started",
    difficulty: "Novice",
    questPoints: 1,
  },
  {
    id: "demon_slayer",
    name: "Demon Slayer",
    status: "not-started",
    difficulty: "Novice",
    questPoints: 3,
  },
];

function statusColor(status: QuestRow["status"]): string {
  switch (status) {
    case "complete":
      return STATE_SUCCESS;
    case "in-progress":
      return STATE_WARNING;
    case "not-started":
    default:
      return STATE_DANGER;
  }
}

export const QuestsWidget = memo(function QuestsWidget({
  questPoints,
  maxQuestPoints,
  items,
}: QuestsProps) {
  const rows = items && items.length > 0 ? items : FALLBACK;

  return (
    <div
      role="region"
      aria-label="Quests"
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        minWidth: 240,
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
          <span style={{ fontSize: 14 }}>📜</span>
          <span
            style={{
              color: TEXT_MUTED,
              fontSize: 8,
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            Quests
          </span>
        </div>
        <span
          style={{
            color: TEXT_ACCENT,
            fontSize: 10,
            fontWeight: 700,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          QP {questPoints}/{maxQuestPoints}
        </span>
      </div>
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
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: statusColor(row.status),
                flexShrink: 0,
                boxShadow: `0 0 4px ${statusColor(row.status)}88`,
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
            {row.difficulty && (
              <span
                style={{
                  color: TEXT_SECONDARY,
                  fontSize: 9,
                  textTransform: "uppercase",
                  letterSpacing: 0.4,
                }}
              >
                {row.difficulty}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
});
