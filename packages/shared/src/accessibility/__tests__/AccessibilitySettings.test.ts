import { AccessibilityManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import { AccessibilitySettings } from "../AccessibilitySettings.js";

function manifest(overrides: Record<string, unknown> = {}) {
  return AccessibilityManifestSchema.parse({ ...overrides });
}

describe("AccessibilitySettings — defaults", () => {
  it("returns manifest defaults when no overrides", () => {
    const s = new AccessibilitySettings(manifest());
    const r = s.resolveForPlayer();
    expect(r.fontScale).toBe(1);
    expect(r.motion).toBe("full");
    expect(r.colorBlindMode).toBe("none");
    expect(r.subtitles.enabled).toBe(false);
    expect(r.inputAssist.inputDebounceMs).toBe(0);
  });

  it("empty manifest parses with full defaults", () => {
    const s = new AccessibilitySettings();
    const r = s.resolveForPlayer();
    expect(r.fontScale).toBe(1);
  });

  it("loadFromJson validates", () => {
    const s = new AccessibilitySettings();
    s.loadFromJson({ fontScale: 1.5, motion: "reduced" });
    const r = s.resolveForPlayer();
    expect(r.fontScale).toBe(1.5);
    expect(r.motion).toBe("reduced");
  });
});

describe("AccessibilitySettings — player overrides", () => {
  it("scalar overrides replace manifest values", () => {
    const s = new AccessibilitySettings(manifest({ fontScale: 1 }));
    const r = s.resolveForPlayer({ fontScale: 1.8, highContrast: true });
    expect(r.fontScale).toBe(1.8);
    expect(r.highContrast).toBe(true);
  });

  it("nested blocks merge field-by-field", () => {
    const s = new AccessibilitySettings(
      manifest({ subtitles: { enabled: true, scale: 1.0 } }),
    );
    const r = s.resolveForPlayer({ subtitles: { scale: 1.5 } });
    // `enabled` preserved from manifest, `scale` overridden
    expect(r.subtitles.enabled).toBe(true);
    expect(r.subtitles.scale).toBe(1.5);
    // other defaults preserved
    expect(r.subtitles.showSpeaker).toBe(true);
  });

  it("inputAssist merge — partial override", () => {
    const s = new AccessibilitySettings(manifest());
    const r = s.resolveForPlayer({
      inputAssist: { targetAssist: true, inputDebounceMs: 120 },
    });
    expect(r.inputAssist.targetAssist).toBe(true);
    expect(r.inputAssist.autoHold).toBe(false);
    expect(r.inputAssist.inputDebounceMs).toBe(120);
  });
});

describe("AccessibilitySettings — predicates", () => {
  it("shouldReduceMotion toggles with motion level", () => {
    const s = new AccessibilitySettings(manifest());
    expect(s.shouldReduceMotion()).toBe(false);
    expect(s.shouldReduceMotion({ motion: "reduced" })).toBe(true);
    expect(s.shouldReduceMotion({ motion: "minimal" })).toBe(true);
  });

  it("effectiveCameraEffectIntensity scales per motion", () => {
    const s = new AccessibilitySettings(
      manifest({ cameraEffectIntensity: 0.8 }),
    );
    expect(s.effectiveCameraEffectIntensity()).toBeCloseTo(0.8);
    expect(s.effectiveCameraEffectIntensity({ motion: "reduced" })).toBeCloseTo(
      0.4,
    );
    expect(s.effectiveCameraEffectIntensity({ motion: "minimal" })).toBe(0);
  });

  it("inputDebounceMsFor reflects overrides", () => {
    const s = new AccessibilitySettings(manifest());
    expect(s.inputDebounceMsFor()).toBe(0);
    expect(s.inputDebounceMsFor({ inputAssist: { inputDebounceMs: 50 } })).toBe(
      50,
    );
  });
});
