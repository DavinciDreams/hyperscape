/**
 * Tests for the SeasonsProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { seasonsProvider } from "../SeasonsProvider";

beforeEach(() => {
  seasonsProvider.unload();
});
afterEach(() => {
  seasonsProvider.unload();
});

const validSeason = {
  id: "seasonOne",
  name: "Season One: Rift",
  startsAt: "2026-05-01T00:00:00Z",
  endsAt: "2026-08-01T00:00:00Z",
  tracks: [
    {
      id: "freeTrack",
      name: "Free Track",
      kind: "free" as const,
      tiers: [
        {
          tier: 1,
          xpRequired: 1000,
          rewardItemId: "seasonOneHelm",
        },
      ],
    },
  ],
};

describe("SeasonsProvider", () => {
  it("starts unloaded", () => {
    expect(seasonsProvider.isLoaded()).toBe(false);
    expect(seasonsProvider.getManifest()).toBeNull();
  });

  it("loadRaw() accepts empty array baseline", () => {
    const parsed = seasonsProvider.loadRaw([]);
    expect(parsed).toEqual([]);
    expect(seasonsProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() accepts valid season", () => {
    const parsed = seasonsProvider.loadRaw([validSeason]);
    expect(parsed.length).toBe(1);
    expect(parsed[0].id).toBe("seasonOne");
  });

  it("loadRaw() rejects duplicate season ids", () => {
    expect(() =>
      seasonsProvider.loadRaw([validSeason, { ...validSeason, name: "Dup" }]),
    ).toThrow();
  });

  it("loadRaw() rejects startsAt >= endsAt", () => {
    expect(() =>
      seasonsProvider.loadRaw([
        {
          ...validSeason,
          startsAt: "2026-08-01T00:00:00Z",
          endsAt: "2026-05-01T00:00:00Z",
        },
      ]),
    ).toThrow();
  });

  it("loadRaw() rejects season without free track", () => {
    expect(() =>
      seasonsProvider.loadRaw([
        {
          ...validSeason,
          tracks: [
            {
              id: "premiumOnly",
              name: "Premium",
              kind: "premium" as const,
              tiers: [{ tier: 1, xpRequired: 1000, rewardItemId: "x" }],
            },
          ],
        },
      ]),
    ).toThrow();
  });

  it("loadRaw() rejects overlapping season windows", () => {
    const second = {
      ...validSeason,
      id: "seasonTwo",
      startsAt: "2026-07-01T00:00:00Z",
      endsAt: "2026-10-01T00:00:00Z",
    };
    expect(() => seasonsProvider.loadRaw([validSeason, second])).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = seasonsProvider.loadRaw([validSeason]);
    seasonsProvider.unload();
    seasonsProvider.load(parsed);
    expect(seasonsProvider.isLoaded()).toBe(true);
  });

  it("hotReload() replaces the manifest", () => {
    seasonsProvider.loadRaw([validSeason]);
    const parsed = seasonsProvider.loadRaw([]);
    seasonsProvider.hotReload(parsed);
    expect(seasonsProvider.getManifest()).toEqual([]);
  });

  it("hotReload(null) clears the manifest", () => {
    seasonsProvider.loadRaw([validSeason]);
    seasonsProvider.hotReload(null);
    expect(seasonsProvider.isLoaded()).toBe(false);
  });

  it("unload() clears a loaded manifest", () => {
    seasonsProvider.loadRaw([validSeason]);
    seasonsProvider.unload();
    expect(seasonsProvider.isLoaded()).toBe(false);
  });
});
