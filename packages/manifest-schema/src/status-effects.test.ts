/**
 * Faithfulness + defensiveness tests for `StatusEffectsManifestSchema`.
 */

import { describe, expect, it } from "vitest";

import {
  StatusEffectsManifestSchema,
  type StatusEffectsManifest,
} from "./status-effects.js";

const reference: StatusEffectsManifest = [
  {
    id: "poison",
    name: "Poison",
    description: "Damages the target over time.",
    iconId: "icon.poison",
    category: "harmful",
    tags: ["poison", "dot", "cleansable"],
    modifiers: [],
    durationSec: 12,
    tickIntervalSec: 2,
    perTickDamage: 8,
    perTickHeal: 0,
    damageTypeId: "poison",
    stackRule: "refresh",
    maxStacks: 1,
    undispellable: false,
    persistOnDeath: false,
    applyVfxId: "vfx.poisonApply",
    activeVfxId: "vfx.poisonActive",
    applySfxId: "sfx.poisonHiss",
  },
  {
    id: "regen",
    name: "Regeneration",
    description: "Heals the target over time.",
    iconId: "icon.regen",
    category: "beneficial",
    tags: ["regen", "hot"],
    modifiers: [],
    durationSec: 10,
    tickIntervalSec: 1,
    perTickDamage: 0,
    perTickHeal: 5,
    damageTypeId: "true",
    stackRule: "refresh",
    maxStacks: 1,
    undispellable: false,
    persistOnDeath: false,
    applyVfxId: "",
    activeVfxId: "vfx.regenPulse",
    applySfxId: "",
  },
  {
    id: "haste",
    name: "Haste",
    description: "+20% attack and cast speed.",
    iconId: "icon.haste",
    category: "beneficial",
    tags: ["haste", "buff"],
    modifiers: [
      { stat: "attackSpeed", op: "multiply", value: 1.2 },
      { stat: "castSpeed", op: "multiply", value: 1.2 },
    ],
    durationSec: 15,
    tickIntervalSec: 0,
    perTickDamage: 0,
    perTickHeal: 0,
    damageTypeId: "true",
    stackRule: "refresh",
    maxStacks: 1,
    undispellable: false,
    persistOnDeath: false,
    applyVfxId: "",
    activeVfxId: "",
    applySfxId: "",
  },
  {
    id: "bleed",
    name: "Bleed",
    description: "Stacking bleed — up to 5 stacks.",
    iconId: "icon.bleed",
    category: "harmful",
    tags: ["bleed", "dot"],
    modifiers: [],
    durationSec: 8,
    tickIntervalSec: 1,
    perTickDamage: 3,
    perTickHeal: 0,
    damageTypeId: "physical",
    stackRule: "stack-count",
    maxStacks: 5,
    undispellable: false,
    persistOnDeath: false,
    applyVfxId: "",
    activeVfxId: "",
    applySfxId: "",
  },
];

