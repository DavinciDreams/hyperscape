/**
 * Profiler-overlay manifest schema.
 *
 * Phase J6 of the World Studio AAA plan — authored config for the
 * in-PIE stats overlay. Declares which metrics to render and how
 * to lay them out. Authors pin a default view per-project; players
 * can toggle it with a keybind during development builds.
 */

import { z } from "zod";

/**
 * Metric kind — declarative so the runtime knows how to format.
 * - `fps`: frames-per-second rolling average
 * - `ms`: frame duration in milliseconds
 * - `count`: integer counter (draw calls, entities)
 * - `bytes`: memory size with auto-unit formatting
 * - `percentage`: 0..100 bar
 * - `custom`: free-form string produced by a registered probe
 */
export const ProfilerMetricKindSchema = z.enum([
  "fps",
  "ms",
  "count",
  "bytes",
  "percentage",
  "custom",
]);
export type ProfilerMetricKind = z.infer<typeof ProfilerMetricKindSchema>;

/** Threshold pairs drive the metric's color band. */
export const ProfilerThresholdSchema = z
  .object({
    /** Green below this value (good). */
    good: z.number(),
    /** Yellow at/below this value, red above. */
    warn: z.number(),
  })
  .refine(({ good, warn }) => good <= warn, {
    message: "profiler threshold `good` must be ≤ `warn`",
  });
export type ProfilerThreshold = z.infer<typeof ProfilerThresholdSchema>;

export const ProfilerMetricSchema = z.object({
  /** Registered probe id — resolved against a runtime metric registry. */
  id: z.string().min(1),
  label: z.string().min(1),
  kind: ProfilerMetricKindSchema,
  /** Visual hint — overlay may render as `text`, `bar`, or `sparkline`. */
  display: z.enum(["text", "bar", "sparkline"]).default("text"),
  /** Rolling-average window in frames. 1 = instantaneous. */
  sampleWindow: z.number().int().min(1).max(1024).default(30),
  /** Optional thresholds for color coding; omitted = default palette. */
  thresholds: ProfilerThresholdSchema.optional(),
  /** Visibility — false hides the metric without deleting it. */
  visible: z.boolean().default(true),
});
export type ProfilerMetric = z.infer<typeof ProfilerMetricSchema>;

/**
 * A named group of metrics rendered together (e.g. "Render", "Entity",
 * "Network"). Authors can hide entire groups with one toggle.
 */
export const ProfilerGroupSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  collapsed: z.boolean().default(false),
  metrics: z.array(ProfilerMetricSchema).min(1),
});
export type ProfilerGroup = z.infer<typeof ProfilerGroupSchema>;

export const ProfilerAnchorSchema = z.enum([
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
]);
export type ProfilerAnchor = z.infer<typeof ProfilerAnchorSchema>;

export const ProfilerOverlayManifestSchema = z
  .object({
    /** Show the overlay by default on boot. */
    enabled: z.boolean().default(false),
    anchor: ProfilerAnchorSchema.default("top-left"),
    /** Overall refresh interval, ms. Raise to reduce overhead. */
    refreshMs: z.number().int().min(16).max(5000).default(250),
    /** 0..1 background opacity for the overlay panel. */
    backgroundOpacity: z.number().min(0).max(1).default(0.6),
    /** Font scale multiplier applied to overlay text. */
    fontScale: z.number().min(0.5).max(2).default(1),
    groups: z.array(ProfilerGroupSchema).default([]),
  })
  .refine(
    ({ groups }) => {
      const ids = groups.map((g) => g.id);
      return new Set(ids).size === ids.length;
    },
    { message: "profiler group ids must be unique" },
  )
  .refine(
    ({ groups }) => {
      const metricIds = groups.flatMap((g) => g.metrics.map((m) => m.id));
      return new Set(metricIds).size === metricIds.length;
    },
    { message: "profiler metric ids must be unique across all groups" },
  );
export type ProfilerOverlayManifest = z.infer<
  typeof ProfilerOverlayManifestSchema
>;
