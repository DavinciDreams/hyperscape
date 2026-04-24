/**
 * Tests for the DuelArenasProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { duelArenasProvider } from "../DuelArenasProvider";

beforeEach(() => {
  duelArenasProvider.unload();
});
afterEach(() => {
  duelArenasProvider.unload();
});

const validManifest = {
  arenas: [
    {
      arenaId: 1,
      center: { x: 0, z: 0 },
      size: 16,
      spawnPoints: [{ x: 0, y: 0, z: 0 }],
      trapdoorPositions: [],
    },
  ],
  lobby: {
    center: { x: 100, z: 100 },
    size: { width: 20, depth: 20 },
    spawnPoint: { x: 100, y: 0, z: 100 },
  },
  hospital: {
    center: { x: 200, z: 200 },
    size: { width: 20, depth: 20 },
    spawnPoint: { x: 200, y: 0, z: 200 },
  },
  constants: {
    arenaSize: 16,
    wallHeight: 4,
    wallThickness: 0.5,
    floorColor: "#202020",
    wallColor: "#404040",
    trapdoorColor: "#8B4513",
  },
};

describe("DuelArenasProvider", () => {
  it("starts unloaded", () => {
    expect(duelArenasProvider.isLoaded()).toBe(false);
    expect(duelArenasProvider.getManifest()).toBeNull();
  });

  it("loadRaw() rejects {} baseline — arenas/lobby/hospital/constants required", () => {
    expect(() => duelArenasProvider.loadRaw({})).toThrow();
  });

  it("loadRaw() accepts a valid minimal manifest", () => {
    const parsed = duelArenasProvider.loadRaw(validManifest);
    expect(parsed.arenas.length).toBe(1);
    expect(parsed.arenas[0]!.arenaId).toBe(1);
  });

  it("loadRaw() rejects empty arenas array", () => {
    expect(() =>
      duelArenasProvider.loadRaw({ ...validManifest, arenas: [] }),
    ).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = duelArenasProvider.loadRaw(validManifest);
    duelArenasProvider.unload();
    duelArenasProvider.load(parsed);
    expect(duelArenasProvider.isLoaded()).toBe(true);
  });

  it("hotReload(null) clears the manifest", () => {
    duelArenasProvider.loadRaw(validManifest);
    duelArenasProvider.hotReload(null);
    expect(duelArenasProvider.isLoaded()).toBe(false);
  });

  it("unload() clears a loaded manifest", () => {
    duelArenasProvider.loadRaw(validManifest);
    duelArenasProvider.unload();
    expect(duelArenasProvider.isLoaded()).toBe(false);
  });

  it("singleton returns the same instance", () => {
    expect(duelArenasProvider).toBe(duelArenasProvider);
  });
});
