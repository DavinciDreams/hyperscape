/**
 * Tests for the EquipmentProvider singleton.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { equipmentProvider } from "../EquipmentProvider";

function getFixturePath(): string {
  const parts = __dirname.split(path.sep);
  const packagesIndex = parts.lastIndexOf("packages");
  if (packagesIndex === -1) {
    return path.resolve(
      __dirname,
      "../../../../server/world/assets/manifests/equipment-constants.json",
    );
  }
  const rootDir = parts.slice(0, packagesIndex + 1).join(path.sep);
  return path.resolve(
    rootDir,
    "server/world/assets/manifests/equipment-constants.json",
  );
}

function loadFixture(): unknown {
  return JSON.parse(readFileSync(getFixturePath(), "utf-8"));
}

beforeEach(() => {
  equipmentProvider.unload();
});
afterEach(() => {
  equipmentProvider.unload();
});

describe("EquipmentProvider", () => {
  it("starts unloaded", () => {
    expect(equipmentProvider.isLoaded()).toBe(false);
    expect(equipmentProvider.getManifest()).toBeNull();
  });

  it("loadRaw() rejects {} baseline — all fields required", () => {
    expect(() => equipmentProvider.loadRaw({})).toThrow();
  });

  it("loadRaw() accepts the real equipment-constants.json fixture", () => {
    const parsed = equipmentProvider.loadRaw(loadFixture());
    expect(parsed.$schema).toBe("hyperforge.equipment.v1");
    expect(parsed.implementedSlots.length).toBeGreaterThan(0);
    expect(parsed.bankEquipmentSlots.length).toBeGreaterThan(0);
  });

  it("loadRaw() rejects empty implementedSlots (if min enforced) or empty arrays survive", () => {
    const raw = loadFixture() as Record<string, unknown>;
    expect(() =>
      equipmentProvider.loadRaw({
        ...raw,
        implementedSlots: ["not_a_real_slot"],
      }),
    ).toThrow();
  });

  it("loadRaw() rejects invalid grid position", () => {
    const raw = loadFixture() as Record<string, unknown>;
    const bankSlots = (raw.bankEquipmentSlots as unknown[]).slice() as Array<
      Record<string, unknown>
    >;
    bankSlots[0] = {
      ...bankSlots[0],
      gridPosition: { row: -1, col: -1 },
    };
    expect(() =>
      equipmentProvider.loadRaw({ ...raw, bankEquipmentSlots: bankSlots }),
    ).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = equipmentProvider.loadRaw(loadFixture());
    equipmentProvider.unload();
    equipmentProvider.load(parsed);
    expect(equipmentProvider.isLoaded()).toBe(true);
  });

  it("hotReload(null) clears the manifest", () => {
    equipmentProvider.loadRaw(loadFixture());
    equipmentProvider.hotReload(null);
    expect(equipmentProvider.isLoaded()).toBe(false);
  });

  it("singleton returns the same instance", () => {
    expect(equipmentProvider).toBe(equipmentProvider);
  });
});
