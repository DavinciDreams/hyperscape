import React, { useState } from "react";
import type { ClientWorld, PlayerStats } from "../../types";
import { useThemeStore } from "@/ui";
import {
  getInteractiveTileStyle,
  getPanelHeaderStyle,
  getPanelInsetStyle,
  getPanelSurfaceStyle,
  getShellControlButtonStyle,
} from "@/ui/theme/themes";
import { UI } from "@/ui/core";

interface SkillSelectModalProps {
  visible: boolean;
  world: ClientWorld;
  stats: PlayerStats | null;
  xpAmount: number;
  itemId: string;
  slot: number;
  onClose: () => void;
}

const SKILLS = [
  { key: "attack", label: "Attack", icon: "⚔️" },
  { key: "strength", label: "Strength", icon: "💪" },
  { key: "defense", label: "Defense", icon: "🛡️" },
  { key: "constitution", label: "Constitution", icon: "❤️" },
  { key: "ranged", label: "Ranged", icon: "🏹" },
  { key: "prayer", label: "Prayer", icon: "✨" },
  { key: "magic", label: "Magic", icon: "🔮" },
  { key: "woodcutting", label: "Woodcutting", icon: "🪓" },
  { key: "mining", label: "Mining", icon: "⛏️" },
  { key: "fishing", label: "Fishing", icon: "🎣" },
  { key: "firemaking", label: "Firemaking", icon: "🔥" },
  { key: "cooking", label: "Cooking", icon: "🍳" },
  { key: "smithing", label: "Smithing", icon: "🔨" },
  { key: "agility", label: "Agility", icon: "🏃" },
];

/**
 * SkillSelectModal - Modal for selecting a skill to apply XP to (e.g., from XP lamps)
 */
export function SkillSelectModal({
  visible,
  world,
  stats,
  xpAmount,
  itemId,
  slot,
  onClose,
}: SkillSelectModalProps) {
  const theme = useThemeStore((s) => s.theme);
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null);
  const closeButtonStyle = getShellControlButtonStyle(theme, "danger");

  if (!visible) return null;

  const handleConfirm = () => {
    if (!selectedSkill) return;

    world.network?.send?.("useXpLamp", {
      itemId,
      slot,
      skill: selectedSkill,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/50 pointer-events-auto"
      style={{ zIndex: UI.Z_INDEX.MODAL }}
    >
      <div
        className="max-w-md w-full mx-4"
        style={{
          ...getPanelSurfaceStyle(theme, { emphasis: "strong" }),
          borderRadius: theme.borderRadius.xl,
          padding: "1rem",
          boxShadow: theme.shadows.xl,
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between mb-4"
          style={{
            ...getPanelHeaderStyle(theme),
            margin: "-1rem -1rem 1rem",
            padding: "0.75rem 1rem",
          }}
        >
          <h2
            className="text-lg font-bold"
            style={{ color: theme.colors.text.accent }}
          >
            Select a Skill
          </h2>
          <button
            onClick={onClose}
            style={{ ...closeButtonStyle, width: 28, height: 28, fontSize: 18 }}
          >
            ✕
          </button>
        </div>

        {/* XP Amount */}
        <div
          className="text-center mb-4"
          style={{
            ...getPanelInsetStyle(theme, {
              emphasis: "strong",
              radius: theme.borderRadius.md,
              padding: "0.65rem 0.75rem",
            }),
          }}
        >
          <span
            className="text-xl font-bold"
            style={{ color: theme.colors.text.accent }}
          >
            +{xpAmount.toLocaleString()} XP
          </span>
        </div>

        {/* Skill Grid */}
        <div className="grid grid-cols-2 gap-2 mb-4 max-h-80 overflow-y-auto">
          {SKILLS.map((skill) => {
            const skillData =
              stats?.skills?.[skill.key as keyof typeof stats.skills];
            const level = skillData?.level ?? 1;
            const isSelected = selectedSkill === skill.key;

            return (
              <button
                key={skill.key}
                onClick={() => setSelectedSkill(skill.key)}
                className="flex items-center gap-2 p-2 rounded border transition-colors"
                style={{
                  ...getInteractiveTileStyle(theme, {
                    active: isSelected,
                    radius: theme.borderRadius.md,
                    accentColor: theme.colors.accent.primary,
                  }),
                  color: theme.colors.text.primary,
                }}
              >
                <span className="text-xl">{skill.icon}</span>
                <div className="text-left">
                  <div className="text-sm font-medium">{skill.label}</div>
                  <div
                    className="text-xs"
                    style={{ color: theme.colors.text.muted }}
                  >
                    Level {level}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2 px-4 rounded transition-colors"
            style={{
              ...getInteractiveTileStyle(theme, {
                radius: theme.borderRadius.md,
              }),
              color: theme.colors.text.primary,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedSkill}
            className="flex-1 py-2 px-4 rounded transition-colors"
            style={{
              ...getInteractiveTileStyle(theme, {
                active: Boolean(selectedSkill),
                disabled: !selectedSkill,
                radius: theme.borderRadius.md,
                accentColor: theme.colors.accent.primary,
              }),
              color: selectedSkill
                ? theme.colors.text.primary
                : theme.colors.text.disabled,
            }}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
