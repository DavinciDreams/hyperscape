/**
 * Tests for the WorldEventsProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { worldEventsProvider } from "../WorldEventsProvider";

beforeEach(() => {
  worldEventsProvider.unload();
});
afterEach(() => {
  worldEventsProvider.unload();
});

const validEvent = {
  id: "goblinInvasion",
  name: "Goblin Invasion",
  category: "invasion" as const,
  trigger: {
    kind: "schedule" as const,
    intervalMinutes: 60,
  },
  zoneId: "lumbridge",
  phases: [
    {
      id: "start",
      name: "Stop the scouts",
    },
  ],
  startPhaseId: "start",
  participationTiers: [
    {
      id: "bronze",
      name: "Bronze",
      minContribution: 0.1,
      lootTableId: "goblinBronzeLoot",
    },
  ],
};

describe("WorldEventsProvider", () => {
  it("starts unloaded", () => {
    expect(worldEventsProvider.isLoaded()).toBe(false);
    expect(worldEventsProvider.getManifest()).toBeNull();
  });

  it("loadRaw() accepts empty array baseline", () => {
    const parsed = worldEventsProvider.loadRaw([]);
    expect(parsed).toEqual([]);
    expect(worldEventsProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() accepts valid event", () => {
    const parsed = worldEventsProvider.loadRaw([validEvent]);
    expect(parsed.length).toBe(1);
    expect(parsed[0].id).toBe("goblinInvasion");
  });

  it("loadRaw() rejects duplicate event ids", () => {
    expect(() =>
      worldEventsProvider.loadRaw([validEvent, { ...validEvent, name: "Dup" }]),
    ).toThrow();
  });

  it("loadRaw() rejects startPhaseId not in phases", () => {
    expect(() =>
      worldEventsProvider.loadRaw([
        { ...validEvent, startPhaseId: "doesNotExist" },
      ]),
    ).toThrow();
  });

  it("loadRaw() rejects chain trigger referencing missing event", () => {
    expect(() =>
      worldEventsProvider.loadRaw([
        {
          ...validEvent,
          trigger: {
            kind: "chain" as const,
            sourceEventId: "nonExistent",
          },
        },
      ]),
    ).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = worldEventsProvider.loadRaw([validEvent]);
    worldEventsProvider.unload();
    worldEventsProvider.load(parsed);
    expect(worldEventsProvider.isLoaded()).toBe(true);
  });

  it("hotReload() replaces the manifest", () => {
    worldEventsProvider.loadRaw([validEvent]);
    const parsed = worldEventsProvider.loadRaw([]);
    worldEventsProvider.hotReload(parsed);
    expect(worldEventsProvider.getManifest()).toEqual([]);
  });

  it("hotReload(null) clears the manifest", () => {
    worldEventsProvider.loadRaw([validEvent]);
    worldEventsProvider.hotReload(null);
    expect(worldEventsProvider.isLoaded()).toBe(false);
  });

  it("unload() clears a loaded manifest", () => {
    worldEventsProvider.loadRaw([validEvent]);
    worldEventsProvider.unload();
    expect(worldEventsProvider.isLoaded()).toBe(false);
  });
});
