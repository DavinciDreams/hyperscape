/**
 * Faithfulness + defensiveness tests for `ItemSetsManifestSchema`.
 */

import { describe, expect, it } from "vitest";

import { ItemSetsManifestSchema, type ItemSetsManifest } from "./item-sets.js";

const reference: ItemSetsManifest = [
  {
    id: "dragonslayerArmor",
    name: "Dragonslayer's Regalia",
    description: "Forged from the scales of fallen dragons.",
    iconId: "iconDragonset",
    category: "raid",
    tier: 5,
    minLevel: 50,
    maxLevel: 100,
    memberItemIds: [
      "dragonslayerHelm",
      "dragonslayerChest",
      "dragonslayerLegs",
      "dragonslayerBoots",
      "dragonslayerGloves",
      "dragonslayerCape",
    ],
    stages: [
      {
        requiredPieces: 2,
        label: "2-Piece Bonus",
        description: "Improved fire resistance.",
        statModifiers: [{ stat: "defense", op: "add", value: 25 }],
        triggeredEffects: [],
      },
      {
        requiredPieces: 4,
        label: "4-Piece Bonus",
        description: "Critical strikes heal for 5% of damage dealt.",
        statModifiers: [
          { stat: "critChance", op: "add", value: 0.05 },
          { stat: "lifesteal", op: "add", value: 0.05 },
        ],
        triggeredEffects: [
          {
            id: "dragonFury",
            triggerEventId: "onCritHit",
            chance: 1,
            cooldownSec: 0,
            statusEffectId: "",
            damageAmount: 0,
            healAmount: 50,
            description: "Crits heal the wearer.",
          },
        ],
      },
      {
        requiredPieces: 6,
        label: "6-Piece Bonus",
        description: "Apply burning on hit.",
        statModifiers: [{ stat: "damageDealt", op: "multiply", value: 1.1 }],
        triggeredEffects: [
          {
            id: "dragonBreathProc",
            triggerEventId: "onAbilityCast",
            chance: 0.2,
            cooldownSec: 30,
            statusEffectId: "burning",
            damageAmount: 0,
            healAmount: 0,
            description: "20% chance to ignite target.",
          },
        ],
      },
    ],
    color: "#aa2233",
  },
  {
    id: "starterCrafted",
    name: "Apprentice's Kit",
    description: "A modest crafted set.",
    iconId: "",
    category: "crafted",
    tier: 0,
    minLevel: 1,
    maxLevel: 30,
    memberItemIds: ["apprenticeRobe", "apprenticeBoots"],
    stages: [
      {
        requiredPieces: 2,
        label: "2-Piece Bonus",
        description: "",
        statModifiers: [{ stat: "magic", op: "add", value: 2 }],
        triggeredEffects: [],
      },
    ],
    color: "",
  },
];

