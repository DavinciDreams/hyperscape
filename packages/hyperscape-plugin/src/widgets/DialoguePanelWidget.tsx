/**
 * DialoguePanelWidget — NPC dialogue interface (text body + numbered
 * response buttons or "Click to continue").
 *
 * Phase D6.c nineteenth widget migration. Mirrors the legacy
 * hand-coded `DialoguePanel`. Substrate-promote: the legacy panel
 * directly imports `useThemeStore`, calls `world.network.send(...)`
 * for `dialogueResponse` / `dialogueContinue`, and embeds the
 * 437-LOC `DialogueCharacterPortrait` (which uses Three.js for 3D
 * portrait rendering). The widget receives the dialogue payload via
 * typed props and exposes a `portraitNode` slot — hosts that want
 * 3D portraits render them externally and pass them in via an
 * `npcPortraitImageUrl` prop or omit it for a text-only dialogue.
 *
 * Adapter wiring (host responsibility):
 *
 *   ```ts
 *   <DialoguePanel
 *     visible={dialogueState.visible}
 *     npcName={dialogueState.npcName}
 *     text={dialogueState.text}
 *     responses={dialogueState.responses}
 *     onSelectResponse={(i, r) => {
 *       world.network?.send?.("dialogueResponse", {
 *         npcId: dialogueState.npcId,
 *         responseIndex: i,
 *       });
 *     }}
 *     onContinue={() => {
 *       world.network?.send?.("dialogueContinue", {
 *         npcId: dialogueState.npcId,
 *       });
 *     }}
 *   />
 *   ```
 */

import {
  defineWidget,
  type Widget,
  type WidgetRegistration,
} from "@hyperforge/ui-framework";
import React from "react";
import { z } from "zod";

/** A single response option. */
export const dialogueResponseSchema = z.object({
  /** Visible response text. */
  text: z.string().min(1),
  /** Server-assigned next-node id (forwarded to the host's callback). */
  nextNodeId: z.string().default(""),
  /** Optional effect tag (forwarded to the host's callback). */
  effect: z.string().optional(),
});

export type DialogueResponse = z.infer<typeof dialogueResponseSchema>;

/** Props the widget exposes through its Zod schema. */
export const dialoguePanelPropsSchema = z.object({
  /** Whether the panel is visible. Renders null when false. */
  visible: z.boolean().default(false),
  /** Display name of the NPC. */
  npcName: z.string().default(""),
  /** Body text rendered in the dialogue inset. */
  text: z.string().default(""),
  /** Response options. Empty array renders the "continue" button. */
  responses: z.array(dialogueResponseSchema).default(() => []),
  /**
   * Optional NPC portrait image URL. When non-empty, rendered as a
   * 136-px-wide image to the left of the dialogue text.
   */
  npcPortraitImageUrl: z.string().default(""),
  /** Continue button label (used when `responses` is empty). */
  continueLabel: z.string().default("Click to continue..."),
  /** Primary text color. */
  textColor: z.string().default("#e6e8ec"),
  /** Muted text color (response numbering). */
  mutedTextColor: z.string().default("#6e7585"),
  /** Accent color (border/hover for response buttons). */
  accentColor: z.string().default("#bea57b"),
  /** Inset background (dialogue body + response buttons idle). */
  insetBackgroundColor: z.string().default("rgba(22, 26, 31, 0.99)"),
  /** Inset border color. */
  insetBorderColor: z.string().default("#3a3f4d"),
  /** Response-button hover background. */
  hoverBackgroundColor: z.string().default("rgba(190, 165, 123, 0.12)"),
});

export type DialoguePanelProps = z.infer<typeof dialoguePanelPropsSchema>;

/** Extended runtime props — callbacks not modeled in the schema. */
export interface DialoguePanelRuntimeProps extends DialoguePanelProps {
  /**
   * Called when the user clicks a numbered response. Host adapter
   * sends the appropriate `dialogueResponse` packet.
   */
  readonly onSelectResponse?: (
    index: number,
    response: DialogueResponse,
  ) => void;
  /**
   * Called when the user clicks the "continue" button (only fires
   * when `responses` is empty). Host adapter sends the
   * `dialogueContinue` packet.
   */
  readonly onContinue?: () => void;
}

/**
 * Widget definition — registered against the host's UI registry by
 * the meta-plugin's onEnable.
 */
