/**
 * Tests for the ArenaLayoutProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { arenaLayoutProvider } from "../ArenaLayoutProvider";

beforeEach(() => {
  arenaLayoutProvider.unload();
});
afterEach(() => {
  arenaLayoutProvider.unload();
});

const validManifest = {
  $schema: "hyperforge.arena-layout.v1" as const,
  arenaGrid: {
    baseX: 0,
    baseZ: 0,
    baseY: 0,
    width: 16,
    length: 16,
    gap: 4,
    columns: 4,
    rows: 4,
    count: 16,
    spawnOffset: 2,
  },
  lobby: { centerX: 0, centerZ: -40, width: 20, length: 10 },
  hospital: { centerX: 0, centerZ: 40, width: 20, length: 10 },
  lobbySpawn: { x: 0, y: 0, z: -40 },
};

describe("ArenaLayoutProvider", () => {
  it("starts unloaded", () => {
    expect(arenaLayoutProvider.isLoaded()).toBe(false);
    expect(arenaLayoutProvider.getManifest()).toBeNull();
  });

  it("loadRaw() rejects {} baseline", () => {
    expect(() => arenaLayoutProvider.loadRaw({})).toThrow();
  });

  it("loadRaw() accepts a valid minimal manifest", () => {
    const parsed = arenaLayoutProvider.loadRaw(validManifest);
    expect(parsed.$schema).toBe("hyperforge.arena-layout.v1");
    expect(parsed.arenaGrid.count).toBe(16);
  });

  it("loadRaw() rejects non-positive grid width", () => {
    const bad = {
      ...validManifest,
      arenaGrid: { ...validManifest.arenaGrid, width: 0 },
    };
    expect(() => arenaLayoutProvider.loadRaw(bad)).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = arenaLayoutProvider.loadRaw(validManifest);
    arenaLayoutProvider.unload();
    arenaLayoutProvider.load(parsed);
    expect(arenaLayoutProvider.isLoaded()).toBe(true);
  });

  it("hotReload(null) clears the manifest", () => {
    arenaLayoutProvider.loadRaw(validManifest);
    arenaLayoutProvider.hotReload(null);
    expect(arenaLayoutProvider.isLoaded()).toBe(false);
  });

  it("unload() clears a loaded manifest", () => {
    arenaLayoutProvider.loadRaw(validManifest);
    arenaLayoutProvider.unload();
    expect(arenaLayoutProvider.isLoaded()).toBe(false);
  });

  it("singleton returns the same instance", () => {
    expect(arenaLayoutProvider).toBe(arenaLayoutProvider);
  });
});
