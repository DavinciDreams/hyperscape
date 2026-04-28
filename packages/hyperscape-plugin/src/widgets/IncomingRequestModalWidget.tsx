/**
 * IncomingRequestModalWidget — yes/no modal for incoming player
 * requests (trade, duel, party-invite, friend-request, etc.).
 *
 * Phase D6.c seventeenth widget migration. Generalized from the
 * legacy hand-coded `TradeRequestModal` so the same widget can
 * front any "Player X wants to do Y, accept/decline?" prompt.
 *
 * Substrate-promote design:
 *   - Drops `ModalWindow` from `@/ui` — inlines the modal frame.
 *   - All theme tokens (panel surfaces, badges, button colors,
 *     hover states) become explicit color props.
 *   - The hero block displays `{ name, badgeText }` — for the trade
 *     request case the badge holds "Level: 42"; for a duel-stake
 *     request it could hold the wager preview, etc.
 *   - The body and footer messages are plain string props so hosts
 *     can localize without forking the widget.
 *
 * Adapter wiring (host responsibility):
 *
 *   ```ts
 *   <IncomingRequestModal
 *     visible={tradeRequestState.visible}
 *     title="Trade Request"
 *     playerName={tradeRequestState.fromPlayer?.name ?? ""}
 *     playerBadgeText={`Level: ${tradeRequestState.fromPlayer?.level ?? 0}`}
 *     bodyText="wishes to trade with you"
 *     footerText="Request expires in 30 seconds"
 *     onAccept={acceptTrade}
 *     onDecline={declineTrade}
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

/** Props the widget exposes through its Zod schema. */
export const incomingRequestModalPropsSchema = z.object({
  /** Whether the modal is visible. Renders null when false. */
  visible: z.boolean().default(false),
  /** Modal header text. */
  title: z.string().default("Incoming Request"),
  /** Display name of the requesting player. */
  playerName: z.string().default(""),
  /**
   * Badge text rendered in parens after the player name (e.g.,
   * "Level: 42"). Empty string hides the badge.
   */
  playerBadgeText: z.string().default(""),
  /** Body message under the player block. */
  bodyText: z.string().default("wants to interact with you"),
  /** Optional footer note (e.g., "Request expires in 30 seconds"). */
  footerText: z.string().default(""),
  /** Accept button label. */
  acceptLabel: z.string().default("Accept"),
  /** Decline button label. */
  declineLabel: z.string().default("Decline"),
  /** Modal width in pixels. */
  widthPx: z.number().int().min(240).max(960).default(360),
  /** Backdrop color. */
  backdropColor: z.string().default("rgba(0, 0, 0, 0.5)"),
  /** Panel background. */
  panelBackgroundColor: z.string().default("rgba(15, 17, 25, 0.95)"),
  /** Panel border. */
  panelBorderColor: z.string().default("#3a3f4d"),
  /** Header background. */
  headerBackgroundColor: z.string().default("#1a1f2e"),
  /** Title text color. */
  titleColor: z.string().default("#e6e8ec"),
  /** Player-info inset background. */
  playerInfoBackgroundColor: z.string().default("rgba(20, 24, 36, 0.85)"),
  /** Player-info inset border. */
  playerInfoBorderColor: z.string().default("#3a3f4d"),
  /** Primary text color. */
  textColor: z.string().default("#e6e8ec"),
  /** Secondary text color. */
  secondaryTextColor: z.string().default("#a8aec0"),
  /** Muted text color (badge parens, footer). */
  mutedTextColor: z.string().default("#6e7585"),
  /** Badge accent color (e.g., level number). */
  badgeAccentColor: z.string().default("#ffd84d"),
  /** Accept button color (state.success). */
  acceptAccentColor: z.string().default("#4ade80"),
  /** Decline button color (state.danger). */
  declineAccentColor: z.string().default("#e84545"),
});

export type IncomingRequestModalProps = z.infer<
  typeof incomingRequestModalPropsSchema
>;

/** Extended runtime props — callbacks not modeled in the schema. */
export interface IncomingRequestModalRuntimeProps extends IncomingRequestModalProps {
  /** Called when the user clicks Accept. */
  readonly onAccept?: () => void;
  /** Called when the user clicks Decline (or the backdrop). */
  readonly onDecline?: () => void;
}

/**
 * Widget definition — registered against the host's UI registry by
 * the meta-plugin's onEnable.
 */
