/**
 * Faithfulness + defensiveness tests for `EnchantmentsManifestSchema`.
 */

import { describe, expect, it } from "vitest";

import {
  EnchantmentsManifestSchema,
  type EnchantmentsManifest,
} from "./enchantments.js";

const reference: EnchantmentsManifest = [
  {
    id: "sharpness",
    name: "Sharpness",
    description: "Increases weapon damage.",
    iconId: "icon.sharpness",
    kind: "permanent",
    slots: ["weapon"],
    maxTier: 5,
    modifiers: [
      {
        stat: "damageDealt",
        op: "multiply",
        tiers: [
          { tier: 1, value: 1.05, requiredLevel: 10 },
          { tier: 2, value: 1.1, requiredLevel: 25 },
          { tier: 3, value: 1.15, requiredLevel: 40 },
          { tier: 4, value: 1.2, requiredLevel: 60 },
          { tier: 5, value: 1.25, requiredLevel: 80 },
        ],
      },
    ],
    recipe: {
      reagentIds: ["dustSharpness"],
      stationId: "enchantersTable",
      requiredCraftingLevel: 20,
      successChance: 0.9,
    },
    durationHits: 0,
    destructiveRemoval: false,
    soulboundsItem: false,
  },
  {
    id: "rubyOfPower",
    name: "Ruby of Power",
    description: "+5/10/15 attack.",
    iconId: "icon.rubyOfPower",
    kind: "socket-gem",
    slots: ["weapon", "offhand"],
    maxTier: 3,
    modifiers: [
      {
        stat: "attack",
        op: "add",
        tiers: [
          { tier: 1, value: 5, requiredLevel: 1 },
          { tier: 2, value: 10, requiredLevel: 20 },
          { tier: 3, value: 15, requiredLevel: 40 },
        ],
      },
    ],
    recipe: {
      reagentIds: [],
      stationId: "",
      requiredCraftingLevel: 0,
      successChance: 1,
    },
    durationHits: 0,
    destructiveRemoval: false,
    soulboundsItem: false,
  },
  {
    id: "oilOfPoison",
    name: "Oil of Poison",
    description: "Temporarily coats weapon with poison.",
    iconId: "icon.oilOfPoison",
    kind: "temporary",
    slots: ["weapon"],
    maxTier: 1,
    modifiers: [
      {
        stat: "damageDealt",
        op: "add",
        tiers: [{ tier: 1, value: 3, requiredLevel: 1 }],
      },
    ],
    recipe: {
      reagentIds: ["herbHarralander"],
      stationId: "alchemyTable",
      requiredCraftingLevel: 15,
      successChance: 0.85,
    },
    durationHits: 100,
    destructiveRemoval: false,
    soulboundsItem: false,
  },
  {
    id: "soulboundInscription",
    name: "Soulbound Inscription",
    description: "Binds item to wearer; destroys item on removal.",
    iconId: "icon.soulbound",
    kind: "permanent",
    slots: ["any"],
    maxTier: 1,
    modifiers: [
      {
        stat: "defense",
        op: "add",
        tiers: [{ tier: 1, value: 2, requiredLevel: 1 }],
      },
    ],
    recipe: {
      reagentIds: ["scrollBinding"],
      stationId: "enchantersTable",
      requiredCraftingLevel: 50,
      successChance: 0.7,
    },
    durationHits: 0,
    destructiveRemoval: true,
    soulboundsItem: true,
  },
];

