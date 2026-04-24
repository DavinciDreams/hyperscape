/**
 * Tests for the GatheringProvider singleton.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { gatheringProvider } from "../GatheringProvider";

function getFixturePath(): string {
  const parts = __dirname.split(path.sep);
  const packagesIndex = parts.lastIndexOf("packages");
  if (packagesIndex === -1) {
    return path.resolve(
      __dirname,
      "../../../../server/world/assets/manifests/gathering-constants.json",
    );
  }
  const rootDir = parts.slice(0, packagesIndex + 1).join(path.sep);
  return path.resolve(
    rootDir,
    "server/world/assets/manifests/gathering-constants.json",
  );
}

function loadFixture(): unknown {
  return JSON.parse(readFileSync(getFixturePath(), "utf-8"));
}

beforeEach(() => {
  gatheringProvider.unload();
});
afterEach(() => {
  gatheringProvider.unload();
});

describe("GatheringProvider", () => {
  it("starts unloaded", () => {
    expect(gatheringProvider.isLoaded()).toBe(false);
    expect(gatheringProvider.getManifest()).toBeNull();
  });

  it("loadRaw() rejects {} baseline — all fields required", () => {
    expect(() => gatheringProvider.loadRaw({})).toThrow();
  });

  it("loadRaw() accepts the real gathering-constants.json fixture", () => {
    const parsed = gatheringProvider.loadRaw(loadFixture());
    expect(parsed.$schema).toBe("hyperforge.gathering.v1");
    expect(parsed.skillMechanics.woodcutting.baseRollTicks).toBeGreaterThan(0);
    expect(parsed.ranges.gatheringRange).toBeGreaterThan(0);
  });

  it("loadRaw() rejects wrong $schema discriminator", () => {
    const raw = loadFixture() as Record<string, unknown>;
    expect(() =>
      gatheringProvider.loadRaw({
        ...raw,
        $schema: "hyperforge.gathering.v999",
      }),
    ).toThrow();
  });

  it("loadRaw() rejects invalid skill mechanics type", () => {
    const raw = loadFixture() as Record<string, unknown>;
    const mechanics = raw.skillMechanics as Record<string, unknown>;
    const wc = mechanics.woodcutting as Record<string, unknown>;
    expect(() =>
      gatheringProvider.loadRaw({
        ...raw,
        skillMechanics: {
          ...mechanics,
          woodcutting: { ...wc, type: "made-up-type" },
        },
      }),
    ).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = gatheringProvider.loadRaw(loadFixture());
    gatheringProvider.unload();
    gatheringProvider.load(parsed);
    expect(gatheringProvider.isLoaded()).toBe(true);
  });

  it("hotReload(null) clears the manifest", () => {
    gatheringProvider.loadRaw(loadFixture());
    gatheringProvider.hotReload(null);
    expect(gatheringProvider.isLoaded()).toBe(false);
  });

  it("singleton returns the same instance", () => {
    expect(gatheringProvider).toBe(gatheringProvider);
  });
});
