/**
 * Tests for the FishingProvider singleton.
 *
 * Uses the real authored `gathering/fishing.json` fixture —
 * schema requires a nonempty `spots` array so no safe baseline.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { fishingProvider } from "../FishingProvider";

function getFixturePath(): string {
  const parts = __dirname.split(path.sep);
  const packagesIndex = parts.lastIndexOf("packages");
  if (packagesIndex === -1) {
    return path.resolve(
      __dirname,
      "../../../../server/world/assets/manifests/gathering/fishing.json",
    );
  }
  const rootDir = parts.slice(0, packagesIndex + 1).join(path.sep);
  return path.resolve(
    rootDir,
    "server/world/assets/manifests/gathering/fishing.json",
  );
}

function loadFixture(): unknown {
  return JSON.parse(readFileSync(getFixturePath(), "utf-8"));
}

beforeEach(() => {
  fishingProvider.unload();
});
afterEach(() => {
  fishingProvider.unload();
});

describe("FishingProvider", () => {
  it("starts unloaded", () => {
    expect(fishingProvider.isLoaded()).toBe(false);
    expect(fishingProvider.getManifest()).toBeNull();
  });

  it("loadRaw() rejects {} baseline — spots required", () => {
    expect(() => fishingProvider.loadRaw({})).toThrow();
  });

  it("loadRaw() rejects empty spots array", () => {
    expect(() => fishingProvider.loadRaw({ spots: [] })).toThrow();
  });

  it("loadRaw() accepts the real fishing.json fixture", () => {
    const parsed = fishingProvider.loadRaw(loadFixture());
    expect(parsed.spots.length).toBeGreaterThan(0);
    expect(parsed.spots[0].harvestSkill).toBe("fishing");
  });

  it("loadRaw() rejects non-array spots", () => {
    expect(() => fishingProvider.loadRaw({ spots: "not-an-array" })).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = fishingProvider.loadRaw(loadFixture());
    fishingProvider.unload();
    fishingProvider.load(parsed);
    expect(fishingProvider.isLoaded()).toBe(true);
    expect(fishingProvider.getManifest()?.spots.length).toBe(
      parsed.spots.length,
    );
  });

  it("hotReload(null) clears the manifest", () => {
    fishingProvider.loadRaw(loadFixture());
    fishingProvider.hotReload(null);
    expect(fishingProvider.isLoaded()).toBe(false);
  });

  it("singleton returns the same instance", () => {
    expect(fishingProvider).toBe(fishingProvider);
  });
});
