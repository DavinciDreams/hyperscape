/**
 * Tests for the LoadoutsProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadoutsProvider } from "../LoadoutsProvider";

beforeEach(() => {
  loadoutsProvider.unload();
});
afterEach(() => {
  loadoutsProvider.unload();
});

describe("LoadoutsProvider", () => {
  it("starts unloaded", () => {
    expect(loadoutsProvider.isLoaded()).toBe(false);
    expect(loadoutsProvider.getManifest()).toBeNull();
  });

  it("loadRaw() accepts empty blob and fills defaults", () => {
    const parsed = loadoutsProvider.loadRaw({});
    expect(parsed.enabled).toBe(true);
    expect(parsed.slot).toBeDefined();
    expect(parsed.naming).toBeDefined();
    expect(parsed.swap).toBeDefined();
    expect(parsed.sharing).toBeDefined();
    expect(loadoutsProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() accepts {enabled:false} baseline", () => {
    const parsed = loadoutsProvider.loadRaw({ enabled: false });
    expect(parsed.enabled).toBe(false);
  });

  it("loadRaw() rejects enabled=true with maxSlotsPerCharacter=0", () => {
    expect(() =>
      loadoutsProvider.loadRaw({
        enabled: true,
        maxSlotsPerCharacter: 0,
      }),
    ).toThrow();
  });

  it("loadRaw() rejects freeSlotCount > maxSlotsPerCharacter", () => {
    expect(() =>
      loadoutsProvider.loadRaw({
        maxSlotsPerCharacter: 5,
        freeSlotCount: 10,
      }),
    ).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = loadoutsProvider.loadRaw({});
    loadoutsProvider.unload();
    loadoutsProvider.load(parsed);
    expect(loadoutsProvider.isLoaded()).toBe(true);
  });

  it("hotReload() replaces the manifest", () => {
    loadoutsProvider.loadRaw({});
    const parsed = loadoutsProvider.loadRaw({ enabled: false });
    loadoutsProvider.hotReload(parsed);
    expect(loadoutsProvider.getManifest()?.enabled).toBe(false);
  });

  it("hotReload(null) clears the manifest", () => {
    loadoutsProvider.loadRaw({});
    loadoutsProvider.hotReload(null);
    expect(loadoutsProvider.isLoaded()).toBe(false);
  });

  it("unload() clears a loaded manifest", () => {
    loadoutsProvider.loadRaw({});
    loadoutsProvider.unload();
    expect(loadoutsProvider.isLoaded()).toBe(false);
  });
});
