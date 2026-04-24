/**
 * Tests for the AvatarsProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { avatarsProvider } from "../AvatarsProvider";

beforeEach(() => {
  avatarsProvider.unload();
});
afterEach(() => {
  avatarsProvider.unload();
});

const validManifest = {
  $schema: "hyperforge.avatars.v1" as const,
  avatars: [
    {
      id: "male1",
      name: "Male 1",
      url: "asset://avatars/m1.vrm",
      previewPath: "avatars/m1.png",
    },
  ],
  lodDistances: { lod0ToLod1: 10, lod1ToLod2: 30 },
};

describe("AvatarsProvider", () => {
  it("starts unloaded", () => {
    expect(avatarsProvider.isLoaded()).toBe(false);
    expect(avatarsProvider.getManifest()).toBeNull();
  });

  it("loadRaw() rejects {} baseline — $schema/avatars/lodDistances required", () => {
    expect(() => avatarsProvider.loadRaw({})).toThrow();
  });

  it("loadRaw() rejects empty avatars array — .min(1)", () => {
    const bad = { ...validManifest, avatars: [] };
    expect(() => avatarsProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() accepts a valid minimal manifest", () => {
    const parsed = avatarsProvider.loadRaw(validManifest);
    expect(parsed.$schema).toBe("hyperforge.avatars.v1");
    expect(parsed.avatars[0]!.id).toBe("male1");
    expect(parsed.lodDistances.lod0ToLod1).toBe(10);
  });

  it("loadRaw() rejects non-positive LOD distance", () => {
    const bad = {
      ...validManifest,
      lodDistances: { lod0ToLod1: 0, lod1ToLod2: 30 },
    };
    expect(() => avatarsProvider.loadRaw(bad)).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = avatarsProvider.loadRaw(validManifest);
    avatarsProvider.unload();
    avatarsProvider.load(parsed);
    expect(avatarsProvider.isLoaded()).toBe(true);
  });

  it("hotReload(null) clears the manifest", () => {
    avatarsProvider.loadRaw(validManifest);
    avatarsProvider.hotReload(null);
    expect(avatarsProvider.isLoaded()).toBe(false);
  });

  it("unload() clears a loaded manifest", () => {
    avatarsProvider.loadRaw(validManifest);
    avatarsProvider.unload();
    expect(avatarsProvider.isLoaded()).toBe(false);
  });

  it("singleton returns the same instance", () => {
    expect(avatarsProvider).toBe(avatarsProvider);
  });
});
