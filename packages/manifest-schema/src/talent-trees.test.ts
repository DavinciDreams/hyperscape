/**
 * Faithfulness + defensiveness tests for `TalentTreesManifestSchema`.
 */

import { describe, expect, it } from "vitest";

import {
  TalentTreesManifestSchema,
  type TalentTreesManifest,
} from "./talent-trees.js";

const reference: TalentTreesManifest = {
  enabled: true,
  trees: [
    {
      id: "warriorFury",
      name: "Fury",
      description: "Two-hand berserker tree.",
      iconId: "icon.fury",
      kind: "class",
      customKey: "",
      ownerRef: "warrior",
      totalPointsAvailable: 30,
      tierPointRequirement: 5,
      allowRespec: true,
      nodes: [
        {
          id: "crueltyRank",
          name: "Cruelty",
          description: "+5% crit chance per rank.",
          iconId: "",
          kind: "statBoost",
          tier: 0,
          maxPoints: 5,
          costPerPoint: 1,
          prerequisites: [],
          abilityRef: "",
          statusEffectRef: "",
          keystoneTags: [],
          gridX: 0,
          gridY: 0,
          exclusiveWithSiblings: false,
        },
        {
          id: "bloodthirstAbility",
          name: "Bloodthirst",
          description: "Instant attack that heals.",
          iconId: "",
          kind: "abilityGrant",
          tier: 1,
          maxPoints: 1,
          costPerPoint: 1,
          prerequisites: [{ nodeId: "crueltyRank", minPoints: 5 }],
          abilityRef: "bloodthirst",
          statusEffectRef: "",
          keystoneTags: [],
          gridX: 0,
          gridY: 1,
          exclusiveWithSiblings: false,
        },
        {
          id: "titansGrip",
          name: "Titan's Grip",
          description: "Dual-wield two-handers.",
          iconId: "",
          kind: "keystone",
          tier: 5,
          maxPoints: 1,
          costPerPoint: 1,
          prerequisites: [{ nodeId: "bloodthirstAbility", minPoints: 1 }],
          abilityRef: "",
          statusEffectRef: "",
          keystoneTags: ["build-defining", "dual-wield"],
          gridX: 2,
          gridY: 5,
          exclusiveWithSiblings: true,
        },
      ],
    },
  ],
  respec: {
    enabled: true,
    baseCostCurrency: 1000,
    costCurrencyId: "gold",
    costMultiplierPerUse: 1.5,
    freeRespecsPerWeek: 1,
    respecCooldownHours: 0,
    allowPartialRespec: true,
  },
};

