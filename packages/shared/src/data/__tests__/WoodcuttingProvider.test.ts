/**
 * Tests for the WoodcuttingProvider singleton.
 *
 * Uses the real authored `gathering/woodcutting.json` fixture —
 * schema requires a nonempty `trees` array so no safe baseline.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { woodcuttingProvider } from "../WoodcuttingProvider";

function getFixturePath(): string {
  const parts = __dirname.split(path.sep);
  const packagesIndex = parts.lastIndexOf("packages");
  if (packagesIndex === -1) {
    return path.resolve(
      __dirname,
      "../../../../server/world/assets/manifests/gathering/woodcutting.json",
    );
  }
  const rootDir = parts.slice(0, packagesIndex + 1).join(path.sep);
  return path.resolve(
    rootDir,
    "server/world/assets/manifests/gathering/woodcutting.json",
  );
}

function loadFixture(): unknown {
  return JSON.parse(readFileSync(getFixturePath(), "utf-8"));
}

beforeEach(() => {
  woodcuttingProvider.unload();
});
afterEach(() => {
  woodcuttingProvider.unload();
});

describe("WoodcuttingProvider", () => {
  it("starts unloaded", () => {
    expect(woodcuttingProvider.isLoaded()).toBe(false);
    expect(woodcuttingProvider.getManifest()).toBeNull();
  });

  it("loadRaw() rejects {} baseline — trees required", () => {
    expect(() => woodcuttingProvider.loadRaw({})).toThrow();
  });

  it("loadRaw() rejects empty trees array", () => {
    expect(() => woodcuttingProvider.loadRaw({ trees: [] })).toThrow();
  });

  it("loadRaw() accepts the real woodcutting.json fixture", () => {
    const parsed = woodcuttingProvider.loadRaw(loadFixture());
    expect(parsed.trees.length).toBeGreaterThan(0);
    expect(parsed.trees[0].harvestSkill).toBe("woodcutting");
  });

  it("loadRaw() rejects non-array trees", () => {
    expect(() =>
      woodcuttingProvider.loadRaw({ trees: "not-an-array" }),
    ).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = woodcuttingProvider.loadRaw(loadFixture());
    woodcuttingProvider.unload();
    woodcuttingProvider.load(parsed);
    expect(woodcuttingProvider.isLoaded()).toBe(true);
    expect(woodcuttingProvider.getManifest()?.trees.length).toBe(
      parsed.trees.length,
    );
  });

  it("hotReload(null) clears the manifest", () => {
    woodcuttingProvider.loadRaw(loadFixture());
    woodcuttingProvider.hotReload(null);
    expect(woodcuttingProvider.isLoaded()).toBe(false);
  });

  it("singleton returns the same instance", () => {
    expect(woodcuttingProvider).toBe(woodcuttingProvider);
  });
});
