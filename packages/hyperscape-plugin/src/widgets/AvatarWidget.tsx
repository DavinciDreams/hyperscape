/**
 * AvatarWidget — circular/square user avatar with image-or-initials
 * fallback and an optional online-status dot.
 *
 * Phase D6.c thirty-seventh widget migration. New foundational
 * primitive (no single legacy callsite — the codebase inlines avatar
 * markup per use site, often inside friends/party lists, chat
 * messages, player tooltips, etc.). Substrate-promote: zero
 * theme-store dependency, all colors as explicit props,
 * deterministic hash-to-color assignment for the initials background
 * so the same name renders the same tint everywhere.
 *
 * Adapter wiring (host responsibility):
 *
 *   ```ts
 *   <Avatar
 *     name="Eldorin"
 *     imageUrl={player.avatarUrl}
 *     status="online"
 *     sizePx={32}
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

/** Avatar shape. */
export const AVATAR_SHAPES = ["circle", "square"] as const;
export type AvatarShape = (typeof AVATAR_SHAPES)[number];

/** Online presence dot. `"none"` hides it. */
export const AVATAR_STATUSES = [
  "none",
  "online",
  "away",
  "busy",
  "offline",
] as const;
export type AvatarStatus = (typeof AVATAR_STATUSES)[number];

/**
 * Default 8-color initials palette (HSL-spaced for visual variety).
 * The deterministic hash maps `name` to one of these.
 */
export const DEFAULT_AVATAR_INITIAL_COLORS: ReadonlyArray<string> = [
  "#5b8def",
  "#48c5b7",
  "#f6a55c",
  "#e85d75",
  "#a06cd5",
  "#3aa0ff",
  "#4ade80",
  "#ffd84d",
];

/** Default per-status dot colors. */
export const DEFAULT_AVATAR_STATUS_COLORS: Readonly<
  Record<Exclude<AvatarStatus, "none">, string>
> = {
  online: "#4ade80",
  away: "#ffd84d",
  busy: "#e84545",
  offline: "#6e7585",
};

/**
 * Compute up to two uppercase initials from a name. Empty / blank
 * strings return `"?"`. Single-word names return their first letter.
 *
 *   "Eldorin"            → "E"
 *   "Hans the Smith"     → "HT"
 *   "  jane   doe-king"  → "JD"
 */
export function computeInitials(name: string): string {
  const tokens = name.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return "?";
  if (tokens.length === 1) return tokens[0]!.charAt(0).toUpperCase();
  const first = tokens[0]!.charAt(0).toUpperCase();
  const second = tokens[tokens.length - 1]!.charAt(0).toUpperCase();
  return `${first}${second}`;
}

/**
 * Stable name → palette index. Pure function of the input name,
 * so the same name always lands on the same color.
 */
export function pickPaletteIndex(name: string, paletteSize: number): number {
  if (paletteSize <= 0) return 0;
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % paletteSize;
}

/** Props the widget exposes through its Zod schema. */
export const avatarPropsSchema = z.object({
  /** Display name — drives initials and palette assignment. */
  name: z.string().default(""),
  /** Optional avatar image URL. Falls through to initials on error. */
  imageUrl: z.string().default(""),
  /** Pixel size (width = height). */
  sizePx: z.number().int().min(8).max(256).default(32),
  /** Avatar shape. */
  shape: z.enum(AVATAR_SHAPES).default("circle"),
  /** Optional presence status dot. */
  status: z.enum(AVATAR_STATUSES).default("none"),
  /** Initials text color. */
  initialsTextColor: z.string().default("#0f1119"),
  /**
   * Optional initials-background palette. Empty = use the bundled
   * `DEFAULT_AVATAR_INITIAL_COLORS`.
   */
  initialsPalette: z.array(z.string()).default(() => []),
  /** Border color. Empty = no border. */
  borderColor: z.string().default(""),
  /** Border width (px). */
  borderWidthPx: z.number().int().min(0).max(8).default(0),
  /**
   * Per-status dot color overrides. Missing keys fall back to
   * `DEFAULT_AVATAR_STATUS_COLORS`.
   */
  statusColors: z
    .record(z.string(), z.string())
    .default(() => ({ ...DEFAULT_AVATAR_STATUS_COLORS })),
  /** Status-dot diameter as a fraction of `sizePx`. */
  statusDotFraction: z.number().min(0.05).max(0.6).default(0.28),
  /** Status-dot ring color (typically the parent surface). */
  statusDotRingColor: z.string().default("#0f1119"),
});

