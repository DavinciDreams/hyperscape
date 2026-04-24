/**
 * Screenshot manifest schema.
 *
 * Authored policy for player-initiated screenshot + photo-mode
 * capture. Covers key bindings, output format, watermarking,
 * photo-mode camera controls, and share targets.
 *
 * Scope-isolated from:
 *   - `input-actions.ts` (generic bindings — screenshot key lives
 *     there too, this schema owns capture *policy*)
 *   - `render-profile.ts` (authored look — photo-mode may apply a
 *     dedicated profile by id)
 *   - `post-process-volumes.ts` (world-placed overrides — photo
 *     mode is player-space, not region-space)
 */

import { z } from "zod";

/** Shape-only reference to another manifest id (loader resolves). */
const ManifestRef = z
  .string()
  .regex(
    /^[a-z][a-zA-Z0-9_-]*$/,
    "manifest reference must be lowerCamelCase ASCII identifier",
  );

/** Output format enum. */
export const ScreenshotFormatSchema = z.enum(["png", "jpeg", "webp"]);
export type ScreenshotFormat = z.infer<typeof ScreenshotFormatSchema>;

/** Aspect preset for photo-mode framing. */
export const AspectPresetSchema = z.enum([
  "auto",
  "16x9",
  "9x16",
  "4x3",
  "1x1",
  "21x9",
]);
export type AspectPreset = z.infer<typeof AspectPresetSchema>;

/** Watermark placement. */
export const WatermarkPositionSchema = z.enum([
  "none",
  "topLeft",
  "topRight",
  "bottomLeft",
  "bottomRight",
  "center",
]);
export type WatermarkPosition = z.infer<typeof WatermarkPositionSchema>;

/** Capture rules — resolution + format + quality. */
export const CaptureRulesSchema = z
  .object({
    /** Capture width in pixels; 0 = match viewport. */
    captureWidthPx: z.number().int().min(0).max(16384).default(0),
    /** Capture height in pixels; 0 = match viewport. */
    captureHeightPx: z.number().int().min(0).max(16384).default(0),
    format: ScreenshotFormatSchema.default("png"),
    /** 0..100 quality for jpeg/webp (ignored for png). */
    qualityPercent: z.number().int().min(0).max(100).default(90),
    /** Hide UI/HUD at capture time. */
    hideHud: z.boolean().default(true),
    /** Upscale factor for super-resolution captures. */
    superResolutionMultiplier: z.number().int().min(1).max(8).default(1),
  })
  .strict();
export type CaptureRules = z.infer<typeof CaptureRulesSchema>;

/** Photo mode rules — freeze-and-frame camera. */
export const PhotoModeRulesSchema = z
  .object({
    enabled: z.boolean().default(true),
    /** Allow pausing time while in photo mode. */
    allowTimeFreeze: z.boolean().default(true),
    /** Allow free-fly camera untethered from player. */
    allowFreeCamera: z.boolean().default(true),
    /** Max distance from player for free camera (0 = unlimited). */
    maxCameraDistanceMeters: z.number().min(0).max(1000).default(10),
    /** Optional override render-profile id active while in photo mode. */
    renderProfileRef: ManifestRef.optional(),
    /** Allow DoF focus picker. */
    allowDepthOfFieldPicker: z.boolean().default(true),
    /** Allow frame aspect presets. */
    allowAspectPresets: z.boolean().default(true),
    defaultAspect: AspectPresetSchema.default("auto"),
  })
  .strict();
export type PhotoModeRules = z.infer<typeof PhotoModeRulesSchema>;

/** Watermark rules. */
export const WatermarkRulesSchema = z
  .object({
    enabled: z.boolean().default(false),
    position: WatermarkPositionSchema.default("none"),
    /** Optional watermark image asset. */
    watermarkAssetRef: ManifestRef.optional(),
    /** Localization key for watermark text (empty = no text). */
    textLocalizationKey: z.string().default(""),
    /** 0..1 opacity. */
    opacity: z.number().min(0).max(1).default(0.8),
  })
  .strict()
  .refine((r) => !r.enabled || r.position !== "none", {
    message: "enabled watermark requires position ≠ 'none'",
    path: ["position"],
  });
export type WatermarkRules = z.infer<typeof WatermarkRulesSchema>;

/** Share target kinds. */
export const ShareTargetKindSchema = z.enum([
  "saveToDisk",
  "clipboard",
  "uploadToGallery",
  "external",
]);
export type ShareTargetKind = z.infer<typeof ShareTargetKindSchema>;

/** Share target entry. */
export const ShareTargetSchema = z
  .object({
    id: z
      .string()
      .regex(
        /^[a-z][a-zA-Z0-9_-]*$/,
        "share target id must be lowerCamelCase ASCII identifier",
      ),
    kind: ShareTargetKindSchema,
    labelLocalizationKey: z.string().default(""),
    /** For upload/external: deploy-target endpoint name (no real URL here). */
    endpointNameRef: z.string().default(""),
    enabled: z.boolean().default(true),
  })
  .strict()
  .refine(
    (t) =>
      t.kind === "saveToDisk" ||
      t.kind === "clipboard" ||
      t.endpointNameRef.length > 0,
    {
      message: "uploadToGallery/external share targets require endpointNameRef",
      path: ["endpointNameRef"],
    },
  );
export type ShareTarget = z.infer<typeof ShareTargetSchema>;

/** Top-level manifest. */
export const ScreenshotManifestSchema = z
  .object({
    enabled: z.boolean().default(true),
    capture: CaptureRulesSchema.default(() => CaptureRulesSchema.parse({})),
    photoMode: PhotoModeRulesSchema.default(() =>
      PhotoModeRulesSchema.parse({}),
    ),
    watermark: WatermarkRulesSchema.default(() =>
      WatermarkRulesSchema.parse({}),
    ),
    shareTargets: z.array(ShareTargetSchema).default([]),
    /** Max captures per minute (0 = unlimited). */
    maxCapturesPerMinute: z.number().int().min(0).max(600).default(30),
  })
  .strict()
  .refine(
    (m) =>
      new Set(m.shareTargets.map((t) => t.id)).size === m.shareTargets.length,
    {
      message: "share target ids must be unique",
      path: ["shareTargets"],
    },
  )
  .refine((m) => !m.enabled || m.shareTargets.some((t) => t.enabled), {
    message: "enabled manifest requires at least one enabled share target",
    path: ["shareTargets"],
  });
export type ScreenshotManifest = z.infer<typeof ScreenshotManifestSchema>;