export const dialoguePanelWidget: Widget<DialoguePanelProps> = defineWidget({
  manifest: {
    id: "com.hyperforge.hyperscape.dialogue-panel",
    name: "Dialogue Panel",
    category: "panel",
    defaultSize: { width: 64, height: 32 },
  },
  propsSchema: dialoguePanelPropsSchema,
  defaultProps: {
    visible: false,
    npcName: "",
    text: "",
    responses: [],
    npcPortraitImageUrl: "",
    continueLabel: "Click to continue...",
    textColor: "#e6e8ec",
    mutedTextColor: "#6e7585",
    accentColor: "#bea57b",
    insetBackgroundColor: "rgba(22, 26, 31, 0.99)",
    insetBorderColor: "#3a3f4d",
    hoverBackgroundColor: "rgba(190, 165, 123, 0.12)",
  },
});

/**
 * React component. Returns null when `visible` is false. Renders an
 * optional portrait + body text + numbered response list (or a single
 * "continue" button when no responses are provided).
 */
export function DialoguePanel(
  props: DialoguePanelRuntimeProps,
): React.ReactElement | null {
  const {
    visible,
    npcName,
    text,
    responses,
    npcPortraitImageUrl,
    continueLabel,
    textColor,
    mutedTextColor,
    accentColor,
    insetBackgroundColor,
    insetBorderColor,
    hoverBackgroundColor,
    onSelectResponse,
    onContinue,
  } = props;

  if (!visible) return null;

  const insetStyle: React.CSSProperties = {
    background: insetBackgroundColor,
    border: `1px solid ${insetBorderColor}`,
    borderRadius: 8,
    padding: "7px 11px",
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        minWidth: 0,
        width: "100%",
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif",
      }}
    >
      <div
        style={{
          display: "grid",
          gap: 12,
          gridTemplateColumns: npcPortraitImageUrl
            ? "136px minmax(0, 1fr)"
            : "minmax(0, 1fr)",
          alignItems: "start",
          minHeight: 0,
        }}
      >
        {npcPortraitImageUrl && (
          <div
            style={{
              ...insetStyle,
              width: 136,
              height: 136,
              padding: 0,
              overflow: "hidden",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            aria-label={npcName ? `${npcName} portrait` : "NPC portrait"}
          >
            <img
              src={npcPortraitImageUrl}
              alt={npcName}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
              }}
            />
          </div>
        )}

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            minWidth: 0,
          }}
        >
          <div
            style={{
              ...insetStyle,
              fontSize: 14.2,
              lineHeight: 1.5,
              minHeight: "3.8rem",
              color: textColor,
            }}
          >
            {text}
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              maxHeight: "min(10.5rem, 22vh)",
              overflowY: "auto",
              paddingRight: 4,
            }}
          >
            {responses.length > 0 ? (
              responses.map((response, index) => (
                <button
                  key={index}
                  onClick={() => onSelectResponse?.(index, response)}
                  aria-label={`Response ${index + 1}: ${response.text}`}
                  style={{
                    ...insetStyle,
                    color: textColor,
                    fontSize: 15.2,
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                    cursor: "pointer",
                    textAlign: "left",
                    width: "100%",
                    transition: "all 150ms ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = hoverBackgroundColor;
                    e.currentTarget.style.borderColor = `${accentColor}80`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = insetBackgroundColor;
                    e.currentTarget.style.borderColor = insetBorderColor;
                  }}
                >
                  <span
                    style={{
                      color: mutedTextColor,
                      fontSize: 10,
                      minWidth: 14,
                    }}
                  >
                    {index + 1}.
                  </span>
                  <span style={{ lineHeight: 1.3 }}>{response.text}</span>
                </button>
              ))
            ) : (
              <button
                onClick={onContinue}
                aria-label="Continue dialogue"
                style={{
                  ...insetStyle,
                  background: `${accentColor}20`,
                  borderColor: `${accentColor}80`,
                  color: textColor,
                  fontSize: 15.2,
                  fontWeight: 600,
                  cursor: "pointer",
                  width: "100%",
                  transition: "background 150ms ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = `${accentColor}28`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = `${accentColor}20`;
                }}
              >
                {continueLabel}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Bundled registration — pairs the widget schema with its React
 * renderer.
 */
export const dialoguePanelRegistration: WidgetRegistration<
  DialoguePanelProps,
  React.ComponentType<DialoguePanelProps>
> = {
  widget: dialoguePanelWidget,
  Component: DialoguePanel as React.ComponentType<DialoguePanelProps>,
};
