/**
 * Tests for the GameProvider singleton.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { gameProvider } from "../GameProvider";

function getFixturePath(): string {
  const parts = __dirname.split(path.sep);
  const packagesIndex = parts.lastIndexOf("packages");
  if (packagesIndex === -1) {
    return path.resolve(
      __dirname,
      "../../../../server/world/assets/manifests/game-constants.json",
    );
  }
  const rootDir = parts.slice(0, packagesIndex + 1).join(path.sep);
  return path.resolve(
    rootDir,
    "server/world/assets/manifests/game-constants.json",
  );
}

function loadFixture(): unknown {
  return JSON.parse(readFileSync(getFixturePath(), "utf-8"));
}

beforeEach(() => {
  gameProvider.unload();
});
afterEach(() => {
  gameProvider.unload();
});

describe("GameProvider", () => {
  it("starts unloaded", () => {
    expect(gameProvider.isLoaded()).toBe(false);
    expect(gameProvider.getManifest()).toBeNull();
  });

  it("loadRaw() rejects {} baseline — all fields required", () => {
    expect(() => gameProvider.loadRaw({})).toThrow();
  });

  it("loadRaw() accepts the real game-constants.json fixture", () => {
    const parsed = gameProvider.loadRaw(loadFixture());
    expect(parsed.$schema).toBe("hyperforge.game.v1");
    expect(parsed.inventory.maxInventorySlots).toBeGreaterThan(0);
    expect(parsed.player.defaultMaxHealth).toBeGreaterThan(0);
  });

  it("loadRaw() rejects wrong $schema discriminator", () => {
    const raw = loadFixture() as Record<string, unknown>;
    expect(() =>
      gameProvider.loadRaw({ ...raw, $schema: "hyperforge.game.v999" }),
    ).toThrow();
  });

  it("loadRaw() rejects negative inventory size", () => {
    const raw = loadFixture() as Record<string, unknown>;
    const inv = raw.inventory as Record<string, unknown>;
    expect(() =>
      gameProvider.loadRaw({
        ...raw,
        inventory: { ...inv, maxInventorySlots: -5 },
      }),
    ).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = gameProvider.loadRaw(loadFixture());
    gameProvider.unload();
    gameProvider.load(parsed);
    expect(gameProvider.isLoaded()).toBe(true);
  });

  it("hotReload(null) clears the manifest", () => {
    gameProvider.loadRaw(loadFixture());
    gameProvider.hotReload(null);
    expect(gameProvider.isLoaded()).toBe(false);
  });

  it("singleton returns the same instance", () => {
    expect(gameProvider).toBe(gameProvider);
  });
});
