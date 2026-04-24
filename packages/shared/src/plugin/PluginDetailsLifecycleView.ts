/**
 * Bundled "Lifecycle" subsection projection for the Plugin Details
 * pane. Combines the per-plugin stats, stability badge, recent-events
 * timeline, and rolling failure window into a single object so the
 * editor can render the entire pane from one call.
 *
 * Pure transform. Never throws.
 */

import {
  type BuildPluginFailureWindowOptions,
  type PluginFailureWindow,
  buildPluginFailureWindow,
} from "./PluginFailureWindow.js";
import type { PluginLifecycleEvent } from "./PluginLifecycleJournal.js";
import {
  type PluginLifecycleStats,
  buildPluginLifecycleStats,
} from "./PluginLifecycleStats.js";
import {
  type BuildPluginLifecycleTimelineOptions,
  type PluginLifecycleTimeline,
  buildPluginLifecycleTimeline,
} from "./PluginLifecycleTimeline.js";
import {
  type ClassifyPluginStabilityOptions,
  type PluginStabilityBadge,
  classifyPluginStability,
} from "./PluginStabilityClassifier.js";

export interface PluginDetailsLifecycleView {
  readonly pluginId: string;
  readonly stats: PluginLifecycleStats;
  readonly stability: PluginStabilityBadge;
  readonly timeline: PluginLifecycleTimeline;
  readonly failureWindow: PluginFailureWindow;
}

export interface BuildPluginDetailsLifecycleViewOptions {
  readonly stability?: ClassifyPluginStabilityOptions;
  readonly timeline?: BuildPluginLifecycleTimelineOptions;
  readonly failureWindow?: BuildPluginFailureWindowOptions;
}

export function buildPluginDetailsLifecycleView(
  pluginId: string,
  events: readonly PluginLifecycleEvent[],
  options: BuildPluginDetailsLifecycleViewOptions = {},
): PluginDetailsLifecycleView {
  const stats = buildPluginLifecycleStats(pluginId, events);
  const stability = classifyPluginStability(stats, options.stability);
  const timeline = buildPluginLifecycleTimeline(
    pluginId,
    events,
    options.timeline,
  );
  const failureWindow = buildPluginFailureWindow(
    pluginId,
    events,
    options.failureWindow,
  );
  return { pluginId, stats, stability, timeline, failureWindow };
}
