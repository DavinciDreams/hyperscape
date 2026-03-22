/**
 * DialoguePanel - NPC dialogue interface
 *
 * Features:
 * - Displays NPC dialogue text
 * - Shows response options as clickable buttons
 * - Closes when dialogue ends (no responses)
 * - OSRS-style appearance
 *
 * PRODUCTION PATTERN (OSRS/WoW style):
 * - Server is the single source of truth for UI state
 * - Server tracks active dialogue sessions via InteractionSessionManager
 * - Server validates distance and sends close packets when player moves away
 * - Client NEVER independently polls distance - this prevents race conditions
 *   with server/client position sync under network lag
 */

import React from "react";
import type { World } from "@hyperscape/shared";
import { useThemeStore } from "@/ui";
import {
  getPanelHeaderStyle,
  getPanelSurfaceStyle,
  getShellControlButtonStyle,
} from "@/ui/theme/themes";

interface DialogueResponse {
  text: string;
  nextNodeId: string;
  effect?: string;
}

interface DialoguePanelProps {
  visible: boolean;
  npcName: string;
  npcId: string;
  text: string;
  responses: DialogueResponse[];
  npcEntityId?: string;
  onSelectResponse: (index: number, response: DialogueResponse) => void;
  onClose: () => void;
  world: World;
}

export function DialoguePanel({
  visible,
  npcName,
  npcId,
  text,
  responses,
  npcEntityId: _npcEntityId,
  onSelectResponse,
  onClose,
  world,
}: DialoguePanelProps) {
  const theme = useThemeStore((s) => s.theme);
  const closeButtonStyle = getShellControlButtonStyle(theme, "danger");

  // NOTE: Distance validation is handled server-side by InteractionSessionManager.
  // The server sends 'dialogueClose' packets when the player moves too far away.
  // This prevents race conditions between client and server position sync under lag.

  if (!visible) return null;

  const handleResponseClick = (index: number, response: DialogueResponse) => {
    // Send response to server
    // SECURITY: Only send responseIndex - server determines nextNodeId and effect
    // from its own dialogue state to prevent dialogue skipping exploits
    if (world.network?.send) {
      world.network.send("dialogueResponse", {
        npcId,
        responseIndex: index,
      });
    }
    onSelectResponse(index, response);
  };

  const handleContinue = () => {
    // Terminal node - send continue packet to server so it can execute any pending effects
    // Server will then send dialogueEnd which clears the active modal state
    if (world.network?.send) {
      world.network.send("dialogueContinue", {
        npcId,
      });
    }
    // Close the dialogue UI immediately for responsive feel
    onClose();
  };

  return (
    <div
      className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[1000] pointer-events-auto"
      style={{
        width: "40rem",
        maxWidth: "90vw",
        ...getPanelSurfaceStyle(theme, { emphasis: "strong" }),
        borderRadius: theme.borderRadius.xl,
        padding: "1.5rem",
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.5)",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* NPC Name Header */}
      <div
        className="flex justify-between items-center mb-3 pb-2"
        style={{
          ...getPanelHeaderStyle(theme),
          margin: "-1.5rem -1.5rem 0.75rem",
          padding: "0.75rem 1rem",
        }}
      >
        <h3
          className="m-0 text-lg font-bold"
          style={{ color: theme.colors.text.accent }}
        >
          {npcName}
        </h3>
        <button
          onClick={onClose}
          className="cursor-pointer text-xl leading-none"
          style={{ ...closeButtonStyle, width: 28, height: 28, fontSize: 18 }}
          title="Close dialogue"
          aria-label="Close dialogue"
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = String(
              closeButtonStyle["--shell-button-hover-bg"],
            );
            e.currentTarget.style.color = String(
              closeButtonStyle["--shell-button-hover-fg"],
            );
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = String(
              closeButtonStyle.background,
            );
            e.currentTarget.style.color = String(closeButtonStyle.color);
          }}
        >
          x
        </button>
      </div>

      {/* Dialogue Text */}
      <div
        className="mb-4 text-white leading-relaxed"
        style={{
          fontSize: "1rem",
          minHeight: "3rem",
          color: theme.colors.text.primary,
        }}
      >
        {text}
      </div>

      {/* Response Options */}
      <div className="flex flex-col gap-2">
        {responses.length > 0 ? (
          responses.map((response, index) => (
            <button
              key={index}
              onClick={() => handleResponseClick(index, response)}
              className="w-full text-left py-2 px-4 rounded cursor-pointer transition-all"
              aria-label={`Response ${index + 1}: ${response.text}`}
              style={{
                background:
                  theme.name === "hyperscape"
                    ? "linear-gradient(180deg, rgba(240, 208, 96, 0.12) 0%, rgba(54, 42, 18, 0.16) 100%)"
                    : `${theme.colors.accent.primary}12`,
                border: `1px solid ${theme.colors.accent.primary}40`,
                color: theme.colors.text.secondary,
                borderRadius: theme.borderRadius.md,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background =
                  theme.name === "hyperscape"
                    ? "linear-gradient(180deg, rgba(240, 208, 96, 0.18) 0%, rgba(54, 42, 18, 0.22) 100%)"
                    : `${theme.colors.accent.primary}18`;
                e.currentTarget.style.borderColor = `${theme.colors.accent.primary}80`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background =
                  theme.name === "hyperscape"
                    ? "linear-gradient(180deg, rgba(240, 208, 96, 0.12) 0%, rgba(54, 42, 18, 0.16) 100%)"
                    : `${theme.colors.accent.primary}12`;
                e.currentTarget.style.borderColor = `${theme.colors.accent.primary}40`;
              }}
            >
              {index + 1}. {response.text}
            </button>
          ))
        ) : (
          <button
            onClick={handleContinue}
            className="w-full py-2 px-4 rounded cursor-pointer transition-all"
            aria-label="Continue dialogue"
            style={{
              background:
                theme.name === "hyperscape"
                  ? "linear-gradient(180deg, rgba(240, 208, 96, 0.2) 0%, rgba(67, 51, 18, 0.24) 100%)"
                  : `${theme.colors.accent.primary}20`,
              border: `1px solid ${theme.colors.accent.primary}70`,
              color: theme.colors.text.accent,
              borderRadius: theme.borderRadius.md,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background =
                theme.name === "hyperscape"
                  ? "linear-gradient(180deg, rgba(240, 208, 96, 0.28) 0%, rgba(67, 51, 18, 0.32) 100%)"
                  : `${theme.colors.accent.primary}28`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background =
                theme.name === "hyperscape"
                  ? "linear-gradient(180deg, rgba(240, 208, 96, 0.2) 0%, rgba(67, 51, 18, 0.24) 100%)"
                  : `${theme.colors.accent.primary}20`;
            }}
          >
            Click to continue...
          </button>
        )}
      </div>
    </div>
  );
}
