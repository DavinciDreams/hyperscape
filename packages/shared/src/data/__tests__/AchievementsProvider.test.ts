/**
 * Tests for the AchievementsProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { achievementsProvider } from "../AchievementsProvider";

beforeEach(() => {
  achievementsProvider.unload();
});
afterEach(() => {
  achievementsProvider.unload();
});

const validManifest = [
  {
    id: "first-kill",
    name: "First Blood",
    trigger: { kind: "event" as const, event: "combat:kill" },
  },
  {
    id: "ten-fish",
    name: "Fish Ten",
    trigger: {
      kind: "count" as const,
      event: "fishing:catch",
      threshold: 10,
    },
  },
  {
    id: "level-50-woodcutting",
    name: "Lumberjack",
    trigger: {
      kind: "stat" as const,
      stat: "skill.woodcutting.level",
      threshold: 50,
    },
    prerequisites: ["first-kill"],
  },
];

describe("AchievementsProvider", () => {
  it("starts unloaded with an empty list", () => {
    expect(achievementsProvider.isLoaded()).toBe(false);
    expect(achievementsProvider.getAchievements()).toEqual([]);
    expect(achievementsProvider.getManifest()).toBeNull();
  });

  it("load() installs an already-validated manifest", () => {
    achievementsProvider.load(validManifest);
    expect(achievementsProvider.isLoaded()).toBe(true);
    expect(achievementsProvider.getAchievements().length).toBe(3);
  });

  it("loadRaw() rejects duplicate ids", () => {
    const dup = [validManifest[0], validManifest[0]];
    expect(() => achievementsProvider.loadRaw(dup)).toThrow();
    expect(achievementsProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects self-referential prerequisites", () => {
    const bad = [
      {
        id: "self-ref",
        name: "Self",
        prerequisites: ["self-ref"],
        trigger: { kind: "event", event: "anything" },
      },
    ];
    expect(() => achievementsProvider.loadRaw(bad)).toThrow();
    expect(achievementsProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects unresolved prerequisite ids", () => {
    const bad = [
      {
        id: "has-dangling-prereq",
        name: "Dangles",
        prerequisites: ["does-not-exist"],
        trigger: { kind: "event", event: "anything" },
      },
    ];
    expect(() => achievementsProvider.loadRaw(bad)).toThrow();
    expect(achievementsProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() accepts valid payload and returns parsed manifest", () => {
    const parsed = achievementsProvider.loadRaw(validManifest);
    expect(parsed.length).toBe(3);
    expect(achievementsProvider.isLoaded()).toBe(true);
  });

  it("hotReload(manifest) replaces the current manifest", () => {
    achievementsProvider.load(validManifest);
    const replacement = [validManifest[0]];
    achievementsProvider.hotReload(replacement);
    expect(achievementsProvider.getAchievements()).toEqual(replacement);
  });

  it("hotReload(null) clears", () => {
    achievementsProvider.load(validManifest);
    achievementsProvider.hotReload(null);
    expect(achievementsProvider.isLoaded()).toBe(false);
    expect(achievementsProvider.getAchievements()).toEqual([]);
  });

  it("unload() resets to default empty state", () => {
    achievementsProvider.load(validManifest);
    achievementsProvider.unload();
    expect(achievementsProvider.isLoaded()).toBe(false);
    expect(achievementsProvider.getManifest()).toBeNull();
  });

  it("getAchievements() returns [] (not null) when unloaded — safe to iterate", () => {
    const list = achievementsProvider.getAchievements();
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBe(0);
  });
});
