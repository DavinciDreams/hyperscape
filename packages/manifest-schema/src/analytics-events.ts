/**
 * Analytics event manifest schema.
 *
 * Phase G5 of the World Studio AAA plan — authors declare the event
 * surface they want to track (session_start, quest_completed,
 * item_purchased, etc.) including per-property types, cardinality
 * hints, and whether the event is PII-safe. The runtime analytics
 * bridge (separate follow-up) validates emitted events against this
 * manifest before forwarding to the configured sink(s).
 *
 * Why declarative? Analytics contracts drift silently when emit sites
 * bit-rot; a central manifest lets product, data, and engineering
 * agree on the shape before a single event fires. It also unlocks
 * auto-generated TypeScript emitters (`emit<"quest_completed">(...)`)
 * and editor validation for property typos at authoring time.
 */

import { z } from "zod";

/**
 * Property value shapes the analytics bridge knows how to encode.
 * `enum` is special-cased so authors can pin a bounded string set
 * (e.g. `platform: "web" | "ios" | "android"`); the interpreter
 * enforces membership at emit time.
 */
export const AnalyticsPropKindSchema = z.enum([
  "string",
  "number",
  "integer",
  "boolean",
  "timestamp",
  "enum",
]);
export type AnalyticsPropKind = z.infer<typeof AnalyticsPropKindSchema>;

export const AnalyticsPropSchema = z
  .object({
    name: z
      .string()
      .regex(
        /^[a-z][a-z0-9_]*$/,
        "Analytics property names must be snake_case ASCII identifiers",
      ),
    kind: AnalyticsPropKindSchema,
    description: z.string().default(""),
    /** Required properties must be present on every emit. */
    required: z.boolean().default(true),
    /**
     * Cardinality hint for the sink — `"low"` means bounded (≤ ~50 unique
     * values, safe to index), `"high"` means unbounded (IDs, free-form
     * text), `"unknown"` when not yet characterized. Drives storage
     * decisions downstream.
     */
    cardinality: z
      .enum(["low", "medium", "high", "unknown"])
      .default("unknown"),
    /** For `kind === "enum"`: the allowed string values. */
    enumValues: z.array(z.string().min(1)).optional(),
    /** Whether this property can contain user-identifying data. */
    piiSafe: z.boolean().default(true),
  })
  .refine(
    (p) =>
      p.kind !== "enum" ||
      (p.enumValues !== undefined && p.enumValues.length > 0),
    { message: "enum properties must list at least one `enumValues` entry" },
  )
  .refine((p) => p.kind === "enum" || p.enumValues === undefined, {
    message: "`enumValues` only applies to `kind === 'enum'` properties",
  });
export type AnalyticsProp = z.infer<typeof AnalyticsPropSchema>;

/**
 * A single event type. `name` is the wire key (snake_case), `category`
 * is a free-form grouping for the dashboard UI (e.g. `"session"`,
 * `"combat"`, `"commerce"`).
 */
export const AnalyticsEventSchema = z
  .object({
    name: z
      .string()
      .regex(
        /^[a-z][a-z0-9_]*$/,
        "Event names must be snake_case ASCII identifiers",
      ),
    category: z.string().min(1),
    description: z.string().default(""),
    /** Whether the event contains any PII. Short-circuits per-prop checks. */
    piiSafe: z.boolean().default(true),
    /** Optional sampling rate in [0, 1]; 1 = always emit. */
    samplingRate: z.number().min(0).max(1).default(1),
    props: z.array(AnalyticsPropSchema).default([]),
  })
  .refine(
    ({ props }) => new Set(props.map((p) => p.name)).size === props.length,
    { message: "prop names must be unique within an event" },
  );
export type AnalyticsEvent = z.infer<typeof AnalyticsEventSchema>;

export const AnalyticsEventManifestSchema = z
  .array(AnalyticsEventSchema)
  .refine((list) => new Set(list.map((e) => e.name)).size === list.length, {
    message: "analytics event names must be unique",
  });
export type AnalyticsEventManifest = z.infer<
  typeof AnalyticsEventManifestSchema
>;
