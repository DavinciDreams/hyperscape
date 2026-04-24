/**
 * Tests for the VfxProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { vfxProvider } from "../VfxProvider";

beforeEach(() => {
  vfxProvider.unload();
});
afterEach(() => {
  vfxProvider.unload();
});

const validVfx = {
  id: "swordHitImpact",
  name: "Sword Hit Impact",
  kind: "impact" as const,
  asset: "asset://vfx/impact/sword.particle",
};

describe("VfxProvider", () => {
  it("starts unloaded", () => {
    expect(vfxProvider.isLoaded()).toBe(false);
    expect(vfxProvider.getManifest()).toBeNull();
  });

  it("loadRaw() accepts empty array baseline", () => {
    const parsed = vfxProvider.loadRaw([]);
    expect(parsed.length).toBe(0);
    expect(vfxProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() accepts a valid VFX entry", () => {
    const parsed = vfxProvider.loadRaw([validVfx]);
    expect(parsed.length).toBe(1);
    expect(parsed[0]!.id).toBe("swordHitImpact");
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = vfxProvider.loadRaw([validVfx]);
    vfxProvider.unload();
    vfxProvider.load(parsed);
    expect(vfxProvider.isLoaded()).toBe(true);
  });

  it("hotReload(null) clears the manifest", () => {
    vfxProvider.loadRaw([validVfx]);
    vfxProvider.hotReload(null);
    expect(vfxProvider.isLoaded()).toBe(false);
  });

  it("unload() clears a loaded manifest", () => {
    vfxProvider.loadRaw([validVfx]);
    vfxProvider.unload();
    expect(vfxProvider.isLoaded()).toBe(false);
  });

  it("singleton returns the same instance", () => {
    expect(vfxProvider).toBe(vfxProvider);
  });
});
