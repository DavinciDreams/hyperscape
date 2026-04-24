/**
 * Tests for the PlayerEmotesProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { playerEmotesProvider } from "../PlayerEmotesProvider";

beforeEach(() => {
  playerEmotesProvider.unload();
});
afterEach(() => {
  playerEmotesProvider.unload();
});

const baseline = {
  $schema: "hyperforge.player-emotes.v1" as const,
  emotes: {
    IDLE: "asset://emotes/idle.glb",
    WALK: "asset://emotes/walk.glb",
    RUN: "asset://emotes/run.glb?s=1.25",
  },
  essentialEmoteKeys: ["IDLE", "WALK"],
};

describe("PlayerEmotesProvider", () => {
  it("starts unloaded", () => {
    expect(playerEmotesProvider.isLoaded()).toBe(false);
    expect(playerEmotesProvider.getManifest()).toBeNull();
  });

  it("loadRaw() rejects {} baseline — $schema/emotes/essentialEmoteKeys required", () => {
    expect(() => playerEmotesProvider.loadRaw({})).toThrow();
  });

  it("loadRaw() rejects empty essentialEmoteKeys array", () => {
    expect(() =>
      playerEmotesProvider.loadRaw({
        ...baseline,
        essentialEmoteKeys: [],
      }),
    ).toThrow();
  });

  it("loadRaw() accepts a minimal valid manifest", () => {
    const parsed = playerEmotesProvider.loadRaw(baseline);
    expect(parsed.$schema).toBe("hyperforge.player-emotes.v1");
    expect(parsed.emotes.IDLE).toBe("asset://emotes/idle.glb");
    expect(parsed.essentialEmoteKeys).toContain("IDLE");
  });

  it("loadRaw() rejects empty-string url value", () => {
    expect(() =>
      playerEmotesProvider.loadRaw({
        ...baseline,
        emotes: { ...baseline.emotes, BROKEN: "" },
      }),
    ).toThrow();
  });

  it("loadRaw() accepts query-param-bearing URLs", () => {
    const parsed = playerEmotesProvider.loadRaw({
      ...baseline,
      emotes: {
        ...baseline.emotes,
        WAVE: "asset://emotes/wave.glb?l=0&s=0.75",
      },
    });
    expect(parsed.emotes.WAVE).toBe("asset://emotes/wave.glb?l=0&s=0.75");
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = playerEmotesProvider.loadRaw(baseline);
    playerEmotesProvider.unload();
    playerEmotesProvider.load(parsed);
    expect(playerEmotesProvider.isLoaded()).toBe(true);
  });

  it("hotReload(null) clears the manifest", () => {
    playerEmotesProvider.loadRaw(baseline);
    playerEmotesProvider.hotReload(null);
    expect(playerEmotesProvider.isLoaded()).toBe(false);
  });

  it("singleton returns the same instance", () => {
    expect(playerEmotesProvider).toBe(playerEmotesProvider);
  });
});
