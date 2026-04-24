/**
 * SettingsWidget — settings panel adapter.
 *
 * Matches `hyperforge.panel.settings`. Presentational shell with
 * section headers; the hand-coded `SettingsPanel.tsx` is still the
 * source of truth for live setting controls and state.
 */

import { memo } from "react";
import {
  FONT_STACK,
  INSET_BG,
  INSET_BG_SOFT,
  INSET_SHADOW_SOFT,
  PANEL_BG,
  PANEL_BORDER,
  TEXT_MUTED,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
} from "./widgetStyles";

export interface SettingsProps {
  showAudio: boolean;
  showGraphics: boolean;
  showKeybindings: boolean;
}

interface Section {
  title: string;
  icon: string;
  items: ReadonlyArray<string>;
}

const AUDIO: Section = {
  title: "Audio",
  icon: "🔊",
  items: ["Master volume", "Music", "SFX", "Ambience"],
};

const GRAPHICS: Section = {
  title: "Graphics",
  icon: "🎨",
  items: ["Quality preset", "Shadows", "Anti-aliasing", "Bloom"],
};

const KEYBINDINGS: Section = {
  title: "Keybindings",
  icon: "⌨",
  items: ["Movement", "Camera", "Hotkeys", "Chat"],
};

function SectionBlock({ section }: { section: Section }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 2,
        padding: 6,
        background: INSET_BG_SOFT,
        borderRadius: 4,
        boxShadow: INSET_SHADOW_SOFT,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 2,
        }}
      >
        <span style={{ fontSize: 13 }}>{section.icon}</span>
        <span
          style={{
            color: TEXT_PRIMARY,
            fontSize: 10,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}
        >
          {section.title}
        </span>
      </div>
      {section.items.map((item) => (
        <div
          key={item}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "3px 4px",
            borderRadius: 3,
            color: TEXT_SECONDARY,
            fontSize: 10,
          }}
        >
          <span>{item}</span>
          <span style={{ color: TEXT_MUTED, fontSize: 9 }}>—</span>
        </div>
      ))}
    </div>
  );
}

export const SettingsWidget = memo(function SettingsWidget({
  showAudio,
  showGraphics,
  showKeybindings,
}: SettingsProps) {
  return (
    <div
      role="region"
      aria-label="Settings"
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        minWidth: 220,
        minHeight: 280,
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
          padding: "4px 6px",
          marginBottom: 4,
          background: INSET_BG_SOFT,
          borderRadius: 4,
          boxShadow: INSET_SHADOW_SOFT,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span style={{ fontSize: 14 }}>⚙</span>
        <span
          style={{
            color: TEXT_MUTED,
            fontSize: 8,
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}
        >
          Settings
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
          gap: 4,
        }}
      >
        {showAudio && <SectionBlock section={AUDIO} />}
        {showGraphics && <SectionBlock section={GRAPHICS} />}
        {showKeybindings && <SectionBlock section={KEYBINDINGS} />}
      </div>
    </div>
  );
});
