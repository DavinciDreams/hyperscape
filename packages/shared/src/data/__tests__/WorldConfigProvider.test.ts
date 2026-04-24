/**
 * Tests for the WorldConfigProvider singleton.
 *
 * Uses the real authored `world-config.json` fixture —
 * schema requires terrain block so no safe baseline.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { worldConfigProvider } from "../WorldConfigProvider";

function getFixturePath(): string {
  const parts = __dirname.split(path.sep);
  const packagesIndex = parts.lastIndexOf("packages");
  if (packagesIndex === -1) {
    return path.resolve(
      __dirname,
      "../../../../server/world/assets/manifests/world-config.json",
    );
  }
  const rootDir = parts.slice(0, packagesIndex + 1).join(path.sep);
  return path.resolve(
    rootDir,
    "server/world/assets/manifests/world-config.json",
  );
}

function loadFixture(): unknown {
  return JSON.parse(readFileSync(getFixturePath(), "utf-8"));
}

beforeEach(() => {
  worldConfigProvider.unload();
});
afterEach(() => {
  worldConfigProvider.unload();
});

describe("WorldConfigProvider", () => {
  it("starts unloaded", () => {
    expect(worldConfigProvider.isLoaded()).toBe(false);
    expect(worldConfigProvider.getManifest()).toBeNull();
  });

  it("loadRaw() rejects {} baseline — terrain required", () => {
    expect(() => worldConfigProvider.loadRaw({})).toThrow();
  });

  it("loadRaw() accepts the real world-config.json fixture", () => {
    const parsed = worldConfigProvider.loadRaw(loadFixture());
    expect(parsed.terrain.worldSize).toBeGreaterThan(0);
    expect(parsed.terrain.tileSize).toBeGreaterThan(0);
  });

  it("loadRaw() rejects worldSize <= 0", () => {
    const raw = loadFixture() as { terrain: Record<string, unknown> };
    expect(() =>
      worldConfigProvider.loadRaw({
        ...raw,
        terrain: { ...raw.terrain, worldSize: 0 },
      }),
    ).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = worldConfigProvider.loadRaw(loadFixture());
    worldConfigProvider.unload();
    worldConfigProvider.load(parsed);
    expect(worldConfigProvider.isLoaded()).toBe(true);
  });

  it("hotReload(null) clears the manifest", () => {
    worldConfigProvider.loadRaw(loadFixture());
    worldConfigProvider.hotReload(null);
    expect(worldConfigProvider.isLoaded()).toBe(false);
  });

  it("unload() removes the manifest", () => {
    worldConfigProvider.loadRaw(loadFixture());
    worldConfigProvider.unload();
    expect(worldConfigProvider.isLoaded()).toBe(false);
  });

  it("singleton returns the same instance", () => {
    expect(worldConfigProvider).toBe(worldConfigProvider);
  });
});
