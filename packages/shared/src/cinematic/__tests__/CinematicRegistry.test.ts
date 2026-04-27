import { CinematicManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it, vi } from "vitest";
import {
  CinematicNotLoadedError,
  CinematicRegistry,
  UnknownCinematicError,
  UnknownCinematicTrackError,
} from "../CinematicRegistry.js";

const Q0 = { x: 0, y: 0, z: 0, w: 1 };
const V0 = { x: 0, y: 0, z: 0 };

function manifest() {
  return CinematicManifestSchema.parse([
    {
      id: "intro",
      name: "Opening Intro",
      durationSec: 10,
      tracks: [
        {
          kind: "camera",
          id: "cam-main",
          keyframes: [
            { time: 0, position: V0, rotation: Q0 },
            { time: 5, position: { x: 1, y: 0, z: 0 }, rotation: Q0 },
          ],
        },
        {
          kind: "event",
          id: "evt-fx",
          events: [
            { time: 0, event: "fade.in" },
            { time: 9, event: "fade.out" },
          ],
        },
        {
          kind: "audio",
          id: "aud-music",
          clips: [{ time: 0, assetId: "music.intro" }],
        },
      ],
    },
    {
      id: "boss",
      name: "Boss Reveal",
      durationSec: 4,
      tracks: [
        {
          kind: "dialogue",
          id: "dlg-taunt",
          events: [{ time: 0.5, dialogueId: "boss.greeting" }],
        },
      ],
    },
  ]);
}

describe("CinematicRegistry", () => {
  it("throws pre-load", () => {
    expect(() => new CinematicRegistry().manifest).toThrow(
      CinematicNotLoadedError,
    );
  });

  it("has + get + all", () => {
    const r = new CinematicRegistry(manifest());
    expect(r.has("intro")).toBe(true);
    expect(r.has("ghost")).toBe(false);
    expect(r.get("boss").name).toBe("Boss Reveal");
    expect(r.all.map((c) => c.id)).toEqual(["intro", "boss"]);
    expect(() => r.get("ghost")).toThrow(UnknownCinematicError);
  });

  it("track lookup throws on unknown id", () => {
    const r = new CinematicRegistry(manifest());
    expect(r.track("intro", "cam-main").kind).toBe("camera");
    expect(() => r.track("intro", "ghost")).toThrow(UnknownCinematicTrackError);
    expect(() => r.track("ghost", "cam-main")).toThrow(UnknownCinematicError);
  });

  it("tracksOfKind filters by discriminant", () => {
    const r = new CinematicRegistry(manifest());
    const cams = r.tracksOfKind("intro", "camera");
    expect(cams).toHaveLength(1);
    expect(cams[0].keyframes).toHaveLength(2);
    expect(r.tracksOfKind("intro", "audio")).toHaveLength(1);
    expect(r.tracksOfKind("intro", "entity-pose")).toEqual([]);
    expect(r.tracksOfKind("boss", "dialogue")).toHaveLength(1);
  });

  it("durationOf returns the cinematic duration", () => {
    const r = new CinematicRegistry(manifest());
    expect(r.durationOf("intro")).toBe(10);
    expect(r.durationOf("boss")).toBe(4);
  });
});

describe("CinematicRegistry — onReloaded", () => {
  it("fires after every successful load()", () => {
    const r = new CinematicRegistry();
    const cb = vi.fn();
    r.onReloaded(cb);
    r.load(manifest());
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("returned unsubscribe stops further notifications", () => {
    const r = new CinematicRegistry();
    const cb = vi.fn();
    const off = r.onReloaded(cb);
    r.load(manifest());
    off();
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("a throwing listener does not break subsequent listeners", () => {
    const r = new CinematicRegistry();
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
