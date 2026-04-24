import { DamageTypesManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import {
  DamageTypeRegistry,
  UnknownDamageTypeError,
} from "../DamageTypeRegistry.js";

function manifest() {
  return DamageTypesManifestSchema.parse({
    types: [
      {
        id: "slashing",
        name: "Slashing",
        family: "physical",
        displayColor: "#c0c0c0",
      },
      {
        id: "fire",
        name: "Fire",
        family: "elemental",
        displayColor: "#ff6600",
      },
      {
        id: "ice",
        name: "Ice",
        family: "elemental",
        displayColor: "#66ccff",
      },
      {
        id: "holy",
        name: "Holy",
        family: "holy",
        displayColor: "#ffff99",
      },
      {
        id: "pure",
        name: "Pure (true damage)",
        family: "true",
        displayColor: "#ffffff",
        ignoresResistances: true,
      },
    ],
    resistances: [
      { attacker: "fire", target: "ice", multiplier: 2 },
      { attacker: "ice", target: "fire", multiplier: 0.5 },
      { attacker: "slashing", target: "slashing", multiplier: 0 },
      { attacker: "holy", target: "ice", multiplier: 1.5 },
    ],
    defaultMultiplier: 1,
  });
}

describe("DamageTypeRegistry — registry basics", () => {
  it("empty by default", () => {
    const reg = new DamageTypeRegistry();
    expect(reg.size).toBe(0);
    expect(reg.typeIds).toEqual([]);
    expect(reg.defaultMultiplier).toBe(1);
  });

  it("constructor + load populates the registry", () => {
    const reg = new DamageTypeRegistry(manifest());
    expect(reg.size).toBe(5);
    expect(reg.typeIds).toEqual(
      expect.arrayContaining(["slashing", "fire", "ice", "holy", "pure"]),
    );
  });

  it("has() + get() resolve known ids", () => {
    const reg = new DamageTypeRegistry(manifest());
    expect(reg.has("fire")).toBe(true);
    expect(reg.has("ghost")).toBe(false);
    const fire = reg.get("fire");
    expect(fire.family).toBe("elemental");
    expect(fire.displayColor).toBe("#ff6600");
  });

  it("get() throws on unknown id with availableIds", () => {
    const reg = new DamageTypeRegistry(manifest());
    try {
      reg.get("ghost");
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(UnknownDamageTypeError);
      expect((err as UnknownDamageTypeError).availableIds).toEqual(
        expect.arrayContaining(["fire", "ice"]),
      );
    }
  });

  it("load() replaces prior state", () => {
    const reg = new DamageTypeRegistry(manifest());
    reg.load(
      DamageTypesManifestSchema.parse({
        types: [
          {
            id: "acid",
            name: "Acid",
            family: "elemental",
            displayColor: "#66ff33",
          },
        ],
      }),
    );
    expect(reg.size).toBe(1);
    expect(reg.has("fire")).toBe(false);
    expect(reg.has("acid")).toBe(true);
  });

  it("loadFromJson validates before loading", () => {
    const reg = new DamageTypeRegistry();
    reg.loadFromJson({
      types: [
        {
          id: "physical",
          name: "Physical",
          family: "physical",
          displayColor: "#888888",
        },
      ],
    });
    expect(reg.size).toBe(1);
  });

  it("loadFromJson rejects invalid manifests", () => {
    const reg = new DamageTypeRegistry();
    expect(() =>
      reg.loadFromJson({
        types: [
          {
            id: "bad",
            name: "Bad",
            family: "elemental",
            displayColor: "not-a-color",
          },
        ],
      }),
    ).toThrow();
  });
});

describe("DamageTypeRegistry — resolveMultiplier", () => {
  it("explicit cell returns its multiplier", () => {
    const reg = new DamageTypeRegistry(manifest());
    expect(reg.resolveMultiplier("fire", "ice")).toBe(2);
    expect(reg.resolveMultiplier("ice", "fire")).toBe(0.5);
    expect(reg.resolveMultiplier("slashing", "slashing")).toBe(0);
  });

  it("missing cell falls back to defaultMultiplier", () => {
    const reg = new DamageTypeRegistry(manifest());
    expect(reg.resolveMultiplier("fire", "slashing")).toBe(1);
    expect(reg.resolveMultiplier("ice", "slashing")).toBe(1);
  });

  it("custom defaultMultiplier is honored", () => {
    const reg = new DamageTypeRegistry(
      DamageTypesManifestSchema.parse({
        types: [
          {
            id: "a",
            name: "A",
            family: "physical",
            displayColor: "#000000",
          },
          {
            id: "b",
            name: "B",
            family: "physical",
            displayColor: "#111111",
          },
        ],
        defaultMultiplier: 0.75,
      }),
    );
    expect(reg.resolveMultiplier("a", "b")).toBe(0.75);
  });

  it("ignoresResistances attacker always returns 1", () => {
    const reg = new DamageTypeRegistry(manifest());
    expect(reg.resolveMultiplier("pure", "ice")).toBe(1);
    expect(reg.resolveMultiplier("pure", "fire")).toBe(1);
    expect(reg.resolveMultiplier("pure", "slashing")).toBe(1);
  });

  it("throws UnknownDamageTypeError on unknown attacker", () => {
    const reg = new DamageTypeRegistry(manifest());
    expect(() => reg.resolveMultiplier("ghost", "fire")).toThrow(
      UnknownDamageTypeError,
    );
  });

  it("throws UnknownDamageTypeError on unknown target", () => {
    const reg = new DamageTypeRegistry(manifest());
    expect(() => reg.resolveMultiplier("fire", "ghost")).toThrow(
      UnknownDamageTypeError,
    );
  });

  it("directional — (a→b) and (b→a) are separate cells", () => {
    const reg = new DamageTypeRegistry(manifest());
    expect(reg.resolveMultiplier("fire", "ice")).toBe(2);
    expect(reg.resolveMultiplier("ice", "fire")).toBe(0.5);
  });
});

describe("DamageTypeRegistry — applyDamage", () => {
  it("multiplies raw damage by the resolved multiplier", () => {
    const reg = new DamageTypeRegistry(manifest());
    expect(reg.applyDamage("fire", "ice", 10)).toBe(20);
    expect(reg.applyDamage("ice", "fire", 10)).toBe(5);
    expect(reg.applyDamage("slashing", "slashing", 10)).toBe(0);
  });

  it("default multiplier on missing cell", () => {
    const reg = new DamageTypeRegistry(manifest());
    expect(reg.applyDamage("fire", "slashing", 10)).toBe(10);
  });

  it("ignoresResistances bypass returns raw damage", () => {
    const reg = new DamageTypeRegistry(manifest());
    expect(reg.applyDamage("pure", "ice", 42)).toBe(42);
  });

  it("zero multiplier returns 0", () => {
    const reg = new DamageTypeRegistry(manifest());
    expect(reg.applyDamage("slashing", "slashing", 999)).toBe(0);
  });

  it("negative result clamps to 0", () => {
    const reg = new DamageTypeRegistry(manifest());
    // Multiplier is nonnegative by schema, but rawDamage could be negative
    // (e.g. buggy heal-as-damage). Guard against it.
    expect(reg.applyDamage("fire", "slashing", -5)).toBe(0);
  });

  it("rejects non-finite raw damage", () => {
    const reg = new DamageTypeRegistry(manifest());
    expect(() => reg.applyDamage("fire", "ice", Number.NaN)).toThrow(TypeError);
    expect(() =>
      reg.applyDamage("fire", "ice", Number.POSITIVE_INFINITY),
    ).toThrow(TypeError);
  });
});

describe("DamageTypeRegistry — integration", () => {
  it("realistic combat exchange: fire vs ice giant", () => {
    const reg = new DamageTypeRegistry(manifest());
    // Fire weapon (20 raw) hitting an ice-tagged target → 2x
    expect(reg.applyDamage("fire", "ice", 20)).toBe(40);
    // Same target with a holy weapon → 1.5x
    expect(reg.applyDamage("holy", "ice", 20)).toBe(30);
    // Ice spell on the same (ice) target — no cell, defaults to 1
    expect(reg.applyDamage("ice", "ice", 20)).toBe(20);
  });

  it("true damage bypasses resistance table entirely", () => {
    const reg = new DamageTypeRegistry(manifest());
    // Even a 0-multiplier matchup (slashing→slashing) is ignored by pure
    expect(reg.applyDamage("pure", "slashing", 99)).toBe(99);
  });
});

describe("DamageTypeRegistry — onReloaded() reload listeners", () => {
  it("fires after every load() and honors unsubscribe", () => {
    const reg = new DamageTypeRegistry();
    let count = 0;
    const unsubscribe = reg.onReloaded(() => {
      count += 1;
    });
    reg.load(manifest());
    reg.load(manifest());
    expect(count).toBe(2);
    unsubscribe();
    reg.load(manifest());
    expect(count).toBe(2);
  });

  it("loadFromJson() also triggers the listener", () => {
    const reg = new DamageTypeRegistry();
    let fired = false;
    reg.onReloaded(() => {
      fired = true;
    });
    reg.loadFromJson(manifest());
    expect(fired).toBe(true);
  });

  it("a throwing listener does not break sibling listeners", () => {
    const reg = new DamageTypeRegistry();
    const seen: string[] = [];
    reg.onReloaded(() => {
      throw new Error("boom");
    });
    reg.onReloaded(() => seen.push("ok"));
    reg.load(manifest());
    expect(seen).toEqual(["ok"]);
  });
});
