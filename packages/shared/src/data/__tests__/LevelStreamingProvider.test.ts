/**
 * Tests for the LevelStreamingProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { levelStreamingProvider } from "../LevelStreamingProvider";

beforeEach(() => {
  levelStreamingProvider.unload();
});
afterEach(() => {
  levelStreamingProvider.unload();
});

const validSublevel = {
  id: "mainCity",
  name: "Main City",
  sourcePath: "levels/mainCity.json",
  policy: "always-loaded",
};

describe("LevelStreamingProvider", () => {
  it("starts unloaded", () => {
    expect(levelStreamingProvider.isLoaded()).toBe(false);
    expect(levelStreamingProvider.getManifest()).toBeNull();
  });

  it("loadRaw() accepts empty array baseline", () => {
    const parsed = levelStreamingProvider.loadRaw([]);
    expect(parsed.length).toBe(0);
    expect(levelStreamingProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() accepts a valid sublevel", () => {
    const parsed = levelStreamingProvider.loadRaw([validSublevel]);
    expect(parsed.length).toBe(1);
    expect(parsed[0]!.id).toBe("mainCity");
  });

  it("loadRaw() rejects duplicate sublevel ids", () => {
    expect(() =>
      levelStreamingProvider.loadRaw([validSublevel, { ...validSublevel }]),
    ).toThrow();
  });

  it("loadRaw() rejects dependsOn pointing at missing sublevel", () => {
    expect(() =>
      levelStreamingProvider.loadRaw([
        { ...validSublevel, dependsOn: ["ghost"] },
      ]),
    ).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = levelStreamingProvider.loadRaw([validSublevel]);
    levelStreamingProvider.unload();
    levelStreamingProvider.load(parsed);
    expect(levelStreamingProvider.isLoaded()).toBe(true);
  });

  it("hotReload(null) clears the manifest", () => {
    levelStreamingProvider.loadRaw([validSublevel]);
    levelStreamingProvider.hotReload(null);
    expect(levelStreamingProvider.isLoaded()).toBe(false);
  });

  it("unload() clears a loaded manifest", () => {
    levelStreamingProvider.loadRaw([validSublevel]);
    levelStreamingProvider.unload();
    expect(levelStreamingProvider.isLoaded()).toBe(false);
  });

  it("singleton returns the same instance", () => {
    expect(levelStreamingProvider).toBe(levelStreamingProvider);
  });
});
