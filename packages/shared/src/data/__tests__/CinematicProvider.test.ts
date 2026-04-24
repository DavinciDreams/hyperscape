/**
 * Tests for the CinematicProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { cinematicProvider } from "../CinematicProvider";

beforeEach(() => {
  cinematicProvider.unload();
});
afterEach(() => {
  cinematicProvider.unload();
});

const validCinematic = {
  id: "introCutscene",
  name: "Intro Cutscene",
  durationSec: 5,
  tracks: [
    {
      kind: "event",
      id: "startEvent",
      events: [{ time: 0, event: "cinematic.intro.start" }],
    },
  ],
};

describe("CinematicProvider", () => {
  it("starts unloaded", () => {
    expect(cinematicProvider.isLoaded()).toBe(false);
    expect(cinematicProvider.getManifest()).toBeNull();
  });

  it("loadRaw() accepts empty array baseline", () => {
    const parsed = cinematicProvider.loadRaw([]);
    expect(parsed.length).toBe(0);
    expect(cinematicProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() accepts a valid cinematic", () => {
    const parsed = cinematicProvider.loadRaw([validCinematic]);
    expect(parsed.length).toBe(1);
    expect(parsed[0]!.id).toBe("introCutscene");
  });

  it("loadRaw() rejects duplicate cinematic ids", () => {
    expect(() =>
      cinematicProvider.loadRaw([validCinematic, { ...validCinematic }]),
    ).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = cinematicProvider.loadRaw([validCinematic]);
    cinematicProvider.unload();
    cinematicProvider.load(parsed);
    expect(cinematicProvider.isLoaded()).toBe(true);
  });

  it("hotReload(null) clears the manifest", () => {
    cinematicProvider.loadRaw([validCinematic]);
    cinematicProvider.hotReload(null);
    expect(cinematicProvider.isLoaded()).toBe(false);
  });

  it("unload() clears a loaded manifest", () => {
    cinematicProvider.loadRaw([validCinematic]);
    cinematicProvider.unload();
    expect(cinematicProvider.isLoaded()).toBe(false);
  });

  it("singleton returns the same instance", () => {
    expect(cinematicProvider).toBe(cinematicProvider);
  });
});