describe("ItemSetsManifestSchema", () => {
  it("parses the reference manifest cleanly", () => {
    const result = ItemSetsManifestSchema.safeParse(reference);
    if (!result.success) {
      throw new Error(
        `Reference manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("parses an empty manifest", () => {
    expect(ItemSetsManifestSchema.safeParse([]).success).toBe(true);
  });

  it("applies defaults on minimal set", () => {
    const minimal = [
      {
        id: "minimalSet",
        name: "Minimal",
        category: "crafted",
        memberItemIds: ["itemA", "itemB"],
        stages: [
          {
            requiredPieces: 2,
            statModifiers: [{ stat: "attack", op: "add", value: 1 }],
          },
        ],
      },
    ];
    const result = ItemSetsManifestSchema.safeParse(minimal);
    if (!result.success) {
      throw new Error(
        `Minimal failed:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    const set = result.data[0];
    expect(set.description).toBe("");
    expect(set.iconId).toBe("");
    expect(set.tier).toBe(0);
    expect(set.minLevel).toBe(1);
    expect(set.maxLevel).toBe(100);
    expect(set.color).toBe("");
    const stage = set.stages[0];
    expect(stage.label).toBe("");
    expect(stage.triggeredEffects).toEqual([]);
  });

  it("rejects duplicate item-set ids", () => {
    const bad = [
      {
        id: "dup",
        name: "A",
        category: "crafted",
        memberItemIds: ["i1", "i2"],
        stages: [
          {
            requiredPieces: 2,
            statModifiers: [{ stat: "attack", op: "add", value: 1 }],
          },
        ],
      },
      {
        id: "dup",
        name: "B",
        category: "crafted",
        memberItemIds: ["i1", "i2"],
        stages: [
          {
            requiredPieces: 2,
            statModifiers: [{ stat: "attack", op: "add", value: 1 }],
          },
        ],
      },
    ];
    expect(ItemSetsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate memberItemIds within a set", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        category: "crafted",
        memberItemIds: ["dup", "dup"],
        stages: [
          {
            requiredPieces: 2,
            statModifiers: [{ stat: "attack", op: "add", value: 1 }],
          },
        ],
      },
    ];
    expect(ItemSetsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects set with fewer than 2 members", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        category: "crafted",
        memberItemIds: ["only-one"],
        stages: [
          {
            requiredPieces: 2,
            statModifiers: [{ stat: "attack", op: "add", value: 1 }],
          },
        ],
      },
    ];
    expect(ItemSetsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects stage with requiredPieces > member count", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        category: "crafted",
        memberItemIds: ["i1", "i2"],
        stages: [
          {
            requiredPieces: 4,
            statModifiers: [{ stat: "attack", op: "add", value: 1 }],
          },
        ],
      },
    ];
    expect(ItemSetsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects non-strictly-increasing stage requiredPieces", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        category: "crafted",
        memberItemIds: ["i1", "i2", "i3", "i4"],
        stages: [
          {
            requiredPieces: 2,
            statModifiers: [{ stat: "attack", op: "add", value: 1 }],
          },
          {
            requiredPieces: 2,
            statModifiers: [{ stat: "defense", op: "add", value: 1 }],
          },
        ],
      },
    ];
    expect(ItemSetsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects stage with requiredPieces < 2", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        category: "crafted",
        memberItemIds: ["i1", "i2"],
        stages: [
          {
            requiredPieces: 1,
            statModifiers: [{ stat: "attack", op: "add", value: 1 }],
          },
        ],
      },
    ];
    expect(ItemSetsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects empty stage (no mods, no triggers)", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        category: "crafted",
        memberItemIds: ["i1", "i2"],
        stages: [
          {
            requiredPieces: 2,
            statModifiers: [],
            triggeredEffects: [],
          },
        ],
      },
    ];
    expect(ItemSetsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects multiply op with value 0", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        category: "crafted",
        memberItemIds: ["i1", "i2"],
        stages: [
          {
            requiredPieces: 2,
            statModifiers: [{ stat: "attack", op: "multiply", value: 0 }],
          },
        ],
      },
    ];
    expect(ItemSetsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects multiply op with negative value", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        category: "crafted",
        memberItemIds: ["i1", "i2"],
        stages: [
          {
            requiredPieces: 2,
            statModifiers: [{ stat: "attack", op: "multiply", value: -0.5 }],
          },
        ],
      },
    ];
    expect(ItemSetsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts add op with negative value (trade-off)", () => {
    const ok = [
      {
        id: "a",
        name: "A",
        category: "crafted",
        memberItemIds: ["i1", "i2"],
        stages: [
          {
            requiredPieces: 2,
            statModifiers: [
              { stat: "attack", op: "add", value: 10 },
              { stat: "moveSpeed", op: "add", value: -0.1 },
            ],
          },
        ],
      },
    ];
    expect(ItemSetsManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects triggered effect with no effect payload", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        category: "crafted",
        memberItemIds: ["i1", "i2"],
        stages: [
          {
            requiredPieces: 2,
            triggeredEffects: [
              {
                id: "emptyProc",
                triggerEventId: "onHit",
                chance: 1,
                cooldownSec: 0,
                statusEffectId: "",
                damageAmount: 0,
                healAmount: 0,
              },
            ],
          },
        ],
      },
    ];
    expect(ItemSetsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate triggered-effect ids within a stage", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        category: "crafted",
        memberItemIds: ["i1", "i2"],
        stages: [
          {
            requiredPieces: 2,
            triggeredEffects: [
              {
                id: "dup",
                triggerEventId: "onHit",
                damageAmount: 10,
              },
              {
                id: "dup",
                triggerEventId: "onCrit",
                damageAmount: 20,
              },
            ],
          },
        ],
      },
    ];
    expect(ItemSetsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate triggered-effect ids across stages of a set", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        category: "crafted",
        memberItemIds: ["i1", "i2", "i3", "i4"],
        stages: [
          {
            requiredPieces: 2,
            triggeredEffects: [
              {
                id: "dup",
                triggerEventId: "onHit",
                damageAmount: 10,
              },
            ],
          },
          {
            requiredPieces: 4,
            triggeredEffects: [
              {
                id: "dup",
                triggerEventId: "onCrit",
                damageAmount: 20,
              },
            ],
          },
        ],
      },
    ];
    expect(ItemSetsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects minLevel > maxLevel", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        category: "crafted",
        minLevel: 80,
        maxLevel: 30,
        memberItemIds: ["i1", "i2"],
        stages: [
          {
            requiredPieces: 2,
            statModifiers: [{ stat: "attack", op: "add", value: 1 }],
          },
        ],
      },
    ];
    expect(ItemSetsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown category", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        category: "mythical",
        memberItemIds: ["i1", "i2"],
        stages: [
          {
            requiredPieces: 2,
            statModifiers: [{ stat: "attack", op: "add", value: 1 }],
          },
        ],
      },
    ];
    expect(ItemSetsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown stat kind", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        category: "crafted",
        memberItemIds: ["i1", "i2"],
        stages: [
          {
            requiredPieces: 2,
            statModifiers: [{ stat: "willpower", op: "add", value: 1 }],
          },
        ],
      },
    ];
    expect(ItemSetsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects triggered effect chance > 1", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        category: "crafted",
        memberItemIds: ["i1", "i2"],
        stages: [
          {
            requiredPieces: 2,
            triggeredEffects: [
              {
                id: "procA",
                triggerEventId: "onHit",
                chance: 1.5,
                damageAmount: 10,
              },
            ],
          },
        ],
      },
    ];
    expect(ItemSetsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects invalid item-set id format", () => {
    const bad = [
      {
        id: "Not Valid",
        name: "A",
        category: "crafted",
        memberItemIds: ["i1", "i2"],
        stages: [
          {
            requiredPieces: 2,
            statModifiers: [{ stat: "attack", op: "add", value: 1 }],
          },
        ],
      },
    ];
    expect(ItemSetsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects invalid color format", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        category: "crafted",
        memberItemIds: ["i1", "i2"],
        stages: [
          {
            requiredPieces: 2,
            statModifiers: [{ stat: "attack", op: "add", value: 1 }],
          },
        ],
        color: "blue",
      },
    ];
    expect(ItemSetsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects set with more than 20 members", () => {
    const twentyOne = Array.from({ length: 21 }, (_, i) => `i${i}`);
    const bad = [
      {
        id: "a",
        name: "A",
        category: "crafted",
        memberItemIds: twentyOne,
        stages: [
          {
            requiredPieces: 2,
            statModifiers: [{ stat: "attack", op: "add", value: 1 }],
          },
        ],
      },
    ];
    expect(ItemSetsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown top-level field (strict mode)", () => {
    const bad = [
      {
        id: "a",
        name: "A",
        category: "crafted",
        memberItemIds: ["i1", "i2"],
        stages: [
          {
            requiredPieces: 2,
            statModifiers: [{ stat: "attack", op: "add", value: 1 }],
          },
        ],
        extraField: "nope",
      },
    ];
    expect(ItemSetsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts stage with only triggered effects (no stat modifiers)", () => {
    const ok = [
      {
        id: "a",
        name: "A",
        category: "crafted",
        memberItemIds: ["i1", "i2"],
        stages: [
          {
            requiredPieces: 2,
            statModifiers: [],
            triggeredEffects: [
              {
                id: "proc",
                triggerEventId: "onHit",
                damageAmount: 10,
              },
            ],
          },
        ],
      },
    ];
    expect(ItemSetsManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("accepts stage with status-effect-only trigger (no damage/heal)", () => {
    const ok = [
      {
        id: "a",
        name: "A",
        category: "crafted",
        memberItemIds: ["i1", "i2"],
        stages: [
          {
            requiredPieces: 2,
            triggeredEffects: [
              {
                id: "proc",
                triggerEventId: "onHit",
                statusEffectId: "poison",
              },
            ],
          },
        ],
      },
    ];
    expect(ItemSetsManifestSchema.safeParse(ok).success).toBe(true);
  });
});
