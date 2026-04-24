/**
 * Tests for the SoundEffectsProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { soundEffectsProvider } from "../SoundEffectsProvider";

beforeEach(() => {
  soundEffectsProvider.unload();
});
afterEach(() => {
  soundEffectsProvider.unload();
});

const validSfx = {
  id: "uiClick",
  name: "UI Click",
  category: "ui" as const,
  path: "asset://sfx/ui/click.ogg",
};

describe("SoundEffectsProvider", () => {
  it("starts unloaded", () => {
    expect(soundEffectsProvider.isLoaded()).toBe(false);
    expect(soundEffectsProvider.getManifest()).toBeNull();
  });

  it("loadRaw() accepts empty array baseline", () => {
    const parsed = soundEffectsProvider.loadRaw([]);
    expect(parsed.length).toBe(0);
    expect(soundEffectsProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() accepts a valid SFX entry", () => {
    const parsed = soundEffectsProvider.loadRaw([validSfx]);
    expect(parsed.length).toBe(1);
    expect(parsed[0]!.id).toBe("uiClick");
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = soundEffectsProvider.loadRaw([validSfx]);
    soundEffectsProvider.unload();
    soundEffectsProvider.load(parsed);
    expect(soundEffectsProvider.isLoaded()).toBe(true);
  });

  it("hotReload(null) clears the manifest", () => {
    soundEffectsProvider.loadRaw([validSfx]);
    soundEffectsProvider.hotReload(null);
    expect(soundEffectsProvider.isLoaded()).toBe(false);
  });

  it("unload() clears a loaded manifest", () => {
    soundEffectsProvider.loadRaw([validSfx]);
    soundEffectsProvider.unload();
    expect(soundEffectsProvider.isLoaded()).toBe(false);
  });

  it("singleton returns the same instance", () => {
    expect(soundEffectsProvider).toBe(soundEffectsProvider);
  });
});
