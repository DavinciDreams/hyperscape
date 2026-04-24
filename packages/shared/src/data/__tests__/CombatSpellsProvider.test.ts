/**
 * Tests for the CombatSpellsProvider singleton.
 *
 * Uses the real authored `combat-spells.json` fixture.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { combatSpellsProvider } from "../CombatSpellsProvider";

function getFixturePath(): string {
  const parts = __dirname.split(path.sep);
  const packagesIndex = parts.lastIndexOf("packages");
  if (packagesIndex === -1) {
    return path.resolve(
      __dirname,
      "../../../../server/world/assets/manifests/combat-spells.json",
    );
  }
  const rootDir = parts.slice(0, packagesIndex + 1).join(path.sep);
  return path.resolve(
    rootDir,
    "server/world/assets/manifests/combat-spells.json",
  );
}

function loadFixture(): unknown {
  return JSON.parse(readFileSync(getFixturePath(), "utf-8"));
}

beforeEach(() => {
  combatSpellsProvider.unload();
});
afterEach(() => {
  combatSpellsProvider.unload();
});

describe("CombatSpellsProvider", () => {
  it("starts unloaded", () => {
    expect(combatSpellsProvider.isLoaded()).toBe(false);
    expect(combatSpellsProvider.getManifest()).toBeNull();
  });

  it("loadRaw() rejects {} baseline — standard required", () => {
    expect(() => combatSpellsProvider.loadRaw({})).toThrow();
  });

  it("loadRaw() accepts the real combat-spells.json fixture", () => {
    const parsed = combatSpellsProvider.loadRaw(loadFixture());
    expect(parsed.standard).toBeDefined();
  });

  it("loadRaw() rejects non-object standard", () => {
    expect(() =>
      combatSpellsProvider.loadRaw({ standard: "not-an-object" }),
    ).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = combatSpellsProvider.loadRaw(loadFixture());
    combatSpellsProvider.unload();
    combatSpellsProvider.load(parsed);
    expect(combatSpellsProvider.isLoaded()).toBe(true);
  });

  it("hotReload(null) clears the manifest", () => {
    combatSpellsProvider.loadRaw(loadFixture());
    combatSpellsProvider.hotReload(null);
    expect(combatSpellsProvider.isLoaded()).toBe(false);
  });

  it("unload() removes the manifest", () => {
    combatSpellsProvider.loadRaw(loadFixture());
    combatSpellsProvider.unload();
    expect(combatSpellsProvider.isLoaded()).toBe(false);
  });

  it("singleton returns the same instance", () => {
    expect(combatSpellsProvider).toBe(combatSpellsProvider);
  });
});
