/**
 * Tests for the DuelProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { duelProvider } from "../DuelProvider";

beforeEach(() => {
  duelProvider.unload();
});
afterEach(() => {
  duelProvider.unload();
});

const validManifest = {
  $schema: "hyperforge.duel.v1" as const,
  challengeTimeoutMs: 30_000,
  rules: {
    noMagic: {
      label: "No Magic",
      description: "Magic attacks are disabled",
      incompatibleWith: [] as string[],
    },
  },
  equipmentSlots: {
    weapon: {
      label: "Weapon",
      order: 0,
    },
  },
  duelSlotToEquipmentSlot: {
    weapon: "weapon",
  },
};

describe("DuelProvider", () => {
  it("starts unloaded", () => {
    expect(duelProvider.isLoaded()).toBe(false);
    expect(duelProvider.getManifest()).toBeNull();
  });

  it("loadRaw() rejects {} baseline — $schema/rules/equipmentSlots required", () => {
    expect(() => duelProvider.loadRaw({})).toThrow();
  });

  it("loadRaw() accepts a valid minimal manifest", () => {
    const parsed = duelProvider.loadRaw(validManifest);
    expect(parsed.$schema).toBe("hyperforge.duel.v1");
    expect(parsed.challengeTimeoutMs).toBe(30_000);
  });

  it("loadRaw() rejects non-positive challengeTimeoutMs", () => {
    expect(() =>
      duelProvider.loadRaw({ ...validManifest, challengeTimeoutMs: 0 }),
    ).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = duelProvider.loadRaw(validManifest);
    duelProvider.unload();
    duelProvider.load(parsed);
    expect(duelProvider.isLoaded()).toBe(true);
  });

  it("hotReload(null) clears the manifest", () => {
    duelProvider.loadRaw(validManifest);
    duelProvider.hotReload(null);
    expect(duelProvider.isLoaded()).toBe(false);
  });

  it("unload() clears a loaded manifest", () => {
    duelProvider.loadRaw(validManifest);
    duelProvider.unload();
    expect(duelProvider.isLoaded()).toBe(false);
  });

  it("singleton returns the same instance", () => {
    expect(duelProvider).toBe(duelProvider);
  });
});
