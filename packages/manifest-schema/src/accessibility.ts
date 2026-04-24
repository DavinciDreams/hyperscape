/**
 * Accessibility manifest schema.
 *
 * Phase G4 of the World Studio AAA plan — centralized accessibility
 * settings: font scaling, color-blind palettes, subtitle defaults,
 * reduced motion, input-assist toggles. Persisted per-player via the
 * usual settings store; defaults come from this manifest so authors
 * can tune the out-of-box experience per game mode without a rebuild.
 *
 * A single JSON blob (not an array) because accessibility is a
 * coherent settings surface — parts don't make sense in isolation.
 */

import { z } from "zod";

/**
 * Curated color-blind-friendly palette overrides. Authors can add
 * more entries, but these four cover the common WCAG-cited conditions.
 */
export const ColorBlindModeSchema = z.enum([
  "none",
  "protanopia",
  "deuteranopia",
  "tritanopia",
  "achromatopsia",
]);
export type ColorBlindMode = z.infer<typeof ColorBlindModeSchema>;

export const FontScaleSchema = z
  .number()
  .min(0.75)
  .max(2.0)
  .describe("UI font scale multiplier, 1.0 = default");

export const MotionLevelSchema = z.enum(["full", "reduced", "minimal"]);
export type MotionLevel = z.infer<typeof MotionLevelSchema>;

export const SubtitleDefaultsSchema = z.object({
  enabled: z.boolean().default(false),
  /** Subtitle text size multiplier, 0.75 = small, 2.0 = huge. */
  scale: z.number().min(0.75).max(2.0).default(1.0),
  /** Background opacity 0..1 — 0 = transparent, 1 = solid. */
  backgroundOpacity: z.number().min(0).max(1).default(0.5),
  /** Show the speaker name before the line. */
  showSpeaker: z.boolean().default(true),
  /** Render non-speech sound cues like `[glass shatters]`. */
  showSoundCues: z.boolean().default(false),
});
export type SubtitleDefaults = z.infer<typeof SubtitleDefaultsSchema>;

export const InputAssistSchema = z.object({
  /** Sticky aim / target-lock help for motor-impaired players. */
  targetAssist: z.boolean().default(false),
  /** Hold-to-X becomes tap-to-X. */
  autoHold: z.boolean().default(false),
  /** Rapid-fire click becomes hold. */
  autoTap: z.boolean().default(false),
  /**
   * Minimum ms between repeated inputs — debounces accidental double
   * taps. 0 disables the debounce entirely.
   */
  inputDebounceMs: z.number().int().min(0).max(500).default(0),
});
export type InputAssist = z.infer<typeof InputAssistSchema>;

export const AccessibilityManifestSchema = z.object({
  fontScale: FontScaleSchema.default(1.0),
  motion: MotionLevelSchema.default("full"),
  colorBlindMode: ColorBlindModeSchema.default("none"),
  /** Boost UI contrast — desaturates backgrounds, darkens ink. */
  highContrast: z.boolean().default(false),
  /** Use dyslexia-friendly serif font stack. */
  dyslexiaFriendlyFont: z.boolean().default(false),
  subtitles: SubtitleDefaultsSchema.default({
    enabled: false,
    scale: 1.0,
    backgroundOpacity: 0.5,
    showSpeaker: true,
    showSoundCues: false,
  }),
  inputAssist: InputAssistSchema.default({
    targetAssist: false,
    autoHold: false,
    autoTap: false,
    inputDebounceMs: 0,
  }),
  /**
   * Master multiplier on all camera shake / flash effects — 0
   * disables them entirely, 1 is default. Independent of
   * `motion` so players can keep full motion but mute flashes.
   */
  cameraEffectIntensity: z.number().min(0).max(1).default(1),
  /** Screen-reader announcements for HUD updates. */
  screenReaderAnnouncements: z.boolean().default(false),
});
export type AccessibilityManifest = z.infer<typeof AccessibilityManifestSchema>;
