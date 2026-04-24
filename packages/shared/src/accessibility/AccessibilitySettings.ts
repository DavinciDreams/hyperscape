/**
 * Accessibility settings resolver.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s
 * `accessibility.ts`. Pure logic: exposes authored defaults + a
 * `resolveForPlayer(overrides)` that layers player-stored preferences
 * atop the manifest. Also surfaces convenience predicates like
 * `shouldReduceMotion`, `inputDebounceMsFor`, etc.
 *
 * Scope: pure reducer. No React store, no DOM, no renderer. Callers
 * decide how to apply the resolved settings.
 */

import {
  type AccessibilityManifest,
  AccessibilityManifestSchema,
  type ColorBlindMode,
  type InputAssist,
  type MotionLevel,
  type SubtitleDefaults,
} from "@hyperforge/manifest-schema";

/**
 * Player-level overrides for the manifest defaults. Every field is
 * optional — missing fields fall back to the manifest.
 */
export interface AccessibilityOverrides {
  fontScale?: number;
  motion?: MotionLevel;
  colorBlindMode?: ColorBlindMode;
  highContrast?: boolean;
  dyslexiaFriendlyFont?: boolean;
  subtitles?: Partial<SubtitleDefaults>;
  inputAssist?: Partial<InputAssist>;
  cameraEffectIntensity?: number;
  screenReaderAnnouncements?: boolean;
}

export interface ResolvedAccessibility {
  fontScale: number;
  motion: MotionLevel;
  colorBlindMode: ColorBlindMode;
  highContrast: boolean;
  dyslexiaFriendlyFont: boolean;
  subtitles: SubtitleDefaults;
  inputAssist: InputAssist;
  cameraEffectIntensity: number;
  screenReaderAnnouncements: boolean;
}

export class AccessibilitySettings {
  private _manifest: AccessibilityManifest;
  private _loaded = false;

  constructor(manifest?: AccessibilityManifest) {
    this._manifest = manifest ?? AccessibilityManifestSchema.parse({});
    if (manifest) this._loaded = true;
  }

  load(manifest: AccessibilityManifest): void {
    this._manifest = manifest;
    this._loaded = true;
  }

  loadFromJson(raw: unknown): void {
    this._manifest = AccessibilityManifestSchema.parse(raw);
    this._loaded = true;
  }

  isLoaded(): boolean {
    return this._loaded;
  }

  get manifest(): AccessibilityManifest {
    return this._manifest;
  }

  /**
   * Merge manifest defaults with the supplied overrides. Nested blocks
   * (`subtitles`, `inputAssist`) are merged field-by-field.
   */
  resolveForPlayer(
    overrides: AccessibilityOverrides = {},
  ): ResolvedAccessibility {
    const m = this._manifest;
    return {
      fontScale: overrides.fontScale ?? m.fontScale,
      motion: overrides.motion ?? m.motion,
      colorBlindMode: overrides.colorBlindMode ?? m.colorBlindMode,
      highContrast: overrides.highContrast ?? m.highContrast,
      dyslexiaFriendlyFont:
        overrides.dyslexiaFriendlyFont ?? m.dyslexiaFriendlyFont,
      subtitles: { ...m.subtitles, ...(overrides.subtitles ?? {}) },
      inputAssist: { ...m.inputAssist, ...(overrides.inputAssist ?? {}) },
      cameraEffectIntensity:
        overrides.cameraEffectIntensity ?? m.cameraEffectIntensity,
      screenReaderAnnouncements:
        overrides.screenReaderAnnouncements ?? m.screenReaderAnnouncements,
    };
  }

  /** Should the runtime suppress camera shake / flashes / big motion? */
  shouldReduceMotion(overrides: AccessibilityOverrides = {}): boolean {
    const r = this.resolveForPlayer(overrides);
    return r.motion !== "full";
  }

  /** Final multiplier applied to camera shake / flash amplitude. */
  effectiveCameraEffectIntensity(
    overrides: AccessibilityOverrides = {},
  ): number {
    const r = this.resolveForPlayer(overrides);
    if (r.motion === "minimal") return 0;
    const raw = r.cameraEffectIntensity;
    return r.motion === "reduced" ? raw * 0.5 : raw;
  }

  /** Minimum ms between repeated button presses. 0 disables debounce. */
  inputDebounceMsFor(overrides: AccessibilityOverrides = {}): number {
    return this.resolveForPlayer(overrides).inputAssist.inputDebounceMs;
  }
}