export const incomingRequestModalWidget: Widget<IncomingRequestModalProps> =
  defineWidget({
    manifest: {
      id: "com.hyperforge.hyperscape.incoming-request-modal",
      name: "Incoming Request Modal",
      category: "modal",
      defaultSize: { width: 48, height: 32 },
    },
    propsSchema: incomingRequestModalPropsSchema,
    defaultProps: {
      visible: false,
      title: "Incoming Request",
      playerName: "",
      playerBadgeText: "",
      bodyText: "wants to interact with you",
      footerText: "",
      acceptLabel: "Accept",
      declineLabel: "Decline",
      widthPx: 360,
      backdropColor: "rgba(0, 0, 0, 0.5)",
      panelBackgroundColor: "rgba(15, 17, 25, 0.95)",
      panelBorderColor: "#3a3f4d",
      headerBackgroundColor: "#1a1f2e",
      titleColor: "#e6e8ec",
      playerInfoBackgroundColor: "rgba(20, 24, 36, 0.85)",
      playerInfoBorderColor: "#3a3f4d",
      textColor: "#e6e8ec",
      secondaryTextColor: "#a8aec0",
      mutedTextColor: "#6e7585",
      badgeAccentColor: "#ffd84d",
      acceptAccentColor: "#4ade80",
      declineAccentColor: "#e84545",
    },
  });

/**
 * React component. Returns null when `visible` is false. Hover state
 * is internal; resets on close. Backdrop click routes through
 * `onDecline` (matches legacy ModalWindow behavior).
 */
export function IncomingRequestModal(
  props: IncomingRequestModalRuntimeProps,
): React.ReactElement | null {
  const {
    visible,
    title,
    playerName,
    playerBadgeText,
    bodyText,
    footerText,
    acceptLabel,
    declineLabel,
    widthPx,
    backdropColor,
    panelBackgroundColor,
    panelBorderColor,
    headerBackgroundColor,
    titleColor,
    playerInfoBackgroundColor,
    playerInfoBorderColor,
    textColor,
    secondaryTextColor,
    mutedTextColor,
    badgeAccentColor,
    acceptAccentColor,
    declineAccentColor,
    onAccept,
    onDecline,
  } = props;

  const [acceptHover, setAcceptHover] = useState(false);
  const [declineHover, setDeclineHover] = useState(false);

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) onDecline?.();
      }}
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
          width: widthPx,
          maxWidth: "calc(100% - 32px)",
          background: panelBackgroundColor,
          border: `1px solid ${panelBorderColor}`,
          borderRadius: 12,
          overflow: "hidden",
          color: textColor,
        }}
      >
        <div
          style={{
            padding: "12px 16px",
            background: headerBackgroundColor,
          }}
        >
          <h3
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: titleColor,
              margin: 0,
            }}
          >
            {title}
          </h3>
        </div>

        <div style={{ padding: 16 }}>
          <div
            style={{
              padding: 12,
              borderRadius: 6,
              border: `1px solid ${playerInfoBorderColor}`,
              background: playerInfoBackgroundColor,
              textAlign: "center",
              marginBottom: 16,
            }}
          >
            <p style={{ fontSize: 14, margin: "0 0 4px" }}>
              <span style={{ fontWeight: 700 }}>{playerName}</span>
              {playerBadgeText && (
                <>
                  <span style={{ color: mutedTextColor }}> (</span>
                  <span style={{ color: badgeAccentColor, fontWeight: 700 }}>
                    {playerBadgeText}
                  </span>
                  <span style={{ color: mutedTextColor }}>)</span>
                </>
              )}
            </p>
            <p
              style={{
                fontSize: 13,
                color: secondaryTextColor,
                margin: 0,
              }}
            >
              {bodyText}
            </p>
          </div>

          <div style={{ display: "flex", gap: 12 }}>
            <button
              onClick={onAccept}
              onMouseEnter={() => setAcceptHover(true)}
              onMouseLeave={() => setAcceptHover(false)}
              style={{
                flex: 1,
                padding: "8px 12px",
                borderRadius: 6,
                border: `1px solid ${acceptAccentColor}`,
                background: acceptHover
                  ? acceptAccentColor
                  : `${acceptAccentColor}b3`,
                color: "white",
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
                transition: "all 0.2s ease",
                transform: acceptHover ? "translateY(-1px)" : "none",
                textShadow: "0 1px 2px rgba(0,0,0,0.5)",
              }}
            >
              {acceptLabel}
            </button>
            <button
              onClick={onDecline}
              onMouseEnter={() => setDeclineHover(true)}
              onMouseLeave={() => setDeclineHover(false)}
              style={{
                flex: 1,
                padding: "8px 12px",
                borderRadius: 6,
                border: `1px solid ${declineAccentColor}`,
                background: declineHover
                  ? declineAccentColor
                  : `${declineAccentColor}b3`,
                color: "white",
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
                transition: "all 0.2s ease",
                transform: declineHover ? "translateY(-1px)" : "none",
                textShadow: "0 1px 2px rgba(0,0,0,0.5)",
              }}
            >
              {declineLabel}
            </button>
          </div>

          {footerText && (
            <p
              style={{
                fontSize: 11,
                color: mutedTextColor,
                textAlign: "center",
                marginTop: 12,
                marginBottom: 0,
              }}
            >
              {footerText}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Bundled registration — pairs the widget schema with its React
 * renderer.
 */
export const incomingRequestModalRegistration: WidgetRegistration<
  IncomingRequestModalProps,
  React.ComponentType<IncomingRequestModalProps>
> = {
  widget: incomingRequestModalWidget,
  Component:
    IncomingRequestModal as React.ComponentType<IncomingRequestModalProps>,
};
