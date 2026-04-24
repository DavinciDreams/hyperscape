/**
 * Tests for the PetCompanionProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { petCompanionProvider } from "../PetCompanionProvider";

beforeEach(() => {
  petCompanionProvider.unload();
});
afterEach(() => {
  petCompanionProvider.unload();
});

const validPet = {
  id: "wolfPup",
  name: "Wolf Pup",
  category: "combat" as const,
};

describe("PetCompanionProvider", () => {
  it("starts unloaded", () => {
    expect(petCompanionProvider.isLoaded()).toBe(false);
    expect(petCompanionProvider.getManifest()).toBeNull();
  });

  it("loadRaw() accepts empty array baseline", () => {
    const parsed = petCompanionProvider.loadRaw([]);
    expect(parsed).toEqual([]);
    expect(petCompanionProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() accepts valid pet", () => {
    const parsed = petCompanionProvider.loadRaw([validPet]);
    expect(parsed.length).toBe(1);
    expect(parsed[0].id).toBe("wolfPup");
  });

  it("loadRaw() rejects duplicate pet ids", () => {
    expect(() =>
      petCompanionProvider.loadRaw([validPet, { ...validPet, name: "Dup" }]),
    ).toThrow();
  });

  it("loadRaw() rejects duplicate slots", () => {
    expect(() =>
      petCompanionProvider.loadRaw([
        { ...validPet, slots: ["saddle", "saddle"] as const },
      ]),
    ).toThrow();
  });

  it("loadRaw() rejects cosmetic pet with abilities", () => {
    expect(() =>
      petCompanionProvider.loadRaw([
        {
          ...validPet,
          category: "cosmetic" as const,
          abilities: [{ id: "bite" }],
        },
      ]),
    ).toThrow();
  });

  it("loadRaw() rejects cosmetic pet with progression enabled", () => {
    expect(() =>
      petCompanionProvider.loadRaw([
        {
          ...validPet,
          category: "cosmetic" as const,
          progression: { enabled: true },
        },
      ]),
    ).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = petCompanionProvider.loadRaw([validPet]);
    petCompanionProvider.unload();
    petCompanionProvider.load(parsed);
    expect(petCompanionProvider.isLoaded()).toBe(true);
  });

  it("hotReload() replaces the manifest", () => {
    petCompanionProvider.loadRaw([validPet]);
    const parsed = petCompanionProvider.loadRaw([]);
    petCompanionProvider.hotReload(parsed);
    expect(petCompanionProvider.getManifest()).toEqual([]);
  });

  it("hotReload(null) clears the manifest", () => {
    petCompanionProvider.loadRaw([validPet]);
    petCompanionProvider.hotReload(null);
    expect(petCompanionProvider.isLoaded()).toBe(false);
  });

  it("unload() clears a loaded manifest", () => {
    petCompanionProvider.loadRaw([validPet]);
    petCompanionProvider.unload();
    expect(petCompanionProvider.isLoaded()).toBe(false);
  });
});
