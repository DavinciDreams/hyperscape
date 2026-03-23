/**
 * QuestStartPanel - OSRS-style quest accept overlay
 *
 * Features:
 * - Shows quest name, description, requirements
 * - Displays rewards (items, XP, quest points)
 * - Accept/Decline buttons
 * - Shown when player accepts quest via dialogue
 */

import React, { useEffect } from "react";
import { useThemeStore } from "@/ui";
import {
  getInteractiveTileStyle,
  getPanelInsetStyle,
  getPanelSurfaceStyle,
  getShellControlButtonStyle,
} from "@/ui/theme/themes";
import { UI } from "@/ui/core";

interface QuestRequirements {
  quests: string[];
  skills: Record<string, number>;
  items: string[];
}

interface QuestRewards {
  questPoints: number;
  items: Array<{ itemId: string; quantity: number }>;
  xp: Record<string, number>;
}

interface QuestStartPanelProps {
  visible: boolean;
  questId: string;
  questName: string;
  description: string;
  difficulty: string;
  requirements: QuestRequirements;
  rewards: QuestRewards;
  onAccept: () => void;
  onDecline: () => void;
}

// Skill name formatting
const formatSkillName = (skill: string): string => {
  return skill.charAt(0).toUpperCase() + skill.slice(1);
};