export type AvatarProps = z.infer<typeof avatarPropsSchema>;

/**
 * Widget definition — registered against the host's UI registry by
 * the meta-plugin's onEnable.
 */
export const avatarWidget: Widget<AvatarProps> = defineWidget({
  manifest: {
    id: "com.hyperforge.hyperscape.avatar",
    name: "Avatar",
    category: "panel",
    defaultSize: { width: 6, height: 6 },
  },
  propsSchema: avatarPropsSchema,
  defaultProps: {
    name: "",
    imageUrl: "",
    sizePx: 32,
    shape: "circle",
    status: "none",
    initialsTextColor: "#0f1119",
    initialsPalette: [],
    borderColor: "",
    borderWidthPx: 0,
    statusColors: { ...DEFAULT_AVATAR_STATUS_COLORS },
    statusDotFraction: 0.28,
    statusDotRingColor: "#0f1119",
  },
});

/**
 * React component. Renders an `<img>` when `imageUrl` is set; falls
 * back to a colored disk with up to two initials. Optional ringed
 * status dot in the bottom-right corner.
 */
export function Avatar(props: AvatarProps): React.ReactElement {
  const {
    name,
    imageUrl,
    sizePx,
    shape,
    status,
    initialsTextColor,
    initialsPalette,
    borderColor,
    borderWidthPx,
    statusColors,
    statusDotFraction,
    statusDotRingColor,
  } = props;

  const [imageFailed, setImageFailed] = React.useState(false);

  const palette =
    initialsPalette.length > 0
      ? initialsPalette
      : DEFAULT_AVATAR_INITIAL_COLORS;
  const initials = computeInitials(name);
  const initialsBg =
    palette[pickPaletteIndex(name, palette.length)] ?? "#3a3f4d";

  const radius = shape === "circle" ? "50%" : Math.round(sizePx * 0.18);
  const showImage = imageUrl.length > 0 && !imageFailed;

  const statusKey = status === "none" ? null : status;
  const statusColor = statusKey
    ? (statusColors[statusKey] ?? DEFAULT_AVATAR_STATUS_COLORS[statusKey])
    : null;
  const dotSize = Math.max(4, Math.round(sizePx * statusDotFraction));
  const dotRingWidth = Math.max(1, Math.round(dotSize * 0.18));

  return (
    <div
      role="img"
      aria-label={name || "Avatar"}
      style={{
        position: "relative",
        width: sizePx,
        height: sizePx,
        flexShrink: 0,
      }}
    >
      {showImage ? (
        <img
          src={imageUrl}
          alt={name}
          onError={() => setImageFailed(true)}
          style={{
            width: "100%",
            height: "100%",
            borderRadius: radius,
            objectFit: "cover",
            display: "block",
            border: borderColor
              ? `${borderWidthPx}px solid ${borderColor}`
              : undefined,
          }}
        />
      ) : (
        <div
          style={{
            width: "100%",
            height: "100%",
            borderRadius: radius,
            background: initialsBg,
            color: initialsTextColor,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: Math.max(8, Math.round(sizePx * 0.42)),
            fontWeight: 700,
            letterSpacing: 0.5,
            fontFamily:
              "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif",
            border: borderColor
              ? `${borderWidthPx}px solid ${borderColor}`
              : undefined,
            userSelect: "none",
          }}
        >
          {initials}
        </div>
      )}
      {statusColor && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            bottom: 0,
            right: 0,
            width: dotSize,
            height: dotSize,
            borderRadius: "50%",
            background: statusColor,
            border: `${dotRingWidth}px solid ${statusDotRingColor}`,
            boxSizing: "border-box",
          }}
        />
      )}
    </div>
  );
}

/**
 * Bundled registration — pairs the widget schema with its React
 * renderer.
 */
export const avatarRegistration: WidgetRegistration<
  AvatarProps,
  React.ComponentType<AvatarProps>
> = {
  widget: avatarWidget,
  Component: Avatar,
};
