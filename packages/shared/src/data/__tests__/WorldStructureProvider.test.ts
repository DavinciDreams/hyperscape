/**
 * Tests for the WorldStructureProvider singleton.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { worldStructureProvider } from "../WorldStructureProvider";

function getFixturePath(): string {
  const parts = __dirname.split(path.sep);
  const packagesIndex = parts.lastIndexOf("packages");
  if (packagesIndex === -1) {
    return path.resolve(
      __dirname,
      "../../../../server/world/assets/manifests/world-structure.json",
    );
  }
  const rootDir = parts.slice(0, packagesIndex + 1).join(path.sep);
  return path.resolve(
    rootDir,
    "server/world/assets/manifests/world-structure.json",
  );
}

function loadFixture(): unknown {
  return JSON.parse(readFileSync(getFixturePath(), "utf-8"));
}

beforeEach(() => {
  worldStructureProvider.unload();
});
afterEach(() => {
  worldStructureProvider.unload();
});

describe("WorldStructureProvider", () => {
  it("starts unloaded", () => {
    expect(worldStructureProvider.isLoaded()).toBe(false);
    expect(worldStructureProvider.getManifest()).toBeNull();
  });

  it("loadRaw() rejects {} baseline — all fields required", () => {
    expect(() => worldStructureProvider.loadRaw({})).toThrow();
  });

  it("loadRaw() accepts the real world-structure.json fixture", () => {
    const parsed = worldStructureProvider.loadRaw(loadFixture());
    expect(parsed.$schema).toBe("hyperforge.world-structure.v1");
    expect(parsed.constants.gridSize).toBeGreaterThan(0);
    expect(parsed.constants.waterLevel).toBeGreaterThanOrEqual(0);
  });

  it("loadRaw() rejects wrong $schema discriminator", () => {
    const raw = loadFixture() as Record<string, unknown>;
    expect(() =>
      worldStructureProvider.loadRaw({
        ...raw,
        $schema: "hyperforge.world-structure.v999",
      }),
    ).toThrow();
  });

  it("loadRaw() rejects missing constants", () => {
    const raw = loadFixture() as Record<string, unknown>;
    const { constants: _omit, ...rest } = raw;
    expect(() => worldStructureProvider.loadRaw(rest)).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = worldStructureProvider.loadRaw(loadFixture());
    worldStructureProvider.unload();
    worldStructureProvider.load(parsed);
    expect(worldStructureProvider.isLoaded()).toBe(true);
  });

  it("hotReload(null) clears the manifest", () => {
    worldStructureProvider.loadRaw(loadFixture());
    worldStructureProvider.hotReload(null);
    expect(worldStructureProvider.isLoaded()).toBe(false);
  });

  it("singleton returns the same instance", () => {
    expect(worldStructureProvider).toBe(worldStructureProvider);
  });
});
