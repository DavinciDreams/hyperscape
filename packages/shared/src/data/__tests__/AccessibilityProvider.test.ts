/**
 * Tests for the AccessibilityProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { accessibilityProvider } from "../AccessibilityProvider";

beforeEach(() => {
  accessibilityProvider.unload();
});
afterEach(() => {
  accessibilityProvider.unload();
});

describe("AccessibilityProvider", () => {
  it("starts unloaded but returns defaulted manifest", () => {
    expect(accessibilityProvider.isLoaded()).toBe(false);
    const defaulted = accessibilityProvider.getManifest();
    expect(defaulted.fontScale).toBe(1.0);
    expect(defaulted.motion).toBe("full");
    expect(defaulted.colorBlindMode).toBe("none");
    expect(defaulted.highContrast).toBe(false);
    expect(defaulted.subtitles.enabled).toBe(false);
    expect(defaulted.subtitles.scale).toBe(1.0);
    expect(defaulted.inputAssist.targetAssist).toBe(false);
    expect(defaulted.inputAssist.inputDebounceMs).toBe(0);
    expect(defaulted.cameraEffectIntensity).toBe(1);
    expect(defaulted.screenReaderAnnouncements).toBe(false);
  });

  it("load() installs an already-validated manifest", () => {
    const manifest = {
      fontScale: 1.5,
      motion: "reduced" as const,
      colorBlindMode: "deuteranopia" as const,
      highContrast: true,
      dyslexiaFriendlyFont: true,
      subtitles: {
        enabled: true,
        scale: 1.25,
        backgroundOpacity: 0.7,
        showSpeaker: true,
        showSoundCues: true,
      },
      inputAssist: {
        targetAssist: true,
        autoHold: false,
        autoTap: false,
        inputDebounceMs: 150,
      },
      cameraEffectIntensity: 0.3,
      screenReaderAnnouncements: true,
    };
    accessibilityProvider.load(manifest);
    expect(accessibilityProvider.isLoaded()).toBe(true);
    expect(accessibilityProvider.getManifest().fontScale).toBe(1.5);
    expect(accessibilityProvider.getManifest().subtitles.scale).toBe(1.25);
  });

  it("loadRaw({}) parses an empty object into full defaults", () => {
    const parsed = accessibilityProvider.loadRaw({});
    expect(accessibilityProvider.isLoaded()).toBe(true);
    expect(parsed.fontScale).toBe(1.0);
    expect(parsed.subtitles.backgroundOpacity).toBe(0.5);
  });

  it("loadRaw() rejects fontScale outside [0.75, 2.0]", () => {
    expect(() => accessibilityProvider.loadRaw({ fontScale: 3.0 })).toThrow();
    expect(accessibilityProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects invalid colorBlindMode", () => {
    expect(() =>
      accessibilityProvider.loadRaw({ colorBlindMode: "rainbow" }),
    ).toThrow();
    expect(accessibilityProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects inputDebounceMs out of range", () => {
    expect(() =>
      accessibilityProvider.loadRaw({
        inputAssist: { inputDebounceMs: 2000 },
      }),
    ).toThrow();
    expect(accessibilityProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects cameraEffectIntensity > 1", () => {
    expect(() =>
      accessibilityProvider.loadRaw({ cameraEffectIntensity: 1.5 }),
    ).toThrow();
    expect(accessibilityProvider.isLoaded()).toBe(false);
  });

  it("hotReload(manifest) replaces the current manifest", () => {
    accessibilityProvider.loadRaw({ fontScale: 1.2 });
    expect(accessibilityProvider.getManifest().fontScale).toBe(1.2);
    const replacement = accessibilityProvider.loadRaw({ fontScale: 1.8 });
    accessibilityProvider.hotReload(replacement);
    expect(accessibilityProvider.getManifest().fontScale).toBe(1.8);
  });

  it("hotReload(null) clears and reverts to defaults", () => {
    accessibilityProvider.loadRaw({ fontScale: 1.2 });
    accessibilityProvider.hotReload(null);
    expect(accessibilityProvider.isLoaded()).toBe(false);
    expect(accessibilityProvider.getManifest().fontScale).toBe(1.0);
  });

  it("unload() resets but still returns defaults", () => {
    accessibilityProvider.loadRaw({ fontScale: 1.2 });
    accessibilityProvider.unload();
    expect(accessibilityProvider.isLoaded()).toBe(false);
    expect(accessibilityProvider.getManifest().fontScale).toBe(1.0);
  });
});
