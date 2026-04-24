/**
 * Tests for the RespawnProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { respawnProvider } from "../RespawnProvider";

beforeEach(() => {
  respawnProvider.unload();
});
afterEach(() => {
  respawnProvider.unload();
});

const bindA = {
  id: "stormwindInn",
  name: "Stormwind Innkeeper",
  kind: "innkeeper" as const,
  zoneId: "stormwind",
  position: { x: 0, y: 0, z: 0 },
  allowBindHere: true,
};

const validManifest = {
  enabled: true,
  bindPoints: [bindA],
};

describe("RespawnProvider", () => {
  it("starts unloaded", () => {
    expect(respawnProvider.isLoaded()).toBe(false);
    expect(respawnProvider.getManifest()).toBeNull();
  });

  it("loadRaw() accepts valid manifest and fills defaults", () => {
    const parsed = respawnProvider.loadRaw(validManifest);
    expect(parsed.enabled).toBe(true);
    expect(parsed.bindPoints.length).toBe(1);
    expect(parsed.deathPenalty).toBeDefined();
    expect(parsed.corpseRun).toBeDefined();
    expect(parsed.resurrection).toBeDefined();
    expect(respawnProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() accepts disabled blob", () => {
    const parsed = respawnProvider.loadRaw({ enabled: false });
    expect(parsed.enabled).toBe(false);
    expect(parsed.bindPoints.length).toBe(0);
    expect(respawnProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() rejects enabled=true with no bindPoints", () => {
    expect(() => respawnProvider.loadRaw({ enabled: true })).toThrow();
  });

  it("loadRaw() rejects enabled=true with no allowBindHere=true", () => {
    const bad = {
      enabled: true,
      bindPoints: [{ ...bindA, allowBindHere: false }],
    };
    expect(() => respawnProvider.loadRaw(bad)).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = respawnProvider.loadRaw(validManifest);
    respawnProvider.unload();
    respawnProvider.load(parsed);
    expect(respawnProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() rejects duplicate bindPoint ids", () => {
    const bad = {
      ...validManifest,
      bindPoints: [bindA, { ...bindA }],
    };
    expect(() => respawnProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects custom bindPoint without customKey", () => {
    const bad = {
      ...validManifest,
      bindPoints: [{ ...bindA, kind: "custom" as const, customKey: "" }],
    };
    expect(() => respawnProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() accepts custom bindPoint with customKey", () => {
    const parsed = respawnProvider.loadRaw({
      ...validManifest,
      bindPoints: [
        {
          ...bindA,
          kind: "custom" as const,
          customKey: "guildHallPortal",
        },
      ],
    });
    expect(parsed.bindPoints[0].customKey).toBe("guildHallPortal");
  });

  it("loadRaw() accepts multiple bind points with at least one allowBindHere=true", () => {
    const parsed = respawnProvider.loadRaw({
      ...validManifest,
      bindPoints: [
        bindA,
        {
          id: "graveyard1",
          name: "Graveyard",
          kind: "graveyard" as const,
          zoneId: "stormwind",
          position: { x: 50, y: 0, z: 50 },
          allowBindHere: false,
        },
      ],
    });
    expect(parsed.bindPoints.length).toBe(2);
  });

  it("hotReload() replaces the manifest", () => {
    respawnProvider.loadRaw(validManifest);
    const parsed = respawnProvider.loadRaw({ enabled: false });
    respawnProvider.hotReload(parsed);
    expect(respawnProvider.getManifest()?.enabled).toBe(false);
  });

  it("hotReload(null) clears the manifest", () => {
    respawnProvider.loadRaw(validManifest);
    respawnProvider.hotReload(null);
    expect(respawnProvider.isLoaded()).toBe(false);
  });

  it("unload() clears a loaded manifest", () => {
    respawnProvider.loadRaw(validManifest);
    respawnProvider.unload();
    expect(respawnProvider.isLoaded()).toBe(false);
  });
});
