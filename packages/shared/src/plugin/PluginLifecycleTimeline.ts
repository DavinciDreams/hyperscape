/**
 * Compact recent-event timeline projection for the Plugin Details
 * pane "Lifecycle" subsection. Picks the last N events for a given
 * plugin and labels each one for sparkline-friendly rendering.
 *
 * Pure transform. Never throws.
 */

import type {
  PluginLifecycleEvent,
  PluginLifecycleOutcome,
} from "./PluginLifecycleJournal.js";
import type { LifecyclePhase } from "./PluginLoader.js";

export interface PluginLifecycleTimelineEntry {
  readonly at: number;
  readonly phase: LifecyclePhase;
  readonly outcome: PluginLifecycleOutcome;
  /** Single-character glyph: `"·"` success, `"x"` failure. */
  readonly glyph: "·" | "x";
}

export interface PluginLifecycleTimeline {
  readonly pluginId: string;
  readonly entries: readonly PluginLifecycleTimelineEntry[];
  /** Concatenated glyphs for compact display (e.g. `"··x·x"`). */
  readonly sparkline: string;
  readonly firstAt: number | null;
  readonly lastAt: number | null;
  readonly truncated: boolean;
}

export interface BuildPluginLifecycleTimelineOptions {
  /** Maximum number of trailing events to keep. Default: 20. */
  readonly maxEntries?: number;
}

const DEFAULT_MAX_ENTRIES = 20;

export function buildPluginLifecycleTimeline(
  pluginId: string,
  events: readonly PluginLifecycleEvent[],
  options: BuildPluginLifecycleTimelineOptions = {},
): PluginLifecycleTimeline {
  const max = Math.max(1, options.maxEntries ?? DEFAULT_MAX_ENTRIES);

  // Walk backwards collecting up to `max` matching events, then
  // reverse so the result is oldest-first.
  const collected: PluginLifecycleEvent[] = [];
  let totalForPlugin = 0;
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.pluginId !== pluginId) continue;
    totalForPlugin += 1;
    if (collected.length < max) collected.push(e);
  }
  collected.reverse();

  const entries: PluginLifecycleTimelineEntry[] = collected.map((e) => ({
    at: e.at,
    phase: e.phase,
    outcome: e.outcome,
    glyph: e.outcome === "success" ? "·" : "x",
  }));

  const sparkline = entries.map((entry) => entry.glyph).join("");
  const firstAt = entries.length > 0 ? entries[0].at : null;
  const lastAt = entries.length > 0 ? entries[entries.length - 1].at : null;
  const truncated = totalForPlugin > entries.length;

  return {
    pluginId,
    entries,
    sparkline,
    firstAt,
    lastAt,
    truncated,
  };
}
