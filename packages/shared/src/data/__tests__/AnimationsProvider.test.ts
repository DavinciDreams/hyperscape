/**
 * Tests for the AnimationsProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { animationsProvider } from "../AnimationsProvider";

beforeEach(() => {
  animationsProvider.unload();
});
afterEach(() => {
  animationsProvider.unload();
});

describe("AnimationsProvider", () => {
  it("starts unloaded", () => {
    expect(animationsProvider.isLoaded()).toBe(false);
    expect(animationsProvider.getManifest()).toBeNull();
  });

  it("loadRaw() accepts {} baseline — both arrays default to []", () => {
    const parsed = animationsProvider.loadRaw({});
    expect(parsed.clips).toEqual([]);
    expect(parsed.bindings).toEqual([]);
    expect(animationsProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() accepts explicit empty arrays", () => {
    const parsed = animationsProvider.loadRaw({ clips: [], bindings: [] });
    expect(parsed.clips.length).toBe(0);
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = animationsProvider.loadRaw({});
    animationsProvider.unload();
    animationsProvider.load(parsed);
    expect(animationsProvider.isLoaded()).toBe(true);
  });

  it("hotReload(null) clears the manifest", () => {
    animationsProvider.loadRaw({});
    animationsProvider.hotReload(null);
    expect(animationsProvider.isLoaded()).toBe(false);
  });

  it("unload() clears a loaded manifest", () => {
    animationsProvider.loadRaw({});
    animationsProvider.unload();
    expect(animationsProvider.isLoaded()).toBe(false);
  });

  it("singleton returns the same instance", () => {
    expect(animationsProvider).toBe(animationsProvider);
  });
});