describe("StatusEffectsManifestSchema", () => {
  it("parses the reference manifest cleanly", () => {
    const result = StatusEffectsManifestSchema.safeParse(reference);
    if (!result.success) {
      throw new Error(
        `Reference manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("applies effect defaults on minimal entry", () => {
    const parsed = StatusEffectsManifestSchema.parse([
      {
        id: "marker",
        name: "Marker",
        category: "neutral",
        durationSec: 5,
      },
    ]);
    expect(parsed[0].iconId).toBe("");
    expect(parsed[0].tags).toEqual([]);
    expect(parsed[0].modifiers).toEqual([]);
    expect(parsed[0].tickIntervalSec).toBe(0);
    expect(parsed[0].perTickDamage).toBe(0);
    expect(parsed[0].perTickHeal).toBe(0);
    expect(parsed[0].damageTypeId).toBe("true");
    expect(parsed[0].stackRule).toBe("refresh");
    expect(parsed[0].maxStacks).toBe(1);
    expect(parsed[0].undispellable).toBe(false);
    expect(parsed[0].persistOnDeath).toBe(false);
  });

  it("accepts empty manifest", () => {
    expect(StatusEffectsManifestSchema.safeParse([]).success).toBe(true);
  });

  it("rejects duplicate ids", () => {
    const bad = [
      { id: "dup", name: "A", category: "beneficial", durationSec: 5 },
      { id: "dup", name: "B", category: "harmful", durationSec: 5 },
    ];
    expect(StatusEffectsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects invalid id format", () => {
    const bad = [
      { id: "Has Spaces", name: "X", category: "beneficial", durationSec: 5 },
    ];
    expect(StatusEffectsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown stat", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        category: "beneficial",
        durationSec: 5,
        modifiers: [{ stat: "luck", op: "add", value: 1 }],
      },
    ];
    expect(StatusEffectsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown op", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        category: "beneficial",
        durationSec: 5,
        modifiers: [{ stat: "attack", op: "subtract", value: 1 }],
      },
    ];
    expect(StatusEffectsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects multiply modifier with value 0", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        category: "beneficial",
        durationSec: 5,
        modifiers: [{ stat: "attack", op: "multiply", value: 0 }],
      },
    ];
    expect(StatusEffectsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts multiply modifier with positive fractional value (<1 = debuff)", () => {
    const ok = [
      {
        id: "slow",
        name: "Slow",
        category: "harmful",
        durationSec: 5,
        modifiers: [{ stat: "moveSpeed", op: "multiply", value: 0.5 }],
      },
    ];
    expect(StatusEffectsManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects perTickDamage with tickIntervalSec 0", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        category: "harmful",
        durationSec: 5,
        tickIntervalSec: 0,
        perTickDamage: 5,
      },
    ];
    expect(StatusEffectsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects perTickHeal with tickIntervalSec 0", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        category: "beneficial",
        durationSec: 5,
        tickIntervalSec: 0,
        perTickHeal: 5,
      },
    ];
    expect(StatusEffectsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts pure modifier effect with tickIntervalSec 0", () => {
    const ok = [
      {
        id: "x",
        name: "X",
        category: "beneficial",
        durationSec: 5,
        tickIntervalSec: 0,
        modifiers: [{ stat: "attack", op: "add", value: 5 }],
      },
    ];
    expect(StatusEffectsManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects stack-count with maxStacks 1", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        category: "harmful",
        durationSec: 5,
        stackRule: "stack-count",
        maxStacks: 1,
      },
    ];
    expect(StatusEffectsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts stack-count with maxStacks >= 2", () => {
    const ok = [
      {
        id: "x",
        name: "X",
        category: "harmful",
        durationSec: 5,
        stackRule: "stack-count",
        maxStacks: 10,
      },
    ];
    expect(StatusEffectsManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects unknown stackRule", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        category: "harmful",
        durationSec: 5,
        stackRule: "combust",
      },
    ];
    expect(StatusEffectsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown category", () => {
    const bad = [
      { id: "x", name: "X", category: "ambivalent", durationSec: 5 },
    ];
    expect(StatusEffectsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects durationSec > 3600", () => {
    const bad = [
      { id: "x", name: "X", category: "beneficial", durationSec: 7200 },
    ];
    expect(StatusEffectsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects tickIntervalSec > 60", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        category: "harmful",
        durationSec: 120,
        tickIntervalSec: 120,
        perTickDamage: 1,
      },
    ];
    expect(StatusEffectsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects invalid tag format", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        category: "harmful",
        durationSec: 5,
        tags: ["Bad Tag With Spaces"],
      },
    ];
    expect(StatusEffectsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects maxStacks > 99", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        category: "harmful",
        durationSec: 5,
        stackRule: "stack-count",
        maxStacks: 500,
      },
    ];
    expect(StatusEffectsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts neutral-category tag-only effect", () => {
    const ok = [
      {
        id: "marked",
        name: "Marked",
        category: "neutral",
        durationSec: 30,
        tags: ["marked"],
      },
    ];
    expect(StatusEffectsManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects perTickDamage negative", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        category: "harmful",
        durationSec: 5,
        tickIntervalSec: 1,
        perTickDamage: -5,
      },
    ];
    expect(StatusEffectsManifestSchema.safeParse(bad).success).toBe(false);
  });
});