export function QuestStartPanel({
  visible,
  questName,
  description,
  difficulty,
  requirements,
  rewards,
  onAccept,
  onDecline,
}: QuestStartPanelProps) {
  const theme = useThemeStore((s) => s.theme);
  // Inject themed scrollbar styles
  useEffect(() => {
    const styleId = "quest-start-scrollbar-styles";
    if (document.getElementById(styleId)) return;

    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      .quest-parchment-scroll::-webkit-scrollbar {
        width: 10px;
      }
      .quest-parchment-scroll::-webkit-scrollbar-track {
        background: rgba(139, 115, 85, 0.3);
        border-radius: 4px;
      }
      .quest-parchment-scroll::-webkit-scrollbar-thumb {
        background: linear-gradient(to bottom, #8b7355, #6b5545);
        border-radius: 4px;
        border: 1px solid rgba(74, 63, 47, 0.3);
      }
      .quest-parchment-scroll::-webkit-scrollbar-thumb:hover {
        background: linear-gradient(to bottom, #9b8365, #7b6555);
      }
    `;
    document.head.appendChild(style);
  }, []);

  if (!visible) return null;

  // Check if player meets requirements (for display purposes)
  const hasRequirements =
    requirements.quests.length === 0 &&
    Object.keys(requirements.skills).length === 0 &&
    requirements.items.length === 0;
  const declineButtonStyle = getShellControlButtonStyle(theme, "danger");

  return (
    <div
      className="fixed inset-0 flex items-center justify-center pointer-events-auto"
      style={{
        backgroundColor: "rgba(0, 0, 0, 0.85)",
        zIndex: UI.Z_INDEX.MODAL,
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Parchment Style Container */}
      <div
        className="relative quest-parchment-scroll"
        style={{
          width: "26rem",
          maxWidth: "90vw",
          maxHeight: "85vh",
          padding: "1.5rem 2rem",
          ...getPanelSurfaceStyle(theme, { emphasis: "strong" }),
          borderRadius: theme.borderRadius.xl,
          boxShadow:
            "0 0 40px rgba(201, 162, 39, 0.35), inset 0 0 20px rgba(139, 115, 85, 0.18)",
          overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Decorative Top Border */}
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{
            width: "60%",
            height: "4px",
            background:
              "linear-gradient(to right, transparent, #c9a227, transparent)",
          }}
        />

        {/* Header */}
        <div className="text-center mb-4">
          <h2
            className="m-0 text-xl font-bold"
            style={{
              color: theme.colors.text.accent,
              textShadow: "0 1px 2px rgba(0, 0, 0, 0.35)",
              fontFamily: "serif",
            }}
          >
            New Quest
          </h2>
        </div>

        {/* Quest Name */}
        <div
          className="text-center mb-3 py-2"
          style={{
            ...getPanelInsetStyle(theme, {
              emphasis: "strong",
              radius: theme.borderRadius.md,
              padding: "0.5rem 0.75rem",
            }),
          }}
        >
          <h3
            className="m-0 text-lg font-bold"
            style={{ color: theme.colors.text.primary, fontFamily: "serif" }}
          >
            {questName}
          </h3>
          <span
            className="text-sm"
            style={{ color: theme.colors.text.secondary }}
          >
            Difficulty: {difficulty}
          </span>
        </div>

        {/* Description */}
        <div className="mb-4">
          <p
            className="m-0 text-sm leading-relaxed"
            style={{ color: "#4a3f2f", fontFamily: "serif" }}
          >
            {description}
          </p>
        </div>

        {/* Divider */}
        <div
          className="mx-auto mb-3"
          style={{
            width: "80%",
            height: "2px",
            background:
              "linear-gradient(to right, transparent, #8b7355, transparent)",
          }}
        />

        {/* Requirements Section */}
        {!hasRequirements && (
          <div className="mb-4">
            <h4
              className="m-0 mb-2 text-sm font-bold"
              style={{ color: "#4a3f2f" }}
            >
              Requirements:
            </h4>
            <div className="space-y-1 pl-2">
              {requirements.quests.map((quest, i) => (
                <div key={i} className="text-sm" style={{ color: "#5a4f3f" }}>
                  • Complete: {quest}
                </div>
              ))}
              {Object.entries(requirements.skills).map(([skill, level]) => (
                <div
                  key={skill}
                  className="text-sm"
                  style={{ color: "#5a4f3f" }}
                >
                  • {formatSkillName(skill)} Level {level}
                </div>
              ))}
              {requirements.items.map((item, i) => (
                <div key={i} className="text-sm" style={{ color: "#5a4f3f" }}>
                  • Bring: {item}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Rewards Section */}
        <div className="mb-4">
          <h4
            className="m-0 mb-2 text-sm font-bold"
            style={{ color: "#4a3f2f" }}
          >
            Rewards:
          </h4>
          <div className="space-y-1 pl-2">
            {rewards.questPoints > 0 && (
              <div className="text-sm font-medium" style={{ color: "#3a6f3a" }}>
                • {rewards.questPoints} Quest Point
                {rewards.questPoints !== 1 ? "s" : ""}
              </div>
            )}
            {rewards.items.length > 0 && (
              <div className="text-sm" style={{ color: "#5a4f3f" }}>
                • Item rewards
              </div>
            )}
            {Object.keys(rewards.xp).length > 0 && (
              <div className="text-sm" style={{ color: "#5a4f3f" }}>
                • XP rewards
              </div>
            )}
          </div>
        </div>

        {/* Divider */}
        <div
          className="mx-auto mb-4"
          style={{
            width: "80%",
            height: "2px",
            background:
              "linear-gradient(to right, transparent, #8b7355, transparent)",
          }}
        />

        {/* Buttons */}
        <div className="flex gap-3 justify-center">
          <button
            onClick={onAccept}
            className="px-6 py-2 rounded cursor-pointer transition-all font-bold"
            style={{
              ...getInteractiveTileStyle(theme, {
                active: true,
                accentColor: theme.colors.state.success,
                radius: theme.borderRadius.md,
              }),
              color: "#ffffff",
              textShadow: "1px 1px 2px rgba(0, 0, 0, 0.5)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background =
                "linear-gradient(to bottom, #5a9f5a 0%, #4a8f4a 100%)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background =
                "linear-gradient(to bottom, #4a8f4a 0%, #3a7f3a 100%)";
            }}
          >
            Accept Quest
          </button>
          <button
            onClick={onDecline}
            className="px-6 py-2 rounded cursor-pointer transition-all font-bold"
            style={{
              ...declineButtonStyle,
              width: "auto",
              height: "auto",
              padding: "0.5rem 1.5rem",
              fontSize: theme.typography.fontSize.base,
              textShadow: "1px 1px 2px rgba(0, 0, 0, 0.5)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = String(
                declineButtonStyle["--shell-button-hover-bg"],
              );
              e.currentTarget.style.color = String(
                declineButtonStyle["--shell-button-hover-fg"],
              );
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = String(
                declineButtonStyle.background,
              );
              e.currentTarget.style.color = String(declineButtonStyle.color);
            }}
          >
            Not Now
          </button>
        </div>

        {/* Decorative Bottom Border */}
        <div
          className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2"
          style={{
            width: "60%",
            height: "4px",
            background:
              "linear-gradient(to right, transparent, #c9a227, transparent)",
          }}
        />
      </div>
    </div>
  );
}
