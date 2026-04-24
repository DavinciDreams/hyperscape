/**
 * Tests for the CombatProvider singleton.
 *
 * The CombatManifestSchema requires a complete authored object
 * (no safe `{}` baseline), so tests validate behavior by loading
 * the real `combat-constants.json` fixture from the server package.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { combatProvider } from "../CombatProvider";

function getFixturePath(): string {
  const parts = __dirname.split(path.sep);
  const packagesIndex = parts.lastIndexOf("packages");
  if (packagesIndex === -1) {
    return path.resolve(
      __dirname,
      "../../../../server/world/assets/manifests/combat-constants.json",
    );
  }
  const rootDir = parts.slice(0, packagesIndex + 1).join(path.sep);
  return path.resolve(
    rootDir,
    "server/world/assets/manifests/combat-constants.json",
  );
}

function loadFixture(): unknown {
  return JSON.parse(readFileSync(getFixturePath(), "utf-8"));
}

beforeEach(() => {
  combatProvider.unload();
});
afterEach(() => {
  combatProvider.unload();
});

describe("CombatProvider", () => {
  it("starts unloaded", () => {
    expect(combatProvider.isLoaded()).toBe(false);
    expect(combatProvider.getManifest()).toBeNull();
  });

  it("loadRaw() rejects {} baseline — all fields required", () => {
    expect(() => combatProvider.loadRaw({})).toThrow();
  });

  it("loadRaw() accepts the real combat-constants.json fixture", () => {
    const parsed = combatProvider.loadRaw(loadFixture());
    expect(parsed.$schema).toBe("hyperforge.combat.v1");
    expect(parsed.ranges.pickup).toBeGreaterThan(0);
    expect(parsed.ticks.tickDurationMs).toBeGreaterThan(0);
  });

  it("loadRaw() rejects wrong $schema discriminator", () => {
    const raw = loadFixture() as Record<string, unknown>;
    expect(() =>
      combatProvider.loadRaw({ ...raw, $schema: "hyperforge.combat.v999" }),
    ).toThrow();
  });

  it("loadRaw() rejects non-numeric tickDurationMs", () => {
    const raw = loadFixture() as Record<string, unknown>;
    const ticks = raw.ticks as Record<string, unknown>;
    expect(() =>
      combatProvider.loadRaw({
        ...raw,
        ticks: { ...ticks, tickDurationMs: "nope" },
      }),
    ).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = combatProvider.loadRaw(loadFixture());
    combatProvider.unload();
    combatProvider.load(parsed);
    expect(combatProvider.isLoaded()).toBe(true);
    expect(combatProvider.getManifest()?.$schema).toBe("hyperforge.combat.v1");
  });

  it("hotReload(null) clears the manifest", () => {
    combatProvider.loadRaw(loadFixture());
    combatProvider.hotReload(null);
    expect(combatProvider.isLoaded()).toBe(false);
    expect(combatProvider.getManifest()).toBeNull();
  });

  it("singleton returns the same instance", () => {
    expect(combatProvider).toBe(combatProvider);
  });
});
