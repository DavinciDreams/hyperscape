/**
 * Tests for the ProfilerOverlayProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { profilerOverlayProvider } from "../ProfilerOverlayProvider";

beforeEach(() => {
  profilerOverlayProvider.unload();
});
afterEach(() => {
  profilerOverlayProvider.unload();
});

describe("ProfilerOverlayProvider", () => {
  it("starts unloaded", () => {
    expect(profilerOverlayProvider.isLoaded()).toBe(false);
    expect(profilerOverlayProvider.getManifest()).toBeNull();
  });

  it("loadRaw() accepts {} baseline — every field has a default", () => {
    const parsed = profilerOverlayProvider.loadRaw({});
    expect(parsed.enabled).toBe(false);
    expect(parsed.groups).toEqual([]);
    expect(profilerOverlayProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() accepts explicit overrides", () => {
    const parsed = profilerOverlayProvider.loadRaw({
      enabled: true,
      anchor: "top-right",
      refreshMs: 500,
    });
    expect(parsed.enabled).toBe(true);
    expect(parsed.anchor).toBe("top-right");
  });

  it("loadRaw() rejects refreshMs below 16", () => {
    expect(() => profilerOverlayProvider.loadRaw({ refreshMs: 5 })).toThrow();
  });

  it("loadRaw() rejects invalid anchor enum", () => {
    expect(() =>
      profilerOverlayProvider.loadRaw({ anchor: "middle" }),
    ).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = profilerOverlayProvider.loadRaw({});
    profilerOverlayProvider.unload();
    profilerOverlayProvider.load(parsed);
    expect(profilerOverlayProvider.isLoaded()).toBe(true);
  });

  it("hotReload(null) clears the manifest", () => {
    profilerOverlayProvider.loadRaw({});
    profilerOverlayProvider.hotReload(null);
    expect(profilerOverlayProvider.isLoaded()).toBe(false);
  });

  it("unload() clears a loaded manifest", () => {
    profilerOverlayProvider.loadRaw({});
    profilerOverlayProvider.unload();
    expect(profilerOverlayProvider.isLoaded()).toBe(false);
  });

  it("singleton returns the same instance", () => {
    expect(profilerOverlayProvider).toBe(profilerOverlayProvider);
  });
});
