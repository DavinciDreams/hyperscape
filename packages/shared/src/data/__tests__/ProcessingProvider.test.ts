/**
 * Tests for the ProcessingProvider singleton.
 *
 * Note: Distinct from ProcessingDataProvider (per-recipe registries).
 * This wraps the processing-mechanics constants manifest.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { processingProvider } from "../ProcessingProvider";

function getFixturePath(): string {
  const parts = __dirname.split(path.sep);
  const packagesIndex = parts.lastIndexOf("packages");
  if (packagesIndex === -1) {
    return path.resolve(
      __dirname,
      "../../../../server/world/assets/manifests/processing-constants.json",
    );
  }
  const rootDir = parts.slice(0, packagesIndex + 1).join(path.sep);
  return path.resolve(
    rootDir,
    "server/world/assets/manifests/processing-constants.json",
  );
}

function loadFixture(): unknown {
  return JSON.parse(readFileSync(getFixturePath(), "utf-8"));
}

beforeEach(() => {
  processingProvider.unload();
});
afterEach(() => {
  processingProvider.unload();
});

describe("ProcessingProvider", () => {
  it("starts unloaded", () => {
    expect(processingProvider.isLoaded()).toBe(false);
    expect(processingProvider.getManifest()).toBeNull();
  });

  it("loadRaw() rejects {} baseline — all fields required", () => {
    expect(() => processingProvider.loadRaw({})).toThrow();
  });

  it("loadRaw() accepts the real processing-constants.json fixture", () => {
    const parsed = processingProvider.loadRaw(loadFixture());
    expect(parsed.$schema).toBe("hyperforge.processing.v1");
    expect(parsed.skillMechanics.firemaking.baseRollTicks).toBeGreaterThan(0);
    expect(parsed.fire.maxFiresPerPlayer).toBeGreaterThan(0);
  });

  it("loadRaw() rejects wrong $schema discriminator", () => {
    const raw = loadFixture() as Record<string, unknown>;
    expect(() =>
      processingProvider.loadRaw({
        ...raw,
        $schema: "hyperforge.processing.v999",
      }),
    ).toThrow();
  });

  it("loadRaw() rejects invalid fire-walk priority direction", () => {
    const raw = loadFixture() as Record<string, unknown>;
    expect(() =>
      processingProvider.loadRaw({
        ...raw,
        fireWalkPriority: ["north", "northeast"],
      }),
    ).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = processingProvider.loadRaw(loadFixture());
    processingProvider.unload();
    processingProvider.load(parsed);
    expect(processingProvider.isLoaded()).toBe(true);
  });

  it("hotReload(null) clears the manifest", () => {
    processingProvider.loadRaw(loadFixture());
    processingProvider.hotReload(null);
    expect(processingProvider.isLoaded()).toBe(false);
  });

  it("singleton returns the same instance", () => {
    expect(processingProvider).toBe(processingProvider);
  });
});
