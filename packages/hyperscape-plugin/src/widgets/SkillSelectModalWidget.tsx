/**
 * SkillSelectModalWidget — modal for selecting a skill to apply XP
 * to (e.g., from XP lamps).
 *
 * Phase D6.c first panel migration. Mirrors the existing hand-coded
 * `SkillSelectModal`. Substrate-promote: the legacy modal subscribes
 * to player stats via the world reference + sends a `useXpLamp`
 * packet from its confirm handler. The widget receives skill levels
 * + XP amount through typed props and exposes `onConfirm` /
 * `onClose` callbacks instead.
 *
 * Visibility is host-controlled via the `visible` prop — same gating
 * behavior as the legacy modal.
 *
 * The default SKILLS catalog matches the legacy 14-skill list. Hosts
 * can override via the `skills` prop to support different game
 * modes (different skill sets, mod-added skills, etc.).
 *
 * Adapter wiring (host responsibility):
 *
 *   ```ts
 *   const skillLevels = useMemo(() => {
 *     const out: Record<string, number> = {};
 *     for (const [key, data] of Object.entries(playerStats?.skills ?? {})) {
 *       out[key] = data?.level ?? 1;
 *     }
 *     return out;
 *   }, [playerStats]);
 *
 *   <SkillSelectModal
 *     visible={lampOpen}
 *     xpAmount={pendingLampXp}
 *     skillLevels={skillLevels}
 *     onClose={() => setLampOpen(false)}
 *     onConfirm={(skillKey) => {
 *       world.network?.send?.("useXpLamp", { itemId, slot, skill: skillKey });
 *       setLampOpen(false);
 *     }}
 *   />
 *   ```
 */

import {
  defineWidget,
  type Widget,
  type WidgetRegistration,
} from "@hyperforge/ui-framework";
import React, { useState } from "react";
import { z } from "zod";

/** Skill catalog entry — id, display label, icon. */
export const skillCatalogEntrySchema = z.object({
  /** Unique skill key (e.g. "attack", "woodcutting"). */
  key: z.string().min(1),
  /** Display label (e.g. "Attack"). */
  label: z.string().min(1),
  /** Icon emoji or short string (e.g. "⚔️"). */
  icon: z.string().min(1),
});

export type SkillCatalogEntry = z.infer<typeof skillCatalogEntrySchema>;

/**
 * Default skill catalog — matches the 14 skills from the legacy
 * SkillSelectModal. Hosts can override via the `skills` prop.
 */
