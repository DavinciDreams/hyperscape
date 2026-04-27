/**
 * LevelUpToastWidget — Hyperscape's HUD-side level-up celebration.
 *
 * Phase D6.c.A second widget contributed by the
 * `@hyperforge/hyperscape` meta-plugin. Renders a temporary banner
 * when a player levels up a skill — replaces the role of the
 * hardcoded modal previously triggered by the `level-up` event.
 *
 * Same contribution pattern as `XPOrbWidget` (Session 4): the
 * plugin's `onEnable` calls `ctx.widgets?.register(...)` early in
 * the lifecycle. Hosts that don't supply `widgets` (the dedicated
 * server, certain unit tests) silently skip registration.
 */

import {
  defineWidget,
  type Widget,
  type WidgetRegistration,
} from "@hyperforge/ui-framework";
import React, { useEffect, useState } from "react";
import { z } from "zod";

/** A single level-up event the widget renders. */
export interface LevelUpEntry {
  readonly id: string;
  readonly skill: string;
  readonly newLevel: number;
  readonly receivedAt: number;
}

export const levelUpToastPropsSchema = z.object({
  /** How long each toast stays on-screen, in milliseconds. */
  durationMs: z.number().int().min(1_000).max(15_000).default(4_000),
  /** Maximum simultaneous toasts shown. */
  maxEntries: z.number().int().min(1).max(5).default(3),
  /** Banner accent color. */
  color: z.string().default("#ffe066"),
  /** Live list of recent level-up events, oldest-first. */
  events: z.array(z.unknown()).default([]),
});

type LevelUpToastProps = z.infer<typeof levelUpToastPropsSchema>;

export const levelUpToastWidget: Widget<LevelUpToastProps> = defineWidget({
  manifest: {
    id: "com.hyperforge.hyperscape.level-up-toast",
    name: "Level Up Toast",
    category: "hud",
    defaultSize: { width: 6, height: 2 },
  },
  propsSchema: levelUpToastPropsSchema,
  defaultProps: {
    durationMs: 4_000,
    maxEntries: 3,
    color: "#ffe066",
    events: [],
  },
});

export function LevelUpToast(props: LevelUpToastProps): React.ReactElement {
  const { durationMs, maxEntries, color, events } = props;

  // Coarse 200ms tick keeps the fade-out animation smooth without
  // requestAnimationFrame.
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, []);

  const visible = (events as LevelUpEntry[])
    .filter(isLevelUpEntry)
    .filter((e) => now - e.receivedAt < durationMs)
    .slice(-maxEntries);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        paddingTop: 8,
      }}
      aria-label="Level up notifications"
    >
      {visible.map((entry, i) => {
        const elapsed = now - entry.receivedAt;
        const progress = Math.min(1, Math.max(0, elapsed / durationMs));
        // Fade in over first 10%, hold to 80%, fade out after.
        const fadeIn = Math.min(1, progress / 0.1);
        const fadeOut = 1 - Math.max(0, (progress - 0.8) / 0.2);
        const opacity = Math.min(fadeIn, fadeOut);
        const slide = (1 - fadeIn) * 12;
        return (
          <div
            key={entry.id}
            style={{
              opacity,
              transform: `translateY(${-slide}px)`,
              padding: "6px 14px",
              borderRadius: 8,
              background: "rgba(0,0,0,0.72)",
              border: `1px solid ${color}`,
              color,
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: 0.3,
              whiteSpace: "nowrap",
              boxShadow: `0 4px 16px ${color}33, 0 0 24px ${color}44`,
              zIndex: 10 + i,
            }}
          >
            <span style={{ fontSize: 11, opacity: 0.85, marginRight: 8 }}>
              LEVEL UP
            </span>
            <span>
              {capitalize(entry.skill)} → {entry.newLevel}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function isLevelUpEntry(value: unknown): value is LevelUpEntry {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.skill === "string" &&
    typeof v.newLevel === "number" &&
    typeof v.receivedAt === "number"
  );
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const levelUpToastRegistration: WidgetRegistration<
  LevelUpToastProps,
  React.ComponentType<LevelUpToastProps>
> = {
  widget: levelUpToastWidget,
  Component: LevelUpToast,
};
