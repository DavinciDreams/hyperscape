/**
 * Tests for the NpcScheduleProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { npcScheduleProvider } from "../NpcScheduleProvider";

beforeEach(() => {
  npcScheduleProvider.unload();
});
afterEach(() => {
  npcScheduleProvider.unload();
});

const validManifest = [
  {
    id: "blacksmith.default",
    name: "Blacksmith Routine",
    npcIds: ["blacksmith.thoradin"],
    slots: [
      {
        id: "morning",
        startTime: "08:00",
        endTime: "12:00",
        activity: "work-at" as const,
        location: { x: 10, y: 0, z: 5 },
      },
      {
        id: "lunch",
        startTime: "12:00",
        endTime: "13:00",
        activity: "socialize" as const,
      },
      {
        id: "evening",
        startTime: "20:00",
        endTime: "06:00",
        activity: "sleep" as const,
        location: { x: 8, y: 0, z: 3 },
      },
    ],
  },
];

describe("NpcScheduleProvider", () => {
  it("starts unloaded", () => {
    expect(npcScheduleProvider.isLoaded()).toBe(false);
    expect(npcScheduleProvider.getManifest()).toBeNull();
    expect(npcScheduleProvider.getSchedules()).toEqual([]);
  });

  it("loadRaw() accepts a valid manifest and fills defaults", () => {
    const parsed = npcScheduleProvider.loadRaw(validManifest);
    expect(parsed.length).toBe(1);
    expect(parsed[0].fallbackActivity).toBe("idle");
    expect(parsed[0].slots[0].days).toEqual([]);
    expect(npcScheduleProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() accepts an empty array", () => {
    const parsed = npcScheduleProvider.loadRaw([]);
    expect(parsed).toEqual([]);
    expect(npcScheduleProvider.isLoaded()).toBe(true);
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = npcScheduleProvider.loadRaw(validManifest);
    npcScheduleProvider.unload();
    npcScheduleProvider.load(parsed);
    expect(npcScheduleProvider.isLoaded()).toBe(true);
    expect(npcScheduleProvider.getSchedules().length).toBe(1);
  });

  it("loadRaw() rejects duplicate schedule ids", () => {
    const dup = [
      {
        id: "x",
        name: "A",
        slots: [
          {
            id: "s",
            startTime: "08:00",
            endTime: "09:00",
            activity: "idle" as const,
          },
        ],
      },
      {
        id: "x",
        name: "B",
        slots: [
          {
            id: "s",
            startTime: "08:00",
            endTime: "09:00",
            activity: "idle" as const,
          },
        ],
      },
    ];
    expect(() => npcScheduleProvider.loadRaw(dup)).toThrow();
    expect(npcScheduleProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects duplicate slot ids within a schedule", () => {
    const bad = [
      {
        id: "x",
        name: "A",
        slots: [
          {
            id: "s",
            startTime: "08:00",
            endTime: "09:00",
            activity: "idle" as const,
          },
          {
            id: "s",
            startTime: "10:00",
            endTime: "11:00",
            activity: "idle" as const,
          },
        ],
      },
    ];
    expect(() => npcScheduleProvider.loadRaw(bad)).toThrow();
    expect(npcScheduleProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects zero-length slot (start == end)", () => {
    const bad = [
      {
        id: "x",
        name: "A",
        slots: [
          {
            id: "s",
            startTime: "08:00",
            endTime: "08:00",
            activity: "idle" as const,
          },
        ],
      },
    ];
    expect(() => npcScheduleProvider.loadRaw(bad)).toThrow();
    expect(npcScheduleProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects walk-to/work-at/sleep without location", () => {
    const bad = [
      {
        id: "x",
        name: "A",
        slots: [
          {
            id: "s",
            startTime: "08:00",
            endTime: "09:00",
            activity: "work-at" as const,
          },
        ],
      },
    ];
    expect(() => npcScheduleProvider.loadRaw(bad)).toThrow();
    expect(npcScheduleProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects custom activity without customKey", () => {
    const bad = [
      {
        id: "x",
        name: "A",
        slots: [
          {
            id: "s",
            startTime: "08:00",
            endTime: "09:00",
            activity: "custom" as const,
          },
        ],
      },
    ];
    expect(() => npcScheduleProvider.loadRaw(bad)).toThrow();
    expect(npcScheduleProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects non-custom activity with customKey set", () => {
    const bad = [
      {
        id: "x",
        name: "A",
        slots: [
          {
            id: "s",
            startTime: "08:00",
            endTime: "09:00",
            activity: "idle" as const,
            customKey: "uhoh",
          },
        ],
      },
    ];
    expect(() => npcScheduleProvider.loadRaw(bad)).toThrow();
    expect(npcScheduleProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects patrol with fewer than 2 waypoints", () => {
    const bad = [
      {
        id: "x",
        name: "A",
        slots: [
          {
            id: "s",
            startTime: "08:00",
            endTime: "09:00",
            activity: "patrol" as const,
            patrolPath: [{ x: 0, y: 0, z: 0 }],
          },
        ],
      },
    ];
    expect(() => npcScheduleProvider.loadRaw(bad)).toThrow();
    expect(npcScheduleProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects invalid HH:MM format", () => {
    const bad = [
      {
        id: "x",
        name: "A",
        slots: [
          {
            id: "s",
            startTime: "8am",
            endTime: "5pm",
            activity: "idle" as const,
          },
        ],
      },
    ];
    expect(() => npcScheduleProvider.loadRaw(bad)).toThrow();
    expect(npcScheduleProvider.isLoaded()).toBe(false);
  });

  it("hotReload(manifest) replaces the current manifest", () => {
    npcScheduleProvider.loadRaw(validManifest);
    const replacement = npcScheduleProvider.loadRaw([]);
    npcScheduleProvider.hotReload(replacement);
    expect(npcScheduleProvider.getSchedules().length).toBe(0);
  });

  it("hotReload(null) clears", () => {
    npcScheduleProvider.loadRaw(validManifest);
    npcScheduleProvider.hotReload(null);
    expect(npcScheduleProvider.isLoaded()).toBe(false);
  });

  it("unload() resets", () => {
    npcScheduleProvider.loadRaw(validManifest);
    npcScheduleProvider.unload();
    expect(npcScheduleProvider.isLoaded()).toBe(false);
    expect(npcScheduleProvider.getManifest()).toBeNull();
  });
});
