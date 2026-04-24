/**
 * Tests for the CameraProfilesProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { cameraProfilesProvider } from "../CameraProfilesProvider";

beforeEach(() => {
  cameraProfilesProvider.unload();
});
afterEach(() => {
  cameraProfilesProvider.unload();
});

const validManifest = [
  {
    id: "player.firstPerson",
    name: "Player First Person",
    rig: {
      kind: "first-person" as const,
      eyeOffset: { x: 0, y: 1.6, z: 0 },
    },
  },
  {
    id: "player.thirdPerson",
    name: "Player Third Person",
    rig: {
      kind: "third-person" as const,
      armLength: 3,
      socketOffset: { x: 0, y: 1.6, z: 0 },
      targetOffset: { x: 0, y: 1.2, z: 0 },
      pitchRangeDegrees: { min: -60, max: 60 },
    },
  },
];

describe("CameraProfilesProvider", () => {
  it("starts unloaded", () => {
    expect(cameraProfilesProvider.isLoaded()).toBe(false);
    expect(cameraProfilesProvider.getManifest()).toBeNull();
    expect(cameraProfilesProvider.getProfiles()).toEqual([]);
  });

  it("loadRaw() accepts a valid manifest and defaults missing fields", () => {
    const parsed = cameraProfilesProvider.loadRaw(validManifest);
    expect(parsed.length).toBe(2);
    expect(parsed[0].projection).toBe("perspective");
    expect(parsed[0].fov.baseDegrees).toBe(75);
    expect(parsed[0].collision.enabled).toBe(true);
    expect(parsed[0].lag.damping).toBe(1);
    expect(cameraProfilesProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() accepts empty array (no min-1 refinement)", () => {
    const parsed = cameraProfilesProvider.loadRaw([]);
    expect(parsed).toEqual([]);
    expect(cameraProfilesProvider.isLoaded()).toBe(true);
    expect(cameraProfilesProvider.getProfiles()).toEqual([]);
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = cameraProfilesProvider.loadRaw(validManifest);
    cameraProfilesProvider.unload();
    cameraProfilesProvider.load(parsed);
    expect(cameraProfilesProvider.isLoaded()).toBe(true);
    expect(cameraProfilesProvider.getProfiles().length).toBe(2);
  });

  it("loadRaw() rejects duplicate profile ids", () => {
    const dup = [
      {
        id: "player.fp",
        name: "A",
        rig: { kind: "first-person" as const, eyeOffset: { x: 0, y: 0, z: 0 } },
      },
      {
        id: "player.fp",
        name: "B",
        rig: { kind: "first-person" as const, eyeOffset: { x: 0, y: 0, z: 0 } },
      },
    ];
    expect(() => cameraProfilesProvider.loadRaw(dup)).toThrow();
    expect(cameraProfilesProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects nearMeters >= farMeters", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        nearMeters: 100,
        farMeters: 50,
        rig: { kind: "first-person" as const, eyeOffset: { x: 0, y: 0, z: 0 } },
      },
    ];
    expect(() => cameraProfilesProvider.loadRaw(bad)).toThrow();
    expect(cameraProfilesProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects third-person pitchRange with min > max", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        rig: {
          kind: "third-person" as const,
          armLength: 3,
          socketOffset: { x: 0, y: 0, z: 0 },
          targetOffset: { x: 0, y: 0, z: 0 },
          pitchRangeDegrees: { min: 60, max: -60 },
        },
      },
    ];
    expect(() => cameraProfilesProvider.loadRaw(bad)).toThrow();
    expect(cameraProfilesProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects top-down pitchDegrees > 0", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        rig: {
          kind: "top-down" as const,
          heightMeters: 20,
          pitchDegrees: 30,
        },
      },
    ];
    expect(() => cameraProfilesProvider.loadRaw(bad)).toThrow();
    expect(cameraProfilesProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects unknown rig kind", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        rig: { kind: "cinematic", target: "anything" },
      },
    ];
    expect(() => cameraProfilesProvider.loadRaw(bad)).toThrow();
    expect(cameraProfilesProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects invalid id casing", () => {
    const bad = [
      {
        id: "Player.FirstPerson",
        name: "X",
        rig: { kind: "first-person" as const, eyeOffset: { x: 0, y: 0, z: 0 } },
      },
    ];
    expect(() => cameraProfilesProvider.loadRaw(bad)).toThrow();
    expect(cameraProfilesProvider.isLoaded()).toBe(false);
  });

  it("hotReload(manifest) replaces the current manifest", () => {
    cameraProfilesProvider.loadRaw(validManifest);
    const replacement = cameraProfilesProvider.loadRaw([
      {
        id: "only",
        name: "Only",
        rig: { kind: "first-person" as const, eyeOffset: { x: 0, y: 0, z: 0 } },
      },
    ]);
    cameraProfilesProvider.hotReload(replacement);
    expect(cameraProfilesProvider.getProfiles().length).toBe(1);
    expect(cameraProfilesProvider.getProfiles()[0].id).toBe("only");
  });

  it("hotReload(null) clears", () => {
    cameraProfilesProvider.loadRaw(validManifest);
    cameraProfilesProvider.hotReload(null);
    expect(cameraProfilesProvider.isLoaded()).toBe(false);
    expect(cameraProfilesProvider.getProfiles()).toEqual([]);
  });

  it("unload() resets", () => {
    cameraProfilesProvider.loadRaw(validManifest);
    cameraProfilesProvider.unload();
    expect(cameraProfilesProvider.isLoaded()).toBe(false);
    expect(cameraProfilesProvider.getManifest()).toBeNull();
    expect(cameraProfilesProvider.getProfiles()).toEqual([]);
  });
});
