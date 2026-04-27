/**
 * XPOrbWidget — Hyperscape's HUD-side XP gain visualization.
 *
 * Phase D6.c.1 / Session 4 of PLAN_NEXT_SESSIONS. The first widget
 * the `@hyperforge/hyperscape` meta-plugin contributes through the
 * Phase D7 plugin-widget contribution API.
 *
 * The widget is a small floating orb that renders recent XP gains
 * as a pulse + skill-icon glyph + numeric delta. It binds to
 * `state.xpDrops` (a list of recent XP_DROP_RECEIVED events the
 * client SkillsSystem accumulates) so the layout can display 0–N
 * drops simultaneously.
 *
 * Why this is the first widget migrated:
 *   - Self-contained (no other widget depends on it).
 *   - Bindable via the existing `xpDrops` state without any new
 *     data-source plumbing.
 *   - Visually distinct so users can immediately see whether the
 *     plugin-contributed widget is rendering.
 *
 * Author note: this is a "second display" of XP — the world-space
 * 3D sprites still render via `XPDropSystem` in the plugin. The
 * widget gives editors a HUD-side equivalent they can position,
 * theme, and replace per-game without touching engine code.
 */

import {
  defineWidget,
  type Widget,
  type WidgetRegistration,
} from "@hyperforge/ui-framework";
import React, { useEffect, useRef, useState } from "react";
import { z } from "zod";

/** A single XP drop event the widget renders. */
export interface XPDropEntry {
  readonly id: string;
  readonly skill: string;
  readonly amount: number;
  readonly receivedAt: number;
}

/** Props the widget exposes through its Zod schema. */
export const xpOrbPropsSchema = z.object({
  /** How long each entry stays on-screen, in milliseconds. */
  durationMs: z.number().int().min(500).max(10_000).default(2_000),
  /** Maximum simultaneous entries shown. */
  maxEntries: z.number().int().min(1).max(20).default(5),
  /** Base color for the orb glow. */
  color: z.string().default("#ffd84d"),
  /** Live list of recent XP drops, oldest-first. */
  drops: z.array(z.unknown()).default([]),
});

type XPOrbProps = z.infer<typeof xpOrbPropsSchema>;

/**
 * Widget definition. Registered against the host's UI registry by
 * the meta-plugin's `onEnable` via the `ctx.widgets.register(...)`
 * adapter.
 */
export const xpOrbWidget: Widget<XPOrbProps> = defineWidget({
  manifest: {
    id: "com.hyperforge.hyperscape.xp-orb",
    name: "XP Orb",
    category: "hud",
    defaultSize: { width: 4, height: 2 },
  },
  propsSchema: xpOrbPropsSchema,
  defaultProps: {
    durationMs: 2_000,
    maxEntries: 5,
    color: "#ffd84d",
    drops: [],
  },
});

/**
 * React component. Reads `props.drops` (a live list bound by the
 * host) and animates each entry through a fade+rise cycle. Drops
 * older than `durationMs` are filtered out automatically.
 */
export function XPOrb(props: XPOrbProps): React.ReactElement {
  const { durationMs, maxEntries, color, drops } = props;

  // The widget receives a live `drops` array as a prop; we filter
  // by `receivedAt` against `durationMs` and keep the most-recent
  // `maxEntries`. Re-runs every render — cheap because the lists
  // are short.
  const now = useNow(durationMs > 0 ? Math.min(durationMs / 4, 250) : null);
  const visible = (drops as XPDropEntry[])
    .filter((d) => isXPDropEntry(d))
    .filter((d) => now - d.receivedAt < durationMs)
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
      }}
      aria-label="XP gain orb"
    >
      {visible.map((entry, i) => {
        const elapsed = now - entry.receivedAt;
        const progress = Math.min(1, Math.max(0, elapsed / durationMs));
        const opacity = 1 - progress;
        const offsetY = -32 * progress;
        return (
          <div
            key={entry.id}
            style={{
              position: "absolute",
              left: "50%",
              bottom: 8,
              transform: `translate(-50%, ${offsetY}px)`,
              opacity,
              padding: "2px 8px",
              borderRadius: 999,
              background: "rgba(0,0,0,0.55)",
              border: `1px solid ${color}`,
              color,
              fontSize: 12,
              whiteSpace: "nowrap",
              boxShadow: `0 0 ${10 + 6 * (1 - progress)}px ${color}55`,
              zIndex: 10 + i,
            }}
          >
            +{entry.amount} {capitalize(entry.skill)}
          </div>
        );
      })}
    </div>
  );
}

/** Local type guard so we can accept `unknown[]` from the schema. */
function isXPDropEntry(value: unknown): value is XPDropEntry {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.skill === "string" &&
    typeof v.amount === "number" &&
    typeof v.receivedAt === "number"
  );
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * `useNow` ticks the component at a coarse interval so fade-out
 * animation runs without external state. `tickMs = null` disables
 * the tick (used when `durationMs = 0` for instant-disappear).
 */
function useNow(tickMs: number | null): number {
  const [now, setNow] = useState<number>(() => Date.now());
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    if (tickMs === null) return;
    let cancelled = false;
    const loop = () => {
      if (cancelled) return;
      setNow(Date.now());
      rafRef.current = window.setTimeout(loop, tickMs) as unknown as number;
    };
    loop();
    return () => {
      cancelled = true;
      if (rafRef.current !== null) {
        clearTimeout(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [tickMs]);
  return now;
}

/**
 * Bundled registration — pairs the widget schema with its React
 * renderer. The plugin's `onEnable` passes this to
 * `ctx.widgets.register(...)`.
 */
export const xpOrbRegistration: WidgetRegistration<
  XPOrbProps,
  React.ComponentType<XPOrbProps>
> = {
  widget: xpOrbWidget,
  Component: XPOrb,
};
