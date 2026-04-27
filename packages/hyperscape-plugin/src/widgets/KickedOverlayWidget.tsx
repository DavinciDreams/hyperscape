/**
 * KickedOverlayWidget — full-screen overlay shown when the player is
 * kicked from the server.
 *
 * Phase D6.c.2 (overlay HUDs) first cut. Pairs with the existing
 * hand-coded `KickedOverlay` in client/src/game/hud/overlays/ so
 * hosts that opt into the widget pipeline can drop the hand-coded
 * version once verified pixel-equivalent.
 *
 * The widget is intentionally minimal — single `code` prop, lookup
 * of a friendly message from a small map, themed background +
 * foreground. Kick reasons are author-tunable through the manifest
 * default props for hosts that want to override messages without
 * a code change.
 *
 * Why this is the next widget migrated:
 *   - 47 LOC source, single primitive prop, pure presentational —
 *     smallest cleanest target in the overlay set.
 *   - No state, no event subscriptions — the host owns the
 *     "show / don't show" decision plus the `code` value.
 *   - Mirror target for D6.c.2's other overlays (Disconnected,
 *     DeathScreen) which are larger but follow the same shape.
 */

import {
  defineWidget,
  type Widget,
  type WidgetRegistration,
} from "@hyperforge/ui-framework";
import React from "react";
import { z } from "zod";

/**
 * Default kick-reason messages. Hosts can override per-pack via the
 * widget's `messages` prop default in their layout manifest.
 */
export const DEFAULT_KICK_MESSAGES: Readonly<Record<string, string>> = {
  duplicate_user: "Player already active on another device or window.",
  player_limit: "Player limit reached.",
  unknown: "You were kicked.",
};

/** Props the widget exposes through its Zod schema. */
export const kickedOverlayPropsSchema = z.object({
  /** Kick reason code — looked up against `messages`. */
  code: z.string().default("unknown"),
  /**
   * Reason-code → message map. Lookup falls through to
   * `messages.unknown` (or "You were kicked." if absent) on miss.
   */
  messages: z
    .record(z.string(), z.string())
    .default(() => ({ ...DEFAULT_KICK_MESSAGES })),
  /** Background color (theme-overridable via tokens). */
  backgroundColor: z.string().default("#0b0d12"),
  /** Foreground / text color. */
  textColor: z.string().default("#e6e8ec"),
  /** Font size in pixels. */
  fontSize: z.number().int().min(8).max(96).default(18),
});

export type KickedOverlayProps = z.infer<typeof kickedOverlayPropsSchema>;

/**
 * Widget definition — registered against the host's UI registry by
 * the meta-plugin's `onEnable` via the `ctx.widgets.register(...)`
 * adapter.
 */
export const kickedOverlayWidget: Widget<KickedOverlayProps> = defineWidget({
  manifest: {
    id: "com.hyperforge.hyperscape.kicked-overlay",
    name: "Kicked Overlay",
    category: "overlay",
    defaultSize: { width: 96, height: 24 },
  },
  propsSchema: kickedOverlayPropsSchema,
  defaultProps: {
    code: "unknown",
    messages: { ...DEFAULT_KICK_MESSAGES },
    backgroundColor: "#0b0d12",
    textColor: "#e6e8ec",
    fontSize: 18,
  },
});

/**
 * React component. Renders a centered, full-area panel with the
 * resolved message. The widget is visibility-gated by the layout —
 * the host turns it on only when the player is actually kicked.
 *
 * Resolution rule:
 *   `messages[code]` → `messages.unknown` → "You were kicked."
 */
export function KickedOverlay(props: KickedOverlayProps): React.ReactElement {
  const { code, messages, backgroundColor, textColor, fontSize } = props;
  const message =
    messages[code] ?? messages.unknown ?? DEFAULT_KICK_MESSAGES.unknown;

  return (
    <div
      role="alert"
      aria-live="assertive"
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor,
        pointerEvents: "auto",
      }}
    >
      <div
        style={{
          color: textColor,
          fontSize,
          fontFamily:
            "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif",
          textAlign: "center",
          padding: "0 24px",
          maxWidth: "80%",
        }}
      >
        {message}
      </div>
    </div>
  );
}

/**
 * Bundled registration — pairs the widget schema with its React
 * renderer. The plugin's `onEnable` passes this to
 * `ctx.widgets.register(...)`.
 */
export const kickedOverlayRegistration: WidgetRegistration<
  KickedOverlayProps,
  React.ComponentType<KickedOverlayProps>
> = {
  widget: kickedOverlayWidget,
  Component: KickedOverlay,
};
