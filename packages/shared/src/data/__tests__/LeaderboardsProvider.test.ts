/**
 * Tests for the LeaderboardsProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { leaderboardsProvider } from "../LeaderboardsProvider";

beforeEach(() => {
  leaderboardsProvider.unload();
});
afterEach(() => {
  leaderboardsProvider.unload();
});

const validBoard = {
  id: "topPvp",
  name: "Top PvP Rating",
  metric: "pvpRating" as const,
  sort: "desc" as const,
  scope: "global" as const,
  cadence: "season" as const,
  tieBreak: "earliestFirst" as const,
};

describe("LeaderboardsProvider", () => {
  it("starts unloaded", () => {
    expect(leaderboardsProvider.isLoaded()).toBe(false);
    expect(leaderboardsProvider.getManifest()).toBeNull();
  });

  it("loadRaw() accepts empty array baseline", () => {
    const parsed = leaderboardsProvider.loadRaw([]);
    expect(parsed).toEqual([]);
    expect(leaderboardsProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() accepts valid leaderboard", () => {
    const parsed = leaderboardsProvider.loadRaw([validBoard]);
    expect(parsed.length).toBe(1);
    expect(parsed[0].id).toBe("topPvp");
  });

  it("loadRaw() rejects duplicate board ids", () => {
    expect(() =>
      leaderboardsProvider.loadRaw([
        validBoard,
        { ...validBoard, name: "Dup" },
      ]),
    ).toThrow();
  });

  it("loadRaw() rejects custom metric without customMetricKey", () => {
    expect(() =>
      leaderboardsProvider.loadRaw([
        { ...validBoard, metric: "custom" as const },
      ]),
    ).toThrow();
  });

  it("loadRaw() rejects minLevel > maxLevel", () => {
    expect(() =>
      leaderboardsProvider.loadRaw([
        { ...validBoard, minLevel: 50, maxLevel: 10 },
      ]),
    ).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = leaderboardsProvider.loadRaw([validBoard]);
    leaderboardsProvider.unload();
    leaderboardsProvider.load(parsed);
    expect(leaderboardsProvider.isLoaded()).toBe(true);
  });

  it("hotReload() replaces the manifest", () => {
    leaderboardsProvider.loadRaw([validBoard]);
    const parsed = leaderboardsProvider.loadRaw([]);
    leaderboardsProvider.hotReload(parsed);
    expect(leaderboardsProvider.getManifest()).toEqual([]);
  });

  it("hotReload(null) clears the manifest", () => {
    leaderboardsProvider.loadRaw([validBoard]);
    leaderboardsProvider.hotReload(null);
    expect(leaderboardsProvider.isLoaded()).toBe(false);
  });

  it("unload() clears a loaded manifest", () => {
    leaderboardsProvider.loadRaw([validBoard]);
    leaderboardsProvider.unload();
    expect(leaderboardsProvider.isLoaded()).toBe(false);
  });
});
