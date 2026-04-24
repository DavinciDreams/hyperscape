/**
 * Tests for the MusicProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { musicProvider } from "../MusicProvider";

beforeEach(() => {
  musicProvider.unload();
});
afterEach(() => {
  musicProvider.unload();
});

const validTrack = {
  id: "introTheme",
  name: "Intro Theme",
  type: "theme" as const,
  category: "intro" as const,
  path: "asset://music/intro/theme.ogg",
  description: "Main title theme",
  duration: 120,
  mood: "heroic",
};

describe("MusicProvider", () => {
  it("starts unloaded", () => {
    expect(musicProvider.isLoaded()).toBe(false);
    expect(musicProvider.getManifest()).toBeNull();
  });

  it("loadRaw() accepts empty array baseline", () => {
    const parsed = musicProvider.loadRaw([]);
    expect(parsed.length).toBe(0);
    expect(musicProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() accepts a valid music track", () => {
    const parsed = musicProvider.loadRaw([validTrack]);
    expect(parsed.length).toBe(1);
    expect(parsed[0]!.id).toBe("introTheme");
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = musicProvider.loadRaw([validTrack]);
    musicProvider.unload();
    musicProvider.load(parsed);
    expect(musicProvider.isLoaded()).toBe(true);
  });

  it("hotReload(null) clears the manifest", () => {
    musicProvider.loadRaw([validTrack]);
    musicProvider.hotReload(null);
    expect(musicProvider.isLoaded()).toBe(false);
  });

  it("unload() clears a loaded manifest", () => {
    musicProvider.loadRaw([validTrack]);
    musicProvider.unload();
    expect(musicProvider.isLoaded()).toBe(false);
  });

  it("singleton returns the same instance", () => {
    expect(musicProvider).toBe(musicProvider);
  });
});
