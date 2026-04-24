/**
 * Tests for the MountsProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { mountsProvider } from "../MountsProvider";

beforeEach(() => {
  mountsProvider.unload();
});
afterEach(() => {
  mountsProvider.unload();
});

const validManifest = [
  {
    id: "brownHorse",
    name: "Brown Horse",
    category: "common" as const,
    locomotion: ["ground" as const],
    speeds: { runSpeed: 12 },
  },
  {
    id: "amberGryphon",
    name: "Amber Gryphon",
    category: "epic" as const,
    locomotion: ["ground" as const, "flight" as const],
    speeds: { runSpeed: 10, flySpeed: 22, maxAltitudeMeters: 500 },
  },
];

describe("MountsProvider", () => {
  it("starts unloaded", () => {
    expect(mountsProvider.isLoaded()).toBe(false);
    expect(mountsProvider.getManifest()).toBeNull();
    expect(mountsProvider.getMounts()).toEqual([]);
  });

  it("loadRaw() accepts a valid manifest and fills defaults", () => {
    const parsed = mountsProvider.loadRaw(validManifest);
    expect(parsed.length).toBe(2);
    expect(parsed[0].stamina.maxStamina).toBe(100);
    expect(parsed[0].capacity.passengers).toBe(1);
    expect(parsed[0].summonRules.forceDismountOnDamage).toBe(true);
    expect(parsed[0].hotkey).toBe("none");
    expect(parsed[0].persistent).toBe(true);
    expect(parsed[0].tradeable).toBe(false);
    expect(mountsProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() accepts an empty array", () => {
    const parsed = mountsProvider.loadRaw([]);
    expect(parsed).toEqual([]);
    expect(mountsProvider.isLoaded()).toBe(true);
    expect(mountsProvider.getMounts()).toEqual([]);
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = mountsProvider.loadRaw(validManifest);
    mountsProvider.unload();
    mountsProvider.load(parsed);
    expect(mountsProvider.isLoaded()).toBe(true);
    expect(mountsProvider.getMounts().length).toBe(2);
  });

  it("loadRaw() rejects duplicate mount ids", () => {
    const bad = [
      {
        id: "dup",
        name: "A",
        category: "common",
        locomotion: ["ground"],
        speeds: { runSpeed: 10 },
      },
      {
        id: "dup",
        name: "B",
        category: "rare",
        locomotion: ["ground"],
        speeds: { runSpeed: 10 },
      },
    ];
    expect(() => mountsProvider.loadRaw(bad)).toThrow();
    expect(mountsProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects empty locomotion array", () => {
    const bad = [
      {
        id: "m",
        name: "M",
        category: "common",
        locomotion: [],
      },
    ];
    expect(() => mountsProvider.loadRaw(bad)).toThrow();
    expect(mountsProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects duplicate locomotion modes", () => {
    const bad = [
      {
        id: "m",
        name: "M",
        category: "common",
        locomotion: ["ground", "ground"],
        speeds: { runSpeed: 10 },
      },
    ];
    expect(() => mountsProvider.loadRaw(bad)).toThrow();
    expect(mountsProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects flight locomotion without positive flySpeed", () => {
    const bad = [
      {
        id: "m",
        name: "M",
        category: "rare",
        locomotion: ["flight"],
        speeds: { flySpeed: 0 },
      },
    ];
    expect(() => mountsProvider.loadRaw(bad)).toThrow();
    expect(mountsProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects water locomotion without positive swimSpeed", () => {
    const bad = [
      {
        id: "m",
        name: "M",
        category: "rare",
        locomotion: ["water"],
        speeds: { swimSpeed: 0 },
      },
    ];
    expect(() => mountsProvider.loadRaw(bad)).toThrow();
    expect(mountsProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects ground locomotion without positive runSpeed", () => {
    const bad = [
      {
        id: "m",
        name: "M",
        category: "common",
        locomotion: ["ground"],
        speeds: { runSpeed: 0 },
      },
    ];
    expect(() => mountsProvider.loadRaw(bad)).toThrow();
    expect(mountsProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects one-shot sprint (drain>0, maxStamina>0, regen=0)", () => {
    const bad = [
      {
        id: "m",
        name: "M",
        category: "common",
        locomotion: ["ground"],
        speeds: { runSpeed: 10 },
        stamina: {
          maxStamina: 100,
          regenPerSecond: 0,
          drainPerSecondSprint: 20,
        },
      },
    ];
    expect(() => mountsProvider.loadRaw(bad)).toThrow();
    expect(mountsProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() accepts unlimited sprint (maxStamina=0 sentinel)", () => {
    const ok = [
      {
        id: "m",
        name: "M",
        category: "common" as const,
        locomotion: ["ground" as const],
        speeds: { runSpeed: 10 },
        stamina: { maxStamina: 0, regenPerSecond: 0, drainPerSecondSprint: 20 },
      },
    ];
    const parsed = mountsProvider.loadRaw(ok);
    expect(parsed[0].stamina.maxStamina).toBe(0);
  });

  it("hotReload(manifest) replaces the current manifest", () => {
    mountsProvider.loadRaw(validManifest);
    const replacement = mountsProvider.loadRaw([
      {
        id: "only",
        name: "Only",
        category: "common" as const,
        locomotion: ["ground" as const],
        speeds: { runSpeed: 8 },
      },
    ]);
    mountsProvider.hotReload(replacement);
    expect(mountsProvider.getMounts().length).toBe(1);
    expect(mountsProvider.getMounts()[0].id).toBe("only");
  });

  it("hotReload(null) clears", () => {
    mountsProvider.loadRaw(validManifest);
    mountsProvider.hotReload(null);
    expect(mountsProvider.isLoaded()).toBe(false);
  });

  it("unload() resets", () => {
    mountsProvider.loadRaw(validManifest);
    mountsProvider.unload();
    expect(mountsProvider.isLoaded()).toBe(false);
    expect(mountsProvider.getMounts()).toEqual([]);
  });
});
