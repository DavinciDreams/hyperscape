/**
 * Tests for the MiningProvider singleton.
 *
 * Uses the real authored `gathering/mining.json` fixture —
 * schema requires a nonempty `rocks` array so no safe baseline.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { miningProvider } from "../MiningProvider";

function getFixturePath(): string {
  const parts = __dirname.split(path.sep);
  const packagesIndex = parts.lastIndexOf("packages");
  if (packagesIndex === -1) {
    return path.resolve(
      __dirname,
      "../../../../server/world/assets/manifests/gathering/mining.json",
    );
  }
  const rootDir = parts.slice(0, packagesIndex + 1).join(path.sep);
  return path.resolve(
    rootDir,
    "server/world/assets/manifests/gathering/mining.json",
  );
}

function loadFixture(): unknown {
  return JSON.parse(readFileSync(getFixturePath(), "utf-8"));
}

beforeEach(() => {
  miningProvider.unload();
});
afterEach(() => {
  miningProvider.unload();
});

describe("MiningProvider", () => {
  it("starts unloaded", () => {
    expect(miningProvider.isLoaded()).toBe(false);
    expect(miningProvider.getManifest()).toBeNull();
  });

  it("loadRaw() rejects {} baseline — rocks required", () => {
    expect(() => miningProvider.loadRaw({})).toThrow();
  });

  it("loadRaw() rejects empty rocks array", () => {
    expect(() => miningProvider.loadRaw({ rocks: [] })).toThrow();
  });

  it("loadRaw() accepts the real mining.json fixture", () => {
    const parsed = miningProvider.loadRaw(loadFixture());
    expect(parsed.rocks.length).toBeGreaterThan(0);
    expect(parsed.rocks[0].harvestSkill).toBe("mining");
  });

  it("loadRaw() rejects non-array rocks", () => {
    expect(() => miningProvider.loadRaw({ rocks: "not-an-array" })).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = miningProvider.loadRaw(loadFixture());
    miningProvider.unload();
    miningProvider.load(parsed);
    expect(miningProvider.isLoaded()).toBe(true);
    expect(miningProvider.getManifest()?.rocks.length).toBe(
      parsed.rocks.length,
    );
  });

  it("hotReload(null) clears the manifest", () => {
    miningProvider.loadRaw(loadFixture());
    miningProvider.hotReload(null);
    expect(miningProvider.isLoaded()).toBe(false);
  });

  it("singleton returns the same instance", () => {
    expect(miningProvider).toBe(miningProvider);
  });
});
