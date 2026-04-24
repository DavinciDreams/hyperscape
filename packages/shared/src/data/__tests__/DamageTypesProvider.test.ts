/**
 * Tests for the DamageTypesProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { damageTypesProvider } from "../DamageTypesProvider";

beforeEach(() => {
  damageTypesProvider.unload();
});
afterEach(() => {
  damageTypesProvider.unload();
});

const validManifest = {
  types: [
    {
      id: "physical",
      name: "Physical",
      family: "physical" as const,
      displayColor: "#cccccc",
    },
    {
      id: "fire",
      name: "Fire",
      family: "elemental" as const,
      displayColor: "#ff8040",
    },
    {
      id: "true",
      name: "True",
      family: "true" as const,
      displayColor: "#ffffff",
      ignoresResistances: true,
    },
  ],
  resistances: [
    { attacker: "fire", target: "fire", multiplier: 0.5 },
    { attacker: "fire", target: "physical", multiplier: 1.25 },
  ],
  defaultMultiplier: 1,
};

const mkType = (id: string) => ({
  id,
  name: id,
  family: "physical" as const,
  displayColor: "#ffffff",
});

describe("DamageTypesProvider", () => {
  it("starts unloaded", () => {
    expect(damageTypesProvider.isLoaded()).toBe(false);
    expect(damageTypesProvider.getManifest()).toBeNull();
  });

  it("loadRaw() accepts a valid manifest", () => {
    const parsed = damageTypesProvider.loadRaw(validManifest);
    expect(parsed.types.length).toBe(3);
    expect(parsed.resistances.length).toBe(2);
    expect(damageTypesProvider.isLoaded()).toBe(true);
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = damageTypesProvider.loadRaw(validManifest);
    damageTypesProvider.unload();
    damageTypesProvider.load(parsed);
    expect(damageTypesProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() rejects an empty types array (min 1 required)", () => {
    expect(() =>
      damageTypesProvider.loadRaw({ types: [], resistances: [] }),
    ).toThrow();
    expect(damageTypesProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects duplicate damage type ids", () => {
    const bad = { types: [mkType("x"), mkType("x")] };
    expect(() => damageTypesProvider.loadRaw(bad)).toThrow();
    expect(damageTypesProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects resistance referencing unknown ids", () => {
    const bad = {
      types: [mkType("fire")],
      resistances: [{ attacker: "fire", target: "ghost", multiplier: 0.5 }],
    };
    expect(() => damageTypesProvider.loadRaw(bad)).toThrow();
    expect(damageTypesProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects duplicate (attacker,target) resistance cells", () => {
    const bad = {
      types: [mkType("fire"), mkType("ice")],
      resistances: [
        { attacker: "fire", target: "ice", multiplier: 0.5 },
        { attacker: "fire", target: "ice", multiplier: 0.7 },
      ],
    };
    expect(() => damageTypesProvider.loadRaw(bad)).toThrow();
    expect(damageTypesProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects `ignoresResistances` type appearing as attacker", () => {
    const bad = {
      types: [
        {
          ...mkType("true"),
          family: "true" as const,
          ignoresResistances: true,
        },
        mkType("physical"),
      ],
      resistances: [{ attacker: "true", target: "physical", multiplier: 2 }],
    };
    expect(() => damageTypesProvider.loadRaw(bad)).toThrow();
    expect(damageTypesProvider.isLoaded()).toBe(false);
  });

  it("hotReload(manifest) replaces the current manifest", () => {
    damageTypesProvider.loadRaw(validManifest);
    const replacement = damageTypesProvider.loadRaw({
      types: [mkType("only")],
    });
    damageTypesProvider.hotReload(replacement);
    expect(damageTypesProvider.getManifest()?.types.length).toBe(1);
  });

  it("hotReload(null) clears", () => {
    damageTypesProvider.loadRaw(validManifest);
    damageTypesProvider.hotReload(null);
    expect(damageTypesProvider.isLoaded()).toBe(false);
  });

  it("unload() resets", () => {
    damageTypesProvider.loadRaw(validManifest);
    damageTypesProvider.unload();
    expect(damageTypesProvider.isLoaded()).toBe(false);
    expect(damageTypesProvider.getManifest()).toBeNull();
  });
});
