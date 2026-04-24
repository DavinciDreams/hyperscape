/**
 * Tests for the AudioBusMixProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { audioBusMixProvider } from "../AudioBusMixProvider";

beforeEach(() => {
  audioBusMixProvider.unload();
});
afterEach(() => {
  audioBusMixProvider.unload();
});

const validManifest = {
  masterVolumeDb: 0,
  buses: [
    { id: "master", name: "Master" },
    { id: "music", name: "Music", parent: "master", volumeDb: -3 },
    { id: "sfx", name: "SFX", parent: "master" },
    { id: "ui", name: "UI", parent: "master", volumeDb: -6 },
  ],
  duckRules: [{ trigger: "sfx", target: "music", attenuationToLinear: 0.3 }],
};

describe("AudioBusMixProvider", () => {
  it("starts unloaded", () => {
    expect(audioBusMixProvider.isLoaded()).toBe(false);
    expect(audioBusMixProvider.getManifest()).toBeNull();
  });

  it("loadRaw() accepts a valid manifest and fills defaults", () => {
    const parsed = audioBusMixProvider.loadRaw(validManifest);
    expect(parsed.buses.length).toBe(4);
    expect(parsed.buses[0].parent).toBe("");
    expect(parsed.buses[0].volumeDb).toBe(0);
    expect(parsed.buses[0].muted).toBe(false);
    expect(parsed.duckRules[0].attackSec).toBe(0.1);
    expect(audioBusMixProvider.isLoaded()).toBe(true);
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = audioBusMixProvider.loadRaw(validManifest);
    audioBusMixProvider.unload();
    audioBusMixProvider.load(parsed);
    expect(audioBusMixProvider.isLoaded()).toBe(true);
    expect(audioBusMixProvider.getManifest()?.buses.length).toBe(4);
  });

  it("loadRaw() rejects empty buses array (min 1)", () => {
    expect(() => audioBusMixProvider.loadRaw({ buses: [] })).toThrow();
    expect(audioBusMixProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects duplicate bus ids", () => {
    const bad = {
      buses: [
        { id: "x", name: "A" },
        { id: "x", name: "B" },
      ],
    };
    expect(() => audioBusMixProvider.loadRaw(bad)).toThrow();
    expect(audioBusMixProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects a bus referencing its own id as parent", () => {
    const bad = {
      buses: [{ id: "loop", name: "Loop", parent: "loop" }],
    };
    expect(() => audioBusMixProvider.loadRaw(bad)).toThrow();
    expect(audioBusMixProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects a parent that doesn't resolve", () => {
    const bad = {
      buses: [{ id: "orphan", name: "Orphan", parent: "ghost" }],
    };
    expect(() => audioBusMixProvider.loadRaw(bad)).toThrow();
    expect(audioBusMixProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects a cyclic bus graph", () => {
    const bad = {
      buses: [
        { id: "a", name: "A", parent: "b" },
        { id: "b", name: "B", parent: "a" },
      ],
    };
    expect(() => audioBusMixProvider.loadRaw(bad)).toThrow();
    expect(audioBusMixProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects duck rule referencing missing bus", () => {
    const bad = {
      buses: [{ id: "master", name: "Master" }],
      duckRules: [{ trigger: "ghost", target: "master" }],
    };
    expect(() => audioBusMixProvider.loadRaw(bad)).toThrow();
    expect(audioBusMixProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects duck rule with trigger === target", () => {
    const bad = {
      buses: [{ id: "master", name: "Master" }],
      duckRules: [{ trigger: "master", target: "master" }],
    };
    expect(() => audioBusMixProvider.loadRaw(bad)).toThrow();
    expect(audioBusMixProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects duplicate (trigger,target) duck pairs", () => {
    const bad = {
      buses: [
        { id: "a", name: "A" },
        { id: "b", name: "B" },
      ],
      duckRules: [
        { trigger: "a", target: "b" },
        { trigger: "a", target: "b" },
      ],
    };
    expect(() => audioBusMixProvider.loadRaw(bad)).toThrow();
    expect(audioBusMixProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects volumeDb out of range", () => {
    const bad = {
      buses: [{ id: "loud", name: "Loud", volumeDb: 200 }],
    };
    expect(() => audioBusMixProvider.loadRaw(bad)).toThrow();
    expect(audioBusMixProvider.isLoaded()).toBe(false);
  });

  it("hotReload(manifest) replaces the current manifest", () => {
    audioBusMixProvider.loadRaw(validManifest);
    const replacement = audioBusMixProvider.loadRaw({
      buses: [{ id: "only", name: "Only" }],
    });
    audioBusMixProvider.hotReload(replacement);
    expect(audioBusMixProvider.getManifest()?.buses.length).toBe(1);
    expect(audioBusMixProvider.getManifest()?.buses[0].id).toBe("only");
  });

  it("hotReload(null) clears", () => {
    audioBusMixProvider.loadRaw(validManifest);
    audioBusMixProvider.hotReload(null);
    expect(audioBusMixProvider.isLoaded()).toBe(false);
  });

  it("unload() resets", () => {
    audioBusMixProvider.loadRaw(validManifest);
    audioBusMixProvider.unload();
    expect(audioBusMixProvider.isLoaded()).toBe(false);
    expect(audioBusMixProvider.getManifest()).toBeNull();
  });
});