describe("EnchantmentsManifestSchema", () => {
  it("parses the reference manifest cleanly", () => {
    const result = EnchantmentsManifestSchema.safeParse(reference);
    if (!result.success) {
      throw new Error(
        `Reference manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("applies defaults on minimal entry", () => {
    const parsed = EnchantmentsManifestSchema.parse([
      {
        id: "minimal",
        name: "Minimal",
        kind: "permanent",
        slots: ["any"],
        modifiers: [
          {
            stat: "defense",
            op: "add",
            tiers: [{ tier: 1, value: 1 }],
          },
        ],
      },
    ]);
    expect(parsed[0].maxTier).toBe(1);
    expect(parsed[0].recipe.reagentIds).toEqual([]);
    expect(parsed[0].recipe.successChance).toBe(1);
    expect(parsed[0].durationHits).toBe(0);
    expect(parsed[0].destructiveRemoval).toBe(false);
    expect(parsed[0].soulboundsItem).toBe(false);
    expect(parsed[0].modifiers[0].tiers[0].requiredLevel).toBe(1);
  });

  it("accepts empty manifest", () => {
    expect(EnchantmentsManifestSchema.safeParse([]).success).toBe(true);
  });

  it("rejects duplicate enchantment ids", () => {
    const bad = [
      {
        id: "dup",
        name: "A",
        kind: "permanent",
        slots: ["weapon"],
        modifiers: [
          { stat: "attack", op: "add", tiers: [{ tier: 1, value: 1 }] },
        ],
      },
      {
        id: "dup",
        name: "B",
        kind: "permanent",
        slots: ["weapon"],
        modifiers: [
          { stat: "attack", op: "add", tiers: [{ tier: 1, value: 2 }] },
        ],
      },
    ];
    expect(EnchantmentsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects empty slots array", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        kind: "permanent",
        slots: [],
        modifiers: [
          { stat: "attack", op: "add", tiers: [{ tier: 1, value: 1 }] },
        ],
      },
    ];
    expect(EnchantmentsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate slots", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        kind: "permanent",
        slots: ["weapon", "weapon"],
        modifiers: [
          { stat: "attack", op: "add", tiers: [{ tier: 1, value: 1 }] },
        ],
      },
    ];
    expect(EnchantmentsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects `any` slot mixed with specific slots", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        kind: "permanent",
        slots: ["any", "weapon"],
        modifiers: [
          { stat: "attack", op: "add", tiers: [{ tier: 1, value: 1 }] },
        ],
      },
    ];
    expect(EnchantmentsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts `any` slot alone", () => {
    const ok = [
      {
        id: "x",
        name: "X",
        kind: "permanent",
        slots: ["any"],
        modifiers: [
          { stat: "attack", op: "add", tiers: [{ tier: 1, value: 1 }] },
        ],
      },
    ];
    expect(EnchantmentsManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects empty modifiers array", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        kind: "permanent",
        slots: ["weapon"],
        modifiers: [],
      },
    ];
    expect(EnchantmentsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects modifier with empty tiers", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        kind: "permanent",
        slots: ["weapon"],
        modifiers: [{ stat: "attack", op: "add", tiers: [] }],
      },
    ];
    expect(EnchantmentsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects modifier with duplicate tier numbers", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        kind: "permanent",
        slots: ["weapon"],
        modifiers: [
          {
            stat: "attack",
            op: "add",
            tiers: [
              { tier: 1, value: 1 },
              { tier: 1, value: 2 },
            ],
          },
        ],
      },
    ];
    expect(EnchantmentsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects multiply op with zero tier value", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        kind: "permanent",
        slots: ["weapon"],
        modifiers: [
          {
            stat: "attack",
            op: "multiply",
            tiers: [{ tier: 1, value: 0 }],
          },
        ],
      },
    ];
    expect(EnchantmentsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects multiply op with negative tier value", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        kind: "permanent",
        slots: ["weapon"],
        modifiers: [
          {
            stat: "attack",
            op: "multiply",
            tiers: [{ tier: 1, value: -1 }],
          },
        ],
      },
    ];
    expect(EnchantmentsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts add op with negative tier value (debuff enchant)", () => {
    const ok = [
      {
        id: "x",
        name: "X",
        kind: "permanent",
        slots: ["weapon"],
        modifiers: [
          {
            stat: "attackSpeed",
            op: "add",
            tiers: [{ tier: 1, value: -5 }],
          },
        ],
      },
    ];
    expect(EnchantmentsManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects modifier tier exceeding enchantment maxTier", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        kind: "permanent",
        slots: ["weapon"],
        maxTier: 2,
        modifiers: [
          {
            stat: "attack",
            op: "add",
            tiers: [
              { tier: 1, value: 1 },
              { tier: 5, value: 5 },
            ],
          },
        ],
      },
    ];
    expect(EnchantmentsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects temporary with durationHits = 0", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        kind: "temporary",
        slots: ["weapon"],
        durationHits: 0,
        modifiers: [
          { stat: "attack", op: "add", tiers: [{ tier: 1, value: 1 }] },
        ],
      },
    ];
    expect(EnchantmentsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects non-temporary with durationHits > 0", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        kind: "permanent",
        slots: ["weapon"],
        durationHits: 50,
        modifiers: [
          { stat: "attack", op: "add", tiers: [{ tier: 1, value: 1 }] },
        ],
      },
    ];
    expect(EnchantmentsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown kind", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        kind: "cursed",
        slots: ["weapon"],
        modifiers: [
          { stat: "attack", op: "add", tiers: [{ tier: 1, value: 1 }] },
        ],
      },
    ];
    expect(EnchantmentsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown stat", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        kind: "permanent",
        slots: ["weapon"],
        modifiers: [
          { stat: "luck", op: "add", tiers: [{ tier: 1, value: 1 }] },
        ],
      },
    ];
    expect(EnchantmentsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown slot", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        kind: "permanent",
        slots: ["loincloth"],
        modifiers: [
          { stat: "attack", op: "add", tiers: [{ tier: 1, value: 1 }] },
        ],
      },
    ];
    expect(EnchantmentsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects tier > 10", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        kind: "permanent",
        slots: ["weapon"],
        modifiers: [
          {
            stat: "attack",
            op: "add",
            tiers: [{ tier: 15, value: 1 }],
          },
        ],
      },
    ];
    expect(EnchantmentsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects invalid id format", () => {
    const bad = [
      {
        id: "Has Spaces",
        name: "X",
        kind: "permanent",
        slots: ["weapon"],
        modifiers: [
          { stat: "attack", op: "add", tiers: [{ tier: 1, value: 1 }] },
        ],
      },
    ];
    expect(EnchantmentsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects successChance > 1", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        kind: "permanent",
        slots: ["weapon"],
        recipe: {
          reagentIds: [],
          stationId: "",
          requiredCraftingLevel: 0,
          successChance: 1.5,
        },
        modifiers: [
          { stat: "attack", op: "add", tiers: [{ tier: 1, value: 1 }] },
        ],
      },
    ];
    expect(EnchantmentsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts multi-modifier enchantment (attack + crit)", () => {
    const ok = [
      {
        id: "berserker",
        name: "Berserker",
        kind: "permanent",
        slots: ["weapon"],
        maxTier: 3,
        modifiers: [
          {
            stat: "attack",
            op: "add",
            tiers: [{ tier: 1, value: 10 }],
          },
          {
            stat: "critChance",
            op: "add",
            tiers: [{ tier: 1, value: 0.05 }],
          },
          {
            stat: "defense",
            op: "add",
            tiers: [{ tier: 1, value: -5 }],
          },
        ],
      },
    ];
    expect(EnchantmentsManifestSchema.safeParse(ok).success).toBe(true);
  });
});
