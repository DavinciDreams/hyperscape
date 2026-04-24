/**
 * Loading-screens manifest schema.
 *
 * Authored registry of loading screen slates shown during
 * world load, level streaming, zone transitions, and reconnect.
 * Each slate defines background art, tip text, progress bar style,
 * and zone/context filters.
 *
 * Scope-isolated from:
 *   - `level-streaming.ts` (authored sublevel graph — loading
 *     screens display *during* streaming loads)
 *   - `localization.ts` (tips/titles reference keys by id)
 *   - `music.ts` (background music during load can be referenced
 *     via musicStateRef, but music content lives there)
 */

import { z } from "zod";

/** Shape-only reference to another manifest id (loader resolves). */
const ManifestRef = z
  .string()
  .regex(
    /^[a-z][a-zA-Z0-9_-]*$/,
    "manifest reference must be lowerCamelCase ASCII identifier",
  );

/** Loading-screen trigger context. */
export const LoadingTriggerSchema = z.enum([
  "initialLoad",
  "zoneTransition",
  "levelStream",
  "reconnect",
  "instanceEnter",
  "cinematicCover",
]);
export type LoadingTrigger = z.infer<typeof LoadingTriggerSchema>;

/** Progress bar style. */
export const ProgressBarStyleSchema = z.enum([
  "none",
  "determinate",
  "indeterminate",
  "spinner",
]);
export type ProgressBarStyle = z.infer<typeof ProgressBarStyleSchema>;

/** Background motion style. */
export const BackgroundMotionSchema = z.enum([
  "static",
  "kenBurns",
  "video",
  "parallax",
]);
export type BackgroundMotion = z.infer<typeof BackgroundMotionSchema>;

/** One loading slate. */
export const LoadingSlateSchema = z
  .object({
    id: z
      .string()
      .regex(
        /^[a-z][a-zA-Z0-9_-]*$/,
        "slate id must be lowerCamelCase ASCII identifier",
      ),
    /** Background art asset (image or video). */
    backgroundAssetRef: ManifestRef,
    backgroundMotion: BackgroundMotionSchema.default("static"),
    /** Localization key for headline/title (empty = no title). */
    titleLocalizationKey: z.string().default(""),
    /** Localization key for flavor/tagline (empty = none). */
    subtitleLocalizationKey: z.string().default(""),
    /** Localization keys for tip rotation (cycles during load). */
    tipLocalizationKeys: z.array(z.string().min(1)).default([]),
    /** Tip rotation interval in seconds (0 = no rotation). */
    tipRotationIntervalSec: z.number().min(0).max(60).default(5),
    progressBarStyle: ProgressBarStyleSchema.default("indeterminate"),
    /** Min display time in ms (prevents flash on fast loads). */
    minDisplayMs: z.number().int().min(0).max(10000).default(500),
    /** Max display time in ms (0 = unbounded). */
    maxDisplayMs: z.number().int().min(0).max(60000).default(0),
    /** Optional music state to drive while slate is visible. */
    musicStateRef: ManifestRef.optional(),
    /** Optional zone ids where this slate applies (empty = any). */
    zoneIds: z.array(z.string().min(1)).default([]),
    /** Trigger contexts this slate applies to (empty = any). */
    triggers: z.array(LoadingTriggerSchema).default([]),
    /** Weight for random selection within a filtered pool. */
    selectionWeight: z.number().min(0).max(1000).default(1),
    /** Tag for grouping in authoring tool. */
    categoryTag: z.string().default(""),
  })
  .strict()
  .refine(
    (s) => new Set(s.tipLocalizationKeys).size === s.tipLocalizationKeys.length,
    {
      message: "tipLocalizationKeys must be unique",
      path: ["tipLocalizationKeys"],
    },
  )
  .refine((s) => s.maxDisplayMs === 0 || s.maxDisplayMs >= s.minDisplayMs, {
    message: "maxDisplayMs must be 0 or ≥ minDisplayMs",
    path: ["maxDisplayMs"],
  })
  .refine((s) => new Set(s.triggers).size === s.triggers.length, {
    message: "triggers must be unique",
    path: ["triggers"],
  });
export type LoadingSlate = z.infer<typeof LoadingSlateSchema>;

/** Global fade rules. */
export const FadeRulesSchema = z
  .object({
    fadeInMs: z.number().int().min(0).max(5000).default(200),
    fadeOutMs: z.number().int().min(0).max(5000).default(300),
    fadeColorHex: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, "fadeColorHex must be #RRGGBB")
      .default("#000000"),
  })
  .strict();
export type FadeRules = z.infer<typeof FadeRulesSchema>;

/** Loading-screens manifest — top-level. */
export const LoadingScreensManifestSchema = z
  .object({
    enabled: z.boolean().default(true),
    slates: z.array(LoadingSlateSchema).default([]),
    /** Default slate id when no zone/trigger match. */
    defaultSlateId: z.string().default(""),
    fades: FadeRulesSchema.default(() => FadeRulesSchema.parse({})),
    /** Show tip text during loading. */
    showTips: z.boolean().default(true),
    /** Show progress bar. */
    showProgressBar: z.boolean().default(true),
  })
  .strict()
  .refine((m) => new Set(m.slates.map((s) => s.id)).size === m.slates.length, {
    message: "slate ids must be unique",
    path: ["slates"],
  })
  .refine(
    (m) =>
      m.defaultSlateId === "" ||
      m.slates.some((s) => s.id === m.defaultSlateId),
    {
      message: "defaultSlateId must reference a defined slate or be empty",
      path: ["defaultSlateId"],
    },
  )
  .refine((m) => !m.enabled || m.slates.length > 0, {
    message: "enabled manifest requires at least one slate",
    path: ["slates"],
  });
export type LoadingScreensManifest = z.infer<
  typeof LoadingScreensManifestSchema
>;
