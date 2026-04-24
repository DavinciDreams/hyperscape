/**
 * Faithfulness + defensiveness tests for `AccessibilityManifestSchema`.
 */

import { describe, expect, it } from "vitest";

import {
  AccessibilityManifestSchema,
  type AccessibilityManifest,
} from "./accessibility.js";

const reference: AccessibilityManifest = {
  fontScale: 1.25,
  motion: "reduced",
  colorBlindMode: "deuteranopia",
  highContrast: true,
  dyslexiaFriendlyFont: true,
  subtitles: {
    enabled: true,
    scale: 1.5,
    backgroundOpacity: 0.8,
    showSpeaker: true,
    showSoundCues: true,
  },
  inputAssist: {
    targetAssist: true,
    autoHold: true,
    autoTap: false,
    inputDebounceMs: 50,
  },
  cameraEffectIntensity: 0.25,
  screenReaderAnnouncements: true,
};

describe("AccessibilityManifestSchema", () => {
  it("parses the reference manifest cleanly", () => {
    const result = AccessibilityManifestSchema.safeParse(reference);
    if (!result.success) {
      throw new Error(
        `Reference manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("applies full defaults when given an empty object", () => {
    const parsed = AccessibilityManifestSchema.parse({});
    expect(parsed.fontScale).toBe(1.0);
    expect(parsed.motion).toBe("full");
    expect(parsed.colorBlindMode).toBe("none");
    expect(parsed.highContrast).toBe(false);
    expect(parsed.dyslexiaFriendlyFont).toBe(false);
    expect(parsed.cameraEffectIntensity).toBe(1);
    expect(parsed.screenReaderAnnouncements).toBe(false);
    // subtitles sub-defaults
    expect(parsed.subtitles.enabled).toBe(false);
    expect(parsed.subtitles.scale).toBe(1.0);
    expect(parsed.subtitles.backgroundOpacity).toBe(0.5);
    expect(parsed.subtitles.showSpeaker).toBe(true);
    expect(parsed.subtitles.showSoundCues).toBe(false);
    // inputAssist sub-defaults
    expect(parsed.inputAssist.targetAssist).toBe(false);
    expect(parsed.inputAssist.autoHold).toBe(false);
    expect(parsed.inputAssist.autoTap).toBe(false);
    expect(parsed.inputAssist.inputDebounceMs).toBe(0);
  });

  it("rejects fontScale below 0.75", () => {
    const bad = { ...reference, fontScale: 0.5 };
    expect(AccessibilityManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects fontScale above 2.0", () => {
    const bad = { ...reference, fontScale: 2.5 };
    expect(AccessibilityManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown motion level", () => {
    const bad = { ...reference, motion: "none" };
    expect(AccessibilityManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown color-blind mode", () => {
    const bad = { ...reference, colorBlindMode: "blue" };
    expect(AccessibilityManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects backgroundOpacity > 1", () => {
    const bad = {
      ...reference,
      subtitles: { ...reference.subtitles, backgroundOpacity: 1.5 },
    };
    expect(AccessibilityManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects subtitle scale < 0.75", () => {
    const bad = {
      ...reference,
      subtitles: { ...reference.subtitles, scale: 0.5 },
    };
    expect(AccessibilityManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects negative inputDebounceMs", () => {
    const bad = {
      ...reference,
      inputAssist: { ...reference.inputAssist, inputDebounceMs: -1 },
    };
    expect(AccessibilityManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects inputDebounceMs > 500", () => {
    const bad = {
      ...reference,
      inputAssist: { ...reference.inputAssist, inputDebounceMs: 1000 },
    };
    expect(AccessibilityManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects cameraEffectIntensity > 1", () => {
    const bad = { ...reference, cameraEffectIntensity: 2 };
    expect(AccessibilityManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects cameraEffectIntensity < 0", () => {
    const bad = { ...reference, cameraEffectIntensity: -0.1 };
    expect(AccessibilityManifestSchema.safeParse(bad).success).toBe(false);
  });
});