describe("TalentTreesManifestSchema", () => {
  it("parses the reference manifest cleanly", () => {
    const result = TalentTreesManifestSchema.safeParse(reference);
    if (!result.success) {
      throw new Error(
        `Reference manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("rejects empty trees when enabled", () => {
    const bad = { enabled: true, trees: [] };
    expect(TalentTreesManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts empty trees when disabled", () => {
    const ok = { enabled: false, trees: [] };
    expect(TalentTreesManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects duplicate tree ids", () => {
    const bad = {
      trees: [
        {
          id: "t1",
          name: "A",
          kind: "class",
          nodes: [],
        },
        {
          id: "t1",
          name: "B",
          kind: "class",
          nodes: [],
        },
      ],
    };
    expect(TalentTreesManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate node ids within a tree", () => {
    const bad = {
      trees: [
        {
          id: "t1",
          name: "T",
          kind: "class",
          totalPointsAvailable: 10,
          tierPointRequirement: 0,
          nodes: [
            { id: "a", name: "A", kind: "statBoost", tier: 0, maxPoints: 1 },
            { id: "a", name: "B", kind: "statBoost", tier: 0, maxPoints: 1 },
          ],
        },
      ],
    };
    expect(TalentTreesManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown tree kind", () => {
    const bad = {
      trees: [
        {
          id: "t",
          name: "T",
          kind: "zodiac",
          nodes: [],
        },
      ],
    };
    expect(TalentTreesManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts all 6 tree kinds", () => {
    const kinds = ["class", "weapon", "profession", "racial", "pet", "custom"];
    for (const kind of kinds) {
      const ok = {
        enabled: false,
        trees: [
          {
            id: "t",
            name: "T",
            kind,
            nodes: [
              { id: "n", name: "N", kind: "statBoost", tier: 0, maxPoints: 1 },
            ],
            ...(kind === "custom" ? { customKey: "myCustom" } : {}),
          },
        ],
      };
      expect(TalentTreesManifestSchema.safeParse(ok).success).toBe(true);
    }
  });

  it("rejects custom tree kind without customKey", () => {
    const bad = {
      trees: [
        {
          id: "t",
          name: "T",
          kind: "custom",
          nodes: [
            { id: "n", name: "N", kind: "statBoost", tier: 0, maxPoints: 1 },
          ],
        },
      ],
    };
    expect(TalentTreesManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown node kind", () => {
    const bad = {
      trees: [
        {
          id: "t",
          name: "T",
          kind: "class",
          nodes: [
            { id: "n", name: "N", kind: "megaboost", tier: 0, maxPoints: 1 },
          ],
        },
      ],
    };
    expect(TalentTreesManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts all 6 node kinds with correct refinements", () => {
    const specs: Array<{ kind: string; extras: Record<string, unknown> }> = [
      { kind: "statBoost", extras: {} },
      { kind: "abilityGrant", extras: { abilityRef: "fireball" } },
      { kind: "abilityModifier", extras: { abilityRef: "fireball" } },
      { kind: "passive", extras: {} },
      { kind: "keystone", extras: { maxPoints: 1, keystoneTags: ["pivotal"] } },
      { kind: "aura", extras: {} },
    ];
    for (const { kind, extras } of specs) {
      const ok = {
        trees: [
          {
            id: "t",
            name: "T",
            kind: "class",
            nodes: [
              {
                id: "n",
                name: "N",
                kind,
                tier: 0,
                maxPoints: 1,
                ...extras,
              },
            ],
          },
        ],
      };
      expect(TalentTreesManifestSchema.safeParse(ok).success).toBe(true);
    }
  });

  it("rejects abilityGrant node without abilityRef", () => {
    const bad = {
      trees: [
        {
          id: "t",
          name: "T",
          kind: "class",
          nodes: [
            { id: "n", name: "N", kind: "abilityGrant", tier: 0, maxPoints: 1 },
          ],
        },
      ],
    };
    expect(TalentTreesManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects abilityModifier node without abilityRef", () => {
    const bad = {
      trees: [
        {
          id: "t",
          name: "T",
          kind: "class",
          nodes: [
            {
              id: "n",
              name: "N",
              kind: "abilityModifier",
              tier: 0,
              maxPoints: 1,
            },
          ],
        },
      ],
    };
    expect(TalentTreesManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects keystone without keystoneTags", () => {
    const bad = {
      trees: [
        {
          id: "t",
          name: "T",
          kind: "class",
          nodes: [
            {
              id: "n",
              name: "N",
              kind: "keystone",
              tier: 0,
              maxPoints: 1,
              keystoneTags: [],
            },
          ],
        },
      ],
    };
    expect(TalentTreesManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects keystone with maxPoints > 1", () => {
    const bad = {
      trees: [
        {
          id: "t",
          name: "T",
          kind: "class",
          nodes: [
            {
              id: "n",
              name: "N",
              kind: "keystone",
              tier: 0,
              maxPoints: 3,
              keystoneTags: ["pivotal"],
            },
          ],
        },
      ],
    };
    expect(TalentTreesManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects prerequisite pointing to unknown node", () => {
    const bad = {
      trees: [
        {
          id: "t",
          name: "T",
          kind: "class",
          tierPointRequirement: 0,
          totalPointsAvailable: 10,
          nodes: [
            {
              id: "n",
              name: "N",
              kind: "statBoost",
              tier: 1,
              maxPoints: 1,
              prerequisites: [{ nodeId: "ghost", minPoints: 1 }],
            },
          ],
        },
      ],
    };
    expect(TalentTreesManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects prerequisite minPoints > target maxPoints", () => {
    const bad = {
      trees: [
        {
          id: "t",
          name: "T",
          kind: "class",
          tierPointRequirement: 0,
          totalPointsAvailable: 10,
          nodes: [
            {
              id: "a",
              name: "A",
              kind: "statBoost",
              tier: 0,
              maxPoints: 3,
            },
            {
              id: "b",
              name: "B",
              kind: "statBoost",
              tier: 1,
              maxPoints: 1,
              prerequisites: [{ nodeId: "a", minPoints: 5 }],
            },
          ],
        },
      ],
    };
    expect(TalentTreesManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects prerequisite at same or higher tier", () => {
    const bad = {
      trees: [
        {
          id: "t",
          name: "T",
          kind: "class",
          tierPointRequirement: 0,
          totalPointsAvailable: 10,
          nodes: [
            {
              id: "a",
              name: "A",
              kind: "statBoost",
              tier: 2,
              maxPoints: 1,
            },
            {
              id: "b",
              name: "B",
              kind: "statBoost",
              tier: 2,
              maxPoints: 1,
              prerequisites: [{ nodeId: "a", minPoints: 1 }],
            },
          ],
        },
      ],
    };
    expect(TalentTreesManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects cyclic prerequisite graph", () => {
    // Authors could construct a cycle even while passing tier<tier, because
    // tier doesn't *always* resolve the graph (same tier would be caught by
    // tier refinement; we test a cross-tier cycle via mislabeled tiers).
    // Since tier refinement already rules this out, we construct a case
    // that passes tier refinement but still cycles — by making tier part
    // of a pseudo-DAG that the cycle check independently verifies.
    const bad = {
      trees: [
        {
          id: "t",
          name: "T",
          kind: "class",
          tierPointRequirement: 0,
          totalPointsAvailable: 10,
          nodes: [
            {
              id: "a",
              name: "A",
              kind: "statBoost",
              tier: 0,
              maxPoints: 1,
              prerequisites: [{ nodeId: "b", minPoints: 1 }],
            },
            {
              id: "b",
              name: "B",
              kind: "statBoost",
              tier: 0,
              maxPoints: 1,
              prerequisites: [{ nodeId: "a", minPoints: 1 }],
            },
          ],
        },
      ],
    };
    expect(TalentTreesManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects when max tier gate exceeds totalPointsAvailable", () => {
    const bad = {
      trees: [
        {
          id: "t",
          name: "T",
          kind: "class",
          totalPointsAvailable: 10,
          tierPointRequirement: 5,
          nodes: [
            {
              id: "a",
              name: "A",
              kind: "statBoost",
              tier: 0,
              maxPoints: 1,
            },
            {
              id: "b",
              name: "B",
              kind: "statBoost",
              tier: 5,
              maxPoints: 1,
              prerequisites: [{ nodeId: "a", minPoints: 1 }],
            },
          ],
        },
      ],
    };
    // Max tier 5 × 5 = 25 points required; only 10 available → reject.
    expect(TalentTreesManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts tier 3 × 5 = 15 points with 20 available", () => {
    const ok = {
      trees: [
        {
          id: "t",
          name: "T",
          kind: "class",
          totalPointsAvailable: 20,
          tierPointRequirement: 5,
          nodes: [
            {
              id: "a",
              name: "A",
              kind: "statBoost",
              tier: 0,
              maxPoints: 5,
            },
            {
              id: "b",
              name: "B",
              kind: "statBoost",
              tier: 3,
              maxPoints: 1,
              prerequisites: [{ nodeId: "a", minPoints: 1 }],
            },
          ],
        },
      ],
    };
    expect(TalentTreesManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("accepts tierPointRequirement=0 (no tier gating)", () => {
    const ok = {
      trees: [
        {
          id: "t",
          name: "T",
          kind: "class",
          totalPointsAvailable: 10,
          tierPointRequirement: 0,
          nodes: [
            {
              id: "a",
              name: "A",
              kind: "statBoost",
              tier: 0,
              maxPoints: 1,
            },
            {
              id: "b",
              name: "B",
              kind: "statBoost",
              tier: 20,
              maxPoints: 1,
              prerequisites: [{ nodeId: "a", minPoints: 1 }],
            },
          ],
        },
      ],
    };
    expect(TalentTreesManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects bad node id format", () => {
    const bad = {
      trees: [
        {
          id: "t",
          name: "T",
          kind: "class",
          nodes: [
            {
              id: "Has Spaces",
              name: "N",
              kind: "statBoost",
              tier: 0,
              maxPoints: 1,
            },
          ],
        },
      ],
    };
    expect(TalentTreesManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects maxPoints > 10", () => {
    const bad = {
      trees: [
        {
          id: "t",
          name: "T",
          kind: "class",
          nodes: [
            {
              id: "n",
              name: "N",
              kind: "statBoost",
              tier: 0,
              maxPoints: 999,
            },
          ],
        },
      ],
    };
    expect(TalentTreesManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects costPerPoint > 5", () => {
    const bad = {
      trees: [
        {
          id: "t",
          name: "T",
          kind: "class",
          nodes: [
            {
              id: "n",
              name: "N",
              kind: "statBoost",
              tier: 0,
              maxPoints: 1,
              costPerPoint: 10,
            },
          ],
        },
      ],
    };
    expect(TalentTreesManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects respec enabled=true with cost=0 and freeWeekly=0", () => {
    const bad = {
      trees: [
        {
          id: "t",
          name: "T",
          kind: "class",
          nodes: [
            { id: "n", name: "N", kind: "statBoost", tier: 0, maxPoints: 1 },
          ],
        },
      ],
      respec: {
        enabled: true,
        baseCostCurrency: 0,
        freeRespecsPerWeek: 0,
      },
    };
    expect(TalentTreesManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts respec enabled=true with free weekly only", () => {
    const ok = {
      trees: [
        {
          id: "t",
          name: "T",
          kind: "class",
          nodes: [
            { id: "n", name: "N", kind: "statBoost", tier: 0, maxPoints: 1 },
          ],
        },
      ],
      respec: {
        enabled: true,
        baseCostCurrency: 0,
        freeRespecsPerWeek: 1,
      },
    };
    expect(TalentTreesManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("accepts respec disabled with cost=0", () => {
    const ok = {
      trees: [
        {
          id: "t",
          name: "T",
          kind: "class",
          nodes: [
            { id: "n", name: "N", kind: "statBoost", tier: 0, maxPoints: 1 },
          ],
        },
      ],
      respec: { enabled: false, baseCostCurrency: 0, freeRespecsPerWeek: 0 },
    };
    expect(TalentTreesManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects costMultiplierPerUse < 1", () => {
    const bad = {
      trees: [
        {
          id: "t",
          name: "T",
          kind: "class",
          nodes: [
            { id: "n", name: "N", kind: "statBoost", tier: 0, maxPoints: 1 },
          ],
        },
      ],
      respec: { costMultiplierPerUse: 0.5 },
    };
    expect(TalentTreesManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects respecCooldownHours > 720", () => {
    const bad = {
      trees: [
        {
          id: "t",
          name: "T",
          kind: "class",
          nodes: [
            { id: "n", name: "N", kind: "statBoost", tier: 0, maxPoints: 1 },
          ],
        },
      ],
      respec: { respecCooldownHours: 9999 },
    };
    expect(TalentTreesManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects bad costCurrencyId", () => {
    const bad = {
      trees: [
        {
          id: "t",
          name: "T",
          kind: "class",
          nodes: [
            { id: "n", name: "N", kind: "statBoost", tier: 0, maxPoints: 1 },
          ],
        },
      ],
      respec: { costCurrencyId: "Has Spaces" },
    };
    expect(TalentTreesManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown top-level field (strict mode)", () => {
    const bad = { extra: "nope" };
    expect(TalentTreesManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown tree field (strict mode)", () => {
    const bad = {
      trees: [
        {
          id: "t",
          name: "T",
          kind: "class",
          extra: "nope",
          nodes: [],
        },
      ],
    };
    expect(TalentTreesManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown node field (strict mode)", () => {
    const bad = {
      trees: [
        {
          id: "t",
          name: "T",
          kind: "class",
          nodes: [
            {
              id: "n",
              name: "N",
              kind: "statBoost",
              tier: 0,
              maxPoints: 1,
              extra: "nope",
            },
          ],
        },
      ],
    };
    expect(TalentTreesManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown prerequisite field (strict mode)", () => {
    const bad = {
      trees: [
        {
          id: "t",
          name: "T",
          kind: "class",
          totalPointsAvailable: 10,
          tierPointRequirement: 0,
          nodes: [
            { id: "a", name: "A", kind: "statBoost", tier: 0, maxPoints: 1 },
            {
              id: "b",
              name: "B",
              kind: "statBoost",
              tier: 1,
              maxPoints: 1,
              prerequisites: [{ nodeId: "a", minPoints: 1, extra: "x" }],
            },
          ],
        },
      ],
    };
    expect(TalentTreesManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts exclusiveWithSiblings=true", () => {
    const ok = {
      trees: [
        {
          id: "t",
          name: "T",
          kind: "class",
          nodes: [
            {
              id: "n",
              name: "N",
              kind: "statBoost",
              tier: 0,
              maxPoints: 1,
              exclusiveWithSiblings: true,
            },
          ],
        },
      ],
    };
    expect(TalentTreesManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("applies defaults on minimal tree", () => {
    const parsed = TalentTreesManifestSchema.parse({
      trees: [
        {
          id: "t",
          name: "T",
          kind: "class",
          nodes: [
            { id: "n", name: "N", kind: "statBoost", tier: 0, maxPoints: 1 },
          ],
        },
      ],
    });
    expect(parsed.enabled).toBe(true);
    expect(parsed.trees[0].totalPointsAvailable).toBe(30);
    expect(parsed.trees[0].tierPointRequirement).toBe(5);
    expect(parsed.trees[0].allowRespec).toBe(true);
    expect(parsed.respec.enabled).toBe(true);
    expect(parsed.respec.baseCostCurrency).toBe(1000);
    expect(parsed.respec.costCurrencyId).toBe("gold");
    expect(parsed.respec.costMultiplierPerUse).toBe(1.5);
    expect(parsed.respec.freeRespecsPerWeek).toBe(1);
    expect(parsed.respec.allowPartialRespec).toBe(true);
  });
});
