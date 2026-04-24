/**
 * Faithfulness + defensiveness tests for `DamageTypesManifestSchema`.
 */

import { describe, expect, it } from "vitest";

import {
  DamageTypesManifestSchema,
  type DamageTypesManifest,
} from "./damage-types.js";

const reference: DamageTypesManifest = {
  types: [
    {
      id: "slashing",
      name: "Slashing",
      description: "Sharp edged melee weapons.",
      family: "physical",
      displayColor: "#cccccc",
      hitVfxId: "vfx.slash",
      hitSfxId: "sfx.slash",
      ignoresResistances: false,
    },
    {
      id: "fire",
      name: "Fire",
      description: "",
      family: "elemental",
      displayColor: "#ff6600",
      hitVfxId: "",
      hitSfxId: "",
      ignoresResistances: false,
    },
    {
      id: "ice",
      name: "Ice",
      description: "",
      family: "elemental",
      displayColor: "#66ccff",
      hitVfxId: "",
      hitSfxId: "",
      ignoresResistances: false,
    },
    {
      id: "holy",
      name: "Holy",
      description: "",
      family: "holy",
      displayColor: "#ffff99",
      hitVfxId: "",
      hitSfxId: "",
      ignoresResistances: false,
    },
    {
      id: "trueDamage",
      name: "True Damage",
      description: "Bypasses resistances.",
      family: "true",
      displayColor: "#ff00ff",
      hitVfxId: "",
      hitSfxId: "",
      ignoresResistances: true,
    },
  ],
  resistances: [
    { attacker: "fire", target: "ice", multiplier: 2 },
    { attacker: "ice", target: "fire", multiplier: 2 },
    { attacker: "fire", target: "fire", multiplier: 0.5 },
    { attacker: "holy", target: "fire", multiplier: 1.5 },
  ],
  defaultMultiplier: 1,
};

describe("DamageTypesManifestSchema", () => {
  it("parses the reference manifest cleanly", () => {
    const result = DamageTypesManifestSchema.safeParse(reference);
    if (!result.success) {
      throw new Error(
        `Reference manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("applies defaults to a minimal manifest", () => {
    const parsed = DamageTypesManifestSchema.parse({
      types: [
        {
          id: "physical",
          name: "Physical",
          family: "physical",
          displayColor: "#aaaaaa",
        },
      ],
    });
    expect(parsed.defaultMultiplier).toBe(1);
    expect(parsed.resistances).toEqual([]);
    expect(parsed.types[0].description).toBe("");
    expect(parsed.types[0].hitVfxId).toBe("");
    expect(parsed.types[0].hitSfxId).toBe("");
    expect(parsed.types[0].ignoresResistances).toBe(false);
  });

  it("rejects empty types array", () => {
    expect(DamageTypesManifestSchema.safeParse({ types: [] }).success).toBe(
      false,
    );
  });

  it("rejects duplicate type ids", () => {
    const bad = {
      types: [
        { id: "fire", name: "A", family: "elemental", displayColor: "#ff0000" },
        { id: "fire", name: "B", family: "elemental", displayColor: "#ff0000" },
      ],
    };
    expect(DamageTypesManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects resistance referencing unknown attacker id", () => {
    const bad = {
      types: [
        { id: "fire", name: "F", family: "elemental", displayColor: "#ff0000" },
      ],
      resistances: [{ attacker: "ghost", target: "fire", multiplier: 1 }],
    };
    expect(DamageTypesManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects resistance referencing unknown target id", () => {
    const bad = {
      types: [
        { id: "fire", name: "F", family: "elemental", displayColor: "#ff0000" },
      ],
      resistances: [{ attacker: "fire", target: "ghost", multiplier: 1 }],
    };
    expect(DamageTypesManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate (attacker, target) resistance cells", () => {
    const bad = {
      types: [
        { id: "a", name: "A", family: "elemental", displayColor: "#ffffff" },
        { id: "b", name: "B", family: "elemental", displayColor: "#ffffff" },
      ],
      resistances: [
        { attacker: "a", target: "b", multiplier: 1 },
        { attacker: "a", target: "b", multiplier: 2 },
      ],
    };
    expect(DamageTypesManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects ignoresResistances type appearing as attacker in resistance matrix", () => {
    const bad = {
      types: [
        {
          id: "trueDmg",
          name: "True",
          family: "true",
          displayColor: "#ffffff",
          ignoresResistances: true,
        },
        { id: "fire", name: "F", family: "elemental", displayColor: "#ff0000" },
      ],
      resistances: [{ attacker: "trueDmg", target: "fire", multiplier: 2 }],
    };
    expect(DamageTypesManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects multiplier < 0", () => {
    const bad = {
      types: [
        { id: "a", name: "A", family: "elemental", displayColor: "#ffffff" },
      ],
      resistances: [{ attacker: "a", target: "a", multiplier: -1 }],
    };
    expect(DamageTypesManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects multiplier > 10", () => {
    const bad = {
      types: [
        { id: "a", name: "A", family: "elemental", displayColor: "#ffffff" },
      ],
      resistances: [{ attacker: "a", target: "a", multiplier: 11 }],
    };
    expect(DamageTypesManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects invalid displayColor format", () => {
    const bad = {
      types: [{ id: "a", name: "A", family: "elemental", displayColor: "red" }],
    };
    expect(DamageTypesManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown family", () => {
    const bad = {
      types: [
        { id: "a", name: "A", family: "cheese", displayColor: "#ffffff" },
      ],
    };
    expect(DamageTypesManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects invalid damage-type id format", () => {
    const bad = {
      types: [
        {
          id: "Has Spaces",
          name: "X",
          family: "physical",
          displayColor: "#ffffff",
        },
      ],
    };
    expect(DamageTypesManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts immunity cell (multiplier=0)", () => {
    const ok = {
      types: [
        { id: "a", name: "A", family: "physical", displayColor: "#ffffff" },
        { id: "b", name: "B", family: "physical", displayColor: "#ffffff" },
      ],
      resistances: [{ attacker: "a", target: "b", multiplier: 0 }],
    };
    expect(DamageTypesManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("accepts self-resistance (attacker === target)", () => {
    const ok = {
      types: [
        { id: "fire", name: "F", family: "elemental", displayColor: "#ff0000" },
      ],
      resistances: [{ attacker: "fire", target: "fire", multiplier: 0.5 }],
    };
    expect(DamageTypesManifestSchema.safeParse(ok).success).toBe(true);
  });
});
