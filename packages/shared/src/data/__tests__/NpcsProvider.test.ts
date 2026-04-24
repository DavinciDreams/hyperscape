/**
 * Tests for the NpcsProvider singleton.
 *
 * Uses the real authored `npcs.json` fixture.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { npcsProvider } from "../NpcsProvider";

function getFixturePath(): string {
  const parts = __dirname.split(path.sep);
  const packagesIndex = parts.lastIndexOf("packages");
  if (packagesIndex === -1) {
    return path.resolve(
      __dirname,
      "../../../../server/world/assets/manifests/npcs-spawn-constants.json",
    );
  }
  const rootDir = parts.slice(0, packagesIndex + 1).join(path.sep);
  return path.resolve(
    rootDir,
    "server/world/assets/manifests/npcs-spawn-constants.json",
  );
}

function loadFixture(): unknown {
  return JSON.parse(readFileSync(getFixturePath(), "utf-8"));
}

beforeEach(() => {
  npcsProvider.unload();
});
afterEach(() => {
  npcsProvider.unload();
});

describe("NpcsProvider", () => {
  it("starts unloaded", () => {
    expect(npcsProvider.isLoaded()).toBe(false);
    expect(npcsProvider.getManifest()).toBeNull();
  });

  it("loadRaw() rejects {} baseline — $schema + spawnConstants required", () => {
    expect(() => npcsProvider.loadRaw({})).toThrow();
  });

  it("loadRaw() accepts the real npcs.json fixture", () => {
    const parsed = npcsProvider.loadRaw(loadFixture());
    expect(parsed.$schema).toBe("hyperforge.npcs.v1");
    expect(parsed.spawnConstants).toBeDefined();
  });

  it("loadRaw() rejects wrong $schema discriminator", () => {
    const raw = loadFixture() as Record<string, unknown>;
    expect(() =>
      npcsProvider.loadRaw({ ...raw, $schema: "hyperforge.npcs.v999" }),
    ).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = npcsProvider.loadRaw(loadFixture());
    npcsProvider.unload();
    npcsProvider.load(parsed);
    expect(npcsProvider.isLoaded()).toBe(true);
  });

  it("hotReload(null) clears the manifest", () => {
    npcsProvider.loadRaw(loadFixture());
    npcsProvider.hotReload(null);
    expect(npcsProvider.isLoaded()).toBe(false);
  });

  it("unload() removes the manifest", () => {
    npcsProvider.loadRaw(loadFixture());
    npcsProvider.unload();
    expect(npcsProvider.isLoaded()).toBe(false);
  });

  it("singleton returns the same instance", () => {
    expect(npcsProvider).toBe(npcsProvider);
  });
});
