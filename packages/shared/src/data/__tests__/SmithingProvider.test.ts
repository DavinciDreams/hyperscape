/**
 * Tests for the SmithingProvider singleton.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { smithingProvider } from "../SmithingProvider";

function getFixturePath(): string {
  const parts = __dirname.split(path.sep);
  const packagesIndex = parts.lastIndexOf("packages");
  if (packagesIndex === -1) {
    return path.resolve(
      __dirname,
      "../../../../server/world/assets/manifests/smithing-constants.json",
    );
  }
  const rootDir = parts.slice(0, packagesIndex + 1).join(path.sep);
  return path.resolve(
    rootDir,
    "server/world/assets/manifests/smithing-constants.json",
  );
}

function loadFixture(): unknown {
  return JSON.parse(readFileSync(getFixturePath(), "utf-8"));
}

beforeEach(() => {
  smithingProvider.unload();
});
afterEach(() => {
  smithingProvider.unload();
});

describe("SmithingProvider", () => {
  it("starts unloaded", () => {
    expect(smithingProvider.isLoaded()).toBe(false);
    expect(smithingProvider.getManifest()).toBeNull();
  });

  it("loadRaw() rejects {} baseline — all fields required", () => {
    expect(() => smithingProvider.loadRaw({})).toThrow();
  });

  it("loadRaw() accepts the real smithing-constants.json fixture", () => {
    const parsed = smithingProvider.loadRaw(loadFixture());
    expect(parsed.$schema).toBe("hyperforge.smithing.v1");
    expect(parsed.items.hammerItemId).toBeTruthy();
    expect(parsed.timing.defaultSmeltingTicks).toBeGreaterThan(0);
  });

  it("loadRaw() rejects wrong $schema discriminator", () => {
    const raw = loadFixture() as Record<string, unknown>;
    expect(() =>
      smithingProvider.loadRaw({ ...raw, $schema: "hyperforge.smithing.v999" }),
    ).toThrow();
  });

  it("loadRaw() rejects missing messages", () => {
    const raw = loadFixture() as Record<string, unknown>;
    const { messages: _omit, ...rest } = raw;
    expect(() => smithingProvider.loadRaw(rest)).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = smithingProvider.loadRaw(loadFixture());
    smithingProvider.unload();
    smithingProvider.load(parsed);
    expect(smithingProvider.isLoaded()).toBe(true);
  });

  it("hotReload(null) clears the manifest", () => {
    smithingProvider.loadRaw(loadFixture());
    smithingProvider.hotReload(null);
    expect(smithingProvider.isLoaded()).toBe(false);
  });

  it("singleton returns the same instance", () => {
    expect(smithingProvider).toBe(smithingProvider);
  });
});