export const DEFAULT_SKILL_CATALOG: ReadonlyArray<SkillCatalogEntry> = [
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

/** Props the widget exposes through its Zod schema. */
export const skillSelectModalPropsSchema = z.object({
  /** Whether the modal is visible. Renders null when false. */
  visible: z.boolean().default(false),
  /** XP amount to apply (e.g. 2_500). Displayed in the +N XP banner. */
  xpAmount: z.number().int().nonnegative().default(0),
  /**
   * Per-skill current level map — used to render the "Level X"
   * subtext under each tile. Missing keys default to 1.
   */
  skillLevels: z
    .record(z.string(), z.number().int().nonnegative())
    .default(() => ({})),
  /** Skill catalog — defaults to DEFAULT_SKILL_CATALOG. */
  skills: z
    .array(skillCatalogEntrySchema)
    .default(() => DEFAULT_SKILL_CATALOG.map((s) => ({ ...s }))),
  /** Modal title. */
  title: z.string().default("Select a Skill"),
  /** Confirm button label. */
  confirmLabel: z.string().default("Confirm"),
  /** Cancel button label. */
  cancelLabel: z.string().default("Cancel"),
  /** Backdrop color (semi-transparent, dims the world behind). */
  backdropColor: z.string().default("rgba(0, 0, 0, 0.5)"),
  /** Modal panel background color. */
  panelBackgroundColor: z.string().default("rgba(15, 17, 25, 0.95)"),
  /** Panel border color. */
  panelBorderColor: z.string().default("#3a3f4d"),
  /** Header background color. */
  headerBackgroundColor: z.string().default("#1a1f2e"),
  /** Title text color. */
  titleColor: z.string().default("#ffd84d"),
  /** XP banner text + accent color. */
  accentColor: z.string().default("#ffd84d"),
  /** Primary text color. */
  textColor: z.string().default("#e6e8ec"),
  /** Muted text color (level subtext). */
  mutedTextColor: z.string().default("#a8aec0"),
  /** Disabled text color (used by Confirm when no skill selected). */
  disabledTextColor: z.string().default("#5a606e"),
  /** Skill tile default background. */
  tileBackgroundColor: z.string().default("rgba(40, 45, 60, 0.85)"),
  /** Skill tile selected background. */
  tileSelectedBackgroundColor: z.string().default("rgba(255, 216, 77, 0.15)"),
  /** Skill tile border default. */
  tileBorderColor: z.string().default("#3a3f4d"),
  /** Skill tile border selected. */
  tileSelectedBorderColor: z.string().default("#ffd84d"),
});

export type SkillSelectModalProps = z.infer<typeof skillSelectModalPropsSchema>;

/** Extended runtime props — callbacks for confirm / close. */
export interface SkillSelectModalRuntimeProps extends SkillSelectModalProps {
  /** Called when the user confirms with a selected skill. */
  readonly onConfirm?: (skillKey: string) => void;
  /** Called when the user closes the modal (Cancel or X). */
  readonly onClose?: () => void;
}

/**
 * Widget definition — registered against the host's UI registry by
 * the meta-plugin's onEnable.
 */
export const skillSelectModalWidget: Widget<SkillSelectModalProps> =
  defineWidget({
    manifest: {
      id: "com.hyperforge.hyperscape.skill-select-modal",
      name: "Skill Select Modal",
      category: "modal",
      defaultSize: { width: 64, height: 48 },
    },
    propsSchema: skillSelectModalPropsSchema,
    defaultProps: {
      visible: false,
      xpAmount: 0,
      skillLevels: {},
      skills: DEFAULT_SKILL_CATALOG.map((s) => ({ ...s })),
      title: "Select a Skill",
      confirmLabel: "Confirm",
      cancelLabel: "Cancel",
      backdropColor: "rgba(0, 0, 0, 0.5)",
      panelBackgroundColor: "rgba(15, 17, 25, 0.95)",
      panelBorderColor: "#3a3f4d",
      headerBackgroundColor: "#1a1f2e",
      titleColor: "#ffd84d",
      accentColor: "#ffd84d",
      textColor: "#e6e8ec",
      mutedTextColor: "#a8aec0",
      disabledTextColor: "#5a606e",
      tileBackgroundColor: "rgba(40, 45, 60, 0.85)",
      tileSelectedBackgroundColor: "rgba(255, 216, 77, 0.15)",
      tileBorderColor: "#3a3f4d",
      tileSelectedBorderColor: "#ffd84d",
    },
  });

/**
 * React component. Returns null when `visible` is false. Selected
 * skill state is internal; reset to null when the user closes.
 */
export function SkillSelectModal(
  props: SkillSelectModalRuntimeProps,
): React.ReactElement | null {
  const {
    visible,
    xpAmount,
    skillLevels,
    skills,
    title,
    confirmLabel,
    cancelLabel,
    backdropColor,
    panelBackgroundColor,
    panelBorderColor,
    headerBackgroundColor,
    titleColor,
    accentColor,
    textColor,
    mutedTextColor,
    disabledTextColor,
    tileBackgroundColor,
    tileSelectedBackgroundColor,
    tileBorderColor,
    tileSelectedBorderColor,
    onConfirm,
    onClose,
  } = props;

  const [selectedSkill, setSelectedSkill] = useState<string | null>(null);

  if (!visible) return null;

  const handleClose = (): void => {
    setSelectedSkill(null);
    onClose?.();
  };

  const handleConfirm = (): void => {
    if (!selectedSkill) return;
    onConfirm?.(selectedSkill);
    setSelectedSkill(null);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: backdropColor,
        pointerEvents: "auto",
        zIndex: 100,
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: 480,
          width: "100%",
          margin: "0 16px",
          background: panelBackgroundColor,
          border: `1px solid ${panelBorderColor}`,
          borderRadius: 16,
          padding: 16,
          boxShadow: "0 16px 48px rgba(0, 0, 0, 0.5)",
          color: textColor,
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            margin: "-16px -16px 16px",
            padding: "12px 16px",
            background: headerBackgroundColor,
            borderRadius: "16px 16px 0 0",
          }}
        >
          <h2
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: titleColor,
              margin: 0,
            }}
          >
            {title}
          </h2>
          <button
            onClick={handleClose}
            aria-label="Close"
            style={{
              width: 28,
              height: 28,
              fontSize: 18,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "transparent",
              border: `1px solid ${tileBorderColor}`,
              borderRadius: 6,
              color: textColor,
              cursor: "pointer",
              padding: 0,
            }}
          >
            ✕
          </button>
        </div>

        {/* XP banner */}
        <div
          style={{
            textAlign: "center",
            marginBottom: 16,
            background: tileBackgroundColor,
            borderRadius: 8,
            padding: "10px 12px",
          }}
        >
          <span style={{ fontSize: 20, fontWeight: 700, color: accentColor }}>
            +{xpAmount.toLocaleString()} XP
          </span>
        </div>

        {/* Skill grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 8,
            marginBottom: 16,
            maxHeight: 320,
            overflowY: "auto",
          }}
        >
          {skills.map((skill) => {
            const level = skillLevels[skill.key] ?? 1;
            const isSelected = selectedSkill === skill.key;
            return (
              <button
                key={skill.key}
                onClick={() => setSelectedSkill(skill.key)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: 8,
                  borderRadius: 8,
                  border: `1px solid ${
                    isSelected ? tileSelectedBorderColor : tileBorderColor
                  }`,
                  background: isSelected
                    ? tileSelectedBackgroundColor
                    : tileBackgroundColor,
                  color: textColor,
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "background 150ms ease, border-color 150ms ease",
                }}
              >
                <span style={{ fontSize: 20 }}>{skill.icon}</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>
                    {skill.label}
                  </div>
                  <div style={{ fontSize: 11, color: mutedTextColor }}>
                    Level {level}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={handleClose}
            style={{
              flex: 1,
              padding: "8px 16px",
              borderRadius: 8,
              border: `1px solid ${tileBorderColor}`,
              background: "transparent",
              color: textColor,
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedSkill}
            style={{
              flex: 1,
              padding: "8px 16px",
              borderRadius: 8,
              border: `1px solid ${
                selectedSkill ? accentColor : tileBorderColor
              }`,
              background: selectedSkill
                ? tileSelectedBackgroundColor
                : "transparent",
              color: selectedSkill ? textColor : disabledTextColor,
              cursor: selectedSkill ? "pointer" : "not-allowed",
              opacity: selectedSkill ? 1 : 0.6,
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Bundled registration — pairs the widget schema with its React
 * renderer. The plugin's `onEnable` passes this to
 * `ctx.widgets.register(...)`.
 */
export const skillSelectModalRegistration: WidgetRegistration<
  SkillSelectModalProps,
  React.ComponentType<SkillSelectModalProps>
> = {
  widget: skillSelectModalWidget,
  Component: SkillSelectModal as React.ComponentType<SkillSelectModalProps>,
};
