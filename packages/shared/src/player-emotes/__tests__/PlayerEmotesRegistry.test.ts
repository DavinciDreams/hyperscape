import { PlayerEmotesManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it, vi } from "vitest";
import {
  PlayerEmotesNotLoadedError,
  PlayerEmotesRegistry,
  UnknownEmoteError,
} from "../PlayerEmotesRegistry.js";

function manifest() {
  return PlayerEmotesManifestSchema.parse({
    $schema: "hyperforge.player-emotes.v1",
    emotes: {
      IDLE: "asset://emotes/idle.glb",
      WALK: "asset://emotes/walk.glb",
      RUN: "asset://emotes/run.glb",
      WAVE: "asset://emotes/wave.glb?l=0",
    },
    essentialEmoteKeys: ["IDLE", "WALK", "RUN", "GHOST"],
  });
}

describe("PlayerEmotesRegistry — not loaded", () => {
  it("throws pre-load", () => {
    expect(() => new PlayerEmotesRegistry().manifest).toThrow(
      PlayerEmotesNotLoadedError,
    );
  });
});

describe("PlayerEmotesRegistry — lookup", () => {
  it("returns url by key", () => {
    const r = new PlayerEmotesRegistry(manifest());
    expect(r.url("IDLE")).toBe("asset://emotes/idle.glb");
    expect(r.has("WAVE")).toBe(true);
  });

  it("throws on unknown key", () => {
    const r = new PlayerEmotesRegistry(manifest());
    expect(() => r.url("GHOST")).toThrow(UnknownEmoteError);
  });
});

describe("PlayerEmotesRegistry — essentials", () => {
  it("preserves authored order", () => {
    const r = new PlayerEmotesRegistry(manifest());
    expect(r.essentialKeys()).toEqual(["IDLE", "WALK", "RUN", "GHOST"]);
  });

  it("essentialEntries skips missing keys", () => {
    const r = new PlayerEmotesRegistry(manifest());
    const entries = r.essentialEntries().map((e) => e.key);
    expect(entries).toEqual(["IDLE", "WALK", "RUN"]);
  });
});

describe("PlayerEmotesRegistry — onReloaded", () => {
  it("fires after every successful load()", () => {
    const r = new PlayerEmotesRegistry();
    const cb = vi.fn();
    r.onReloaded(cb);
    r.load(manifest());
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("returned unsubscribe stops further notifications", () => {
    const r = new PlayerEmotesRegistry();
    const cb = vi.fn();
    const off = r.onReloaded(cb);
    r.load(manifest());
    off();
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("a throwing listener does not break subsequent listeners", () => {
    const r = new PlayerEmotesRegistry();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const bad = vi.fn(() => {
      throw new Error("listener boom");
    });
    const good = vi.fn();
    r.onReloaded(bad);
    r.onReloaded(good);
    r.load(manifest());
    expect(bad).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
